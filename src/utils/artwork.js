// Generates placeholder artwork locally so the app never depends on external images.
const PALETTES = {
  painting: ['#2b3bff', '#f2b134', '#e8527c', '#1f9d7a'],
  illustration: ['#14120f', '#6b655c', '#b8b1a5', '#2b3bff'],
  photography: ['#3a4a6b', '#e8a87c', '#f3d9b1', '#14120f'],
  pottery: ['#b5562c', '#e7b88c', '#7a3b1f', '#f4e3cf'],
  poetry: ['#14120f', '#2b3bff', '#6b655c'],
  music: ['#1f9d7a', '#0e4d3b', '#7fd1b5'],
  dance: ['#e8527c', '#f7b2c8', '#6a3fa0'],
  digital: ['#2b3bff', '#7a5cff', '#00c2b8', '#ff5db1'],
  crafts: ['#2b3bff', '#f2b134', '#e8527c', '#14120f'],
};
const SIZES = { portrait: [400, 500], landscape: [500, 360], square: [400, 400] };
const BACKGROUNDS = { poetry: '#ece6da', music: '#e4f2ec', pottery: '#efe3d3', dance: '#fbe9ef', photography: '#f3d9b1' };

const hash = (s) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
const seededRandom = (seed) => () => {
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (r, list) => list[Math.floor(r() * list.length)];

const painters = {
  blobs: (r, p, w, h) => Array.from({ length: 7 }, () => `<circle cx="${r() * w}" cy="${r() * h}" r="${50 + r() * 110}" fill="${pick(r, p)}" opacity=".6"/>`).join(''),
  strokes: (r, p, w, h) => Array.from({ length: 14 }, () => {
    let d = `M${r() * w} ${r() * h}`;
    for (let i = 0; i < 3; i++) d += ` C${r() * w} ${r() * h} ${r() * w} ${r() * h} ${r() * w} ${r() * h}`;
    return `<path d="${d}" fill="none" stroke="${pick(r, p)}" stroke-width="${0.8 + r() * 1.8}" opacity=".8"/>`;
  }).join(''),
  landscape: (r, p, w, h) => `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p[0]}"/><stop offset="1" stop-color="${p[1]}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/><circle cx="${w * (0.2 + r() * 0.6)}" cy="${h * 0.4}" r="${30 + r() * 30}" fill="${p[2]}"/>`
    + [0.6, 0.72, 0.85].map((y, i) => `<path d="M0 ${h * y} Q${w * 0.3} ${h * (y - 0.12 - r() * 0.08)} ${w * 0.6} ${h * y} T${w} ${h * y} V${h} H0Z" fill="${p[3]}" opacity="${0.35 + i * 0.25}"/>`).join(''),
  vase(r, p, w, h) {
    const cx = w / 2, base = 60 + r() * 40, belly = base + 30 + r() * 40, neck = 25 + r() * 20;
    const body = `M${cx - neck} ${h * 0.18} C${cx - neck} ${h * 0.35} ${cx - belly} ${h * 0.45} ${cx - base} ${h * 0.72} L${cx - base + 12} ${h * 0.86} L${cx + base - 12} ${h * 0.86} L${cx + base} ${h * 0.72} C${cx + belly} ${h * 0.45} ${cx + neck} ${h * 0.35} ${cx + neck} ${h * 0.18}Z`;
    return `<defs><clipPath id="v"><path d="${body}"/></clipPath></defs><path d="${body}" fill="${p[0]}"/>`
      + [0.4, 0.55, 0.68].map((y, i) => `<rect y="${h * y}" width="${w}" height="${8 + r() * 14}" fill="${p[1 + (i % 3)]}" clip-path="url(#v)"/>`).join('');
  },
  lines: (r, p, w, h) => Array.from({ length: 11 }, (_, i) => `<rect x="${w * 0.14}" y="${h * 0.18 + i * (h * 0.06)}" width="${w * (0.3 + r() * 0.5)}" height="5" rx="2.5" fill="${p[i % 2 ? 2 : 0]}" opacity="${i === 4 ? 1 : 0.55}"/>`).join('') + `<circle cx="${w * 0.8}" cy="${h * 0.14}" r="22" fill="${p[1]}"/>`,
  wave: (r, p, w, h) => Array.from({ length: 36 }, (_, i) => { const bar = 20 + Math.abs(Math.sin(i * 0.35 + r() * 2)) * h * 0.55 * (0.4 + r() * 0.6); return `<rect x="${w * 0.04 + i * (w * 0.92 / 36)}" y="${h / 2 - bar / 2}" width="${w * 0.016}" height="${bar}" rx="3" fill="${p[i % p.length]}"/>`; }).join(''),
  arcs: (r, p, w, h) => Array.from({ length: 9 }, (_, i) => { const d = 30 + i * 20, a = r() * 6, cx = w / 2, cy = h / 2; return `<path d="M${cx + Math.cos(a) * d} ${cy + Math.sin(a) * d} A${d} ${d} 0 0 1 ${cx + Math.cos(a + 2.4) * d} ${cy + Math.sin(a + 2.4) * d}" fill="none" stroke="${p[i % p.length]}" stroke-width="${4 + i}" stroke-linecap="round" opacity=".8"/>`; }).join(''),
  weave: (r, p, w, h) => Array.from({ length: 26 }, (_, i) => `<line x1="${i * (w / 12) - w / 2}" y1="0" x2="${i * (w / 12)}" y2="${h}" stroke="${p[i % p.length]}" stroke-width="${6 + r() * 6}" opacity=".7"/>`).join('')
    + Array.from({ length: 12 }, (_, i) => `<line x1="${w}" y1="${i * (h / 8)}" x2="0" y2="${i * (h / 8) + 60}" stroke="${p[(i + 1) % p.length]}" stroke-width="5" opacity=".45"/>`).join(''),
};
const PAINTER_FOR = { painting: 'blobs', digital: 'blobs', illustration: 'strokes', photography: 'landscape', pottery: 'vase', poetry: 'lines', music: 'wave', dance: 'arcs', crafts: 'weave' };

export function generateArtwork({ seed, category, aspect = 'square' }) {
  const [w, h] = SIZES[aspect] ?? SIZES.square;
  const palette = PALETTES[category] ?? PALETTES.painting;
  const body = painters[PAINTER_FOR[category] ?? 'blobs'](seededRandom(hash(seed)), palette, w, h);
  const background = BACKGROUNDS[category] ?? '#efe9df';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${background}"/>${body}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
