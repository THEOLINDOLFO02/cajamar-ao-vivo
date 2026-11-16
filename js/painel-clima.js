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

  function classificarTempestadeSevera(cape, li, wmo) {
    var c = typeof cape === "number" && isFinite(cape) && cape >= 0 ? Math.round(cape) : null;
    var l = typeof li === "number" && isFinite(li) ? Math.round(li * 10) / 10 : null;
    var ehRaioWmo = wmo === 95 || wmo === 96 || wmo === 99;
    if (c === null && l === null && !ehRaioWmo) return null;
    var nivel = 0, estado = "Estável (baixo potencial de raios)", classe = "ok-alert", desc = "Baixa energia convectiva disponível para tempestades elétricas.";
    if (ehRaioWmo || (c !== null && c >= 2500) || (l !== null && l <= -6)) {
      nivel = 3;
      estado = "Severo (Alto Potencial de Raios, Vendaval e Granizo)";
      classe = "v";
      desc = "Forte instabilidade convectiva (CAPE elevado / índice Lifted muito negativo ou tempestade ativa). Risco de descargas atmosféricas intensas e microexplosões.";
    } else if ((c !== null && c >= 1000) || (l !== null && l <= -3)) {
      nivel = 2;
      estado = "Moderado a Alto (Condição para Trovoadas e Pancadas Fortes)";
      classe = "l";
      desc = "Atmosfera instável com energia suficiente para formação de nuvens Cumulonimbus (Cb), raios e rajadas de vento.";
    } else if ((c !== null && c >= 300) || (l !== null && l <= 0)) {
      nivel = 1;
      estado = "Instabilidade Fraca (Convecção Isolada)";
      classe = "";
      desc = "Energia convectiva moderada/baixa: possibilidade de pancadas rápidas e trovoadas isoladas, principalmente à tarde.";
    }
    return { nivel: nivel, estado: estado, classe: classe, desc: desc, cape: c, li: l };
  }

  async function clima() {
    var url = "https://api.open-meteo.com/v1/forecast?latitude=" + LAT + "&longitude=" + LON +
      "&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_gusts_10m&hourly=precipitation,cape,lifted_index" +
      "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum&past_days=7&forecast_days=7&timezone=America%2FSao_Paulo";
    try {
      var r = await Fontes.consultar("clima", url, function (j) { return j && j.current && j.hourly && j.hourly.time && j.daily && j.daily.time; });
      var j = r.dados, c = j.current, a = $("agora");
      a.textContent = ""; a.className = "";
      aviso(a, r);
      // temperatura, chuva e vento já aparecem no resumo do topo: aqui ficam só os detalhes que ele não mostra
      var descWmo = wmoTexto(c.weather_code);
      a.appendChild(el("p", "mut now-linha", (descWmo ? descWmo + " · " : "") + "dado do modelo das " + String(c.time).slice(11, 16) + ". A temperatura, a chuva e o vento estão no resumo acima."));
      var k = el("div", "k"); a.appendChild(k);
      var intervaloMin = SerieOM.intervaloCurrentMin(c);
      if (typeof c.wind_gusts_10m === "number" && c.wind_gusts_10m > 0) {
        if (c.wind_gusts_10m >= 50) {
          notificarRisco("💨 Rajada de Vento Elevada", "Rajada prevista de " + Math.round(c.wind_gusts_10m) + " km/h para Cajamar. Risco de queda de árvores.");
        }
      }
      var itens = [
        ["Sensação", (typeof c.apparent_temperature === "number" ? Math.round(c.apparent_temperature) + "°C" : "—")],
        ["Umidade", num(c.relative_humidity_2m, 0) + "%"],
        ["Rajadas", typeof c.wind_gusts_10m === "number" && c.wind_gusts_10m > 0 ? num(c.wind_gusts_10m, 0) + " km/h" : "sem rajadas"]
      ];
      itens.forEach(function (p) {
        var d = el("div"); d.appendChild(el("span", "", p[0])); d.appendChild(el("strong", "", p[1])); k.appendChild(d);
      });
      document.dispatchEvent(new CustomEvent("cajamar:agora", { detail: {
        temp: c.temperature_2m, chuva: c.precipitation, vento: c.wind_speed_10m, rajada: c.wind_gusts_10m,
        hora: String(c.time).slice(11, 16), antigo: !!r.antigo, intervaloMin: intervaloMin
      } }));

      // O valor horário de precipitação é a soma da hora ANTERIOR ao instante (docs do Open-Meteo): as próximas 24 h são os 24
      // valores DEPOIS da hora atual, e as últimas 24 h terminam nela. Hora atual ausente na série = sem janela (nunca o índice 0).
      var i0 = SerieOM.indiceHora(j.hourly.time, c.time);
      var H = $("horas"); H.textContent = ""; H.className = "";
      aviso(H, r);
      var chuva24hPassada = null;
      if (i0 < 0) {
        fail(H, "Hora atual (" + String(c.time).slice(11, 16) + ") não encontrada na série horária do Open-Meteo: previsão horária indisponível.");
        $("tot24").textContent = "Total previsto em 24 h: indisponível (série horária sem a hora atual).";
      } else {
        var hs = j.hourly.time.slice(i0 + 1, i0 + 25);
        var hv = j.hourly.precipitation.slice(i0 + 1, i0 + 25).map(function (x) { return typeof x === "number" && isFinite(x) ? x : null; });
        var mx = Math.max.apply(null, hv.filter(function (x) { return x !== null; }).concat([1]));
        var barras = el("div", "hours"); H.appendChild(barras);
        hs.forEach(function (t, i) {
          var d = el("div"), b = el("i");
          b.style.height = hv[i] === null ? "1px" : Math.max(1, hv[i] / mx * 60) + "px";
          b.title = hv[i] === null ? "sem dado" : hv[i] + " mm na hora que termina às " + t.slice(11, 13) + "h";
          d.appendChild(el("span", "", hv[i] === null ? "—" : (hv[i] > 0 ? String(hv[i]) : ""))); d.appendChild(b); d.appendChild(el("span", "", t.slice(11, 13) + "h"));
          barras.appendChild(d);
        });
        var prox = SerieOM.previstoDepois(j.hourly.precipitation, i0, 24);
        $("tot24").textContent = prox.completo
          ? "Total previsto nas próximas 24 h (até " + String(j.hourly.time[i0 + 24]).slice(11, 16) + " de amanhã): " + prox.valor.toFixed(1) + " mm (modelo, não é medição)"
          : "Total previsto nas próximas 24 h: indisponível (" + (24 - prox.comDado) + " de 24 horas sem dado).";
        chuva24hPassada = SerieOM.acumuladoAte(j.hourly.precipitation, i0, 24).valor;
      }

      // 1.2 Monitoramento de Raios / Descargas Atmosféricas e CAPE (Potencial de Tempestade Severa)
      var boxTempestade = $("tempestadePainel");
      if (boxTempestade) {
        boxTempestade.textContent = "";
        boxTempestade.className = "";
        aviso(boxTempestade, r);
        var capeAtual = (i0 >= 0 && Array.isArray(j.hourly.cape) && typeof j.hourly.cape[i0] === "number") ? j.hourly.cape[i0] : null;
        var liAtual = (i0 >= 0 && Array.isArray(j.hourly.lifted_index) && typeof j.hourly.lifted_index[i0] === "number") ? j.hourly.lifted_index[i0] : null;
        var capeMax24 = null, horaPicoCape = "";
        if (i0 >= 0 && Array.isArray(j.hourly.cape)) {
          for (var ic = i0; ic <= Math.min(i0 + 24, j.hourly.cape.length - 1); ic++) {
            var vc = j.hourly.cape[ic];
            if (typeof vc === "number" && isFinite(vc) && (capeMax24 === null || vc > capeMax24)) {
              capeMax24 = Math.round(vc);
              horaPicoCape = String(j.hourly.time[ic] || "").slice(11, 16);
            }
          }
        }
        var avSev = classificarTempestadeSevera(capeAtual !== null ? capeAtual : capeMax24, liAtual, c.weather_code);
        if (!avSev) {
          boxTempestade.appendChild(el("p", "mut", "Índice de instabilidade convectiva (CAPE / Lifted Index) indisponível nesta atualização. Use o mapa de raios ao vivo abaixo."));
        } else {
          var banSev = el("div", "alert " + avSev.classe);
          banSev.style.marginTop = "0";
          banSev.style.marginBottom = "10px";
          banSev.appendChild(el("strong", "", "⚡ Potencial Convectivo e de Raios: " + avSev.estado));
          banSev.appendChild(el("small", "",
            "CAPE agora: " + (avSev.cape !== null ? avSev.cape + " J/kg" : "—") +
            (capeMax24 !== null ? " · Pico próx. 24 h: " + capeMax24 + " J/kg" + (horaPicoCape ? " (às " + horaPicoCape + ")" : "") : "") +
            (avSev.li !== null ? " · Lifted Index: " + String(avSev.li).replace(".", ",") + " °C" : "") +
            " · Condição atual: " + (descWmo || "—")
          ));
          banSev.appendChild(el("span", "", avSev.desc));
          boxTempestade.appendChild(banSev);
        }
      }

      if (typeof Deslizamento !== "undefined" && Deslizamento.extrairDeSerieHoraria) {
        P.desliz.definirSerie(Deslizamento.extrairDeSerieHoraria(j.hourly, c.time));
      }

      // chuva24h = acumulado das ÚLTIMAS 24 h (estimativa do modelo); sem as 24 horas completas o indicador de fogo não é calculado.
      P.fogo.definirClima({
        temp: c.temperature_2m,
        umid: c.relative_humidity_2m,
        vento: c.wind_speed_10m,
        rajada: c.wind_gusts_10m,
        chuva24h: chuva24hPassada
      });

      var D = $("dias"); D.textContent = ""; D.className = "tw";
      aviso(D, r);
      var tb = el("table"), th = el("tr");
      ["Dia", "Mín", "Máx", "Chance", "Chuva mm"].forEach(function (x) { th.appendChild(el("th", "", x)); });
      tb.appendChild(th);
      var hojeIso = String(c.time).slice(0, 10);
      var idxDia0 = j.daily.time.indexOf(hojeIso);
      if (idxDia0 < 0) { fail(D, "A data de hoje (" + hojeIso + ") não foi encontrada na série diária do Open-Meteo: previsão por dia indisponível."); return; }
      var diasTime = j.daily.time.slice(idxDia0, idxDia0 + 7);
      var ps = j.daily.precipitation_sum.slice(idxDia0, idxDia0 + 7);
      var dm = Math.max.apply(null, ps.filter(function (x) { return typeof x === "number"; }).concat([1]));
      diasTime.forEach(function (d, kIdx) {
        var i = idxDia0 + kIdx;
        var tr = el("tr");
        tr.appendChild(el("td", "", fdia(d)));
        tr.appendChild(el("td", "", typeof j.daily.temperature_2m_min[i] === "number" ? Math.round(j.daily.temperature_2m_min[i]) + "°" : "—"));
        tr.appendChild(el("td", "", typeof j.daily.temperature_2m_max[i] === "number" ? Math.round(j.daily.temperature_2m_max[i]) + "°" : "—"));
        tr.appendChild(el("td", "", typeof j.daily.precipitation_probability_max[i] === "number" ? num(j.daily.precipitation_probability_max[i]) + "%" : "—"));
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

  P.clima = { carregarClima: clima, carregarAlertas: alertas, carregarPrevisaoInmet: previsaoInmet, classificarTempestadeSevera: classificarTempestadeSevera };
})();
