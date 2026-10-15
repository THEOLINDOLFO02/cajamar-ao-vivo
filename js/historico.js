// Histórico da estação meteorológica: o CSV é lido no próprio navegador (nada é enviado).
// Só o resumo por dia fica guardado no localStorage deste aparelho.
(function () {
  "use strict";
  var CHAVE = "cajamar:historico:v1";
  var $ = function (i) { return document.getElementById(i); };
  var dias = {}, estacao = "";
  var SVGNS = "http://www.w3.org/2000/svg";

  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x !== undefined) e.textContent = x; return e; }
  function sv(t, a) { var e = document.createElementNS(SVGNS, t); for (var k in a) e.setAttribute(k, a[k]); return e; }
  function num(s) { if (s === undefined || s === null || s === "") return null; var v = parseFloat(String(s).replace(",", ".")); return isFinite(v) ? v : null; }
  function fdata(k) { return k.slice(8, 10) + "/" + k.slice(5, 7); }
  function fdataLonga(k) { return k.slice(8, 10) + "/" + k.slice(5, 7) + "/" + k.slice(0, 4); }
  function f1(v) { return v === null || v === undefined ? "—" : v.toFixed(1).replace(".", ","); }
  function aviso(t, ruim) { var a = $("aviso"); a.hidden = !t; a.textContent = t || ""; a.className = "warn" + (ruim ? " ruim" : ""); }

  function guardar() {
    try { localStorage.setItem(CHAVE, JSON.stringify({ estacao: estacao, dias: dias })); return true; }
    catch (e) { aviso("Não foi possível guardar neste navegador (modo privado ou armazenamento cheio). O histórico some ao fechar a página.", true); return false; }
  }
  function carregar() {
    try {
      var x = JSON.parse(localStorage.getItem(CHAVE) || "null");
      if (x && x.dias && typeof x.dias === "object") { dias = x.dias; estacao = x.estacao || ""; }
    } catch (e) { dias = {}; }
  }

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

  function importar(texto) {
    var rows = lerCsv(texto);
    if (!rows.length) throw new Error("nenhuma linha com data válida");
    var novos = resumir(rows), subst = 0, add = 0, mantidos = 0;
    Object.keys(novos).forEach(function (k) {
      if (!dias[k]) { dias[k] = novos[k]; add++; }
      else if (novos[k].n >= dias[k].n) { dias[k] = novos[k]; subst++; }
      else mantidos++;
    });
    var nome = rows[0].nome; if (nome) estacao = nome;
    guardar();
    return { linhas: rows.length, add: add, subst: subst, mantidos: mantidos };
  }

  // ---------- gráficos (SVG, sem bibliotecas) ----------
  function eixoX(svg, chaves, x0, larg, y, passo) {
    var step = Math.max(1, Math.ceil(chaves.length / passo));
    chaves.forEach(function (k, i) {
      if (i % step) return;
      var t = sv("text", { x: x0 + (i + .5) * larg / chaves.length, y: y, "text-anchor": "middle", class: "eix" }); t.textContent = fdata(k); svg.appendChild(t);
    });
  }
  function grade(svg, max, x0, x1, y0, y1, un) {
    [0, .5, 1].forEach(function (f) {
      var y = y1 - f * (y1 - y0);
      svg.appendChild(sv("line", { x1: x0, x2: x1, y1: y, y2: y, class: "grd" }));
      var t = sv("text", { x: x0 - 4, y: y + 3, "text-anchor": "end", class: "eix" }); t.textContent = (max * f).toFixed(max < 10 ? 1 : 0) + (un || ""); svg.appendChild(t);
    });
  }
  function graficoChuva(chaves) {
    var W = 720, H = 220, x0 = 36, x1 = W - 6, y0 = 10, y1 = H - 26;
    var svg = sv("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Chuva por dia em milímetros", class: "graf" });
    var max = Math.max.apply(null, chaves.map(function (k) { return dias[k].chuva; }).concat([5]));
    max = max > 10 ? Math.ceil(max / 10) * 10 : Math.ceil(max / 5) * 5;
    grade(svg, max, x0, x1, y0, y1, "");
    var larg = x1 - x0, bw = Math.max(3, larg / chaves.length * .7);
    chaves.forEach(function (k, i) {
      var d = dias[k], h = d.chuva / max * (y1 - y0), cx = x0 + (i + .5) * larg / chaves.length;
      var r = sv("rect", { x: cx - bw / 2, y: y1 - h, width: bw, height: Math.max(h, d.chuva > 0 ? 1 : 0), class: "barra" + (d.n < 1296 ? " parcial" : "") });
      var tt = sv("title", {}); tt.textContent = fdataLonga(k) + ": " + f1(d.chuva) + " mm" + (d.n < 1296 ? " (dia incompleto)" : ""); r.appendChild(tt);
      svg.appendChild(r);
    });
    eixoX(svg, chaves, x0, larg, H - 8, 10);
    return svg;
  }
  function graficoTemp(chaves) {
    var W = 720, H = 200, x0 = 36, x1 = W - 6, y0 = 10, y1 = H - 26;
    var svg = sv("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Temperatura mínima e máxima por dia", class: "graf" });
    var vs = [];
    chaves.forEach(function (k) { if (dias[k].tmin !== null) vs.push(dias[k].tmin); if (dias[k].tmax !== null) vs.push(dias[k].tmax); });
    if (!vs.length) return svg;
    var mn = Math.floor(Math.min.apply(null, vs) / 5) * 5, mx = Math.ceil(Math.max.apply(null, vs) / 5) * 5;
    [0, .5, 1].forEach(function (f) {
      var y = y1 - f * (y1 - y0);
      svg.appendChild(sv("line", { x1: x0, x2: x1, y1: y, y2: y, class: "grd" }));
      var t = sv("text", { x: x0 - 4, y: y + 3, "text-anchor": "end", class: "eix" }); t.textContent = Math.round(mn + f * (mx - mn)) + "°"; svg.appendChild(t);
    });
    var larg = x1 - x0;
    function linha(campo, cls) {
      var pts = [];
      chaves.forEach(function (k, i) {
        var v = dias[k][campo]; if (v === null) return;
        pts.push((x0 + (i + .5) * larg / chaves.length).toFixed(1) + "," + (y1 - (v - mn) / (mx - mn) * (y1 - y0)).toFixed(1));
      });
      svg.appendChild(sv("polyline", { points: pts.join(" "), class: "lin " + cls }));
    }
    linha("tmax", "max"); linha("tmin", "min");
    eixoX(svg, chaves, x0, larg, H - 8, 10);
    return svg;
  }

  function cartao(rot, val, nota) {
    var d = el("div", "cx"); d.appendChild(el("span", "", rot)); d.appendChild(el("strong", "", val));
    if (nota) d.appendChild(el("small", "", nota));
    return d;
  }

  var MESES_PT = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  function atualizarSeletorPeriodos(chavesTodas) {
    var sel = $("fperiodo");
    if (!sel) return;
    var valorAtual = sel.value || "todos";
    var mesesMap = {};
    chavesTodas.forEach(function (k) {
      mesesMap[k.slice(0, 7)] = true;
    });
    var listaMeses = Object.keys(mesesMap).sort().reverse();
    sel.textContent = "";
    var optTodos = el("option", "", "Todo o período registrado (" + chavesTodas.length + " dias)");
    optTodos.value = "todos";
    sel.appendChild(optTodos);
    if (chavesTodas.length > 30) {
      var opt30 = el("option", "", "Últimos 30 dias");
      opt30.value = "30";
      sel.appendChild(opt30);
    }
    listaMeses.forEach(function (ym) {
      var p = ym.split("-");
      var ano = p[0], mIdx = parseInt(p[1], 10) - 1;
      var nomeMes = MESES_PT[mIdx] || ym;
      var opt = el("option", "", "Mês de " + nomeMes + " / " + ano);
      opt.value = "mes:" + ym;
      sel.appendChild(opt);
    });
    for (var i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === valorAtual) { sel.selectedIndex = i; break; }
    }
  }

  function desenhar(preservarSeletor) {
    var chavesTodas = Object.keys(dias).sort();
    var vazio = !chavesTodas.length;
    $("vazio").hidden = !vazio; $("conteudo").hidden = vazio; $("limpar").disabled = vazio;
    if ($("imprimir")) $("imprimir").disabled = vazio;
    if (vazio) return;

    if (!preservarSeletor) {
      atualizarSeletorPeriodos(chavesTodas);
    }

    var sel = $("fperiodo") ? $("fperiodo").value : "todos";
    var chaves = chavesTodas;
    if (sel === "30") {
      chaves = chavesTodas.slice(-30);
    } else if (sel.indexOf("mes:") === 0) {
      var m = sel.slice(4);
      chaves = chavesTodas.filter(function (k) { return k.indexOf(m) === 0; });
    }
    if (!chaves.length) chaves = chavesTodas;

    // Metadados do Boletim Oficial COMPDEC para Impressão / PDF
    if ($("bolEstacao")) $("bolEstacao").textContent = estacao || "Estação Meteorológica Particular";
    if ($("bolPeriodo")) $("bolPeriodo").textContent = fdataLonga(chaves[0]) + " a " + fdataLonga(chaves[chaves.length - 1]) + " (" + chaves.length + " dia" + (chaves.length > 1 ? "s" : "") + ")";
    if ($("bolEmissao")) $("bolEmissao").textContent = new Date().toLocaleString("pt-BR");

    var total = 0, comChuva = 0, maxK = chaves[0], c10 = { v: 0, k: chaves[0] }, c60 = { v: 0, k: chaves[0] }, vento = { v: 0, k: chaves[0] }, tmin = null, tmax = null;
    chaves.forEach(function (k) {
      var d = dias[k]; total += d.chuva; if (d.chuva >= 1) comChuva++;
      if (d.chuva > dias[maxK].chuva) maxK = k;
      if (d.c10 > c10.v) c10 = { v: d.c10, k: k };
      if (d.c60 > c60.v) c60 = { v: d.c60, k: k };
      if (d.vmax !== null && d.vmax > vento.v) vento = { v: d.vmax, k: k };
      if (d.tmin !== null && (tmin === null || d.tmin < tmin.v)) tmin = { v: d.tmin, k: k };
      if (d.tmax !== null && (tmax === null || d.tmax > tmax.v)) tmax = { v: d.tmax, k: k };
    });
    var incompletos = chaves.filter(function (k) { return dias[k].n < 1296; }).length;
    $("periodo").textContent = (estacao ? estacao + " · " : "") + fdataLonga(chaves[0]) + " a " + fdataLonga(chaves[chaves.length - 1]) + " · " + chaves.length + " dia(s) exibido(s)";
    var rs = $("resumo"); rs.textContent = "";
    rs.appendChild(cartao("Chuva no período", f1(total) + " mm", comChuva + " dia(s) com 1 mm ou mais"));
    rs.appendChild(cartao("Dia mais chuvoso", f1(dias[maxK].chuva) + " mm", fdataLonga(maxK)));
    rs.appendChild(cartao("Maior chuva em 1 h", f1(c60.v) + " mm", fdataLonga(c60.k)));
    rs.appendChild(cartao("Maior chuva em 10 min", f1(c10.v) + " mm", "≈ " + f1(c10.v * 6) + " mm/h · " + fdataLonga(c10.k)));
    rs.appendChild(cartao("Temperatura", (tmin ? Math.round(tmin.v) : "—") + "° a " + (tmax ? Math.round(tmax.v) : "—") + "°", "mín " + (tmin ? fdataLonga(tmin.k) : "—") + " · máx " + (tmax ? fdataLonga(tmax.k) : "—")));
    rs.appendChild(cartao("Vento mais forte", f1(vento.v) + " km/h", fdataLonga(vento.k)));

    var g1 = $("gChuva"); g1.textContent = ""; g1.appendChild(graficoChuva(chaves));
    var g2 = $("gTemp"); g2.textContent = ""; g2.appendChild(graficoTemp(chaves));
    $("notaParcial").textContent = incompletos ? incompletos + " dia(s) com menos de 90% das leituras (barras claras): a chuva desses dias pode estar subestimada." : "";

    var tb = $("tabela"); tb.textContent = "";
    chaves.slice().reverse().forEach(function (k) {
      var d = dias[k], tr = el("tr");
      [fdataLonga(k) + (d.n < 1296 ? " *" : ""), f1(d.chuva), f1(d.c60), f1(d.c10), d.tmin === null ? "—" : f1(d.tmin), d.tmax === null ? "—" : f1(d.tmax), d.umid === null ? "—" : Math.round(d.umid) + "%", d.vmax === null ? "—" : f1(d.vmax)].forEach(function (x) { tr.appendChild(el("td", "", x)); });
      tb.appendChild(tr);
    });
  }

  function lerArquivo(f) {
    var rd = new FileReader();
    rd.onerror = function () { aviso("Não foi possível ler o arquivo.", true); };
    rd.onload = function () {
      try {
        var r = importar(String(rd.result));
        aviso("Importado: " + r.linhas + " leituras. Dias novos: " + r.add + " · atualizados: " + r.subst + " · mantidos (o que já existia tinha mais leituras): " + r.mantidos + ".", false);
        desenhar();
      } catch (e) {
        aviso("Arquivo não reconhecido (" + (e && e.message ? e.message : "formato inesperado") + "). Use o CSV exportado da estação, com separador ponto e vírgula.", true);
      }
    };
    rd.readAsText(f);
  }

  $("arquivo").onchange = function () { var f = this.files[0]; this.value = ""; if (f) lerArquivo(f); };
  $("escolher").onclick = function () { $("arquivo").click(); };
  if ($("imprimir")) $("imprimir").onclick = function () { window.print(); };
  if ($("fperiodo")) $("fperiodo").onchange = function () { desenhar(true); };
  $("limpar").onclick = function () {
    if (!confirm("Apagar o histórico guardado neste navegador? Seus arquivos CSV não são afetados.")) return;
    dias = {}; estacao = "";
    try { localStorage.removeItem(CHAVE); } catch (e) {}
    aviso("Histórico apagado."); desenhar();
  };

  carregar(); desenhar();
})();
