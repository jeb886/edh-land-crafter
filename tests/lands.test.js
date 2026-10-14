import { test } from "node:test";
import assert from "node:assert/strict";
import { exportList, flattenRankings, landType, rankForColors, selectLands, sourceDistribution, withoutBanned } from "../site/lands.js";
import { mulberry32, simulate } from "../site/sim.js";

const land = (name, produced_mana, color_identity = [], usd = "1.00") => ({ name, produced_mana, color_identity, oracle_text: "", usd });
const cards = new Map(
  [
    land("Command Tower", ["W", "U", "B", "R", "G"]),
    land("Tundra", ["W", "U"], ["W", "U"], "500.00"),
    land("Watery Grave", ["U", "B"], ["U", "B"]),
    land("Hallowed Fountain", ["W", "U"], ["W", "U"], "12.00"),
  ].map((c) => [c.name.toLowerCase(), c]),
);
const ranked = flattenRankings({ lands: [{ name: "Command Tower" }, { cycle: "Duals", cards: ["Tundra", "Watery Grave", "Hallowed Fountain"] }] });

test("selectLands respects colors, budget and shares", () => {
  const r = selectLands({ ranked, cards, colors: ["W", "U"], shares: { W: 25, U: 75 }, total: 36, budget: 100 });
  assert.deepEqual(r.nonbasics.map((l) => l.name), ["Command Tower", "Hallowed Fountain"]);
  assert.equal(r.basics.W + r.basics.U, 34);
  assert.ok(r.basics.U > r.basics.W * 2);
  assert.match(exportList(r), /^1 Command Tower\n1 Hallowed Fountain\n\d+ Plains\n\d+ Island$/);
});

test("selectLands skips unpriced lands when a budget is set", () => {
  const args = { ranked: [{ name: "Unpriced" }], cards: new Map([["unpriced", land("Unpriced", ["W", "U"], [], null)]]), colors: ["W", "U"], shares: { W: 50, U: 50 }, total: 36 };
  assert.equal(selectLands({ ...args, budget: 10 }).nonbasics.length, 0);
  assert.equal(selectLands(args).nonbasics.length, 1);
});

test("rankForColors lifts fiveColor lands only for four- and five-color decks", () => {
  const r = flattenRankings({ lands: [{ name: "Command Tower", fiveColor: true }, { cycle: "Shocklands", cards: ["Steam Vents"] }, { name: "Mana Confluence", fiveColor: true }] });
  assert.deepEqual(rankForColors(r, ["W", "U", "B", "R", "G"]).map((l) => l.name), ["Command Tower", "Mana Confluence", "Steam Vents"]);
  assert.deepEqual(rankForColors(r, ["U", "B", "R", "G"]).map((l) => l.name), ["Command Tower", "Mana Confluence", "Steam Vents"]);
  assert.deepEqual(rankForColors(r, ["U", "R", "G"]).map((l) => l.name), ["Command Tower", "Steam Vents", "Mana Confluence"]);
});

test("sourceDistribution counts rainbow lands as any-color and basics per color", () => {
  const result = {
    nonbasics: [{ produces: ["R", "G"] }, { produces: ["R", "G", "U"] }, { produces: ["U", "G"] }],
    basics: { R: 4, G: 3, U: 2 },
  };
  assert.deepEqual(sourceDistribution(result, ["R", "G", "U"]), { R: 5, G: 5, U: 3, any: 1 });
  assert.deepEqual(sourceDistribution({ nonbasics: [{ produces: ["R"] }], basics: { R: 1 } }, ["R"]), { R: 2, any: 0 });
});

test("withoutBanned drops blacklisted lands and cycles", () => {
  const r = flattenRankings({ lands: [{ name: "Command Tower" }, { cycle: "Shocklands", cards: ["Steam Vents", "Blood Crypt"] }, { name: "Exotic Orchard" }] });
  assert.deepEqual(withoutBanned(r, { names: ["Exotic Orchard"], cycles: ["Shocklands"] }).map((l) => l.name), ["Command Tower"]);
  assert.equal(withoutBanned(r, {}).length, 4);
});

test("selectLands keeps a minimum of basics per color", () => {
  const r = selectLands({ ranked, cards, colors: ["W", "U"], shares: { W: 0, U: 100 }, total: 36, minBasics: 3 });
  assert.equal(r.basics.W, 3);
  assert.equal(r.nonbasics.length + r.basics.W + r.basics.U, 36);
  const tight = selectLands({ ranked, cards, colors: ["W", "U"], shares: { W: 50, U: 50 }, total: 7, minBasics: 3 });
  assert.equal(tight.nonbasics.length, 1);
});

test("selectLands targets steer nonbasics and basics toward wanted sources", () => {
  const base = { ranked, cards, colors: ["W", "U", "B"], shares: { W: 40, U: 40, B: 20 }, total: 36, minBasics: 0 };
  const plain = selectLands(base);
  assert.ok(plain.nonbasics.some((l) => l.name === "Watery Grave"));
  // Black wanted at 0: the UB dual stays (it still helps blue) but no black basics are added.
  const noBlack = selectLands({ ...base, targets: { W: 20, U: 20, B: 0 } });
  assert.ok(noBlack.nonbasics.some((l) => l.name === "Watery Grave"));
  assert.equal(noBlack.basics.B, 0);
  // A dual helping no color that is short gets skipped for the next land.
  const full = selectLands({ ...base, targets: { W: 0, U: 0, B: 5 } });
  assert.ok(!full.nonbasics.some((l) => l.name === "Tundra"));
  // Raising black above its current sources pulls basics toward it.
  const moreBlack = selectLands({ ...base, targets: { W: plain.sources.W, U: plain.sources.U, B: plain.sources.B + 5 } });
  assert.ok(moreBlack.basics.B > plain.basics.B);
  assert.equal(Object.values(moreBlack.basics).reduce((a, b) => a + b, 0), Object.values(plain.basics).reduce((a, b) => a + b, 0));
});

test("landType labels five-color lands Prismatic", () => {
  assert.equal(landType(land("Command Tower", ["W", "U", "B", "R", "G"]), null), "Prismatic");
  assert.equal(landType({ produced_mana: [], oracle_text: "Search your library for a basic land card" }, null), "Prismatic");
  assert.equal(landType({ produced_mana: [], oracle_text: "Search your library for a Forest or Island card" }, "Fetchlands"), "Fetchlands");
  assert.equal(landType(land("Breeding Pool", ["G", "U"]), "Shocklands"), "Shocklands");
});

test("simulate reports land drops", () => {
  const lands = Array(37).fill(["G"]);
  const s = simulate({ lands, colors: ["G"], games: 2000, rng: mulberry32(1) });
  assert.ok(s.landDrop[0] > 0.95 && s.landDrop[4] < s.landDrop[0]);
  assert.equal(s.allColors[0], s.landDrop[0]);
});
