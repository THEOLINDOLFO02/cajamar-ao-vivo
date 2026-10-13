// Compara a chuva diária medida (histórico local) com a previsão do Open-Meteo feita 1 dia antes.
(function () {
  "use strict";
  var LAT = -23.3547, LON = -46.8764, LIMITE = 1;
  var $ = function (i) { return document.getElementById(i); };
  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x !== undefined) e.textContent = x; return e; }
  function f1(v) { return v.toFixed(1).replace(".", ","); }
  function fd(k) { return k.slice(8, 10) + "/" + k.slice(5, 7); }
  function aviso(t, ruim) { var a = $("aviso"); a.hidden = !t; a.textContent = t || ""; a.className = "warn" + (ruim ? " ruim" : ""); }
  function cartao(rot, val, nota) { var d = el("div", "cx"); d.appendChild(el("span", "", rot)); d.appendChild(el("strong", "", val)); if (nota) d.appendChild(el("small", "", nota)); return d; }

  async function rodar() {
    var hist = null;
    try { hist = JSON.parse(localStorage.getItem("cajamar:historico:v1") || "null"); } catch (e) {}
    var chaves = hist && hist.dias ? Object.keys(hist.dias).filter(function (k) { return hist.dias[k].n >= 1296; }).sort() : [];
    if (!chaves.length) { aviso("Sem histórico: importe o CSV da estação na página “Histórico da estação”.", true); $("conteudo").hidden = true; return; }
    aviso("Consultando o Open-Meteo…");
    $("rodar").disabled = true;
    try {
      var url = "https://previous-runs-api.open-meteo.com/v1/forecast?latitude=" + LAT + "&longitude=" + LON +
        "&hourly=precipitation_previous_day1&start_date=" + chaves[0] + "&end_date=" + chaves[chaves.length - 1] + "&timezone=America%2FSao_Paulo";
      var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, 20000);
      var r = await fetch(url, { signal: ctl.signal }); clearTimeout(t);
      if (!r.ok) throw new Error("HTTP " + r.status);
      var j = await r.json();
      if (!j.hourly || !Array.isArray(j.hourly.time)) throw new Error("formato inesperado");
      var prev = {}, nulos = {};
      j.hourly.time.forEach(function (h, i) {
        var d = h.slice(0, 10), v = j.hourly.precipitation_previous_day1[i];
        if (v === null || v === undefined) { nulos[d] = (nulos[d] || 0) + 1; return; }
        prev[d] = (prev[d] || 0) + v;
      });
      var linhas = [];
      chaves.forEach(function (k) {
        if (prev[k] === undefined || (nulos[k] || 0) > 0) return; // previsão incompleta: não compara
        linhas.push({ k: k, med: hist.dias[k].chuva, prev: prev[k] });
      });
      if (!linhas.length) { aviso("O Open-Meteo não devolveu previsões antigas para esses dias.", true); return; }
      var sMed = 0, sPrev = 0, erro = 0, acertos = 0, choveuPrev = 0, choveuMed = 0, falso = 0, perdido = 0;
      linhas.forEach(function (x) {
        sMed += x.med; sPrev += x.prev; erro += Math.abs(x.prev - x.med);
        var cm = x.med >= LIMITE, cp = x.prev >= LIMITE; x.ok = cm === cp;
        if (x.ok) acertos++;
        if (cm) choveuMed++;
        if (cp) choveuPrev++;
        if (cp && !cm) falso++;
        if (!cp && cm) perdido++;
      });
      var rs = $("resumo"); rs.textContent = "";
      rs.appendChild(cartao("Dias comparados", String(linhas.length), fd(linhas[0].k) + " a " + fd(linhas[linhas.length - 1].k)));
      rs.appendChild(cartao("Chuva medida", f1(sMed) + " mm", "soma dos dias"));
      rs.appendChild(cartao("Previsto (1 dia antes)", f1(sPrev) + " mm", (sPrev >= sMed ? "acima" : "abaixo") + " do medido em " + f1(Math.abs(sPrev - sMed)) + " mm"));
      rs.appendChild(cartao("Erro médio por dia", f1(erro / linhas.length) + " mm", "diferença absoluta média"));
      rs.appendChild(cartao("Acertou chuva/não", acertos + " de " + linhas.length, "limite de 1 mm no dia"));
      rs.appendChild(cartao("Falsos alarmes / chuva não prevista", falso + " / " + perdido, "previu chuva e não choveu / choveu e não previu"));
      $("nota").textContent = "Poucos dias dão uma ideia, não uma conclusão estatística: o período tem " + linhas.length + " dia(s), " + choveuMed + " com chuva medida e " + choveuPrev + " com chuva prevista.";
      var tb = $("tabela"); tb.textContent = "";
      linhas.slice().reverse().forEach(function (x) {
        var tr = el("tr"), d = x.prev - x.med;
        [fd(x.k), f1(x.med), f1(x.prev), (d > 0 ? "+" : "") + f1(d), x.ok ? "sim" : "não"].forEach(function (c) { tr.appendChild(el("td", "", c)); });
        tb.appendChild(tr);
      });
      $("conteudo").hidden = false;
      aviso("Comparação feita agora, com dados do Open-Meteo. Dias sem previsão completa foram deixados de fora.");
    } catch (e) {
      aviso("Não foi possível obter as previsões antigas agora (" + (e && e.message ? e.message : "falha") + "). Tente de novo mais tarde.", true);
    } finally { $("rodar").disabled = false; }
  }
  $("rodar").onclick = rodar;
})();
