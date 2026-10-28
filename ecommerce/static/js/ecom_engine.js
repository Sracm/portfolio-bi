// ============================================================================
// E-COMMERCE — STANDALONE ENGINE (GitHub Pages / Portfólio)
// ============================================================================
(function() {
  const DB = window.__ECOM_DB__ || {};
  const DEFAULT_DATA = DB[window.__ECOM_DEFAULT_KEY__] || Object.values(DB)[0] || { status: "success" };

  const origFetch = window.fetch.bind(window);
  window.fetch = async function(input, init) {
    const rawUrl = typeof input === "string" ? input : (input && input.url ? input.url : "");
    if (rawUrl.includes("/api/resumo")) {
      const u = new URL(rawUrl, window.location.origin);
      const anos = u.searchParams.get("anos") || "2026";
      const meses = u.searchParams.get("meses") || "10";
      const marca = u.searchParams.get("marca") || "Todas";
      const key = `${anos}_${meses}_${marca}`;
      const fallbackKey = `2026_${meses.split(",")[0]}_Todas`;
      const payload = DB[key] || DB[fallbackKey] || DEFAULT_DATA;
      return new Response(JSON.stringify(payload), {
        status: 200, headers: { "Content-Type": "application/json" }
      });
    }
    if (rawUrl.includes("/api/sincronizar")) {
      return new Response(JSON.stringify({ status: "idle", running: false }), {
        status: 200, headers: { "Content-Type": "application/json" }
      });
    }
    return origFetch(input, init);
  };
})();
