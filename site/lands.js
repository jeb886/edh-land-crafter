import { BASICS, landColors } from "./deck.js";

export function flattenRankings(rankings) {
  const out = [];
  for (const entry of rankings.lands) {
    for (const name of entry.cards ?? [entry.name]) out.push({ name, cycle: entry.cycle ?? null });
  }
  return out;
}

const NONBASIC_CAP = { 1: 0, 2: 14, 3: 20, 4: 24, 5: 26 };

export function selectLands({ ranked, cards, colors, shares, total, budget = null }) {
  const nonbasics = [];
  const cap = Math.min(NONBASIC_CAP[colors.length] ?? 0, total);
  for (const { name, cycle } of ranked) {
    if (nonbasics.length >= cap) break;
    const card = cards.get(name.toLowerCase());
    if (!card || !card.color_identity.every((c) => colors.includes(c))) continue;
    const produces = landColors(card, colors);
    if (produces.length < 2) continue;
    const price = card.usd == null ? null : Number(card.usd);
    if (budget != null && price != null && price > budget) continue;
    nonbasics.push({ name: card.name, cycle, produces, price, card });
  }
  const sources = Object.fromEntries(colors.map((c) => [c, 0]));
  for (const l of nonbasics) for (const c of l.produces) sources[c]++;
  const active = colors.filter((c) => (shares[c] ?? 0) > 0);
  const pool = active.length ? active : colors;
  const basics = Object.fromEntries(colors.map((c) => [c, 0]));
  for (let i = nonbasics.length; i < total && pool.length; i++) {
    let best = pool[0], bestScore = -1;
    for (const c of pool) {
      const score = (shares[c] || 1) / (sources[c] + 1);
      if (score > bestScore) [best, bestScore] = [c, score];
    }
    basics[best]++;
    sources[best]++;
  }
  return { nonbasics, basics, sources };
}

export function exportList({ nonbasics, basics }) {
  const lines = nonbasics.map((l) => `1 ${l.name}`);
  for (const [c, n] of Object.entries(basics)) if (n) lines.push(`${n} ${BASICS[c]}`);
  return lines.join("\n");
}
