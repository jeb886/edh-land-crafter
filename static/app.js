const statusEl = document.getElementById("status");

fetch("/api/health")
  .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
  .then((data) => {
    statusEl.textContent = data.status;
    statusEl.className = "ok";
  })
  .catch(() => {
    statusEl.textContent = "unreachable";
    statusEl.className = "error";
  });
