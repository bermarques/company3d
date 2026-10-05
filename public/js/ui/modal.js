// One modal at a time. Opening a modal releases the mouse; closing it with a click re-captures it.
import { h } from './dom.js';

let current = null;
const hooks = { onOpen: () => {}, onClose: () => {} };

export function setModalHooks(h2) {
  Object.assign(hooks, h2);
}

export function isModalOpen() {
  return !!current;
}

/**
 * @param {{title: string, subtitle?: string|Node, icon?: string, body: Node|((modal: object) => Node), wide?: boolean, className?: string}} opts
 * @returns {{close: Function, render: Function, el: HTMLElement}}
 */
export function openModal({ title, subtitle, icon = '', body, wide = false, className = '' }) {
  if (current) current.close({ resume: false, silent: true });
  const root = document.getElementById('modal-root');
  const content = h('div', { class: 'modal-body' });
  const closeBtn = h('button', { class: 'modal-x', title: 'Close (Esc)', 'aria-label': 'Close' }, '✕');
  const card = h(
    'div',
    { class: `modal ${wide ? 'modal-wide' : ''} ${className}`, role: 'dialog', 'aria-modal': 'true' },
    h('header', { class: 'modal-head' }, h('div', null, h('h2', null, icon ? `${icon} ` : '', title), subtitle ? h('div', { class: 'modal-sub' }, subtitle) : null), closeBtn),
    content,
  );
  const backdrop = h('div', { class: 'modal-backdrop' }, card);
  root.replaceChildren(backdrop);

  const render = () => {
    const node = typeof body === 'function' ? body(api) : body;
    content.replaceChildren(node);
  };

  const api = {
    el: card,
    render,
    close({ resume = true, silent = false } = {}) {
      if (current !== api) return;
      current = null;
      root.replaceChildren();
      document.removeEventListener('keydown', onKey, true);
      if (!silent) hooks.onClose({ resume });
    },
  };
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      api.close({ resume: false });
    }
  };
  closeBtn.addEventListener('click', () => api.close({ resume: true }));
  backdrop.addEventListener('mousedown', (e) => {
    if (e.target === backdrop) api.close({ resume: true });
  });
  document.addEventListener('keydown', onKey, true);
  current = api;
  render();
  hooks.onOpen();
  return api;
}

export function closeModal(opts) {
  if (current) current.close(opts);
}

/** Promise-based confirm dialog stacked above any open modal. */
export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    const layer = h('div', { class: 'confirm-layer' });
    const done = (v) => {
      layer.remove();
      document.removeEventListener('keydown', onKey, true);
      resolve(v);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        done(false);
      }
    };
    layer.append(
      h(
        'div',
        { class: 'modal confirm' },
        h('h3', null, title),
        h('p', null, message),
        h('div', { class: 'row end' }, h('button', { class: 'btn ghost', onClick: () => done(false) }, 'Cancel'), h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, onClick: () => done(true) }, confirmLabel)),
      ),
    );
    document.body.append(layer);
    document.addEventListener('keydown', onKey, true);
  });
}
