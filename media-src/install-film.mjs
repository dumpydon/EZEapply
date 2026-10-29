/** Original, illustrated macOS/Chrome installation film. No captured user data.
 * SVG is the editable master; sharp renders at 1920 × 1440, ffmpeg encodes it.
 * Run: node media-src/install-film.mjs [--stills] */
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'docs/media');
const frames = join(root, '.local/install-film-frames');
const W = 1920,
  H = 1440,
  FPS = 30,
  DURATION = 15,
  SCENE = 2.5;
const teal = '#54d4b0',
  ink = '#192229',
  muted = '#768893';
const icon = `data:image/svg+xml;base64,${Buffer.from(await readFile(join(root, 'src/assets/local-icon.svg'))).toString('base64')}`;
const font = '-apple-system, BlinkMacSystemFont, SF Pro Display, Helvetica Neue, Arial, sans-serif';
const steps = [
  [
    'Download',
    'Download the extension ZIP.',
    'Open the latest GitHub release and choose EZEapply.zip.',
  ],
  [
    'Unzip',
    'Find it. Unzip it. Keep the folder.',
    'In Downloads, double-click EZEapply.zip to extract EZEapply.',
  ],
  [
    'Developer mode',
    'Open Chrome’s extension manager.',
    'Go to chrome://extensions and switch Developer mode on.',
  ],
  [
    'Load unpacked',
    'Choose Load unpacked.',
    'Chrome opens a folder picker. Select the extracted EZEapply folder.',
  ],
  [
    'Select folder',
    'Select the folder with manifest.json.',
    'Choose the EZEapply folder itself, then click Select.',
  ],
  [
    'Ready',
    'You’re ready. Open EZEapply.',
    'Pin it in Chrome’s Extensions menu. Open your profile and start applying.',
  ],
];
const clamp = (n) => Math.max(0, Math.min(1, n));
const ease = (n) => {
  n = clamp(n);
  return n * n * (3 - 2 * n);
};
const xml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
const rect = (x, y, w, h, fill, r = 0, extra = '') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${extra}/>`;
const text = (x, y, label, size = 24, color = ink, weight = 400, extra = '') =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight}" ${extra}>${xml(label)}</text>`;
const line = (x1, y1, x2, y2, color = '#dce1e6', width = 1.5) =>
  `<path d="M${x1} ${y1}H${x2}" transform="translate(0 ${y2 - y1})" stroke="${color}" stroke-width="${width}"/>`;
const image = (x, y, size) =>
  `<image href="${icon}" x="${x}" y="${y}" width="${size}" height="${size}"/>`;
function pill(x, y, w, label, fill = '#edf3f7', color = '#334852', h = 48) {
  return (
    rect(x, y, w, h, fill, 12) +
    text(x + w / 2, y + h / 2 + 8, label, 22, color, 600, 'text-anchor="middle"')
  );
}
function traffic(x, y) {
  return ['#ff615a', '#ffbd2e', '#28c840']
    .map((c, i) => `<circle cx="${x + i * 25}" cy="${y}" r="8" fill="${c}"/>`)
    .join('');
}
function puzzle(x, y, size = 30) {
  return `<g transform="translate(${x} ${y}) scale(${size / 24})" fill="none" stroke="#718391" stroke-width="1.8" stroke-linejoin="round"><path d="M4 4h5V2a3 3 0 0 1 6 0v2h5v5h2a3 3 0 0 1 0 6h-2v5h-5v-2a3 3 0 0 0-6 0v2H4v-5H2a3 3 0 0 0 0-6h2Z"/></g>`;
}
function folder(x, y, size = 70) {
  return `<g transform="translate(${x} ${y}) scale(${size / 80})"><path d="M2 16a8 8 0 0 1 8-8h23l9 10h28a8 8 0 0 1 8 8v43a8 8 0 0 1-8 8H10a8 8 0 0 1-8-8Z" fill="#69bde9"/><path d="M2 27h76v42a8 8 0 0 1-8 8H10a8 8 0 0 1-8-8Z" fill="#91d2f2"/><path d="M5 28h70" stroke="#b9ebff" stroke-width="2"/></g>`;
}
function file(x, y, label = 'ZIP', size = 65) {
  return `<g transform="translate(${x} ${y}) scale(${size / 65})"><path d="M10 0h30l15 16v55H10Z" fill="#f7fafc" stroke="#bbc8d4" stroke-width="2"/><path d="M40 0v17h15" fill="#e3ebf3" stroke="#bbc8d4" stroke-width="2"/>${text(32, 49, label, 13, '#587384', 650, 'text-anchor="middle"')}</g>`;
}
function cursor(x, y, click = 0) {
  return `<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)})">${click > 0 ? `<circle r="${12 + click * 32}" fill="none" stroke="${teal}" stroke-width="3" opacity="${1 - click}"/>` : ''}<path d="M0 0v31l9-8 7 16 7-3-7-16 12-1Z" fill="#141c21" stroke="#fff" stroke-width="2.8" stroke-linejoin="round" filter="url(#cursor-shadow)"/></g>`;
}
function highlight(x, y, w, h, p, round = 12) {
  return rect(
    x - 6,
    y - 6,
    w + 12,
    h + 12,
    'none',
    round,
    `stroke="${teal}" stroke-width="3" opacity="${0.45 + 0.4 * Math.sin(p * Math.PI)}"`,
  );
}
function macMenu(app = 'Chrome') {
  return (
    rect(80, 172, 1760, 36, '#d5eee6') +
    '<g transform="translate(101 180)" fill="#263f39"><path d="M11 5c-6-5-12 1-10 8 1 6 5 12 9 9 3-2 4 3 8-1 2-2 4-6 4-8-5-2-5-6-1-9-3-3-6-3-10 1Z"/><path d="M11 3c0-4 3-7 7-7 0 4-3 7-7 7Z"/></g>' +
    text(145, 198, app, 19, '#203b38', 650) +
    [
      ['File', 255],
      ['Edit', 314],
      ['View', 374],
      ['History', 445],
      ['Bookmarks', 536],
      ['Window', 666],
      ['Help', 764],
    ]
      .map(([label, x]) => text(x, 198, label, 18, '#36534c'))
      .join('') +
    text(1807, 198, 'Thu 9:41 AM', 18, '#36534c', 500, 'text-anchor="end"')
  );
}
function wallpaper(app = 'Chrome') {
  return (
    rect(80, 208, 1760, 934, 'url(#wallpaper)') +
    `<g opacity=".55"><path d="M80 1130C280 540 670 320 1010 208H1350C830 510 690 920 680 1142Z" fill="#88ccca"/><path d="M1250 208C790 580 825 990 970 1142H1290C1050 690 1320 380 1640 208Z" fill="#478ab5"/><path d="M80 380C440 300 760 230 1040 208H80Z" fill="#d9e2af"/></g>` +
    macMenu(app)
  );
}
function chrome(url, body, options = {}) {
  return `<g filter="url(#window-shadow)">${rect(142, 254, 1636, 814, '#fff', 20)}<g clip-path="url(#chrome-clip)">${rect(142, 254, 1636, 77, '#e6e9ed')}${traffic(173, 290)}${rect(262, 270, 425, 61, '#fff', 13)}${options.installed ? image(283, 284, 25) : puzzle(283, 284, 23)}${text(323, 305, options.title || 'EZEapply', 23, '#39454e', 550)}${text(650, 305, '×', 23, '#7d8790')}${text(708, 306, '+', 29, '#63717b')}${rect(142, 331, 1636, 66, '#f5f7f9')}${text(168, 373, '‹', 39, '#53616d')}${text(212, 373, '›', 39, '#aeb7bf')}${text(259, 371, '↻', 27, '#52626d')}${rect(306, 343, 1308, 43, '#e9edf1', 22)}${text(328, 372, '⌕', 24, '#647985')}${text(365, 372, url, 23, '#4c5e6b')}${options.installed ? image(1642, 350, 30) : puzzle(1642, 350, 27)}${text(1701, 375, '⋮', 31, '#52626d')}${rect(142, 397, 1636, 671, '#fff')}${body}</g></g>`;
}
function github(p) {
  const downloaded = p > 0.64;
  let body =
    rect(142, 397, 1636, 671, '#101820') +
    text(194, 456, 'GitHub', 32, '#edf6fc', 700) +
    text(340, 455, 'dumpydon / EZEapply', 25, '#b5c9dc', 500) +
    line(142, 490, 1778, 490, '#283741') +
    text(204, 548, 'Releases', 26, '#b5c9dc', 550) +
    text(204, 623, 'EZEapply', 52, '#f3f8fb', 650) +
    pill(465, 590, 113, 'Latest', '#153d32', '#6ee0b5', 43) +
    text(204, 681, 'Your answers. Your AI. Your next opportunity.', 26, '#a0b3c2') +
    rect(204, 735, 1508, 229, '#15232b', 15, 'stroke="#30424d"') +
    text(234, 780, 'Assets', 25, '#e4eff4', 600) +
    line(230, 803, 1683, 803, '#30424d') +
    file(243, 831, 'ZIP', 40) +
    text(305, 862, 'EZEapply.zip', 29, '#6adeb5', 650) +
    text(305, 901, 'Ready to load in Chrome', 22, '#9cafba') +
    text(1663, 863, 'Download ↓', 23, '#a8c6bd', 500, 'text-anchor="end"');
  if (p > 0.23 && !downloaded) body += highlight(230, 820, 1454, 108, p);
  if (downloaded)
    body += `<g filter="url(#panel-shadow)">${rect(1161, 394, 564, 194, '#fff', 16, 'stroke="#dde4e8"')}${text(1190, 435, 'Recent downloads', 23, '#1e2b34', 600)}${file(1195, 466, 'ZIP', 42)}${text(1257, 491, 'EZEapply.zip', 25, '#20313a', 600)}${text(1257, 527, 'Done · Show in Finder', 21, '#458b75')}${text(1688, 435, '×', 24, '#6a7c88')}${highlight(1246, 505, 257, 30, p, 5)}</g>`;
  const t = ease((p - 0.05) / 0.5);
  body += cursor(1070 + 390 * t, 691 + 170 * t, Math.max(0, (p - 0.55) * 7) % 1);
  return (
    wallpaper() +
    chrome('github.com/dumpydon/EZEapply/releases/latest', body, { title: 'EZEapply · Releases' })
  );
}
function finder(p, picker = false) {
  const x = picker ? 378 : 340,
    y = picker ? 362 : 318,
    w = picker ? 1162 : 1240,
    h = picker ? 612 : 650;
  const selected = p > 0.26;
  let body = `<g filter="url(#window-shadow)">${rect(x, y, w, h, '#fbfcfe', 18)}<g clip-path="url(#finder-${picker ? 'picker' : 'plain'})">${rect(x, y, 256, h, '#e7edf1')}${rect(x + 256, y, w - 256, 84, '#f5f7f8')}${traffic(x + 26, y + 29)}${text(x + 30, y + 98, 'Favorites', 19, '#82919c', 600)}${text(x + 33, y + 149, '◉  AirDrop', 22, '#5b6a75')}${text(x + 33, y + 203, '▧  Recents', 22, '#5b6a75')}${text(x + 33, y + 257, '⌂  Applications', 22, '#5b6a75')}${rect(x + 14, y + 278, 227, 48, '#cbdbe7', 8)}${text(x + 33, y + 310, '↓  Downloads', 23, '#2c5877', 550)}${text(x + 33, y + 369, '▤  Documents', 22, '#5b6a75')}${text(x + 33, y + 425, '▣  Desktop', 22, '#5b6a75')}${text(x + 287, y + 52, '‹  ›', 36, '#77838d')}${text(x + 410, y + 51, picker ? 'Select extension directory' : 'Downloads', 27, ink, 650)}${text(x + w - 65, y + 51, '⌕', 30, '#718591')}${text(x + 280, y + 118, 'Name', 20, '#7b8994', 550)}${text(x + w - 190, y + 118, 'Kind', 20, '#7b8994', 550)}${line(x + 270, y + 136, x + w - 15, y + 136, '#e0e7ec')}`;
  if (!picker) {
    body +=
      rect(x + 272, y + 150, w - 290, 73, selected ? '#e5eff6' : '#dcebf9', 7) +
      file(x + 289, y + 157, 'ZIP', 40) +
      text(x + 350, y + 193, 'EZEapply.zip', 25, ink, 550) +
      text(x + w - 197, y + 193, 'ZIP archive', 20, '#7f8f99');
    if (p > 0.48)
      body += `<g opacity="${ease((p - 0.48) / 0.14)}">${rect(x + 272, y + 233, w - 290, 73, '#d5e9fb', 7)}${folder(x + 287, y + 244, 45)}${text(x + 350, y + 277, 'EZEapply', 25, '#194b73', 600)}${text(x + w - 197, y + 277, 'Folder', 20, '#6485a1')}</g>`;
    if (p > 0.48) body += highlight(x + 272, y + 233, w - 290, 73, p, 10);
    body += text(x + 290, y + h - 34, 'Downloads → EZEapply', 19, '#718590');
  } else {
    body +=
      rect(x + 272, y + 150, w - 290, 68, '#d5e9fb', 7) +
      folder(x + 288, y + 162, 42) +
      text(x + 347, y + 192, 'EZEapply', 25, '#194b73', 600) +
      text(x + w - 198, y + 191, 'Folder', 20, '#6485a1');
    const files = [
      ['manifest.json', 'JSON document'],
      ['custom', 'Folder'],
      ['options.html', 'HTML document'],
    ];
    files.forEach(([name, kind], i) => {
      const yy = y + 254 + i * 58;
      body +=
        (kind === 'Folder'
          ? folder(x + 310, yy - 24, 28)
          : file(x + 310, yy - 24, i === 0 ? '{}' : '<>', 27)) +
        text(x + 362, yy + 4, name, 23, i === 0 ? '#307c68' : '#687f8c', i === 0 ? 650 : 400) +
        text(x + w - 235, yy + 4, kind, 19, '#8a9ba5');
    });
    body +=
      rect(x + 256, y + h - 84, w - 256, 84, '#f0f3f5') +
      pill(x + w - 293, y + h - 65, 121, 'Cancel', '#fff', '#556a77') +
      pill(x + w - 153, y + h - 65, 122, 'Select', '#087bf1', '#fff');
    if (p > 0.12) body += highlight(x + 272, y + 150, w - 290, 68, p, 10);
    if (p > 0.6) body += highlight(x + w - 153, y + h - 65, 122, 48, p, 12);
  }
  body += '</g></g>';
  const t = ease((p - 0.18) / 0.6);
  body += picker
    ? cursor(x + 726 + 330 * t, y + 187 + 370 * t, p > 0.77 ? clamp((p - 0.77) * 6) : 0)
    : cursor(
        x + 520 - 125 * t,
        y + 185 + (p > 0.48 ? 85 : 0),
        p > 0.25 && p < 0.48 ? ((p - 0.25) * 9) % 1 : 0,
      );
  return body;
}
function extensions(p, stage) {
  const on = stage >= 3 || p > 0.49;
  let body =
    rect(142, 397, 1636, 671, '#fff') +
    text(185, 457, '☰', 30, '#596771') +
    puzzle(247, 427, 36) +
    text(302, 457, 'Extensions', 34, ink, 550) +
    rect(634, 416, 610, 56, '#edf3fb', 10) +
    text(662, 453, '⌕  Search extensions', 23, '#8798a8') +
    text(1482, 454, 'Developer mode', 23, '#5d6d79');
  body +=
    rect(1676, 432, 62, 32, on ? '#1a73e8' : '#b0bac5', 17) +
    `<circle cx="${on ? 1720 : 1693}" cy="448" r="12" fill="#fff"/>`;
  if (on)
    body +=
      pill(184, 513, 215, 'Load unpacked', '#e9f0ff', '#3569a1') +
      pill(420, 513, 216, 'Pack extension', '#fff', '#577389') +
      pill(657, 513, 143, 'Update', '#fff', '#577389') +
      line(142, 590, 1778, 590, '#e2e8ed');
  body += text(188, 652, 'Your extensions', 25, '#4d6170', 600);
  if (stage === 5) body += extensionCard();
  else
    body +=
      rect(188, 685, 724, 247, '#f8fafc', 15, 'stroke="#e3e9ee"') +
      text(
        550,
        784,
        'A little setup. A lot less typing.',
        29,
        '#8196a2',
        500,
        'text-anchor="middle"',
      ) +
      text(
        550,
        829,
        'Load your downloaded extension to get started.',
        22,
        '#9aabb6',
        400,
        'text-anchor="middle"',
      );
  if (stage === 2) {
    const t = ease((p - 0.05) / 0.4);
    body +=
      highlight(1472, 415, 278, 64, p, 12) +
      cursor(1265 + 430 * t, 657 - 205 * t, p > 0.43 ? clamp((p - 0.43) * 5) : 0);
  } else if (stage === 3) {
    if (p < 0.36)
      body +=
        highlight(184, 513, 215, 48, p) +
        cursor(
          413 - 130 * ease(p / 0.25),
          651 - 115 * ease(p / 0.25),
          p > 0.23 ? clamp((p - 0.23) * 7) : 0,
        );
    if (p > 0.38)
      body += `<g opacity="${ease((p - 0.38) / 0.1)}">${rect(142, 397, 1636, 671, '#1b25352c')}${finder(Math.min(0.25, (p - 0.38) / 0.62), true)}</g>`;
  }
  return wallpaper() + chrome('chrome://extensions', body, { title: 'Extensions' });
}
function extensionCard() {
  return (
    rect(188, 685, 724, 247, '#fff', 15, 'stroke="#cbdad6" stroke-width="2"') +
    image(218, 720, 72) +
    text(312, 752, 'EZEapply', 31, ink, 650) +
    text(312, 790, 'Your reusable answers and application assistant.', 22, '#748b96') +
    pill(217, 852, 130, 'Details', '#f1f6fa', '#526b7b', 44) +
    pill(360, 852, 136, 'Remove', '#f1f6fa', '#526b7b', 44) +
    rect(819, 862, 56, 29, '#1a73e8', 16) +
    `<circle cx="860" cy="876.5" r="11" fill="#fff"/>`
  );
}
function jobPage(p) {
  const filled = p > 0.48;
  const panelX = 1290;
  let body =
    rect(142, 397, 1148, 671, '#f6f9fa') +
    text(215, 469, 'EXAMPLE COMPANY · CAREERS', 20, '#718e91', 650, 'letter-spacing="2"') +
    text(215, 530, 'Apply for AI Engineer', 43, ink, 650) +
    text(215, 576, 'Make your next move.', 25, '#748c97');
  [
    ['First name', 'Alex'],
    ['Expected CTC in lakhs', '9'],
    ['Notice period in days', '7'],
  ].forEach(([label, value], i) => {
    const y = 640 + i * 128;
    body +=
      text(217, y, label, 24, '#4c6571', 550) +
      rect(
        215,
        y + 20,
        980,
        66,
        '#fff',
        10,
        `stroke="${filled ? '#6bbda6' : '#c9d4dc'}" stroke-width="2"`,
      ) +
      text(237, y + 64, filled ? value : '', 27, ink);
  });
  body +=
    rect(panelX, 397, 488, 671, '#1c3035') +
    image(panelX + 23, 417, 31) +
    text(panelX + 66, 443, 'EZEapply', 28, '#eafaf5', 650) +
    text(panelX + 23, 503, 'Your fields', 27, '#edf9f6', 650) +
    pill(panelX + 23, 530, 175, 'Fill this page', '#238f77', '#fff', 47) +
    pill(panelX + 208, 530, 115, 'Resume', '#304650', '#d6e6e5', 47) +
    text(panelX + 23, 630, 'PERSONAL QUESTIONS', 17, '#a0c1ba', 650, 'letter-spacing="2"');
  [
    ['First name', 'Alex'],
    ['Expected CTC', '9'],
    ['Notice period', '7'],
  ].forEach(([label, value], i) => {
    const y = 691 + i * 83;
    body +=
      text(panelX + 23, y, label, 22, '#b3cbc5') +
      text(1742, y, value, 25, '#effaf7', 600, 'text-anchor="end"') +
      line(panelX + 23, y + 24, 1748, y + 24, '#314b50');
  });
  if (filled) body += pill(570, 990, 326, '✓  Filled 3 fields', '#d9f7ed', '#207e64', 47);
  body += cursor(
    1489 - 70 * ease(p / 0.4),
    644 - 90 * ease(p / 0.4),
    p > 0.38 && p < 0.6 ? clamp((p - 0.38) * 7) : 0,
  );
  return (
    wallpaper() +
    chrome('careers.example.com/apply', body, { title: 'Apply · AI Engineer', installed: true })
  );
}
function scene(index, p) {
  if (index === 0) return github(p);
  if (index === 1) return wallpaper('Finder') + finder(p);
  if (index === 2) return extensions(p, 2);
  if (index === 3) return extensions(p, 3);
  if (index === 4)
    return extensions(0.8, 4) + rect(142, 397, 1636, 671, '#1b25352c') + finder(p, true);
  return p < 0.2 ? extensions(0.8, 5) : jobPage((p - 0.2) / 0.8);
}
export function frameSVG(time) {
  const index = Math.min(5, Math.floor(time / SCENE)),
    p = (time - index * SCENE) / SCENE;
  const cross = index > 0 ? ease(p / 0.07) : 1;
  const [short, title, caption] = steps[index];
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${font}"><defs><linearGradient id="back" x2="1" y2="1"><stop stop-color="#111f29"/><stop offset="1" stop-color="#081119"/></linearGradient><linearGradient id="wallpaper" x2=".8" y2="1"><stop stop-color="#dbe9b6"/><stop offset=".4" stop-color="#72b9bc"/><stop offset="1" stop-color="#203b69"/></linearGradient><filter id="window-shadow" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="28" stdDeviation="30" flood-color="#052134" flood-opacity=".4"/></filter><filter id="panel-shadow" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#14232f" flood-opacity=".2"/></filter><filter id="cursor-shadow"><feDropShadow dx="1" dy="3" stdDeviation="2" flood-opacity=".3"/></filter><clipPath id="desktop-clip">${rect(80, 172, 1760, 970, '#fff', 24)}</clipPath><clipPath id="chrome-clip">${rect(142, 254, 1636, 814, '#fff', 20)}</clipPath><clipPath id="finder-plain">${rect(340, 318, 1240, 650, '#fff', 18)}</clipPath><clipPath id="finder-picker">${rect(378, 362, 1162, 612, '#fff', 18)}</clipPath></defs>${rect(0, 0, W, H, 'url(#back)')}${image(80, 59, 58)}${text(155, 100, 'EZEapply', 35, '#e9f7f3', 650)}${text(1840, 99, 'CHROME · 15 SECONDS', 19, '#86b4a8', 600, 'text-anchor="end" letter-spacing="3"')}<g clip-path="url(#desktop-clip)">${index > 0 && cross < 1 ? scene(index - 1, 1) : ''}<g opacity="${cross}">${scene(index, p)}</g></g>${rect(80, 172, 1760, 970, 'none', 24, 'stroke="#bdede820" stroke-width="2"')}${text(88, 1201, `${String(index + 1).padStart(2, '0')} / 06 · ${short.toUpperCase()}`, 20, teal, 600, 'letter-spacing="1.8"')}${text(88, 1260, title, 43, '#eff9f5', 600, 'letter-spacing="-1"')}${text(88, 1308, caption, 25, '#91a8b6')}${rect(88, 1355, 1555, 5, '#2a4149', 3)}${rect(88, 1355, 1555 * clamp(time / DURATION), 5, teal, 3)}${text(1832, 1366, `0:${String(Math.floor(time)).padStart(2, '0')} / 0:15`, 21, '#85a69d', 500, 'text-anchor="end"')}${text(88, 1405, 'Illustrated walkthrough · Select the extracted folder, not the ZIP. Keep that folder after installation.', 18, '#597986')}</svg>`;
}
async function run(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let error = '';
    child.stderr.on('data', (chunk) => {
      error = (error + chunk).slice(-5000);
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited ${code}: ${error}`)),
    );
  });
}
await mkdir(output, { recursive: true });
await mkdir(frames, { recursive: true });
if (process.argv.includes('--stills')) {
  for (let index = 0; index < 6; index++)
    await sharp(Buffer.from(frameSVG(index * SCENE + 1.8)))
      .png()
      .toFile(join(frames, `scene-${index + 1}.png`));
  console.log(`Six storyboard frames: ${frames}`);
} else {
  let next = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (next < FPS * DURATION) {
        const frame = next++;
        await sharp(Buffer.from(frameSVG(frame / FPS)))
          .png()
          .toFile(join(frames, `${String(frame).padStart(4, '0')}.png`));
      }
    }),
  );
  console.log('Rendered 450 full-resolution frames.');
  await run('ffmpeg', [
    '-y',
    '-framerate',
    String(FPS),
    '-i',
    join(frames, '%04d.png'),
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '16',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-an',
    join(output, 'install-ezeapply.mp4'),
  ]);
  await run('ffmpeg', [
    '-y',
    '-i',
    join(output, 'install-ezeapply.mp4'),
    '-filter_complex',
    'fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle',
    '-loop',
    '0',
    join(output, 'install-ezeapply.gif'),
  ]);
  await sharp(Buffer.from(frameSVG(6.9)))
    .png()
    .toFile(join(output, 'install-poster.png'));
  await writeFile(
    join(output, 'install-transcript.vtt'),
    'WEBVTT\n\n' +
      steps
        .map((step, index) => {
          const stamp = (n) =>
            `00:00:${String(Math.floor(n)).padStart(2, '0')}.${n % 1 ? '500' : '000'}`;
          return `${stamp(index * SCENE)} --> ${stamp((index + 1) * SCENE)}\n${step[1]} ${step[2]}\n`;
        })
        .join('\n'),
  );
  await rm(frames, { recursive: true, force: true });
  console.log(`MP4, GIF, poster and captions: ${output}`);
}
