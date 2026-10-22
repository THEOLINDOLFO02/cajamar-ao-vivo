// Gerador de panfletos/flyers (Diário e 5 Dias para a população) e publicações a partir de dados meteorológicos.
// Nada é postado sozinho: gera imagem PNG (Stories 9:16, Retrato 4:5, Feed 1:1) e legenda pronta.
(function () {
  "use strict";
  var LAT = -23.3547, LON = -46.8764;
  var W = 1080, H = 1920;
  var AZUL = "#29408a", LARANJA = "#e5771a", VERDE = "#15803d", VERMELHO = "#dc2626";
  var $ = function (i) { return document.getElementById(i); };
  var cv = $("tela"), ctx = cv.getContext("2d");
  var CHAVE_CONTATO = "cajamar:contato";

  // Estado dos dados carregados
  var avisos = null, previsao = null, climaOM = null, historico = null, bancoEstacoes = null, focosInpe = null;
  var coletaAvisos = null, coletaPrev = null, coletaOM = null, coletaFocos = null;
  var modelo = { cor: LARANJA, tag: "", rodape: "", tipoFlyer: null };

  var DICAS = {
    "Chuva forte": {
      linhas: ["Evite áreas alagadas. Nunca atravesse enchente a pé ou de carro.", "Afaste-se de árvores, postes e fios caídos.", "Não se abrigue debaixo de árvores durante tempestade.", "Se notar rachaduras, estalos ou deslizamento no terreno, saia do local e avise a Defesa Civil.", "Em emergência, ligue 199 (Defesa Civil) ou 193 (Bombeiros)."],
      legenda: "Chuva forte pede atenção. Siga as orientações e, em caso de risco, ligue 199 (Defesa Civil) ou 193 (Bombeiros)."
    },
    "Vendaval e raios": {
      linhas: ["Permaneça em local fechado, longe de janelas e portas de vidro.", "Prenda ou recolha objetos que o vento possa arremessar.", "Durante raios, evite usar aparelhos ligados na tomada.", "Não fique em áreas abertas, topos de morro ou perto de árvores isoladas.", "Em emergência, ligue 199 (Defesa Civil) ou 193 (Bombeiros)."],
      legenda: "Em temporais com vento e raios, proteja-se em local fechado. Em emergência, ligue 199 (Defesa Civil) ou 193 (Bombeiros)."
    },
    "Baixa umidade e queimadas": {
      linhas: ["Beba bastante água ao longo do dia.", "Evite atividade física intensa entre 10h e 16h.", "Umidifique o ambiente (bacia com água, toalha molhada).", "PROIBIDO fazer queimadas em terrenos, matas ou lixo (crime ambiental).", "Em caso de incêndio em vegetação, ligue 193 (Bombeiros) ou 199 (Defesa Civil)."],
      legenda: "Tempo seco exige cuidados com a saúde e com o fogo. Queimada é crime e coloca vidas em risco. Ligue 193 ou 199."
    },
    "Sol forte (UV alto)": {
      linhas: ["Evite o sol entre 10h e 16h, quando a radiação é mais forte.", "Use protetor solar (FPS 30 ou mais), chapéu e óculos escuros.", "Procure sombra e beba água com frequência.", "Crianças, idosos e quem tem pele clara precisam de atenção redobrada."],
      legenda: "Sol forte exige cuidado: evite o horário das 10h às 16h, use protetor e hidrate-se."
    },
    "Depois da chuva": {
      linhas: ["Cuidado com entulho e mato alto: animais peçonhentos podem se abrigar ali. Use luvas e botas.", "Não encoste em fios caídos nem em postes danificados.", "Evite caminhar em ruas alagadas: a água pode estar contaminada.", "Árvore ou imóvel com risco de queda? Avise a Defesa Civil: 199."],
      legenda: "Depois da chuva, os cuidados continuam. Em caso de risco, avise a Defesa Civil pelo 199."
    }
  };

  var DIAS_LONGO = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
  var DIAS_CURTO = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
  var MESES_CURTO = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

  function p2(n) { return (n < 10 ? "0" : "") + n; }
  function agora() { var d = new Date(); return p2(d.getDate()) + "/" + p2(d.getMonth() + 1) + "/" + d.getFullYear() + " " + p2(d.getHours()) + ":" + p2(d.getMinutes()); }
  function hm(ts) { var d = new Date(ts); return p2(d.getHours()) + ":" + p2(d.getMinutes()); }
  function fhora(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(s)); return m ? m[3] + "/" + m[2] + " às " + m[4] + ":" + m[5] : String(s);
  }
  function f1(v) { return typeof v === "number" && isFinite(v) ? v.toFixed(1).replace(".", ",") : "—"; }
  function n0(v) { return typeof v === "number" && isFinite(v) ? Math.round(v) : "—"; }
  function setMsg(t) { $("msg").textContent = t || ""; }
  function setStatus(t) { $("status").textContent = t || ""; }

  function infoWmo(cod) {
    if (cod === 0) return { icone: "☀️", curto: "Sol / Céu limpo", longo: "Sol e céu limpo" };
    if (cod === 1) return { icone: "🌤️", curto: "Sol c/ poucas nuvens", longo: "Predomínio de sol com poucas nuvens" };
    if (cod === 2) return { icone: "⛅", curto: "Sol entre nuvens", longo: "Sol entre nuvens ao longo do período" };
    if (cod === 3) return { icone: "☁️", curto: "Nublado", longo: "Céu nublado / encoberto" };
    if (cod === 45 || cod === 48) return { icone: "🌫️", curto: "Nevoeiro", longo: "Nevoeiro / baixa visibilidade" };
    if (cod >= 51 && cod <= 57) return { icone: "🌦️", curto: "Garoa / Chuvisco", longo: "Garoa ou chuva fraca isolada" };
    if (cod >= 61 && cod <= 67) return { icone: "🌧️", curto: "Chuva", longo: "Chuva contínua a moderada" };
    if (cod >= 80 && cod <= 82) return { icone: "🌧️", curto: "Pancadas de chuva", longo: "Pancadas de chuva típicas" };
    if (cod === 95) return { icone: "⛈️", curto: "Tempestade", longo: "Pancadas fortes com trovoadas" };
    if (cod === 96 || cod === 99) return { icone: "⛈️", curto: "Tempestade severa", longo: "Risco de tempestade intensa e granizo" };
    return { icone: "⛅", curto: "Variável", longo: "Tempo variável" };
  }

  function nivelUvTexto(uv) {
    if (typeof uv !== "number") return "—";
    var v = Math.round(uv);
    if (v <= 2) return v + " (Baixo)";
    if (v <= 5) return v + " (Moderado)";
    if (v <= 7) return v + " (Alto)";
    if (v <= 10) return v + " (Muito Alto)";
    return v + " (Extremo)";
  }

  // ---------- carregamento ----------
  async function carregarDados() {
    avisos = null; previsao = null; climaOM = null;
    var urlOM = "https://api.open-meteo.com/v1/forecast?latitude=" + LAT + "&longitude=" + LON +
      "&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_gusts_10m" +
      "&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m" +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max" +
      "&past_days=7&forecast_days=7&timezone=America%2FSao_Paulo";

    var pOM = Fontes.consultar("clima_flyer", urlOM, function (j) { return j && j.daily && Array.isArray(j.daily.time) && j.hourly; })
      .then(function (r) { climaOM = r.dados; coletaOM = r.de || Date.now(); })
      .catch(function () {});

    var pAv = Fontes.consultar("avisos_inmet", Inmet.URL_AVISOS, Inmet.validarAvisos)
      .then(function (a) { if (!a.antigo) { avisos = Inmet.avisosDoMunicipio(a.dados); coletaAvisos = Date.now(); } })
      .catch(function () {});

    var pPr = Fontes.consultar("previsao_inmet", Inmet.URL_PREVISAO, Inmet.validarPrevisao)
      .then(function (p) { if (!p.antigo) { previsao = Inmet.previsaoDoMunicipio(p.dados); coletaPrev = Date.now(); } })
      .catch(function () {});

    var pFocos = (typeof Queimadas !== "undefined" && Queimadas.coletarInpeAoVivo)
      ? Queimadas.coletarInpeAoVivo().then(function (res) { focosInpe = res && res.focos ? res.focos : []; coletaFocos = Date.now(); }).catch(function () {})
      : Promise.resolve();

    await Promise.all([pOM, pAv, pPr, pFocos]);
    atualizarEscolha();
  }

  function carregarHistorico() {
    try {
      if (typeof Estacao !== "undefined" && Estacao.carregarBanco) {
        bancoEstacoes = Estacao.carregarBanco();
        var sAtivo = bancoEstacoes.slots[bancoEstacoes.ativo];
        if (!sAtivo || !Object.keys(sAtivo.dias || {}).length) {
          ["est1", "est2", "est3"].forEach(function (id) {
            if (!sAtivo || !Object.keys(sAtivo.dias || {}).length) sAtivo = bancoEstacoes.slots[id];
          });
        }
        historico = sAtivo && Object.keys(sAtivo.dias || {}).length ? sAtivo : null;
      } else {
        var x = JSON.parse(localStorage.getItem("cajamar:historico:v1") || "null");
        historico = x && x.dias ? x : null;
      }
    } catch (e) { historico = null; bancoEstacoes = null; }
  }

  function indiceDiaHojeOM() {
    if (!climaOM || !climaOM.daily || !Array.isArray(climaOM.daily.time)) return 0;
    var hojeIso = (climaOM.current && climaOM.current.time) ? String(climaOM.current.time).slice(0, 10) : chaveDia(new Date());
    var idx = climaOM.daily.time.indexOf(hojeIso);
    return idx >= 0 ? idx : 0;
  }

  // ---------- extração de dados por dia (Open-Meteo + INMET) ----------
  function extrairDiaOM(offsetDia) {
    if (!climaOM || !climaOM.daily) return null;
    var idx = indiceDiaHojeOM() + (offsetDia || 0);
    if (!climaOM.daily.time[idx]) return null;
    var dl = climaOM.daily;
    var dataIso = dl.time[idx]; // "YYYY-MM-DD"
    var dt = new Date(dataIso + "T12:00:00");
    var diaSemLongo = DIAS_LONGO[dt.getDay()];
    var diaSemCurto = DIAS_CURTO[dt.getDay()];
    var dataCurta = dataIso.slice(8, 10) + "/" + dataIso.slice(5, 7);
    var dataExtenso = dataIso.slice(8, 10) + " de " + MESES_CURTO[dt.getMonth()] + " de " + dataIso.slice(0, 4);

    // Períodos do dia (Manhã 06-11h, Tarde 12-17h, Noite 18-23h) e umidade min/max do dia
    var hr = climaOM.hourly;
    var uMin = null, uMax = null;
    function resumirJanela(hIni, hFim) {
      var temps = [], probs = [], chs = 0, cods = [];
      for (var i = 0; i < hr.time.length; i++) {
        if (hr.time[i].slice(0, 10) !== dataIso) continue;
        var h = parseInt(hr.time[i].slice(11, 13), 10);
        var u = hr.relative_humidity_2m ? hr.relative_humidity_2m[i] : null;
        if (typeof u === "number") {
          uMin = uMin === null ? u : Math.min(uMin, u);
          uMax = uMax === null ? u : Math.max(uMax, u);
        }
        if (h >= hIni && h <= hFim) {
          if (typeof hr.temperature_2m[i] === "number") temps.push(hr.temperature_2m[i]);
          if (typeof hr.precipitation_probability[i] === "number") probs.push(hr.precipitation_probability[i]);
          if (typeof hr.precipitation[i] === "number") chs += hr.precipitation[i];
          if (typeof hr.weather_code[i] === "number") cods.push(hr.weather_code[i]);
        }
      }
      var tMed = temps.length ? Math.round(temps.reduce(function (a, b) { return a + b; }, 0) / temps.length) : null;
      var tMaxP = temps.length ? Math.round(Math.max.apply(null, temps)) : null;
      var pMax = probs.length ? Math.round(Math.max.apply(null, probs)) : 0;
      var cDom = cods.length ? Math.max.apply(null, cods) : (dl.weather_code[idx] || 0);
      var w = infoWmo(cDom);
      return { icone: w.icone, curto: w.curto, temp: tMaxP !== null ? tMaxP + "°C" : (tMed !== null ? tMed + "°C" : "—"), prob: pMax, chuva: Math.round(chs * 10) / 10 };
    }

    var manha = resumirJanela(6, 11);
    var tarde = resumirJanela(12, 17);
    var noite = resumirJanela(18, 23);

    var tmin = dl.temperature_2m_min[idx], tmax = dl.temperature_2m_max[idx];
    var sMax = dl.apparent_temperature_max ? dl.apparent_temperature_max[idx] : tmax;
    var chuvaMm = dl.precipitation_sum[idx] || 0;
    var probChuva = dl.precipitation_probability_max ? (dl.precipitation_probability_max[idx] || 0) : 0;
    var ventoMax = dl.wind_speed_10m_max ? (dl.wind_speed_10m_max[idx] || 0) : 0;
    var rajadaMax = dl.wind_gusts_10m_max ? (dl.wind_gusts_10m_max[idx] || ventoMax) : ventoMax;
    var uvMax = dl.uv_index_max ? dl.uv_index_max[idx] : null;
    var wmo = infoWmo(dl.weather_code ? dl.weather_code[idx] : 1);

    // Gera recomendações para a população local conforme o quadro do dia
    var recs = [];
    var nivel = "NORMAL", corStatus = VERDE, textoStatus = "🟢 CONDIÇÃO NORMAL · TEMPO SEM ALERTAS SEVEROS";
    if (avisos && avisos.length && !offsetDia) {
      nivel = "ALERTA";
      corStatus = VERMELHO;
      textoStatus = "⚠️ AVISO INMET ATIVO: " + (avisos[0].evento || "ATENÇÃO").toUpperCase();
      recs.push("Aviso ativo do INMET para Cajamar: " + (avisos[0].evento || "Atenção meteorológica") + ".");
    } else if (chuvaMm >= 20 || probChuva >= 75 || rajadaMax >= 55) {
      nivel = "ALERTA";
      corStatus = LARANJA;
      textoStatus = "🟠 ATENÇÃO POPULAÇÃO: RISCO DE CHUVA FORTE / VENTANIA";
    } else if (chuvaMm >= 5 || probChuva >= 50 || (uMin !== null && uMin <= 30) || tmax >= 32) {
      nivel = "ATENCAO";
      corStatus = "#d97706";
      textoStatus = "🟡 ATENÇÃO: MUDANÇAS NO TEMPO AO LONGO DO DIA";
    }

    if (probChuva >= 50 || chuvaMm >= 2) {
      var perChuva = [];
      if (manha.prob >= 45 || manha.chuva >= 1) perChuva.push("manhã");
      if (tarde.prob >= 45 || tarde.chuva >= 1) perChuva.push("tarde");
      if (noite.prob >= 45 || noite.chuva >= 1) perChuva.push("noite");
      recs.push("Leve guarda-chuva! Maior chance de chuva " + (perChuva.length ? "no período da " + perChuva.join(" e ") : "ao longo do dia") + " (" + probChuva + "% · ~" + f1(chuvaMm) + " mm).");
    } else {
      recs.push("Baixa chance de chuva (" + probChuva + "%). Tempo firme na maior parte do dia em Cajamar.");
    }

    if (chuvaMm >= 15) {
      recs.push("Atenção motoristas e moradores: evite áreas sujeitas a alagamento e nunca atravesse enxurradas.");
    }
    if (rajadaMax >= 40) {
      recs.push("Rajadas de vento podem chegar a " + n0(rajadaMax) + " km/h: evite parar veículos sob árvores e recolha objetos soltos.");
    }
    if (uMin !== null && uMin <= 35) {
      recs.push("Umidade baixa à tarde (" + n0(uMin) + "%): beba bastante água e NÃO faça queimadas (crime ambiental — ligue 193/199).");
    } else if (tmax >= 29 || (uvMax !== null && uvMax >= 8)) {
      recs.push("Calor e Índice UV elevado (" + nivelUvTexto(uvMax) + "): hidrate-se bem e use proteção solar entre 10h e 16h.");
    }
    if (tmin <= 14) {
      recs.push("Madrugada e amanhecer frios (" + n0(tmin) + "°C): agasalhe bem crianças, idosos e proteja animais domésticos.");
    }
    if (recs.length < 4) {
      recs.push("Em caso de emergência em Cajamar (Jordanésia, Polvilho, Centro, Ponunduva), acione a Defesa Civil pelo 199.");
    }

    return {
      idx: offsetDia || 0,
      dataIso: dataIso,
      diaSemLongo: diaSemLongo,
      diaSemCurto: diaSemCurto,
      dataCurta: dataCurta,
      dataExtenso: dataExtenso,
      wmo: wmo,
      tmin: tmin,
      tmax: tmax,
      sMax: sMax,
      uMin: uMin,
      uMax: uMax,
      chuvaMm: chuvaMm,
      probChuva: probChuva,
      ventoMax: ventoMax,
      rajadaMax: rajadaMax,
      uvMax: uvMax,
      manha: manha,
      tarde: tarde,
      noite: noite,
      corStatus: corStatus,
      textoStatus: textoStatus,
      recs: recs
    };
  }

  // ---------- resumo semanal e consolidação multi-estação ----------
  function chaveDia(d) { return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()); }
  function fdm(k) { return k.slice(8, 10) + "/" + k.slice(5, 7); }
  function f2(v) { return typeof v === "number" && isFinite(v) ? v.toFixed(2).replace(".", ",") : "—"; }
  function semanaCompleta(fim, slotDias) {
    var mapa = slotDias || (historico && historico.dias);
    if (!mapa) return null;
    var base = new Date(fim + "T12:00:00"), dias = [];
    for (var i = 6; i >= 0; i--) {
      var x = new Date(base); x.setDate(x.getDate() - i);
      var k = chaveDia(x), d = mapa[k];
      if (!d || d.n < 1296) return null;
      dias.push({ k: k, d: d });
    }
    return dias;
  }

  function diasConsolidadosEstacoes() {
    carregarHistorico();
    var datas = {};
    if (bancoEstacoes && bancoEstacoes.slots) {
      ["est1", "est2", "est3", "regua"].forEach(function (id) {
        var sl = bancoEstacoes.slots[id];
        if (!sl || !sl.dias) return;
        Object.keys(sl.dias).forEach(function (k) { datas[k] = true; });
      });
    } else if (historico && historico.dias) {
      Object.keys(historico.dias).forEach(function (k) { datas[k] = true; });
    }
    return Object.keys(datas).sort().reverse();
  }

  function extrairBalancoEstacoesDia(dataIso) {
    carregarHistorico();
    if (!dataIso) return null;
    var dtCurta = dataIso.slice(8, 10) + "/" + dataIso.slice(5, 7) + "/" + dataIso.slice(0, 4);
    var dtObj = new Date(dataIso + "T12:00:00");
    var diaSemLongo = DIAS_LONGO[dtObj.getDay()] || "";
    var estacoes = [];
    var regua = null;

    if (bancoEstacoes && bancoEstacoes.slots) {
      ["est1", "est2", "est3"].forEach(function (id, idx) {
        var sl = bancoEstacoes.slots[id];
        var d = sl && sl.dias ? sl.dias[dataIso] : null;
        estacoes.push({
          id: id,
          nome: (sl && sl.estacao) ? sl.estacao : ("Estação Meteorológica " + (idx + 1)),
          temDado: !!d,
          d: d || null
        });
        if (d && d.nvMax !== null && d.nvMax !== undefined && !regua) {
          regua = { nome: "Régua de Nível do Rio", nvMin: d.nvMin, nvMax: d.nvMax, nvMed: d.nvMed, nvDelta: d.nvDelta };
        }
      });
      var slReg = bancoEstacoes.slots.regua;
      if (slReg && slReg.dias && slReg.dias[dataIso] && slReg.dias[dataIso].nvMax !== null) {
        var dr = slReg.dias[dataIso];
        regua = {
          nome: slReg.estacao || "Régua de Nível do Rio",
          nvMin: dr.nvMin,
          nvMax: dr.nvMax,
          nvMed: dr.nvMed,
          nvDelta: dr.nvDelta
        };
      }
    } else if (historico && historico.dias && historico.dias[dataIso]) {
      estacoes.push({
        id: "est1",
        nome: historico.estacao || "Estação Meteorológica 1",
        temDado: true,
        d: historico.dias[dataIso]
      });
    }

    var comDados = estacoes.filter(function (e) { return e.temDado; });
    var maxChuva = 0, somaChuva = 0, maior1h = 0, estMaior = null;
    comDados.forEach(function (e) {
      somaChuva += e.d.chuva;
      if (e.d.chuva >= maxChuva) { maxChuva = e.d.chuva; estMaior = e; }
      if (e.d.c60 > maior1h) maior1h = e.d.c60;
    });
    var mediaChuva = comDados.length ? somaChuva / comDados.length : 0;

    return {
      dataIso: dataIso,
      dtCurta: dtCurta,
      diaSemLongo: diaSemLongo,
      estacoes: estacoes,
      comDados: comDados,
      regua: regua,
      maxChuva: maxChuva,
      mediaChuva: mediaChuva,
      maior1h: maior1h,
      estMaior: estMaior
    };
  }

  // ---------- por tipo: lista de opções e modelo ----------
  function opcoes(tipo) {
    var o = [];
    if (tipo === "flyer_dia") {
      if (climaOM && climaOM.daily && Array.isArray(climaOM.daily.time)) {
        [0, 1, 2].forEach(function (i) {
          var d = extrairDiaOM(i);
          if (!d) return;
          var rot = (i === 0 ? "Hoje — " : i === 1 ? "Amanhã — " : "") + d.diaSemLongo + " (" + d.dataCurta + ") · " + n0(d.tmin) + "° a " + n0(d.tmax) + "°";
          o.push([String(i), rot]);
        });
      }
    } else if (tipo === "flyer_deslizamento") {
      if (typeof Deslizamento !== "undefined") {
        if (climaOM && climaOM.hourly) {
          var serieD = Deslizamento.extrairDeSerieHoraria(climaOM.hourly, climaOM.current && climaOM.current.time);
          if (serieD && serieD.atual) {
            o.push(["serie:atual", "Ao Vivo Cajamar (1h/24h/168h) — " + serieD.atual.icone + " " + serieD.atual.estado + " (" + f1(serieD.atual.mm168h) + " mm/168h)"]);
            o.push(["serie:proj", "Projeção Próximas 24h — " + serieD.projecao24h.icone + " " + serieD.projecao24h.estado + " (~" + f1(serieD.projecao24h.mm24h) + " mm/24h)"]);
          }
        }
        carregarHistorico();
        if (bancoEstacoes && bancoEstacoes.slots) {
          ["est1", "est2", "est3"].forEach(function (id, idx) {
            var sl = bancoEstacoes.slots[id];
            if (!sl || !sl.dias) return;
            var nomeE = sl.estacao || ("Estação " + (idx + 1));
            Object.keys(sl.dias).sort().reverse().slice(0, 7).forEach(function (k) {
              var avE = Deslizamento.avaliarDiaEstacao(sl.dias, k, nomeE);
              if (avE) {
                o.push(["est:" + id + ":" + k, "[" + nomeE + " · " + fdm(k) + "] " + avE.icone + " " + avE.estado + " (1h:" + f1(avE.mm1h) + " · 24h:" + f1(avE.mm24h) + " · 168h:" + f1(avE.mm168h) + " mm)"]);
              }
            });
          });
        }
        o.push(["sim:0", "Modelo Educativo / Preventivo — 🟢 Normalidade (< 10 mm/h · < 25 mm/24h · < 50 mm/168h)"]);
        o.push(["sim:1", "Comunicado Preventivo — 🟡 Estado de Observação (10–20 mm/h · 25–50 mm/24h · 50–100 mm/168h)"]);
        o.push(["sim:2", "Comunicado à População — 🟠 Estado de Atenção (20–30 mm/h · 50–100 mm/24h · 100–150 mm/168h)"]);
        o.push(["sim:3", "Comunicado Urgente — 🔴 Estado de Alerta (30–50 mm/h · 100–150 mm/24h · 150–210 mm/168h)"]);
        o.push(["sim:4", "Emergência Geodinâmica — 🟣 Estado de Alerta Máximo (> 50 mm/h · > 150 mm/24h · > 210 mm/168h)"]);
      }
    } else if (tipo === "flyer_fogo") {
      if (climaOM && climaOM.daily && Array.isArray(climaOM.daily.time)) {
        [0, 1, 2].forEach(function (i) {
          var d = extrairDiaOM(i);
          if (!d) return;
          var rf = (typeof Queimadas !== "undefined" && Queimadas.calcularRiscoFogoLocal)
            ? Queimadas.calcularRiscoFogoLocal({ temp: d.tmax, umid: d.uMin !== null ? d.uMin : 45, vento: d.ventoMax, rajada: d.rajadaMax, chuva24h: d.chuvaMm })
            : { nivel: "Monitorado" };
          var rot = (i === 0 ? "Hoje — " : i === 1 ? "Amanhã — " : "") + d.diaSemLongo + " (" + d.dataCurta + ") · Risco " + (rf ? rf.nivel : "—") + " · Umid. mín " + n0(d.uMin) + "%";
          o.push([String(i), rot]);
        });
      }
    } else if (tipo === "flyer_estacoes") {
      diasConsolidadosEstacoes().forEach(function (k) {
        var b = extrairBalancoEstacoesDia(k);
        if (!b) return;
        var resumoTxt = b.comDados.length + " est. (máx " + f1(b.maxChuva) + " mm)" + (b.regua ? " + 🌊 Rio máx " + f2(b.regua.nvMax) + " m" : "");
        o.push([k, b.dtCurta + " (" + b.diaSemLongo + ") — " + resumoTxt]);
      });
    } else if (tipo === "aviso") {
      if (avisos) avisos.forEach(function (a, i) { o.push([i, (a.evento || "Aviso") + " — " + (a.severidade || "") + " (" + fhora(a.inicio) + " a " + fhora(a.fim) + ")"]); });
    } else if (tipo === "prevdia") {
      if (previsao) previsao.forEach(function (d, i) { o.push([i, (d.ref.dia_semana || "") + " " + d.dia.slice(0, 5)]); });
    } else if (tipo === "chuva") {
      carregarHistorico();
      if (bancoEstacoes && bancoEstacoes.slots) {
        ["est1", "est2", "est3"].forEach(function (id, idx) {
          var sl = bancoEstacoes.slots[id];
          if (!sl || !sl.dias) return;
          var nomeEst = sl.estacao || ("Estação " + (idx + 1));
          Object.keys(sl.dias).sort().reverse().forEach(function (k) {
            var d = sl.dias[k];
            o.push([id + ":" + k, "[" + nomeEst + "] " + k.slice(8, 10) + "/" + k.slice(5, 7) + "/" + k.slice(0, 4) + " — " + f1(d.chuva) + " mm" + (d.n < 1296 ? " (parcial)" : "")]);
          });
        });
      } else if (historico) {
        Object.keys(historico.dias).sort().reverse().forEach(function (k) {
          var d = historico.dias[k]; o.push([k, k.slice(8, 10) + "/" + k.slice(5, 7) + "/" + k.slice(0, 4) + " — " + f1(d.chuva) + " mm" + (d.n < 1296 ? " (dia incompleto)" : "")]);
        });
      }
    } else if (tipo === "semana") {
      carregarHistorico();
      if (historico) Object.keys(historico.dias).sort().reverse().forEach(function (k) {
        var sm = semanaCompleta(k); if (!sm) return;
        var t = sm.reduce(function (a, x) { return a + x.d.chuva; }, 0);
        o.push([k, fdm(sm[0].k) + " a " + fdm(k) + "/" + k.slice(0, 4) + " — " + f1(t) + " mm"]);
      });
    } else if (tipo === "dica") {
      Object.keys(DICAS).forEach(function (k) { o.push([k, k]); });
    }
    return o;
  }

  function atualizarBotoesAtalho() {
    var tipo = $("tipo").value;
    var bts = document.querySelectorAll(".atalho-pub");
    for (var i = 0; i < bts.length; i++) {
      if (bts[i].getAttribute("data-tipo") === tipo) bts[i].classList.add("ativo-modo");
      else bts[i].classList.remove("ativo-modo");
    }
  }

  function atualizarEscolha() {
    atualizarBotoesAtalho();
    var tipo = $("tipo").value, sel = $("escolha");
    sel.textContent = "";
    $("boxEscolha").hidden = (tipo === "prevsemana" || tipo === "flyer_5dias");
    var o = opcoes(tipo);
    o.forEach(function (x) { var op = document.createElement("option"); op.value = x[0]; op.textContent = x[1]; sel.appendChild(op); });
    var bloqueio = "";
    if (tipo === "flyer_dia" || tipo === "flyer_5dias" || tipo === "flyer_fogo") {
      if (!climaOM) bloqueio = "Consultando dados meteorológicos atualizados para o panfleto… Se falhar, verifique sua conexão.";
      else setStatus("Dados meteorológicos de Cajamar atualizados às " + hm(coletaOM) + (focosInpe ? " · Satélites INPE (" + focosInpe.length + " focos na região)" : "") + ".");
    }
    if (tipo === "flyer_deslizamento") {
      setStatus("Critérios de Risco de Deslizamento (Pinheiro et al., 2005; AlertaRio, 2013): avaliação simultânea de 1h, 24h e 168h (7 dias).");
    }
    if (tipo === "flyer_estacoes") {
      if (!o.length) bloqueio = "Nenhum arquivo CSV carregado ainda. Envie de 1 a 4 CSVs (estações e régua do rio) na aba “Histórico da estação” ou “Previsão × medido”.";
      else setStatus("Dados locais das estações e régua de nível prontos para gerar o panfleto consolidado.");
    }
    if (tipo === "aviso") { if (!avisos) bloqueio = "Sem dado novo dos avisos do INMET."; else if (!o.length) bloqueio = "Nenhum aviso ativo para Cajamar agora: não há o que publicar."; else setStatus("Avisos do INMET coletados às " + hm(coletaAvisos) + "."); }
    if (tipo === "prevdia" || tipo === "prevsemana") { if (!previsao) bloqueio = "Sem dado novo da previsão do INMET. Use o “Panfleto Diário” ou “Panfleto de 5 Dias” acima!"; else setStatus("Previsão do INMET coletada às " + hm(coletaPrev) + "."); }
    if (tipo === "chuva") { if (!o.length) bloqueio = "Sem histórico: importe o CSV da estação na página “Histórico da estação”."; else setStatus("Histórico guardado neste aparelho (fonte: estação local; não é dado oficial)."); }
    if (tipo === "semana") { if (!o.length) bloqueio = "Não há 7 dias seguidos e completos no histórico. Importe o CSV da estação na página “Histórico da estação”."; else setStatus("Só aparecem semanas com os 7 dias completos (fonte: estação local; não é dado oficial)."); }
    if (tipo === "dica") setStatus("Textos gerais: revise antes de publicar.");
    if (bloqueio) setStatus(bloqueio);
    $("baixar").disabled = !!bloqueio; $("copiar").disabled = !!bloqueio;
    if ($("compartilhar")) $("compartilhar").disabled = !!bloqueio;
    if ($("copiarImg")) $("copiarImg").disabled = !!bloqueio;
    if (bloqueio) { limparCampos(); desenhar(); return; }
    montar();
  }

  function limparCampos() {
    $("titulo").value = ""; $("subtitulo").value = ""; $("linhas").value = ""; $("legenda").value = "";
    if ($("textoFaixa")) $("textoFaixa").value = "";
    modelo = { cor: LARANJA, tag: "", rodape: "", tipoFlyer: null };
  }

  function corAviso(a) {
    if (a.cor) return a.cor;
    var s = String(a.severidade || "").toLowerCase();
    return s.indexOf("grande") > -1 ? "#d92d20" : s.indexOf("potencial") > -1 ? "#facc15" : LARANJA;
  }

  function descPeriodo(x) { return (x.resumo || "sem descrição") + (x.dir_vento ? " · vento " + x.dir_vento + (x.int_vento ? " (" + String(x.int_vento).toLowerCase() + ")" : "") : ""); }

  function montar() {
    var tipo = $("tipo").value, v = $("escolha").value, L = [], leg = "";
    var m = { cor: LARANJA, tag: "", rodape: "", tipoFlyer: null };
    if ($("nivelFaixa")) $("nivelFaixa").value = "auto";

    if (tipo === "flyer_dia") {
      var dDia = extrairDiaOM(+v || 0);
      if (!dDia) return;
      m.tipoFlyer = "dia";
      m.dadosDia = dDia;
      m.cor = dDia.corStatus;
      m.tag = dDia.textoStatus;
      $("titulo").value = dDia.diaSemLongo.toUpperCase() + " · " + dDia.dataCurta;
      $("subtitulo").value = dDia.wmo.icone + " " + dDia.wmo.longo + " em Cajamar/SP";
      L = dDia.recs.slice();
      m.rodape = "Fontes: Modelo Open-Meteo e Monitoramento Defesa Civil de Cajamar · Atualizado às " + hm(coletaOM);

      leg = "🌤️ BOLETIM DO TEMPO EM CAJAMAR — " + dDia.diaSemLongo.toUpperCase() + " (" + dDia.dataCurta + ")\n\n" +
        "📍 Situação hoje: " + dDia.wmo.icone + " " + dDia.wmo.longo + "\n" +
        "🌡️ Temperatura: Mín " + n0(dDia.tmin) + "°C / Máx " + n0(dDia.tmax) + "°C (Sensação até " + n0(dDia.sMax) + "°C)\n" +
        "🌧️ Chuva: Chance de " + dDia.probChuva + "% · Volume previsto: " + f1(dDia.chuvaMm) + " mm\n" +
        "💧 Umidade do ar: " + (dDia.uMin !== null ? n0(dDia.uMin) + "% a " + n0(dDia.uMax) + "%" : "—") + "\n" +
        "💨 Vento: até " + n0(dDia.ventoMax) + " km/h (rajadas de " + n0(dDia.rajadaMax) + " km/h)\n\n" +
        "🕒 Por período:\n" +
        "• Manhã: " + dDia.manha.icone + " " + dDia.manha.curto + " (" + dDia.manha.temp + " · chuva " + dDia.manha.prob + "%)\n" +
        "• Tarde: " + dDia.tarde.icone + " " + dDia.tarde.curto + " (" + dDia.tarde.temp + " · chuva " + dDia.tarde.prob + "%)\n" +
        "• Noite: " + dDia.noite.icone + " " + dDia.noite.curto + " (" + dDia.noite.temp + " · chuva " + dDia.noite.prob + "%)\n\n" +
        "📌 O QUE A POPULAÇÃO PRECISA SABER:\n" +
        L.map(function (t) { return "✔️ " + t; }).join("\n") +
        "\n\n📞 Emergência: Defesa Civil 199 | Bombeiros 193";
    } else if (tipo === "flyer_5dias") {
      if (!climaOM || !climaOM.daily) return;
      var dias5 = [];
      for (var k = 0; k < 5; k++) {
        var d5 = extrairDiaOM(k);
        if (d5) dias5.push(d5);
      }
      if (!dias5.length) return;
      m.tipoFlyer = "5dias";
      m.dados5Dias = dias5;

      var somaChuva5 = 0, maxChuvaDia = dias5[0], maisQuente = dias5[0], maisFrio = dias5[0], diasChuvosos = 0;
      dias5.forEach(function (x) {
        somaChuva5 += x.chuvaMm;
        if (x.chuvaMm >= 1 || x.probChuva >= 50) diasChuvosos++;
        if (x.chuvaMm > maxChuvaDia.chuvaMm) maxChuvaDia = x;
        if (x.tmax > maisQuente.tmax) maisQuente = x;
        if (x.tmin < maisFrio.tmin) maisFrio = x;
      });

      var temChuvaForte = maxChuvaDia.chuvaMm >= 15 || somaChuva5 >= 35;
      m.cor = temChuvaForte ? LARANJA : "#0284c7";
      m.tag = "📅 PREVISÃO PARA OS PRÓXIMOS 5 DIAS · CAJAMAR";
      var per5 = dias5[0].dataCurta + " a " + dias5[dias5.length - 1].dataCurta;
      $("titulo").value = "PREVISÃO 5 DIAS · " + per5;
      $("subtitulo").value = "Programe sua semana em Cajamar · Informes à população";

      if (somaChuva5 >= 5) {
        L.push("Chuva acumulada prevista nos 5 dias: ~" + f1(somaChuva5) + " mm (" + diasChuvosos + " dia(s) com chance de chuva).");
        L.push("Dia com mais chuva: " + maxChuvaDia.diaSemLongo + " (" + maxChuvaDia.dataCurta + ") com ~" + f1(maxChuvaDia.chuvaMm) + " mm (" + maxChuvaDia.probChuva + "%).");
      } else {
        L.push("Semana com predomínio de tempo firme e pouca chuva prevista em Cajamar.");
        L.push("Atenção à hidratação e proibição total de queimadas em terrenos e matas.");
      }
      L.push("Temperaturas na semana: mínima de " + n0(maisFrio.tmin) + "°C (" + maisFrio.diaSemCurto + ") e máxima de " + n0(maisQuente.tmax) + "°C (" + maisQuente.diaSemCurto + ").");
      L.push("Em caso de emergência, alagamento ou queda de árvore, ligue 199 (Defesa Civil) ou 193 (Bombeiros).");

      m.rodape = "Fonte: Previsão numérica Open-Meteo / Defesa Civil de Cajamar · Atualizado às " + hm(coletaOM);

      leg = "📅 PREVISÃO DO TEMPO PARA 5 DIAS EM CAJAMAR (" + per5 + ")\n\n" +
        "Confira como fica o tempo nos próximos dias para se programar:\n\n" +
        dias5.map(function (x) {
          return "• " + x.diaSemCurto + " (" + x.dataCurta + "): " + x.wmo.icone + " " + x.wmo.curto + " | 🌡️ " + n0(x.tmin) + "° a " + n0(x.tmax) + "°C | 🌧️ " + x.probChuva + "% (" + f1(x.chuvaMm) + " mm)";
        }).join("\n") +
        "\n\n📌 DESTAQUES PARA A POPULAÇÃO:\n" +
        L.map(function (t) { return "✔️ " + t; }).join("\n") +
        "\n\n📞 Emergência: Defesa Civil 199 | Bombeiros 193";
    } else if (tipo === "flyer_deslizamento") {
      if (typeof Deslizamento === "undefined") return;
      var avDesl = null;
      if (v === "serie:atual" && climaOM && climaOM.hourly) {
        var sAt = Deslizamento.extrairDeSerieHoraria(climaOM.hourly, climaOM.current && climaOM.current.time);
        avDesl = sAt ? sAt.atual : null;
      } else if (v === "serie:proj" && climaOM && climaOM.hourly) {
        var sPr = Deslizamento.extrairDeSerieHoraria(climaOM.hourly, climaOM.current && climaOM.current.time);
        avDesl = sPr ? sPr.projecao24h : null;
      } else if (v && v.indexOf("est:") === 0 && bancoEstacoes && bancoEstacoes.slots) {
        var pEst = v.split(":");
        var slE = bancoEstacoes.slots[pEst[1]];
        if (slE && slE.dias) avDesl = Deslizamento.avaliarDiaEstacao(slE.dias, pEst[2], slE.estacao || slE.rotulo);
      } else if (v && v.indexOf("sim:") === 0) {
        var nvSim = parseInt(v.slice(4), 10) || 0;
        var exemplos = [
          { mm1h: 2, mm24h: 8, mm168h: 22, fonte: "Monitoramento Preventivo Cajamar" },
          { mm1h: 14, mm24h: 35, mm168h: 68, fonte: "Protocolo Preventivo Cajamar" },
          { mm1h: 24, mm24h: 72, mm168h: 120, fonte: "Alerta Preventivo de Encostas" },
          { mm1h: 38, mm24h: 118, mm168h: 175, fonte: "Alerta de Risco de Deslizamento" },
          { mm1h: 56, mm24h: 165, mm168h: 230, fonte: "Emergência de Risco de Deslizamento" }
        ];
        avDesl = Deslizamento.avaliarRisco(exemplos[nvSim] || exemplos[0]);
      }
      if (!avDesl) {
        avDesl = Deslizamento.avaliarRisco({ mm1h: 0, mm24h: 0, mm168h: 0, fonte: "Monitoramento Cajamar" });
      }

      m.tipoFlyer = "deslizamento";
      m.dadosDeslizamento = avDesl;
      m.cor = avDesl.corFundo;
      m.tag = "⛰️ RISCO DE DESLIZAMENTO EM CAJAMAR: " + avDesl.icone + " " + avDesl.estado.toUpperCase();

      $("titulo").value = "ESTADO: " + avDesl.estado.toUpperCase();
      $("subtitulo").value = "Monitoramento de Encostas · " + avDesl.fonte;

      L.push(avDesl.orientacaoPopulacao);
      L.push("Sinais de perigo: rachaduras em paredes/muros, árvores ou postes inclinados e água barrenta brotando do barranco.");
      L.push("Gatilho técnico atual: " + avDesl.gatilhos.join(" · ") + ".");
      L.push("Moradores de encostas (Jordanésia, Polvilho, Ponunduva, Centro): ao notar qualquer sinal, saia do imóvel e ligue 199.");

      m.rodape = "Critérios: Pinheiro et al. (2005); AlertaRio (2013) · Defesa Civil de Cajamar";

      leg = "⛰️ BOLETIM DE RISCO DE DESLIZAMENTO DE TERRA — CAJAMAR/SP\n\n" +
        avDesl.icone + " ESTADO ATUAL: " + avDesl.estado.toUpperCase() + "\n" +
        "📋 Faixa de critério: " + avDesl.descricaoCriterio + "\n\n" +
        "🌧️ VOLUMES DE ÁGUA ANALISADOS:\n" +
        "• Em 1 hora (mm/h): " + f1(avDesl.mm1h) + " mm/h (" + avDesl.estado1h + ")\n" +
        "• Em 24 horas (mm/24h): " + f1(avDesl.mm24h) + " mm/24h (" + avDesl.estado24h + ")\n" +
        "• Em 7 dias / 168h (mm/168h): " + f1(avDesl.mm168h) + " mm/168h (" + avDesl.estado168h + ")\n\n" +
        "📌 ORIENTAÇÕES À POPULAÇÃO DE ÁREAS DE ENCOSTA:\n" +
        L.map(function (t) { return "✔️ " + t; }).join("\n") +
        "\n\n📞 Emergência: Defesa Civil 199 | Bombeiros 193";
    } else if (tipo === "flyer_fogo") {
      var dFogo = extrairDiaOM(+v || 0);
      if (!dFogo) return;
      var rfFogo = (typeof Queimadas !== "undefined" && Queimadas.calcularRiscoFogoLocal)
        ? Queimadas.calcularRiscoFogoLocal({
            temp: dFogo.tmax,
            umid: dFogo.uMin !== null ? dFogo.uMin : 40,
            vento: dFogo.ventoMax,
            rajada: dFogo.rajadaMax,
            chuva24h: dFogo.chuvaMm
          })
        : { nivel: "Moderado", classe: "am", regra30: 0, angstrom: 2.5, recomendacao: "Atenção ao tempo seco e proibição de queimadas." };

      var listaFocos = Array.isArray(focosInpe) ? focosInpe : [];
      var nCajamar = listaFocos.filter(function (f) { return f.emCajamar; }).length;
      var nRaio50 = listaFocos.filter(function (f) { return f.distanciaKm <= 50; }).length;

      m.tipoFlyer = "fogo";
      m.dadosFogo = {
        dia: dFogo,
        risco: rfFogo,
        nCajamar: nCajamar,
        nRaio50: nRaio50,
        totalRegiao: listaFocos.length
      };

      var ehCritico = rfFogo.classe === "v" || nCajamar > 0;
      var ehAlto = rfFogo.classe === "l" || nRaio50 >= 3;
      m.cor = ehCritico ? VERMELHO : ehAlto ? LARANJA : rfFogo.classe === "am" ? "#d97706" : VERDE;
      m.tag = "🔥 MONITORAMENTO DE QUEIMADAS E ESTIAGEM · " + rfFogo.nivel.toUpperCase();

      $("titulo").value = "RISCO DE FOGO: " + rfFogo.nivel.toUpperCase();
      $("subtitulo").value = dFogo.diaSemLongo + " (" + dFogo.dataCurta + ") · Cajamar/SP · Vigilância por Satélite";

      L.push(rfFogo.recomendacao);
      L.push("PROIBIDO atear fogo em mato, terrenos, lixo ou folhas secas (Crime Ambiental — Lei Municipal e Federal).");
      L.push("Não jogue bitucas de cigarro às margens de rodovias (Anhanguera, Bandeirantes e Edgard Máximo Zambotto).");
      if (dFogo.uMin !== null && dFogo.uMin <= 35) {
        L.push("Umidade do ar baixa (" + n0(dFogo.uMin) + "%): beba bastante água e evite esforço físico no sol entre 11h e 16h.");
      }
      L.push("Ao avistar fumaça ou foco de incêndio em vegetação, acione imediatamente o 193 (Bombeiros) ou 199 (Defesa Civil).");

      m.rodape = "Fontes: Satélites INPE BDQueimadas (GOES-19 / NPP-375 / NOAA-20/21) + Open-Meteo · " + hm(coletaOM);

      leg = "🔥 BOLETIM DE RISCO DE FOGO E ESTIAGEM — CAJAMAR (" + dFogo.dataCurta + ")\n\n" +
        "⚠️ Nível de Risco Meteorológico: " + rfFogo.nivel.toUpperCase() + "\n" +
        "💧 Umidade mínima prevista: " + n0(dFogo.uMin) + "%\n" +
        "🌡️ Temperatura máxima: " + n0(dFogo.tmax) + "°C\n" +
        "💨 Rajadas de vento: até " + n0(dFogo.rajadaMax) + " km/h\n" +
        "🛰️ Monitoramento Satelital (INPE): " + (nCajamar > 0 ? nCajamar + " foco(s) em Cajamar / " : "0 focos em Cajamar · ") + nRaio50 + " foco(s) num raio de 50 km\n\n" +
        "🚫 ORIENTAÇÕES IMPORTANTES À POPULAÇÃO:\n" +
        L.map(function (t) { return "• " + t; }).join("\n") +
        "\n\n📞 Denúncias e Emergências: Defesa Civil 199 | Bombeiros 193";
    } else if (tipo === "flyer_estacoes") {
      var bal = extrairBalancoEstacoesDia(v);
      if (!bal) return;
      m.tipoFlyer = "estacoes";
      m.dadosEstacoes = bal;
      var alertaChuva = bal.maxChuva >= 30 || (bal.regua && bal.regua.nvDelta >= 0.5);
      m.cor = alertaChuva ? LARANJA : "#0284c7";
      m.tag = "🌧️🌊 BALANÇO DAS ESTAÇÕES METEOROLÓGICAS + NÍVEL DO RIO";
      $("titulo").value = "MONITORAMENTO LOCAL · " + bal.dtCurta;
      $("subtitulo").value = "3 Estações Meteorológicas e Régua de Nível do Rio em Cajamar";

      L.push("Maior volume registrado no dia: " + f1(bal.maxChuva) + " mm" + (bal.estMaior ? " (" + bal.estMaior.nome + ")" : "") + " · Pico em 1h: " + f1(bal.maior1h) + " mm.");
      if (bal.comDados.length > 1) {
        L.push("Média de chuva entre as " + bal.comDados.length + " estações ativas: " + f1(bal.mediaChuva) + " mm.");
      }
      if (bal.regua) {
        L.push("Régua de Nível do Rio: mínimo de " + f2(bal.regua.nvMin) + " m, máximo de " + f2(bal.regua.nvMax) + " m (variação Δ de +" + Math.round((bal.regua.nvDelta || 0) * 100) + " cm no dia).");
      }
      L.push("Em caso de alagamento, elevação rápida do rio ou risco em encostas, acione a Defesa Civil pelo 199.");

      m.rodape = "Fonte: Rede de Estações Locais e Régua Fluviométrica — Defesa Civil de Cajamar";

      leg = "🌧️🌊 BALANÇO DAS ESTAÇÕES E NÍVEL DO RIO EM CAJAMAR — " + bal.dtCurta + "\n\n" +
        "Confira os registros medidos pela rede de monitoramento de Cajamar (" + bal.diaSemLongo + "):\n\n" +
        bal.estacoes.map(function (e) {
          return "• 🌡️ " + e.nome + ": " + (e.temDado ? f1(e.d.chuva) + " mm no dia (máx 1h: " + f1(e.d.c60) + " mm | Temp " + n0(e.d.tmin) + "° a " + n0(e.d.tmax) + "°C)" : "sem leitura importada");
        }).join("\n") +
        (bal.regua ? "\n• 🌊 " + bal.regua.nome + ": Nível mín " + f2(bal.regua.nvMin) + " m / máx " + f2(bal.regua.nvMax) + " m (subida Δ +" + Math.round((bal.regua.nvDelta || 0) * 100) + " cm)" : "") +
        "\n\n📌 DESTAQUES:\n" +
        L.map(function (t) { return "✔️ " + t; }).join("\n") +
        "\n\n📞 Emergência: Defesa Civil 199 | Bombeiros 193";
    } else if (tipo === "aviso") {
      var a = avisos[+v]; if (!a) return;
      m.cor = corAviso(a); m.tag = "AVISO OFICIAL · INMET";
      $("titulo").value = a.evento || "Aviso";
      $("subtitulo").value = "Aviso " + (a.severidade || "") + " para Cajamar";
      L.push("Válido de " + fhora(a.inicio) + " até " + fhora(a.fim));
      if (a.risco) L.push(a.risco);
      (a.instrucoes || []).slice(0, 3).forEach(function (t) { if (t) L.push(String(t)); });
      m.rodape = "Fonte: INMET (aviso oficial), coletado às " + hm(coletaAvisos);
      leg = "⚠️ AVISO DO INMET PARA CAJAMAR\n" + (a.evento || "Aviso") + " — " + (a.severidade || "") + "\nVálido de " + fhora(a.inicio) + " até " + fhora(a.fim) + ".\n" + (a.risco ? "\n" + a.risco + "\n" : "") + "\nEm emergência, ligue 199 (Defesa Civil) ou 193 (Bombeiros).\nFonte: INMET (previsao.inmet.gov.br). Informação repassada pela Defesa Civil de Cajamar.";
    } else if (tipo === "prevdia") {
      var d = previsao[+v]; if (!d) return;
      m.tag = "PREVISÃO · INMET";
      $("titulo").value = "Previsão para " + (d.ref.dia_semana || "") + ", " + d.dia.slice(0, 5);
      $("subtitulo").value = "Cajamar · previsão oficial do INMET";
      L.push("Mín " + n0(d.ref.temp_min) + "° · Máx " + n0(d.ref.temp_max) + "°");
      L.push("Umidade " + n0(d.ref.umidade_min) + "% a " + n0(d.ref.umidade_max) + "%");
      if (d.per) [["manha", "Manhã"], ["tarde", "Tarde"], ["noite", "Noite"]].forEach(function (p) { if (d.per[p[0]]) L.push(p[1] + ": " + descPeriodo(d.per[p[0]])); });
      else L.push(descPeriodo(d.ref));
      m.rodape = "Fonte: INMET, previsão coletada às " + hm(coletaPrev);
      leg = "🌦️ PREVISÃO PARA CAJAMAR — " + (d.ref.dia_semana || "") + ", " + d.dia.slice(0, 5) + "\n\n" + L.join("\n") + "\n\nPrevisão pode mudar: acompanhe os avisos oficiais.\nFonte: INMET (previsao.inmet.gov.br).";
    } else if (tipo === "prevsemana") {
      m.tag = "PREVISÃO · INMET";
      $("titulo").value = "Previsão dos próximos dias";
      $("subtitulo").value = "Cajamar · previsão oficial do INMET";
      previsao.slice(0, 5).forEach(function (d) { L.push(d.dia.slice(0, 5) + " · " + n0(d.ref.temp_min) + "°/" + n0(d.ref.temp_max) + "° · " + (d.ref.resumo || "—")); });
      m.rodape = "Fonte: INMET, previsão coletada às " + hm(coletaPrev);
      leg = "🌦️ PREVISÃO PARA CAJAMAR — PRÓXIMOS DIAS\n\n" + L.join("\n") + "\n\nPrevisão pode mudar: acompanhe os avisos oficiais.\nFonte: INMET (previsao.inmet.gov.br).";
    } else if (tipo === "chuva") {
      var slotRef = historico, chaveData = v;
      if (v && v.indexOf(":") > 0 && bancoEstacoes && bancoEstacoes.slots) {
        var partes = v.split(":");
        slotRef = bancoEstacoes.slots[partes[0]] || historico;
        chaveData = partes[1];
      }
      var dd = slotRef && slotRef.dias ? slotRef.dias[chaveData] : null; if (!dd) return;
      var nomeEstChuva = (slotRef && slotRef.estacao) ? slotRef.estacao : "Estação meteorológica local";
      var dt = chaveData.slice(8, 10) + "/" + chaveData.slice(5, 7) + "/" + chaveData.slice(0, 4);
      m.tag = "CHUVA MEDIDA EM CAJAMAR";
      $("titulo").value = "Chuva medida em " + dt;
      $("subtitulo").value = nomeEstChuva + " · Cajamar/SP";
      L.push("Chuva no dia: " + f1(dd.chuva) + " mm");
      L.push("Maior chuva em 1 hora: " + f1(dd.c60) + " mm");
      if (dd.tmin !== null && dd.tmax !== null) L.push("Temperatura: " + n0(dd.tmin) + "° a " + n0(dd.tmax) + "°");
      if (dd.vmax !== null) L.push("Vento máximo: " + f1(dd.vmax) + " km/h");
      var soma = 0, completo = true, base = new Date(chaveData + "T12:00:00");
      for (var i = 0; i < 7; i++) { var x = new Date(base); x.setDate(x.getDate() - i); var k2 = x.getFullYear() + "-" + p2(x.getMonth() + 1) + "-" + p2(x.getDate()); if (!slotRef.dias[k2] || slotRef.dias[k2].n < 1296) { completo = false; break; } soma += slotRef.dias[k2].chuva; }
      if (completo) L.push("Acumulado em 7 dias: " + f1(soma) + " mm");
      if (dd.n < 1296) L.push("Atenção: dia com leituras incompletas; a chuva pode ser maior.");
      m.rodape = "Medição da estação local (" + nomeEstChuva + "). Não é dado oficial do INMET/CEMADEN.";
      leg = "🌧️ CHUVA MEDIDA EM CAJAMAR — " + dt + " (" + nomeEstChuva + ")\n\n" + L.join("\n") + "\n\nMedição de estação local em Cajamar. Não substitui os dados oficiais do INMET e do CEMADEN.";
    } else if (tipo === "semana") {
      var sem = semanaCompleta(v); if (!sem) return;
      var tot = 0, comChuva = 0, maxD = sem[0], max1h = sem[0];
      sem.forEach(function (x) { tot += x.d.chuva; if (x.d.chuva >= 1) comChuva++; if (x.d.chuva > maxD.d.chuva) maxD = x; if (x.d.c60 > max1h.d.c60) max1h = x; });
      m.tag = "RESUMO DA SEMANA · CHUVA"; m.rodape = "Medição de uma estação local em Cajamar. Não é dado oficial do INMET/CEMADEN.";
      m.grafico = sem.map(function (x) { return { k: x.k, v: x.d.chuva }; });
      var periodo = fdm(sem[0].k) + " a " + fdm(v);
      $("titulo").value = "Chuva da semana em Cajamar";
      $("subtitulo").value = periodo + " · estação meteorológica local";
      L.push("Total na semana: " + f1(tot) + " mm");
      L.push("Dias com chuva (1 mm ou mais): " + comChuva + " de 7");
      L.push(maxD.d.chuva > 0 ? "Dia mais chuvoso: " + fdm(maxD.k) + " (" + f1(maxD.d.chuva) + " mm)" : "Sem chuva registrada na semana");
      if (max1h.d.c60 > 0) L.push("Maior chuva em 1 hora: " + f1(max1h.d.c60) + " mm (" + fdm(max1h.k) + ")");
      leg = "🌧️ CHUVA DA SEMANA EM CAJAMAR — " + periodo + "\n\n" + L.join("\n") + "\n\nMedição de uma estação local, em um ponto da cidade. Não substitui os dados oficiais do INMET e do CEMADEN.";
    } else if (tipo === "dica") {
      var dc = DICAS[v]; if (!dc) return;
      m.tag = "DICA DE PREVENÇÃO";
      $("titulo").value = v; $("subtitulo").value = "Defesa Civil de Cajamar";
      L = dc.linhas.slice();
      m.rodape = "Orientação geral de prevenção.";
      leg = "🛟 DICA DE PREVENÇÃO — " + v + "\n\n" + dc.legenda + "\n\n" + L.map(function (t) { return "• " + t; }).join("\n");
    }
    $("linhas").value = L.join("\n");
    if ($("textoFaixa")) $("textoFaixa").value = m.tag || "";
    modelo = m;
    var c = contatoLocal(); if (c) leg += "\nDefesa Civil de Cajamar: " + c;
    $("legenda").value = leg + "\n\n#DefesaCivil #Cajamar #ClimaCajamar #Jordanésia #Polvilho";
    desenhar();
  }

  function contatoLocal() { return $("contato").value.trim(); }

  // ---------- desenho ----------
  var imgs = {};
  function carregarImg(k, src) {
    return new Promise(function (ok) { var i = new Image(); i.onload = function () { imgs[k] = i; ok(); }; i.onerror = function () { ok(); }; i.src = src; });
  }
  function quebrar(txt, larg) {
    var palavras = String(txt).split(/\s+/), linhas = [], at = "";
    palavras.forEach(function (p) {
      var t = at ? at + " " + p : p;
      if (ctx.measureText(t).width <= larg || !at) at = t; else { linhas.push(at); at = p; }
    });
    if (at) linhas.push(at);
    return linhas;
  }
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  var FONTE = "'Segoe UI', system-ui, -apple-system, Roboto, Arial, sans-serif";

  var FORMATOS = {
    stories: { w: 1080, h: 1920, yTopo: 110, headerBox: 140, logoDim: 128, titleSize: 58, subSize: 34, maxLinhas: 40, minLinhas: 24, limite: 1620, yr: 1660, prefix: "story" },
    retrato: { w: 1080, h: 1350, yTopo: 46, headerBox: 116, logoDim: 104, titleSize: 46, subSize: 28, maxLinhas: 32, minLinhas: 20, limite: 1130, yr: 1165, prefix: "retrato" },
    feed: { w: 1080, h: 1080, yTopo: 30, headerBox: 98, logoDim: 88, titleSize: 38, subSize: 24, maxLinhas: 26, minLinhas: 18, limite: 900, yr: 928, prefix: "feed" }
  };

  function corEfetivaFaixa() {
    var nv = $("nivelFaixa") ? $("nivelFaixa").value : "auto";
    if (nv === "normal") return VERDE;
    if (nv === "atencao") return "#d97706";
    if (nv === "alerta") return LARANJA;
    if (nv === "emergencia") return VERMELHO;
    if (nv === "maximo") return "#6b21a8";
    return modelo.cor || LARANJA;
  }

  function textoEfetivoFaixa() {
    var t = $("textoFaixa") ? $("textoFaixa").value.trim() : "";
    return t || modelo.tag || "";
  }

  function desenharCabecalhoInstitucional(cfg, fmtKey) {
    var yTopo = cfg.yTopo;
    ctx.fillStyle = "#fff";
    rr(60, yTopo, cfg.headerBox, cfg.headerBox, 16);
    ctx.fill();
    if (imgs.logo) ctx.drawImage(imgs.logo, 66, yTopo + 6, cfg.logoDim, cfg.logoDim);
    if (imgs.brasao) {
      var bh = cfg.headerBox - 12, bw = bh * imgs.brasao.width / imgs.brasao.height;
      ctx.drawImage(imgs.brasao, W - 60 - bw, yTopo + 6, bw, bh);
    }

    ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    var tamTit = Math.round(cfg.headerBox * 0.24);
    var tamSub = Math.round(cfg.headerBox * 0.19);
    ctx.font = "800 " + tamTit + "px " + FONTE;
    ctx.fillText("DEFESA CIVIL DE CAJAMAR", W / 2, yTopo + cfg.headerBox * 0.44);
    ctx.fillStyle = "#93c5fd";
    ctx.font = "600 " + tamSub + "px " + FONTE;
    ctx.fillText("BOLETIM METEOROLÓGICO À POPULAÇÃO", W / 2, yTopo + cfg.headerBox * 0.76);

    var hTag = fmtKey === "feed" ? 50 : 62;
    var yTag = yTopo + cfg.headerBox + (fmtKey === "feed" ? 12 : 16);
    var corTag = corEfetivaFaixa();
    ctx.fillStyle = corTag;
    rr(60, yTag, W - 120, hTag, 12);
    ctx.fill();
    var clara = /^#(f|e|d)/i.test(corTag) && !/^#(dc|d9|ea)/i.test(corTag);
    ctx.fillStyle = clara ? "#111" : "#fff";
    ctx.font = "800 " + (fmtKey === "feed" ? "24px " : "29px ") + FONTE;
    ctx.fillText(textoEfetivoFaixa(), W / 2, yTag + (fmtKey === "feed" ? 34 : 42));
    return yTag + hTag;
  }

  function desenharRodapeInstitucional(cfg, fmtKey) {
    var yr = cfg.yr;
    var c = contatoLocal();
    // Faixa de emergência destacada
    var hEmg = fmtKey === "feed" ? 48 : 58;
    ctx.fillStyle = "rgba(220, 38, 38, 0.9)";
    rr(60, yr, W - 120, hEmg, 12);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.font = "800 " + (fmtKey === "feed" ? "23px " : "27px ") + FONTE;
    ctx.fillText("📞 EMERGÊNCIA: DEFESA CIVIL 199 · BOMBEIROS 193" + (c ? " · " + c : ""), W / 2, yr + (fmtKey === "feed" ? 32 : 39));

    ctx.textAlign = "left";
    ctx.fillStyle = "#cbd5e1";
    var yy = yr + hEmg + (fmtKey === "feed" ? 26 : 32);
    var tamRodape = fmtKey === "feed" ? 18 : 22;
    ctx.font = "500 " + tamRodape + "px " + FONTE;
    var txt1 = (modelo.rodape || "Fonte: Defesa Civil de Cajamar") + " · Emitido em " + agora();
    ctx.fillText(txt1.slice(0, 95), 60, yy);
  }

  // ---------- Panfleto Visual Diário (flyer_dia) ----------
  function desenharFlyerDia(cfg, fmtKey, yBase) {
    var d = modelo.dadosDia;
    if (!d) return;
    var x = 60, larg = W - 120;
    var y = yBase + (fmtKey === "feed" ? 22 : 32);

    // Bloco Principal: Título do Dia + Condição Geral
    var hHero = fmtKey === "stories" ? 140 : fmtKey === "retrato" ? 110 : 88;
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    rr(x, y, larg, hHero, 16);
    ctx.fill();

    ctx.textAlign = "left";
    ctx.fillStyle = "#fff";
    ctx.font = "800 " + (fmtKey === "stories" ? "46px " : fmtKey === "retrato" ? "38px " : "32px ") + FONTE;
    ctx.fillText($("titulo").value || (d.diaSemLongo.toUpperCase() + " · " + d.dataCurta), x + 24, y + (fmtKey === "stories" ? 56 : fmtKey === "retrato" ? 46 : 38));

    ctx.fillStyle = "#fde047";
    ctx.font = "700 " + (fmtKey === "stories" ? "34px " : fmtKey === "retrato" ? "28px " : "23px ") + FONTE;
    ctx.fillText($("subtitulo").value || (d.wmo.icone + " " + d.wmo.longo), x + 24, y + (fmtKey === "stories" ? 110 : fmtKey === "retrato" ? 88 : 72));

    y += hHero + (fmtKey === "feed" ? 14 : 20);

    // Grid 2x2 de Indicadores Principais (Temperatura, Chuva, Umidade, Vento/UV)
    var hCard = fmtKey === "stories" ? 145 : fmtKey === "retrato" ? 112 : 90;
    var gap = 16;
    var wCard = (larg - gap) / 2;
    var indicadores = [
      { rot: "🌡️ TEMPERATURA HOJE", val: n0(d.tmin) + "°C a " + n0(d.tmax) + "°C", sub: "Sensação térmica até " + n0(d.sMax) + "°C", cor: "#38bdf8" },
      { rot: "🌧️ CHUVA PREVISTA", val: d.probChuva + "% · " + f1(d.chuvaMm) + " mm", sub: d.chuvaMm >= 10 ? "Atenção para pancadas fortes" : (d.probChuva >= 40 ? "Possibilidade de pancadas" : "Baixo volume esperado"), cor: "#60a5fa" },
      { rot: "💧 UMIDADE DO AR", val: (d.uMin !== null ? n0(d.uMin) + "% a " + n0(d.uMax) + "%" : "—"), sub: (d.uMin !== null && d.uMin <= 30) ? "⚠️ Abaixo do ideal — hidrate-se" : "Conforto e qualidade do ar", cor: "#34d399" },
      { rot: "💨 VENTO E ÍNDICE UV", val: "Rajadas " + n0(d.rajadaMax) + " km/h", sub: "Índice UV máx: " + nivelUvTexto(d.uvMax), cor: "#fbbf24" }
    ];

    indicadores.forEach(function (ind, i) {
      var col = i % 2, row = Math.floor(i / 2);
      var cx = x + col * (wCard + gap);
      var cy = y + row * (hCard + gap);
      ctx.fillStyle = "rgba(15, 23, 42, 0.65)";
      rr(cx, cy, wCard, hCard, 14);
      ctx.fill();
      ctx.fillStyle = ind.cor;
      ctx.fillRect(cx, cy + 14, 7, hCard - 28);

      ctx.fillStyle = "#93c5fd";
      ctx.font = "700 " + (fmtKey === "feed" ? "17px " : "21px ") + FONTE;
      ctx.fillText(ind.rot, cx + 22, cy + (fmtKey === "stories" ? 36 : fmtKey === "retrato" ? 30 : 24));

      ctx.fillStyle = "#fff";
      ctx.font = "800 " + (fmtKey === "stories" ? "40px " : fmtKey === "retrato" ? "32px " : "26px ") + FONTE;
      ctx.fillText(ind.val, cx + 22, cy + (fmtKey === "stories" ? 86 : fmtKey === "retrato" ? 68 : 54));

      ctx.fillStyle = "#cbd5e1";
      ctx.font = "500 " + (fmtKey === "feed" ? "16px " : "20px ") + FONTE;
      ctx.fillText(ind.sub, cx + 22, cy + (fmtKey === "stories" ? 124 : fmtKey === "retrato" ? 98 : 78));
    });

    y += hCard * 2 + gap + (fmtKey === "feed" ? 14 : 22);

    // 3 Colunas de Períodos: Manhã · Tarde · Noite
    var hPer = fmtKey === "stories" ? 165 : fmtKey === "retrato" ? 128 : 102;
    var wPer = (larg - gap * 2) / 3;
    var periodos = [
      { tit: "🌅 MANHÃ", d: d.manha },
      { tit: "☀️ TARDE", d: d.tarde },
      { tit: "🌙 NOITE", d: d.noite }
    ];
    periodos.forEach(function (p, idx) {
      var px = x + idx * (wPer + gap);
      ctx.fillStyle = "rgba(255,255,255,0.09)";
      rr(px, y, wPer, hPer, 14);
      ctx.fill();

      ctx.textAlign = "center";
      var mid = px + wPer / 2;
      ctx.fillStyle = "#fde047";
      ctx.font = "800 " + (fmtKey === "feed" ? "18px " : "22px ") + FONTE;
      ctx.fillText(p.tit, mid, y + (fmtKey === "stories" ? 36 : 28));

      ctx.fillStyle = "#fff";
      ctx.font = "800 " + (fmtKey === "stories" ? "36px " : fmtKey === "retrato" ? "28px " : "23px ") + FONTE;
      ctx.fillText(p.d.icone + " " + p.d.temp, mid, y + (fmtKey === "stories" ? 84 : fmtKey === "retrato" ? 66 : 54));

      ctx.fillStyle = "#e2e8f0";
      ctx.font = "600 " + (fmtKey === "feed" ? "16px " : "20px ") + FONTE;
      ctx.fillText(p.d.curto.slice(0, 20), mid, y + (fmtKey === "stories" ? 120 : fmtKey === "retrato" ? 94 : 76));

      ctx.fillStyle = p.d.prob >= 50 ? "#fb923c" : "#93c5fd";
      ctx.font = "700 " + (fmtKey === "feed" ? "15px " : "19px ") + FONTE;
      ctx.fillText("Chuva: " + p.d.prob + "%" + (p.d.chuva > 0 ? " (" + f1(p.d.chuva) + " mm)" : ""), mid, y + (fmtKey === "stories" ? 150 : fmtKey === "retrato" ? 118 : 94));
    });
    ctx.textAlign = "left";
    y += hPer + (fmtKey === "feed" ? 14 : 24);

    // Bloco "O QUE A POPULAÇÃO PRECISA SABER HOJE"
    var altRestante = cfg.limite - y;
    ctx.fillStyle = "rgba(15, 23, 42, 0.72)";
    rr(x, y, larg, Math.max(120, altRestante), 16);
    ctx.fill();

    ctx.fillStyle = "#fde047";
    var tamCabRec = fmtKey === "stories" ? 28 : fmtKey === "retrato" ? 23 : 20;
    ctx.font = "800 " + tamCabRec + "px " + FONTE;
    ctx.fillText("📌 O QUE A POPULAÇÃO PRECISA SABER HOJE:", x + 24, y + tamCabRec + 14);

    var yTxt = y + tamCabRec * 2 + (fmtKey === "feed" ? 12 : 22);
    var linhas = $("linhas").value.split(/\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    var tamTxt = fmtKey === "stories" ? 28 : fmtKey === "retrato" ? 22 : 18;
    ctx.font = "500 " + tamTxt + "px " + FONTE;
    ctx.fillStyle = "#fff";

    linhas.slice(0, 5).forEach(function (lin) {
      var q = quebrar("• " + lin, larg - 48);
      q.slice(0, 2).forEach(function (ql) {
        if (yTxt <= cfg.limite - 12) {
          ctx.fillText(ql, x + 24, yTxt);
          yTxt += tamTxt * 1.28;
        }
      });
      yTxt += 6;
    });
  }

  // ---------- Panfleto Visual de 5 Dias (flyer_5dias) ----------
  function desenharFlyer5Dias(cfg, fmtKey, yBase) {
    var dias5 = modelo.dados5Dias;
    if (!dias5 || !dias5.length) return;
    var x = 60, larg = W - 120;
    var y = yBase + (fmtKey === "feed" ? 16 : 24);

    ctx.textAlign = "left";
    ctx.fillStyle = "#fff";
    ctx.font = "800 " + (fmtKey === "stories" ? "42px " : fmtKey === "retrato" ? "34px " : "28px ") + FONTE;
    ctx.fillText($("titulo").value || "PREVISÃO PARA 5 DIAS", x, y + (fmtKey === "feed" ? 26 : 34));
    ctx.fillStyle = "#b9c6ee";
    ctx.font = "500 " + (fmtKey === "stories" ? "26px " : "21px ") + FONTE;
    ctx.fillText($("subtitulo").value || "Cajamar/SP · Planeje sua semana", x, y + (fmtKey === "feed" ? 52 : 68));

    y += (fmtKey === "feed" ? 66 : 86);

    // 5 Cartões Horizontais (um por dia)
    var hRow = fmtKey === "stories" ? 148 : fmtKey === "retrato" ? 102 : 76;
    var gapRow = fmtKey === "stories" ? 16 : fmtKey === "retrato" ? 10 : 8;

    dias5.forEach(function (d, idx) {
      var ry = y + idx * (hRow + gapRow);
      ctx.fillStyle = idx === 0 ? "rgba(56, 189, 248, 0.16)" : "rgba(15, 23, 42, 0.68)";
      rr(x, ry, larg, hRow, 14);
      ctx.fill();

      var corBarra = d.chuvaMm >= 15 || d.probChuva >= 70 ? LARANJA : (d.probChuva >= 40 ? "#eab308" : "#38bdf8");
      ctx.fillStyle = corBarra;
      ctx.fillRect(x, ry + 12, 8, hRow - 24);

      var cyMid = ry + hRow * 0.44;
      var cySub = ry + hRow * 0.78;

      // Coluna 1: Dia e Data
      ctx.textAlign = "left";
      ctx.fillStyle = "#fde047";
      ctx.font = "800 " + (fmtKey === "stories" ? "32px " : fmtKey === "retrato" ? "25px " : "21px ") + FONTE;
      ctx.fillText(d.diaSemCurto + " " + d.dataCurta, x + 24, cyMid);
      ctx.fillStyle = "#cbd5e1";
      ctx.font = "500 " + (fmtKey === "stories" ? "22px " : "17px ") + FONTE;
      ctx.fillText(idx === 0 ? "Hoje" : d.diaSemLongo.split("-")[0], x + 24, cySub);

      // Coluna 2: Ícone + Condição
      ctx.fillStyle = "#fff";
      ctx.font = "700 " + (fmtKey === "stories" ? "30px " : fmtKey === "retrato" ? "23px " : "19px ") + FONTE;
      ctx.fillText(d.wmo.icone + " " + d.wmo.curto, x + 235, cyMid);
      ctx.fillStyle = "#93c5fd";
      ctx.font = "500 " + (fmtKey === "stories" ? "21px " : "16px ") + FONTE;
      ctx.fillText("Mín " + n0(d.uMin) + "% umid · Vento " + n0(d.rajadaMax) + " km/h", x + 235, cySub);

      // Coluna 3 (Direita): Temperaturas Mín/Máx e Chuva
      ctx.textAlign = "right";
      ctx.fillStyle = "#fff";
      ctx.font = "800 " + (fmtKey === "stories" ? "36px " : fmtKey === "retrato" ? "27px " : "22px ") + FONTE;
      ctx.fillText(n0(d.tmin) + "° / " + n0(d.tmax) + "°C", x + larg - 24, cyMid);

      ctx.fillStyle = d.probChuva >= 50 ? "#fb923c" : "#38bdf8";
      ctx.font = "700 " + (fmtKey === "stories" ? "23px " : "18px ") + FONTE;
      ctx.fillText("🌧️ " + d.probChuva + "% · " + f1(d.chuvaMm) + " mm", x + larg - 24, cySub);
    });

    ctx.textAlign = "left";
    y += dias5.length * (hRow + gapRow) + (fmtKey === "feed" ? 6 : 12);

    // Bloco "ORIENTAÇÕES E DESTAQUES DA SEMANA"
    var altRest = cfg.limite - y;
    if (altRest > 70) {
      ctx.fillStyle = "rgba(15, 23, 42, 0.72)";
      rr(x, y, larg, altRest, 14);
      ctx.fill();

      var tamTit = fmtKey === "stories" ? 26 : fmtKey === "retrato" ? 21 : 17;
      ctx.fillStyle = "#fde047";
      ctx.font = "800 " + tamTit + "px " + FONTE;
      ctx.fillText("📌 DESTAQUES E ORIENTAÇÕES À POPULAÇÃO:", x + 22, y + tamTit + 10);

      var yL = y + tamTit * 2 + (fmtKey === "feed" ? 8 : 16);
      var tamL = fmtKey === "stories" ? 25 : fmtKey === "retrato" ? 19 : 16;
      ctx.font = "500 " + tamL + "px " + FONTE;
      ctx.fillStyle = "#fff";
      var linhas = $("linhas").value.split(/\n/).map(function (s) { return s.trim(); }).filter(Boolean);
      linhas.slice(0, 4).forEach(function (lin) {
        quebrar("• " + lin, larg - 44).slice(0, 2).forEach(function (ql) {
          if (yL <= cfg.limite - 10) {
            ctx.fillText(ql, x + 22, yL);
            yL += tamL * 1.25;
          }
        });
        yL += 4;
      });
    }
  }

  // ---------- Panfleto Visual de Risco de Fogo e Estiagem (flyer_fogo) ----------
  function desenharFlyerFogo(cfg, fmtKey, yBase) {
    var fg = modelo.dadosFogo;
    if (!fg || !fg.dia) return;
    var d = fg.dia, rf = fg.risco;
    var x = 60, larg = W - 120;
    var y = yBase + (fmtKey === "feed" ? 20 : 30);

    var hHero = fmtKey === "stories" ? 150 : fmtKey === "retrato" ? 115 : 92;
    ctx.fillStyle = "rgba(220, 38, 38, 0.16)";
    rr(x, y, larg, hHero, 16);
    ctx.fill();
    ctx.fillStyle = corEfetivaFaixa();
    ctx.fillRect(x, y + 14, 9, hHero - 28);

    ctx.textAlign = "left";
    ctx.fillStyle = "#fff";
    ctx.font = "800 " + (fmtKey === "stories" ? "44px " : fmtKey === "retrato" ? "35px " : "29px ") + FONTE;
    ctx.fillText($("titulo").value || ("RISCO DE FOGO: " + rf.nivel.toUpperCase()), x + 26, y + (fmtKey === "stories" ? 56 : fmtKey === "retrato" ? 44 : 36));

    ctx.fillStyle = "#fde047";
    ctx.font = "700 " + (fmtKey === "stories" ? "30px " : fmtKey === "retrato" ? "24px " : "20px ") + FONTE;
    ctx.fillText($("subtitulo").value || (d.diaSemLongo + " (" + d.dataCurta + ") · Cajamar/SP"), x + 26, y + (fmtKey === "stories" ? 102 : fmtKey === "retrato" ? 80 : 64));

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "500 " + (fmtKey === "stories" ? "23px " : "18px ") + FONTE;
    ctx.fillText("Regra dos 30: " + rf.regra30 + "/3 fatores ativos · Índice de Angström: " + String(rf.angstrom).replace(".", ","), x + 26, y + (fmtKey === "stories" ? 136 : fmtKey === "retrato" ? 105 : 84));

    y += hHero + (fmtKey === "feed" ? 14 : 22);

    var hCard = fmtKey === "stories" ? 150 : fmtKey === "retrato" ? 114 : 90;
    var gap = 16;
    var wCard = (larg - gap) / 2;
    var cards = [
      { rot: "💧 UMIDADE MÍNIMA", val: n0(d.uMin) + "%", sub: (d.uMin !== null && d.uMin <= 30) ? "⚠️ Estado de Atenção (< 30%)" : "Mínima prevista para a tarde", cor: "#f97316" },
      { rot: "🌡️ TEMPERATURA MÁXIMA", val: n0(d.tmax) + "°C", sub: "Sensação térmica até " + n0(d.sMax) + "°C", cor: "#ef4444" },
      { rot: "💨 RAJADAS DE VENTO", val: n0(d.rajadaMax) + " km/h", sub: d.rajadaMax >= 30 ? "⚠️ Vento acelera propagação" : "Velocidade máxima prevista", cor: "#eab308" },
      { rot: "🛰️ SATÉLITES INPE / NASA", val: fg.nCajamar > 0 ? fg.nCajamar + " foco(s) local" : fg.nRaio50 + " foco(s) (50 km)", sub: "GOES-19 · NPP-375 · NOAA-20/21", cor: "#38bdf8" }
    ];

    cards.forEach(function (ind, i) {
      var col = i % 2, row = Math.floor(i / 2);
      var cx = x + col * (wCard + gap);
      var cy = y + row * (hCard + gap);
      ctx.fillStyle = "rgba(15, 23, 42, 0.72)";
      rr(cx, cy, wCard, hCard, 14);
      ctx.fill();
      ctx.fillStyle = ind.cor;
      ctx.fillRect(cx, cy + 14, 7, hCard - 28);

      ctx.fillStyle = "#93c5fd";
      ctx.font = "700 " + (fmtKey === "feed" ? "17px " : "21px ") + FONTE;
      ctx.fillText(ind.rot, cx + 22, cy + (fmtKey === "stories" ? 36 : fmtKey === "retrato" ? 30 : 24));

      ctx.fillStyle = "#fff";
      ctx.font = "800 " + (fmtKey === "stories" ? "42px " : fmtKey === "retrato" ? "32px " : "26px ") + FONTE;
      ctx.fillText(ind.val, cx + 22, cy + (fmtKey === "stories" ? 88 : fmtKey === "retrato" ? 68 : 54));

      ctx.fillStyle = "#cbd5e1";
      ctx.font = "500 " + (fmtKey === "feed" ? "16px " : "20px ") + FONTE;
      ctx.fillText(ind.sub, cx + 22, cy + (fmtKey === "stories" ? 128 : fmtKey === "retrato" ? 98 : 78));
    });

    y += hCard * 2 + gap + (fmtKey === "feed" ? 14 : 24);

    var altRest = cfg.limite - y;
    ctx.fillStyle = "rgba(15, 23, 42, 0.78)";
    rr(x, y, larg, Math.max(120, altRest), 16);
    ctx.fill();

    ctx.fillStyle = "#fde047";
    var tamCab = fmtKey === "stories" ? 28 : fmtKey === "retrato" ? 23 : 19;
    ctx.font = "800 " + tamCab + "px " + FONTE;
    ctx.fillText("🚫 QUEIMADA É CRIME AMBIENTAL · ORIENTAÇÕES À POPULAÇÃO:", x + 24, y + tamCab + 14);

    var yTxt = y + tamCab * 2 + (fmtKey === "feed" ? 12 : 22);
    var linhas = $("linhas").value.split(/\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    var tamTxt = fmtKey === "stories" ? 27 : fmtKey === "retrato" ? 21 : 17;
    ctx.font = "500 " + tamTxt + "px " + FONTE;
    ctx.fillStyle = "#fff";
    linhas.slice(0, 5).forEach(function (lin) {
      quebrar("• " + lin, larg - 48).slice(0, 2).forEach(function (ql) {
        if (yTxt <= cfg.limite - 12) {
          ctx.fillText(ql, x + 24, yTxt);
          yTxt += tamTxt * 1.28;
        }
      });
      yTxt += 6;
    });
  }

  // ---------- Panfleto Visual das 3 Estações + Régua de Nível (flyer_estacoes) ----------
  function desenharFlyerEstacoes(cfg, fmtKey, yBase) {
    var b = modelo.dadosEstacoes;
    if (!b) return;
    var x = 60, larg = W - 120;
    var y = yBase + (fmtKey === "feed" ? 16 : 24);

    ctx.textAlign = "left";
    ctx.fillStyle = "#fff";
    ctx.font = "800 " + (fmtKey === "stories" ? "42px " : fmtKey === "retrato" ? "34px " : "28px ") + FONTE;
    ctx.fillText($("titulo").value || ("BALANÇO DAS ESTAÇÕES · " + b.dtCurta), x, y + (fmtKey === "feed" ? 26 : 34));
    ctx.fillStyle = "#b9c6ee";
    ctx.font = "500 " + (fmtKey === "stories" ? "26px " : "21px ") + FONTE;
    ctx.fillText($("subtitulo").value || "Rede Meteorológica e Fluviométrica de Cajamar/SP", x, y + (fmtKey === "feed" ? 52 : 68));

    y += (fmtKey === "feed" ? 66 : 86);

    var hRow = fmtKey === "stories" ? 156 : fmtKey === "retrato" ? 110 : 82;
    var gapRow = fmtKey === "stories" ? 16 : fmtKey === "retrato" ? 10 : 8;

    // 3 Cartões de Estações + 1 Cartão da Régua do Rio
    var blocos = b.estacoes.map(function (e) {
      return {
        icone: "🌡️",
        nome: e.nome,
        cor: e.temDado ? (e.d.chuva >= 25 ? LARANJA : "#38bdf8") : "#64748b",
        principal: e.temDado ? f1(e.d.chuva) + " mm" : "Sem CSV",
        det1: e.temDado ? ("Pico 1h: " + f1(e.d.c60) + " mm · 10m: " + f1(e.d.c10) + " mm") : "Envie o CSV na aba Histórico",
        det2: e.temDado ? ("Temp: " + n0(e.d.tmin) + "° a " + n0(e.d.tmax) + "°C · Vento máx: " + f1(e.d.vmax) + " km/h") : "—"
      };
    });

    blocos.push({
      icone: "🌊",
      nome: b.regua ? b.regua.nome : "Régua de Nível do Rio",
      cor: b.regua ? (b.regua.nvDelta >= 0.4 ? LARANJA : "#34d399") : "#64748b",
      principal: b.regua ? (f2(b.regua.nvMax) + " m (máx)") : "Sem CSV",
      det1: b.regua ? ("Nível Mín: " + f2(b.regua.nvMin) + " m · Médio: " + f2(b.regua.nvMed) + " m") : "Envie o CSV da régua de nível",
      det2: b.regua ? ("Subida máxima no dia (Δ): +" + Math.round((b.regua.nvDelta || 0) * 100) + " cm (" + f2(b.regua.nvDelta) + " m)") : "—"
    });

    blocos.forEach(function (bl, idx) {
      var ry = y + idx * (hRow + gapRow);
      ctx.fillStyle = idx === 3 ? "rgba(16, 185, 129, 0.14)" : "rgba(15, 23, 42, 0.7)";
      rr(x, ry, larg, hRow, 14);
      ctx.fill();

      ctx.fillStyle = bl.cor;
      ctx.fillRect(x, ry + 12, 8, hRow - 24);

      ctx.textAlign = "left";
      ctx.fillStyle = "#fde047";
      ctx.font = "800 " + (fmtKey === "stories" ? "29px " : fmtKey === "retrato" ? "23px " : "19px ") + FONTE;
      ctx.fillText(bl.icone + " " + bl.nome, x + 24, ry + hRow * 0.36);

      ctx.fillStyle = "#e2e8f0";
      ctx.font = "600 " + (fmtKey === "stories" ? "22px " : "17px ") + FONTE;
      ctx.fillText(bl.det1, x + 24, ry + hRow * 0.65);

      ctx.fillStyle = "#93c5fd";
      ctx.font = "500 " + (fmtKey === "stories" ? "20px " : "15px ") + FONTE;
      ctx.fillText(bl.det2, x + 24, ry + hRow * 0.88);

      ctx.textAlign = "right";
      ctx.fillStyle = "#fff";
      ctx.font = "800 " + (fmtKey === "stories" ? "40px " : fmtKey === "retrato" ? "30px " : "24px ") + FONTE;
      ctx.fillText(bl.principal, x + larg - 24, ry + hRow * 0.56);
    });

    ctx.textAlign = "left";
    y += blocos.length * (hRow + gapRow) + (fmtKey === "feed" ? 8 : 14);

    var altRest = cfg.limite - y;
    if (altRest > 70) {
      ctx.fillStyle = "rgba(15, 23, 42, 0.74)";
      rr(x, y, larg, altRest, 14);
      ctx.fill();

      var tamTit = fmtKey === "stories" ? 26 : fmtKey === "retrato" ? 21 : 17;
      ctx.fillStyle = "#fde047";
      ctx.font = "800 " + tamTit + "px " + FONTE;
      ctx.fillText("📌 RESUMO HIDROMETEOROLÓGICO DO DIA:", x + 22, y + tamTit + 10);

      var yL = y + tamTit * 2 + (fmtKey === "feed" ? 8 : 16);
      var tamL = fmtKey === "stories" ? 25 : fmtKey === "retrato" ? 19 : 16;
      ctx.font = "500 " + tamL + "px " + FONTE;
      ctx.fillStyle = "#fff";
      var linhas = $("linhas").value.split(/\n/).map(function (s) { return s.trim(); }).filter(Boolean);
      linhas.slice(0, 4).forEach(function (lin) {
        quebrar("• " + lin, larg - 44).slice(0, 2).forEach(function (ql) {
          if (yL <= cfg.limite - 10) {
            ctx.fillText(ql, x + 22, yL);
            yL += tamL * 1.25;
          }
        });
        yL += 4;
      });
    }
  }

  // ---------- Panfleto Visual de Risco de Deslizamento (flyer_deslizamento) ----------
  function desenharFlyerDeslizamento(cfg, fmtKey, yBase) {
    var av = modelo.dadosDeslizamento;
    if (!av) return;
    var x = 60, larg = W - 120;
    var y = yBase + (fmtKey === "feed" ? 18 : 26);

    var hHero = fmtKey === "stories" ? 142 : fmtKey === "retrato" ? 110 : 88;
    ctx.fillStyle = "rgba(15, 23, 42, 0.78)";
    rr(x, y, larg, hHero, 16);
    ctx.fill();
    ctx.fillStyle = corEfetivaFaixa();
    ctx.fillRect(x, y + 14, 9, hHero - 28);

    ctx.textAlign = "left";
    ctx.fillStyle = "#fff";
    ctx.font = "800 " + (fmtKey === "stories" ? "42px " : fmtKey === "retrato" ? "34px " : "28px ") + FONTE;
    ctx.fillText($("titulo").value || ("ESTADO: " + String(av.estado).toUpperCase()), x + 26, y + (fmtKey === "stories" ? 54 : fmtKey === "retrato" ? 42 : 34));

    ctx.fillStyle = "#fde047";
    ctx.font = "700 " + (fmtKey === "stories" ? "28px " : fmtKey === "retrato" ? "23px " : "19px ") + FONTE;
    ctx.fillText($("subtitulo").value || ((av.fonte || "Monitoramento Cajamar") + " · Cajamar/SP"), x + 26, y + (fmtKey === "stories" ? 96 : fmtKey === "retrato" ? 76 : 60));

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "500 " + (fmtKey === "stories" ? "22px " : "17px ") + FONTE;
    ctx.fillText("Critérios técnicos: Pinheiro et al. (2005) e AlertaRio (2013) — 1h · 24h · 168h (7 dias)", x + 26, y + (fmtKey === "stories" ? 128 : fmtKey === "retrato" ? 100 : 80));

    y += hHero + (fmtKey === "feed" ? 12 : 20);

    // 3 Cartões de Janelas de Acumulado (1h, 24h, 168h)
    var hJan = fmtKey === "stories" ? 156 : fmtKey === "retrato" ? 118 : 92;
    var gap = 16;
    var wJan = (larg - gap * 2) / 3;
    var janelas = [
      { rot: "⏱️ CHUVA 1 HORA", val: f1(av.mm1h) + " mm/h", est: window.Deslizamento.ESTADOS[av.nivel1h || 0], ref: "Normal < 10 · Alerta ≥ 30" },
      { rot: "🌧️ ACUMULADO 24H", val: f1(av.mm24h) + " mm/24h", est: window.Deslizamento.ESTADOS[av.nivel24h || 0], ref: "Normal < 25 · Alerta ≥ 100" },
      { rot: "📅 ACUM. 168H (7 DIAS)", val: f1(av.mm168h) + " mm", est: window.Deslizamento.ESTADOS[av.nivel168h || 0], ref: "Normal < 50 · Alerta ≥ 150" }
    ];

    janelas.forEach(function (j, idx) {
      var jx = x + idx * (wJan + gap);
      ctx.fillStyle = "rgba(15, 23, 42, 0.72)";
      rr(jx, y, wJan, hJan, 14);
      ctx.fill();
      ctx.fillStyle = j.est.corFundo;
      ctx.fillRect(jx, y + 12, 7, hJan - 24);

      ctx.fillStyle = "#93c5fd";
      ctx.font = "700 " + (fmtKey === "feed" ? "15px " : "19px ") + FONTE;
      ctx.fillText(j.rot, jx + 20, y + (fmtKey === "stories" ? 34 : 26));

      ctx.fillStyle = "#fff";
      ctx.font = "800 " + (fmtKey === "stories" ? "36px " : fmtKey === "retrato" ? "28px " : "23px ") + FONTE;
      ctx.fillText(j.val, jx + 20, y + (fmtKey === "stories" ? 80 : fmtKey === "retrato" ? 62 : 50));

      ctx.fillStyle = j.est.corFundo;
      ctx.font = "800 " + (fmtKey === "stories" ? "22px " : "17px ") + FONTE;
      ctx.fillText(j.est.icone + " " + j.est.estado, jx + 20, y + (fmtKey === "stories" ? 116 : fmtKey === "retrato" ? 90 : 72));

      ctx.fillStyle = "#cbd5e1";
      ctx.font = "500 " + (fmtKey === "stories" ? "17px " : "13px ") + FONTE;
      ctx.fillText(j.ref, jx + 20, y + (fmtKey === "stories" ? 142 : fmtKey === "retrato" ? 110 : 86));
    });

    y += hJan + (fmtKey === "feed" ? 12 : 20);

    // Escala dos 5 Estados (Normalidade -> Alerta Máximo)
    var hEsc = fmtKey === "stories" ? 78 : fmtKey === "retrato" ? 62 : 50;
    var wEsc = (larg - 8 * 4) / 5;
    window.Deslizamento.ESTADOS.forEach(function (e, i) {
      var ex = x + i * (wEsc + 8);
      var ativo = i === av.nivel;
      ctx.fillStyle = ativo ? e.corFundo : "rgba(15, 23, 42, 0.65)";
      rr(ex, y, wEsc, hEsc, 10);
      ctx.fill();
      if (ativo) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 3;
        rr(ex, y, wEsc, hEsc, 10);
        ctx.stroke();
      }
      ctx.textAlign = "center";
      ctx.fillStyle = ativo ? e.corTexto : e.corFundo;
      ctx.font = "800 " + (fmtKey === "stories" ? "19px " : "15px ") + FONTE;
      ctx.fillText(e.estado.toUpperCase(), ex + wEsc / 2, y + hEsc * 0.46);
      ctx.fillStyle = ativo ? e.corTexto : "#cbd5e1";
      ctx.font = "600 " + (fmtKey === "stories" ? "15px " : "12px ") + FONTE;
      ctx.fillText(e.faixa24h, ex + wEsc / 2, y + hEsc * 0.78);
    });
    ctx.textAlign = "left";

    y += hEsc + (fmtKey === "feed" ? 12 : 20);

    // Sinais de Alerta nas Encostas e Orientações
    var altRest = cfg.limite - y;
    ctx.fillStyle = "rgba(15, 23, 42, 0.78)";
    rr(x, y, larg, Math.max(110, altRest), 16);
    ctx.fill();

    ctx.fillStyle = "#fde047";
    var tamCab = fmtKey === "stories" ? 27 : fmtKey === "retrato" ? 22 : 18;
    ctx.font = "800 " + tamCab + "px " + FONTE;
    ctx.fillText("⛰️ SINAIS DE ALERTA EM ENCOSTAS E ORIENTAÇÕES À POPULAÇÃO:", x + 24, y + tamCab + 12);

    var yTxt = y + tamCab * 2 + (fmtKey === "feed" ? 10 : 18);
    var linhas = $("linhas").value.split(/\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    var tamTxt = fmtKey === "stories" ? 26 : fmtKey === "retrato" ? 20 : 16;
    ctx.font = "500 " + tamTxt + "px " + FONTE;
    ctx.fillStyle = "#fff";
    linhas.slice(0, 5).forEach(function (lin) {
      quebrar("• " + lin, larg - 48).slice(0, 2).forEach(function (ql) {
        if (yTxt <= cfg.limite - 10) {
          ctx.fillText(ql, x + 24, yTxt);
          yTxt += tamTxt * 1.26;
        }
      });
      yTxt += 5;
    });
  }

  function desenhar() {
    var fmtKey = ($("formato") && $("formato").value) || "stories";
    var cfg = FORMATOS[fmtKey] || FORMATOS.stories;
    W = cfg.w; H = cfg.h;
    if (cv.width !== W || cv.height !== H) {
      cv.width = W; cv.height = H;
    }
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#14214d");
    g.addColorStop(0.55, "#0f1c3f");
    g.addColorStop(1, "#091026");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    var temConteudo = $("titulo").value || $("linhas").value;
    var yBase = desenharCabecalhoInstitucional(cfg, fmtKey);

    if (!temConteudo) {
      ctx.fillStyle = "#9db0e0";
      ctx.textAlign = "center";
      ctx.font = "500 34px " + FONTE;
      ctx.fillText("Carregando dados para o panfleto…", W / 2, H / 2);
      return;
    }

    if (modelo.tipoFlyer === "dia" && modelo.dadosDia) {
      desenharFlyerDia(cfg, fmtKey, yBase);
      desenharRodapeInstitucional(cfg, fmtKey);
      return;
    }
    if (modelo.tipoFlyer === "5dias" && modelo.dados5Dias) {
      desenharFlyer5Dias(cfg, fmtKey, yBase);
      desenharRodapeInstitucional(cfg, fmtKey);
      return;
    }
    if (modelo.tipoFlyer === "fogo" && modelo.dadosFogo) {
      desenharFlyerFogo(cfg, fmtKey, yBase);
      desenharRodapeInstitucional(cfg, fmtKey);
      return;
    }
    if (modelo.tipoFlyer === "estacoes" && modelo.dadosEstacoes) {
      desenharFlyerEstacoes(cfg, fmtKey, yBase);
      desenharRodapeInstitucional(cfg, fmtKey);
      return;
    }
    if (modelo.tipoFlyer === "deslizamento" && modelo.dadosDeslizamento) {
      desenharFlyerDeslizamento(cfg, fmtKey, yBase);
      desenharRodapeInstitucional(cfg, fmtKey);
      return;
    }

    // Layout padrão (Avisos, Chuva da estação, Semana, Dicas)
    ctx.textAlign = "left";
    var x = 80, larg = W - 160;
    var y = yBase + (fmtKey === "feed" ? 32 : 44) + Math.round(cfg.titleSize * 0.7);

    ctx.fillStyle = "#fff";
    ctx.font = "800 " + cfg.titleSize + "px " + FONTE;
    quebrar($("titulo").value, larg).slice(0, 3).forEach(function (l) {
      ctx.fillText(l, x, y);
      y += cfg.titleSize * 1.15;
    });

    ctx.fillStyle = "#b9c6ee";
    ctx.font = "500 " + cfg.subSize + "px " + FONTE;
    quebrar($("subtitulo").value, larg).slice(0, 2).forEach(function (l) {
      y += 2;
      ctx.fillText(l, x, y + cfg.subSize * 0.6);
      y += cfg.subSize * 1.25;
    });

    y += (fmtKey === "feed" ? 14 : 24);

    var linhas = $("linhas").value.split(/\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    var altGraf = modelo.grafico ? (fmtKey === "stories" ? 380 : fmtKey === "retrato" ? 280 : 200) : 0;
    var limiteTexto = cfg.limite - (altGraf ? altGraf + 24 : 0);
    var tam = cfg.maxLinhas, blocos;
    for (; tam >= cfg.minLinhas; tam -= 2) {
      ctx.font = "500 " + tam + "px " + FONTE;
      blocos = linhas.map(function (l) { return quebrar(l, larg - 40); });
      var alt = blocos.reduce(function (s, b) { return s + b.length * (tam * 1.25) + tam * .35; }, 0);
      if (y + alt <= limiteTexto) break;
    }

    var corBarraLateral = corEfetivaFaixa();
    blocos.forEach(function (b) {
      ctx.fillStyle = corBarraLateral;
      ctx.fillRect(x, y - tam * .75, 8, b.length * tam * 1.25 - tam * .2);
      ctx.fillStyle = "#fff";
      b.forEach(function (l) {
        ctx.fillText(l, x + 28, y);
        y += tam * 1.25;
      });
      y += tam * .35;
    });

    if (modelo.grafico) desenharBarras(modelo.grafico, x, cfg.limite - altGraf, larg, altGraf);
    desenharRodapeInstitucional(cfg, fmtKey);
  }

  function desenharBarras(dados, x0, y0, larg, alt) {
    var topo = 34, base = alt - topo - 62, max = Math.max.apply(null, dados.map(function (d) { return d.v; }).concat([5]));
    max = max > 10 ? Math.ceil(max / 10) * 10 : Math.ceil(max / 5) * 5;
    var passo = larg / dados.length, bw = passo * 0.62;
    ctx.fillStyle = "rgba(255,255,255,.18)"; ctx.fillRect(x0, y0 + topo + base, larg, 2);
    dados.forEach(function (d, i) {
      var h = d.v / max * base, cx = x0 + passo * (i + .5);
      ctx.fillStyle = corEfetivaFaixa();
      ctx.fillRect(cx - bw / 2, y0 + topo + base - h, bw, Math.max(h, d.v > 0 ? 3 : 0));
      ctx.fillStyle = "#fff"; ctx.textAlign = "center";
      ctx.font = "600 26px " + FONTE; if (d.v > 0) ctx.fillText(f1(d.v), cx, y0 + topo + base - h - 8);
      var dt = new Date(d.k + "T12:00:00");
      ctx.fillStyle = "#b9c6ee"; ctx.font = "500 24px " + FONTE;
      ctx.fillText(dt.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", ""), cx, y0 + topo + base + 28);
      ctx.fillText(fdm(d.k), cx, y0 + topo + base + 50);
    });
    ctx.textAlign = "left";
  }

  function obterNomeArquivo() {
    var fmtKey = ($("formato") && $("formato").value) || "stories";
    var prefix = (FORMATOS[fmtKey] && FORMATOS[fmtKey].prefix) || "post";
    var d = new Date();
    return prefix + "-" + $("tipo").value + "-" + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + "-" + p2(d.getHours()) + p2(d.getMinutes()) + ".png";
  }

  // ---------- ações ----------
  $("compartilhar").onclick = function () {
    setMsg("");
    try {
      cv.toBlob(async function (b) {
        if (!b) { setMsg("Não foi possível gerar a imagem."); return; }
        var nomeArq = obterNomeArquivo();
        var file = new File([b], nomeArq, { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              title: $("titulo").value || "Defesa Civil de Cajamar",
              text: $("legenda").value || "",
              files: [file]
            });
            setMsg("Compartilhado com sucesso!");
            return;
          } catch (err) {
            if (err.name === "AbortError") return;
          }
        }
        var a = document.createElement("a");
        a.href = URL.createObjectURL(b);
        a.download = nomeArq;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
        try { await navigator.clipboard.writeText($("legenda").value); } catch (e) {}
        setMsg("Panfleto baixado e legenda copiada! Cole no Instagram, WhatsApp ou Facebook.");
      }, "image/png");
    } catch (e) {
      setMsg("Não foi possível compartilhar automaticamente. Use Baixar imagem e Copiar legenda.");
    }
  };

  if ($("copiarImg")) {
    $("copiarImg").onclick = function () {
      setMsg("");
      try {
        cv.toBlob(async function (b) {
          if (!b) { setMsg("Não foi possível gerar a imagem."); return; }
          if (navigator.clipboard && navigator.clipboard.write && typeof ClipboardItem !== "undefined") {
            try {
              await navigator.clipboard.write([new ClipboardItem({ "image/png": b })]);
              setMsg("✅ Imagem copiada! Agora basta dar Ctrl+V direto na conversa do WhatsApp Web.");
              return;
            } catch (errClip) {}
          }
          setMsg("Seu navegador bloqueou a cópia direta de imagem. Use o botão “Baixar imagem (PNG)”.");
        }, "image/png");
      } catch (e) {
        setMsg("Não foi possível copiar a imagem. Use o botão “Baixar imagem (PNG)”.");
      }
    };
  }

  $("baixar").onclick = function () {
    setMsg("");
    try {
      cv.toBlob(function (b) {
        if (!b) { setMsg("Não foi possível gerar a imagem."); return; }
        var a = document.createElement("a"), nomeArq = obterNomeArquivo();
        a.href = URL.createObjectURL(b);
        a.download = nomeArq;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
        setMsg("Panfleto baixado em PNG. Revise antes de publicar.");
      }, "image/png");
    } catch (e) { setMsg("Não foi possível exportar a imagem. Abra a página por http(s) e tente de novo."); }
  };
  $("copiar").onclick = async function () {
    try { await navigator.clipboard.writeText($("legenda").value); setMsg("Legenda copiada."); }
    catch (e) { $("legenda").select(); setMsg("Não consegui copiar sozinho: o texto está selecionado, use copiar do aparelho."); }
  };

  var btsAtalho = document.querySelectorAll(".atalho-pub");
  for (var bi = 0; bi < btsAtalho.length; bi++) {
    btsAtalho[bi].onclick = function () {
      $("tipo").value = this.getAttribute("data-tipo");
      atualizarEscolha();
    };
  }

  ["titulo", "subtitulo", "linhas", "textoFaixa"].forEach(function (i) { if ($(i)) $(i).oninput = desenhar; });
  $("tipo").onchange = atualizarEscolha;
  if ($("formato")) $("formato").onchange = desenhar;
  if ($("nivelFaixa")) $("nivelFaixa").onchange = desenhar;
  $("escolha").onchange = montar;
  $("contato").oninput = desenhar;
  $("contato").onchange = function () { try { localStorage.setItem(CHAVE_CONTATO, $("contato").value); } catch (e) {} if (!$("baixar").disabled) montar(); };
  try { $("contato").value = localStorage.getItem(CHAVE_CONTATO) || ""; } catch (e) {}

  carregarHistorico();
  Promise.all([carregarImg("logo", "assets/logo-dc-cajamar.jpg"), carregarImg("brasao", "assets/brasao-cajamar.gif")]).then(function () {
    desenhar(); carregarDados();
  });
})();
