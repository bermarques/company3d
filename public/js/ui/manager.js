// The Manager Console: repos & floors, new projects, new issues, repo connections and the GitHub org connection.
import { h, ghLink } from './dom.js';
import { openModal, closeModal } from './modal.js';
import { openIssueForm } from './panels.js';
import { hud } from './hud.js';
import { api } from '../api.js';
import { timeAgo, makeCanvas } from '../engine/canvas.js';
import { drawRepoMap } from '../world/screens.js';
import { can, roleLabel } from '../permissions.js';
import { shareBox, signOut } from './start.js';

const TABS = [
  ['floors', '📁 Repos & floors'],
  ['new', '✨ New project'],
  ['issue', '📝 New issue'],
  ['links', '🔗 Connections'],
  ['org', '🏢 Organization'],
];

const LINK_KINDS = ['depends on', 'calls the API of', 'deploys', 'shares code with', 'reads data from'];

export function openManagerConsole(app, tab = 'floors') {
  const ui = { tab };
  const modal = openModal({
    title: "Manager Console",
    icon: '👔',
    wide: true,
    className: 'manager-modal',
    body: (modal) => {
      const nav = h(
        'nav',
        { class: 'tabs' },
        TABS.filter(([key]) => key !== 'new' || can.createRepo(app)).map(([key, label]) =>
          h(
            'button',
            {
              class: `tab ${ui.tab === key ? 'active' : ''}`,
              onClick: () => {
                if (key === 'issue') {
                  openIssueForm(app, {});
                  return;
                }
                ui.tab = key;
                modal.render();
              },
            },
            label,
          ),
        ),
      );
      if (ui.tab === 'new' && !can.createRepo(app)) ui.tab = 'floors';
      const panel = { floors: floorsTab, new: newRepoTab, links: linksTab, org: app.status.hosted ? hostedOrgTab : orgTab }[ui.tab](app, modal);
      const w = app.world;
      const totalIssues = w.repos.reduce((n, r) => n + r.openIssues, 0);
      const totalPRs = w.repos.reduce((n, r) => n + r.openPRs, 0);
      return h(
        'div',
        null,
        h(
          'div',
          { class: 'stats' },
          stat('🏢', w.owner.login, app.isDemo ? 'demo company' : w.owner.type === 'User' ? 'personal account' : 'organization'),
          stat('🎫', roleLabel(app), `@${app.viewerLogin()}`),
          stat('📦', w.repos.length, 'repositories'),
          stat('🛗', w.floors.length, 'floors'),
          stat('👩‍💻', w.memberCount ?? '—', 'people'),
          stat('🐞', totalIssues, 'open issues'),
          stat('🔀', totalPRs, 'open PRs'),
        ),
        nav,
        h('div', { class: 'tab-panel' }, panel),
      );
    },
  });
}

function stat(icon, value, label) {
  return h('div', { class: 'stat' }, h('span', { class: 'stat-icon' }, icon), h('strong', null, String(value)), h('small', null, label));
}

// ------------------------------------------------------------------ floors
function floorsTab(app, modal) {
  const w = app.world;
  const editable = can.manage(app);
  const floors = [...w.floors];
  const save = async (next) => {
    await app.actions.saveFloors(next);
    modal.render();
  };
  const move = (name, delta) => {
    const i = floors.indexOf(name);
    const j = i + delta;
    if (j < 0 || j >= floors.length) return;
    [floors[i], floors[j]] = [floors[j], floors[i]];
    save(floors);
  };
  const toggle = (name, on) => save(on ? [...floors, name] : floors.filter((f) => f !== name));

  const ordered = [...floors.map((f) => w.repos.find((r) => r.name === f)).filter(Boolean), ...w.repos.filter((r) => !floors.includes(r.name))];
  const filter = h('input', { placeholder: 'Filter repositories…', class: 'filter' });
  const rows = ordered.map((r) => {
    const idx = floors.indexOf(r.name);
    const on = idx >= 0;
    return h(
      'tr',
      { 'data-name': r.name.toLowerCase(), class: on ? '' : 'off' },
      h('td', null, editable ? h('label', { class: 'switch', title: on ? 'Remove this floor' : 'Give this repo a floor' }, h('input', { type: 'checkbox', checked: on, onChange: (e) => toggle(r.name, e.target.checked) }), h('span')) : on ? '✅' : '—'),
      h('td', { class: 'floor-cell' }, on ? `${idx + 1}F` : '—'),
      h('td', null, h('strong', null, r.name), r.isArchived ? h('span', { class: 'pill muted-pill' }, 'archived') : null, r.isFork ? h('span', { class: 'pill muted-pill' }, 'fork') : null, h('div', { class: 'muted small' }, r.description || '')),
      h('td', null, r.language ? h('span', null, h('span', { class: 'dot', style: { background: r.languageColor || '#adb5bd' } }), r.language) : h('span', { class: 'muted' }, '—')),
      h('td', null, r.isPrivate ? '🔒' : '🌍'),
      h('td', { class: 'num-cell' }, `🐞 ${r.openIssues}`),
      h('td', { class: 'num-cell' }, `🔀 ${r.openPRs}`),
      h('td', { class: 'muted small' }, timeAgo(r.pushedAt)),
      h(
        'td',
        { class: 'actions-cell' },
        on && editable ? h('button', { class: 'btn small ghost', title: 'Move up', onClick: () => move(r.name, -1) }, '▲') : null,
        on && editable ? h('button', { class: 'btn small ghost', title: 'Move down', onClick: () => move(r.name, 1) }, '▼') : null,
        on
          ? h(
              'button',
              {
                class: 'btn small',
                onClick: () => {
                  closeModal({ resume: true });
                  app.rideTo(idx + 1);
                },
              },
              'Go ↑',
            )
          : null,
        ghLink(r.url, '↗', 'btn small ghost'),
      ),
    );
  });
  filter.addEventListener('input', () => {
    const q = filter.value.toLowerCase();
    for (const tr of rows) tr.style.display = tr.dataset.name.includes(q) ? '' : 'none';
  });
  const refresh = h('button', { class: 'btn ghost' }, '↻ Reload from GitHub');
  refresh.addEventListener('click', async () => {
    refresh.disabled = true;
    await app.refreshWorld(true).catch(() => {});
    modal.render();
  });
  return h(
    'div',
    null,
    editable
      ? h('p', { class: 'muted' }, 'Choose which repositories get a floor in the building, and in what order. Changes apply to the elevator immediately.')
      : readOnlyNote('The building layout'),
    h('div', { class: 'row space' }, filter, refresh),
    h('div', { class: 'table-wrap' }, h('table', { class: 'repo-table' }, h('thead', null, h('tr', null, ['Floor', '#', 'Repository', 'Language', '', 'Issues', 'PRs', 'Pushed', ''].map((t) => h('th', null, t)))), h('tbody', null, rows))),
  );
}

// ------------------------------------------------------------------ new project
function newRepoTab(app) {
  const name = h('input', { placeholder: 'my-new-project', maxlength: 100, pattern: '[A-Za-z0-9._-]+', required: true });
  const desc = h('input', { placeholder: 'What is it for? (optional)', maxlength: 350 });
  const priv = h('input', { type: 'radio', name: 'vis', value: 'private', checked: true });
  const pub = h('input', { type: 'radio', name: 'vis', value: 'public' });
  const readme = h('input', { type: 'checkbox', checked: true });
  const submit = h('button', { class: 'btn primary', type: 'submit' }, '✨ Create repository');
  const hint = h('div', { class: 'muted small' });
  name.addEventListener('input', () => {
    const clean = name.value.trim().replace(/\s+/g, '-');
    if (clean !== name.value) name.value = clean;
    hint.textContent = clean ? `Will be created as ${app.world.owner.login}/${clean}` : '';
  });
  const form = h(
    'form',
    { class: 'form narrow' },
    h('p', { class: 'muted' }, 'Start a blank repository for a new project. It gets its own floor right away — empty desks included.'),
    h('label', null, 'Repository name', name, hint),
    h('label', null, 'Description', desc),
    h('div', { class: 'field' }, h('span', null, 'Visibility'), h('div', { class: 'row' }, h('label', { class: 'check' }, priv, '🔒 Private'), h('label', { class: 'check' }, pub, '🌍 Public'))),
    h('label', { class: 'check' }, readme, 'Initialize with a README (so the repo has a main branch)'),
    h('div', { class: 'row end' }, submit),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(name.value)) {
      hud.toast('Use letters, numbers, dots, dashes or underscores', 'warn');
      return name.focus();
    }
    submit.disabled = true;
    submit.textContent = 'Creating…';
    try {
      const created = await app.actions.createRepo({ name: name.value, description: desc.value, isPrivate: priv.checked, autoInit: readme.checked });
      const floorIndex = app.world.floors.indexOf(created.name) + 1;
      form.replaceChildren(
        h('div', { class: 'success-box' }, h('h3', null, `🎉 ${created.name} is ready`), h('p', null, `It now has floor ${floorIndex}F.`), h('div', { class: 'row' }, h('button', { class: 'btn primary', onClick: () => { closeModal({ resume: true }); app.rideTo(floorIndex); } }, `Ride to ${floorIndex}F`), h('button', { class: 'btn', onClick: () => openIssueForm(app, { repo: created.name }) }, 'Write its first issue'), ghLink(created.url, 'Open on GitHub ↗'))),
      );
    } catch {
      submit.disabled = false;
      submit.textContent = '✨ Create repository';
    }
  });
  setTimeout(() => name.focus(), 50);
  return form;
}

// ------------------------------------------------------------------ connections
function linksTab(app, modal) {
  const w = app.world;
  const editable = can.manage(app);
  const names = w.repos.map((r) => r.name);
  const from = h('select', null, names.map((n) => h('option', { value: n }, n)));
  const kind = h('select', null, LINK_KINDS.map((k) => h('option', { value: k }, k)));
  const to = h('select', null, names.map((n, i) => h('option', { value: n, selected: i === 1 }, n)));
  const add = h('button', { class: 'btn primary' }, '+ Add connection');
  add.addEventListener('click', async () => {
    if (from.value === to.value) return hud.toast('A repo cannot connect to itself', 'warn');
    if (w.links.some((l) => l.from === from.value && l.to === to.value && l.kind === kind.value)) return hud.toast('That connection already exists', 'warn');
    await app.actions.saveLinks([...w.links, { from: from.value, to: to.value, kind: kind.value }]);
    modal.render();
  });
  const { canvas, ctx } = makeCanvas(1600, 760);
  drawRepoMap(ctx, 1600, 760, { world: w, title: false });
  canvas.className = 'map-canvas';
  return h(
    'div',
    null,
    editable ? h('p', { class: 'muted' }, 'Describe how your projects relate. Connections show on the map in this office and on each floor sign.') : readOnlyNote('Repo connections'),
    editable ? h('div', { class: 'row' }, from, kind, to, add) : null,
    w.links.length
      ? h(
          'ul',
          { class: 'link-list' },
          w.links.map((l, i) =>
            h(
              'li',
              null,
              h('strong', null, l.from),
              ` ${l.kind} `,
              h('strong', null, l.to),
              !editable
                ? null
                : h(
                'button',
                {
                  class: 'btn small ghost',
                  onClick: async () => {
                    await app.actions.saveLinks(w.links.filter((_, j) => j !== i));
                    modal.render();
                  },
                },
                'Remove',
              ),
            ),
          ),
        )
      : h('p', { class: 'muted' }, 'No connections yet.'),
    canvas,
  );
}

function readOnlyNote(what) {
  return h('div', { class: 'readonly-note' }, `🔒 ${what} can only be changed by organization owners. You're viewing it read-only.`);
}

// ------------------------------------------------------------------ organization (hosted)
function hostedOrgTab(app) {
  const s = app.status;
  if (app.isDemo) {
    return h('div', null, h('p', null, 'This is your private demo sandbox with a fictional company.'), h('a', { class: 'btn primary', href: api.loginUrl('/') }, 'Sign in with GitHub'));
  }
  const owners = h('div', null, h('p', { class: 'muted' }, 'Loading…'));
  api
    .owners()
    .then((list) =>
      owners.replaceChildren(
        h(
          'div',
          { class: 'owner-grid' },
          list.map((o) => h('a', { class: `owner-btn ${o.login === app.world.owner.login ? 'here' : ''}`, href: `/o/${encodeURIComponent(o.login)}` }, h('strong', null, o.login), h('small', null, o.type === 'User' ? 'your personal account' : o.description || 'organization'))),
        ),
      ),
    )
    .catch((e) => owners.replaceChildren(h('p', { class: 'error' }, e.message)));
  return h(
    'div',
    null,
    h('div', { class: 'row space' }, h('p', null, 'Signed in as ', h('strong', null, `@${app.viewerLogin()}`), ` · ${roleLabel(app)} of ${app.world.owner.login}`), h('button', { class: 'btn ghost', onClick: signOut }, 'Sign out')),
    shareBox(app.world.owner.login),
    h('h3', null, 'Your buildings'),
    owners,
    s.installUrl && can.manage(app) ? h('p', { class: 'muted small' }, 'Add another organization by ', h('a', { href: s.installUrl, target: '_blank', rel: 'noopener noreferrer' }, 'installing the Company3D GitHub App'), ' on it.') : null,
  );
}

// ------------------------------------------------------------------ organization (local gh CLI)
function orgTab(app, modal) {
  const s = app.status;
  const box = h('div', null, h('p', { class: 'muted' }, 'Loading…'));
  const render = async () => {
    const parts = [];
    if (s.gh.authed) {
      parts.push(h('p', null, `GitHub CLI ${s.gh.version} — signed in as `, h('strong', null, `@${s.gh.user.login}`), '.'));
      let owners = [];
      try {
        if (app.isDemo) {
          // the server is serving demo data; owners come from GitHub once we switch back
          owners = [];
        } else owners = await api.owners();
      } catch (e) {
        parts.push(h('p', { class: 'error' }, e.message));
      }
      if (app.isDemo) {
        const btn = h('button', { class: 'btn primary' }, 'Use my GitHub organizations');
        btn.addEventListener('click', () => app.actions.switchOwner(null));
        parts.push(h('p', null, 'You are viewing the demo company.'), btn);
      } else {
        parts.push(
          h('h3', null, 'Connected organization'),
          h(
            'div',
            { class: 'owner-grid' },
            owners.map((o) =>
              h(
                'button',
                { class: `owner-btn ${o.login === w().owner.login ? 'here' : ''}`, onClick: () => o.login !== w().owner.login && app.actions.switchOwner(o.login) },
                h('strong', null, o.login),
                h('small', null, o.type === 'User' ? 'personal account' : o.description || 'organization'),
              ),
            ),
          ),
          h('div', { class: 'row' }, h('button', { class: 'btn ghost', onClick: () => app.actions.switchToDemo() }, 'Switch to the demo company')),
        );
      }
    } else {
      parts.push(
        h('div', { class: 'note' }, h('strong', null, 'Not connected to GitHub. '), s.gh.error || ''),
        h('ol', null, h('li', null, 'Install the GitHub CLI: ', h('code', null, 'winget install --id GitHub.cli'), ' (or see cli.github.com)'), h('li', null, 'Sign in: ', h('code', null, 'gh auth login')), h('li', null, 'Come back here and press “Check again”.')),
      );
      const again = h('button', { class: 'btn primary' }, 'Check again');
      again.addEventListener('click', async () => {
        again.disabled = true;
        await app.actions.recheck();
        again.disabled = false;
        modal.render();
      });
      parts.push(again);
    }
    box.replaceChildren(...parts);
  };
  const w = () => app.world;
  render();
  return box;
}
