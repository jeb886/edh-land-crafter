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

const imageOf = (card) => card.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.normal ?? null;

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
    image: imageOf(card),
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
  // Universes Beyond flavor names (e.g. "Balin's Tomb" = Ancient Tomb) only resolve via fuzzy lookup.
  const unresolved = [];
  for (const name of notFound) {
    await wait(GAP_MS);
    const url = `${SCRYFALL_API}/cards/named?fuzzy=${encodeURIComponent(name)}`;
    const res = await fetchImpl(url, { headers: { Accept: "application/json" } });
    const raw = res.ok ? await res.json() : null;
    const matches = (s) => s?.toLowerCase() === name.toLowerCase();
    if (raw && (matches(raw.flavor_name) || matches(raw.name) || raw.card_faces?.some((f) => matches(f.flavor_name) || matches(f.name)))) {
      const card = slim(raw);
      cards.set(name.toLowerCase(), card);
      writeEntry(storage, key(name), { t: now, card });
    } else unresolved.push(name);
  }
  return { cards, notFound: unresolved };
}

const PRICE_BATCH = 20;

// cheapest:usd compares all finishes, so the chosen print may only have a foil or etched price.
function cheapestFinish(prices = {}) {
  const vals = [prices.usd, prices.usd_foil, prices.usd_etched].filter((v) => v != null).map(Number);
  return vals.length ? Math.min(...vals).toFixed(2) : null;
}
const priceKey = (name) => `sfp:${name.toLowerCase()}`;

// Cheapest paper USD price per card, via `game:paper cheapest:usd` searches.
export const fetchCheapestPrices = (names, opts) =>
  searchByName(names, "game:paper cheapest:usd", (raw) => cheapestFinish(raw.prices), priceKey, opts);

// Image of a black-border, 2015-frame paper printing when one exists.
export const fetchPreferredImages = (names, opts) =>
  searchByName(names, "game:paper border:black frame:2015", imageOf, (n) => `sfi:${n.toLowerCase()}`, opts);

async function searchByName(names, filter, pick, cacheKey, opts = {}) {
  const { fetchImpl = fetch, storage = globalThis.localStorage, wait = sleep, now = Date.now() } = opts;
  const results = new Map();
  const missing = [];
  for (const name of new Set(names)) {
    const hit = readEntry(storage, cacheKey(name), now);
    if (hit) results.set(name.toLowerCase(), hit.value);
    else missing.push(name);
  }
  for (let i = 0; i < missing.length; i += PRICE_BATCH) {
    if (i > 0) await wait(GAP_MS);
    const batch = missing.slice(i, i + PRICE_BATCH);
    const q = `${filter} (${batch.map((n) => `!"${n.replace(/"/g, "")}"`).join(" or ")})`;
    const found = new Map();
    let url = `${SCRYFALL_API}/cards/search?q=${encodeURIComponent(q)}`;
    while (url) {
      const data = await requestWithRetry(url, { headers: { Accept: "application/json" } }, fetchImpl, wait, true);
      for (const raw of data.data ?? []) {
        const value = pick(raw);
        found.set(raw.name.toLowerCase(), value);
        for (const f of raw.card_faces ?? []) found.set(f.name.toLowerCase(), value);
      }
      url = data.has_more ? data.next_page : null;
      if (url) await wait(GAP_MS);
    }
    for (const name of batch) {
      const value = found.get(name.toLowerCase()) ?? null;
      results.set(name.toLowerCase(), value);
      writeEntry(storage, cacheKey(name), { t: now, value });
    }
  }
  return results;
}

// Images for specific printings, e.g. { set: "fra", collector_number: "290" }; keyed by card name.
export async function fetchPrintImages(prints, opts = {}) {
  const { fetchImpl = fetch, storage = globalThis.localStorage, wait = sleep, now = Date.now() } = opts;
  const k = (p) => `sfx:${p.set}/${p.collector_number}`;
  const images = new Map();
  const missing = [];
  for (const p of prints) {
    const hit = readEntry(storage, k(p), now);
    if (hit) images.set(hit.name.toLowerCase(), hit.image);
    else missing.push(p);
  }
  for (let i = 0; i < missing.length; i += BATCH) {
    if (i > 0) await wait(GAP_MS);
    const batch = missing.slice(i, i + BATCH);
    const data = await postWithRetry({ identifiers: batch.map(({ set, collector_number }) => ({ set, collector_number })) }, fetchImpl, wait);
    for (const raw of data.data ?? []) {
      const image = imageOf(raw);
      images.set(raw.name.toLowerCase(), image);
      writeEntry(storage, k({ set: raw.set, collector_number: raw.collector_number }), { t: now, name: raw.name, image });
    }
  }
  return images;
}
