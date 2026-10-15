// Leitura do CSV da estação meteorológica e resumo por dia. Sem dependência de página (pode ser testado no Node).
(function (w) {
  "use strict";
  function num(s) { if (s === undefined || s === null || s === "") return null; var v = parseFloat(String(s).replace(",", ".")); return isFinite(v) ? v : null; }

  // Divide o CSV (delimitador ";", decimal com vírgula) em linhas de objetos.
  function lerCsv(texto) {
    var linhas = texto.replace(/^﻿/, "").split(/\r?\n/).filter(function (l) { return l.trim() !== ""; });
    if (linhas.length < 2) throw new Error("arquivo vazio");
    var cab = linhas[0].split(";");
    var precisa = ["data_hora_brt", "timestamp_ms", "temperature_c", "rain_interval_mm"];
    var faltam = precisa.filter(function (c) { return cab.indexOf(c) < 0; });
    if (faltam.length) throw new Error("colunas ausentes: " + faltam.join(", "));
    var idx = {}; cab.forEach(function (c, i) { idx[c] = i; });
    var out = [];
    for (var i = 1; i < linhas.length; i++) {
      var c = linhas[i].split(";");
      var ts = Number(c[idx.timestamp_ms]), dh = c[idx.data_hora_brt] || "";
      var m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(dh);
      if (!isFinite(ts) || !m) continue;
      out.push({
        ts: ts, dia: m[3] + "-" + m[2] + "-" + m[1],
        t: num(c[idx.temperature_c]), u: num(c[idx.humidity_percent]), p: num(c[idx.pressure_hpa]),
        v: num(c[idx.wind_speed_kmh]), ch: num(c[idx.rain_interval_mm]), rad: num(c[idx.solar_radiation_wm2]),
        nome: idx.alias !== undefined ? c[idx.alias] : ""
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
      var d = D[r.dia] || (D[r.dia] = { n: 0, chuva: 0, nChuva: 0, tmin: null, tmax: null, uSoma: 0, uN: 0, pmin: null, pmax: null, vmax: null, radmax: null, c10: 0, c60: 0 });
      d.n++;
      if (r.ch !== null) { d.chuva += r.ch; d.nChuva++; }
      if (r.t !== null) { d.tmin = d.tmin === null ? r.t : Math.min(d.tmin, r.t); d.tmax = d.tmax === null ? r.t : Math.max(d.tmax, r.t); }
      if (r.u !== null) { d.uSoma += r.u; d.uN++; }
      if (r.p !== null) { d.pmin = d.pmin === null ? r.p : Math.min(d.pmin, r.p); d.pmax = d.pmax === null ? r.p : Math.max(d.pmax, r.p); }
      if (r.v !== null) d.vmax = d.vmax === null ? r.v : Math.max(d.vmax, r.v);
      if (r.rad !== null) d.radmax = d.radmax === null ? r.rad : Math.max(d.radmax, r.rad);
    });
    // maior chuva em 10 min e em 60 min (janela termina no minuto, vale para o dia dele)
    var i10 = 0, i60 = 0, s10 = 0, s60 = 0;
    rows.forEach(function (r, i) {
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
      out[k] = {
        n: d.n, chuva: Math.round(d.chuva * 10) / 10, tmin: d.tmin, tmax: d.tmax,
        umid: d.uN ? Math.round(d.uSoma / d.uN * 10) / 10 : null, pmin: d.pmin, pmax: d.pmax,
        vmax: d.vmax, radmax: d.radmax, c10: Math.round(d.c10 * 10) / 10, c60: Math.round(d.c60 * 10) / 10
      };
    });
    return out;
  }

  w.Estacao = { lerCsv: lerCsv, resumir: resumir };
})(typeof window !== "undefined" ? window : globalThis);
