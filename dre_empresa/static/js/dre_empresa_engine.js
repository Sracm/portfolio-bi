// ============================================================================
// DRE CONSOLIDADO EMPRESA — STANDALONE ENGINE (Portfólio Executivo)
// ============================================================================
(function() {
  const DB = window.__DRE_EMPRESA_DB__;

  const MESES_LISTA = [
    { NUM: 1, NOME: "Janeiro" }, { NUM: 2, NOME: "Fevereiro" },
    { NUM: 3, NOME: "Março" }, { NUM: 4, NOME: "Abril" },
    { NUM: 5, NOME: "Maio" }, { NUM: 6, NOME: "Junho" },
    { NUM: 7, NOME: "Julho" }, { NUM: 8, NOME: "Agosto" },
    { NUM: 9, NOME: "Setembro" }, { NUM: 10, NOME: "Outubro" },
    { NUM: 11, NOME: "Novembro" }, { NUM: 12, NOME: "Dezembro" }
  ];

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

  function parseStrList(raw) {
    if (!raw || raw === "ALL") return [];
    const out = [];
    String(raw).split(",").forEach(part => {
      const p = part.trim();
      if (p && p !== "ALL") out.push(p);
    });
    return out;
  }

  function isCostOrExpense(bloco, titulo) {
    const b = (bloco || "").toLowerCase();
    const t = (titulo || "").toLowerCase();
    if (b.includes("custo") || b.includes("despesa")) return true;
    const kw = ["devolução", "devolucao", "imposto", "irpj", "csll", "desc financeiro", "cpv", "frete"];
    return kw.some(k => t.includes(k));
  }

  function calcVar(r, b, isDesp) {
    if (b === null || b === undefined || Math.abs(b) < 0.001) return null;
    if (isDesp) {
      const diff = Math.abs(r) - Math.abs(b);
      return Number(((diff / Math.abs(b)) * 100).toFixed(2));
    }
    return Number((((r - b) / Math.abs(b)) * 100).toFixed(2));
  }

  function calcRo(r, o) {
    if (!o || Math.abs(o) < 0.001) return null;
    return Number((((r - o) / o) * 100).toFixed(2));
  }

  function pct(n, d) {
    if (!d || Math.abs(d) < 1.0 || n === null || n === undefined) return null;
    return Number(((n / d) * 100).toFixed(2));
  }

  function handleFiltros() {
    return {
      anos: DB.anos,
      meses: MESES_LISTA,
      empresas: DB.empresas,
      centros: DB.centros
    };
  }

  function handleDre(params) {
    const anos = parseIntList(params.get("ano"), [2026]);
    const meses = parseIntList(params.get("mes"), [9]);
    const emps = parseStrList(params.get("emp"));
    const empSet = emps.length ? new Set(emps) : null;

    const anoPrimario = Math.max(...anos);
    const mesPrimario = Math.max(...meses);
    const anoMom = mesPrimario > 1 ? anoPrimario : anoPrimario - 1;
    const mesMom = mesPrimario > 1 ? mesPrimario - 1 : 12;
    const anoYoy = anoPrimario - 1;

    const anosSet = new Set(anos);
    const mesesSet = new Set(meses);
    const mesesYtdSet = new Set();
    for (let m = 1; m <= mesPrimario; m++) mesesYtdSet.add(m);

    const groups = new Map();

    for (let i = 0; i < DB.rows.length; i++) {
      const row = DB.rows[i];
      const ano = row[0], mes = row[1], eIdx = row[2];
      if (empSet && !empSet.has(DB.emp_list[eIdx])) continue;

      const inAnos = anosSet.has(ano);
      const inMeses = mesesSet.has(mes);
      const inYtd = mesesYtdSet.has(mes);
      const isMom = (ano === anoMom && mes === mesMom);
      const isYoy = (ano === anoYoy);

      if (!((inAnos && inYtd) || (isYoy && inYtd) || isMom)) continue;

      const bIdx = row[3], tIdx = row[4], dIdx = row[5];
      const orc = row[6], real = row[7];
      const key = `${bIdx}|${tIdx}|${dIdx}`;
      let g = groups.get(key);
      if (!g) {
        g = {
          bloco: DB.blocos[bIdx],
          titulo: DB.titulos[tIdx],
          descrnat: DB.descrnats[dIdx],
          realizado: 0, orcado: 0, real_mom: 0, orc_mom: 0,
          real_yoy: 0, real_ytd: 0, real_ytd_ant: 0
        };
        groups.set(key, g);
      }

      if (inAnos && inMeses) { g.realizado += real; g.orcado += orc; }
      if (isMom) { g.real_mom += real; g.orc_mom += orc; }
      if (isYoy && inMeses) { g.real_yoy += real; }
      if (inAnos && inYtd) { g.real_ytd += real; }
      if (isYoy && inYtd) { g.real_ytd_ant += real; }
    }

    const sortedRows = Array.from(groups.values()).sort((a, b) => {
      if (a.bloco !== b.bloco) return a.bloco.localeCompare(b.bloco);
      if (a.titulo !== b.titulo) return a.titulo.localeCompare(b.titulo);
      return a.descrnat.localeCompare(b.descrnat);
    });

    let bonifTotal = 0;
    const blocosMap = new Map();

    for (const r of sortedRows) {
      if (r.titulo && r.titulo.toLowerCase().includes("bonif")) {
        bonifTotal += r.realizado;
      }
      if (Math.abs(r.realizado) < 0.001 && Math.abs(r.orcado) < 0.001 &&
          Math.abs(r.real_mom) < 0.001 && Math.abs(r.orc_mom) < 0.001 &&
          Math.abs(r.real_ytd) < 0.001 && Math.abs(r.real_yoy) < 0.001 &&
          Math.abs(r.real_ytd_ant) < 0.001) continue;

      let bd = blocosMap.get(r.bloco);
      if (!bd) {
        bd = {
          bloco: r.bloco, realizado: 0, orcado: 0, real_mom: 0, orc_mom: 0,
          real_yoy: 0, real_ytd: 0, real_ytd_ant: 0, titulos: new Map()
        };
        blocosMap.set(r.bloco, bd);
      }
      let td = bd.titulos.get(r.titulo);
      if (!td) {
        td = {
          titulo: r.titulo, realizado: 0, orcado: 0, real_mom: 0, orc_mom: 0,
          real_yoy: 0, real_ytd: 0, real_ytd_ant: 0, linhas: []
        };
        bd.titulos.set(r.titulo, td);
      }
      td.linhas.push({
        descr: r.descrnat, realizado: r.realizado, orcado: r.orcado,
        real_mom: r.real_mom, orc_mom: r.orc_mom, real_yoy: r.real_yoy,
        real_ytd: r.real_ytd, real_ytd_ant: r.real_ytd_ant
      });
      td.realizado += r.realizado; td.orcado += r.orcado;
      td.real_mom += r.real_mom; td.orc_mom += r.orc_mom;
      td.real_yoy += r.real_yoy; td.real_ytd += r.real_ytd; td.real_ytd_ant += r.real_ytd_ant;

      bd.realizado += r.realizado; bd.orcado += r.orcado;
      bd.real_mom += r.real_mom; bd.orc_mom += r.orc_mom;
      bd.real_yoy += r.real_yoy; bd.real_ytd += r.real_ytd; bd.real_ytd_ant += r.real_ytd_ant;
    }

    let vbReal = 0, vbOrc = 0;
    for (const [, bd] of blocosMap.entries()) {
      for (const [tName, td] of bd.titulos.entries()) {
        if (tName.toLowerCase().includes("venda bruta")) {
          vbReal = td.realizado; vbOrc = td.orcado; break;
        }
      }
      if (vbReal) break;
    }
    const vl = blocosMap.get("1.Venda Liquida") || { realizado: 0, orcado: 0, real_mom: 0, orc_mom: 0, real_yoy: 0, real_ytd: 0, real_ytd_ant: 0 };
    const cmv = blocosMap.get("2.Custo Mercadoria Vendida") || { realizado: 0, orcado: 0, real_mom: 0, orc_mom: 0, real_yoy: 0, real_ytd: 0, real_ytd_ant: 0 };
    if (!vbReal) { vbReal = vl.realizado; vbOrc = vl.orcado; }

    const mReal = vl.realizado + cmv.realizado;
    const mOrc = vl.orcado + cmv.orcado;
    const mRealMom = vl.real_mom + cmv.real_mom;
    const mOrcMom = vl.orc_mom + cmv.orc_mom;
    const mYoy = vl.real_yoy + cmv.real_yoy;
    const mYtd = vl.real_ytd + cmv.real_ytd;
    const mYtdAnt = vl.real_ytd_ant + cmv.real_ytd_ant;

    const isMultiMes = meses.length > 1;
    const result = [];

    if (blocosMap.size > 0) {
      result.push({
        bloco: "MARGEM DE CONTRIBUIÇÃO", is_total: true, is_despesa: false,
        realizado: mReal, orcado: mOrc, real_mom: mRealMom, orc_mom: mOrcMom, real_ytd: mYtd,
        mom: !isMultiMes ? calcVar(mReal, mRealMom, false) : null,
        yoy: calcVar(mReal, mYoy, false),
        ytd_yoy: calcVar(mYtd, mYtdAnt, false),
        pct_real: pct(mReal, vbReal), pct_orc: pct(mOrc, vbOrc),
        ro: calcRo(mReal, mOrc), titulos: []
      });

      const despBlocos = [
        "3.Despesas com Vendas", "4.Despesas Comercial Operacional",
        "5.Despesas Administrativa Operacional", "6.Receitas/Despesas Financeiras", "7.Vendas IC"
      ];
      let m2Real = mReal, m2Orc = mOrc, m2Ytd = mYtd, m2RealMom = mRealMom, m2OrcMom = mOrcMom, m2Yoy = mYoy, m2YtdAnt = mYtdAnt;
      for (const dk of despBlocos) {
        const bd2 = blocosMap.get(dk);
        if (bd2) {
          m2Real += bd2.realizado; m2Orc += bd2.orcado; m2Ytd += bd2.real_ytd;
          m2RealMom += bd2.real_mom; m2OrcMom += bd2.orc_mom;
          m2Yoy += bd2.real_yoy; m2YtdAnt += bd2.real_ytd_ant;
        }
      }
      result.push({
        bloco: "MARGEM", is_total: true, is_despesa: false,
        realizado: m2Real, orcado: m2Orc, real_mom: m2RealMom, orc_mom: m2OrcMom, real_ytd: m2Ytd,
        mom: !isMultiMes ? calcVar(m2Real, m2RealMom, false) : null,
        yoy: calcVar(m2Real, m2Yoy, false),
        ytd_yoy: calcVar(m2Ytd, m2YtdAnt, false),
        pct_real: pct(m2Real, vbReal), pct_orc: pct(m2Orc, vbOrc),
        ro: calcRo(m2Real, m2Orc), titulos: []
      });
    }

    for (const [bName, bd] of blocosMap.entries()) {
      const isDespB = isCostOrExpense(bName);
      const titulosOut = [];
      for (const [tName, td] of bd.titulos.entries()) {
        const isDespT = isCostOrExpense(bName, tName);
        const linhasOut = td.linhas.map(ln => ({
          descr: ln.descr, realizado: ln.realizado, orcado: ln.orcado,
          real_mom: ln.real_mom, orc_mom: ln.orc_mom, real_ytd: ln.real_ytd,
          is_despesa: isDespT,
          mom: !isMultiMes ? calcVar(ln.realizado, ln.real_mom, isDespT) : null,
          yoy: calcVar(ln.realizado, ln.real_yoy, isDespT),
          ytd_yoy: calcVar(ln.real_ytd, ln.real_ytd_ant, isDespT),
          pct_real: pct(ln.realizado, vbReal), pct_orc: pct(ln.orcado, vbOrc),
          ro: calcRo(ln.realizado, ln.orcado)
        }));
        titulosOut.push({
          titulo: tName, realizado: td.realizado, orcado: td.orcado,
          real_mom: td.real_mom, orc_mom: td.orc_mom, real_ytd: td.real_ytd,
          is_despesa: isDespT,
          mom: !isMultiMes ? calcVar(td.realizado, td.real_mom, isDespT) : null,
          yoy: calcVar(td.realizado, td.real_yoy, isDespT),
          ytd_yoy: calcVar(td.real_ytd, td.real_ytd_ant, isDespT),
          pct_real: pct(td.realizado, vbReal), pct_orc: pct(td.orcado, vbOrc),
          ro: calcRo(td.realizado, td.orcado), linhas: linhasOut
        });
      }
      result.push({
        bloco: bName, realizado: bd.realizado, orcado: bd.orcado,
        real_mom: bd.real_mom, orc_mom: bd.orc_mom, real_ytd: bd.real_ytd,
        is_despesa: isDespB,
        mom: !isMultiMes ? calcVar(bd.realizado, bd.real_mom, isDespB) : null,
        yoy: calcVar(bd.realizado, bd.real_yoy, isDespB),
        ytd_yoy: calcVar(bd.real_ytd, bd.real_ytd_ant, isDespB),
        pct_real: pct(bd.realizado, vbReal), pct_orc: pct(bd.orcado, vbOrc),
        ro: calcRo(bd.realizado, bd.orcado), titulos: titulosOut
      });
    }

    return { dre: result, bonif_total: bonifTotal };
  }

  function handleMensal(params) {
    const anos = new Set(parseIntList(params.get("ano"), [2026]));
    const emps = parseStrList(params.get("emp"));
    const empSet = emps.length ? new Set(emps) : null;
    const fBloco = params.get("bloco") || null;
    const fTitulo = params.get("titulo") || null;
    const fDescr = params.get("descrnat") || null;

    const groups = new Map();
    for (let i = 0; i < DB.rows.length; i++) {
      const row = DB.rows[i];
      const ano = row[0], mes = row[1], eIdx = row[2];
      if (!anos.has(ano)) continue;
      if (empSet && !empSet.has(DB.emp_list[eIdx])) continue;

      const bName = DB.blocos[row[3]];
      const tName = DB.titulos[row[4]];
      const dName = DB.descrnats[row[5]];

      if (fDescr && dName !== fDescr) continue;
      if (fTitulo && tName !== fTitulo) continue;
      if (fBloco && fBloco.toUpperCase() !== "MARGEM DE CONTRIBUIÇÃO" && bName !== fBloco) continue;

      const key = `${mes}|${bName}`;
      let g = groups.get(key);
      if (!g) {
        g = { MES: mes, BLOCO: bName, REALIZADO: 0, ORCADO: 0 };
        groups.set(key, g);
      }
      g.ORCADO += row[6];
      g.REALIZADO += row[7];
    }

    const out = Array.from(groups.values()).sort((a, b) => a.MES - b.MES || a.BLOCO.localeCompare(b.BLOCO));
    return { mensal: out };
  }

  function handleTabelaAcumulado(params) {
    const anos = parseIntList(params.get("ano"), [2026]);
    const meses = parseIntList(params.get("mes"), [9]);
    const emps = parseStrList(params.get("emp"));
    const empSet = emps.length ? new Set(emps) : null;
    const modo = (params.get("modo") || "mensal").toLowerCase();

    const anoVal = anos[0] || 2026;
    const mesVal = Math.max(...meses);
    const mesesSet = new Set(meses);

    const groups = new Map();
    for (let i = 0; i < DB.rows.length; i++) {
      const row = DB.rows[i];
      const ano = row[0], mes = row[1], eIdx = row[2];
      if (ano !== anoVal) continue;
      if (modo === "acumulado" ? (mes > mesVal) : !mesesSet.has(mes)) continue;
      if (empSet && !empSet.has(DB.emp_list[eIdx])) continue;

      const bName = DB.blocos[row[3]];
      const tName = DB.titulos[row[4]];
      const key = `${bName}|${tName}`;
      let g = groups.get(key);
      if (!g) {
        g = { bloco: bName, titulo: tName, orcado: 0, realizado: 0 };
        groups.set(key, g);
      }
      g.orcado += row[6];
      g.realizado += row[7];
    }

    const map = {};
    for (const g of groups.values()) {
      if (!map[g.bloco]) map[g.bloco] = [];
      map[g.bloco].push({
        titulo: g.titulo, orcado: g.orcado, realizado: g.realizado,
        dif: g.realizado - g.orcado,
        pct: Math.abs(g.orcado) > 0.001 ? ((g.realizado - g.orcado) / Math.abs(g.orcado) * 100) : 0
      });
    }

    return { ano: anoVal, mes: mesVal, modo: modo, grupos: map };
  }

  function handleTabelaMensal(params) {
    const anos = parseIntList(params.get("ano"), [2026]);
    const meses = parseIntList(params.get("mes"), [8]);
    const emps = parseStrList(params.get("emp"));
    const empSet = emps.length ? new Set(emps) : null;
    const soAmbos = (params.get("so_ambos") || "true").toLowerCase() !== "false";

    const anoVal = anos[0] || 2026;
    const mesesSet = new Set(meses);

    const cDict = new Map();
    for (let i = 0; i < DB.cenc_rows.length; i++) {
      const r = DB.cenc_rows[i];
      if (r[0] !== anoVal || !mesesSet.has(r[1])) continue;
      if (empSet && !empSet.has(DB.emp_list[r[2]])) continue;

      const cNome = DB.descrcencs[r[4]];
      const bNome = DB.blocos[r[5]];
      let ci = cDict.get(cNome);
      if (!ci) {
        ci = { nome: cNome, orcado: 0, realizado: 0, bMap: new Map() };
        cDict.set(cNome, ci);
      }
      ci.orcado += r[6]; ci.realizado += r[7];
      let bi = ci.bMap.get(bNome);
      if (!bi) { bi = { bloco: bNome, orcado: 0, realizado: 0 }; ci.bMap.set(bNome, bi); }
      bi.orcado += r[6]; bi.realizado += r[7];
    }

    const centrosList = [];
    let totOrc = 0, totReal = 0;
    for (const ci of cDict.values()) {
      if (soAmbos ? (Math.abs(ci.orcado) < 0.01 || Math.abs(ci.realizado) < 0.01) : (Math.abs(ci.orcado) < 0.01 && Math.abs(ci.realizado) < 0.01)) continue;
      totOrc += ci.orcado; totReal += ci.realizado;
      const blocos = Array.from(ci.bMap.values()).map(b => ({
        bloco: b.bloco, orcado: b.orcado, realizado: b.realizado,
        dif: b.realizado - b.orcado,
        pct: Math.abs(b.orcado) > 0.001 ? ((b.realizado - b.orcado) / Math.abs(b.orcado) * 100) : 0
      }));
      centrosList.push({
        nome: ci.nome, orcado: ci.orcado, realizado: ci.realizado,
        dif: ci.realizado - ci.orcado,
        pct: Math.abs(ci.orcado) > 0.001 ? ((ci.realizado - ci.orcado) / Math.abs(ci.orcado) * 100) : 0,
        blocos: blocos
      });
    }
    centrosList.sort((a, b) => b.realizado - a.realizado);

    return {
      ano: anoVal, mes: Math.max(...meses),
      total: {
        nome: "TOTAL CENTROS DE RESULTADO", orcado: totOrc, realizado: totReal,
        dif: totReal - totOrc, pct: Math.abs(totOrc) > 0.001 ? ((totReal - totOrc) / Math.abs(totOrc) * 100) : 0
      },
      centros: centrosList
    };
  }

  const origFetch = window.fetch.bind(window);
  window.fetch = async function(input, init) {
    const rawUrl = typeof input === "string" ? input : (input && input.url ? input.url : "");
    if (rawUrl) {
      const u = new URL(rawUrl, window.location.href);
      const path = u.pathname;
      const params = u.searchParams;

      if (path.endsWith("/api/filtros")) {
        return new Response(JSON.stringify(handleFiltros()), {
          status: 200, headers: { "Content-Type": "application/json" }
        });
      }
      if (path.endsWith("/api/dre") && !path.includes("mensal") && !path.includes("acumulado")) {
        return new Response(JSON.stringify(handleDre(params)), {
          status: 200, headers: { "Content-Type": "application/json" }
        });
      }
      if (path.endsWith("/api/dre/mensal")) {
        return new Response(JSON.stringify(handleMensal(params)), {
          status: 200, headers: { "Content-Type": "application/json" }
        });
      }
      if (path.endsWith("/api/dre/tabela-acumulado")) {
        return new Response(JSON.stringify(handleTabelaAcumulado(params)), {
          status: 200, headers: { "Content-Type": "application/json" }
        });
      }
      if (path.endsWith("/api/dre/tabela-mensal")) {
        return new Response(JSON.stringify(handleTabelaMensal(params)), {
          status: 200, headers: { "Content-Type": "application/json" }
        });
      }
    }
    return origFetch(input, init);
  };
})();
