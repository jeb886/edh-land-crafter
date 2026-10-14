export const SCRYFALL_API = "https://api.scryfall.com";

export async function fetchCard(name, fetchImpl = fetch) {
  const url = `${SCRYFALL_API}/cards/named?exact=${encodeURIComponent(name)}`;
  const res = await fetchImpl(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Scryfall request failed: ${res.status}`);
  }
  return res.json();
}
