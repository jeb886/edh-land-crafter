export const SCRYFALL_API = "https://api.scryfall.com";
const BATCH = 75;
const CACHE_MS = 24 * 60 * 60 * 1000;
const GAP_MS = 500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchCard(name, fetchImpl = fetch) {
  const url = `${SCRYFALL_API}/cards/named?exact=${encodeURIComponent(name)}`;
  const res = await fetchImpl(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Scryfall request failed: ${res.status}`);
  }
  return res.json();
}

function slim(card) {
  const face = card.card_faces?.[0] ?? {};
  return {
    name: card.name,
    mana_cost: card.mana_cost ?? face.mana_cost ?? "",
    cmc: card.cmc ?? 0,
    type_line: card.type_line ?? face.type_line ?? "",
    oracle_text: card.oracle_text ?? card.card_faces?.map((f) => f.oracle_text).join("\n") ?? "",
    color_identity: card.color_identity ?? [],
    produced_mana: card.produced_mana ?? [],
    usd: card.prices?.usd ?? null,
    image: card.image_uris?.normal ?? face.image_uris?.normal ?? null,
    scryfall_uri: card.scryfall_uri,
  };
}

const key = (name) => `sf:${name.toLowerCase()}`;

function readEntry(storage, k, now) {
  try {
    const hit = JSON.parse(storage?.getItem(k) ?? "null");
    return hit && now - hit.t < CACHE_MS ? hit : null;
  } catch {
    return null;
  }
}

const readCache = (storage, name, now) => readEntry(storage, key(name), now)?.card ?? null;

function writeEntry(storage, k, value) {
  try {
    storage?.setItem(k, JSON.stringify(value));
  } catch {
    // storage full or unavailable
  }
}

const postWithRetry = (body, fetchImpl, wait) =>
  requestWithRetry(`${SCRYFALL_API}/cards/collection`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, fetchImpl, wait);

async function requestWithRetry(url, init, fetchImpl, wait, emptyOn404 = false) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetchImpl(url, init);
    if (emptyOn404 && res.status === 404) return { data: [] };
    if (res.status === 429 && attempt < 3) {
      const retryAfter = Number(res.headers?.get?.("Retry-After"));
      await wait(retryAfter > 0 ? retryAfter * 1000 : 2000 * 2 ** attempt);
      continue;
    }
    if (!res.ok) throw new Error(`Scryfall request failed: ${res.status}`);
    return res.json();
  }
}

export async function fetchCollection(names, opts = {}) {
  const {
    fetchImpl = fetch,
    storage = globalThis.localStorage,
    wait = sleep,
    now = Date.now(),
  } = opts;
  const cards = new Map();
  const missing = [];
  for (const name of new Set(names)) {
    const hit = readCache(storage, name, now);
    if (hit) cards.set(name.toLowerCase(), hit);
    else missing.push(name);
  }
  const notFound = [];
  for (let i = 0; i < missing.length; i += BATCH) {
    if (i > 0) await wait(GAP_MS);
    const batch = missing.slice(i, i + BATCH);
    const data = await postWithRetry({ identifiers: batch.map((name) => ({ name })) }, fetchImpl, wait);
    const byName = new Map();
    for (const raw of data.data ?? []) {
      const card = slim(raw);
      byName.set(raw.name.toLowerCase(), card);
      for (const f of raw.card_faces ?? []) byName.set(f.name.toLowerCase(), card);
    }
    for (const name of batch) {
      const card = byName.get(name.toLowerCase());
      if (!card) {
        notFound.push(name);
        continue;
      }
      cards.set(name.toLowerCase(), card);
      writeEntry(storage, key(name), { t: now, card });
    }
  }
  return { cards, notFound };
}

const PRICE_BATCH = 20;

// cheapest:usd compares all finishes, so the chosen print may only have a foil or etched price.
function cheapestFinish(prices = {}) {
  const vals = [prices.usd, prices.usd_foil, prices.usd_etched].filter((v) => v != null).map(Number);
  return vals.length ? Math.min(...vals).toFixed(2) : null;
}
const priceKey = (name) => `sfp:${name.toLowerCase()}`;

// Cheapest paper USD price per card, via `game:paper cheapest:usd` searches.
export async function fetchCheapestPrices(names, opts = {}) {
  const { fetchImpl = fetch, storage = globalThis.localStorage, wait = sleep, now = Date.now() } = opts;
  const prices = new Map();
  const missing = [];
  for (const name of new Set(names)) {
    const hit = readEntry(storage, priceKey(name), now);
    if (hit) prices.set(name.toLowerCase(), hit.usd);
    else missing.push(name);
  }
  for (let i = 0; i < missing.length; i += PRICE_BATCH) {
    if (i > 0) await wait(GAP_MS);
    const batch = missing.slice(i, i + PRICE_BATCH);
    const q = `game:paper cheapest:usd (${batch.map((n) => `!"${n.replace(/"/g, "")}"`).join(" or ")})`;
    const found = new Map();
    let url = `${SCRYFALL_API}/cards/search?q=${encodeURIComponent(q)}`;
    while (url) {
      const data = await requestWithRetry(url, { headers: { Accept: "application/json" } }, fetchImpl, wait, true);
      for (const raw of data.data ?? []) {
        const usd = cheapestFinish(raw.prices);
        found.set(raw.name.toLowerCase(), usd);
        for (const f of raw.card_faces ?? []) found.set(f.name.toLowerCase(), usd);
      }
      url = data.has_more ? data.next_page : null;
      if (url) await wait(GAP_MS);
    }
    for (const name of batch) {
      const usd = found.get(name.toLowerCase()) ?? null;
      prices.set(name.toLowerCase(), usd);
      writeEntry(storage, priceKey(name), { t: now, usd });
    }
  }
  return prices;
}
