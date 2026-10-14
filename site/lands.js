import { BASICS, landColors } from "./deck.js";

export function flattenRankings(rankings) {
  const out = [];
  for (const entry of rankings.lands) {
    for (const name of entry.cards ?? [entry.name]) out.push({ name, cycle: entry.cycle ?? null, multiplayer: !!entry.multiplayer, fiveColor: !!entry.fiveColor });
  }
  return out;
}

export const withoutBanned = (ranked, { names = [], cycles = [] }) =>
  ranked.filter((l) => !names.includes(l.name) && !(l.cycle && cycles.includes(l.cycle)));

export function rankForColors(ranked, colors) {
  return colors.length < 4 ? ranked : [...ranked.filter((l) => l.fiveColor), ...ranked.filter((l) => !l.fiveColor)];
}

const FIVE = ["W", "U", "B", "R", "G"];

export function landType(card, cycle) {
  const fetchesAnyBasic = /search your library for a basic land card/i.test(card.oracle_text) && !/Plains|Island|Swamp|Mountain|Forest/.test(card.oracle_text);
  if (FIVE.every((c) => card.produced_mana.includes(c)) || fetchesAnyBasic) return "Prismatic";
  return cycle ?? "";
}

const NONBASIC_CAP = { 1: 0, 2: 14, 3: 20, 4: 24, 5: 26 };

export function selectLands({ ranked, cards, colors, shares, total, budget = null, minBasics = 0, targets = null }) {
  const nonbasics = [];
  const sources = Object.fromEntries(colors.map((c) => [c, 0]));
  const reserved = Math.min(total, minBasics * colors.length);
  const cap = Math.min(NONBASIC_CAP[colors.length] ?? 0, total - reserved);
  for (const { name, cycle } of ranked) {
    if (nonbasics.length >= cap) break;
    const card = cards.get(name.toLowerCase());
    if (!card || !card.color_identity.every((c) => colors.includes(c))) continue;
    const produces = landColors(card, colors);
    if (produces.length < 2) continue;
    const price = card.usd == null ? null : Number(card.usd);
    if (budget != null && (price == null || price > budget)) continue;
    if (targets && !produces.some((c) => sources[c] < targets[c])) continue;
    nonbasics.push({ name: card.name, cycle, produces, price, card });
    for (const c of produces) sources[c]++;
  }
  const active = colors.filter((c) => (shares[c] ?? 0) > 0);
  const pool = targets ? colors : active.length ? active : colors;
  const basics = Object.fromEntries(colors.map((c) => [c, 0]));
  let remaining = total - nonbasics.length;
  for (const c of colors) {
    const n = Math.min(minBasics, remaining);
    basics[c] += n;
    sources[c] += n;
    remaining -= n;
  }
  for (; remaining > 0 && pool.length; remaining--) {
    let best = pool[0], bestScore = -Infinity;
    const short = targets && pool.some((c) => targets[c] > sources[c]);
    for (const c of pool) {
      const score = short ? targets[c] - sources[c] : ((targets ?? shares)[c] || 1) / (sources[c] + 1);
      if (score > bestScore) [best, bestScore] = [c, score];
    }
    basics[best]++;
    sources[best]++;
  }
  return { nonbasics, basics, sources };
}

export function sourceDistribution({ nonbasics, basics }, colors) {
  const out = Object.fromEntries(colors.map((c) => [c, basics[c] ?? 0]));
  out.any = 0;
  for (const l of nonbasics) {
    if (colors.length > 1 && colors.every((c) => l.produces.includes(c))) out.any++;
    else for (const c of l.produces) out[c]++;
  }
  return out;
}

export function exportList({ nonbasics, basics }) {
  const lines = nonbasics.map((l) => `1 ${l.name}`);
  for (const [c, n] of Object.entries(basics)) if (n) lines.push(`${n} ${BASICS[c]}`);
  return lines.join("\n");
}
