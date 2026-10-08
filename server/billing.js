import { verifyWebhook } from "./stripe.js";

export const PLAN = { id: "basic", name: "Company3D Basic", orgLimit: 1 };

const OPEN_STATUSES = new Set(["active", "trialing", "past_due"]);
const SESSION_RE = /^cs_[A-Za-z0-9_]{10,200}$/;

const lower = (s) => String(s).toLowerCase();

function httpError(status, message, extra = {}) {
  const e = new Error(message);
  e.status = status;
  Object.assign(e, extra);
  return e;
}

function periodEnd(sub) {
  const end =
    sub.current_period_end ??
    (sub.items &&
      sub.items.data &&
      sub.items.data[0] &&
      sub.items.data[0].current_period_end);
  return end ? end * 1000 : null;
}

/**
 * @param {object} o
 * @param {ReturnType<import('./store.js').createStore>} o.store
 * @param {ReturnType<import('./stripe.js').createStripe>} o.stripe
 * @param {string} o.priceId
 * @param {string} o.webhookSecret
 * @param {string} o.publicUrl
 * @param {string[]} [o.complimentary]
 */
export function createBilling({
  store,
  stripe,
  priceId,
  webhookSecret,
  publicUrl,
  complimentary = [],
}) {
  const free = new Set(complimentary.map(lower));
  let price = null;

  const account = (userId) => store.read().accounts[String(userId)] || null;
  const isOpen = (acc) => !!acc && OPEN_STATUSES.has(acc.status);
  const workspacesOf = (userId) =>
    Object.values(store.read().workspaces).filter(
      (w) => w.ownerId === String(userId),
    );

  async function priceInfo() {
    if (!price || Date.now() - price.at > 3600_000) {
      const p = await stripe.get(`prices/${priceId}`);
      const currency = String(p.currency || "brl").toUpperCase();
      const amount = new Intl.NumberFormat(
        currency === "BRL" ? "pt-BR" : "en-US",
        { style: "currency", currency },
      ).format((p.unit_amount || 0) / 100);
      const interval = p.recurring ? p.recurring.interval : null;
      price = {
        at: Date.now(),
        amount,
        interval,
        label: interval ? `${amount} / ${interval}` : amount,
      };
    }
    return price;
  }

  async function applySubscription(sub, hint = {}) {
    const data = store.read();
    const customerId =
      typeof sub.customer === "string"
        ? sub.customer
        : sub.customer && sub.customer.id;
    let userId = hint.userId || (sub.metadata && sub.metadata.github_user_id);
    if (!userId && customerId) {
      const owner = Object.values(data.accounts).find(
        (a) => a.customerId === customerId,
      );
      userId = owner && owner.userId;
    }
    if (!userId) return;
    userId = String(userId);
    await store.update((d) => {
      const acc = d.accounts[userId] || {
        userId,
        createdAt: new Date().toISOString(),
      };
      if (
        acc.subscriptionId &&
        acc.subscriptionId !== sub.id &&
        OPEN_STATUSES.has(acc.status) &&
        !OPEN_STATUSES.has(sub.status)
      )
        return;
      Object.assign(acc, {
        login:
          hint.login ||
          acc.login ||
          (sub.metadata && sub.metadata.github_login) ||
          null,
        customerId: customerId || hint.customerId || acc.customerId || null,
        subscriptionId: sub.id,
        status: sub.status,
        renewsAt: periodEnd(sub),
        cancelAtPeriodEnd: !!sub.cancel_at_period_end,
        updatedAt: new Date().toISOString(),
      });
      d.accounts[userId] = acc;
    });
  }

  return {
    enabled: true,

    workspace(org) {
      const ws = store.read().workspaces[lower(org)];
      return ws
        ? { org: ws.org, ownerId: ws.ownerId, ownerLogin: ws.ownerLogin }
        : null;
    },

    /**
     * Is this owner's building open? Used on every request into a building.
     * @param {string} owner
     * @param {{ memberOf?: string[] }} [personal]  for someone's own personal account: the orgs they belong to.
     *   Bonus: a personal building is free while any of those orgs has an open plan.
     */
    entitlement(owner, personal) {
      if (free.has(lower(owner))) return { ok: true, complimentary: true };
      const ws = store.read().workspaces[lower(owner)];
      const acc = ws ? account(ws.ownerId) : null;
      if (ws && isOpen(acc))
        return {
          ok: true,
          pastDue: acc.status === "past_due",
          ownerLogin: ws.ownerLogin,
        };
      if (personal && personal.memberOf) {
        const via = personal.memberOf.find(
          (org) => lower(org) !== lower(owner) && this.entitlement(org).ok,
        );
        if (via) return { ok: true, bonus: true, via };
      }
      if (!ws) return { ok: false, reason: "none" };
      return { ok: false, reason: "inactive", ownerLogin: ws.ownerLogin };
    },
    async summary(user) {
      const acc = account(user.id);
      const mine = workspacesOf(user.id);
      return {
        enabled: true,
        plan: { ...PLAN, price: await priceInfo().catch(() => null) },
        subscription: acc
          ? {
              status: acc.status,
              active: isOpen(acc),
              pastDue: acc.status === "past_due",
              renewsAt: acc.renewsAt,
              cancelAtPeriodEnd: !!acc.cancelAtPeriodEnd,
              canManage: !!acc.customerId,
            }
          : null,
        workspaces: mine.map((w) => w.org),
        slotsLeft: Math.max(0, PLAN.orgLimit - mine.length),
      };
    },

    async checkout(user) {
      const acc = account(user.id);
      if (isOpen(acc))
        throw httpError(409, "You already have an active subscription");
      const meta = {
        github_user_id: String(user.id),
        github_login: user.login,
      };
      const session = await stripe.post("checkout/sessions", {
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        client_reference_id: String(user.id),
        customer: acc && acc.customerId ? acc.customerId : undefined,
        success_url: `${publicUrl}/?billing=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${publicUrl}/?billing=cancelled`,
        allow_promotion_codes: true,
        metadata: meta,
        subscription_data: { metadata: meta },
      });
      return { url: session.url };
    },

    async confirm(user, sessionId) {
      if (!SESSION_RE.test(String(sessionId)))
        throw httpError(400, "Invalid checkout session");
      const s = await stripe.get(`checkout/sessions/${sessionId}`, {
        expand: ["subscription"],
      });
      if (s.client_reference_id !== String(user.id))
        throw httpError(403, "This checkout belongs to someone else");
      if (s.subscription) {
        const sub =
          typeof s.subscription === "object"
            ? s.subscription
            : await stripe.get(`subscriptions/${s.subscription}`);
        await applySubscription(sub, {
          userId: user.id,
          login: user.login,
          customerId: s.customer,
        });
      }
      return this.summary(user);
    },

    async portal(user) {
      const acc = account(user.id);
      if (!acc || !acc.customerId)
        throw httpError(409, "You don't have a subscription yet");
      const s = await stripe.post("billing_portal/sessions", {
        customer: acc.customerId,
        return_url: `${publicUrl}/`,
      });
      return { url: s.url };
    },

    /**
     * Connect an organization to this person's subscription.
     * @param {{ access: (owner: string) => Promise<{role: string}> }} provider  acting as the signed-in person
     */
    async connect(user, org, provider) {
      const acc = account(user.id);
      if (!isOpen(acc))
        throw httpError(
          402,
          "Subscribe first, then connect your organization",
          { needsSubscription: true },
        );
      const key = lower(org);
      const existing = store.read().workspaces[key];
      if (existing && existing.ownerId === String(user.id))
        return { org: existing.org };
      if (existing && isOpen(account(existing.ownerId)))
        throw httpError(
          409,
          `${org} is already connected by @${existing.ownerLogin}`,
        );
      const mine = workspacesOf(user.id);
      if (mine.length >= PLAN.orgLimit) {
        throw httpError(
          409,
          `Your plan includes ${PLAN.orgLimit} organization. Disconnect ${mine[0].org} first to connect ${org}.`,
        );
      }
      const access = await provider.access(org);
      if (access.role !== "admin" && access.role !== "owner")
        throw httpError(403, `Only owners of ${org} can connect it`);
      await store.update((d) => {
        d.workspaces[key] = {
          org,
          ownerId: String(user.id),
          ownerLogin: user.login,
          createdAt: new Date().toISOString(),
        };
      });
      return { org };
    },

    async disconnect(user, org) {
      const ws = store.read().workspaces[lower(org)];
      if (!ws || ws.ownerId !== String(user.id))
        throw httpError(403, `${org} isn't connected to your subscription`);
      await store.update((d) => {
        delete d.workspaces[lower(org)];
      });
      return { ok: true };
    },

    async webhook(rawBody, signature) {
      const event = verifyWebhook(rawBody, signature, webhookSecret);
      if (store.read().events.includes(event.id)) return { duplicate: true };
      const obj = event.data && event.data.object;
      switch (event.type) {
        case "checkout.session.completed":
          if (obj.mode === "subscription" && obj.subscription) {
            const sub = await stripe.get(`subscriptions/${obj.subscription}`);
            await applySubscription(sub, {
              userId: obj.client_reference_id,
              login: obj.metadata && obj.metadata.github_login,
              customerId: obj.customer,
            });
          }
          break;
        case "customer.subscription.created":
        case "customer.subscription.updated":
        case "customer.subscription.deleted":
        case "customer.subscription.paused":
        case "customer.subscription.resumed":
          await applySubscription(await stripe.get(`subscriptions/${obj.id}`));
          break;
        default:
          break;
      }
      await store.update((d) => {
        d.events.push(event.id);
      });
      return { received: true };
    },
  };
}
