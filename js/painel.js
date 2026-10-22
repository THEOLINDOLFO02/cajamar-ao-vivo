// Painel Cajamar ao Vivo. Cada cartão consulta sua fonte e falha sozinho.
(function () {
  "use strict";
  var IBGE = 3509205, UF = "SP", LAT = -23.3547, LON = -46.8764;
  var $ = function (i) { return document.getElementById(i); };
  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x !== undefined) e.textContent = x; return e; }
  function hm(ts) { return new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }
  function dh(ts) { return new Date(ts).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); }
  function fdia(d) { return new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" }); }
  function fhora(s) { var d = new Date(String(s).replace(" ", "T")); return isNaN(d) ? String(s) : dh(d); }
  function num(v, casas) { return typeof v === "number" && isFinite(v) ? (casas === undefined ? String(v) : v.toFixed(casas)) : "—"; }
  function fail(box, msg) { box.textContent = ""; box.className = ""; box.appendChild(el("span", "err", msg)); }
  function aviso(box, r) {
    if (r.antigo) box.insertBefore(el("p", "stale", "Não foi possível atualizar agora. Mostrando dados antigos, coletados em " + dh(r.de) + "."), box.firstChild);
  }

  var NOMES = {
    clima: "Previsão e tempo atual (Open-Meteo)",
    avisos_inmet: "Avisos INMET (oficial)",
    previsao_inmet: "Previsão INMET (oficial)",
    cemaden: "Chuva observada CEMADEN",
    queimadas: "Focos de calor por satélite (INPE BDQueimadas)",
    alertas: "Avisos via radarmeteorologico.com.br (reserva)",
    radar: "Radar e Satélite (RainViewer / NASA GIBS)",
    ar: "Qualidade do ar e UV (Open-Meteo / CAMS)",
    modelos: "Chuva prevista por vários modelos (Open-Meteo)",
    ibge_limite: "Limite do município e Censo (IBGE)"
  };

  function desenharFontes() {
    var ul = $("fontes"); ul.textContent = "";
    Object.keys(NOMES).forEach(function (k) {
      var s = Fontes.estado[k], li;
      if (!s && k === "alertas") return; // reserva: só aparece se for usada
      li = el("li");
      li.appendChild(el("span", "dot " + (s ? s.estado : "")));
      li.appendChild(el("strong", "", NOMES[k]));
      var t;
      if (!s) t = "consultando…";
      else if (s.estado === "ok") t = "atualizado às " + hm(s.sucesso);
      else if (s.estado === "velho") t = "falhou (" + s.msg + "); dado antigo de " + dh(s.sucesso);
      else t = "falhou (" + s.msg + "); última tentativa às " + hm(s.tentativa) + (s.sucesso ? "; último sucesso " + dh(s.sucesso) : "; sem dado guardado");
      li.appendChild(el("span", "mut", t));
      ul.appendChild(li);
    });
    document.dispatchEvent(new CustomEvent("cajamar:fontes"));
  }

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

  var ultimoClimaFogo = null;
  var ultimoDeslizSerie = null;

  function renderizarTabelaCriteriosDesliz(nivelAtivo) {
    var tbody = $("tbodyCriteriosDesliz");
    if (!tbody || typeof Deslizamento === "undefined") return;
    tbody.textContent = "";
    Deslizamento.ESTADOS.forEach(function (st) {
      var tr = el("tr", st.nivel === nivelAtivo ? "ativo-criterio" : "");
      tr.style.background = st.corFundo;
      tr.style.color = st.corTexto;
      var tdEst = el("td");
      tdEst.appendChild(el("strong", "", st.icone + " " + st.estado + (st.nivel === nivelAtivo ? " (ATUAL)" : "")));
      var tdDesc = el("td", "", st.descricao);
      var tdAcao = el("td", "", st.acaoDefesaCivil);
      tr.appendChild(tdEst);
      tr.appendChild(tdDesc);
      tr.appendChild(tdAcao);
      tbody.appendChild(tr);
    });
  }

  function obterAvaliacoesEstacoesLocais() {
    if (typeof Estacao === "undefined" || typeof Deslizamento === "undefined") return [];
    var out = [];
    try {
      var banco = Estacao.carregarBanco();
      ["est1", "est2", "est3"].forEach(function (id, idx) {
        var sl = banco.slots[id];
        if (!sl || !sl.dias) return;
        var datas = Object.keys(sl.dias).sort();
        if (!datas.length) return;
        var ultData = datas[datas.length - 1];
        var av = Deslizamento.avaliarDiaEstacao(sl.dias, ultData, sl.estacao || ("Estação " + (idx + 1)));
        if (av) {
          av.nomeEstacao = sl.estacao || ("Estação " + (idx + 1));
          out.push(av);
        }
      });
    } catch (e) {}
    return out;
  }

  function atualizarPainelDeslizamento() {
    var box = $("deslizamentoPainel");
    if (!box || typeof Deslizamento === "undefined") return;

    var modo = $("fFonteDesliz") ? $("fFonteDesliz").value : "auto";
    var avEstacoes = obterAvaliacoesEstacoesLocais();
    var avSerie = ultimoDeslizSerie ? ultimoDeslizSerie.atual : null;
    var avProj = ultimoDeslizSerie ? ultimoDeslizSerie.projecao24h : null;
    var avEscolhida = null;

    if (modo === "simulador") {
      var s1 = $("simMm1h") ? parseFloat($("simMm1h").value) || 0 : 0;
      var s24 = $("simMm24h") ? parseFloat($("simMm24h").value) || 0 : 0;
      var s168 = $("simMm168h") ? parseFloat($("simMm168h").value) || 0 : 0;
      avEscolhida = Deslizamento.avaliarRisco({
        mm1h: s1,
        mm24h: s24,
        mm168h: s168,
        fonte: "Simulador / Leitura Manual de Campo"
      });
    } else if (modo === "estacoes") {
      if (avEstacoes.length) {
        avEscolhida = avEstacoes.slice().sort(function (a, b) {
          if (b.nivel !== a.nivel) return b.nivel - a.nivel;
          return b.mm24h - a.mm24h;
        })[0];
      } else if (avSerie) {
        avEscolhida = avSerie;
      }
    } else if (modo === "serie") {
      avEscolhida = avSerie || (avEstacoes[0] || null);
    } else {
      // modo === "auto": adota o cenário mais crítico entre estações locais recentes e série horária 168h
      var candidatos = [];
      if (avSerie) candidatos.push(avSerie);
      avEstacoes.forEach(function (x) { candidatos.push(x); });
      if (candidatos.length) {
        candidatos.sort(function (a, b) {
          if (b.nivel !== a.nivel) return b.nivel - a.nivel;
          if (b.mm24h !== a.mm24h) return b.mm24h - a.mm24h;
          return b.mm168h - a.mm168h;
        });
        avEscolhida = candidatos[0];
      }
    }

    if (!avEscolhida) {
      avEscolhida = Deslizamento.avaliarRisco({ mm1h: 0, mm24h: 0, mm168h: 0, fonte: "Aguardando leitura pluviométrica" });
    }

    // Sincroniza campos do simulador quando não está em modo simulador manual
    if (modo !== "simulador") {
      if ($("simMm1h")) $("simMm1h").value = avEscolhida.mm1h;
      if ($("simMm24h")) $("simMm24h").value = avEscolhida.mm24h;
      if ($("simMm168h")) $("simMm168h").value = avEscolhida.mm168h;
    }

    renderizarTabelaCriteriosDesliz(avEscolhida.nivel);

    if (avEscolhida.nivel >= 2 && modo !== "simulador") {
      notificarRisco(
        "⛰️ Risco de Deslizamento: " + avEscolhida.estado.toUpperCase(),
        "Cajamar: 1h=" + avEscolhida.mm1h.toFixed(1) + "mm · 24h=" + avEscolhida.mm24h.toFixed(1) + "mm · 168h=" + avEscolhida.mm168h.toFixed(1) + "mm."
      );
    }

    box.textContent = "";
    box.className = "";

    // Faixa Principal de Estado (Normalidade, Observação, Atenção, Alerta, Alerta Máximo)
    var banner = el("div", "desliz-banner");
    banner.style.background = avEscolhida.corFundo;
    banner.style.borderLeftColor = avEscolhida.corBorda;
    banner.style.color = avEscolhida.corTexto;
    banner.appendChild(el("strong", "", avEscolhida.icone + " ESTADO ATUAL: " + avEscolhida.estado.toUpperCase() + " — " + avEscolhida.fonte));
    banner.appendChild(el("span", "", "Critério da faixa: " + avEscolhida.descricaoCriterio));
    banner.appendChild(el("small", "", "Gatilho(s): " + avEscolhida.gatilhos.join(" · ")));
    box.appendChild(banner);

    // 3 Cartões de Volume de Água (1h, 24h, 168h)
    var grid = el("div", "desliz-grid");
    var cartoes = [
      {
        titulo: "🌧️ Volume em 1 hora (mm/h)",
        valor: avEscolhida.mm1h.toFixed(1).replace(".", ",") + " mm/h",
        estado: avEscolhida.estado1h,
        cor: avEscolhida.cor1h,
        corTxt: avEscolhida.nivel1h >= 3 ? "#fff" : "#111",
        ref: "Obs ≥ 10 · Atenção ≥ 20 · Alerta ≥ 30 · Máx > 50 mm/h"
      },
      {
        titulo: "🌧️ Volume em 24 horas (mm/24h)",
        valor: avEscolhida.mm24h.toFixed(1).replace(".", ",") + " mm/24h",
        estado: avEscolhida.estado24h,
        cor: avEscolhida.cor24h,
        corTxt: avEscolhida.nivel24h >= 3 ? "#fff" : "#111",
        ref: "Obs ≥ 25 · Atenção ≥ 50 · Alerta ≥ 100 · Máx > 150 mm/24h"
      },
      {
        titulo: "🌧️ Volume em 7 dias / 168h (mm/168h)",
        valor: avEscolhida.mm168h.toFixed(1).replace(".", ",") + " mm/168h",
        estado: avEscolhida.estado168h,
        cor: avEscolhida.cor168h,
        corTxt: avEscolhida.nivel168h >= 3 ? "#fff" : "#111",
        ref: "Obs ≥ 50 · Atenção ≥ 100 · Alerta ≥ 150 · Máx > 210 mm/168h"
      }
    ];

    cartoes.forEach(function (c) {
      var cx = el("div", "desliz-cx");
      cx.style.borderTopColor = c.cor;
      cx.appendChild(el("span", "", c.titulo));
      var linhaVal = el("div", "");
      linhaVal.style.display = "flex";
      linhaVal.style.justifyContent = "space-between";
      linhaVal.style.alignItems = "center";
      linhaVal.style.gap = "8px";
      linhaVal.appendChild(el("strong", "", c.valor));
      var bdg = el("span", "desliz-badge", c.estado);
      bdg.style.background = c.cor;
      bdg.style.color = c.corTxt;
      linhaVal.appendChild(bdg);
      cx.appendChild(linhaVal);
      cx.appendChild(el("small", "mut", c.ref));
      grid.appendChild(cx);
    });
    box.appendChild(grid);

    // Orientação Operacional Defesa Civil + População
    var orient = el("div", "alert " + (avEscolhida.nivel >= 3 ? "v" : avEscolhida.nivel === 2 ? "l" : avEscolhida.nivel === 0 ? "ok-alert" : ""));
    orient.style.marginTop = "0";
    orient.appendChild(el("strong", "", "🛟 Protocolo Defesa Civil (" + avEscolhida.estado + "): " + avEscolhida.acaoDefesaCivil));
    orient.appendChild(el("span", "", "📢 Orientação aos moradores de áreas de encosta: " + avEscolhida.orientacaoPopulacao));
    if (avProj && avProj.nivel > avEscolhida.nivel && modo !== "simulador") {
      orient.appendChild(el("small", "", "⚠️ Projeção próximas 24h: a chuva prevista pode elevar o estado para " + avProj.icone + " " + avProj.estado.toUpperCase() + " (previsto ~" + avProj.mm24h.toFixed(1).replace(".", ",") + " mm/24h)."));
    }
    box.appendChild(orient);

    // Se houver estações locais carregadas via CSV, mostra o resumo individual de cada estação
    if (avEstacoes.length) {
      var pEst = el("p", "mut", "");
      pEst.style.margin = "8px 0 0";
      pEst.style.fontSize = ".82rem";
      pEst.textContent = "📍 Estações locais carregadas (CSV): " + avEstacoes.map(function (e) {
        return e.nomeEstacao + " [" + e.dataIso.slice(8, 10) + "/" + e.dataIso.slice(5, 7) + "]: " + e.icone + " " + e.estado +
          " (1h: " + e.mm1h.toFixed(1).replace(".", ",") + " mm · 24h: " + e.mm24h.toFixed(1).replace(".", ",") + " mm · 168h: " + e.mm168h.toFixed(1).replace(".", ",") + " mm)";
      }).join(" | ");
      box.appendChild(pEst);
    }

    ultimaAvDeslizamento = avEscolhida;
    atualizarStatusRioPainel();
    if (typeof atualizarPontosCajamarNoMapa === "function") atualizarPontosCajamarNoMapa();
  }

  var ultimaAvDeslizamento = null;

  function atualizarStatusRioPainel() {
    var boxRio = $("statusRioPainel");
    if (!boxRio || typeof Estacao === "undefined") return;
    try {
      var banco = Estacao.carregarBanco();
      var slReg = banco.slots && banco.slots.regua;
      var datas = slReg && slReg.dias ? Object.keys(slReg.dias).sort() : [];
      if (!datas.length) {
        boxRio.hidden = true;
        return;
      }
      var ultD = datas[datas.length - 1];
      var dRio = slReg.dias[ultD];
      if (!dRio || dRio.nvMax === null || dRio.nvMax === undefined) {
        boxRio.hidden = true;
        return;
      }
      var cotas = Estacao.carregarCotasRio();
      var avRio = Estacao.avaliarNivelRio(dRio.nvMax, dRio.nvDelta, cotas);
      boxRio.hidden = false;
      boxRio.textContent = "";
      var ban = el("div", "desliz-banner");
      ban.style.background = avRio.corFundo;
      ban.style.borderLeftColor = avRio.corBorda || "#0b6e8f";
      ban.style.color = avRio.corTexto;
      ban.style.marginBottom = "0";
      ban.appendChild(el("strong", "", "🌊 " + (slReg.estacao || "Régua de Nível do Rio") + " [" + ultD.slice(8, 10) + "/" + ultD.slice(5, 7) + "]: " + avRio.icone + " " + avRio.estado.toUpperCase()));
      ban.appendChild(el("span", "", "Nível Máx: " + dRio.nvMax.toFixed(2).replace(".", ",") + " m · Mín: " + (dRio.nvMin !== null ? dRio.nvMin.toFixed(2).replace(".", ",") : "—") + " m · Subida (Δ): +" + Math.round((dRio.nvDelta || 0) * 100) + " cm"));
      ban.appendChild(el("small", "", avRio.motivo + " (Cotas configuradas: Atenção " + cotas.atencaoM.toFixed(2).replace(".", ",") + "m · Alerta " + cotas.alertaM.toFixed(2).replace(".", ",") + "m · Transbordo " + cotas.transbordoM.toFixed(2).replace(".", ",") + "m)"));
      boxRio.appendChild(ban);
    } catch (e) {
      boxRio.hidden = true;
    }
  }

  function abrirOcorrenciaEncosta(localSugerido) {
    var av = ultimaAvDeslizamento || (typeof Deslizamento !== "undefined" ? Deslizamento.avaliarRisco({ mm1h: 0, mm24h: 0, mm168h: 0 }) : null);
    var rascunho = {
      tipo: "Eventos Hidrológicos e Geológicos",
      subtipo: av && av.nivel >= 3 ? "Escorregamento" : "Monitoramento de áreas de risco",
      local: localSugerido || "",
      descricao: av
        ? "Estado de Deslizamento: " + av.estado.toUpperCase() + " (" + av.fonte + "). Volumes registrados: 1h = " +
          av.mm1h.toFixed(1).replace(".", ",") + " mm/h (" + av.estado1h + ") | 24h = " +
          av.mm24h.toFixed(1).replace(".", ",") + " mm/24h (" + av.estado24h + ") | 168h (7d) = " +
          av.mm168h.toFixed(1).replace(".", ",") + " mm/168h (" + av.estado168h + "). Protocolo: " + av.acaoDefesaCivil
        : "Vistoria preventiva de área de risco de escorregamento."
    };
    try { sessionStorage.setItem("cajamar:rascunho_ocorrencia", JSON.stringify(rascunho)); } catch (e) {}
    window.location.href = "quadro.html?acao=encosta";
  }

  function atualizarRiscoFogoBox() {
    var box = $("riscoFogoBox");
    if (!box || typeof Queimadas === "undefined") return;
    var rf = Queimadas.calcularRiscoFogoLocal(ultimoClimaFogo);
    if (!rf) {
      box.textContent = "Condição meteorológica local de fogo indisponível no momento.";
      return;
    }
    box.textContent = "";
    box.className = "";
    var d = el("div", "alert " + (rf.classe === "v" ? "v" : rf.classe === "l" ? "l" : rf.classe === "ok" ? "ok-alert" : ""));
    d.style.marginTop = "0";
    d.appendChild(el("strong", "", "🌡️ Condição Meteorológica para Fogo em Cajamar: " + rf.nivel));
    d.appendChild(el("small", "", "Temp: " + Math.round(rf.temp) + "°C · Umidade: " + Math.round(rf.umid) + "% · Vento/Rajada: " + rf.ventoMax + " km/h · Regra dos 30: " + rf.regra30 + "/3 fatores · Índice Angström: " + rf.angstrom));
    d.appendChild(el("span", "", rf.recomendacao));
    box.appendChild(d);
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
        ultimoDeslizSerie = Deslizamento.extrairDeSerieHoraria(j.hourly, c.time);
        atualizarPainelDeslizamento();
      }

      ultimoClimaFogo = {
        temp: c.temperature_2m,
        umid: c.relative_humidity_2m,
        vento: c.wind_speed_10m,
        rajada: c.wind_gusts_10m,
        chuva24h: (typeof c.precipitation === "number" ? c.precipitation : 0) + soma24 * 0.25
      };
      atualizarRiscoFogoBox();

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
      atualizarPainelDeslizamento();
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
    avisosMapa = []; avisosProximosMapa = [];
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
    desenharAvisosNoMapa();
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
    lista.forEach(function (a) {
      var s = String(a.severidade || "").toLowerCase();
      if (s.indexOf("perigo") > -1 && s.indexOf("potencial") < 0) {
        notificarRisco("⚠️ Alerta INMET para Cajamar", (a.evento || "Aviso") + " — " + a.severidade);
      }
      var d = el("div", "alert" + (s.indexOf("grande") > -1 ? " v" : s.indexOf("perigo potencial") > -1 ? "" : " l"));
      d.appendChild(el("strong", "", (a.evento || "Aviso") + " — " + (a.severidade || "")));
      d.appendChild(el("small", "", fhora(a.inicio || "") + " até " + fhora(a.fim || "")));
      if (a.risco) d.appendChild(el("span", "", a.risco));
      if (a.instrucoes.length) {
        var det = el("details"); det.appendChild(el("summary", "mut", "Instruções do INMET"));
        a.instrucoes.forEach(function (t) { det.appendChild(el("p", "", String(t))); });
        d.appendChild(det);
      }
      A.appendChild(d);
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
      chaves.forEach(function (dia) {
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
        B.appendChild(d);
      });
      B.appendChild(el("p", "mut", "Fonte: previsão do INMET para o município (fonte oficial). Compare com a previsão de modelo do Open-Meteo abaixo."));
    } catch (e) {
      fail(B, "Não foi possível consultar a previsão do INMET agora. Veja previsao.inmet.gov.br/3509205.");
    }
  }

  // ---------- Alerta sonoro e notificações de risco ----------
  var somAtivo = false, ultimoAlertaNotificado = 0;
  try { somAtivo = localStorage.getItem("cajamar:alertaSom") === "1"; } catch (e) {}

  function atualizarBotaoSom() {
    var b = $("btnAlertaSom");
    if (!b) return;
    b.textContent = somAtivo ? "🔔 Alerta sonoro: ligado" : "🔕 Alerta sonoro: desligado";
    if (somAtivo) b.classList.add("ativo-som");
    else b.classList.remove("ativo-som");
  }

  function tocarBipAlerta() {
    try {
      var AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      var aCtx = new AudioCtx();
      var osc = aCtx.createOscillator();
      var gain = aCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, aCtx.currentTime);
      osc.frequency.setValueAtTime(1174, aCtx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.2, aCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, aCtx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(aCtx.destination);
      osc.start();
      osc.stop(aCtx.currentTime + 0.38);
    } catch (e) {}
  }

  function notificarRisco(titulo, corpo) {
    if (!somAtivo) return;
    var agora = Date.now();
    if (agora - ultimoAlertaNotificado < 1200000) return; // evita repetição antes de 20 min
    ultimoAlertaNotificado = agora;
    tocarBipAlerta();
    if ("Notification" in window && Notification.permission === "granted") {
      try { new Notification(titulo, { body: corpo, icon: "assets/logo-dc-cajamar.jpg" }); } catch (e) {}
    }
  }
  window.notificarRisco = notificarRisco;

  if ($("btnAlertaSom")) {
    $("btnAlertaSom").onclick = function () {
      somAtivo = !somAtivo;
      try { localStorage.setItem("cajamar:alertaSom", somAtivo ? "1" : "0"); } catch (e) {}
      if (somAtivo && "Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
      }
      if (somAtivo) tocarBipAlerta();
      atualizarBotaoSom();
    };
    atualizarBotaoSom();
  }

  // ---------- Áreas dos avisos do INMET no mapa ----------
  var avisosMapa = [], avisosProximosMapa = [], layerAvisos = null;
  function corAvisoMapa(a) {
    if (a.cor) return a.cor;
    var s = String(a.severidade || "").toLowerCase();
    return s.indexOf("grande") > -1 ? "#d92d20" : s.indexOf("potencial") > -1 ? "#eab308" : "#f97316";
  }
  function desenharAvisosNoMapa() {
    var msg = $("amsg");
    if (layerAvisos) layerAvisos.clearLayers();
    if (msg) msg.textContent = "";
    if (!layerAvisos || typeof L === "undefined") return;
    function camada(a, inclui) {
      var cor = inclui ? corAvisoMapa(a) : "#64748b";
      var g = L.geoJSON(a.poligono, { style: { color: cor, weight: inclui ? 3 : 2, fillColor: cor, fillOpacity: inclui ? 0.10 : 0.04, dashArray: inclui ? null : "6 6" } });
      var tip = el("div");
      tip.appendChild(el("b", "", (a.evento || "Aviso") + " — " + (a.severidade || "")));
      tip.appendChild(el("br"));
      tip.appendChild(el("small", "", fhora(a.inicio || "") + " até " + fhora(a.fim || "")));
      tip.appendChild(el("br"));
      tip.appendChild(el("small", "", inclui ? "Área inclui Cajamar" : "Área próxima, NÃO inclui Cajamar"));
      g.bindTooltip(tip, { sticky: true });
      return g;
    }
    avisosProximosMapa.forEach(function (a) { camada(a, false).addTo(layerAvisos); });
    avisosMapa.filter(function (a) { return a.poligono; }).forEach(function (a) { camada(a, true).addTo(layerAvisos); });
    var n = avisosMapa.filter(function (a) { return a.poligono; }).length;
    if (msg) msg.textContent = n || avisosProximosMapa.length
      ? "Áreas dos avisos do INMET: " + n + " incluem Cajamar (contorno cheio); " + avisosProximosMapa.length + " próximo(s) sem incluir Cajamar (tracejado). Ligue/desligue em “Camadas”."
      : "Nenhuma área de aviso do INMET para Cajamar ou arredores neste momento.";
  }

  // ---------- Radar, Satélites (GOES / VIIRS / MODIS), Focos de Fogo e Mapa Operacional ----------
  var map = null, frames = [], layers = [], cur = 0, timer = null, host = "", pastCount = 0;
  var layerFogo = null, layerPontos = null, camadaGoesGeo = null, camadaGoesIr = null, camadaViirsSnpp = null, camadaViirsNoaa20 = null, camadaTermicaNasa = null;
  var modoMapaAtual = "radar";
  var dadosQueimadasAtual = null;

  var layerLimite = null, limiteEnquadrado = false;
  function desenharLimite() {
    if (!layerLimite || typeof L === "undefined") return;
    layerLimite.clearLayers();
    var est = typeof Municipio !== "undefined" ? Municipio.dados() : null;
    var msg = $("imsg");
    if (!est || !est.geo) { if (msg) msg.textContent = est && est.carregado ? "Não foi possível carregar o limite oficial do município (IBGE) agora." : ""; return; }
    var tip = el("div");
    tip.appendChild(el("b", "", "Município de Cajamar"));
    tip.appendChild(el("br"));
    tip.appendChild(el("small", "", "Limite oficial (IBGE)" + (est.populacao ? " · " + est.populacao.toLocaleString("pt-BR") + " habitantes (Censo 2022)" : "")));
    var camadaLimite = L.geoJSON(est.geo, { style: { color: "#1d4ed8", weight: 4, dashArray: "9 6", fillColor: "#2563eb", fillOpacity: 0.04 } })
      .bindTooltip(tip, { sticky: true }).addTo(layerLimite);
    // na primeira vez, enquadra o mapa no município (sem aproximar demais)
    if (!limiteEnquadrado && map) { limiteEnquadrado = true; map.fitBounds(camadaLimite.getBounds(), { padding: [30, 30], maxZoom: 11 }); }
    if (msg) {
      var partes = ["Linha tracejada azul: limite oficial do município (IBGE)."];
      if (est.populacao) partes.push("População: " + est.populacao.toLocaleString("pt-BR") + " (Censo 2022)");
      if (est.densidade) partes.push("densidade: " + est.densidade.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " hab/km²");
      msg.textContent = partes.join(" · ");
    }
  }
  document.addEventListener("cajamar:municipio", function () { desenharLimite(); atualizarPontosCajamarNoMapa(); });

  var PONTOS_CAJAMAR = [
    { nome: "Jordanésia (Estação 1 / Encostas)", lat: -23.3283, lon: -46.8622, cor: "#c2410c", tipo: "Estação Meteorológica / Área de Encosta", slotId: "est1" },
    { nome: "Polvilho (Estação 2 / Urbano)", lat: -23.3853, lon: -46.8286, cor: "#c2410c", tipo: "Estação Meteorológica / Área Urbana", slotId: "est2" },
    { nome: "Cajamar Centro (Estação 3 / Encostas)", lat: -23.3556, lon: -46.8778, cor: "#c2410c", tipo: "Estação Meteorológica / Distrito Sede", slotId: "est3" },
    { nome: "Rio Juquery — Régua de Nível (Cajamar)", lat: -23.3595, lon: -46.8710, cor: "#0284c7", tipo: "Monitoramento Fluviométrico (Régua)", slotId: "regua" },
    { nome: "Ponunduva / KM 43 (Serra e Matas)", lat: -23.3108, lon: -46.9458, cor: "#0b6e8f", tipo: "Encostas e Zona Rural / Mata", slotId: null },
    { nome: "Base Defesa Civil / Bombeiros (199)", lat: -23.3325, lon: -46.8603, cor: "#b91c1c", tipo: "Base Operacional COMPDEC", slotId: null }
  ];

  function atualizarPontosCajamarNoMapa() {
    if (!layerPontos || typeof L === "undefined") return;
    layerPontos.clearLayers();
    var banco = (typeof Estacao !== "undefined") ? Estacao.carregarBanco() : null;
    var cotas = (typeof Estacao !== "undefined") ? Estacao.carregarCotasRio() : null;

    PONTOS_CAJAMAR.forEach(function (pt) {
      var corPino = pt.cor;
      var raioPino = pt.slotId ? 8 : 6;
      var sl = banco && pt.slotId && banco.slots ? banco.slots[pt.slotId] : null;
      var datas = sl && sl.dias ? Object.keys(sl.dias).sort() : [];
      var ultData = datas.length ? datas[datas.length - 1] : null;
      var dUlt = ultData ? sl.dias[ultData] : null;

      var avDesl = null;
      var avRio = null;
      if (pt.slotId === "regua" && dUlt && dUlt.nvMax !== null && typeof Estacao !== "undefined") {
        avRio = Estacao.avaliarNivelRio(dUlt.nvMax, dUlt.nvDelta, cotas);
        corPino = avRio.corFundo;
      } else if (pt.slotId && dUlt && typeof Deslizamento !== "undefined") {
        avDesl = Deslizamento.avaliarDiaEstacao(sl.dias, ultData, sl.estacao || pt.nome);
        if (avDesl) corPino = avDesl.corFundo;
      } else if (ultimaAvDeslizamento && pt.tipo.indexOf("Encosta") > -1) {
        avDesl = ultimaAvDeslizamento;
        if (avDesl.nivel >= 1) corPino = avDesl.corFundo;
      }

      var estMun = typeof Municipio !== "undefined" ? Municipio.dados() : null;
      var foraDoLimite = !!(estMun && estMun.geo && !Geo.pontoDentro(pt.lon, pt.lat, estMun.geo));
      var circ = L.circleMarker([pt.lat, pt.lon], {
        radius: raioPino,
        dashArray: foraDoLimite ? "3 3" : null,
        color: foraDoLimite ? "#dc2626" : "#0f172a",
        fillColor: corPino,
        fillOpacity: 0.92,
        weight: 2
      });

      var pop = el("div");
      pop.appendChild(el("b", "", "📍 " + (sl && sl.estacao ? sl.estacao + " (" + pt.nome + ")" : pt.nome)));
      pop.appendChild(el("br"));
      pop.appendChild(el("small", "", pt.tipo));

      if (avRio && dUlt) {
        pop.appendChild(el("br"));
        pop.appendChild(el("small", "", "🌊 " + avRio.icone + " " + avRio.estado + " [" + ultData.slice(8, 10) + "/" + ultData.slice(5, 7) + "]"));
        pop.appendChild(el("br"));
        pop.appendChild(el("small", "", "Nível Máx: " + dUlt.nvMax.toFixed(2).replace(".", ",") + " m · Δ: +" + Math.round((dUlt.nvDelta || 0) * 100) + " cm"));
      } else if (avDesl) {
        pop.appendChild(el("br"));
        pop.appendChild(el("small", "", "⛰️ Risco Deslizamento: " + avDesl.icone + " " + avDesl.estado));
        pop.appendChild(el("br"));
        pop.appendChild(el("small", "", "1h: " + avDesl.mm1h.toFixed(1).replace(".", ",") + " mm · 24h: " + avDesl.mm24h.toFixed(1).replace(".", ",") + " mm · 168h: " + avDesl.mm168h.toFixed(1).replace(".", ",") + " mm"));
      }

      if (foraDoLimite) {
        pop.appendChild(el("br"));
        pop.appendChild(el("small", "err", "⚠ Esta coordenada está a " + Geo.distanciaBordaKm(pt.lon, pt.lat, estMun.geo).toFixed(1).replace(".", ",") + " km FORA do limite do município (IBGE): confira o local."));
      }
      var btnOc = el("button", "btn small", "🚨 Abrir Vistoria aqui");
      btnOc.type = "button";
      btnOc.style.marginTop = "6px";
      btnOc.style.minHeight = "28px";
      btnOc.style.padding = "2px 8px";
      btnOc.onclick = function () { abrirOcorrenciaEncosta(pt.nome); };
      pop.appendChild(el("br"));
      pop.appendChild(btnOc);

      circ.bindPopup(pop);
      circ.bindTooltip("<b>" + pt.nome + "</b><br><small>" + (avRio ? avRio.icone + " " + avRio.estado : avDesl ? avDesl.icone + " " + avDesl.estado : pt.tipo) + "</small>", { direction: "top" });
      layerPontos.addLayer(circ);
    });
  }

  function inicializarMapa() {
    if (map || typeof L === "undefined") return;
    map = L.map("mapa", { zoomControl: true }).setView([LAT, LON], 10);
    var camadaRuas = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 14, attribution: "© OpenStreetMap" });
    var camadaSatelite = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 14, attribution: "Tiles © Esri" });
    var camadaRelevo = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", { maxZoom: 14, attribution: "© OpenTopoMap" });
    camadaRuas.addTo(map);

    // Camadas de Satélite NASA GIBS / NOAA / CPTEC (tempo real / quase real, sem necessidade de chave)
    camadaGoesGeo = L.tileLayer("https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GOES-East_ABI_GeoColor/default/default/GoogleMapsCompatible_Level7/{z}/{y}/{x}.jpg", {
      opacity: 0.72, maxNativeZoom: 7, maxZoom: 14, attribution: "NASA GIBS / NOAA GOES-East (GOES-16/19)"
    });
    camadaGoesIr = L.tileLayer("https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GOES-East_ABI_Band13_Clean_Infrared/default/default/GoogleMapsCompatible_Level6/{z}/{y}/{x}.jpg", {
      opacity: 0.72, maxNativeZoom: 6, maxZoom: 14, attribution: "NASA GIBS / GOES-East Banda 13 IR (10.3 µm)"
    });
    camadaViirsSnpp = L.tileLayer("https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/default/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg", {
      opacity: 0.78, maxNativeZoom: 9, maxZoom: 14, attribution: "NASA GIBS / Suomi-NPP VIIRS (NPP-375)"
    });
    camadaViirsNoaa20 = L.tileLayer("https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA20_CorrectedReflectance_TrueColor/default/default/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg", {
      opacity: 0.78, maxNativeZoom: 9, maxZoom: 14, attribution: "NASA GIBS / NOAA-20 VIIRS"
    });
    camadaTermicaNasa = L.tileLayer.wms("https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi", {
      layers: "MODIS_Combined_Thermal_Anomalies_All,VIIRS_SNPP_Thermal_Anomalies_375m_All,VIIRS_NOAA20_Thermal_Anomalies_375m_All,VIIRS_NOAA21_Thermal_Anomalies_375m_All",
      format: "image/png",
      transparent: true,
      opacity: 0.85,
      attribution: "NASA GIBS FIRMS (VIIRS 375m NOAA-20/21/S-NPP & MODIS)"
    });

    layerLimite = L.layerGroup().addTo(map);
    layerPontos = L.layerGroup().addTo(map);
    desenharLimite();
    atualizarPontosCajamarNoMapa();
    layerAvisos = L.layerGroup().addTo(map);
    layerFogo = L.layerGroup().addTo(map);

    L.control.layers(
      { "Ruas": camadaRuas, "Satélite (Base Esri)": camadaSatelite, "Relevo/Topografia": camadaRelevo },
      {
        "🗺️ Limite do município (IBGE)": layerLimite,
        "📍 Estações, Rio e Encostas de Cajamar": layerPontos,
        "⚠️ Áreas dos avisos do INMET": layerAvisos,
        "🔥 Focos de Calor INPE (BDQueimadas)": layerFogo,
        "🔥 Anomalias Térmicas NASA (VIIRS/MODIS)": camadaTermicaNasa,
        "🛰️ Satélite GOES-East GeoColor (GOES-16/19)": camadaGoesGeo,
        "🌡️ Satélite GOES-East Infravermelho (Banda 13)": camadaGoesIr,
        "🛰️ Satélite Suomi-NPP (NPP-375 TrueColor)": camadaViirsSnpp,
        "🛰️ Satélite NOAA-20 (VIIRS TrueColor)": camadaViirsNoaa20
      },
      { position: "topright" }
    ).addTo(map);
  }

  function show(i) {
    if (!layers.length || !frames[i]) return;
    if (layers[cur]) layers[cur].setOpacity(0);
    cur = i;
    if (modoMapaAtual === "radar") layers[cur].setOpacity(0.7);
    $("slider").value = i;
    var hora = new Date(frames[i].time * 1000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    var ehFuturo = i >= pastCount;
    var rt = $("rt"); rt.textContent = hora + " ";
    rt.appendChild(el("span", "badge-frame " + (ehFuturo ? "futuro" : "passado"), ehFuturo ? "Projeção (Nowcast)" : "Chuva detectada"));
  }

  function play(on) {
    clearInterval(timer); timer = null;
    $("play").textContent = on ? "Pausar" : "Reproduzir";
    if (on && modoMapaAtual === "radar" && frames.length) {
      timer = setInterval(function () { show((cur + 1) % frames.length); }, 700);
    }
  }

  function alternarModoMapa(modo) {
    inicializarMapa();
    if (!map) return;
    modoMapaAtual = modo;
    var botoes = document.querySelectorAll(".modo-mapa");
    for (var i = 0; i < botoes.length; i++) {
      if (botoes[i].getAttribute("data-modo") === modo) botoes[i].classList.add("ativo-modo");
      else botoes[i].classList.remove("ativo-modo");
    }
    // Oculta ou mostra quadros do radar de chuva
    if (modo !== "radar") {
      play(false);
      layers.forEach(function (l) { l.setOpacity(0); });
      if ($("radarControles")) $("radarControles").hidden = true;
    } else {
      if ($("radarControles")) $("radarControles").hidden = false;
      if (layers[cur]) layers[cur].setOpacity(0.7);
      play(true);
    }

    // Remove camadas de satélite automáticas antes de ativar a do modo selecionado
    [camadaGoesGeo, camadaGoesIr, camadaTermicaNasa].forEach(function (c) {
      if (c && map.hasLayer(c)) map.removeLayer(c);
    });

    var m = $("rmsg");
    if (modo === "goes_geocolor") {
      if (camadaGoesGeo) camadaGoesGeo.addTo(map);
      if (m) m.textContent = "Satélite GOES-East (GOES-16 / GOES-19) GeoColor ativo — cobertura de nuvens sobre Cajamar e Sudeste (NASA GIBS / NOAA).";
    } else if (modo === "goes_ir") {
      if (camadaGoesIr) camadaGoesIr.addTo(map);
      if (m) m.textContent = "Satélite GOES-East Banda 13 Infravermelho Limpo (10,3 µm) ativo — destaca topo frio de nuvens de tempestade dia e noite.";
    } else if (modo === "fogo_sat") {
      if (camadaTermicaNasa) camadaTermicaNasa.addTo(map);
      if (layerFogo && !map.hasLayer(layerFogo)) layerFogo.addTo(map);
      if (m) m.textContent = "Monitoramento de Fogo por Satélite ativo: Focos INPE BDQueimadas + Anomalias Térmicas NASA (VIIRS 375m NOAA-20/21/NPP-375 e MODIS).";
    } else if (modo === "pontos_cajamar") {
      atualizarPontosCajamarNoMapa();
      if (layerPontos && !map.hasLayer(layerPontos)) layerPontos.addTo(map);
      map.setView([LAT, LON], 12);
      if (m) m.textContent = "Pontos monitorados de Cajamar: clique em qualquer marcador (Jordanésia, Polvilho, Centro, Ponunduva ou Rio Juquery) para ver o risco de deslizamento, nível do rio e abrir vistoria.";
    } else {
      if (m && frames.length) {
        m.textContent = pastCount + " quadros passados (chuva detectada) + " + (frames.length - pastCount) + " de projeção (nowcast).";
      }
    }
  }

  var botoesModo = document.querySelectorAll(".modo-mapa");
  for (var bm = 0; bm < botoesModo.length; bm++) {
    botoesModo[bm].onclick = function () {
      alternarModoMapa(this.getAttribute("data-modo"));
    };
  }

  async function radar() {
    var m = $("rmsg");
    if (typeof L === "undefined") {
      Fontes.marcarErro("radar", "biblioteca do mapa não carregou");
      m.textContent = "Mapa indisponível (biblioteca não carregou). Use o atalho do RainViewer.";
      return;
    }
    inicializarMapa();
    try {
      var r = await Fontes.consultar("radar", "https://api.rainviewer.com/public/weather-maps.json", function (x) { return x && x.host && x.radar; });
      if (r.antigo) { Fontes.marcarErro("radar", "sem resposta nova"); throw new Error("sem resposta nova"); }
      var j = r.dados;
      host = j.host;
      var pastFrames = j.radar.past || [];
      var nowcastFrames = j.radar.nowcast || [];
      pastCount = pastFrames.length;
      frames = pastFrames.concat(nowcastFrames);
      if (!frames.length) throw new Error("sem quadros");

      desenharAvisosNoMapa();
      layers.forEach(function (l) { map.removeLayer(l); }); layers = [];
      frames.forEach(function (f) {
        var l = L.tileLayer(host + f.path + "/256/{z}/{x}/{y}/2/1_1.png", { opacity: 0, maxNativeZoom: 7, maxZoom: 14 });
        l.addTo(map); layers.push(l);
      });
      var s = $("slider"); s.max = frames.length - 1; cur = 0;
      var quadroInicial = pastCount > 0 ? pastCount - 1 : frames.length - 1;
      show(quadroInicial);
      if (modoMapaAtual === "radar") {
        play(true);
        m.textContent = pastFrames.length + " quadros passados (chuva detectada) + " + nowcastFrames.length + " de projeção (nowcast).";
      }
    } catch (e) {
      if (modoMapaAtual === "radar") {
        m.textContent = "Não foi possível carregar o radar de chuva agora. Você ainda pode usar os modos de Satélite GOES e Focos de Fogo acima.";
      }
    }
  }

  // ---------- Monitoramento de Focos de Fogo via Satélite (INPE BDQueimadas) ----------
  function filtrarFocosAtuais() {
    if (!dadosQueimadasAtual || !Array.isArray(dadosQueimadasAtual.focos)) return [];
    var satSel = $("fSatelite") ? $("fSatelite").value : "todos";
    var raioSel = $("fRaioFogo") ? Number($("fRaioFogo").value) || 50 : 50;
    return dadosQueimadasAtual.focos.filter(function (f) {
      if (f.distanciaKm > raioSel) return false;
      if (satSel !== "todos" && f.grupoSat !== satSel && f.satelite !== satSel) return false;
      return true;
    });
  }

  function desenharFocosNoMapa(listaFiltrada) {
    inicializarMapa();
    if (!layerFogo || typeof L === "undefined") return;
    layerFogo.clearLayers();
    listaFiltrada.forEach(function (f) {
      var cor = f.emCajamar || f.distanciaKm <= 12 ? "#dc2626" : f.distanciaKm <= 30 ? "#ea580c" : "#f59e0b";
      var raio = f.emCajamar || f.distanciaKm <= 12 ? 8 : 6;
      var m = L.circleMarker([f.lat, f.lon], {
        radius: raio,
        color: "#7f1d1d",
        fillColor: cor,
        fillOpacity: 0.9,
        weight: 2
      });
      var pop = el("div");
      pop.appendChild(el("b", "", "🔥 Foco de Calor — " + f.municipio));
      pop.appendChild(el("br"));
      pop.appendChild(el("small", "", "Satélite: " + f.rotuloSat + " (" + f.satelite + ")"));
      pop.appendChild(el("br"));
      pop.appendChild(el("small", "", "Detecção (BRT): " + f.dataHoraBrt + " · Distância de Cajamar: " + f.distanciaKm.toFixed(1).replace(".", ",") + " km"));
      if (f.frp !== null || f.riscoFogo !== null) {
        pop.appendChild(el("br"));
        pop.appendChild(el("small", "",
          (f.frp !== null ? "FRP: " + f.frp.toFixed(1) + " MW " : "") +
          (f.riscoFogo !== null ? "· Risco Fogo INPE: " + f.riscoFogo.toFixed(2) : "") +
          (f.diasSemChuva !== null ? " · " + f.diasSemChuva + " dia(s) s/ chuva" : "")
        ));
      }
      m.bindPopup(pop);
      m.bindTooltip("🔥 " + f.municipio + " · " + f.rotuloSat + " (" + f.distanciaKm.toFixed(0) + " km)", { direction: "top" });
      layerFogo.addLayer(m);
    });
  }

  function focarFocoNoMapa(f) {
    inicializarMapa();
    if (!map) return;
    if (layerFogo && !map.hasLayer(layerFogo)) layerFogo.addTo(map);
    var card = $("mapaCard");
    if (card && card.scrollIntoView) card.scrollIntoView({ behavior: "smooth", block: "center" });
    map.setView([f.lat, f.lon], 12);
    layerFogo.eachLayer(function (l) {
      if (l.getLatLng && Math.abs(l.getLatLng().lat - f.lat) < 0.0005 && Math.abs(l.getLatLng().lng - f.lon) < 0.0005) {
        l.openPopup();
      }
    });
  }

  function renderizarPainelFogo(antigo, deTs) {
    var box = $("fogo");
    if (!box || !dadosQueimadasAtual) return;
    box.textContent = ""; box.className = "";
    if (antigo && deTs) {
      box.appendChild(el("p", "stale", "Não foi possível atualizar o INPE agora. Mostrando focos coletados em " + dh(deTs) + "."));
    }

    var todosFocos = dadosQueimadasAtual.focos || [];
    var emCajamar = todosFocos.filter(function (f) { return f.emCajamar; });
    var raio50 = todosFocos.filter(function (f) { return f.distanciaKm <= 50; });
    var filtrados = filtrarFocosAtuais();

    desenharFocosNoMapa(filtrados);

    if (emCajamar.length > 0) {
      notificarRisco("🔥 Foco de Calor em Cajamar", emCajamar.length + " foco(s) detectado(s) por satélite (" + emCajamar[0].rotuloSat + "). Verifique o painel.");
    }

    // Resumo em cartões
    var k = el("div", "k");
    k.style.marginBottom = "10px";
    var maisProximo = todosFocos.length ? todosFocos[0].distanciaKm.toFixed(1).replace(".", ",") + " km (" + todosFocos[0].municipio + ")" : "Nenhum a < 300 km";
    var contSat = {};
    filtrados.forEach(function (f) { contSat[f.rotuloSat] = (contSat[f.rotuloSat] || 0) + 1; });
    var satTop = Object.keys(contSat).sort(function (a, b) { return contSat[b] - contSat[a]; })[0] || "—";

    [
      ["Em Cajamar (24–48 h)", String(emCajamar.length) + " foco(s)"],
      ["Região (raio 50 km)", String(raio50.length) + " foco(s)"],
      ["Filtro atual exibido", String(filtrados.length) + " foco(s)"],
      ["Foco mais próximo", maisProximo],
      ["Satélite c/ mais registros", satTop !== "—" ? satTop + " (" + contSat[satTop] + ")" : "Sem focos no filtro"]
    ].forEach(function (par) {
      var d = el("div");
      d.appendChild(el("span", "", par[0]));
      d.appendChild(el("strong", "", par[1]));
      k.appendChild(d);
    });
    box.appendChild(k);

    if (!filtrados.length) {
      var sem = el("p", "mut", "Nenhum foco de calor detectado pelos satélites para o filtro selecionado nas últimas 24–48 h. Você pode ampliar o raio para 100 km ou 300 km (Estado de SP) acima.");
      sem.style.margin = "6px 0";
      box.appendChild(sem);
    } else {
      var tw = el("div", "tw");
      var tb = el("table"), thead = el("thead"), trh = el("tr");
      ["Data/Hora (BRT)", "Satélite", "Município", "Distância", "FRP (MW)", "Risco INPE", "Ação"].forEach(function (h) {
        trh.appendChild(el("th", "", h));
      });
      thead.appendChild(trh); tb.appendChild(thead);
      var tbody = el("tbody");
      filtrados.slice(0, 25).forEach(function (f) {
        var tr = el("tr");
        if (f.emCajamar) tr.style.fontWeight = "700";
        tr.appendChild(el("td", "", f.dataHoraBrt));
        tr.appendChild(el("td", "", f.rotuloSat));
        tr.appendChild(el("td", "", f.municipio + (f.emCajamar ? " ⚠️" : "")));
        tr.appendChild(el("td", "", f.distanciaKm.toFixed(1).replace(".", ",") + " km"));
        tr.appendChild(el("td", "", f.frp !== null ? f.frp.toFixed(1).replace(".", ",") : "—"));
        tr.appendChild(el("td", "", f.riscoFogo !== null ? Math.round(f.riscoFogo * 100) + "%" : "—"));
        var tdBtn = el("td");
        var btnVer = el("button", "btn small", "📍 Mapa");
        btnVer.type = "button";
        btnVer.style.minHeight = "28px";
        btnVer.style.padding = "2px 8px";
        btnVer.onclick = function () { focarFocoNoMapa(f); };
        tdBtn.appendChild(btnVer);
        tr.appendChild(tdBtn);
        tbody.appendChild(tr);
      });
      tb.appendChild(tbody);
      tw.appendChild(tb);
      box.appendChild(tw);
      if (filtrados.length > 25) {
        box.appendChild(el("p", "mut", "Exibindo os 25 focos mais próximos de " + filtrados.length + " encontrados (todos estão plotados no mapa)."));
      }
    }

    // Quadro informativo de cobertura dos satélites solicitados
    var det = el("details");
    det.style.marginTop = "10px";
    det.appendChild(el("summary", "mut", "🛰️ Ver status e cobertura dos satélites monitorados (GOES-19, MSG-03, METOP-B/C, NOAA-20/21, NPP-375 Manhã/Tarde)"));
    var twSat = el("div", "tw");
    twSat.style.marginTop = "8px";
    var tbSat = el("table"), thSat = el("tr");
    ["Satélite", "Órbita / Passagem", "Finalidade (Clima / Fogo)", "Focos (SP/Região)"].forEach(function (h) {
      thSat.appendChild(el("th", "", h));
    });
    tbSat.appendChild(thSat);
    (Queimadas.SATELITES || []).forEach(function (sat) {
      var qtd = todosFocos.filter(function (f) { return f.grupoSat === sat.id; }).length;
      var tr = el("tr");
      tr.appendChild(el("td", "", sat.nome));
      tr.appendChild(el("td", "", sat.orbita));
      tr.appendChild(el("td", "", sat.uso));
      tr.appendChild(el("td", "", String(qtd)));
      tbSat.appendChild(tr);
    });
    twSat.appendChild(tbSat);
    det.appendChild(twSat);
    box.appendChild(det);
  }

  async function fogoSatelites() {
    var box = $("fogo");
    if (!box || typeof Queimadas === "undefined") return;
    try {
      var d = await Queimadas.coletarInpeAoVivo();
      dadosQueimadasAtual = d;
      try { localStorage.setItem("cajamar:queimadas", JSON.stringify({ t: Date.now(), d: d })); } catch (e) {}
      Fontes.marcarOk("queimadas");
      renderizarPainelFogo(false, Date.now());
    } catch (e) {
      var guardado = null;
      try { guardado = JSON.parse(localStorage.getItem("cajamar:queimadas") || "null"); } catch (e2) {}
      if (guardado && guardado.d) {
        dadosQueimadasAtual = guardado.d;
        Fontes.estado.queimadas = { estado: "velho", tentativa: Date.now(), sucesso: guardado.t, msg: e.message || "falha" };
        renderizarPainelFogo(true, guardado.t);
      } else {
        Fontes.marcarErro("queimadas", e && e.message ? e.message : "falha ao consultar INPE");
        fail(box, "Não foi possível consultar o servidor de focos do INPE agora. Use os links diretos do Painel do Fogo (CENSIPAM), BDQueimadas (INPE) e ALARMES abaixo.");
      }
    }
  }

  if ($("fSatelite")) $("fSatelite").onchange = function () { renderizarPainelFogo(false, null); };
  if ($("fRaioFogo")) $("fRaioFogo").onchange = function () { renderizarPainelFogo(false, null); };
  if ($("fFonteDesliz")) $("fFonteDesliz").onchange = atualizarPainelDeslizamento;
  if ($("btnAbrirOcorrenciaDesliz")) {
    $("btnAbrirOcorrenciaDesliz").onclick = function () { abrirOcorrenciaEncosta(""); };
  }
  if ($("btnSimularDesliz")) {
    $("btnSimularDesliz").onclick = function () {
      if ($("fFonteDesliz")) $("fFonteDesliz").value = "simulador";
      atualizarPainelDeslizamento();
    };
  }
  if ($("btnResetDesliz")) {
    $("btnResetDesliz").onclick = function () {
      if ($("fFonteDesliz")) $("fFonteDesliz").value = "auto";
      atualizarPainelDeslizamento();
    };
  }
  ["simMm1h", "simMm24h", "simMm168h"].forEach(function (id) {
    if ($(id)) {
      $(id).oninput = function () {
        if ($("fFonteDesliz")) $("fFonteDesliz").value = "simulador";
        atualizarPainelDeslizamento();
      };
    }
  });
  atualizarPainelDeslizamento();

  // ---------- Backup Unificado do Sistema ----------
  if ($("btnExportarTudo") && typeof Estacao !== "undefined" && Estacao.gerarBackupCompleto) {
    $("btnExportarTudo").onclick = function () {
      var bkp = Estacao.gerarBackupCompleto();
      var blob = new Blob([JSON.stringify(bkp, null, 2)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "backup-completo-defesa-civil-cajamar-" + new Date().toISOString().slice(0, 10) + ".json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      if ($("msgBackupTudo")) $("msgBackupTudo").textContent = "✅ Backup completo exportado com sucesso.";
    };
  }
  if ($("btnImportarTudo") && $("arqBackupTudo") && typeof Estacao !== "undefined" && Estacao.restaurarBackupCompleto) {
    $("btnImportarTudo").onclick = function () { $("arqBackupTudo").click(); };
    $("arqBackupTudo").onchange = function () {
      var f = this.files && this.files[0];
      this.value = "";
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        try {
          var res = Estacao.restaurarBackupCompleto(String(rd.result));
          atualizarPainelDeslizamento();
          if ($("msgBackupTudo")) {
            $("msgBackupTudo").textContent = "✅ Backup restaurado: " + res.estacoesRestauradas + " equipamento(s), +" + res.ocorrenciasNovas + " ocorrência(s) e +" + res.observacoesNovas + " observação(ões).";
          }
        } catch (e) {
          if ($("msgBackupTudo")) $("msgBackupTudo").textContent = "❌ Arquivo de backup não reconhecido.";
        }
      };
      rd.readAsText(f);
    };
  }

  // Controles do mapa: GPS e Tela Cheia
  var marcadorGps = null;
  if ($("btnGps")) {
    $("btnGps").onclick = function () {
      if (!navigator.geolocation) { alert("Geolocalização não suportada no seu navegador."); return; }
      var b = this; b.disabled = true; b.textContent = "📍 Localizando…";
      navigator.geolocation.getCurrentPosition(function (pos) {
        b.disabled = false; b.textContent = "📍 Onde estou";
        var lat = pos.coords.latitude, lon = pos.coords.longitude;
        if (!map) return;
        if (marcadorGps) map.removeLayer(marcadorGps);
        marcadorGps = L.circleMarker([lat, lon], {
          radius: 8, color: "#2563eb", fillColor: "#3b82f6", fillOpacity: 1, weight: 3
        }).addTo(map).bindPopup("<b>Sua localização</b><br>Precisão: ~" + Math.round(pos.coords.accuracy) + " m").openPopup();
        map.setView([lat, lon], 12);
      }, function () {
        b.disabled = false; b.textContent = "📍 Onde estou";
        alert("Não foi possível obter sua localização. Verifique as permissões de GPS.");
      }, { enableHighAccuracy: true, timeout: 10000 });
    };
  }

  if ($("btnFull")) {
    $("btnFull").onclick = function () {
      var card = $("mapaCard");
      if (!document.fullscreenElement) {
        if (card.requestFullscreen) card.requestFullscreen();
        else if (card.webkitRequestFullscreen) card.webkitRequestFullscreen();
      } else {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      }
    };
    document.addEventListener("fullscreenchange", function () {
      if ($("btnFull")) $("btnFull").textContent = document.fullscreenElement ? "⛶ Sair tela cheia" : "⛶ Tela cheia";
      if (map) setTimeout(function () { map.invalidateSize(); }, 200);
    });
  }

  $("play").onclick = function () { play(!timer); };
  $("slider").oninput = function () { play(false); show(+this.value); };

  function go() {
    $("reload").disabled = true;
    Promise.all([clima(), alertas(), previsaoInmet(), Cemaden.carregar(), fogoSatelites(), radar(), Ar.carregar(), Modelos.carregar(), Municipio.carregar()].map(function (p) { return p.then(desenharFontes); })).then(function () { $("reload").disabled = false; desenharFontes(); });
    desenharFontes();
  }
  $("reload").onclick = go;
  go();
  setInterval(go, 600000);
  document.addEventListener("visibilitychange", function () {
    var t = Object.keys(Fontes.estado).map(function (k) { return Fontes.estado[k].tentativa; });
    if (!document.hidden && (!t.length || Date.now() - Math.min.apply(null, t) > 300000)) go();
  });
  setInterval(desenharFontes, 60000);
})();
