// 2D canvas renderers for every in-world display: laptop screens, the Kanban board, signs and lobby boards.
import { FONT, DISPLAY_FONT, fillRound, roundRect, wrapText, fitText, drawAvatar, timeAgo, contrastText, personColor, seeded, hash } from '../engine/canvas.js';

// ------------------------------------------------------------------ fake code for the "typing" effect
const KEYWORDS = {
  go: ['func', 'return', 'if', 'err', 'nil', 'defer', 'go', 'type', 'struct'],
  ts: ['const', 'return', 'await', 'async', 'if', 'export', 'function', 'type', 'import'],
  py: ['def', 'return', 'if', 'for', 'in', 'with', 'import', 'yield', 'class'],
  kt: ['fun', 'val', 'var', 'return', 'if', 'when', 'suspend', 'class', 'object'],
  default: ['let', 'return', 'if', 'for', 'fn', 'const', 'match', 'use', 'pub'],
};
const IDENTS = ['user', 'request', 'config', 'cache', 'result', 'handler', 'items', 'ctx', 'token', 'payload', 'retry', 'limit', 'events', 'state', 'query', 'store'];
const FUNCS = ['fetchAll', 'validate', 'render', 'parse', 'merge', 'flush', 'resolve', 'schedule', 'encode', 'compute', 'loadUser', 'apply'];
const COLORS = { kw: '#ff79c6', id: '#e6e9ff', fn: '#8be9fd', str: '#f1fa8c', num: '#bd93f9', cm: '#6c7393', punct: '#c2c7e0' };

const LANG_EXT = { Go: 'go', TypeScript: 'ts', JavaScript: 'ts', Python: 'py', Kotlin: 'kt' };

export function makeCodeLines(seed, language) {
  const rand = seeded(seed);
  const kws = KEYWORDS[LANG_EXT[language]] || KEYWORDS.default;
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const lines = [];
  let indent = 0;
  for (let i = 0; i < 40; i++) {
    const tokens = [];
    const r = rand();
    if (r < 0.12) tokens.push(['cm', `// ${pick(['TODO', 'NOTE', 'FIXME', 'handle', 'cleanup'])} ${pick(IDENTS)} ${pick(IDENTS)}`]);
    else if (r < 0.4) tokens.push(['kw', pick(kws) + ' '], ['id', pick(IDENTS)], ['punct', ' = '], ['fn', pick(FUNCS)], ['punct', '('], ['id', pick(IDENTS)], ['punct', ')']);
    else if (r < 0.6) tokens.push(['kw', 'if '], ['id', pick(IDENTS)], ['punct', ' > '], ['num', String(Math.floor(rand() * 100))], ['punct', ' {']);
    else if (r < 0.75) tokens.push(['fn', pick(FUNCS)], ['punct', '('], ['str', `"${pick(IDENTS)}"`], ['punct', ', '], ['id', pick(IDENTS)], ['punct', ')']);
    else if (r < 0.85) tokens.push(['kw', 'return '], ['id', pick(IDENTS)]);
    else tokens.push(['punct', '}']);
    if (tokens[0][1] === '}') indent = Math.max(0, indent - 1);
    lines.push({ indent, tokens, len: tokens.reduce((n, t) => n + t[1].length, 0) });
    if (tokens[tokens.length - 1][1] === ' {') indent = Math.min(3, indent + 1);
  }
  return lines;
}

function drawCode(ctx, x, y, w, h, lines, progressChars, t) {
  fillRound(ctx, x, y, w, h, 10, '#171a29');
  const lineH = 20;
  const visible = Math.floor((h - 10) / lineH);
  // find which line is currently being typed
  let total = 0;
  let current = 0;
  let inLine = 0;
  for (let i = 0; i < lines.length; i++) {
    if (progressChars < total + lines[i].len) {
      current = i;
      inLine = progressChars - total;
      break;
    }
    total += lines[i].len;
    current = i;
    inLine = lines[i].len;
  }
  const start = Math.max(0, current - visible + 1);
  ctx.font = `600 15px 'Cascadia Code', Consolas, monospace`;
  ctx.textBaseline = 'middle';
  for (let i = start; i <= current; i++) {
    const ly = y + 14 + (i - start) * lineH;
    ctx.fillStyle = '#4b5170';
    ctx.textAlign = 'right';
    ctx.fillText(String(i + 1), x + 32, ly);
    ctx.textAlign = 'left';
    let cx = x + 44 + lines[i].indent * 18;
    let remaining = i === current ? inLine : Infinity;
    for (const [kind, text] of lines[i].tokens) {
      if (remaining <= 0) break;
      const s = text.slice(0, remaining);
      remaining -= text.length;
      ctx.fillStyle = COLORS[kind];
      ctx.fillText(s, cx, ly);
      cx += ctx.measureText(s).width;
      if (cx > x + w - 12) break;
    }
    if (i === current && Math.floor(t * 2) % 2 === 0) {
      ctx.fillStyle = '#f8f8f2';
      ctx.fillRect(cx + 1, ly - 8, 8, 16);
    }
  }
}

function pill(ctx, x, y, text, bg, fg, { size = 15, padX = 9, h = 24 } = {}) {
  ctx.font = `800 ${size}px ${FONT}`;
  const w = ctx.measureText(text).width + padX * 2;
  fillRound(ctx, x, y, w, h, h / 2, bg);
  ctx.fillStyle = fg;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + padX, y + h / 2 + 1);
  return w;
}

export function prBadges(pr) {
  const out = [];
  if (pr.isDraft) out.push(['Draft', '#6e7781', '#fff']);
  if (pr.ready) out.push(['✔ Ready to merge', '#1f883d', '#fff']);
  else if (pr.reviewDecision === 'APPROVED') out.push(['✔ Approved', '#1f883d', '#fff']);
  else if (pr.reviewDecision === 'CHANGES_REQUESTED') out.push(['✋ Changes requested', '#cf222e', '#fff']);
  else if (!pr.isDraft) out.push(['👀 Needs review', '#9a6700', '#fff']);
  if (pr.mergeable === 'CONFLICTING') out.push(['⚠ Conflicts', '#bc4c00', '#fff']);
  if (pr.checks === 'FAILURE' || pr.checks === 'ERROR') out.push(['✖ Checks failing', '#cf222e', '#fff']);
  else if (pr.checks === 'PENDING' || pr.checks === 'EXPECTED') out.push(['⏳ Checks running', '#6e7781', '#fff']);
  else if (pr.checks === 'SUCCESS') out.push(['✓ Checks', '#2da44e', '#fff']);
  return out;
}

// ------------------------------------------------------------------ laptop
export const LAPTOP_W = 512;
export const LAPTOP_H = 320;

export function drawLaptop(ctx, { character, repoLabel, language, t }) {
  const W = LAPTOP_W;
  const H = LAPTOP_H;
  const dev = character.dev;
  const c = dev.current;

  if (character.away) {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, personColor(dev.login));
    g.addColorStop(1, '#1f2233');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const now = new Date();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 76px ${DISPLAY_FONT}`;
    ctx.fillText(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`, W / 2, 110);
    drawAvatar(ctx, dev.login, W / 2, 200, 34, { ring: '#ffffff' });
    ctx.font = `800 24px ${FONT}`;
    ctx.fillText(`🔒 @${dev.login} · ☕ coffee break`, W / 2, 268);
    return;
  }

  ctx.fillStyle = '#1f2233';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#2c3048';
  ctx.fillRect(0, 0, W, 30);
  ['#ff5f57', '#febc2e', '#28c840'].forEach((col, i) => {
    ctx.beginPath();
    ctx.arc(16 + i * 18, 15, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
  });
  ctx.fillStyle = '#aab0d0';
  ctx.font = `700 15px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(fitText(ctx, repoLabel, 360), W / 2, 16);

  if (!c) {
    ctx.fillStyle = '#c2c7e0';
    ctx.font = `800 30px ${DISPLAY_FONT}`;
    ctx.fillText('💤 Nothing assigned', W / 2, 140);
    ctx.font = `600 19px ${FONT}`;
    ctx.fillStyle = '#8a90b0';
    ctx.fillText('Assign me something from the board!', W / 2, 185);
    drawAvatar(ctx, dev.login, W / 2, 255, 34, { ring: '#ffffff' });
    return;
  }

  // card
  const cardX = 14;
  const cardY = 42;
  const cardW = W - 28;
  const cardH = 150;
  fillRound(ctx, cardX, cardY, cardW, cardH, 14, '#ffffff');
  let chip;
  let strip;
  if (c.kind === 'issue') {
    chip = [`● ISSUE #${c.number}`, '#1f883d'];
    strip = '#2da44e';
  } else if (c.kind === 'pr') {
    chip = c.ready ? [`🚀 PR #${c.number} · READY`, '#1f883d'] : c.isDraft ? [`✎ DRAFT PR #${c.number}`, '#6e7781'] : [`⇄ PR #${c.number} · IN REVIEW`, '#8250df'];
    strip = chip[1];
  } else {
    chip = [`✔ LAST SHIPPED #${c.number}`, '#8250df'];
    strip = '#8250df';
  }
  ctx.save();
  roundRect(ctx, cardX, cardY, cardW, cardH, 14);
  ctx.clip();
  ctx.fillStyle = strip;
  ctx.fillRect(cardX, cardY, 9, cardH);
  ctx.restore();
  pill(ctx, cardX + 22, cardY + 12, chip[0], chip[1], '#fff', { size: 15 });
  ctx.fillStyle = '#6e7781';
  ctx.font = `700 15px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(timeAgo(c.kind === 'merged' ? c.mergedAt : c.updatedAt), cardX + cardW - 14, cardY + 24);

  ctx.fillStyle = '#1b1b24';
  ctx.font = `800 24px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const lines = wrapText(ctx, c.title, cardW - 44, 2);
  lines.forEach((l, i) => ctx.fillText(l, cardX + 22, cardY + 66 + i * 29));

  let px = cardX + 22;
  const py = cardY + cardH - 34;
  if (c.kind === 'issue') {
    if (c.linkedPR) px += pill(ctx, px, py, `🔗 PR #${c.linkedPR.number}${c.linkedPR.ready ? ' ready' : ''}`, '#ddf4ff', '#0969da') + 6;
    for (const l of (c.labels || []).slice(0, 3)) {
      if (px > cardX + cardW - 80) break;
      px += pill(ctx, px, py, l.name, '#' + l.color, contrastText(l.color)) + 6;
    }
    if (c.comments) pill(ctx, Math.min(px, cardX + cardW - 70), py, `💬 ${c.comments}`, '#f6f8fa', '#57606a');
  } else if (c.kind === 'pr') {
    for (const [text, bg, fg] of prBadges(c).slice(0, 3)) {
      if (px > cardX + cardW - 90) break;
      px += pill(ctx, px, py, text, bg, fg) + 6;
    }
  } else {
    pill(ctx, px, py, `+${c.additions ?? 0} −${c.deletions ?? 0}`, '#f6f8fa', '#57606a');
  }

  // code editor area
  if (c.kind === 'merged') {
    fillRound(ctx, 14, 202, W - 28, H - 214, 10, '#171a29');
    ctx.fillStyle = '#c2c7e0';
    ctx.font = `800 22px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`🎉 Merged ${timeAgo(c.mergedAt)} — between tasks`, W / 2, 258);
    return;
  }
  if (!character.codeLines || character.codeKey !== c.number) {
    character.codeKey = c.number;
    character.codeLines = makeCodeLines(hash(dev.login) ^ c.number, language);
    character.codeOffset = Math.floor(seeded(c.number)() * 300);
  }
  const cps = dev.status === 'working' ? 9 : 2;
  const totalChars = character.codeLines.reduce((n, l) => n + l.len, 0);
  const progress = (character.codeOffset + Math.floor(t * cps)) % totalChars;
  drawCode(ctx, 14, 202, W - 28, H - 214, character.codeLines, progress, t);
}

// ------------------------------------------------------------------ Kanban board
export const BOARD_COLUMNS = [
  { key: 'backlog', title: 'Backlog', sub: 'up for grabs', head: '#f59f00', note: '#fff3bf' },
  { key: 'inProgress', title: 'In Progress', sub: 'someone is on it', head: '#1c7ed6', note: '#d0ebff' },
  { key: 'review', title: 'In Review', sub: 'open pull requests', head: '#7048e8', note: '#e5dbff' },
  { key: 'ready', title: 'Ready to Merge', sub: 'approved & green', head: '#2f9e44', note: '#d3f9d8' },
  { key: 'shipped', title: 'Shipped', sub: 'recently merged', head: '#495057', note: '#f1f3f5' },
];

export function drawKanban(ctx, W, H, { data, repoName }) {
  ctx.fillStyle = '#fdfdf8';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(80,100,160,0.07)';
  ctx.lineWidth = 2;
  for (let x = 0; x < W; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y < H; y += 64) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  ctx.fillStyle = '#1b1b24';
  ctx.font = `700 66px ${DISPLAY_FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`📋 ${repoName} — Team Board`, 44, 62);
  ctx.font = `700 34px ${FONT}`;
  ctx.fillStyle = '#5c5f73';
  ctx.textAlign = 'right';
  const stamp = data.fetchedAt ? new Date(data.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  ctx.fillText(`${data.issues.length} open issues · ${data.prs.length} open PRs · updated ${stamp}  —  press E for details`, W - 44, 64);

  const pad = 40;
  const gap = 28;
  const colW = (W - pad * 2 - gap * (BOARD_COLUMNS.length - 1)) / BOARD_COLUMNS.length;
  const top = 118;
  const cardH = 156;
  const cardGap = 12;
  const maxCards = Math.max(2, Math.floor((H - top - 86 - 14) / (cardH + cardGap)));

  BOARD_COLUMNS.forEach((col, ci) => {
    const x = pad + ci * (colW + gap);
    const items = data.board[col.key] || [];
    fillRound(ctx, x, top, colW, 72, 18, col.head);
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 42px ${DISPLAY_FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(col.title, x + 24, top + 37);
    ctx.font = `800 34px ${FONT}`;
    const countText = String(items.length);
    const cw = ctx.measureText(countText).width + 30;
    fillRound(ctx, x + colW - cw - 16, top + 14, cw, 44, 22, 'rgba(255,255,255,0.3)');
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(countText, x + colW - 16 - cw / 2, top + 37);

    const shown = items.length > maxCards ? maxCards - 1 : maxCards;
    items.slice(0, shown).forEach((item, i) => {
      const y = top + 86 + i * (cardH + cardGap);
      drawCard(ctx, x + 6, y, colW - 12, cardH, item, col);
    });
    if (items.length > shown) {
      const y = top + 86 + shown * (cardH + cardGap);
      fillRound(ctx, x + 6, y, colW - 12, 70, 16, 'rgba(0,0,0,0.06)');
      ctx.fillStyle = '#5c5f73';
      ctx.font = `800 34px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`+${items.length - shown} more`, x + colW / 2, y + 36);
    }
    if (!items.length) {
      ctx.fillStyle = '#adb5bd';
      ctx.font = `700 32px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(col.key === 'ready' ? 'Nothing ready yet' : 'Empty', x + colW / 2, top + 150);
    }
  });
}

function drawCard(ctx, x, y, w, h, item, col) {
  const rot = ((hash(String(item.number)) % 100) / 100 - 0.5) * 0.025;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(rot);
  ctx.translate(-w / 2, -h / 2);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  roundRect(ctx, 5, 7, w, h, 10);
  ctx.fill();
  fillRound(ctx, 0, 0, w, h, 10, col.note, 'rgba(0,0,0,0.12)', 2);

  // label stripes
  const labels = item.labels || [];
  labels.slice(0, 4).forEach((l, i) => fillRound(ctx, 16 + i * 64, 10, 54, 10, 5, '#' + l.color));

  ctx.fillStyle = '#1b1b24';
  ctx.font = `800 40px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  let header = `#${item.number}`;
  if (col.key === 'review' || col.key === 'ready') {
    if (item.isDraft) header += '  ✎ draft';
    else if (item.mergeable === 'CONFLICTING') header += '  ⚠ conflicts';
    else if (item.checks === 'FAILURE' || item.checks === 'ERROR') header += '  ✖ checks';
    else if (item.reviewDecision === 'CHANGES_REQUESTED') header += '  ✋ changes';
    else if (item.approvals) header += `  ✔ ${item.approvals}`;
  }
  if (item.linkedPR || (item.closingIssues && item.closingIssues.length)) header += item.linkedPR ? `  🔗 PR #${item.linkedPR.number}` : `  🔗 #${item.closingIssues[0]}`;
  ctx.fillText(fitText(ctx, header, w - 150), 16, 60);

  ctx.font = `700 33px ${FONT}`;
  ctx.fillStyle = '#2b2d3a';
  wrapText(ctx, item.title, w - 32, 2).forEach((l, i) => ctx.fillText(l, 16, 102 + i * 38));

  const people = item.assignees && item.assignees.length ? item.assignees : item.author ? [item.author] : [];
  people.slice(0, 3).forEach((login, i) => drawAvatar(ctx, login, w - 42 - i * 54, 44, 27, { ring: '#ffffff', ringWidth: 4 }));
  ctx.restore();
}

// ------------------------------------------------------------------ repo floor sign
export function drawFloorSign(ctx, W, H, { floorLabel, data, links, accent, remote = 0 }) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, accent);
  g.addColorStop(1, '#2b2d3a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.arc(W - 120 + i * 10, 80 + i * 90, 160 - i * 18, 0, Math.PI * 2);
    ctx.fill();
  }
  const repo = data.repo;
  fillRound(ctx, 50, 50, 170, 170, 85, '#ffffff');
  ctx.fillStyle = '#1b1b24';
  ctx.font = `700 ${floorLabel.length > 3 ? 64 : 84}px ${DISPLAY_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(floorLabel, 135, 140);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 92px ${DISPLAY_FONT}`;
  ctx.fillText(fitText(ctx, repo.name, W - 300), 250, 115);
  ctx.font = `700 36px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  const desc = wrapText(ctx, repo.description || 'No description yet', W - 300, 2);
  desc.forEach((l, i) => ctx.fillText(l, 252, 185 + i * 44));

  const ready = data.board.ready.length;
  const stats = [
    `👩‍💻 ${data.devs.length} devs`,
    `🐞 ${data.issues.length} issues`,
    `🔀 ${data.prs.length} PRs`,
    `🚀 ${ready} ready`,
  ];
  ctx.font = `800 40px ${FONT}`;
  let x = 60;
  for (const s of stats) {
    const w = ctx.measureText(s).width + 40;
    fillRound(ctx, x, 300, w, 70, 35, 'rgba(255,255,255,0.92)');
    ctx.fillStyle = '#1b1b24';
    ctx.textBaseline = 'middle';
    ctx.fillText(s, x + 20, 337);
    x += w + 16;
  }

  ctx.font = `700 32px ${FONT}`;
  ctx.fillStyle = '#ffffff';
  const deps = links.filter((l) => l.from === repo.name).map((l) => `${l.kind} ${l.to}`);
  const users = links.filter((l) => l.to === repo.name).map((l) => l.from);
  let y = 430;
  if (repo.language) {
    ctx.fillText(`💻 ${repo.language}   ${repo.isPrivate ? '🔒 private' : '🌍 public'}`, 60, y);
    y += 50;
  }
  if (deps.length) {
    ctx.fillText(fitText(ctx, `🔗 ${deps.join(' · ')}`, W - 120), 60, y);
    y += 50;
  }
  if (users.length) {
    ctx.fillText(fitText(ctx, `⬅ used by ${users.join(', ')}`, W - 120), 60, y);
    y += 50;
  }
  ctx.font = `600 26px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  if (remote) {
    ctx.fillText(`🏠 +${remote} more teammates working remotely`, 60, y);
    y += 50;
  }
  const departed = data.departedCount ? `${data.departedCount} former contributor${data.departedCount > 1 ? 's' : ''} not shown · ` : '';
  ctx.fillText(`${departed}Press E here for repo info`, 60, H - 40);
}

// ------------------------------------------------------------------ lobby boards
export function drawDirectory(ctx, W, H, { world }) {
  ctx.fillStyle = '#23263a';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffd43b';
  ctx.font = `700 64px ${DISPLAY_FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('🏢 Building Directory', 50, 70);
  const rows = [['G', "Lobby & Manager's Office", '']];
  world.floors.forEach((name, i) => {
    const r = world.repos.find((x) => x.name === name);
    rows.push([`${i + 1}F`, name, r ? `🐞${r.openIssues}  🔀${r.openPRs}` : '']);
  });
  const lineH = 54;
  const maxRows = Math.floor((H - 160) / lineH);
  const shown = rows.length > maxRows ? rows.slice(0, maxRows - 1) : rows;
  shown.forEach(([f, name, stats], i) => {
    const y = 150 + i * lineH;
    if (i % 2 === 0) fillRound(ctx, 30, y - lineH / 2 + 3, W - 60, lineH - 6, 10, 'rgba(255,255,255,0.05)');
    ctx.fillStyle = '#ffd43b';
    ctx.font = `800 36px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(f, 50, y);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(fitText(ctx, name, W - 420), 150, y);
    ctx.fillStyle = '#aab0d0';
    ctx.font = `700 30px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(stats, W - 50, y);
  });
  if (rows.length > shown.length) {
    ctx.fillStyle = '#aab0d0';
    ctx.font = `700 30px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(`+${rows.length - shown.length} more floors — see the elevator panel`, 50, 150 + shown.length * lineH);
  }
}

export function drawOrgSign(ctx, W, H, { world }) {
  ctx.clearRect(0, 0, W, H);
  fillRound(ctx, 0, 0, W, H, 60, '#2b2d3a');
  fillRound(ctx, 14, 14, W - 28, H - 28, 50, '#ffffff');
  const cy = H / 2;
  drawAvatar(ctx, world.owner.login, 60 + 150, cy, 150, { ring: '#2b2d3a', ringWidth: 12 });
  ctx.fillStyle = '#1b1b24';
  ctx.font = `700 150px ${DISPLAY_FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(fitText(ctx, world.owner.name || world.owner.login, W - 480), 420, cy + 10);
  ctx.font = `700 52px ${FONT}`;
  ctx.fillStyle = '#5c5f73';
  const subtitle = world.owner.description || `@${world.owner.login} on GitHub`;
  ctx.fillText(fitText(ctx, subtitle, W - 480), 424, cy + 100);
}

export function drawTeamWall(ctx, W, H, { world }) {
  ctx.fillStyle = '#fff8e6';
  ctx.fillRect(0, 0, W, H);
  const members = world.members || [];
  ctx.fillStyle = '#1b1b24';
  ctx.font = `700 72px ${DISPLAY_FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`👋 Meet the team`, 50, 70);
  ctx.font = `700 40px ${FONT}`;
  ctx.fillStyle = '#5c5f73';
  ctx.textAlign = 'right';
  ctx.fillText(members.length ? `${members.length} people in @${world.owner.login}` : 'Personal account', W - 50, 74);
  const cell = 138;
  const cols = Math.floor((W - 60) / cell);
  const rows = Math.floor((H - 150) / (cell + 10));
  const max = cols * rows;
  const shown = members.length > max ? members.slice(0, max - 1) : members;
  shown.forEach((m, i) => {
    const cx = 30 + cell / 2 + (i % cols) * cell;
    const cy = 190 + Math.floor(i / cols) * (cell + 10);
    drawAvatar(ctx, m.login, cx, cy, 48, { ring: personColor(m.login), ringWidth: 6 });
    ctx.fillStyle = '#2b2d3a';
    ctx.font = `700 20px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(fitText(ctx, m.login, cell - 10), cx, cy + 70);
  });
  if (members.length > shown.length) {
    const i = shown.length;
    const cx = 30 + cell / 2 + (i % cols) * cell;
    const cy = 190 + Math.floor(i / cols) * (cell + 10);
    fillRound(ctx, cx - 48, cy - 48, 96, 96, 48, '#2b2d3a');
    ctx.fillStyle = '#fff';
    ctx.font = `800 30px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(`+${members.length - shown.length}`, cx, cy + 2);
  }
}

/** Circular node graph of floors (repos) with arrows for manager-defined links. */
export function drawRepoMap(ctx, W, H, { world, title = true }) {
  ctx.fillStyle = '#f8f9ff';
  ctx.fillRect(0, 0, W, H);
  let top = 0;
  if (title) {
    ctx.fillStyle = '#1b1b24';
    ctx.font = `700 60px ${DISPLAY_FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('🗺️ Repo Connections', 40, 60);
    top = 100;
  }
  const names = [...new Set([...world.floors, ...world.links.flatMap((l) => [l.from, l.to])])];
  if (!names.length) return;
  const cx = W / 2;
  const cy = top + (H - top) / 2;
  const rx = (W / 2) * 0.72;
  const ry = ((H - top) / 2) * 0.68;
  const pos = new Map(names.map((n, i) => {
    const a = (i / names.length) * Math.PI * 2 - Math.PI / 2;
    return [n, { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry }];
  }));
  const scale = W / 1600;
  // edges
  for (const l of world.links) {
    const a = pos.get(l.from);
    const b = pos.get(l.to);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const ex = b.x - ux * 90 * scale;
    const ey = b.y - uy * 40 * scale;
    ctx.strokeStyle = '#5c7cfa';
    ctx.lineWidth = 6 * scale;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.fillStyle = '#5c7cfa';
    ctx.beginPath();
    ctx.moveTo(ex + ux * 6, ey + uy * 6);
    ctx.lineTo(ex - ux * 26 * scale - uy * 14 * scale, ey - uy * 26 * scale + ux * 14 * scale);
    ctx.lineTo(ex - ux * 26 * scale + uy * 14 * scale, ey - uy * 26 * scale - ux * 14 * scale);
    ctx.closePath();
    ctx.fill();
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    ctx.font = `800 ${Math.round(30 * scale)}px ${FONT}`;
    const tw = ctx.measureText(l.kind).width + 24 * scale;
    fillRound(ctx, mx - tw / 2, my - 22 * scale, tw, 44 * scale, 22 * scale, '#ffffff', '#5c7cfa', 3 * scale);
    ctx.fillStyle = '#364fc7';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(l.kind, mx, my + 1);
  }
  // nodes
  for (const n of names) {
    const p = pos.get(n);
    const repo = world.repos.find((r) => r.name === n);
    ctx.font = `800 ${Math.round(40 * scale)}px ${FONT}`;
    const label = fitText(ctx, n, 340 * scale);
    const w = ctx.measureText(label).width + 80 * scale;
    const h = 80 * scale;
    fillRound(ctx, p.x - w / 2, p.y - h / 2, w, h, h / 2, '#ffffff', '#2b2d3a', 4 * scale);
    ctx.beginPath();
    ctx.arc(p.x - w / 2 + 34 * scale, p.y, 14 * scale, 0, Math.PI * 2);
    ctx.fillStyle = (repo && repo.languageColor) || '#adb5bd';
    ctx.fill();
    ctx.fillStyle = '#1b1b24';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, p.x - w / 2 + 58 * scale, p.y + 1);
  }
  if (!world.links.length) {
    ctx.fillStyle = '#868e96';
    ctx.font = `700 ${Math.round(30 * scale)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('No connections yet — add some in the Manager Console', cx, cy);
  }
}

export function drawManagerMonitor(ctx, W, H, { world, t }) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2b2d42');
  g.addColorStop(1, '#151726');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffd43b';
  ctx.font = `700 46px ${DISPLAY_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('MANAGER CONSOLE', W / 2, 60);
  ctx.fillStyle = '#c2c7e0';
  ctx.font = `700 24px ${FONT}`;
  ctx.fillText(`@${world.owner.login} · ${world.repos.length} repos · ${world.floors.length} floors`, W / 2, 112);
  const items = ['📁 Repos & floors', '✨ New project', '📝 New issue', '🔗 Connections'];
  items.forEach((label, i) => {
    const x = 40 + (i % 2) * ((W - 80) / 2 + 10);
    const y = 150 + Math.floor(i / 2) * 82;
    fillRound(ctx, x, y, (W - 100) / 2, 66, 14, 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.2)', 2);
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 26px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(label, x + 20, y + 34);
  });
  const blink = Math.floor(t * 1.5) % 2 === 0;
  ctx.fillStyle = blink ? '#69db7c' : 'rgba(105,219,124,0.4)';
  ctx.font = `800 28px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('▶ Press E to manage', W / 2, H - 40);
}

export function drawElevatorIndicator(ctx, W, H, label, dir = '') {
  ctx.fillStyle = '#14151c';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ff922b';
  ctx.shadowColor = '#ff922b';
  ctx.shadowBlur = 16;
  ctx.font = `700 ${Math.round(H * 0.62)}px ${DISPLAY_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${label} ${dir}`.trim(), W / 2, H / 2 + 4);
  ctx.shadowBlur = 0;
}

export function drawElevatorButtons(ctx, W, H, labels, current) {
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, '#aeb6c8');
  g.addColorStop(0.5, '#dfe4ee');
  g.addColorStop(1, '#aeb6c8');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#2b2d3a';
  ctx.font = `800 22px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PRESS E', W / 2, 26);
  const shown = labels.slice(0, 14);
  shown.forEach((label, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = W / 2 + (col ? 46 : -46);
    const y = 80 + row * 58;
    ctx.beginPath();
    ctx.arc(x, y, 24, 0, Math.PI * 2);
    ctx.fillStyle = label === current ? '#ffd43b' : '#f1f3f5';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#495057';
    ctx.stroke();
    ctx.fillStyle = '#2b2d3a';
    ctx.font = `800 ${label.length > 2 ? 15 : 20}px ${FONT}`;
    ctx.fillText(label, x, y + 1);
  });
}
