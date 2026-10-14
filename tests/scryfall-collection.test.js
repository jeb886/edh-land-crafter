import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchCollection } from "../site/scryfall.js";

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
