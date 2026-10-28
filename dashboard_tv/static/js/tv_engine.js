// ============================================================================
// DASHBOARD TV — STANDALONE ENGINE (GitHub Pages / Portfólio)
// ============================================================================
(function() {
  const DB = window.__TV_API_DB__ || {};

  // Sobrescreve navigateTab para navegar entre os arquivos HTML estáticos do Portfólio
  window.addEventListener("DOMContentLoaded", () => {
    window.navigateTab = function(path) {
      if (typeof pararTodosAudios === "function") {
        try { pararTodosAudios(); } catch(e) {}
      }
      const clean = path.replace(/^\//, "").replace(/\//g, "_");
      const file = (!clean || clean === "tv") ? "tv.html" : `${clean}.html`;
      window.location.href = file;
    };
  });

  const origFetch = window.fetch.bind(window);
  window.fetch = async function(input, init) {
    const rawUrl = typeof input === "string" ? input : (input && input.url ? input.url : "");
    if (rawUrl.includes("/api/")) {
      const u = new URL(rawUrl, window.location.origin);
      const pathAndQuery = u.pathname + u.search;
      const canal = u.searchParams.get("canal");
      const mes = u.searchParams.get("mes") || "10";
      const ano = u.searchParams.get("ano") || "2026";

      let payload = DB[pathAndQuery];
      if (!payload && canal) {
        payload = DB[`${u.pathname}?canal=${canal}&mes=10&ano=2026`];
      }
      if (!payload) {
        payload = DB[`${u.pathname}?mes=${mes}&ano=${ano}`] ||
                  DB[`${u.pathname}?ano=${ano}&mes=${mes}`] ||
                  DB[`${u.pathname}?mes=10&ano=2026`] ||
                  DB[`${u.pathname}?ano=2026&mes=10`] ||
                  DB[u.pathname];
      }
      if (payload !== undefined) {
        return new Response(JSON.stringify(payload), {
          status: 200, headers: { "Content-Type": "application/json" }
        });
      }
    }
    return origFetch(input, init);
  };
})();
