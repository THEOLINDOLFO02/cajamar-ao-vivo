// Leitura do CSV das estações meteorológicas e régua de nível do rio, resumo por dia e gestão multi-estação.
// Sem dependência de página (pode ser testado no Node).
//
// Princípios deste módulo:
// - dado ausente, inválido ou duplicado NUNCA vira 0 mm: fica null e é contado;
// - acumulados móveis (24 h / 168 h) só existem com cobertura horária completa e sem lacunas; senão: SEM_DADOS_SUFICIENTES;
// - importação e restauração de backup são validadas por inteiro antes de gravar, e revertidas se a gravação falhar.
(function (w) {
  "use strict";
  var CHAVE_V1 = "cajamar:historico:v1";
  var CHAVE_MULTI = "cajamar:estacoes:v2";
  var CHAVE_COTAS_RIO = "cajamar:cotas_rio:v1";
  var CHAVE_OCORRENCIAS = "cajamar:ocorrencias:v1";
  var CHAVE_OBSERVACOES = "cajamar:observacoes:v1";
  var CHAVE_CONTATO = "cajamar:contato";

  var HORA_MS = 3600000;
  // Limites FÍSICOS absolutos (impossíveis fora deles), usados só para recusar leitura corrompida — não são limiares de risco.
  // Temperatura: recordes do planeta -89,2 a 56,7 °C; umidade relativa 0-100 %; pressão de estação 300-1100 hPa (cobre qualquer altitude
  // habitada e o recorde ao nível do mar de ~1085 hPa); vento 0-500 km/h (recorde 408 km/h); radiação solar global 0-1500 W/m².
  // Valor fora da faixa vira null (ausente) e é contado em foraFaixa; valores extremos DENTRO da faixa são mantidos.
  var LIMITES_FISICOS = { t: [-90, 60], u: [0, 100], p: [300, 1100], v: [0, 500], rad: [0, 1500] };
  var BRT_MS = 3 * HORA_MS; // fuso fixo -03, como no arquivo exportado pela plataforma
  // Critério de QUALIDADE de dado (não é limiar hidrológico): lacuna = intervalo entre leituras válidas de chuva
  // maior que este fator vezes o intervalo típico (mediana) da série. Ajustável com a Defesa Civil.
  var FATOR_LACUNA = 2;
  var MAX_LACUNAS_POR_DIA = 40;

  var LIMITES_IMPORTACAO = {
    maxArquivos: 4,
    maxBytesArquivo: 25 * 1024 * 1024,
    maxBytesTotal: 60 * 1024 * 1024
  };
  var LIMITE_BACKUP_BYTES = 20 * 1024 * 1024;

  var SLOTS_PADRAO = [
    { id: "est1", rotulo: "Estação Meteorológica 1", tipo: "meteorologica" },
    { id: "est2", rotulo: "Estação Meteorológica 2", tipo: "meteorologica" },
    { id: "est3", rotulo: "Estação Meteorológica 3", tipo: "meteorologica" },
    { id: "regua", rotulo: "Régua de Nível do Rio", tipo: "nivel" }
  ];

  // Número do CSV (decimal com vírgula ou ponto). Texto com lixo ("12abc"), infinito ou vazio vira null.
  function num(s) {
    if (s === undefined || s === null) return null;
    if (typeof s === "number") return isFinite(s) ? s : null;
    var t = String(s).trim();
    if (t === "") return null;
    if (!/^[-+]?\d+([.,]\d+)?$/.test(t)) return null;
    var v = parseFloat(t.replace(",", "."));
    return isFinite(v) ? v : null;
  }

  function diaReal(a, m, d) {
    if (m < 1 || m > 12 || d < 1 || d > 31) return false;
    var dt = new Date(Date.UTC(a, m - 1, d));
    return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }

  function chaveDiaDe(ms) { return new Date(ms - BRT_MS).toISOString().slice(0, 10); }
  function horaDe(ms) { return new Date(ms - BRT_MS).getUTCHours(); }
  function inicioDoDia(chave) {
    var p = chave.split("-");
    return Date.UTC(+p[0], +p[1] - 1, +p[2], 3, 0);
  }

  // Divide o CSV (delimitador ";", decimal com vírgula) em linhas de objetos.
  // Suporta tanto estações meteorológicas quanto a régua de nível do rio (water_level_m).
  // O vetor devolvido traz .descartadas = [{ linha, motivo }]: nada é ignorado sem registro.
  function lerCsv(texto) {
    var linhas = String(texto || "").replace(/^﻿/, "").split(/\r?\n/).filter(function (l) { return l.trim() !== ""; });
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
    out.descartadas = [];
    for (var i = 1; i < linhas.length; i++) {
      var c = linhas[i].split(";");
      var tsTxt = String(c[idx.timestamp_ms] === undefined ? "" : c[idx.timestamp_ms]).trim();
      var ts = tsTxt === "" ? NaN : Number(tsTxt), dh = c[idx.data_hora_brt] || "";
      var m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(dh);
      if (!isFinite(ts) || ts <= 0 || !m) { out.descartadas.push({ linha: i + 1, motivo: "timestamp_ms ou data_hora_brt ausente/inválido" }); continue; }
      if (!diaReal(+m[3], +m[2], +m[1])) { out.descartadas.push({ linha: i + 1, motivo: "data inexistente" }); continue; }
      var dia = m[3] + "-" + m[2] + "-" + m[1];
      if (chaveDiaDe(ts) !== dia) { out.descartadas.push({ linha: i + 1, motivo: "timestamp_ms não corresponde à data de data_hora_brt" }); continue; }
      var fx = 0;
      var lim = function (v, faixa) { if (v === null) return null; if (v < faixa[0] || v > faixa[1]) { fx++; return null; } return v; };
      var brutoCh = idx.rain_interval_mm !== undefined ? c[idx.rain_interval_mm] : undefined;
      var ch = idx.rain_interval_mm !== undefined ? num(brutoCh) : null;
      var chInv = false;
      if (idx.rain_interval_mm !== undefined && brutoCh !== undefined && String(brutoCh).trim() !== "" && (ch === null || ch < 0)) { chInv = true; ch = null; }
      out.push({
        ts: ts,
        dia: dia,
        t: idx.temperature_c !== undefined ? lim(num(c[idx.temperature_c]), LIMITES_FISICOS.t) : null,
        u: idx.humidity_percent !== undefined ? lim(num(c[idx.humidity_percent]), LIMITES_FISICOS.u) : null,
        p: idx.pressure_hpa !== undefined ? lim(num(c[idx.pressure_hpa]), LIMITES_FISICOS.p) : null,
        v: idx.wind_speed_kmh !== undefined ? lim(num(c[idx.wind_speed_kmh]), LIMITES_FISICOS.v) : null,
        ch: ch,
        chInv: chInv,
        nv: idx.water_level_m !== undefined ? num(c[idx.water_level_m]) : null,
        rad: idx.solar_radiation_wm2 !== undefined ? lim(num(c[idx.solar_radiation_wm2]), LIMITES_FISICOS.rad) : null,
        fx: 0,
        nome: idx.alias !== undefined && c[idx.alias] ? c[idx.alias].trim() : "",
        sn: idx.sn !== undefined && c[idx.sn] ? c[idx.sn].trim() : "",
        cat: idx.category !== undefined && c[idx.category] ? c[idx.category].trim().toLowerCase() : ""
      });
      out[out.length - 1].fx = fx;
    }
    return out;
  }

  function r3(v) { return Math.round(v * 1000) / 1000; }

  function mediana(v) {
    if (!v.length) return null;
    var s = v.slice().sort(function (a, b) { return a - b; });
    var m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  function vetor(n, ini) { var a = []; for (var i = 0; i < n; i++) a.push(ini); return a; }

  // Resume as leituras por dia civil (BRT). Além dos totais, guarda o que permite validar janelas móveis depois:
  // hMm/hN = soma de chuva e nº de leituras válidas por hora; lacunas = intervalos sem leitura válida; dup/inv/foraOrdem.
  function resumir(rows) {
    var foraOrdem = {};
    for (var q = 1; q < rows.length; q++) {
      if (rows[q].ts < rows[q - 1].ts) foraOrdem[rows[q].dia] = (foraOrdem[rows[q].dia] || 0) + 1;
    }
    var ordenadas = rows.slice().sort(function (a, b) { return a.ts - b.ts; });
    var dup = {};
    rows = ordenadas.filter(function (r, i) {
      if (i > 0 && r.ts === ordenadas[i - 1].ts) { dup[r.dia] = (dup[r.dia] || 0) + 1; return false; }
      return true;
    });
    var D = {};
    rows.forEach(function (r) {
      var d = D[r.dia] || (D[r.dia] = {
        n: 0, chuva: 0, nChuva: 0, inv: 0, fx: 0, tmin: null, tmax: null, uSoma: 0, uN: 0,
        pmin: null, pmax: null, vmax: null, radmax: null, c10: 0, c60: 0,
        nvMin: null, nvMax: null, nvSoma: 0, nNivel: 0,
        hMm: vetor(24, null), hN: vetor(24, 0), hNv: vetor(24, 0), lacunas: [], lacunasTrunc: false, lacunaMaxMs: 0
      });
      var h = horaDe(r.ts);
      d.n++;
      if (r.chInv) d.inv++;
      if (r.fx) d.fx += r.fx;
      if (r.ch !== null && r.ch !== undefined) {
        d.chuva += r.ch; d.nChuva++;
        d.hMm[h] = (d.hMm[h] === null ? 0 : d.hMm[h]) + r.ch;
        d.hN[h]++;
      }
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
        d.hNv[h]++;
      }
    });

    // intervalo típico entre leituras válidas de chuva e lacunas (maiores que FATOR_LACUNA x o intervalo típico)
    var validas = rows.filter(function (r) { return r.ch !== null && r.ch !== undefined; });
    var difs = [];
    for (var a = 1; a < validas.length; a++) difs.push(validas[a].ts - validas[a - 1].ts);
    var med = mediana(difs);
    if (med !== null) {
      for (var b = 1; b < validas.length; b++) {
        var dif = validas[b].ts - validas[b - 1].ts;
        if (dif > FATOR_LACUNA * med) {
          var dl = D[validas[b].dia];
          if (dl.lacunas.length < MAX_LACUNAS_POR_DIA) dl.lacunas.push([validas[b - 1].ts, validas[b].ts]);
          else dl.lacunasTrunc = true;
          if (dif > dl.lacunaMaxMs) dl.lacunaMaxMs = dif;
        }
      }
    }

    // maior chuva em 10 min e em 60 min (janela termina no minuto, vale para o dia dele); leitura sem valor não soma nada
    var i10 = 0, i60 = 0, s10 = 0, s60 = 0;
    rows.forEach(function (r) {
      var c = r.ch === null || r.ch === undefined ? 0 : r.ch; s10 += c; s60 += c;
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
      var cobHoras = d.hN.filter(function (x) { return x > 0; }).length;
      var cobHorasNivel = d.hNv.filter(function (x) { return x > 0; }).length;
      out[k] = {
        v: 3,
        n: d.n,
        chuva: d.nChuva ? Math.round(d.chuva * 10) / 10 : null,
        nChuva: d.nChuva,
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
        nNivel: d.nNivel,
        hMm: d.hMm.map(function (x) { return x === null ? null : r3(x); }),
        hN: d.hN,
        hNv: d.hNv,
        intMin: med === null ? null : Math.round(med / 600) / 100,
        lacunas: d.lacunas,
        lacunasTrunc: d.lacunasTrunc,
        lacunaMaxMin: Math.round(d.lacunaMaxMs / 600) / 100,
        dup: dup[k] || 0,
        inv: d.inv,
        foraFaixa: d.fx,
        foraOrdem: foraOrdem[k] || 0,
        cobHoras: cobHoras,
        cobHorasNivel: cobHorasNivel,
        chuvaCompleta: cobHoras === 24 && !d.lacunas.length && !d.lacunasTrunc
      };
    });
    return out;
  }

  // ---------- Janelas móveis com validação de cobertura ----------
  // Verifica se TODAS as horas de [iniMs, fimMs) (múltiplos de 1 h, BRT) têm leitura válida de chuva e se nenhuma lacuna
  // registrada cruza a janela. Só então "soma" é um acumulado completo; caso contrário valor = null (nunca soma parcial).
  function coberturaJanela(dias, iniMs, fimMs) {
    var esperadas = Math.round((fimMs - iniMs) / HORA_MS);
    var soma = 0, comDado = 0, leituras = 0, legado = false, diasCom = {};
    for (var H = iniMs; H < fimMs; H += HORA_MS) {
      var d = dias[chaveDiaDe(H)];
      if (!d) continue;
      if (!Array.isArray(d.hN) || !Array.isArray(d.hMm)) { legado = true; continue; }
      var h = horaDe(H);
      if (d.hN[h] > 0 && typeof d.hMm[h] === "number") {
        soma += d.hMm[h]; comDado++; leituras += d.hN[h]; diasCom[chaveDiaDe(H)] = true;
      }
    }
    var nLac = 0, trunc = false;
    for (var t = iniMs - 24 * HORA_MS; t <= fimMs + 24 * HORA_MS; t += 24 * HORA_MS) {
      var dd = dias[chaveDiaDe(t)];
      if (!dd) continue;
      if (dd.lacunasTrunc && t < fimMs && t + 24 * HORA_MS > iniMs) trunc = true;
      (dd.lacunas || []).forEach(function (g) { if (g[0] < fimMs && g[1] > iniMs) nLac++; });
    }
    var ok = comDado === esperadas && nLac === 0 && !trunc;
    var motivo = "";
    if (!ok) {
      var partes = [];
      if (legado) partes.push("dia(s) guardado(s) sem detalhe horário (reimporte o CSV)");
      if (comDado < esperadas) partes.push((esperadas - comDado) + " de " + esperadas + " hora(s) da janela sem leitura válida de chuva");
      if (nLac) partes.push(nLac + " lacuna(s) maior(es) que " + FATOR_LACUNA + "x o intervalo típico entre leituras");
      if (trunc) partes.push("lacunas demais para detalhar");
      motivo = partes.join("; ");
    }
    return {
      ok: ok, valor: ok ? Math.round(soma * 10) / 10 : null, minimoParcial: comDado ? Math.round(soma * 10) / 10 : null,
      horasEsperadas: esperadas, horasComDado: comDado, leituras: leituras, lacunas: nLac,
      cobertura: esperadas ? comDado / esperadas : 0, diasComDado: Object.keys(diasCom).length, legado: legado, motivo: motivo
    };
  }

  function janela(c) {
    return {
      estado: c.ok ? "OK" : "SEM_DADOS_SUFICIENTES", valor: c.valor, minimoParcial: c.minimoParcial, motivo: c.motivo,
      horasEsperadas: c.horasEsperadas, horasComDado: c.horasComDado, leituras: c.leituras, lacunas: c.lacunas,
      cobertura: c.cobertura, diasComDado: c.diasComDado
    };
  }

  // Acumulado móvel de nHoras que termina em fimMs (início de uma hora BRT).
  function acumuladoMovel(dias, fimMs, nHoras) {
    return janela(coberturaJanela(dias || {}, fimMs - nHoras * HORA_MS, fimMs));
  }

  function rotuloHora(ms) {
    var h = horaDe(ms - 1) + 1; // fim da hora anterior
    return (h === 24 ? "24" : (h < 10 ? "0" : "") + h) + ":00";
  }

  // Janelas de um dia civil, todas terminando no fim da última hora com leitura de chuva desse dia:
  // civil (chuva do dia), max60 (maior acumulado em 60 min do dia), mov24 e mov168 (acumulados móveis).
  function janelasDoDia(dias, dataIso) {
    var d = dias && dias[dataIso];
    if (!d) return null;
    var ini = inicioDoDia(dataIso);
    var civil = { valor: typeof d.chuva === "number" ? d.chuva : null, completo: d.chuvaCompleta === true ? true : (d.chuvaCompleta === false ? false : null), leituras: d.nChuva === undefined ? null : d.nChuva };
    var vazio = function (motivo) {
      return { estado: "SEM_DADOS_SUFICIENTES", valor: null, minimoParcial: null, motivo: motivo, horasEsperadas: 0, horasComDado: 0, leituras: 0, lacunas: 0, cobertura: 0, diasComDado: 0 };
    };
    if (!Array.isArray(d.hN) || !Array.isArray(d.hMm)) {
      var mot = "dia guardado sem detalhe horário (versão anterior): reimporte o CSV para calcular janelas móveis";
      return { dataIso: dataIso, fimMs: ini + 24 * HORA_MS, fimRotulo: "24:00", civil: civil, max60: vazio(mot), mov24: vazio(mot), mov168: vazio(mot) };
    }
    var ult = -1;
    for (var h = 23; h >= 0; h--) { if (d.hN[h] > 0) { ult = h; break; } }
    if (ult < 0) {
      var mot2 = "sem leitura válida de chuva neste dia";
      return { dataIso: dataIso, fimMs: ini + 24 * HORA_MS, fimRotulo: "24:00", civil: civil, max60: vazio(mot2), mov24: vazio(mot2), mov168: vazio(mot2) };
    }
    var fim = ini + (ult + 1) * HORA_MS;
    var cob60 = coberturaJanela(dias, ini, fim);
    var max60 = janela(cob60);
    // o maior acumulado em 60 min é o do dia (c60), válido só se o dia até o fim da janela estiver coberto
    max60.valor = cob60.ok && typeof d.c60 === "number" ? d.c60 : null;
    max60.minimoParcial = typeof d.c60 === "number" ? d.c60 : null;
    return {
      dataIso: dataIso, fimMs: fim, fimRotulo: rotuloHora(fim), civil: civil, max60: max60,
      mov24: acumuladoMovel(dias, fim, 24), mov168: acumuladoMovel(dias, fim, 168)
    };
  }

  // true = dia completo, false = incompleto, null = desconhecido (guardado por versão anterior).
  function diaCompleto(d) {
    if (!d) return null;
    if (d.chuvaCompleta === true) return true;
    if (d.chuvaCompleta === false) return false;
    return null;
  }

  // Cobertura do nível do rio no dia: completo = pelo menos uma leitura de nível em cada uma das 24 horas.
  function qualidadeNivel(d) {
    if (!d || d.cobHorasNivel === undefined) return { completo: null, horas: null };
    return { completo: d.cobHorasNivel === 24, horas: d.cobHorasNivel };
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

  function clonarBanco(banco) {
    var copia = JSON.parse(JSON.stringify(banco, function (k, v) { return k === "erroCarga" ? undefined : v; }));
    return copia;
  }

  // Carrega o banco. Se o dado guardado estiver ilegível, devolve banco vazio com .erroCarga preenchido
  // (a interface avisa; o conteúdo original é preservado em salvarBanco antes de qualquer gravação).
  function carregarBanco(storage) {
    var st = storage || (typeof localStorage !== "undefined" ? localStorage : null);
    var banco = criarBancoVazio();
    if (!st) return banco;
    try {
      var cru = st.getItem(CHAVE_MULTI);
      var salvo = JSON.parse(cru || "null");
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
    } catch (e) {
      banco.erroCarga = "Os dados guardados das estações estão ilegíveis (" + (e && e.message ? e.message : "JSON inválido") + "). Uma cópia do conteúdo original será preservada antes de qualquer nova gravação.";
      if (typeof console !== "undefined") console.error("[estacao] carregarBanco:", e);
    }
    // Migração automática do formato antigo (cajamar:historico:v1) para o slot est1
    try {
      var v1 = JSON.parse(st.getItem(CHAVE_V1) || "null");
      if (v1 && v1.dias && typeof v1.dias === "object" && Object.keys(v1.dias).length) {
        banco.slots.est1.estacao = v1.estacao || "Estação 1";
        banco.slots.est1.dias = v1.dias;
      }
    } catch (e2) {
      if (typeof console !== "undefined") console.error("[estacao] migração v1:", e2);
    }
    return banco;
  }

  // Texto que sincroniza o formato antigo (v1) com a estação ativa, ou null quando não há dados.
  function calcularV1(banco) {
    var s = banco.slots[banco.ativo];
    if (!s || !Object.keys(s.dias).length) {
      s = banco.slots.est1;
      if (!Object.keys(s.dias).length && Object.keys(banco.slots.est2.dias).length) s = banco.slots.est2;
      else if (!Object.keys(s.dias).length && Object.keys(banco.slots.est3.dias).length) s = banco.slots.est3;
    }
    if (s && Object.keys(s.dias).length) return JSON.stringify({ estacao: s.estacao, dias: s.dias });
    return null;
  }

  function textoBanco(banco) {
    return JSON.stringify(banco, function (k, v) { return k === "erroCarga" ? undefined : v; });
  }

  function salvarBanco(banco, storage) {
    var st = storage || (typeof localStorage !== "undefined" ? localStorage : null);
    if (!st) return false;
    try {
      if (banco.erroCarga) {
        // preserva o conteúdo ilegível antes de sobrescrever
        var cru = st.getItem(CHAVE_MULTI);
        if (cru && !st.getItem(CHAVE_MULTI + ":corrompido")) st.setItem(CHAVE_MULTI + ":corrompido", cru);
        delete banco.erroCarga;
      }
      var esc = {};
      esc[CHAVE_MULTI] = textoBanco(banco);
      esc[CHAVE_V1] = calcularV1(banco);
      gravarAtomico(st, esc); // reverte tudo se qualquer gravação falhar
      return true;
    } catch (e) {
      if (typeof console !== "undefined") console.error("[estacao] salvarBanco:", e);
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

  // ---------- Importação de CSV: validação e plano (nada é gravado aqui) ----------
  // Valida um arquivo { nome, tamanho, texto }: extensão, tamanho, conteúdo texto real e cabeçalho esperado.
  function validarArquivoCsv(a) {
    var erros = [];
    if (!a || typeof a.nome !== "string" || !/\.csv$/i.test(a.nome)) erros.push("extensão diferente de .csv");
    if (!a || typeof a.texto !== "string") { erros.push("conteúdo ilegível"); return erros; }
    var tam = typeof a.tamanho === "number" ? a.tamanho : a.texto.length;
    if (tam <= 0) erros.push("arquivo vazio");
    if (tam > LIMITES_IMPORTACAO.maxBytesArquivo) erros.push("arquivo maior que " + Math.round(LIMITES_IMPORTACAO.maxBytesArquivo / 1048576) + " MB");
    if (a.texto.indexOf("\u0000") >= 0) erros.push("conteúdo binário (não é um CSV de texto)");
    if (erros.length) return erros;
    var primeira = a.texto.replace(/^﻿/, "").split(/\r?\n/).filter(function (l) { return l.trim() !== ""; })[0] || "";
    if (primeira.indexOf(";") < 0) erros.push("cabeçalho sem separador ponto e vírgula");
    return erros;
  }

  // Aplica uma lista de arquivos a uma CÓPIA do banco. Arquivo inválido é rejeitado sozinho e não altera nada;
  // os demais são importados. Devolve { banco, relatorio } — quem chama decide gravar (e só então substitui o banco atual).
  function planejarImportacao(banco, arquivos, destino) {
    var lista = arquivos || [];
    if (!lista.length) throw new Error("nenhum arquivo selecionado");
    if (lista.length > LIMITES_IMPORTACAO.maxArquivos) throw new Error("máximo de " + LIMITES_IMPORTACAO.maxArquivos + " arquivos por importação (selecionados: " + lista.length + ")");
    var total = lista.reduce(function (s, a) { return s + (typeof a.tamanho === "number" ? a.tamanho : String(a.texto || "").length); }, 0);
    if (total > LIMITES_IMPORTACAO.maxBytesTotal) throw new Error("tamanho total maior que " + Math.round(LIMITES_IMPORTACAO.maxBytesTotal / 1048576) + " MB");
    var atual = clonarBanco(banco);
    var relatorio = { importados: [], rejeitados: [] };
    lista.forEach(function (a) {
      var nome = a && a.nome ? a.nome : "(sem nome)";
      if (a && a.erroLeitura) { relatorio.rejeitados.push({ nome: nome, motivo: "falha na leitura do arquivo: " + a.erroLeitura }); return; }
      var errosArq = validarArquivoCsv(a);
      if (errosArq.length) { relatorio.rejeitados.push({ nome: nome, motivo: errosArq.join("; ") }); return; }
      try {
        var rows = lerCsv(a.texto);
        if (!rows.length) throw new Error("nenhuma linha válida" + (rows.descartadas.length ? " (" + rows.descartadas.length + " descartada(s): " + rows.descartadas[0].motivo + ")" : ""));
        var tentativa = clonarBanco(atual);
        var r = mesclarNoSlot(tentativa, lista.length > 1 ? "auto" : (destino || "auto"), rows, nome);
        tentativa.ativo = r.slotId;
        atual = tentativa;
        var resumo = resumir(rows);
        var dups = 0, invs = 0, fora = 0;
        Object.keys(resumo).forEach(function (k) { dups += resumo[k].dup; invs += resumo[k].inv; fora += resumo[k].foraOrdem; });
        r.nome = nome;
        r.descartadas = rows.descartadas.length;
        r.motivosDescartadas = rows.descartadas.slice(0, 3);
        r.duplicados = dups; r.invalidos = invs; r.foraDeOrdem = fora;
        relatorio.importados.push(r);
      } catch (e) {
        relatorio.rejeitados.push({ nome: nome, motivo: e && e.message ? e.message : "formato inesperado" });
      }
    });
    return { banco: atual, relatorio: relatorio, alterado: relatorio.importados.length > 0 };
  }

  // ---------- Limiares (Cotas) da Régua de Nível do Rio ----------
  // ATENÇÃO: os valores padrão NÃO têm fonte técnica documentada nem homologação para o ponto de medição.
  var COTAS_RIO_PADRAO = {
    atencaoM: 1.80,
    alertaM: 2.30,
    transbordoM: 2.80,
    deltaAtencaoCm: 35,
    deltaAlertaCm: 60
  };

  // Número estrito (aceita vírgula decimal). Devolve { v, erro } para mensagens específicas.
  function numEstrito(v) {
    if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) return { erro: "vazio" };
    if (typeof v === "number") {
      if (isNaN(v)) return { erro: "não numérico" };
      if (!isFinite(v)) return { erro: "infinito" };
      return { v: v };
    }
    if (typeof v !== "string") return { erro: "não numérico" };
    var t = v.trim();
    if (/^[-+]?inf(inity)?$/i.test(t)) return { erro: "infinito" };
    if (!/^[-+]?\d+([.,]\d+)?$/.test(t)) return { erro: "não numérico" };
    return { v: parseFloat(t.replace(",", ".")) };
  }

  // Valida as cotas. Obrigatórias: atencaoM, alertaM, transbordoM (> 0, estritamente crescentes).
  // Opcionais (variação diária em cm): deltaAtencaoCm < deltaAlertaCm. Nada é substituído por padrão.
  function validarCotas(c) {
    var erros = [], v = {};
    if (!c || typeof c !== "object") return { ok: false, erros: ["cotas ausentes"], valores: null };
    var nomes = { atencaoM: "Atenção (m)", alertaM: "Alerta (m)", transbordoM: "Transbordamento (m)", deltaAtencaoCm: "Δ Atenção (cm)", deltaAlertaCm: "Δ Alerta (cm)" };
    ["atencaoM", "alertaM", "transbordoM"].forEach(function (k) {
      var r = numEstrito(c[k]);
      if (r.erro) erros.push(nomes[k] + ": " + r.erro);
      else if (r.v < 0) erros.push(nomes[k] + ": negativo");
      else if (r.v === 0) erros.push(nomes[k] + ": deve ser maior que zero");
      else v[k] = r.v;
    });
    ["deltaAtencaoCm", "deltaAlertaCm"].forEach(function (k) {
      if (c[k] === undefined || c[k] === null || (typeof c[k] === "string" && c[k].trim() === "")) return;
      var r = numEstrito(c[k]);
      if (r.erro) erros.push(nomes[k] + ": " + r.erro);
      else if (r.v <= 0) erros.push(nomes[k] + ": deve ser maior que zero");
      else v[k] = r.v;
    });
    if (v.atencaoM !== undefined && v.alertaM !== undefined && !(v.atencaoM < v.alertaM)) erros.push("ordem inválida: Atenção deve ser menor que Alerta");
    if (v.alertaM !== undefined && v.transbordoM !== undefined && !(v.alertaM < v.transbordoM)) erros.push("ordem inválida: Alerta deve ser menor que Transbordamento");
    if (v.deltaAtencaoCm !== undefined && v.deltaAlertaCm !== undefined && !(v.deltaAtencaoCm < v.deltaAlertaCm)) erros.push("ordem inválida: Δ Atenção deve ser menor que Δ Alerta");
    return { ok: erros.length === 0, erros: erros, valores: erros.length ? null : v };
  }

  function cotasPadrao() {
    return {
      atencaoM: COTAS_RIO_PADRAO.atencaoM, alertaM: COTAS_RIO_PADRAO.alertaM, transbordoM: COTAS_RIO_PADRAO.transbordoM,
      deltaAtencaoCm: COTAS_RIO_PADRAO.deltaAtencaoCm, deltaAlertaCm: COTAS_RIO_PADRAO.deltaAlertaCm,
      origem: "padrao", homologada: false, pontoMedicao: "", fonte: "valores padrão do sistema, sem fonte técnica documentada"
    };
  }

  // Cotas em uso. origem "padrao" = ninguém configurou (não classifica); "usuario" = salvas por quem opera o sistema
  // (sem controle de acesso na aplicação e sem homologação). Dado guardado inválido NÃO é trocado em silêncio:
  // volta o padrão com invalida=true e a lista de erros.
  function carregarCotasRio(storage) {
    var st = storage || (typeof localStorage !== "undefined" ? localStorage : null);
    var c = cotasPadrao();
    if (!st) return c;
    var cru;
    try { cru = st.getItem(CHAVE_COTAS_RIO); } catch (e) { c.invalida = true; c.erros = ["armazenamento indisponível"]; return c; }
    if (!cru) return c;
    var salvo;
    try { salvo = JSON.parse(cru); } catch (e2) { c.invalida = true; c.erros = ["cotas guardadas ilegíveis"]; return c; }
    var val = validarCotas(salvo);
    if (!val.ok) { c.invalida = true; c.erros = val.erros; return c; }
    var o = {
      atencaoM: val.valores.atencaoM, alertaM: val.valores.alertaM, transbordoM: val.valores.transbordoM,
      deltaAtencaoCm: val.valores.deltaAtencaoCm !== undefined ? val.valores.deltaAtencaoCm : COTAS_RIO_PADRAO.deltaAtencaoCm,
      deltaAlertaCm: val.valores.deltaAlertaCm !== undefined ? val.valores.deltaAlertaCm : COTAS_RIO_PADRAO.deltaAlertaCm,
      origem: "usuario", homologada: false,
      pontoMedicao: typeof salvo.pontoMedicao === "string" ? salvo.pontoMedicao.slice(0, 200) : "",
      fonte: typeof salvo.fonte === "string" && salvo.fonte ? salvo.fonte.slice(0, 300) : "definidas por quem opera o sistema, sem homologação documentada",
      salvoEm: typeof salvo.salvoEm === "string" ? salvo.salvoEm : ""
    };
    return o;
  }

  // Salva as cotas depois de validar o conjunto. Entrada inválida LANÇA erro (nada é gravado nem substituído).
  function salvarCotasRio(novasCotas, storage) {
    var st = storage || (typeof localStorage !== "undefined" ? localStorage : null);
    var base = carregarCotasRio(st);
    var mescla = {
      atencaoM: base.atencaoM, alertaM: base.alertaM, transbordoM: base.transbordoM,
      deltaAtencaoCm: base.deltaAtencaoCm, deltaAlertaCm: base.deltaAlertaCm
    };
    var entrada = novasCotas && typeof novasCotas === "object" ? novasCotas : {};
    ["atencaoM", "alertaM", "transbordoM", "deltaAtencaoCm", "deltaAlertaCm"].forEach(function (k) {
      if (Object.prototype.hasOwnProperty.call(entrada, k)) mescla[k] = entrada[k];
    });
    var val = validarCotas(mescla);
    if (!val.ok) throw new Error("Cotas inválidas: " + val.erros.join("; "));
    var gravar = {
      atencaoM: val.valores.atencaoM, alertaM: val.valores.alertaM, transbordoM: val.valores.transbordoM,
      deltaAtencaoCm: val.valores.deltaAtencaoCm !== undefined ? val.valores.deltaAtencaoCm : COTAS_RIO_PADRAO.deltaAtencaoCm,
      deltaAlertaCm: val.valores.deltaAlertaCm !== undefined ? val.valores.deltaAlertaCm : COTAS_RIO_PADRAO.deltaAlertaCm,
      homologada: false,
      pontoMedicao: typeof entrada.pontoMedicao === "string" ? entrada.pontoMedicao.slice(0, 200) : (base.pontoMedicao || ""),
      fonte: typeof entrada.fonte === "string" && entrada.fonte ? entrada.fonte.slice(0, 300) : (base.origem === "usuario" ? base.fonte : "definidas por quem opera o sistema, sem homologação documentada"),
      salvoEm: new Date().toISOString()
    };
    if (!st) throw new Error("Armazenamento indisponível: as cotas não foram salvas");
    try { st.setItem(CHAVE_COTAS_RIO, JSON.stringify(gravar)); }
    catch (e) { throw new Error("Não foi possível gravar as cotas neste navegador: " + (e && e.message ? e.message : "erro de armazenamento")); }
    return carregarCotasRio(st);
  }

  function fm(v) { return v.toFixed(2).replace(".", ","); }

  // Avalia o nível do rio. Sem cotas válidas e configuradas, ou sem cobertura do dia para afirmar normalidade,
  // NÃO classifica ("Referência não validada" / "Dados insuficientes"). qualidade = Estacao.qualidadeNivel(dia), opcional.
  function avaliarNivelRio(nvMax, nvDelta, cotas, qualidade) {
    var c = cotas || carregarCotasRio();
    var m = typeof nvMax === "number" && isFinite(nvMax) ? nvMax : null;
    var dCm = typeof nvDelta === "number" && isFinite(nvDelta) ? Math.round(nvDelta * 100) : null;
    var base = { nivel: null, corFundo: "#64748b", corBorda: "#475569", corTexto: "#ffffff", icone: "⚪", parametrosHomologados: false };
    if (m === null) {
      return Object.assign({}, base, { id: "sem_dado", estado: "Sem leitura", motivo: "Sem leitura de nível do rio." });
    }
    var val = validarCotas(c);
    if (!val.ok) {
      return Object.assign({}, base, { id: "sem_referencia", estado: "Referência inválida", motivo: "Nível máximo observado: " + fm(m) + " m. Cotas inválidas (" + val.erros.join("; ") + "): sem classificação." });
    }
    if (c.origem === "padrao") {
      return Object.assign({}, base, { id: "sem_referencia", estado: "Referência não validada", motivo: "Nível máximo observado: " + fm(m) + " m. As cotas em uso são os valores padrão, sem fonte técnica nem homologação para o ponto de medição; informe e valide as cotas para classificar." });
    }
    var dAt = val.valores.deltaAtencaoCm !== undefined ? val.valores.deltaAtencaoCm : (typeof c.deltaAtencaoCm === "number" ? c.deltaAtencaoCm : null);
    var dAl = val.valores.deltaAlertaCm !== undefined ? val.valores.deltaAlertaCm : (typeof c.deltaAlertaCm === "number" ? c.deltaAlertaCm : null);
    var aviso = " Parâmetros definidos pelo usuário, sem homologação técnica documentada.";
    if (m >= c.transbordoM) {
      return {
        nivel: 3, id: "transbordo", estado: "Cota de Transbordamento / Inundação", icone: "🔴", corFundo: "#991b1b", corBorda: "#7f1d1d", corTexto: "#ffffff",
        parametrosHomologados: false,
        motivo: "Nível máximo (" + fm(m) + " m) atingiu/ultrapassou a cota de transbordamento (" + fm(c.transbordoM) + " m)." + aviso
      };
    }
    if (m >= c.alertaM || (dCm !== null && dAl !== null && dCm >= dAl)) {
      return {
        nivel: 2, id: "alerta", estado: "Alerta Hidrológico (Cheia)", icone: "🟠", corFundo: "#f97316", corBorda: "#c2410c", corTexto: "#111827",
        parametrosHomologados: false,
        motivo: (m >= c.alertaM
          ? "Nível (" + fm(m) + " m) atingiu a cota de alerta (" + fm(c.alertaM) + " m)."
          : "Subida abrupta do rio (+" + dCm + " cm no dia ≥ " + dAl + " cm).") + aviso
      };
    }
    if (m >= c.atencaoM || (dCm !== null && dAt !== null && dCm >= dAt)) {
      return {
        nivel: 1, id: "atencao", estado: "Atenção Hidrológica", icone: "🟡", corFundo: "#facc15", corBorda: "#ca8a04", corTexto: "#1f2937",
        parametrosHomologados: false,
        motivo: (m >= c.atencaoM
          ? "Nível (" + fm(m) + " m) atingiu a cota de atenção (" + fm(c.atencaoM) + " m)."
          : "Elevação moderada do rio (+" + dCm + " cm no dia ≥ " + dAt + " cm).") + aviso
      };
    }
    // abaixo de todas as cotas: só se afirma "normal" com cobertura do dia (um pico pode estar nas horas sem leitura)
    if (qualidade && qualidade.completo !== true) {
      return Object.assign({}, base, {
        id: "dados_insuficientes", estado: "Dados insuficientes",
        motivo: "Nível máximo observado: " + fm(m) + " m, abaixo das cotas, mas o dia não tem leitura de nível em todas as 24 horas" + (qualidade.horas !== null && qualidade.horas !== undefined ? " (" + qualidade.horas + "/24)" : " (sem detalhe horário)") + ": não é possível afirmar normalidade."
      });
    }
    return {
      nivel: 0, id: "normal", estado: "Abaixo das cotas informadas", icone: "🟢", corFundo: "#4ade80", corBorda: "#16a34a", corTexto: "#052e16",
      parametrosHomologados: false,
      motivo: "Nível (" + fm(m) + " m) abaixo da cota de atenção (" + fm(c.atencaoM) + " m)." + aviso
    };
  }

  // ---------- Backup Unificado do Sistema (Estações + Régua + Cotas + Ocorrências + Observações) ----------
  function lerJsonChave(st, chave, padrao) {
    var cru = st.getItem(chave);
    if (cru === null || cru === undefined || cru === "") return padrao;
    return JSON.parse(cru);
  }

  function gerarBackupCompleto(storage) {
    var st = storage || (typeof localStorage !== "undefined" ? localStorage : null);
    var banco = carregarBanco(st);
    var cotas = carregarCotasRio(st);
    var ocorrencias = [];
    var observacoes = [];
    var contato = "";
    if (st) {
      // erro de leitura NÃO vira backup vazio em silêncio
      ocorrencias = lerJsonChave(st, CHAVE_OCORRENCIAS, []);
      observacoes = lerJsonChave(st, CHAVE_OBSERVACOES, []);
      contato = st.getItem(CHAVE_CONTATO) || "";
    }
    return {
      sistema: "cajamar-ao-vivo-backup-completo",
      versao: 2,
      exportadoEm: new Date().toISOString(),
      estacoes: JSON.parse(textoBanco(banco)),
      cotasRio: cotas,
      ocorrencias: Array.isArray(ocorrencias) ? ocorrencias : [],
      observacoes: Array.isArray(observacoes) ? observacoes : [],
      contato: contato
    };
  }

  var CAMPOS_DIA_NUM = ["n", "chuva", "nChuva", "tmin", "tmax", "umid", "pmin", "pmax", "vmax", "radmax", "c10", "c60", "nvMin", "nvMax", "nvMed", "nvDelta", "nNivel", "intMin", "lacunaMaxMin", "dup", "inv", "foraFaixa", "foraOrdem", "cobHoras", "cobHorasNivel", "v"];
  var MAX_DIAS_POR_SLOT = 3700;

  function ehNumOuNull(x) { return x === null || (typeof x === "number" && isFinite(x)); }

  // Valida e devolve uma cópia LIMPA (só campos conhecidos) do resumo de um dia; erros vão para a lista.
  function sanitizarDia(k, d, erros, ctx) {
    var rot = ctx + " dia " + k;
    if (!d || typeof d !== "object" || Array.isArray(d)) { erros.push(rot + ": formato inválido"); return null; }
    var out = {};
    if (typeof d.n !== "number" || !isFinite(d.n) || d.n < 0 || Math.floor(d.n) !== d.n) { erros.push(rot + ": n (nº de leituras) inválido"); return null; }
    CAMPOS_DIA_NUM.forEach(function (f) {
      if (d[f] === undefined) return;
      if (!ehNumOuNull(d[f])) { erros.push(rot + ": campo " + f + " inválido"); return; }
      if ((f === "chuva" || f === "c10" || f === "c60" || f === "nChuva" || f === "dup" || f === "inv" || f === "foraOrdem") && d[f] !== null && d[f] < 0) { erros.push(rot + ": " + f + " negativo"); return; }
      out[f] = d[f];
    });
    ["hMm", "hN", "hNv"].forEach(function (f) {
      if (d[f] === undefined) return;
      if (!Array.isArray(d[f]) || d[f].length !== 24) { erros.push(rot + ": " + f + " deve ter 24 valores"); return; }
      for (var i = 0; i < 24; i++) {
        var x = d[f][i];
        if (f === "hMm" ? !(x === null || (typeof x === "number" && isFinite(x) && x >= 0)) : !(typeof x === "number" && isFinite(x) && x >= 0 && Math.floor(x) === x)) { erros.push(rot + ": " + f + "[" + i + "] inválido"); return; }
      }
      out[f] = d[f].slice();
    });
    if (d.lacunas !== undefined) {
      if (!Array.isArray(d.lacunas) || d.lacunas.length > MAX_LACUNAS_POR_DIA) { erros.push(rot + ": lacunas inválidas"); }
      else {
        var ok = d.lacunas.every(function (g) { return Array.isArray(g) && g.length === 2 && isFinite(g[0]) && isFinite(g[1]) && g[0] < g[1]; });
        if (!ok) erros.push(rot + ": lacunas inválidas"); else out.lacunas = d.lacunas.map(function (g) { return [g[0], g[1]]; });
      }
    }
    ["lacunasTrunc", "chuvaCompleta"].forEach(function (f) {
      if (d[f] === undefined) return;
      if (typeof d[f] !== "boolean") erros.push(rot + ": " + f + " inválido"); else out[f] = d[f];
    });
    if (out.tmin !== undefined && out.tmax !== undefined && out.tmin !== null && out.tmax !== null && out.tmin > out.tmax) erros.push(rot + ": temperatura mínima maior que a máxima");
    if (out.nvMin !== undefined && out.nvMax !== undefined && out.nvMin !== null && out.nvMax !== null && out.nvMin > out.nvMax) erros.push(rot + ": nível mínimo maior que o máximo");
    return out;
  }

  function dataIsoValida(k) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(k);
    return !!m && diaReal(+m[1], +m[2], +m[3]);
  }

  function ehTextoCurto(x, max) { return typeof x === "string" && x.length <= max; }

  function validarObservacao(r) {
    return r && typeof r === "object" && ehTextoCurto(r.id, 100) && ehTextoCurto(r.local, 300) && typeof r.quando === "string" && !isNaN(new Date(r.quando)) &&
      (r.chuvaMm === null || r.chuvaMm === undefined || (typeof r.chuvaMm === "number" && isFinite(r.chuvaMm) && r.chuvaMm >= 0)) &&
      (r.ventoKmh === null || r.ventoKmh === undefined || (typeof r.ventoKmh === "number" && isFinite(r.ventoKmh) && r.ventoKmh >= 0));
  }

  // Valida o backup INTEIRO sem tocar no armazenamento. Devolve { ok, erros, dados } (dados = versão limpa).
  function validarBackup(obj) {
    var erros = [];
    function e(m) { if (erros.length < 50) erros.push(m); }
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return { ok: false, erros: ["arquivo de backup inválido (não é um objeto)"], dados: null };
    if (obj.sistema !== "cajamar-ao-vivo-backup-completo") e("sistema do backup não reconhecido");
    if (obj.versao !== 2) e("versão do backup não suportada (" + String(obj.versao) + "); esperada 2");
    var dados = { slots: {}, cotas: null, ocorrencias: [], observacoes: [], contato: "" };

    if (obj.estacoes !== undefined) {
      var est = obj.estacoes;
      if (!est || typeof est !== "object" || !est.slots || typeof est.slots !== "object") e("estrutura de estações inválida");
      else {
        Object.keys(est.slots).forEach(function (id) {
          if (!SLOTS_PADRAO.some(function (s) { return s.id === id; })) { e("estação desconhecida: " + id); return; }
          var sl = est.slots[id];
          if (!sl || typeof sl !== "object" || !sl.dias || typeof sl.dias !== "object" || Array.isArray(sl.dias)) { e("estação " + id + ": estrutura inválida"); return; }
          if (sl.estacao !== undefined && !ehTextoCurto(sl.estacao, 200)) e("estação " + id + ": nome inválido");
          if (sl.sn !== undefined && !ehTextoCurto(sl.sn, 100)) e("estação " + id + ": sn inválido");
          if (sl.tipo !== undefined && ["meteorologica", "nivel", "ambos"].indexOf(sl.tipo) < 0) e("estação " + id + ": tipo inválido");
          var chaves = Object.keys(sl.dias);
          if (chaves.length > MAX_DIAS_POR_SLOT) { e("estação " + id + ": dias demais (" + chaves.length + ")"); return; }
          var limpo = { estacao: sl.estacao || "", sn: sl.sn || "", tipo: sl.tipo || null, dias: {} };
          chaves.forEach(function (k) {
            if (!dataIsoValida(k)) { e("estação " + id + ": data inválida (" + k + ")"); return; }
            var antes = erros.length;
            var dl = sanitizarDia(k, sl.dias[k], erros, "estação " + id);
            if (dl && erros.length === antes) limpo.dias[k] = dl;
          });
          dados.slots[id] = limpo;
        });
      }
    }
    if (obj.cotasRio !== undefined && obj.cotasRio !== null) {
      var vc = validarCotas(obj.cotasRio);
      if (!vc.ok) vc.erros.forEach(function (m) { e("cotas do rio: " + m); });
      else dados.cotas = vc.valores;
    }
    if (obj.ocorrencias !== undefined) {
      if (!Array.isArray(obj.ocorrencias) || obj.ocorrencias.length > 5000) e("ocorrências inválidas");
      else obj.ocorrencias.forEach(function (r, i) {
        if (!r || typeof r !== "object" || !ehTextoCurto(r.id, 100) || !r.id) { e("ocorrência " + (i + 1) + ": id inválido"); return; }
        if (JSON.stringify(r).length > 200000) { e("ocorrência " + r.id + ": grande demais"); return; }
        dados.ocorrencias.push(r);
      });
    }
    if (obj.observacoes !== undefined) {
      if (!Array.isArray(obj.observacoes) || obj.observacoes.length > 20000) e("observações inválidas");
      else obj.observacoes.forEach(function (r, i) {
        if (!validarObservacao(r) || !r.id) { e("observação " + (i + 1) + ": estrutura inválida (id, local, data ou valores)"); return; }
        dados.observacoes.push(r);
      });
    }
    if (obj.contato !== undefined && obj.contato !== null && obj.contato !== "") {
      if (!ehTextoCurto(obj.contato, 300)) e("contato inválido"); else dados.contato = obj.contato;
    }
    return { ok: erros.length === 0, erros: erros, dados: erros.length ? null : dados };
  }

  function gravarAtomico(st, escritas) {
    var chaves = Object.keys(escritas);
    var snap = {};
    chaves.forEach(function (k) { snap[k] = st.getItem(k); });
    try {
      chaves.forEach(function (k) {
        if (escritas[k] === null) st.removeItem(k); else st.setItem(k, escritas[k]);
      });
      chaves.forEach(function (k) {
        var lido = st.getItem(k);
        if (escritas[k] === null ? lido !== null : lido !== escritas[k]) throw new Error("a gravação de " + k + " não foi confirmada");
      });
    } catch (err) {
      var falhasRev = [];
      chaves.forEach(function (k) {
        try { if (snap[k] === null) st.removeItem(k); else st.setItem(k, snap[k]); } catch (e2) { falhasRev.push(k); }
      });
      throw new Error("Restauração revertida: " + (err && err.message ? err.message : "erro de armazenamento") + (falhasRev.length ? " (ATENÇÃO: não foi possível reverter " + falhasRev.join(", ") + ")" : "") + ".");
    }
  }

  // Restaura o backup de forma ATÔMICA (tanto quanto o localStorage permite): valida tudo, prepara todas as gravações em
  // memória, grava e confere; qualquer falha reverte e lança erro. Estações são MESCLADAS por dia (nunca substitui o banco).
  function restaurarBackupCompleto(dadosJson, storage) {
    var st = storage || (typeof localStorage !== "undefined" ? localStorage : null);
    if (!st) throw new Error("Armazenamento indisponível: nada foi restaurado.");
    var obj;
    if (typeof dadosJson === "string") {
      if (dadosJson.length > LIMITE_BACKUP_BYTES) throw new Error("Backup maior que " + Math.round(LIMITE_BACKUP_BYTES / 1048576) + " MB: nada foi restaurado.");
      try { obj = JSON.parse(dadosJson); } catch (err) { throw new Error("Arquivo de backup não é um JSON válido: nada foi restaurado."); }
    } else obj = dadosJson;
    var val = validarBackup(obj);
    if (!val.ok) {
      var err2 = new Error("Backup inválido, nada foi restaurado: " + val.erros.slice(0, 5).join(" | ") + (val.erros.length > 5 ? " (+" + (val.erros.length - 5) + " erro(s))" : ""));
      err2.erros = val.erros;
      throw err2;
    }
    var d = val.dados;
    var escritas = {};
    var resumo = { estacoesRestauradas: 0, diasAdicionados: 0, diasAtualizados: 0, diasMantidos: 0, ocorrenciasNovas: 0, observacoesNovas: 0, cotas: "ausentes no backup", contato: "ausente no backup", avisos: [] };

    // estações: mescla por dia (maior nº de leituras vence; empate = backup)
    var bancoAtual = carregarBanco(st);
    if (bancoAtual.erroCarga) throw new Error("Os dados atuais das estações estão ilegíveis; restauração não executada para não sobrescrevê-los. Exporte/guarde o conteúdo e limpe-o manualmente.");
    var novoBanco = clonarBanco(bancoAtual);
    Object.keys(d.slots).forEach(function (id) {
      var b = d.slots[id], sl = novoBanco.slots[id], tocou = false;
      Object.keys(b.dias).forEach(function (k) {
        if (!sl.dias[k]) { sl.dias[k] = b.dias[k]; resumo.diasAdicionados++; tocou = true; }
        else if (b.dias[k].n >= sl.dias[k].n) { sl.dias[k] = b.dias[k]; resumo.diasAtualizados++; tocou = true; }
        else resumo.diasMantidos++;
      });
      if (tocou) {
        resumo.estacoesRestauradas++;
        if (!sl.estacao && b.estacao) sl.estacao = b.estacao;
        if (!sl.sn && b.sn) sl.sn = b.sn;
        if (b.tipo) sl.tipo = b.tipo;
      }
    });
    if (resumo.diasAdicionados || resumo.diasAtualizados) {
      escritas[CHAVE_MULTI] = textoBanco(novoBanco);
      escritas[CHAVE_V1] = calcularV1(novoBanco);
    }

    // cotas: só aplica se o sistema ainda estiver com as cotas padrão (não sobrescreve configuração existente)
    if (d.cotas) {
      var atuaisCotas = carregarCotasRio(st);
      if (atuaisCotas.origem === "padrao") {
        escritas[CHAVE_COTAS_RIO] = JSON.stringify({
          atencaoM: d.cotas.atencaoM, alertaM: d.cotas.alertaM, transbordoM: d.cotas.transbordoM,
          deltaAtencaoCm: d.cotas.deltaAtencaoCm !== undefined ? d.cotas.deltaAtencaoCm : COTAS_RIO_PADRAO.deltaAtencaoCm,
          deltaAlertaCm: d.cotas.deltaAlertaCm !== undefined ? d.cotas.deltaAlertaCm : COTAS_RIO_PADRAO.deltaAlertaCm,
          homologada: false, fonte: "restauradas de backup, sem homologação documentada", pontoMedicao: "", salvoEm: new Date().toISOString()
        });
        resumo.cotas = "aplicadas";
      } else {
        resumo.cotas = "mantidas as cotas atuais (já configuradas)";
        resumo.avisos.push("As cotas do backup não foram aplicadas porque já existem cotas configuradas neste navegador.");
      }
    }

    // ocorrências e observações: acrescenta as que ainda não existem (por id)
    [["ocorrencias", CHAVE_OCORRENCIAS, "ocorrenciasNovas"], ["observacoes", CHAVE_OBSERVACOES, "observacoesNovas"]].forEach(function (t) {
      if (!d[t[0]].length) return;
      var atuais;
      try { atuais = lerJsonChave(st, t[1], []); } catch (e3) { throw new Error("Os dados atuais de " + t[0] + " estão ilegíveis; restauração não executada para não sobrescrevê-los."); }
      if (!Array.isArray(atuais)) throw new Error("Os dados atuais de " + t[0] + " têm formato inesperado; restauração não executada.");
      var ids = {};
      atuais.forEach(function (r) { if (r && r.id) ids[r.id] = true; });
      var novos = 0;
      d[t[0]].forEach(function (r) { if (!ids[r.id]) { atuais.push(r); ids[r.id] = true; novos++; } });
      if (novos) { escritas[t[1]] = JSON.stringify(atuais); resumo[t[2]] = novos; }
    });

    if (d.contato) {
      var contatoAtual = st.getItem(CHAVE_CONTATO);
      if (!contatoAtual) { escritas[CHAVE_CONTATO] = d.contato; resumo.contato = "restaurado"; }
      else { resumo.contato = "mantido o contato atual"; }
    }

    if (Object.keys(escritas).length) gravarAtomico(st, escritas);
    resumo.gravados = Object.keys(escritas).length;
    return resumo;
  }

  w.Estacao = {
    SLOTS_PADRAO: SLOTS_PADRAO,
    COTAS_RIO_PADRAO: COTAS_RIO_PADRAO,
    LIMITES_IMPORTACAO: LIMITES_IMPORTACAO,
    FATOR_LACUNA: FATOR_LACUNA,
    LIMITES_FISICOS: LIMITES_FISICOS,
    lerCsv: lerCsv,
    resumir: resumir,
    coberturaJanela: coberturaJanela,
    acumuladoMovel: acumuladoMovel,
    janelasDoDia: janelasDoDia,
    diaCompleto: diaCompleto,
    qualidadeNivel: qualidadeNivel,
    detectarTipo: detectarTipo,
    criarBancoVazio: criarBancoVazio,
    clonarBanco: clonarBanco,
    carregarBanco: carregarBanco,
    salvarBanco: salvarBanco,
    escolherSlotAutomatico: escolherSlotAutomatico,
    mesclarNoSlot: mesclarNoSlot,
    validarArquivoCsv: validarArquivoCsv,
    planejarImportacao: planejarImportacao,
    validarCotas: validarCotas,
    carregarCotasRio: carregarCotasRio,
    salvarCotasRio: salvarCotasRio,
    avaliarNivelRio: avaliarNivelRio,
    gerarBackupCompleto: gerarBackupCompleto,
    validarBackup: validarBackup,
    restaurarBackupCompleto: restaurarBackupCompleto
  };
})(typeof window !== "undefined" ? window : globalThis);
