import { test } from "node:test";
import assert from "node:assert/strict";
import { exportList, flattenRankings, selectLands } from "../site/lands.js";
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

test("simulate reports land drops", () => {
  const lands = Array(37).fill(["G"]);
  const s = simulate({ lands, colors: ["G"], games: 2000, rng: mulberry32(1) });
  assert.ok(s.landDrop[0] > 0.95 && s.landDrop[4] < s.landDrop[0]);
  assert.equal(s.allColors[0], s.landDrop[0]);
});
