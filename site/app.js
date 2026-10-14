import { fetchCheapestPrices, fetchCollection, fetchPreferredImages, fetchPrintImages } from "./scryfall.js";
import { BASICS, COLORS, countPips, deckStats, parseDecklist, sharesFromPips, sourceTargets } from "./deck.js";
import { exportList, flattenRankings, landType, rankForColors, rankForMode, selectLands, withoutCycles } from "./lands.js";
import { simulate } from "./sim.js";

const $ = (id) => document.getElementById(id);
const COLOR_NAMES = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" };
const state = {};

$("colors").innerHTML = COLORS.map(
  (c) => `<label class="pip pip-${c}"><input type="checkbox" value="${c}" /> ${COLOR_NAMES[c]}</label>`,
).join("");

const BASIC_PRINTS = [
  { set: "fra", collector_number: "282" },
  { set: "fra", collector_number: "284" },
  { set: "fra", collector_number: "286" },
  { set: "fra", collector_number: "288" },
  { set: "fra", collector_number: "290" },
  { set: "ogw", collector_number: "183a" },
];

const pct = (x) => `${Math.round(x * 100)}%`;

function setStatus(text, cls = "") {
  $("status").textContent = text;
  $("status").className = cls;
}

async function loadRankings() {
  state.ranked ??= flattenRankings(await (await fetch("data/land-rankings.json")).json());
  return state.ranked;
}

$("deck-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const entries = parseDecklist($("decklist").value);
  if (!entries.length) return setStatus("Paste a decklist first.", "error");
  setStatus("Looking up cards on Scryfall…");
  try {
    const ranked = await loadRankings();
    const { cards, notFound } = await fetchCollection([...entries.map((e) => e.name), ...ranked.map((l) => l.name), ...Object.values(BASICS)]);
    setStatus("Looking up cheapest paper prices…");
    const prices = await fetchCheapestPrices(ranked.map((l) => l.name));
    setStatus("Looking up card art…");
    const images = await fetchPreferredImages(ranked.map((l) => l.name));
    const basicImages = await fetchPrintImages(BASIC_PRINTS);
    for (const l of ranked) {
      const k = l.name.toLowerCase();
      if (cards.has(k)) cards.set(k, { ...cards.get(k), usd: prices.get(k) ?? null, image: images.get(k) ?? cards.get(k).image });
    }
    for (const [k, image] of basicImages) if (cards.has(k) && image) cards.set(k, { ...cards.get(k), image });
    const deck = entries.map((e) => ({ ...e, card: cards.get(e.name.toLowerCase()) })).filter((e) => e.card);
    const picked = [...document.querySelectorAll("#colors input:checked")].map((i) => i.value);
    const colors = picked.length ? picked : COLORS.filter((c) => deck.some((e) => e.card.color_identity.includes(c)));
    if (!picked.length) document.querySelectorAll("#colors input").forEach((i) => (i.checked = colors.includes(i.value)));
    if (!colors.length) return setStatus("Couldn't detect colors; pick your commander's colors.", "error");
    const pips = countPips(deck);
    Object.assign(state, { deck, cards, colors, pips, shares: sharesFromPips(pips, colors), stats: deckStats(deck) });
    const deckNames = new Set(entries.map((e) => e.name));
    const missing = notFound.filter((n) => deckNames.has(n));
    setStatus(missing.length ? `Not found on Scryfall: ${missing.join(", ")}` : "", missing.length ? "error" : "ok");
    render();
  } catch (err) {
    setStatus(`Scryfall lookup failed (${err.message}). Try again in a minute.`, "error");
  }
});

for (const id of ["land-count", "budget", "min-basics", "multiplayer", "original-duals", "fetchlands"]) $(id).addEventListener("change", () => state.deck && render());

function render() {
  const { deck, cards, colors, pips, shares, stats, ranked } = state;
  const total = Number($("land-count").value) || stats.landCount;
  const budget = $("budget").value === "" ? null : Number($("budget").value);
  const minBasics = Number($("min-basics").value) || 0;
  const excluded = [["original-duals", "Original duals"], ["fetchlands", "Fetchlands"]].filter(([id]) => !$(id).checked).map(([, cycle]) => cycle);
  const result = selectLands({ ranked: rankForColors(rankForMode(withoutCycles(ranked, excluded), $("multiplayer").checked), colors), cards, colors, shares, total, budget, minBasics });
  const targets = sourceTargets(deck, colors, total);

  $("results").hidden = false;
  $("empty").hidden = true;
  $("stats").textContent = `${stats.spells} nonland cards, average mana value ${stats.avgMv.toFixed(2)}, ${stats.rampDraw} cheap ramp/draw spells. Recommended lands: ${stats.landCount}.`;
  $("color-table").tBodies[0].innerHTML = colors
    .map(
      (c) => `<tr><td class="pip-${c}">${COLOR_NAMES[c]}</td><td>${pips[c].toFixed(1)}</td>
      <td><input type="range" min="0" max="100" value="${shares[c]}" data-color="${c}" /> <span>${shares[c]}%</span></td>
      <td>${result.sources[c]}</td><td class="${result.sources[c] >= targets[c] ? "ok" : "error"}">${targets[c]}</td></tr>`,
    )
    .join("");
  document.querySelectorAll("#color-table input[type=range]").forEach((input) =>
    input.addEventListener("change", () => {
      state.shares[input.dataset.color] = Number(input.value);
      render();
    }),
  );

  const landCount = result.nonbasics.length + Object.values(result.basics).reduce((a, b) => a + b, 0);
  $("land-total").textContent = landCount;
  $("land-list").innerHTML = [
    ...result.nonbasics.map(
      (l) => `<li><a href="${l.card.scryfall_uri}" target="_blank" rel="noopener" data-image="${l.card.image ?? ""}">${l.name}</a>
        <small>${landType(l.card, l.cycle)} ${l.price == null ? "" : `$${l.price.toFixed(2)}`}</small></li>`,
    ),
    ...Object.entries(result.basics).filter(([, n]) => n).map(([c, n]) => `<li>${n} ${BASICS[c]}</li>`),
  ].join("");
  $("export").value = exportList(result);
  const tile = (card, label, type, count = 1) =>
    `<a class="tile" href="${card?.scryfall_uri ?? "#"}" target="_blank" rel="noopener" title="${label}">
      ${card?.image ? `<img src="${card.image}" alt="${label}" loading="lazy" />` : `<span>${label}</span>`}
      ${count > 1 ? `<b>×${count}</b>` : ""}<small>${type}</small></a>`;
  $("land-cards").innerHTML = [
    ...result.nonbasics.map((l) => tile(l.card, l.name, landType(l.card, l.cycle))),
    ...Object.entries(result.basics).filter(([, n]) => n).map(([c, n]) => tile(cards.get(BASICS[c].toLowerCase()), BASICS[c], "Basic", n)),
  ].join("");

  const lands = [...result.nonbasics.map((l) => l.produces), ...Object.entries(result.basics).flatMap(([c, n]) => Array(n).fill([c]))];
  const sim = simulate({ lands, colors });
  $("sim").innerHTML = `<table><thead><tr><th>Turn</th>${sim.landDrop.map((_, i) => `<th>${i + 1}</th>`).join("")}</tr></thead><tbody>
    <tr><td>Hit land drop</td>${sim.landDrop.map((p) => `<td>${pct(p)}</td>`).join("")}</tr>
    <tr><td>All colors available</td>${sim.allColors.map((p) => `<td>${pct(p)}</td>`).join("")}</tr></tbody></table>
    <p>Opening hand lands: ${sim.openingHand.map((p, n) => `${n}: ${pct(p)}`).join(" · ")}</p>
    <p><small>10,000 simulated games; assumes one land played per turn and no mulligans.</small></p>`;
}

$("copy").addEventListener("click", () => navigator.clipboard.writeText($("export").value));

const preview = $("preview");
$("land-list").addEventListener("mouseover", (e) => {
  const src = e.target.dataset?.image;
  if (!src) return;
  preview.src = src;
  preview.alt = e.target.textContent;
  preview.hidden = false;
});
$("land-list").addEventListener("mousemove", (e) => {
  preview.style.left = `${e.clientX + 16}px`;
  preview.style.top = `${Math.max(8, e.clientY - 160)}px`;
});
$("land-list").addEventListener("mouseout", () => (preview.hidden = true));

const loadExample = (replace) =>
  fetch(`data/${$("example").value}`)
    .then((r) => (r.ok ? r.text() : ""))
    .then((text) => {
      if (text && (replace || !$("decklist").value)) $("decklist").value = text;
    });
loadExample(false);
$("example").addEventListener("change", () => loadExample(true));

const sizeInput = $("tile-size");
const setTileSize = (px) => $("land-cards").style.setProperty("--tile-size", `${px}px`);
sizeInput.value = localStorage.getItem("tileSize") ?? sizeInput.value;
setTileSize(sizeInput.value);
sizeInput.addEventListener("input", () => {
  setTileSize(sizeInput.value);
  localStorage.setItem("tileSize", sizeInput.value);
});
