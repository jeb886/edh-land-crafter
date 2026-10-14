import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchCheapestPrices, fetchCollection } from "../site/scryfall.js";

const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
};
const ok = (names) => ({ ok: true, status: 200, json: async () => ({ data: names.map((name) => ({ name, type_line: "Land", prices: {} })) }) });

test("fetchCollection batches by 75, caches, and retries 429", async () => {
  const names = Array.from({ length: 80 }, (_, i) => `Card ${i}`);
  const calls = [];
  let first = true;
  const fetchImpl = async (url, init) => {
    const ids = JSON.parse(init.body).identifiers.map((i) => i.name);
    calls.push(ids.length);
    if (first) {
      first = false;
      return { ok: false, status: 429, headers: { get: () => null } };
    }
    return ok(ids);
  };
  const storage = memoryStorage();
  const waits = [];
  const r = await fetchCollection(names, { fetchImpl, storage, wait: async (ms) => waits.push(ms) });
  assert.equal(r.cards.size, 80);
  assert.deepEqual(calls, [75, 75, 5]);
  assert.equal(waits.length, 2);
  calls.length = 0;
  await fetchCollection(names, { fetchImpl, storage, wait: async () => {} });
  assert.deepEqual(calls, []);
});

test("fetchCheapestPrices searches game:paper cheapest:usd and caches", async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(decodeURIComponent(url));
    return { ok: true, status: 200, json: async () => ({ data: [{ name: "Steam Vents", prices: { usd: "9.60" } }, { name: "Foil Only", prices: { usd: null, usd_foil: "2.66" } }] }) };
  };
  const storage = memoryStorage();
  const p = await fetchCheapestPrices(["Steam Vents", "Missing Land", "Foil Only"], { fetchImpl, storage, wait: async () => {} });
  assert.equal(p.get("steam vents"), "9.60");
  assert.equal(p.get("missing land"), null);
  assert.equal(p.get("foil only"), "2.66");
  assert.match(urls[0], /\/cards\/search\?q=game:paper cheapest:usd \(!"Steam Vents" or !"Missing Land"\)/);
  await fetchCheapestPrices(["Steam Vents", "Missing Land", "Foil Only"], { fetchImpl, storage, wait: async () => {} });
  assert.equal(urls.length, 1);
});

test("fetchCheapestPrices treats 404 as no matches", async () => {
  const p = await fetchCheapestPrices(["Nope"], { fetchImpl: async () => ({ ok: false, status: 404 }), storage: memoryStorage(), wait: async () => {} });
  assert.equal(p.get("nope"), null);
});
