import { test } from "node:test";
import assert from "node:assert/strict";
import { exportList, flattenRankings, landType, rankForMode, selectLands, withoutCycles } from "../site/lands.js";
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

test("withoutCycles drops excluded cycles", () => {
  const r = flattenRankings({ lands: [{ name: "Command Tower" }, { cycle: "Original duals", cards: ["Tundra"] }, { cycle: "Fetchlands", cards: ["Flooded Strand"] }] });
  assert.deepEqual(withoutCycles(r, ["Original duals"]).map((l) => l.name), ["Command Tower", "Flooded Strand"]);
});

test("selectLands keeps a minimum of basics per color", () => {
  const r = selectLands({ ranked, cards, colors: ["W", "U"], shares: { W: 0, U: 100 }, total: 36, minBasics: 3 });
  assert.equal(r.basics.W, 3);
  assert.equal(r.nonbasics.length + r.basics.W + r.basics.U, 36);
  const tight = selectLands({ ranked, cards, colors: ["W", "U"], shares: { W: 50, U: 50 }, total: 7, minBasics: 3 });
  assert.equal(tight.nonbasics.length, 1);
});

test("rankForMode moves multiplayer-only lands last when off", () => {
  const r = flattenRankings({ lands: [{ name: "A" }, { cycle: "Bond", multiplayer: true, cards: ["B"] }, { name: "C" }] });
  assert.deepEqual(rankForMode(r, true).map((l) => l.name), ["A", "B", "C"]);
  assert.deepEqual(rankForMode(r, false).map((l) => l.name), ["A", "C", "B"]);
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
