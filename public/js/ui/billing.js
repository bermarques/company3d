// Subscription UI: the plan card (subscribe / manage / connect) and building buttons that know whether a
// building is open. Payment itself happens on Stripe's own pages.
import { h } from './dom.js';
import { api } from '../api.js';
import { confirmDialog } from './modal.js';

const dateFmt = (ms) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** Send the browser to a Stripe-hosted page (Checkout or the customer portal). */
async function goToStripe(button, request) {
  button.disabled = true;
  const label = button.textContent;
  button.textContent = 'Opening Stripe…';
  try {
    const { url } = await request();
    if (!/^https:\/\//.test(url)) throw new Error('Unexpected payment page address');
    location.assign(url);
  } catch (e) {
    button.disabled = false;
    button.textContent = label;
    button.after(h('p', { class: 'error' }, e.message));
  }
}

/**
 * Plan card for the signed-in person.
 * @param {{ compact?: boolean, onChange?: Function }} opts  compact: a one-line teaser for people who don't need it
 */
export function planCard({ compact = false, onChange = () => location.reload() } = {}) {
  const box = h('div', { class: 'plan-card' }, h('p', { class: 'muted' }, 'Loading your plan…'));
  api
    .billing()
    .then((s) => box.replaceChildren(...renderPlan(s, { compact, onChange, box }).filter(Boolean)))
    .catch((e) => box.replaceChildren(h('p', { class: 'error' }, e.message)));
  return box;
}

function renderPlan(s, { compact, onChange, box }) {
  const sub = s.subscription;
  const price = s.plan.price ? s.plan.price.label : '';
  const subscribe = (label) => {
    const b = h('button', { class: 'btn primary' }, label);
    b.addEventListener('click', () => goToStripe(b, api.billingCheckout));
    return b;
  };
  const manage = (label) => {
    const b = h('button', { class: 'btn' }, label);
    b.addEventListener('click', () => goToStripe(b, api.billingPortal));
    return b;
  };

  if (!sub || !sub.active) {
    if (compact && !sub) {
      const more = h('button', { class: 'btn small ghost' }, 'See plan');
      more.addEventListener('click', () => box.replaceChildren(...renderPlan(s, { compact: false, onChange, box }).filter(Boolean)));
      return [h('div', { class: 'row space' }, h('span', { class: 'muted small' }, `Own a GitHub organization? Give it a building: ${price}`), more)];
    }
    return [
      h('div', { class: 'plan-head' }, h('strong', null, `💳 ${s.plan.name}`), price ? h('span', { class: 'plan-price' }, price) : null),
      sub ? h('p', { class: 'error' }, `Your subscription ended (${sub.status.replace(/_/g, ' ')}).`) : null,
      h('ul', { class: 'plan-points' }, h('li', null, `${s.plan.orgLimit} organization, unlimited teammates`), h('li', null, 'Your personal building is included'), h('li', null, 'Cancel anytime')),
      h('div', { class: 'row' }, subscribe(sub ? 'Subscribe again' : 'Subscribe →'), sub && sub.canManage ? manage('Billing history') : null),
    ];
  }

  const renew = sub.renewsAt ? (sub.cancelAtPeriodEnd ? `ends on ${dateFmt(sub.renewsAt)}` : `renews on ${dateFmt(sub.renewsAt)}`) : '';
  const parts = [
    h('div', { class: 'plan-head' }, h('strong', null, `✅ ${s.plan.name}`), h('span', { class: 'muted small' }, renew)),
    sub.pastDue ? h('p', { class: 'error' }, '⚠️ Your last payment failed. The building stays open while Stripe retries, so please update your card.') : null,
  ];
  if (s.workspaces.length) {
    parts.push(
      h(
        'div',
        { class: 'plan-orgs' },
        s.workspaces.map((org) => {
          const off = h('button', { class: 'btn small ghost' }, 'Disconnect');
          off.addEventListener('click', async () => {
            const ok = await confirmDialog({
              title: `Disconnect ${org}?`,
              message: `Its building closes for everyone until it's connected again. Your subscription stays active, so you can connect another organization instead.`,
              confirmLabel: 'Disconnect',
              danger: true,
            });
            if (!ok) return;
            off.disabled = true;
            try {
              await api.disconnectWorkspace(org);
              onChange();
            } catch (e) {
              off.disabled = false;
              off.after(h('p', { class: 'error' }, e.message));
            }
          });
          return h('div', { class: 'row space' }, h('span', null, '🏢 ', h('a', { href: `/o/${encodeURIComponent(org)}` }, org), ' is connected'), off);
        }),
      ),
    );
  } else {
    parts.push(h('p', { class: 'status ok' }, '👉 Next step: connect your organization from the list of buildings.'));
  }
  parts.push(h('div', { class: 'row' }, manage(sub.pastDue ? 'Update card' : 'Manage billing')));
  return parts;
}

/**
 * A building in the picker. Open buildings are plain links (shareable); closed ones explain why and, when the
 * person has a free slot on their plan, offer to connect.
 */
export function buildingButton(o, { current, summary }) {
  const kind = o.type === 'User' ? 'your personal account' : o.description || 'organization';
  const b = o.building;
  if (!b || b.open) {
    const note = b && b.bonus ? `🎁 free with ${b.via}'s plan` : kind;
    return h('a', { class: `owner-btn ${o.login === current ? 'here' : ''}`, href: `/o/${encodeURIComponent(o.login)}` }, h('strong', null, o.login), h('small', null, note));
  }
  const sub = summary && summary.subscription;
  let action = null;
  let note = o.type === 'User' ? 'Free when one of your organizations subscribes' : 'Not on Company3D yet';
  if (b.reason === 'inactive') note = `Plan of @${b.connectedBy} isn't active`;
  if (sub && sub.active && summary.slotsLeft > 0) {
    action = h('button', { class: 'btn small primary' }, 'Connect');
    action.addEventListener('click', async () => {
      action.disabled = true;
      action.textContent = 'Connecting…';
      try {
        await api.connectWorkspace(o.login);
        location.assign(`/o/${encodeURIComponent(o.login)}`);
      } catch (e) {
        action.disabled = false;
        action.textContent = 'Connect';
        action.after(h('small', { class: 'error' }, e.message));
      }
    });
  } else if (sub && sub.active) {
    note = 'Your plan already has its organization';
  }
  return h('div', { class: 'owner-btn closed' }, h('strong', null, o.login), h('small', null, `🔒 ${note}`), action);
}

/** After returning from Stripe Checkout: confirm the payment and say what happens next. */
export async function billingReturnNotice() {
  const qs = new URLSearchParams(location.search);
  const result = qs.get('billing');
  if (!result) return null;
  history.replaceState(null, '', location.pathname); // keep the address bar clean and shareable
  if (result === 'cancelled') return { kind: 'warn', text: 'Checkout cancelled. You were not charged.' };
  if (result === 'success' && qs.get('session_id')) {
    try {
      const s = await api.billingConfirm(qs.get('session_id'));
      if (s.subscription && s.subscription.active) return { kind: 'ok', text: '🎉 Your subscription is active! Now connect your organization below.' };
      return { kind: 'warn', text: 'Payment received, finishing setup… refresh in a moment if your plan still looks inactive.' };
    } catch (e) {
      return { kind: 'warn', text: `We couldn't confirm the payment yet (${e.message}). Refresh in a moment.` };
    }
  }
  return null;
}
