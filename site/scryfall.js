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

function readCache(storage, name, now) {
  try {
    const hit = JSON.parse(storage?.getItem(key(name)) ?? "null");
    return hit && now - hit.t < CACHE_MS ? hit.card : null;
  } catch {
    return null;
  }
}

async function postWithRetry(body, fetchImpl, wait) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetchImpl(`${SCRYFALL_API}/cards/collection`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
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
      try {
        storage?.setItem(key(name), JSON.stringify({ t: now, card }));
      } catch {
        // storage full or unavailable
      }
    }
  }
  return { cards, notFound };
}
