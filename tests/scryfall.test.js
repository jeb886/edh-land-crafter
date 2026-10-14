import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchCard } from "../site/scryfall.js";

function fakeFetch(response) {
  const calls = [];
  const impl = async (url, options) => {
    calls.push({ url, options });
    return response;
  };
  return { impl, calls };
}

test("fetchCard requests the exact card name", async () => {
  const { impl, calls } = fakeFetch({ ok: true, json: async () => ({ name: "Command Tower" }) });
  const card = await fetchCard("Command Tower", impl);
  assert.equal(card.name, "Command Tower");
  assert.equal(calls[0].url, "https://api.scryfall.com/cards/named?exact=Command%20Tower");
});

test("fetchCard throws on a non-OK response", async () => {
  const { impl } = fakeFetch({ ok: false, status: 404 });
  await assert.rejects(fetchCard("Not A Card", impl), /404/);
});
