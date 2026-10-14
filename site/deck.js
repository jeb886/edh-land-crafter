export const COLORS = ["W", "U", "B", "R", "G"];
export const BASICS = { W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest" };
const BASIC_TYPES = Object.fromEntries(Object.entries(BASICS).map(([c, t]) => [t, c]));
const HEADERS = /^(commander|commanders|deck|mainboard|main|sideboard|maybeboard|companion|lands?|creatures?|instants?|sorcer(y|ies)|artifacts?|enchantments?|planeswalkers?)\s*(\(\d+\))?:?$/i;

export function parseDecklist(text) {
  const out = [];
  for (let line of text.split(/\r?\n/)) {
    line = line.trim();
    if (!line || line.startsWith("//") || line.startsWith("#") || HEADERS.test(line)) continue;
    line = line
      .replace(/\s*[[^].*$/, "")
      .replace(/\s*\*[A-Z]+\*\s*$/, "")
      .replace(/\s+\([A-Za-z0-9]{2,6}\)(\s+\S+)?\s*$/, "")
      .trim();
    const m = line.match(/^(\d+)\s*x?\s+(.+)$/i);
    const qty = m ? Number(m[1]) : 1;
    const name = (m ? m[2] : line).split(" // ")[0].split(" / ")[0].trim();
    if (name) out.push({ qty, name });
  }
  return out;
}

export const isLand = (card) => /\bLand\b/.test(card.type_line.split(" // ")[0]);

export function pipsOf(manaCost) {
  const pips = Object.fromEntries(COLORS.map((c) => [c, 0]));
  for (const [, sym] of manaCost.matchAll(/\{([^}]+)\}/g)) {
    const colors = sym.split("/").filter((s) => COLORS.includes(s));
    for (const c of colors) pips[c] += 1 / colors.length;
  }
  return pips;
}

export function countPips(entries) {
  const total = Object.fromEntries(COLORS.map((c) => [c, 0]));
  for (const { qty, card } of entries) {
    if (isLand(card)) continue;
    const p = pipsOf(card.mana_cost);
    for (const c of COLORS) total[c] += p[c] * qty;
  }
  return total;
}

export function sharesFromPips(pips, colors) {
  const sum = colors.reduce((s, c) => s + pips[c], 0);
  return Object.fromEntries(colors.map((c) => [c, sum ? Math.round((pips[c] / sum) * 100) : Math.round(100 / colors.length)]));
}

export function isCheapRampOrDraw(card) {
  if (isLand(card) || card.cmc > 3) return false;
  const t = card.oracle_text.toLowerCase();
  return /add \{|search your library for (a|an|up to \w+) (basic )?land|search your library for .*land card|draw (a|two|three) cards?/.test(t);
}

export function deckStats(entries) {
  let spells = 0, mvSum = 0, rampDraw = 0;
  for (const { qty, card } of entries) {
    if (isLand(card)) continue;
    spells += qty;
    mvSum += card.cmc * qty;
    if (isCheapRampOrDraw(card)) rampDraw += qty;
  }
  const avgMv = spells ? mvSum / spells : 0;
  return { spells, avgMv, rampDraw, landCount: recommendLandCount(avgMv, rampDraw) };
}

// Frank Karsten's Commander land-count formula, clamped to 35-38.
export function recommendLandCount(avgMv, rampDraw) {
  const raw = 31.42 + 3.13 * avgMv - 0.28 * rampDraw;
  return Math.min(38, Math.max(35, Math.round(raw)));
}

export function landColors(card, colors) {
  let produced = card.produced_mana.filter((c) => colors.includes(c));
  const t = card.oracle_text;
  if (!produced.length && /search your library for/i.test(t)) {
    const typed = Object.keys(BASIC_TYPES).filter((type) => new RegExp(`\\b${type}\\b`).test(t)).map((type) => BASIC_TYPES[type]);
    produced = typed.length ? typed.filter((c) => colors.includes(c)) : /basic land card/i.test(t) ? [...colors] : [];
  }
  return produced;
}

function choose(n, k) {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

export function probAtLeast(k, sources, seen, deck = 99) {
  let miss = 0;
  for (let i = 0; i < k; i++) miss += (choose(sources, i) * choose(deck - sources, seen - i)) / choose(deck, seen);
  return 1 - miss;
}

// Fewest sources to have `pips` of a color by turn `turn` (7 + turn cards seen) with 90% odds.
export function sourcesNeeded(pips, turn, target = 0.9) {
  const seen = 7 + turn;
  for (let s = pips; s <= 99; s++) if (probAtLeast(pips, s, seen) >= target) return s;
  return 99;
}

export function sourceTargets(entries, colors, cap) {
  const out = Object.fromEntries(colors.map((c) => [c, 0]));
  for (const { card } of entries) {
    if (isLand(card)) continue;
    const p = pipsOf(card.mana_cost);
    for (const c of colors) {
      const k = Math.ceil(p[c]);
      if (k) out[c] = Math.max(out[c], Math.min(cap, sourcesNeeded(k, Math.max(1, Math.round(card.cmc)))));
    }
  }
  return out;
}
