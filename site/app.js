import { fetchCard } from "./scryfall.js";

const statusEl = document.getElementById("status");

fetchCard("Command Tower")
  .then((card) => {
    statusEl.textContent = `connected (loaded ${card.name})`;
    statusEl.className = "ok";
  })
  .catch(() => {
    statusEl.textContent = "unreachable";
    statusEl.className = "error";
  });
