// Painel: tempo atual e previsão (Open-Meteo), avisos e previsão do INMET.
(function () {
  "use strict";
  var P = window.Painel, $ = P.$, el = P.el, hm = P.hm, dh = P.dh, fdia = P.fdia, fhora = P.fhora, num = P.num, fail = P.fail, aviso = P.aviso;
  var IBGE = P.IBGE, UF = P.UF, LAT = P.LAT, LON = P.LON, notificarRisco = P.notificarRisco;

  function wmoTexto(cod) {
    if (cod === 0) return "Céu limpo";
    if (cod === 1) return "Poucas nuvens";
    if (cod === 2) return "Parcialmente nublado";
    if (cod === 3) return "Nublado / Encoberto";
    if (cod === 45 || cod === 48) return "Nevoeiro";
    if (cod >= 51 && cod <= 55) return "Garoa";
    if (cod >= 61 && cod <= 65) return "Chuva contínua";
    if (cod >= 80 && cod <= 82) return "Pancadas de chuva";
    if (cod === 95) return "Tempestade";
    if (cod === 96 || cod === 99) return "Tempestade c/ granizo";
    return "";
  }

  async function clima() {
    var url = "https://api.open-meteo.com/v1/forecast?latitude=" + LAT + "&longitude=" + LON +
      "&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_gusts_10m&hourly=precipitation" +
      "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum&past_days=7&forecast_days=7&timezone=America%2FSao_Paulo";
    try {
      var r = await Fontes.consultar("clima", url, function (j) { return j && j.current && j.hourly && j.hourly.time && j.daily && j.daily.time; });
      var j = r.dados, c = j.current, a = $("agora");
      a.textContent = ""; a.className = "";
      aviso(a, r);
      var n = el("div", "now");
      n.appendChild(el("b", "", typeof c.temperature_2m === "number" ? Math.round(c.temperature_2m) + "°C" : "—"));
      var descWmo = wmoTexto(c.weather_code);
      n.appendChild(el("span", "mut", "em Cajamar" + (descWmo ? " · " + descWmo : "") + " · dado do modelo das " + String(c.time).slice(11, 16)));
      a.appendChild(n);
      var k = el("div", "k"); a.appendChild(k);
      var textoVento = num(c.wind_speed_10m, 0) + " km/h";
      if (typeof c.wind_gusts_10m === "number" && c.wind_gusts_10m > 0) {
        textoVento += " (rajadas " + num(c.wind_gusts_10m, 0) + " km/h)";
        if (c.wind_gusts_10m >= 50) {
          notificarRisco("💨 Rajada de Vento Elevada", "Rajada prevista de " + Math.round(c.wind_gusts_10m) + " km/h para Cajamar. Risco de queda de árvores.");
        }
      }
      var itens = [
        ["Sensação", (typeof c.apparent_temperature === "number" ? Math.round(c.apparent_temperature) + "°C" : "—")],
        ["Umidade", num(c.relative_humidity_2m, 0) + "%"],
        ["Chuva (hora atual)", num(c.precipitation) + " mm"],
        ["Vento e rajadas", textoVento]
      ];
      itens.forEach(function (p) {
        var d = el("div"); d.appendChild(el("span", "", p[0])); d.appendChild(el("strong", "", p[1])); k.appendChild(d);
      });
      document.dispatchEvent(new CustomEvent("cajamar:agora", { detail: {
        temp: c.temperature_2m, chuva: c.precipitation, vento: c.wind_speed_10m, rajada: c.wind_gusts_10m,
        hora: String(c.time).slice(11, 16), antigo: !!r.antigo
      } }));

      var i0 = Math.max(0, j.hourly.time.indexOf(String(c.time).slice(0, 13) + ":00"));
      var hs = j.hourly.time.slice(i0, i0 + 24);
      var hv = j.hourly.precipitation.slice(i0, i0 + 24).map(function (x) { return typeof x === "number" ? x : 0; });
      var mx = Math.max.apply(null, hv.concat([1]));
      var H = $("horas"); H.textContent = ""; H.className = "";
      aviso(H, r);
      var barras = el("div", "hours"); H.appendChild(barras);
      hs.forEach(function (t, i) {
        var d = el("div"), b = el("i");
        b.style.height = Math.max(1, hv[i] / mx * 60) + "px"; b.title = hv[i] + " mm";
        d.appendChild(el("span", "", hv[i] > 0 ? String(hv[i]) : "")); d.appendChild(b); d.appendChild(el("span", "", t.slice(11, 13) + "h"));
        barras.appendChild(d);
      });
      var soma24 = hv.reduce(function (s, x) { return s + x; }, 0);
      $("tot24").textContent = "Total previsto em 24 h: " + soma24.toFixed(1) + " mm (modelo, não é medição)";

      if (typeof Deslizamento !== "undefined" && Deslizamento.extrairDeSerieHoraria) {
        P.desliz.definirSerie(Deslizamento.extrairDeSerieHoraria(j.hourly, c.time));
      }

      P.fogo.definirClima({
        temp: c.temperature_2m,
        umid: c.relative_humidity_2m,
        vento: c.wind_speed_10m,
        rajada: c.wind_gusts_10m,
        chuva24h: (typeof c.precipitation === "number" ? c.precipitation : 0) + soma24 * 0.25
      });

      var D = $("dias"); D.textContent = ""; D.className = "tw";
      aviso(D, r);
      var tb = el("table"), th = el("tr");
      ["Dia", "Mín", "Máx", "Chance", "Chuva mm"].forEach(function (x) { th.appendChild(el("th", "", x)); });
      tb.appendChild(th);
      var hojeIso = String(c.time).slice(0, 10);
      var idxDia0 = Math.max(0, j.daily.time.indexOf(hojeIso));
      var diasTime = j.daily.time.slice(idxDia0, idxDia0 + 7);
      var ps = j.daily.precipitation_sum.slice(idxDia0, idxDia0 + 7);
      var dm = Math.max.apply(null, ps.filter(function (x) { return typeof x === "number"; }).concat([1]));
      diasTime.forEach(function (d, kIdx) {
        var i = idxDia0 + kIdx;
        var tr = el("tr");
        tr.appendChild(el("td", "", fdia(d)));
        tr.appendChild(el("td", "", typeof j.daily.temperature_2m_min[i] === "number" ? Math.round(j.daily.temperature_2m_min[i]) + "°" : "—"));
        tr.appendChild(el("td", "", typeof j.daily.temperature_2m_max[i] === "number" ? Math.round(j.daily.temperature_2m_max[i]) + "°" : "—"));
        tr.appendChild(el("td", "", num(j.daily.precipitation_probability_max[i]) + "%"));
        var c4 = el("td", "", num(j.daily.precipitation_sum[i], 1)), b = el("span", "bar");
        b.style.width = ((typeof j.daily.precipitation_sum[i] === "number" ? j.daily.precipitation_sum[i] : 0) / dm * 50) + "px"; c4.appendChild(b); tr.appendChild(c4); tb.appendChild(tr);
      });
      D.appendChild(tb);
    } catch (e) {
      P.desliz.atualizar();
      ["agora", "horas", "dias"].forEach(function (i) { fail($(i), "Não foi possível consultar o Open-Meteo e não há dado guardado."); });
    }
  }

  // Normaliza o repassador de terceiros (radarmeteorologico.com.br).
  function doTerceiro(j) {
    return j.alertas.filter(function (a) { return (a.geocodes || []).map(Number).indexOf(IBGE) > -1; }).map(function (a) {
      return { evento: a.evento, severidade: a.severidade, inicio: a.inicio, fim: a.fim, risco: a.riscos && a.riscos[0], instrucoes: [] };
    });
  }
  async function tentar(nome, url, validar) {
    try { return await Fontes.consultar(nome, url, validar); } catch (e) { return null; }
  }

  async function alertas() {
    var A = $("alertas");
    // 1) fonte oficial INMET; 2) se falhar, repassador de terceiros; 3) dado antigo guardado.
    var ofi = await tentar("avisos_inmet", "https://apiprevmet3.inmet.gov.br/avisos/ativos", Inmet.validarAvisos);
    var r = ofi, lista, rotulo = "INMET (fonte oficial)";
    var avisosMapa = [], avisosProximosMapa = [];
    if (ofi && !ofi.antigo) {
      lista = Inmet.avisosDoMunicipio(ofi.dados);
      avisosMapa = lista; avisosProximosMapa = Inmet.avisosProximos(ofi.dados, LAT, LON, 0.6);
    }
    else {
      var ter = await tentar("alertas", "https://radarmeteorologico.com.br/api/v1/alertas?uf=" + UF, function (j) { return j && Array.isArray(j.alertas); });
      if (ter && !ter.antigo) { r = ter; lista = doTerceiro(ter.dados); rotulo = "radarmeteorologico.com.br (terceiro, usado porque a fonte oficial falhou)"; }
      else if (ofi) { lista = Inmet.avisosDoMunicipio(ofi.dados); }
      else if (ter) { r = ter; lista = doTerceiro(ter.dados); rotulo = "radarmeteorologico.com.br (terceiro)"; }
    }
    P.mapa.definirAvisos(avisosMapa, avisosProximosMapa);
    document.dispatchEvent(new CustomEvent("cajamar:avisos", { detail: {
      ok: !!r, antigo: !!(r && r.antigo), lista: lista || [], oficial: String(rotulo).indexOf("INMET") === 0
    } }));
    if (!r) {
      // Falha NÃO é "sem alerta": deixa isso explícito.
      fail(A, "Não foi possível verificar os alertas agora. Isso NÃO significa que não há alerta. Consulte previsao.inmet.gov.br/3509205 e o CEMADEN.");
      return;
    }
    A.textContent = ""; A.className = "";
    aviso(A, r);
    A.appendChild(el("p", "mut", "Fonte: " + rotulo));
    if (!lista.length) {
      A.appendChild(el("span", "mut", "Nenhum aviso listado para Cajamar nesta fonte" + (r.antigo ? " (na consulta de " + dh(r.de) + ")" : " agora") + ". Isso não garante ausência de risco: confira o INMET e o CEMADEN."));
      return;
    }
    function peso(a) { var s = String(a.severidade || "").toLowerCase(); return s.indexOf("grande") > -1 ? 3 : s.indexOf("potencial") > -1 ? 1 : 2; }
    var ordenada = lista.slice().sort(function (x, y) { return peso(y) - peso(x); });
    var VISIVEIS = 2, extras = null;
    ordenada.forEach(function (a, idx) {
      var s = String(a.severidade || "").toLowerCase();
      if (s.indexOf("perigo") > -1 && s.indexOf("potencial") < 0) {
        notificarRisco("⚠️ Alerta INMET para Cajamar", (a.evento || "Aviso") + " — " + a.severidade);
      }
      var d = el("div", "alert" + (s.indexOf("grande") > -1 ? " v" : s.indexOf("perigo potencial") > -1 ? "" : " l"));
      var cab = el("div", "alert-cab");
      cab.appendChild(el("strong", "", a.evento || "Aviso"));
      cab.appendChild(el("span", "selo-sev", a.severidade || ""));
      d.appendChild(cab);
      d.appendChild(el("small", "", "🕒 " + fhora(a.inicio || "") + " até " + fhora(a.fim || "")));
      if (a.risco) d.appendChild(el("span", "", a.risco));
      if (a.instrucoes.length) {
        var det = el("details"); det.appendChild(el("summary", "mut", "Instruções do INMET"));
        a.instrucoes.forEach(function (t) { det.appendChild(el("p", "", String(t))); });
        d.appendChild(det);
      }
      if (idx < VISIVEIS) { A.appendChild(d); return; }
      if (!extras) {
        extras = el("details", "alert-mais");
        extras.appendChild(el("summary", "", "Mostrar mais " + (ordenada.length - VISIVEIS) + (ordenada.length - VISIVEIS === 1 ? " aviso" : " avisos")));
        A.appendChild(extras);
      }
      extras.appendChild(d);
    });
  }

  function chaveData(s) { var p = String(s).split("/"); return p.length === 3 ? p[2] + p[1] + p[0] : s; }
  async function previsaoInmet() {
    var B = $("prevInmet");
    try {
      var r = await Fontes.consultar("previsao_inmet", "https://apiprevmet3.inmet.gov.br/previsao/" + IBGE, function (j) { return j && j[String(IBGE)] && typeof j[String(IBGE)] === "object"; });
      var dias = r.dados[String(IBGE)];
      var chaves = Object.keys(dias).sort(function (a, b) { return chaveData(a) < chaveData(b) ? -1 : 1; });
      B.textContent = ""; B.className = "";
      aviso(B, r);
      if (!chaves.length) { B.appendChild(el("span", "mut", "O INMET não trouxe previsão para Cajamar nesta consulta.")); return; }
      var VISIVEIS_PREV = 2, maisDias = null;
      chaves.forEach(function (dia, idxDia) {
        var per = dias[dia] || {}, ref = per.manha || per.tarde || per.noite || per;
        var porPeriodo = !!(per.manha || per.tarde || per.noite);
        var d = el("div", "pdia");
        var cab = el("strong", "", (ref.dia_semana ? ref.dia_semana + " · " : "") + dia.slice(0, 5));
        d.appendChild(cab);
        d.appendChild(el("small", "", "Mín " + num(ref.temp_min) + "° · Máx " + num(ref.temp_max) + "° · Umidade " + num(ref.umidade_min) + "–" + num(ref.umidade_max) + "%"));
        if (!porPeriodo) {
          var l1 = el("div", "pper");
          l1.appendChild(el("span", "", (ref.resumo || "sem descrição") + (ref.dir_vento ? " · vento " + ref.dir_vento + (ref.int_vento ? " (" + String(ref.int_vento).toLowerCase() + ")" : "") : "")));
          d.appendChild(l1);
        }
        [["manha", "Manhã"], ["tarde", "Tarde"], ["noite", "Noite"]].forEach(function (p) {
          var x = per[p[0]]; if (!x) return;
          var linha = el("div", "pper");
          linha.appendChild(el("b", "", p[1] + ": "));
          linha.appendChild(el("span", "", (x.resumo || "sem descrição") + (x.dir_vento ? " · vento " + x.dir_vento + (x.int_vento ? " (" + String(x.int_vento).toLowerCase() + ")" : "") : "")));
          d.appendChild(linha);
        });
        if (idxDia < VISIVEIS_PREV) {
          B.appendChild(d);
        } else {
          if (!maisDias) {
            var rest = chaves.length - VISIVEIS_PREV;
            maisDias = el("details", "mais-acoes");
            maisDias.style.marginTop = "8px";
            maisDias.appendChild(el("summary", "", "Ver próximos " + rest + (rest === 1 ? " dia" : " dias") + " da previsão INMET"));
            B.appendChild(maisDias);
          }
          maisDias.appendChild(d);
        }
      });
      var pFonte = el("p", "mut", "Fonte: previsão do INMET para o município (fonte oficial). Compare com a previsão de modelo do Open-Meteo abaixo.");
      pFonte.style.marginTop = "8px";
      pFonte.style.fontSize = ".84rem";
      B.appendChild(pFonte);
    } catch (e) {
      fail(B, "Não foi possível consultar a previsão do INMET agora. Veja previsao.inmet.gov.br/3509205.");
    }
  }

  P.clima = { carregarClima: clima, carregarAlertas: alertas, carregarPrevisaoInmet: previsaoInmet };
})();
