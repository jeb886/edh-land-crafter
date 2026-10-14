export function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// lands: array of color arrays, one per land. Turn t sees 7 + t cards (multiplayer draws on turn 1).
export function simulate({ lands, colors, games = 10000, turns = 5, rng = Math.random }) {
  const deck = [...lands, ...Array(Math.max(0, 99 - lands.length)).fill(null)];
  const onCurve = Array(turns).fill(0);
  const allColors = Array(turns).fill(0);
  const handHist = Array(8).fill(0);
  for (let g = 0; g < games; g++) {
    for (let i = 0; i < 7 + turns; i++) {
      const j = i + Math.floor(rng() * (deck.length - i));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    handHist[deck.slice(0, 7).filter(Boolean).length]++;
    for (let t = 1; t <= turns; t++) {
      const seen = deck.slice(0, 7 + t).filter(Boolean);
      const played = seen.slice(0, t);
      if (seen.length >= t) onCurve[t - 1]++;
      const have = new Set(played.flat());
      if (colors.every((c) => have.has(c))) allColors[t - 1]++;
    }
  }
  return {
    landDrop: onCurve.map((n) => n / games),
    allColors: allColors.map((n) => n / games),
    openingHand: handHist.map((n) => n / games),
  };
}
