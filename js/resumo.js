// Resumo "Situação agora" no topo do painel: junta avisos oficiais, tempo atual e saúde das fontes.
// Nunca diz "tudo bem": sem aviso listado é só "nenhum aviso listado", e falha na consulta é "não foi possível verificar".
(function () {
  "use strict";
  var $ = function (i) { return document.getElementById(i); };
  var avisos = null, agora = null, ar = null;

  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x !== undefined) e.textContent = x; return e; }
  function hm(ts) { return new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }
  function haQuanto(ts) { // "agora", "há 3 min", ou a hora quando passa de 1 h
    var min = Math.round((Date.now() - ts) / 60000);
    return min < 1 ? "agora" : min < 60 ? "há " + min + " min" : "às " + hm(ts);
  }
  function quando(s) { // "2026-10-22 23:59" -> "22/10 às 23:59"
    var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(s));
    return m ? m[3] + "/" + m[2] + " às " + m[4] + ":" + m[5] : String(s || "");
  }
  function nivelDe(sev) {
    var s = String(sev || "").toLowerCase();
    return s.indexOf("grande") > -1 ? 3 : s.indexOf("potencial") > -1 ? 1 : 2;
  }
  var NIVEIS = { 1: "potencial", 2: "perigo", 3: "grande" };

  function chip(texto, forte) { return el("span", "chip" + (forte ? " alerta" : ""), texto); }

  function fontes() {
    var est = (window.Fontes && Fontes.estado) || {}, nomes = Object.keys(est), ok = 0, ruins = 0, ultimo = 0;
    nomes.forEach(function (k) {
      var s = est[k];
      if (s.estado === "ok") ok++; else if (s.estado === "velho" || s.estado === "erro") ruins++;
      if (s.sucesso && s.sucesso > ultimo) ultimo = s.sucesso;
    });
    return { total: nomes.length, ok: ok, ruins: ruins, ultimo: ultimo };
  }

  function render() {
    var hero = $("situacao"); if (!hero) return;
    var titulo = $("heroTitulo"), sub = $("heroSub"), chips = $("heroChips");

    if (!avisos) {
      hero.dataset.nivel = "incerto";
      titulo.textContent = "Consultando as fontes oficiais…"; sub.textContent = "";
    } else if (!avisos.ok) {
      hero.dataset.nivel = "incerto";
      titulo.textContent = "Não foi possível verificar os avisos agora";
      sub.textContent = "Isso NÃO significa que não haja aviso. Consulte o INMET (previsao.inmet.gov.br/3509205) e o CEMADEN.";
    } else if (avisos.lista.length) {
      var maior = avisos.lista.reduce(function (a, b) { return nivelDe(b.severidade) > nivelDe(a.severidade) ? b : a; });
      var n = avisos.lista.length;
      hero.dataset.nivel = NIVEIS[nivelDe(maior.severidade)];
      titulo.textContent = n === 1 ? "1 aviso do INMET para Cajamar" : n + " avisos do INMET para Cajamar";
      sub.textContent = (maior.evento || "Aviso") + " — " + (maior.severidade || "") + (maior.fim ? ", válido até " + quando(maior.fim) : "") +
        (avisos.antigo ? " · DADO ANTIGO: não foi possível atualizar" : "") + (avisos.oficial ? "" : " · fonte de terceiros (reserva)");
    } else {
      hero.dataset.nivel = "normal";
      titulo.textContent = "Nenhum aviso do INMET listado para Cajamar";
      sub.textContent = "Isso não garante ausência de risco: acompanhe a chuva, o mapa e os canais oficiais." + (avisos.antigo ? " (consulta antiga)" : "");
    }

    var met = $("heroMetricas");
    if (met) {
      met.textContent = "";
      if (agora) {
        var linhas = [];
        if (typeof agora.temp === "number") linhas.push(["temp", Math.round(agora.temp) + "°", "Temperatura", false]);
        if (typeof agora.chuva === "number") linhas.push(["chuva", String(agora.chuva).replace(".", ","), "mm de chuva na hora", agora.chuva >= 5]);
        if (typeof agora.vento === "number") linhas.push(["vento", String(Math.round(agora.vento)), "km/h de vento", false]);
        linhas.forEach(function (l) {
          var d = el("div", "metrica" + (l[3] ? " forte" : "") + (l[0] === "temp" ? " destaque" : ""));
          d.appendChild(el("b", "", l[1])); d.appendChild(el("span", "", l[2]));
          met.appendChild(d);
        });
      }
    }
    chips.textContent = "";
    if (agora) {
      if (typeof agora.rajada === "number" && agora.rajada >= 40) chips.appendChild(chip("Rajadas de " + Math.round(agora.rajada) + " km/h", true));
    }
    if (ar) {
      if (typeof ar.aqiNivel === "number" && ar.aqiNivel >= 2) chips.appendChild(chip("Ar ruim: AQI " + Math.round(ar.aqi), true));
      var uvAlto = Math.max(ar.uv || 0, ar.uvMax || 0);
      if (uvAlto >= 8) chips.appendChild(chip("UV " + (uvAlto >= 11 ? "extremo" : "muito alto") + " hoje: " + Math.round(uvAlto), true));
    }
    var f = fontes();
    if (f.total) {
      if (f.ruins) {
        var b = el("button", "chip alerta", "⚠ " + f.ruins + (f.ruins === 1 ? " fonte com problema" : " fontes com problema"));
        b.type = "button";
        b.onclick = function () { var d = $("fontes-det"); if (d) { d.open = true; d.scrollIntoView({ behavior: "smooth", block: "center" }); } };
        chips.appendChild(b);
        if (f.ultimo) chips.appendChild(chip("Atualizado " + haQuanto(f.ultimo)));
      } else if (f.ultimo) chips.appendChild(chip((f.ok === f.total ? "✓ " : "") + "Atualizado " + haQuanto(f.ultimo)));
    }
    var r = $("fontesResumo");
    if (r && f.total) r.textContent = f.ok + " de " + f.total + " fontes atualizadas" + (f.ruins ? " · " + f.ruins + " com problema" : "");
  }

  document.addEventListener("cajamar:avisos", function (e) { avisos = e.detail; render(); });
  document.addEventListener("cajamar:agora", function (e) { agora = e.detail; render(); });
  document.addEventListener("cajamar:ar", function (e) { ar = e.detail; render(); });
  document.addEventListener("cajamar:fontes", render);
  setInterval(render, 60000);
  render();
})();
