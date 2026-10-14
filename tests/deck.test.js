import { test } from "node:test";
import assert from "node:assert/strict";
import { countPips, landColors, parseDecklist, pipsOf, recommendLandCount, sharesFromPips, sourcesNeeded } from "../site/deck.js";

test("parseDecklist handles quantities, set codes, headers and DFCs", () => {
  const text = "Commander\n1 Atraxa, Praetors' Voice\n1x Sol Ring (C21) 263 *F*\n\n// comment\nDelver of Secrets // Insectile Aberration\n2 Island";
  assert.deepEqual(parseDecklist(text), [
    { qty: 1, name: "Atraxa, Praetors' Voice" },
    { qty: 1, name: "Sol Ring" },
    { qty: 1, name: "Delver of Secrets" },
    { qty: 2, name: "Island" },
  ]);
});

test("pipsOf splits hybrid and counts phyrexian", () => {
  assert.deepEqual(pipsOf("{2}{W}{W}{W/U}{B/P}"), { W: 2.5, U: 0.5, B: 1, R: 0, G: 0 });
});

test("countPips skips lands and multiplies quantity", () => {
  const deck = [
    { qty: 2, card: { mana_cost: "{G}{G}", type_line: "Creature" } },
    { qty: 1, card: { mana_cost: "", type_line: "Land" } },
  ];
  assert.equal(countPips(deck).G, 4);
  assert.deepEqual(sharesFromPips({ W: 1, U: 3, B: 0, R: 0, G: 0 }, ["W", "U"]), { W: 25, U: 75 });
});

test("recommendLandCount clamps to 35-38", () => {
  assert.equal(recommendLandCount(1, 30), 35);
  assert.equal(recommendLandCount(3.5, 10), 38);
  assert.equal(recommendLandCount(3, 8), 38);
  assert.equal(recommendLandCount(2.5, 10), 36);
});

test("landColors reads produced mana and fetch targets", () => {
  const card = (produced_mana, oracle_text = "") => ({ produced_mana, oracle_text });
  assert.deepEqual(landColors(card(["W", "U", "B", "R", "G"]), ["U", "G"]), ["U", "G"]);
  assert.deepEqual(landColors(card([], "Search your library for an Island or Swamp card"), ["U", "B"]), ["U", "B"]);
  assert.deepEqual(landColors(card([], "Search your library for a basic land card"), ["R", "G"]), ["R", "G"]);
});

test("sourcesNeeded grows with pips", () => {
  assert.ok(sourcesNeeded(2, 2) > sourcesNeeded(1, 2));
  assert.ok(sourcesNeeded(1, 5) < sourcesNeeded(1, 1));
});

test("parseDecklist reads the Doran sample deck", async () => {
  const { readFile } = await import("node:fs/promises");
  const entries = parseDecklist(await readFile(new URL("../site/data/doran.txt", import.meta.url), "utf8"));
  assert.equal(entries.reduce((s, e) => s + e.qty, 0), 63);
  assert.equal(entries[0].name, "Doran, Besieged by Time");
});

test("parseDecklist reads the Miirym sample deck (lands removed, MDFC spells kept)", async () => {
  const { readFile } = await import("node:fs/promises");
  const entries = parseDecklist(await readFile(new URL("../site/data/miirym.txt", import.meta.url), "utf8"));
  assert.equal(entries.reduce((s, e) => s + e.qty, 0), 65);
  assert.ok(entries.some((e) => e.name === "Bala Ged Recovery"));
  assert.ok(!entries.some((e) => /Pathway|Forest|Command Tower/.test(e.name)));
});

test("parseDecklist reads the Garth sample deck", async () => {
  const { readFile } = await import("node:fs/promises");
  const entries = parseDecklist(await readFile(new URL("../site/data/garth.txt", import.meta.url), "utf8"));
  assert.equal(entries.reduce((s, e) => s + e.qty, 0), 62);
  assert.ok(entries.some((e) => e.name === "Garth One-Eye"));
});
