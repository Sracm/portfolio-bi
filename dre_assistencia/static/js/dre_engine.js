// ============================================================================
// DRE ASSISTÊNCIA TÉCNICA & SAC — STANDALONE ENGINE (Vercel / GitHub Pages)
// Executa exatamente as mesmas queries e regras DAX/SQL do backend Flask
// ============================================================================
(function() {
  const DB = window.__DRE_ASSISTENCIA_DB__;
  const ALLOWED_CENCS = [2010000, 3000000, 3010000];
  const MESES_LISTA = [
    { NUM: 1, NOME: "Janeiro" }, { NUM: 2, NOME: "Fevereiro" },
    { NUM: 3, NOME: "Março" }, { NUM: 4, NOME: "Abril" },
    { NUM: 5, NOME: "Maio" }, { NUM: 6, NOME: "Junho" },
    { NUM: 7, NOME: "Julho" }, { NUM: 8, NOME: "Agosto" },
    { NUM: 9, NOME: "Setembro" }, { NUM: 10, NOME: "Outubro" },
    { NUM: 11, NOME: "Novembro" }, { NUM: 12, NOME: "Dezembro" }
  ];
  const SHORT_MESES = {
    1: "Jan", 2: "Fev", 3: "Mar", 4: "Abr", 5: "Mai", 6: "Jun",
    7: "Jul", 8: "Ago", 9: "Set", 10: "Out", 11: "Nov", 12: "Dez"
  };

  function parseIntList(raw, defVal) {
    if (!raw || raw === "ALL") return defVal ? [...defVal] : [];
    const out = [];
    String(raw).split(",").forEach(part => {
      const p = part.trim();
      if (p && p !== "ALL") {
        const n = parseInt(p, 10);
        if (!isNaN(n)) out.push(n);
      }
    });
    return out.length ? out : (defVal ? [...defVal] : []);
  }

  function resolveCencs(cencRaw) {
    const req = parseIntList(cencRaw, []);
    if (!req.length) return [...ALLOWED_CENCS];
    const inter = req.filter(c => ALLOWED_CENCS.includes(c));
    return inter.length ? inter : [...ALLOWED_CENCS];
  }

  function calcVar(r, b) {
    if (b === null || b === undefined || Math.abs(b) < 0.001) return null;
    return Number((((r - b) / Math.abs(b)) * 100).toFixed(1));
  }

  function calcRo(r, o) {
    if (!o || Math.abs(o) < 0.001) return null;
    return Number((((r - o) / Math.abs(o)) * 100).toFixed(1));
  }

  function handleFiltros() {
    return {
      anos: DB.anos,
      meses: MESES_LISTA,
      empresas: [{ CODEMP: "Consolidação", NOME: "Consolidação" }],
      centros: DB.centros,
      regionais: [],
      regional_ativa: "assistencia",
      usuario_autenticado: {
        usuario: "",
        canal: "Assistência Técnica & SAC",
        is_admin: false,
        total_centros: DB.centros.length
      }
    };
  }

  function handleVersao() {
    return DB.versao_info;
  }

  function handleDre(params) {
    const anos = parseIntList(params.get("ano"), [2026]);
    const meses = parseIntList(params.get("mes"), [9]);
    const cencs = new Set(resolveCencs(params.get("cenc")));

    const anoPrimario = Math.max(...anos);
    const mesPrimario = Math.max(...meses);
    const anoMom = mesPrimario > 1 ? anoPrimario : anoPrimario - 1;
    const mesMom = mesPrimario > 1 ? mesPrimario - 1 : 12;
    const anoYoy = anoPrimario - 1;

    const anosSet = new Set(anos);
    const mesesSet = new Set(meses);
    const mesesYtdSet = new Set();
    for (let m = 1; m <= mesPrimario; m++) mesesYtdSet.add(m);

    // Agrupa por bloco|titulo|descrnat
    const groups = new Map();

    for (let i = 0; i < DB.rows.length; i++) {
      const row = DB.rows[i];
      const ano = row[0], mes = row[1], cenc = row[2];
      if (!cencs.has(cenc)) continue;

      const inAnos = anosSet.has(ano);
      const inMeses = mesesSet.has(mes);
      const inYtd = mesesYtdSet.has(mes);
      const isMom = (ano === anoMom && mes === mesMom);
      const isYoyYear = (ano === anoYoy);

      if (!( (inAnos && inYtd) || (isYoyYear && inYtd) || isMom )) continue;

      const bIdx = row[3], tIdx = row[4], dIdx = row[5];
      const orc = row[7], real = row[8];
      const key = `${bIdx}|${tIdx}|${dIdx}`;

      let g = groups.get(key);
      if (!g) {
        g = {
          bloco: DB.blocos[bIdx],
          titulo: DB.titulos[tIdx],
          descrnat: DB.descrnats[dIdx],
          realizado: 0,
          orcado: 0,
          real_mom: 0,
          orc_mom: 0,
          real_yoy: 0,
          real_ytd: 0,
          real_ytd_ant: 0
        };
        groups.set(key, g);
      }

      if (inAnos && inMeses) {
        g.realizado += real;
        g.orcado += orc;
      }
      if (isMom) {
        g.real_mom += real;
        g.orc_mom += orc;
      }
      if (isYoyYear && inMeses) {
        g.real_yoy += real;
      }
      if (inAnos && inYtd) {
        g.real_ytd += real;
      }
      if (isYoyYear && inYtd) {
        g.real_ytd_ant += real;
      }
    }

    const sortedRows = Array.from(groups.values())
      .filter(g => Math.abs(g.realizado) >= 0.001 || Math.abs(g.orcado) >= 0.001)
      .sort((a, b) =>
        a.bloco.localeCompare(b.bloco) ||
        a.titulo.localeCompare(b.titulo) ||
        a.descrnat.localeCompare(b.descrnat)
      );

    let bonifTotal = 0;
    const blocosMap = new Map();

    for (const r of sortedRows) {
      if (r.titulo && r.titulo.toLowerCase().includes("bonif")) {
        bonifTotal += r.realizado;
      }
      let bd = blocosMap.get(r.bloco);
      if (!bd) {
        bd = {
          bloco: r.bloco,
          realizado: 0, orcado: 0, real_mom: 0, orc_mom: 0,
          real_yoy: 0, real_ytd: 0, real_ytd_ant: 0,
          titulos: new Map()
        };
        blocosMap.set(r.bloco, bd);
      }
      let td = bd.titulos.get(r.titulo);
      if (!td) {
        td = {
          titulo: r.titulo,
          realizado: 0, orcado: 0, real_mom: 0, orc_mom: 0,
          real_yoy: 0, real_ytd: 0, real_ytd_ant: 0,
          linhas: []
        };
        bd.titulos.set(r.titulo, td);
      }
      td.linhas.push({
        descr: r.descrnat,
        realizado: r.realizado,
        orcado: r.orcado,
        real_mom: r.real_mom,
        orc_mom: r.orc_mom,
        real_yoy: r.real_yoy,
        real_ytd: r.real_ytd,
        real_ytd_ant: r.real_ytd_ant
      });

      td.realizado += r.realizado;
      td.orcado += r.orcado;
      td.real_mom += r.real_mom;
      td.orc_mom += r.orc_mom;
      td.real_yoy += r.real_yoy;
      td.real_ytd += r.real_ytd;
      td.real_ytd_ant += r.real_ytd_ant;

      bd.realizado += r.realizado;
      bd.orcado += r.orcado;
      bd.real_mom += r.real_mom;
      bd.orc_mom += r.orc_mom;
      bd.real_yoy += r.real_yoy;
      bd.real_ytd += r.real_ytd;
      bd.real_ytd_ant += r.real_ytd_ant;
    }

    let vbReal = 0, vbOrc = 0;
    for (const bd of blocosMap.values()) {
      for (const td of bd.titulos.values()) {
        if (td.titulo.toLowerCase().includes("venda bruta")) {
          vbReal = td.realizado;
          vbOrc = td.orcado;
          break;
        }
      }
      if (vbReal) break;
    }
    const hasVb = Boolean(vbReal && Math.abs(vbReal) > 1.0);
    if (!vbReal) vbReal = 1.0;
    if (!vbOrc) vbOrc = 1.0;

    function pct(n, d) {
      if (!hasVb || !d || Math.abs(d) <= 1.0) return null;
      return Number(((n / d) * 100).toFixed(1));
    }

    let mReal = 0, mOrc = 0, mRealMom = 0, mOrcMom = 0, mYoy = 0, mYtd = 0, mYtdAnt = 0;
    for (const bd of blocosMap.values()) {
      mReal += bd.realizado;
      mOrc += bd.orcado;
      mRealMom += bd.real_mom;
      mOrcMom += bd.orc_mom;
      mYoy += bd.real_yoy;
      mYtd += bd.real_ytd;
      mYtdAnt += bd.real_ytd_ant;
    }

    const result = [];
    if (blocosMap.size > 0) {
      result.push({
        bloco: "MARGEM DE CONTRIBUIÇÃO",
        is_total: true,
        realizado: mReal,
        orcado: mOrc,
        real_mom: mRealMom,
        orc_mom: mOrcMom,
        mom: calcVar(mReal, mRealMom),
        yoy: calcVar(mReal, mYoy),
        ytd_yoy: calcVar(mYtd, mYtdAnt),
        pct_real: pct(mReal, vbReal),
        pct_orc: pct(mOrc, vbOrc),
        ro: calcRo(mReal, mOrc),
        titulos: []
      });
    }

    for (const bd of blocosMap.values()) {
      const titulosOut = [];
      for (const td of bd.titulos.values()) {
        const linhasOut = td.linhas.map(ln => ({
          descr: ln.descr,
          realizado: ln.realizado,
          orcado: ln.orcado,
          mom: calcVar(ln.realizado, ln.real_mom),
          yoy: calcVar(ln.realizado, ln.real_yoy),
          ytd_yoy: calcVar(ln.real_ytd, ln.real_ytd_ant),
          pct_real: pct(ln.realizado, vbReal),
          pct_orc: pct(ln.orcado, vbOrc),
          ro: calcRo(ln.realizado, ln.orcado)
        }));
        titulosOut.push({
          titulo: td.titulo,
          realizado: td.realizado,
          orcado: td.orcado,
          real_mom: td.real_mom,
          orc_mom: td.orc_mom,
          mom: calcVar(td.realizado, td.real_mom),
          yoy: calcVar(td.realizado, td.real_yoy),
          ytd_yoy: calcVar(td.real_ytd, td.real_ytd_ant),
          pct_real: pct(td.realizado, vbReal),
          pct_orc: pct(td.orcado, vbOrc),
          ro: calcRo(td.realizado, td.orcado),
          linhas: linhasOut
        });
      }
      result.push({
        bloco: bd.bloco,
        realizado: bd.realizado,
        orcado: bd.orcado,
        real_mom: bd.real_mom,
        orc_mom: bd.orc_mom,
        mom: calcVar(bd.realizado, bd.real_mom),
        yoy: calcVar(bd.realizado, bd.real_yoy),
        ytd_yoy: calcVar(bd.real_ytd, bd.real_ytd_ant),
        pct_real: pct(bd.realizado, vbReal),
        pct_orc: pct(bd.orcado, vbOrc),
        ro: calcRo(bd.realizado, bd.orcado),
        titulos: titulosOut
      });
    }

    return { dre: result, bonif_total: bonifTotal };
  }

  function handleMensal(params) {
    const anos = new Set(parseIntList(params.get("ano"), [2026]));
    const cencs = new Set(resolveCencs(params.get("cenc")));
    const fBloco = params.get("bloco") || null;
    const fTitulo = params.get("titulo") || null;
    const fDescr = params.get("descrnat") || null;

    const map = new Map();
    for (let i = 0; i < DB.rows.length; i++) {
      const row = DB.rows[i];
      const ano = row[0], mes = row[1], cenc = row[2];
      if (!anos.has(ano) || !cencs.has(cenc)) continue;

      const bloco = DB.blocos[row[3]];
      const titulo = DB.titulos[row[4]];
      const descr = DB.descrnats[row[5]];

      if (fDescr) {
        if (descr !== fDescr) continue;
        if (fTitulo && titulo !== fTitulo) continue;
        if (fBloco && bloco !== fBloco) continue;
      } else if (fTitulo) {
        if (titulo !== fTitulo) continue;
        if (fBloco && bloco !== fBloco) continue;
      } else if (fBloco && fBloco.toUpperCase() !== "MARGEM DE CONTRIBUIÇÃO") {
        if (bloco !== fBloco) continue;
      }

      const key = `${mes}|${bloco}`;
      let item = map.get(key);
      if (!item) {
        item = { MES: mes, BLOCO: bloco, REALIZADO: 0, ORCADO: 0 };
        map.set(key, item);
      }
      item.ORCADO += row[7];
      item.REALIZADO += row[8];
    }

    const mensal = Array.from(map.values()).sort((a, b) =>
      a.MES - b.MES || a.BLOCO.localeCompare(b.BLOCO)
    );
    return { mensal };
  }

  function handleDetalhe(params) {
    const anos = parseIntList(params.get("ano"), [2026]);
    const ano = Math.max(...anos);
    const mesesAtivos = parseIntList(params.get("mes"), [1,2,3,4,5,6,7,8,9,10,11,12]);
    const cencs = new Set(resolveCencs(params.get("cenc")));
    const q = (params.get("q") || "").trim().toLowerCase();

    const mesPrimario = Math.max(...mesesAtivos);
    const anoMom = mesPrimario > 1 ? ano : ano - 1;
    const mesMom = mesPrimario > 1 ? mesPrimario - 1 : 12;
    const anoYoy = ano - 1;

    const mesesSet = new Set(mesesAtivos);
    const mesesYtdSet = new Set();
    for (let m = 1; m <= mesPrimario; m++) mesesYtdSet.add(m);

    // Quarterly & Monthly para o ano selecionado e centros selecionados
    const triTotals = {
      1: { orcado: 0, realizado: 0 },
      2: { orcado: 0, realizado: 0 },
      3: { orcado: 0, realizado: 0 },
      4: { orcado: 0, realizado: 0 }
    };
    const mesTotals = {};
    for (let m = 1; m <= 12; m++) mesTotals[m] = { orcado: 0, realizado: 0 };

    const groups = new Map();

    for (let i = 0; i < DB.rows.length; i++) {
      const row = DB.rows[i];
      const rAno = row[0], rMes = row[1], rCenc = row[2];
      if (!cencs.has(rCenc)) continue;

      const orc = row[7], real = row[8];

      if (rAno === ano && rMes >= 1 && rMes <= 12) {
        const tri = Math.ceil(rMes / 3);
        triTotals[tri].orcado += orc;
        triTotals[tri].realizado += real;
        mesTotals[rMes].orcado += orc;
        mesTotals[rMes].realizado += real;
      }

      const inYtd = mesesYtdSet.has(rMes);
      const isMom = (rAno === anoMom && rMes === mesMom);
      if (!(((rAno === ano || rAno === anoYoy) && inYtd) || isMom)) continue;

      const bIdx = row[3], tIdx = row[4], dIdx = row[5], pIdx = row[6];
      const b = DB.blocos[bIdx];
      const t = DB.titulos[tIdx];
      const n = DB.descrnats[dIdx];
      const p = DB.parceiros[pIdx];

      if (q) {
        const match = b.toLowerCase().includes(q) ||
                      t.toLowerCase().includes(q) ||
                      n.toLowerCase().includes(q) ||
                      p.toLowerCase().includes(q);
        if (!match) continue;
      }

      const key = `${bIdx}|${tIdx}|${dIdx}|${pIdx}`;
      let g = groups.get(key);
      if (!g) {
        g = {
          bloco: b, titulo: t, descrnat: n, parceiro: p,
          orcado: 0, realizado: 0, real_mom: 0, real_yoy: 0, real_ytd: 0, real_ytd_ant: 0
        };
        groups.set(key, g);
      }

      const inMeses = mesesSet.has(rMes);
      if (rAno === ano && inMeses) {
        g.orcado += orc;
        g.realizado += real;
      }
      if (isMom) g.real_mom += real;
      if (rAno === anoYoy && inMeses) g.real_yoy += real;
      if (rAno === ano && inYtd) g.real_ytd += real;
      if (rAno === anoYoy && inYtd) g.real_ytd_ant += real;
    }

    const quarterly = [1, 2, 3, 4].map(tr => ({
      trimestre: `${tr}º Trim`,
      tri_ano: `${tr}º Trim-${ano}`,
      orcado: Number(triTotals[tr].orcado.toFixed(2)),
      realizado: Number(triTotals[tr].realizado.toFixed(2))
    }));

    const monthly = [];
    for (let m = 1; m <= 12; m++) {
      monthly.push({
        mes: m,
        nomemes: SHORT_MESES[m],
        orcado: Number(mesTotals[m].orcado.toFixed(2)),
        realizado: Number(mesTotals[m].realizado.toFixed(2))
      });
    }

    const sortedRows = Array.from(groups.values()).sort((a, b) =>
      a.bloco.localeCompare(b.bloco) ||
      a.titulo.localeCompare(b.titulo) ||
      a.descrnat.localeCompare(b.descrnat) ||
      a.parceiro.localeCompare(b.parceiro)
    );

    const blocos = new Map();
    for (const r of sortedRows) {
      let bd = blocos.get(r.bloco);
      if (!bd) {
        bd = { orc: 0, real: 0, rmom: 0, ryoy: 0, rytd: 0, rytd_ant: 0, titulos: new Map() };
        blocos.set(r.bloco, bd);
      }
      let td = bd.titulos.get(r.titulo);
      if (!td) {
        td = { orc: 0, real: 0, rmom: 0, ryoy: 0, rytd: 0, rytd_ant: 0, linhas: new Map() };
        bd.titulos.set(r.titulo, td);
      }
      let nd = td.linhas.get(r.descrnat);
      if (!nd) {
        nd = { orc: 0, real: 0, rmom: 0, ryoy: 0, rytd: 0, rytd_ant: 0, parceiros: [] };
        td.linhas.set(r.descrnat, nd);
      }

      bd.orc += r.orcado; bd.real += r.realizado; bd.rmom += r.real_mom;
      bd.ryoy += r.real_yoy; bd.rytd += r.real_ytd; bd.rytd_ant += r.real_ytd_ant;

      td.orc += r.orcado; td.real += r.realizado; td.rmom += r.real_mom;
      td.ryoy += r.real_yoy; td.rytd += r.real_ytd; td.rytd_ant += r.real_ytd_ant;

      nd.orc += r.orcado; nd.real += r.realizado; nd.rmom += r.real_mom;
      nd.ryoy += r.real_yoy; nd.rytd += r.real_ytd; nd.rytd_ant += r.real_ytd_ant;

      if (Math.abs(r.realizado) > 0.001 || (r.parceiro !== "<SEM PARCEIRO>" && Math.abs(r.orcado) > 0.001)) {
        nd.parceiros.push({
          parceiro: r.parceiro,
          orcado: Number(r.orcado.toFixed(2)),
          realizado: Number(r.realizado.toFixed(2)),
          mom: calcVar(r.realizado, r.real_mom),
          yoy: calcVar(r.realizado, r.real_yoy),
          ytd_yoy: calcVar(r.real_ytd, r.real_ytd_ant),
          ro: calcRo(r.realizado, r.orcado)
        });
      }
    }

    let totOrc = 0, totReal = 0, totRmom = 0, totRyoy = 0, totRytd = 0, totRytdAnt = 0;
    for (const bd of blocos.values()) {
      totOrc += bd.orc; totReal += bd.real; totRmom += bd.rmom;
      totRyoy += bd.ryoy; totRytd += bd.rytd; totRytdAnt += bd.rytd_ant;
    }

    const dreTree = [{
      bloco: "MARGEM DE CONTRIBUIÇÃO",
      is_total: true,
      orcado: Number(totOrc.toFixed(2)),
      realizado: Number(totReal.toFixed(2)),
      mom: calcVar(totReal, totRmom),
      yoy: calcVar(totReal, totRyoy),
      ytd_yoy: calcVar(totRytd, totRytdAnt),
      ro: calcRo(totReal, totOrc),
      titulos: []
    }];

    for (const [b, bd] of blocos.entries()) {
      if (Math.abs(bd.orc) < 0.01 && Math.abs(bd.real) < 0.01) continue;
      const titulosList = [];
      for (const [t, td] of bd.titulos.entries()) {
        if (Math.abs(td.orc) < 0.01 && Math.abs(td.real) < 0.01) continue;
        const linhasList = [];
        for (const [n, nd] of td.linhas.entries()) {
          if (Math.abs(nd.orc) < 0.01 && Math.abs(nd.real) < 0.01) continue;
          nd.parceiros.sort((a, b) => Math.abs(b.realizado) - Math.abs(a.realizado));
          linhasList.push({
            descr: n,
            orcado: Number(nd.orc.toFixed(2)),
            realizado: Number(nd.real.toFixed(2)),
            mom: calcVar(nd.real, nd.rmom),
            yoy: calcVar(nd.real, nd.ryoy),
            ytd_yoy: calcVar(nd.rytd, nd.rytd_ant),
            ro: calcRo(nd.real, nd.orc),
            parceiros: nd.parceiros
          });
        }
        titulosList.push({
          titulo: t,
          orcado: Number(td.orc.toFixed(2)),
          realizado: Number(td.real.toFixed(2)),
          mom: calcVar(td.real, td.rmom),
          yoy: calcVar(td.real, td.ryoy),
          ytd_yoy: calcVar(td.rytd, td.rytd_ant),
          ro: calcRo(td.real, td.orc),
          linhas: linhasList
        });
      }
      dreTree.push({
        bloco: b,
        orcado: Number(bd.orc.toFixed(2)),
        realizado: Number(bd.real.toFixed(2)),
        mom: calcVar(bd.real, bd.rmom),
        yoy: calcVar(bd.real, bd.ryoy),
        ytd_yoy: calcVar(bd.rytd, bd.rytd_ant),
        ro: calcRo(bd.real, bd.orc),
        titulos: titulosList
      });
    }

    return {
      status: "success",
      ano,
      anos_disponiveis: DB.anos,
      quarterly,
      monthly,
      dre: dreTree
    };
  }

  // Intercepta window.fetch para responder localmente às rotas /api/*
  const origFetch = window.fetch.bind(window);
  window.fetch = async function(input, init) {
    const urlStr = typeof input === "string" ? input : (input && input.url ? input.url : "");
    if (urlStr.includes("/api/")) {
      const u = new URL(urlStr, window.location.origin);
      let payload = null;
      if (u.pathname.endsWith("/api/filtros")) {
        payload = handleFiltros();
      } else if (u.pathname.endsWith("/api/versao")) {
        payload = handleVersao();
      } else if (u.pathname.endsWith("/api/dre/mensal")) {
        payload = handleMensal(u.searchParams);
      } else if (u.pathname.endsWith("/api/dre/detalhe")) {
        payload = handleDetalhe(u.searchParams);
      } else if (u.pathname.endsWith("/api/dre")) {
        payload = handleDre(u.searchParams);
      } else if (u.pathname.endsWith("/api/dre/status")) {
        payload = { status: "done" };
      }
      if (payload !== null) {
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
    return origFetch(input, init);
  };
})();
