// Title screen: GitHub connection status, organization picker and the "enter the building" button.
import { h } from './dom.js';
import { api } from '../api.js';

const CONTROLS = [
  ['W A S D', 'walk'],
  ['Shift', 'run'],
  ['Mouse', 'look around'],
  ['E / Click', 'interact'],
  ['P', 'phone'],
  ['Esc', 'pause / close'],
];

export function controlsList() {
  return h('div', { class: 'controls' }, CONTROLS.map(([k, v]) => h('div', null, h('kbd', null, k), h('span', null, v))));
}

/**
 * Render the start screen. Resolves the user's choice through callbacks:
 *  onEnter()            — status is ready, go in
 *  onReload()           — connection changed; reload the app
 */
export function renderStart(status, { onEnter, onReload }) {
  const root = document.getElementById('start');
  root.classList.add('show');
  const card = h('div', { class: 'start-card' });
  root.replaceChildren(card);

  const title = h('div', { class: 'start-title' }, h('div', { class: 'logo' }, '🏢'), h('div', null, h('h1', null, 'Company3D'), h('p', null, 'Walk around your GitHub organization. One floor per repo, every dev at their laptop.')));

  const enterBtn = (label) => h('button', { class: 'btn big primary', onClick: onEnter }, label);

  const ownerPicker = async (container) => {
    container.replaceChildren(h('p', { class: 'muted' }, 'Loading your organizations…'));
    try {
      const owners = await api.owners();
      container.replaceChildren(
        h(
          'div',
          { class: 'owner-grid' },
          owners.map((o) =>
            h(
              'button',
              {
                class: `owner-btn ${o.login === status.owner && status.mode === 'github' ? 'here' : ''}`,
                onClick: async (e) => {
                  e.currentTarget.disabled = true;
                  try {
                    await api.connect(o.login);
                    onReload();
                  } catch (err) {
                    container.prepend(h('p', { class: 'error' }, err.message));
                  }
                },
              },
              h('strong', null, o.login),
              h('small', null, o.type === 'User' ? 'personal account' : o.description || 'organization'),
            ),
          ),
        ),
      );
    } catch (e) {
      container.replaceChildren(h('p', { class: 'error' }, e.message));
    }
  };

  const demoBtn = h(
    'button',
    {
      class: 'btn ghost',
      onClick: async () => {
        await api.useDemo();
        onReload();
      },
    },
    'Explore the demo company instead',
  );

  const parts = [title];
  const gh = status.gh;
  if (status.mode === 'github' && status.owner) {
    const picker = h('div');
    parts.push(
      h('div', { class: 'status ok' }, `✅ GitHub CLI ${gh.version} · signed in as @${gh.user.login}`),
      h('p', null, 'Connected organization: ', h('strong', null, status.owner)),
      h('div', { class: 'row' }, enterBtn(`Enter ${status.owner} →`)),
      h('details', null, h('summary', { onClick: () => picker.childElementCount || ownerPicker(picker) }, 'Switch organization'), picker, demoBtn),
    );
  } else if (status.mode === 'github') {
    const picker = h('div');
    parts.push(h('div', { class: 'status ok' }, `✅ GitHub CLI ${gh.version} · signed in as @${gh.user.login}`), h('h3', null, 'Pick the organization to visualize'), picker, demoBtn);
    ownerPicker(picker);
  } else if (gh.authed && !status.forcedDemo) {
    const picker = h('div');
    parts.push(
      h('div', { class: 'status warn' }, '🎭 Demo company selected (fictional sample data)'),
      h('div', { class: 'row' }, enterBtn('Enter the demo company →')),
      h('details', null, h('summary', { onClick: () => picker.childElementCount || ownerPicker(picker) }, `Use a real organization (signed in as @${gh.user.login})`), picker),
    );
  } else {
    const again = h('button', { class: 'btn' }, '↻ Check again');
    again.addEventListener('click', async () => {
      again.disabled = true;
      again.textContent = 'Checking…';
      await api.recheck().catch(() => {});
      onReload();
    });
    parts.push(
      h('div', { class: 'status warn' }, status.forcedDemo ? '🎭 Demo mode (started with --demo)' : `🔌 ${gh.error || 'Not connected to GitHub'}`),
      status.forcedDemo
        ? null
        : h(
            'div',
            { class: 'setup' },
            h('p', null, 'To load your real organization, connect the GitHub CLI:'),
            h('ol', null, h('li', null, 'Install it: ', h('code', null, 'winget install --id GitHub.cli'), ' (or cli.github.com)'), h('li', null, 'Sign in: ', h('code', null, 'gh auth login')), h('li', null, 'Press “Check again” (no restart needed).')),
            again,
          ),
      h('div', { class: 'row' }, enterBtn('Enter the demo company →')),
    );
  }
  parts.push(controlsList());
  card.append(...parts);
}

export function hideStart() {
  document.getElementById('start').classList.remove('show');
}
