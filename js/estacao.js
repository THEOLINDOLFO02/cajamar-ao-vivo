// Leitura do CSV das estações meteorológicas e régua de nível do rio, resumo por dia e gestão multi-estação.
// Sem dependência de página (pode ser testado no Node).
(function (w) {
  "use strict";
  var CHAVE_V1 = "cajamar:historico:v1";
  var CHAVE_MULTI = "cajamar:estacoes:v2";

  var SLOTS_PADRAO = [
    { id: "est1", rotulo: "Estação Meteorológica 1", tipo: "meteorologica" },
    { id: "est2", rotulo: "Estação Meteorológica 2", tipo: "meteorologica" },
    { id: "est3", rotulo: "Estação Meteorológica 3", tipo: "meteorologica" },
    { id: "regua", rotulo: "Régua de Nível do Rio", tipo: "nivel" }
  ];

  function num(s) {
    if (s === undefined || s === null || s === "") return null;
    var v = parseFloat(String(s).replace(",", "."));
    return isFinite(v) ? v : null;
  }

  // Divide o CSV (delimitador ";", decimal com vírgula) em linhas de objetos.
  // Suporta tanto estações meteorológicas quanto a régua de nível do rio (water_level_m).
  function lerCsv(texto) {
    var linhas = String(texto || "").replace(/^\uFEFF/, "").split(/\r?\n/).filter(function (l) { return l.trim() !== ""; });
    if (linhas.length < 2) throw new Error("arquivo vazio");
    var cab = linhas[0].split(";").map(function (c) { return c.trim(); });
    var temData = cab.indexOf("data_hora_brt") >= 0 && cab.indexOf("timestamp_ms") >= 0;
    var temClima = cab.indexOf("temperature_c") >= 0 && cab.indexOf("rain_interval_mm") >= 0;
    var temNivel = cab.indexOf("water_level_m") >= 0;
    if (!temData || (!temClima && !temNivel)) {
      var precisa = ["data_hora_brt", "timestamp_ms", "temperature_c", "rain_interval_mm"];
      var faltam = precisa.filter(function (c) { return cab.indexOf(c) < 0; });
      throw new Error("colunas ausentes: " + faltam.join(", "));
    }
    var idx = {};
    cab.forEach(function (c, i) { idx[c] = i; });
    var out = [];
    for (var i = 1; i < linhas.length; i++) {
      var c = linhas[i].split(";");
      var ts = Number(c[idx.timestamp_ms]), dh = c[idx.data_hora_brt] || "";
      var m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(dh);
      if (!isFinite(ts) || !m) continue;
      out.push({
        ts: ts,
        dia: m[3] + "-" + m[2] + "-" + m[1],
        t: idx.temperature_c !== undefined ? num(c[idx.temperature_c]) : null,
        u: idx.humidity_percent !== undefined ? num(c[idx.humidity_percent]) : null,
        p: idx.pressure_hpa !== undefined ? num(c[idx.pressure_hpa]) : null,
        v: idx.wind_speed_kmh !== undefined ? num(c[idx.wind_speed_kmh]) : null,
        ch: idx.rain_interval_mm !== undefined ? num(c[idx.rain_interval_mm]) : null,
        nv: idx.water_level_m !== undefined ? num(c[idx.water_level_m]) : null,
        rad: idx.solar_radiation_wm2 !== undefined ? num(c[idx.solar_radiation_wm2]) : null,
        nome: idx.alias !== undefined && c[idx.alias] ? c[idx.alias].trim() : "",
        sn: idx.sn !== undefined && c[idx.sn] ? c[idx.sn].trim() : "",
        cat: idx.category !== undefined && c[idx.category] ? c[idx.category].trim().toLowerCase() : ""
      });
    }
    return out;
  }

  function resumir(rows) {
    rows.sort(function (a, b) { return a.ts - b.ts; });
    // remove timestamps repetidos
    rows = rows.filter(function (r, i) { return i === 0 || r.ts !== rows[i - 1].ts; });
    var D = {};
    rows.forEach(function (r) {
      var d = D[r.dia] || (D[r.dia] = {
        n: 0, chuva: 0, nChuva: 0, tmin: null, tmax: null, uSoma: 0, uN: 0,
        pmin: null, pmax: null, vmax: null, radmax: null, c10: 0, c60: 0,
        nvMin: null, nvMax: null, nvSoma: 0, nNivel: 0
      });
      d.n++;
      if (r.ch !== null && r.ch !== undefined) { d.chuva += r.ch; d.nChuva++; }
      if (r.t !== null && r.t !== undefined) { d.tmin = d.tmin === null ? r.t : Math.min(d.tmin, r.t); d.tmax = d.tmax === null ? r.t : Math.max(d.tmax, r.t); }
      if (r.u !== null && r.u !== undefined) { d.uSoma += r.u; d.uN++; }
      if (r.p !== null && r.p !== undefined) { d.pmin = d.pmin === null ? r.p : Math.min(d.pmin, r.p); d.pmax = d.pmax === null ? r.p : Math.max(d.pmax, r.p); }
      if (r.v !== null && r.v !== undefined) d.vmax = d.vmax === null ? r.v : Math.max(d.vmax, r.v);
      if (r.rad !== null && r.rad !== undefined) d.radmax = d.radmax === null ? r.rad : Math.max(d.radmax, r.rad);
      if (r.nv !== null && r.nv !== undefined) {
        d.nvMin = d.nvMin === null ? r.nv : Math.min(d.nvMin, r.nv);
        d.nvMax = d.nvMax === null ? r.nv : Math.max(d.nvMax, r.nv);
        d.nvSoma += r.nv;
        d.nNivel++;
      }
    });
    // maior chuva em 10 min e em 60 min (janela termina no minuto, vale para o dia dele)
    var i10 = 0, i60 = 0, s10 = 0, s60 = 0;
    rows.forEach(function (r) {
      var c = r.ch || 0; s10 += c; s60 += c;
      while (rows[i10].ts <= r.ts - 600000) { s10 -= rows[i10].ch || 0; i10++; }
      while (rows[i60].ts <= r.ts - 3600000) { s60 -= rows[i60].ch || 0; i60++; }
      var d = D[r.dia];
      if (s10 > d.c10) d.c10 = s10;
      if (s60 > d.c60) d.c60 = s60;
    });
    var out = {};
    Object.keys(D).forEach(function (k) {
      var d = D[k];
      var nvMed = d.nNivel ? Math.round((d.nvSoma / d.nNivel) * 100) / 100 : null;
      var nvMin = d.nvMin !== null ? Math.round(d.nvMin * 100) / 100 : null;
      var nvMax = d.nvMax !== null ? Math.round(d.nvMax * 100) / 100 : null;
      var nvDelta = (nvMax !== null && nvMin !== null) ? Math.round((nvMax - nvMin) * 100) / 100 : null;
      out[k] = {
        n: d.n,
        chuva: Math.round(d.chuva * 10) / 10,
        tmin: d.tmin,
        tmax: d.tmax,
        umid: d.uN ? Math.round(d.uSoma / d.uN * 10) / 10 : null,
        pmin: d.pmin,
        pmax: d.pmax,
        vmax: d.vmax,
        radmax: d.radmax,
        c10: Math.round(d.c10 * 10) / 10,
        c60: Math.round(d.c60 * 10) / 10,
        nvMin: nvMin,
        nvMax: nvMax,
        nvMed: nvMed,
        nvDelta: nvDelta,
        nNivel: d.nNivel
      };
    });
    return out;
  }

  // Detecta se um conjunto de linhas CSV pertence à Régua de Nível ("nivel"), Estação Meteorológica ("meteorologica") ou ambos ("ambos").
  function detectarTipo(rows) {
    var temNivel = false, temClima = false, cat = "", nome = "";
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!cat && r.cat) cat = r.cat;
      if (!nome && r.nome) nome = r.nome.toLowerCase();
      if (r.nv !== null && r.nv !== undefined) temNivel = true;
      if (r.t !== null || (r.ch !== null && r.ch > 0) || r.u !== null) temClima = true;
      if (temNivel && temClima) break;
    }
    if (/hidro|fluv|nivel|nível|regua|régua|rio/.test(cat) || /régua|regua|nível|nivel|rio\b/.test(nome)) {
      return temClima ? "ambos" : "nivel";
    }
    if (temNivel && !temClima) return "nivel";
    if (temNivel && temClima) return "ambos";
    return "meteorologica";
  }

  function criarBancoVazio() {
    return {
      ativo: "est1",
      slots: {
        est1: { id: "est1", rotulo: "Estação Meteorológica 1", tipo: "meteorologica", estacao: "", sn: "", dias: {} },
        est2: { id: "est2", rotulo: "Estação Meteorológica 2", tipo: "meteorologica", estacao: "", sn: "", dias: {} },
        est3: { id: "est3", rotulo: "Estação Meteorológica 3", tipo: "meteorologica", estacao: "", sn: "", dias: {} },
        regua: { id: "regua", rotulo: "Régua de Nível do Rio", tipo: "nivel", estacao: "", sn: "", dias: {} }
      }
    };
  }

  function carregarBanco(storage) {
    var st = storage || (typeof localStorage !== "undefined" ? localStorage : null);
    var banco = criarBancoVazio();
    if (!st) return banco;
    try {
      var salvo = JSON.parse(st.getItem(CHAVE_MULTI) || "null");
      if (salvo && salvo.slots && typeof salvo.slots === "object") {
        SLOTS_PADRAO.forEach(function (s) {
          var x = salvo.slots[s.id];
          if (x && typeof x.dias === "object") {
            banco.slots[s.id] = {
              id: s.id,
              rotulo: x.rotulo || s.rotulo,
              tipo: x.tipo || s.tipo,
              estacao: x.estacao || "",
              sn: x.sn || "",
              dias: x.dias || {}
            };
          }
        });
        if (salvo.ativo && banco.slots[salvo.ativo]) banco.ativo = salvo.ativo;
        return banco;
      }
    } catch (e) {}
    // Migração automática do formato antigo (cajamar:historico:v1) para o slot est1
    try {
      var v1 = JSON.parse(st.getItem(CHAVE_V1) || "null");
      if (v1 && v1.dias && typeof v1.dias === "object" && Object.keys(v1.dias).length) {
        banco.slots.est1.estacao = v1.estacao || "Estação 1";
        banco.slots.est1.dias = v1.dias;
      }
    } catch (e) {}
    return banco;
  }

  function sincronizarV1(banco, storage) {
    var st = storage || (typeof localStorage !== "undefined" ? localStorage : null);
    if (!st) return;
    var s = banco.slots[banco.ativo];
    if (!s || !Object.keys(s.dias).length) {
      // procura a primeira estação meteorológica com dados
      s = banco.slots.est1;
      if (!Object.keys(s.dias).length && Object.keys(banco.slots.est2.dias).length) s = banco.slots.est2;
      else if (!Object.keys(s.dias).length && Object.keys(banco.slots.est3.dias).length) s = banco.slots.est3;
    }
    try {
      if (s && Object.keys(s.dias).length) {
        st.setItem(CHAVE_V1, JSON.stringify({ estacao: s.estacao, dias: s.dias }));
      } else {
        st.removeItem(CHAVE_V1);
      }
    } catch (e) {}
  }

  function salvarBanco(banco, storage) {
    var st = storage || (typeof localStorage !== "undefined" ? localStorage : null);
    if (!st) return false;
    try {
      st.setItem(CHAVE_MULTI, JSON.stringify(banco));
      sincronizarV1(banco, storage);
      return true;
    } catch (e) {
      return false;
    }
  }

  // Escolhe automaticamente em qual dos 4 slots (est1, est2, est3, regua) gravar o CSV quando não foi forçado um slot.
  function escolherSlotAutomatico(banco, rows, nomeArquivo) {
    var tipo = detectarTipo(rows);
    var nome = (rows[0] && rows[0].nome) || "";
    var sn = (rows[0] && rows[0].sn) || "";
    var arq = String(nomeArquivo || "").toLowerCase();

    if (tipo === "nivel" || /regua|régua|nivel|nível|rio|fluv|hidro/.test(arq)) {
      return "regua";
    }
    // 1) Se já existe slot com o mesmo SN ou mesmo nome de estação, atualiza-o
    var idsMet = ["est1", "est2", "est3"];
    for (var i = 0; i < idsMet.length; i++) {
      var sl = banco.slots[idsMet[i]];
      if (sn && sl.sn && sl.sn === sn) return sl.id;
      if (nome && sl.estacao && sl.estacao.toLowerCase() === nome.toLowerCase()) return sl.id;
    }
    // 2) Primeiro slot meteorológico vazio
    for (var j = 0; j < idsMet.length; j++) {
      if (!Object.keys(banco.slots[idsMet[j]].dias).length) return idsMet[j];
    }
    // 3) Se os 3 já estão ocupados e a régua está vazia e o arquivo também tem nível, usa a régua; senão, usa o ativo
    if (tipo === "ambos" && !Object.keys(banco.slots.regua.dias).length) return "regua";
    return banco.ativo && banco.ativo !== "regua" ? banco.ativo : "est1";
  }

  function mesclarNoSlot(banco, slotId, rows, nomeArquivo) {
    if (!rows || !rows.length) throw new Error("nenhuma linha com data válida");
    var alvo = slotId && slotId !== "auto" ? slotId : escolherSlotAutomatico(banco, rows, nomeArquivo);
    if (!banco.slots[alvo]) alvo = "est1";
    var slot = banco.slots[alvo];
    var novos = resumir(rows);
    var add = 0, subst = 0, mantidos = 0;
    Object.keys(novos).forEach(function (k) {
      if (!slot.dias[k]) { slot.dias[k] = novos[k]; add++; }
      else if (novos[k].n >= slot.dias[k].n) { slot.dias[k] = novos[k]; subst++; }
      else mantidos++;
    });
    var nome = rows[0].nome;
    if (!nome && nomeArquivo) {
      nome = String(nomeArquivo).replace(/\.csv$/i, "").replace(/[_-]+/g, " ").trim();
    }
    if (nome) slot.estacao = nome;
    if (rows[0].sn) slot.sn = rows[0].sn;
    var tipoDet = detectarTipo(rows);
    if (alvo === "regua" || tipoDet === "nivel") slot.tipo = "nivel";
    else if (tipoDet === "ambos") slot.tipo = "ambos";
    else slot.tipo = "meteorologica";

    return {
      slotId: alvo,
      rotulo: slot.rotulo,
      estacao: slot.estacao || slot.rotulo,
      tipo: slot.tipo,
      linhas: rows.length,
      add: add,
      subst: subst,
      mantidos: mantidos,
      totalDias: Object.keys(slot.dias).length
    };
  }

  w.Estacao = {
    SLOTS_PADRAO: SLOTS_PADRAO,
    lerCsv: lerCsv,
    resumir: resumir,
    detectarTipo: detectarTipo,
    criarBancoVazio: criarBancoVazio,
    carregarBanco: carregarBanco,
    salvarBanco: salvarBanco,
    escolherSlotAutomatico: escolherSlotAutomatico,
    mesclarNoSlot: mesclarNoSlot
  };
})(typeof window !== "undefined" ? window : globalThis);

