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
  DURATION = 30;
const teal = '#54d4b0',
  ink = '#192229',
  muted = '#768893';
const icon = `data:image/svg+xml;base64,${Buffer.from(await readFile(join(root, 'src/assets/local-icon.svg'))).toString('base64')}`;
const font = '-apple-system, BlinkMacSystemFont, SF Pro Display, Helvetica Neue, Arial, sans-serif';
const steps = [
  {
    start: 0,
    duration: 6,
    name: 'GitHub download',
    title: 'Start on the EZEapply GitHub page.',
    caption: 'Scroll to the README and click Download EZEapply for Chrome.',
  },
  {
    start: 6,
    duration: 4,
    name: 'Extract the ZIP',
    title: 'Open Downloads. Extract EZEapply.zip.',
    caption: 'Double-click the ZIP. Keep the extracted EZEapply folder.',
  },
  {
    start: 10,
    duration: 3,
    name: 'Open extensions',
    title: 'Type chrome://extensions, then press Return.',
    caption: 'Use Chrome’s address bar to open its extension manager.',
  },
  {
    start: 13,
    duration: 5,
    name: 'Developer mode',
    title: 'Turn Developer mode on.',
    caption: 'The switch is at the top right. Load unpacked appears at the top left.',
  },
  {
    start: 18,
    duration: 3,
    name: 'Load unpacked',
    title: 'Click Load unpacked.',
    caption: 'Choose the button at the top left to open the folder picker.',
  },
  {
    start: 21,
    duration: 4,
    name: 'Select folder',
    title: 'Select the folder containing manifest.json.',
    caption: 'Choose the extracted EZEapply folder, then click Select.',
  },
  {
    start: 25,
    duration: 5,
    name: 'Ready to use',
    title: 'EZEapply is ready for your next application.',
    caption: 'Open EZEapply on a job form and click Fill this page.',
  },
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
  const dark = !!options.dark;
  const top = dark ? '#272030' : '#e6e9ed',
    tab = dark ? '#40374c' : '#fff';
  const toolbar = dark ? '#40374c' : '#f5f7f9',
    address = dark ? '#2b2535' : '#e9edf1';
  const foreground = dark ? '#e5dfec' : '#39454e',
    secondary = dark ? '#b9b0c5' : '#647985';
  return `<g filter="url(#window-shadow)">${rect(142, 254, 1636, 814, tab, 20)}<g clip-path="url(#chrome-clip)">${rect(142, 254, 1636, 77, top)}${traffic(173, 290)}${rect(262, 270, 425, 61, tab, 13)}${options.installed ? image(283, 284, 25) : puzzle(283, 284, 23)}${text(323, 305, options.title || 'EZEapply', 23, foreground, 550)}${text(650, 305, '×', 23, secondary)}${text(708, 306, '+', 29, secondary)}${rect(142, 331, 1636, 66, toolbar)}${text(168, 373, '‹', 39, secondary)}${text(212, 373, '›', 39, secondary)}${text(259, 371, '↻', 27, secondary)}${rect(306, 343, 1308, 43, address, 22)}${text(328, 372, '⌕', 24, secondary)}${text(365, 372, url, 23, dark ? '#ded6e8' : '#4c5e6b')}${options.installed ? image(1642, 350, 30) : puzzle(1642, 350, 27)}${text(1701, 375, '⋮', 31, secondary)}${rect(142, 397, 1636, 671, dark ? '#1e1b23' : '#fff')}${body}</g></g>`;
}
function githubMark(x, y, size = 34) {
  return `<g transform="translate(${x} ${y}) scale(${size / 24})" fill="#f0f6fc"><path d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.11.79-.25.79-.56v-2.14c-3.22.7-3.9-1.36-3.9-1.36-.53-1.35-1.29-1.71-1.29-1.71-1.06-.73.08-.71.08-.71 1.17.08 1.79 1.2 1.79 1.2 1.04 1.77 2.72 1.26 3.38.96.1-.75.4-1.26.74-1.55-2.57-.29-5.27-1.29-5.27-5.72 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.47.11-3.06 0 0 .96-.31 3.16 1.18a10.9 10.9 0 0 1 5.75 0c2.2-1.49 3.15-1.18 3.15-1.18.63 1.59.23 2.77.11 3.06.74.81 1.18 1.84 1.18 3.1 0 4.44-2.7 5.42-5.28 5.71.42.36.79 1.06.79 2.14v3.18c0 .31.21.68.8.56A11.5 11.5 0 0 0 12 .7Z"/></g>`;
}
function github(p) {
  const scroll = 370 * ease((p - 0.13) / 0.3);
  const downloaded = p >= 0.77;
  const x = 190,
    w = 1136;
  let document =
    text(190, 665, '▣  dumpydon / EZEapply', 30, '#58a6ff', 600) +
    pill(545, 637, 85, 'Public', '#0d1117', '#8b949e', 33) +
    pill(190, 708, 130, 'main ⌄', '#21262d', '#c9d1d9', 44) +
    text(343, 738, '1 branch    1 tag', 20, '#8b949e') +
    pill(1153, 707, 173, '〈〉 Code ⌄', '#238636', '#fff', 44) +
    rect(x, 776, w, 278, '#0d1117', 10, 'stroke="#30363d"') +
    rect(x, 776, w, 54, '#161b22', 10) +
    text(215, 811, '●  dumpydon', 22, '#e6edf3', 600) +
    text(430, 811, 'Release EZEapply 3.0.0', 21, '#8b949e') +
    text(1305, 811, '1b3a079', 19, '#8b949e', 400, 'text-anchor="end"');
  ['docs', 'downloads', 'src', 'LICENSE', 'README.md'].forEach((name, i) => {
    const y = 866 + i * 42;
    document +=
      text(216, y, i < 3 ? '▰' : '▤', 22, i < 3 ? '#79c0ff' : '#8b949e') +
      text(253, y, name, 21, '#e6edf3') +
      text(
        565,
        y,
        i < 3 ? 'EZEapply source and release assets' : 'Update project documentation',
        19,
        '#8b949e',
      ) +
      line(x, y + 14, x + w, y + 14, '#21262d', 1);
  });
  // A real repository layout: file list, README tabs, About and Releases sidebar.
  document +=
    text(1370, 675, 'About', 26, '#e6edf3', 600) +
    text(1370, 718, 'Your answers. Your AI.', 22, '#c9d1d9') +
    text(1370, 753, 'Fewer repetitive forms.', 22, '#c9d1d9') +
    pill(1370, 785, 110, 'chrome', '#132d48', '#79c0ff', 34) +
    pill(1491, 785, 142, 'autofill', '#132d48', '#79c0ff', 34) +
    text(1370, 875, '▤  Readme', 21, '#8b949e') +
    text(1370, 918, '☆  0 stars', 21, '#8b949e') +
    line(1360, 950, 1732, 950, '#30363d') +
    text(1370, 997, 'Releases', 26, '#e6edf3', 600) +
    text(1370, 1042, 'EZEapply 3.0.0', 23, '#e6edf3', 600) +
    pill(1570, 1015, 100, 'Latest', '#0d3321', '#3fb950', 32) +
    rect(x, 1084, w, 1510, '#0d1117', 10, 'stroke="#30363d"') +
    rect(x, 1084, w, 61, '#161b22', 10) +
    text(215, 1123, '▤  README', 23, '#e6edf3', 600) +
    text(416, 1123, 'License', 22, '#8b949e') +
    line(215, 1144, 369, 1144, '#f78166', 3) +
    image(527, 1190, 60) +
    text(603, 1238, 'EZEapply', 56, '#4cc4a1', 700) +
    text(
      758,
      1295,
      'Your answers. Your AI. Fewer repetitive forms.',
      24,
      '#c9d1d9',
      400,
      'text-anchor="middle"',
    ) +
    text(758, 1336, 'Created by Piyush Agarwal', 22, '#8b949e', 400, 'text-anchor="middle"') +
    text(758, 1407, '↓ Download EZEapply for Chrome', 30, '#58a6ff', 600, 'text-anchor="middle"') +
    line(511, 1416, 1005, 1416, '#58a6ff', 1.5) +
    text(758, 1454, 'Watch the installation film', 22, '#58a6ff', 400, 'text-anchor="middle"') +
    text(230, 1530, 'Install', 34, '#e6edf3', 600) +
    line(230, 1548, 1284, 1548, '#30363d');
  const install = [
    '1. Download EZEapply.zip and extract it.',
    '2. Keep the extracted EZEapply folder somewhere permanent.',
    '3. Open chrome://extensions and turn on Developer mode.',
    '4. Click Load unpacked and select the EZEapply folder.',
    '5. Pin EZEapply, open your profile, and you’re ready.',
  ];
  install.forEach((label, i) => (document += text(240, 1592 + i * 44, label, 23, '#c9d1d9')));
  document +=
    rect(230, 1825, 1054, 225, '#101e27', 9, 'stroke="#28434a"') +
    image(275, 1860, 52) +
    text(350, 1900, 'Install EZEapply in Chrome', 31, '#e7f5ef', 600) +
    text(350, 1955, '▶  Watch the complete installation walkthrough', 25, '#7edcc1') +
    text(230, 2110, 'What it does', 34, '#e6edf3', 600) +
    line(230, 2130, 1284, 2130, '#30363d');
  [
    'One-click answers in a compact sidebar',
    'Smart autofill for supported application forms',
    'Your AI provider, your key and your model',
    'Application analytics and daily goals',
  ].forEach((label, i) => (document += text(240, 2175 + i * 43, '• ' + label, 23, '#c9d1d9')));
  // Scroll far enough that both the download link and installation steps are visible.
  const travel = scroll * 1.43;
  let body =
    rect(142, 397, 1636, 671, '#0d1117') +
    `<g clip-path="url(#github-body)"><g transform="translate(0 ${-travel})">${document}</g></g>`;
  const linkY = 1407 - travel;
  if (p > 0.44 && !downloaded) body += highlight(492, linkY - 36, 530, 54, p, 7);
  // GitHub global header and repository navigation remain visually recognizable.
  body +=
    rect(142, 397, 1636, 144, '#010409') +
    rect(168, 417, 43, 43, '#0d1117', 8, 'stroke="#30363d"') +
    text(179, 447, '☰', 24, '#8b949e') +
    githubMark(233, 420, 39) +
    text(300, 449, 'dumpydon / EZEapply', 25, '#e6edf3', 600) +
    rect(1162, 419, 430, 42, '#0d1117', 7, 'stroke="#30363d"') +
    text(1181, 447, '⌕  Type / to search', 20, '#8b949e') +
    text(1622, 448, '＋  ◉', 28, '#8b949e') +
    `<circle cx="1726" cy="440" r="19" fill="#314d48"/>` +
    text(1726, 447, 'P', 20, '#bfead7', 600, 'text-anchor="middle"') +
    text(176, 510, '〈〉 Code', 22, '#e6edf3', 600) +
    text(333, 510, '◉ Issues', 22, '#c9d1d9') +
    text(485, 510, '⑂ Pull requests', 22, '#c9d1d9') +
    text(708, 510, '▷ Actions', 22, '#c9d1d9') +
    text(875, 510, '▦ Projects', 22, '#c9d1d9') +
    text(1048, 510, '◇ Security', 22, '#c9d1d9') +
    text(1232, 510, '⌁ Insights', 22, '#c9d1d9') +
    line(165, 539, 294, 539, '#f78166', 4) +
    line(142, 541, 1778, 541, '#30363d', 1) +
    rect(1764, 558 + 140 * ease((p - 0.13) / 0.3), 5, 150, '#59636b', 3);
  if (downloaded) {
    body += `<g filter="url(#panel-shadow)">${rect(1140, 402, 597, 204, '#29262e', 15, 'stroke="#5e5768"')}${text(1170, 443, 'Recent downloads', 26, '#eee8f4', 600)}${text(1702, 442, '×', 26, '#b1a8bc')}${file(1177, 468, 'ZIP', 43)}${text(1245, 491, 'EZEapply.zip', 27, '#eee8f4', 600)}${text(1245, 532, 'Done', 21, '#b2aabb')}${text(1245, 574, 'Show in Finder', 24, '#bca4e5', 600)}${highlight(1235, 548, 235, 37, p, 7)}</g>`;
    const t = ease((p - 0.8) / 0.13);
    body += cursor(
      792 + 528 * t,
      linkY - 4 + (569 - (linkY - 4)) * t,
      p > 0.94 ? clamp((p - 0.94) * 15) : 0,
    );
  } else if (p > 0.32) {
    const t = ease((p - 0.37) / 0.22);
    body += cursor(
      1040 - 248 * t,
      715 + (linkY - 715) * t,
      p > 0.69 ? clamp((p - 0.69) / 0.08) : 0,
    );
  }
  return (
    wallpaper() +
    chrome('github.com/dumpydon/EZEapply', body, {
      title: 'dumpydon/EZEapply · GitHub',
      dark: true,
    })
  );
}
function addressBar(p) {
  const url = 'chrome://extensions',
    typed = url.slice(0, Math.floor(clamp((p - 0.15) / 0.57) * url.length));
  let body =
    rect(142, 397, 1636, 671, '#29252f') +
    text(960, 657, 'Google', 92, '#e7e2ec', 550, 'text-anchor="middle"') +
    rect(500, 705, 920, 74, '#f4eff7', 40) +
    text(535, 753, '⌕  Search Google or type a URL', 29, '#706777');
  body +=
    rect(306, 339, 1308, 53, '#2b2535', 27, 'stroke="#c9b0ed" stroke-width="3"') +
    text(365, 375, typed, 28, '#f1e9fc', 400, 'font-family="Menlo, monospace"');
  if (p < 0.85 && Math.floor(p * 18) % 2 === 0)
    body += rect(365 + typed.length * 16.86 + 2, 350, 2, 29, '#e9d9ff');
  if (typed) {
    body +=
      rect(306, 399, 1308, 123, '#39313f', 13, 'stroke="#66596f"') +
      rect(318, 411, 1284, 46, '#4b4057', 9) +
      text(343, 444, '⌕  ' + typed, 25, '#e8e0f3') +
      text(343, 494, 'Extensions — Chrome settings', 22, '#bfb1cf');
  }
  if (p > 0.73)
    body += pill(
      1330,
      901,
      337,
      'Press Return  ↵',
      p > 0.86 ? '#c9b0ed' : '#40374c',
      p > 0.86 ? '#292132' : '#e9dcfc',
      65,
    );
  if (p < 0.15) body += cursor(775, 368);
  return wallpaper() + chrome('', body, { title: 'New tab', dark: true });
}
function focusView(content, scale, cx, cy) {
  return `<g clip-path="url(#desktop-clip)"><g transform="translate(${cx} ${cy}) scale(${scale}) translate(${-cx} ${-cy})">${content}</g></g>`;
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
function chromeButton(x, y, w, label) {
  return (
    rect(x, y, w, 48, '#211d28', 26, 'stroke="#82708f" stroke-width="1.8"') +
    text(x + w / 2, y + 32, label, 23, '#d7bcf9', 600, 'text-anchor="middle"')
  );
}
function chromeLogo(x, y, size = 38) {
  return `<g transform="translate(${x} ${y}) scale(${size / 40})"><circle cx="20" cy="20" r="19" fill="#e5deed"/><circle cx="20" cy="20" r="8" fill="#211d28"/><path d="M20 12H37M13 24 5 9M24 26l-9 12" fill="none" stroke="#211d28" stroke-width="3"/></g>`;
}
function installedCard(x, y, title, kind, on = true, developer = false) {
  let card =
    rect(x, y, 533, developer ? 252 : 221, '#29242f', 12, 'stroke="#34303b"') +
    (kind === 'eze'
      ? image(x + 22, y + 27, 49)
      : kind === 'docs'
        ? rect(x + 24, y + 28, 34, 45, '#4285f4', 4) +
          line(x + 30, y + 42, x + 52, y + 42, '#fff', 2) +
          line(x + 30, y + 51, x + 52, y + 51, '#fff', 2)
        : `<path d="M${x + 24} ${y + 71}l21-43h20l-23 43Z" fill="#19a463"/><path d="M${x + 45} ${y + 28}h20l23 43h-20Z" fill="#ffcc39"/><path d="M${x + 24} ${y + 71}l10 16h44l10-16Z" fill="#4285f4"/>`) +
    text(x + 87, y + 44, title, kind === 'drive' ? 19 : 23, '#e7e0ef', 550);
  const copy =
    kind === 'docs'
      ? ['Edit and view documents, spreadsheets', 'and presentations while offline.']
      : kind === 'drive'
        ? ['Open Drive files directly from your browser', 'in compatible applications.']
        : ['Reusable answers, your AI provider,', 'and application analytics.'];
  copy.forEach((t, i) => (card += text(x + 87, y + 82 + i * 30, t, 20, '#bcb3c6')));
  if (developer)
    card += text(
      x + 87,
      y + 157,
      kind === 'eze' ? '3.0.0 · Loaded unpacked' : 'ID: example-extension',
      18,
      '#a89bb6',
    );
  const yy = y + (developer ? 190 : 161);
  card +=
    chromeButton(x + 20, yy, 109, 'Details') +
    chromeButton(x + 140, yy, 118, 'Remove') +
    rect(x + 459, yy + 14, 48, 25, on ? '#cbb0f2' : '#5c5365', 14) +
    `<circle cx="${x + (on ? 494 : 472)}" cy="${yy + 26.5}" r="9" fill="${on ? '#3c235b' : '#a49aac'}"/>`;
  return card;
}
function extensions(p, stage) {
  const developer =
    stage === 'load' ||
    stage === 'installed' ||
    stage === 'select' ||
    (stage === 'developer' && p >= 0.54);
  let body =
    rect(142, 397, 1636, 671, '#1e1b23') +
    chromeLogo(166, 423, 35) +
    text(218, 452, 'Extensions', 31, '#e9e3f0', 550) +
    rect(610, 415, 731, 53, '#342e3c', 29) +
    text(632, 449, '⌕  Search extensions', 23, '#bfb4ce') +
    text(1442, 451, 'Developer mode', 27, '#d9cee5', 500) +
    rect(
      1682,
      425,
      59,
      31,
      developer ? '#cbb0f2' : '#5e5566',
      18,
      'stroke="#ae9dc2" stroke-width="1.5"',
    ) +
    `<circle cx="${developer ? 1724 : 1699}" cy="440.5" r="11" fill="${developer ? '#3b215a' : '#a197aa'}"/>`;
  if (developer)
    body +=
      chromeButton(168, 491, 229, 'Load unpacked') +
      chromeButton(418, 491, 230, 'Pack extension') +
      chromeButton(670, 491, 132, 'Update') +
      line(142, 558, 1778, 558, '#39323f');
  const top = developer ? 580 : 493;
  body +=
    rect(142, top, 278, 51, '#302538', 25) +
    puzzle(164, top + 15, 24) +
    text(210, top + 33, 'My extensions', 23, '#d7bcf9', 550) +
    text(170, top + 90, '⌨', 26, '#ddd4e7') +
    text(211, top + 90, 'Keyboard shortcuts', 22, '#d8cede') +
    line(142, top + 118, 431, top + 118, '#36313b') +
    text(170, top + 164, 'Discover more', 20, '#c3b7cf') +
    text(170, top + 192, 'extensions and themes', 20, '#c3b7cf') +
    text(170, top + 222, 'on the Chrome Web Store', 20, '#cfaff1') +
    text(473, top + 37, 'All extensions', 26, '#e5dceb', 550) +
    text(1413, top + 37, 'Pin new extensions to toolbar', 18, '#bfb2ce') +
    installedCard(
      474,
      top + 68,
      stage === 'installed' ? 'EZEapply' : 'Application launcher for Drive',
      stage === 'installed' ? 'eze' : 'drive',
      stage === 'installed',
      developer,
    ) +
    installedCard(1026, top + 68, 'Google Docs Offline', 'docs', true, developer);
  if (stage === 'installed')
    body +=
      highlight(474, top + 68, 533, 252, 0.5, 15) +
      pill(885, 967, 431, '✓  EZEapply added to Chrome', '#193c33', '#9de7c9', 53);
  let scale = 1;
  if (stage === 'developer') {
    const zoom = ease((p - 0.07) / 0.2) * (1 - ease((p - 0.76) / 0.2));
    scale = 1 + 0.47 * zoom;
    if (p > 0.12) body += highlight(1427, 414, 325, 53, p, 13);
    const t = ease((p - 0.12) / 0.3);
    body += cursor(
      1296 + 414 * t,
      636 - 196 * t,
      p > 0.54 && p < 0.7 ? clamp((p - 0.54) / 0.16) : 0,
    );
    return focusView(
      wallpaper() + chrome('chrome://extensions', body, { title: 'Extensions', dark: true }),
      scale,
      1730,
      350,
    );
  }
  if (stage === 'load') {
    scale = 1 + 0.38 * ease(p / 0.24) * (1 - ease((p - 0.72) / 0.25));
    body += highlight(168, 491, 229, 48, p, 26);
    const t = ease((p - 0.12) / 0.32);
    body += cursor(
      635 - 357 * t,
      705 - 188 * t,
      p > 0.56 && p < 0.76 ? clamp((p - 0.56) / 0.2) : 0,
    );
  }
  return focusView(
    wallpaper() + chrome('chrome://extensions', body, { title: 'Extensions', dark: true }),
    scale,
    180,
    350,
  );
}
function jobPage(p) {
  const filled = p > 0.48;
  const panelX = 1290;
  let body =
    rect(142, 397, 1148, 671, '#f6f9fa') +
    text(215, 469, 'EXAMPLE COMPANY · CAREERS', 20, '#718e91', 650, 'letter-spacing="2"') +
    text(215, 530, 'Job Form AI Engineer', 43, ink, 650) +
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
    chrome('careers.example.com/apply', body, { title: 'Job Form · AI Engineer', installed: true })
  );
}
function scene(index, p) {
  if (index === 0) return github(p);
  if (index === 1) return wallpaper('Finder') + finder(p);
  if (index === 2) return addressBar(p);
  if (index === 3) return extensions(p, 'developer');
  if (index === 4) return extensions(p, 'load');
  if (index === 5) {
    if (p > 0.85) return extensions(0.9, 'installed');
    return extensions(0.9, 'select') + rect(142, 397, 1636, 671, '#12101b77') + finder(p, true);
  }
  return p < 0.16 ? extensions(0.9, 'installed') : jobPage((p - 0.16) / 0.84);
}
export function frameSVG(time) {
  time = Math.max(0, Math.min(DURATION - 1 / FPS, time));
  const index = steps.findIndex((step) => time < step.start + step.duration);
  const step = steps[index],
    p = (time - step.start) / step.duration;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${font}"><defs><linearGradient id="back" x2="1" y2="1"><stop stop-color="#111f29"/><stop offset="1" stop-color="#081119"/></linearGradient><linearGradient id="wallpaper" x2=".8" y2="1"><stop stop-color="#dbe9b6"/><stop offset=".4" stop-color="#72b9bc"/><stop offset="1" stop-color="#203b69"/></linearGradient><filter id="window-shadow" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="28" stdDeviation="30" flood-color="#052134" flood-opacity=".4"/></filter><filter id="panel-shadow" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#14232f" flood-opacity=".2"/></filter><filter id="cursor-shadow"><feDropShadow dx="1" dy="3" stdDeviation="2" flood-opacity=".3"/></filter><clipPath id="desktop-clip">${rect(80, 172, 1760, 970, '#fff', 24)}</clipPath><clipPath id="chrome-clip">${rect(142, 254, 1636, 814, '#fff', 20)}</clipPath><clipPath id="github-body">${rect(142, 541, 1636, 527, '#fff')}</clipPath><clipPath id="finder-plain">${rect(340, 318, 1240, 650, '#fff', 18)}</clipPath><clipPath id="finder-picker">${rect(378, 362, 1162, 612, '#fff', 18)}</clipPath></defs>${rect(0, 0, W, H, 'url(#back)')}${image(80, 59, 58)}${text(155, 100, 'EZEapply', 35, '#e9f7f3', 650)}${text(1840, 99, `CHROME · ${DURATION} SECONDS`, 19, '#86b4a8', 600, 'text-anchor="end" letter-spacing="3"')}<g clip-path="url(#desktop-clip)">${scene(index, p)}</g>${rect(80, 172, 1760, 970, 'none', 24, 'stroke="#bdede820" stroke-width="2"')}${text(88, 1201, `${String(index + 1).padStart(2, '0')} / 07 · ${step.name.toUpperCase()}`, 20, teal, 600, 'letter-spacing="1.8"')}${text(88, 1260, step.title, 43, '#eff9f5', 600, 'letter-spacing="-1"')}${text(88, 1308, step.caption, 25, '#91a8b6')}${rect(88, 1355, 1555, 5, '#2a4149', 3)}${rect(88, 1355, 1555 * clamp(time / DURATION), 5, teal, 3)}${text(1832, 1366, `0:${String(Math.floor(time)).padStart(2, '0')} / 0:${DURATION}`, 21, '#85a69d', 500, 'text-anchor="end"')}${text(88, 1405, 'Illustrated walkthrough · Select the extracted folder, not the ZIP. Keep that folder after installation.', 18, '#597986')}</svg>`;
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
  for (let index = 0; index < steps.length; index++)
    await sharp(Buffer.from(frameSVG(steps[index].start + steps[index].duration * 0.67)))
      .png()
      .toFile(join(frames, `scene-${index + 1}.png`));
  console.log(`Seven storyboard frames: ${frames}`);
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
  console.log(`Rendered ${FPS * DURATION} full-resolution frames.`);
  await run('ffmpeg', [
    '-y',
    '-framerate',
    String(FPS),
    '-i',
    join(frames, '%04d.png'),
    '-frames:v',
    String(FPS * DURATION),
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
  await sharp(Buffer.from(frameSVG(16.2)))
    .png()
    .toFile(join(output, 'install-poster.png'));
  await writeFile(
    join(output, 'install-transcript.vtt'),
    'WEBVTT\n\n' +
      steps
        .map((step) => {
          const stamp = (n) =>
            `00:00:${String(Math.floor(n)).padStart(2, '0')}.${String(Math.round((n % 1) * 1000)).padStart(3, '0')}`;
          return `${stamp(step.start)} --> ${stamp(step.start + step.duration)}\n${step.title} ${step.caption}\n`;
        })
        .join('\n'),
  );
  await rm(frames, { recursive: true, force: true });
  console.log(`MP4, GIF, poster and captions: ${output}`);
}
