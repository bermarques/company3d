// In-world popups: developer details, the full Kanban board, elevator floor picker, repo info, new-issue form.
import { h, ghLink, avatarEl, labelPill } from './dom.js';
import { openModal, closeModal, confirmDialog } from './modal.js';
import { hud } from './hud.js';
import { api } from '../api.js';
import { timeAgo } from '../engine/canvas.js';
import { BOARD_COLUMNS, prBadges } from '../world/screens.js';

// ------------------------------------------------------------------ shared bits
function badge(text, bg, fg = '#fff') {
  return h('span', { class: 'pill', style: { background: bg, color: fg } }, text);
}

function itemTitleRow(item, kind) {
  const icon = kind === 'pr' ? '⇄' : kind === 'merged' ? '✔' : '●';
  return h('div', { class: 'item-title' }, h('span', { class: `num num-${kind}` }, `${icon} #${item.number}`), ' ', h('span', null, item.title));
}

function itemRow(item, kind, extra = []) {
  const meta = [];
  if (kind === 'pr') for (const [t, bg, fg] of prBadges(item)) meta.push(badge(t, bg, fg));
  else if (kind === 'issue') for (const l of item.labels || []) meta.push(labelPill(l));
  if (kind === 'merged') meta.push(h('span', { class: 'muted' }, `merged ${timeAgo(item.mergedAt)}`));
  else if (item.updatedAt) meta.push(h('span', { class: 'muted' }, `updated ${timeAgo(item.updatedAt)}`));
  return h('div', { class: 'item' }, itemTitleRow(item, kind), h('div', { class: 'item-meta' }, meta, ghLink(item.url)), extra.length ? h('div', { class: 'item-actions' }, extra) : null);
}

function devOptions(app, selected = []) {
  const devs = app.floorData ? app.floorData.devs : [];
  return devs.map((d) => h('option', { value: d.login, selected: selected.includes(d.login) }, `@${d.login}`));
}

function busy(button, fn) {
  return async (...args) => {
    if (button.disabled) return;
    button.disabled = true;
    const text = button.textContent;
    button.textContent = '…';
    try {
      await fn(...args);
    } finally {
      button.disabled = false;
      button.textContent = text;
    }
  };
}

// ------------------------------------------------------------------ developer
export function openDevPanel(app, login) {
  const modal = openModal({
    title: '',
    wide: true,
    className: 'dev-modal',
    body: (modal) => {
      const data = app.floorData;
      const dev = data && data.devs.find((d) => d.login === login);
      if (!dev) return h('p', null, `@${login} is not on this floor anymore.`);
      const issues = data.issues.filter((i) => dev.assigned.includes(i.number));
      const prs = data.prs.filter((p) => dev.openPRs.includes(p.number));
      const shipped = data.merged.filter((m) => dev.shipped.includes(m.number));
      const c = dev.current;

      const assignSelect = h('select', null, h('option', { value: '' }, 'Pick a backlog issue…'), data.board.backlog.map((i) => h('option', { value: i.number }, `#${i.number} ${i.title}`)));
      const assignBtn = h('button', { class: 'btn primary' }, 'Assign');
      assignBtn.addEventListener(
        'click',
        busy(assignBtn, async () => {
          const n = Number(assignSelect.value);
          if (!n) return hud.toast('Pick an issue first', 'warn');
          await app.actions.assign(data.repo.name, n, [login]);
          modal.render();
        }),
      );

      return h(
        'div',
        null,
        h(
          'div',
          { class: 'dev-head' },
          avatarEl(login, 72),
          h('div', null, h('h2', null, dev.name || `@${login}`), h('div', { class: 'muted' }, `@${login} · ${dev.contributions} contributions to ${data.repo.name}`), h('div', { class: 'row' }, badge(dev.status === 'working' ? '🔨 Working' : '💤 Idle', dev.status === 'working' ? '#1c7ed6' : '#868e96'), app.isDemo ? null : ghLink(`https://github.com/${login}`, 'GitHub profile ↗'))),
        ),
        h('h3', null, 'On their screen right now'),
        c ? itemRow(c, c.kind === 'issue' ? 'issue' : c.kind === 'pr' ? 'pr' : 'merged') : h('p', { class: 'muted' }, 'Nothing assigned and no open pull requests.'),
        c && c.body ? h('pre', { class: 'body-preview' }, c.body.slice(0, 1200)) : null,
        h(
          'div',
          { class: 'cols3' },
          h('section', null, h('h3', null, `Assigned issues (${issues.length})`), issues.length ? issues.map((i) => itemRow(i, 'issue')) : h('p', { class: 'muted' }, 'None')),
          h('section', null, h('h3', null, `Open pull requests (${prs.length})`), prs.length ? prs.map((p) => itemRow(p, 'pr')) : h('p', { class: 'muted' }, 'None')),
          h('section', null, h('h3', null, `Recently shipped (${shipped.length})`), shipped.length ? shipped.map((m) => itemRow(m, 'merged')) : h('p', { class: 'muted' }, 'None')),
        ),
        h(
          'div',
          { class: 'manager-box' },
          h('h3', null, '👔 Manager actions'),
          h('div', { class: 'row' }, assignSelect, assignBtn),
          h('div', { class: 'row' }, h('button', { class: 'btn', onClick: () => openIssueForm(app, { repo: data.repo.name, assignees: [login] }) }, `📝 Write a new issue for @${login}`)),
        ),
      );
    },
  });
  app.onFloorData(modal);
}

// ------------------------------------------------------------------ kanban board
export function openBoardPanel(app) {
  const modal = openModal({
    title: '',
    wide: true,
    className: 'board-modal',
    body: (modal) => {
      const data = app.floorData;
      if (!data) return h('p', null, 'No board on this floor.');
      const repo = data.repo.name;
      const columns = BOARD_COLUMNS.map((col) => {
        const items = data.board[col.key] || [];
        return h('section', { class: 'kcol' }, h('header', { style: { background: col.head } }, h('span', null, col.title), h('span', { class: 'count' }, String(items.length))), h('div', { class: 'kcards' }, items.length ? items.map((it) => boardCard(app, repo, col, it, modal)) : h('p', { class: 'muted center' }, col.sub)));
      });
      const refresh = h('button', { class: 'btn ghost' }, '↻ Refresh');
      refresh.addEventListener(
        'click',
        busy(refresh, async () => {
          await app.refreshFloor(true);
          modal.render();
        }),
      );
      return h(
        'div',
        null,
        h('div', { class: 'row space' }, h('h2', { class: 'board-title' }, `📋 ${repo} — Team Board`), h('div', { class: 'row' }, h('span', { class: 'muted' }, `updated ${timeAgo(data.fetchedAt)}`), refresh, h('button', { class: 'btn primary', onClick: () => openIssueForm(app, { repo }) }, '+ New issue'))),
        h('div', { class: 'kanban' }, columns),
      );
    },
  });
  app.onFloorData(modal);
}

function whoLine(app, col, item) {
  const at = (list) => list.map((p) => '@' + p).join(', ');
  if (col.key === 'review' || col.key === 'ready' || col.key === 'shipped') return item.author ? `by @${item.author}` : '';
  if (item.assignees && item.assignees.length) {
    const team = new Set((app.floorData ? app.floorData.devs : []).map((d) => d.login.toLowerCase()));
    const gone = item.assignees.filter((a) => !team.has(a.toLowerCase()));
    if (col.key === 'backlog' && gone.length) return `assigned to ${at(gone)} (not on the team anymore)`;
    return `assigned to ${at(item.assignees)}`;
  }
  return item.author ? `opened by @${item.author}` : 'unassigned';
}

function boardCard(app, repo, col, item, modal) {
  const isPR = col.key === 'review' || col.key === 'ready';
  const isShipped = col.key === 'shipped';
  const people = item.assignees && item.assignees.length ? item.assignees : item.author ? [item.author] : [];
  const actions = [];

  if (col.key === 'backlog' || col.key === 'inProgress') {
    const sel = h('select', { class: 'small' }, h('option', { value: '' }, col.key === 'backlog' ? 'Assign to…' : 'Reassign to…'), devOptions(app));
    sel.addEventListener('change', async () => {
      if (!sel.value) return;
      sel.disabled = true;
      try {
        await app.actions.assign(repo, item.number, [sel.value]);
        modal.render();
      } catch {
        sel.disabled = false;
      }
    });
    actions.push(sel);
    if (col.key === 'inProgress') {
      const un = h('button', { class: 'btn small ghost' }, 'Unassign');
      un.addEventListener(
        'click',
        busy(un, async () => {
          await app.actions.assign(repo, item.number, []);
          modal.render();
        }),
      );
      actions.push(un);
    }
    const close = h('button', { class: 'btn small ghost' }, 'Close');
    close.addEventListener(
      'click',
      busy(close, async () => {
        const ok = await confirmDialog({ title: `Close issue #${item.number}?`, message: item.title, confirmLabel: 'Close issue', danger: true });
        if (!ok) return;
        await app.actions.closeIssue(repo, item.number);
        modal.render();
      }),
    );
    actions.push(close);
  }
  if (col.key === 'ready') {
    const method = h('select', { class: 'small' }, h('option', { value: 'squash' }, 'Squash'), h('option', { value: 'merge' }, 'Merge commit'), h('option', { value: 'rebase' }, 'Rebase'));
    const merge = h('button', { class: 'btn small success' }, '🚀 Merge');
    merge.addEventListener(
      'click',
      busy(merge, async () => {
        const ok = await confirmDialog({ title: `Merge PR #${item.number}?`, message: `${item.title}\n\nMethod: ${method.value}. ${app.isDemo ? 'Demo data only — nothing is sent to GitHub.' : `This merges into ${item.baseRefName || 'the base branch'} on GitHub.`}`, confirmLabel: 'Merge it' });
        if (!ok) return;
        await app.actions.merge(repo, item.number, method.value);
        modal.render();
      }),
    );
    actions.push(method, merge);
  }

  const meta = [];
  if (isPR) for (const [t, bg, fg] of prBadges(item).slice(0, 3)) meta.push(badge(t, bg, fg));
  if (isPR && item.closingIssues && item.closingIssues.length) meta.push(h('span', { class: 'muted' }, `closes #${item.closingIssues.join(', #')}`));
  for (const l of (item.labels || []).slice(0, 3)) meta.push(labelPill(l));
  if (isShipped) meta.push(h('span', { class: 'muted' }, `merged ${timeAgo(item.mergedAt)}`));

  return h(
    'article',
    { class: 'kcard', style: { background: col.note } },
    h('div', { class: 'row space' }, h('strong', null, `#${item.number}`), h('div', { class: 'avatars' }, people.slice(0, 3).map((p) => avatarEl(p, 26)))),
    h('div', { class: 'kcard-title' }, item.title),
    meta.length ? h('div', { class: 'item-meta' }, meta) : null,
    h('div', { class: 'row space' }, h('span', { class: 'muted small' }, whoLine(app, col, item)), ghLink(item.url, '↗')),
    actions.length ? h('div', { class: 'item-actions' }, actions) : null,
  );
}

// ------------------------------------------------------------------ elevator
export function openElevatorPanel(app) {
  const labels = app.floorLabels();
  openModal({
    title: 'Elevator',
    icon: '🛗',
    subtitle: 'Pick a floor. Every repository has its own floor.',
    body: () =>
      h(
        'div',
        { class: 'floor-grid' },
        labels.map((label, i) => {
          const repo = i === 0 ? null : app.world.repos.find((r) => r.name === app.world.floors[i - 1]);
          const here = i === app.floorIndex;
          return h(
            'button',
            {
              class: `floor-btn ${here ? 'here' : ''}`,
              disabled: here,
              onClick: () => {
                closeModal({ resume: true });
                app.rideTo(i);
              },
            },
            h('span', { class: 'floor-num' }, label),
            h('span', { class: 'floor-name' }, i === 0 ? "Lobby & Manager's Office" : app.world.floors[i - 1]),
            h('span', { class: 'floor-stats' }, here ? 'You are here' : repo ? `🐞 ${repo.openIssues}  🔀 ${repo.openPRs}${repo.isPrivate ? '  🔒' : ''}` : '👔 Manage repos & issues'),
          );
        }),
      ),
  });
}

// ------------------------------------------------------------------ repo info
export function openRepoInfo(app) {
  const modal = openModal({
    title: app.floorData ? app.floorData.repo.name : 'Repository',
    icon: '📦',
    wide: true,
    body: () => {
      const data = app.floorData;
      const repo = data.repo;
      const deps = app.world.links.filter((l) => l.from === repo.name);
      const users = app.world.links.filter((l) => l.to === repo.name);
      return h(
        'div',
        null,
        h('p', { class: 'lead' }, repo.description || 'No description.'),
        h('div', { class: 'row' }, repo.language ? badge(`💻 ${repo.language}`, repo.languageColor || '#495057') : null, badge(repo.isPrivate ? '🔒 Private' : '🌍 Public', '#495057'), ghLink(repo.url, 'Open repository on GitHub ↗')),
        h('h3', null, 'Connections'),
        deps.length || users.length
          ? h('ul', null, deps.map((l) => h('li', null, `${repo.name} ${l.kind} ${l.to}`)), users.map((l) => h('li', null, `${l.from} ${l.kind} ${repo.name}`)))
          : h('p', { class: 'muted' }, "None yet — add them from the Manager's Office console."),
        h('h3', null, `Team on this floor (${data.devs.length})`),
        h(
          'div',
          { class: 'team-grid' },
          data.devs.map((d) => h('button', { class: 'team-chip', onClick: () => openDevPanel(app, d.login) }, avatarEl(d.login, 36), h('span', null, h('strong', null, d.name || d.login), h('small', null, d.status === 'working' ? '🔨 working' : '💤 idle')))),
        ),
        data.departedCount ? h('p', { class: 'muted' }, `${data.departedCount} past contributor${data.departedCount > 1 ? 's are' : ' is'} no longer in the organization and not shown.`) : null,
        h('div', { class: 'row end' }, h('button', { class: 'btn', onClick: () => openBoardPanel(app) }, '📋 Open the board'), h('button', { class: 'btn primary', onClick: () => openIssueForm(app, { repo: repo.name }) }, '+ New issue')),
      );
    },
  });
  app.onFloorData(modal);
}

// ------------------------------------------------------------------ new issue
export function openIssueForm(app, { repo, assignees = [] } = {}) {
  const repos = app.world.repos.filter((r) => !r.isArchived).map((r) => r.name);
  const state = { repo: repo || app.currentRepo() || app.world.floors[0] || repos[0], labels: null, team: null };

  openModal({
    title: 'New issue',
    icon: '📝',
    subtitle: 'Creates a real issue on GitHub (or in the demo company).',
    body: () => {
      const repoSel = h('select', { name: 'repo' }, repos.map((r) => h('option', { value: r, selected: r === state.repo }, r)));
      const title = h('input', { name: 'title', placeholder: 'Short, specific title', maxlength: 256, required: true });
      const body = h('textarea', { name: 'body', rows: 6, placeholder: 'What needs to happen? Markdown works.' });
      const peopleBox = h('div', { class: 'check-grid' }, h('span', { class: 'muted' }, 'Loading people…'));
      const labelBox = h('div', { class: 'check-grid' }, h('span', { class: 'muted' }, 'Loading labels…'));
      const submit = h('button', { class: 'btn primary', type: 'submit' }, 'Create issue');

      const loadExtras = async () => {
        const r = repoSel.value;
        state.repo = r;
        peopleBox.replaceChildren(h('span', { class: 'muted' }, 'Loading people…'));
        labelBox.replaceChildren(h('span', { class: 'muted' }, 'Loading labels…'));
        const [team, labels] = await Promise.all([app.teamFor(r).catch(() => []), api.labels(r).catch(() => [])]);
        if (repoSel.value !== r) return;
        peopleBox.replaceChildren(
          ...(team.length
            ? team.map((p) => h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'assignee', value: p.login, checked: assignees.includes(p.login) }), avatarEl(p.login, 22), `@${p.login}`))
            : [h('span', { class: 'muted' }, 'No team members found for this repo.')]),
        );
        labelBox.replaceChildren(
          ...(labels.length
            ? labels.map((l) => h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'label', value: l.name }), labelPill(l)))
            : [h('span', { class: 'muted' }, 'No labels in this repo.')]),
        );
      };
      repoSel.addEventListener('change', loadExtras);
      loadExtras();

      const form = h(
        'form',
        { class: 'form' },
        h('label', null, 'Repository', repoSel),
        h('label', null, 'Title', title),
        h('label', null, 'Description', body),
        h('div', { class: 'field' }, h('span', null, 'Assignees'), peopleBox),
        h('div', { class: 'field' }, h('span', null, 'Labels'), labelBox),
        h('div', { class: 'row end' }, submit),
      );
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!title.value.trim()) return title.focus();
        const chosen = [...form.querySelectorAll('input[name=assignee]:checked')].map((i) => i.value);
        const labels = [...form.querySelectorAll('input[name=label]:checked')].map((i) => i.value);
        submit.disabled = true;
        submit.textContent = 'Creating…';
        try {
          await app.actions.createIssue(repoSel.value, { title: title.value.trim(), body: body.value, assignees: chosen, labels });
          closeModal({ resume: true });
        } catch {
          submit.disabled = false;
          submit.textContent = 'Create issue';
        }
      });
      setTimeout(() => title.focus(), 50);
      return form;
    },
  });
}

// ------------------------------------------------------------------ the friendly robot
export function openRobot(app) {
  const w = app.world;
  openModal({
    title: `Welcome to ${w.owner.name || w.owner.login}!`,
    icon: '🤖',
    body: () =>
      h(
        'div',
        { class: 'tips' },
        h('p', null, `This building has ${w.floors.length} floor${w.floors.length === 1 ? '' : 's'} — one per repository — and ${w.memberCount ?? 'some'} people on the team.`),
        h(
          'ul',
          null,
          h('li', null, '🛗 Take the elevator (west wall) to visit a repo floor.'),
          h('li', null, '👩‍💻 Walk up to anyone and press E to see what they are working on — their laptop shows the real issue or PR.'),
          h('li', null, '📋 Every floor has a team board: backlog, in progress, in review, ready to merge and shipped.'),
          h('li', null, "👔 The glass room to the east is your Manager's Office: create repos, write issues, choose which repos get floors and map how they connect."),
          h('li', null, '☕ People with nothing assigned drift to the coffee corner. Give them something to do!'),
        ),
        app.isDemo ? h('p', { class: 'note' }, 'You are in the demo company. Install the GitHub CLI and run `gh auth login` to load your real organization.') : null,
      ),
  });
}
