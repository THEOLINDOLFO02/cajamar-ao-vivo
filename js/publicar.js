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
  var avisos = null, previsao = null, climaOM = null, historico = null;
  var coletaAvisos = null, coletaPrev = null, coletaOM = null;
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
      "&forecast_days=7&timezone=America%2FSao_Paulo";

    var pOM = Fontes.consultar("clima_flyer", urlOM, function (j) { return j && j.daily && Array.isArray(j.daily.time) && j.hourly; })
      .then(function (r) { climaOM = r.dados; coletaOM = r.de || Date.now(); })
      .catch(function () {});

    var pAv = Fontes.consultar("avisos_inmet", Inmet.URL_AVISOS, Inmet.validarAvisos)
      .then(function (a) { if (!a.antigo) { avisos = Inmet.avisosDoMunicipio(a.dados); coletaAvisos = Date.now(); } })
      .catch(function () {});

    var pPr = Fontes.consultar("previsao_inmet", Inmet.URL_PREVISAO, Inmet.validarPrevisao)
      .then(function (p) { if (!p.antigo) { previsao = Inmet.previsaoDoMunicipio(p.dados); coletaPrev = Date.now(); } })
      .catch(function () {});

    await Promise.all([pOM, pAv, pPr]);
    atualizarEscolha();
  }

  function carregarHistorico() {
    try {
      var x = JSON.parse(localStorage.getItem("cajamar:historico:v1") || "null");
      historico = x && x.dias ? x : null;
    } catch (e) { historico = null; }
  }

  // ---------- extração de dados por dia (Open-Meteo + INMET) ----------
  function extrairDiaOM(idx) {
    if (!climaOM || !climaOM.daily || !climaOM.daily.time[idx]) return null;
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
    if (avisos && avisos.length && idx === 0) {
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
      idx: idx,
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

  // ---------- resumo semanal (estação) ----------
  function chaveDia(d) { return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()); }
  function fdm(k) { return k.slice(8, 10) + "/" + k.slice(5, 7); }
  function semanaCompleta(fim) {
    var base = new Date(fim + "T12:00:00"), dias = [];
    for (var i = 6; i >= 0; i--) {
      var x = new Date(base); x.setDate(x.getDate() - i);
      var k = chaveDia(x), d = historico && historico.dias[k];
      if (!d || d.n < 1296) return null;
      dias.push({ k: k, d: d });
    }
    return dias;
  }

  // ---------- por tipo: lista de opções e modelo ----------
  function opcoes(tipo) {
    var o = [];
    if (tipo === "flyer_dia") {
      if (climaOM && climaOM.daily && Array.isArray(climaOM.daily.time)) {
        climaOM.daily.time.slice(0, 3).forEach(function (dtIso, i) {
          var d = extrairDiaOM(i);
          var rot = (i === 0 ? "Hoje — " : i === 1 ? "Amanhã — " : "") + d.diaSemLongo + " (" + d.dataCurta + ") · " + n0(d.tmin) + "° a " + n0(d.tmax) + "°";
          o.push([String(i), rot]);
        });
      }
    } else if (tipo === "aviso") {
      if (avisos) avisos.forEach(function (a, i) { o.push([i, (a.evento || "Aviso") + " — " + (a.severidade || "") + " (" + fhora(a.inicio) + " a " + fhora(a.fim) + ")"]); });
    } else if (tipo === "prevdia") {
      if (previsao) previsao.forEach(function (d, i) { o.push([i, (d.ref.dia_semana || "") + " " + d.dia.slice(0, 5)]); });
    } else if (tipo === "chuva") {
      if (historico) Object.keys(historico.dias).sort().reverse().forEach(function (k) {
        var d = historico.dias[k]; o.push([k, k.slice(8, 10) + "/" + k.slice(5, 7) + "/" + k.slice(0, 4) + " — " + f1(d.chuva) + " mm" + (d.n < 1296 ? " (dia incompleto)" : "")]);
      });
    } else if (tipo === "semana") {
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
    if (tipo === "flyer_dia" || tipo === "flyer_5dias") {
      if (!climaOM) bloqueio = "Consultando dados meteorológicos atualizados para o panfleto… Se falhar, verifique sua conexão.";
      else setStatus("Dados meteorológicos de Cajamar atualizados às " + hm(coletaOM) + " (Open-Meteo" + (avisos ? " + Avisos INMET" : "") + ").");
    }
    if (tipo === "aviso") { if (!avisos) bloqueio = "Sem dado novo dos avisos do INMET."; else if (!o.length) bloqueio = "Nenhum aviso ativo para Cajamar agora: não há o que publicar."; else setStatus("Avisos do INMET coletados às " + hm(coletaAvisos) + "."); }
    if (tipo === "prevdia" || tipo === "prevsemana") { if (!previsao) bloqueio = "Sem dado novo da previsão do INMET. Use o “Panfleto Diário” ou “Panfleto de 5 Dias” acima!"; else setStatus("Previsão do INMET coletada às " + hm(coletaPrev) + "."); }
    if (tipo === "chuva") { if (!o.length) bloqueio = "Sem histórico: importe o CSV da estação na página “Histórico da estação”."; else setStatus("Histórico guardado neste aparelho (fonte: estação local; não é dado oficial)."); }
    if (tipo === "semana") { if (!o.length) bloqueio = "Não há 7 dias seguidos e completos no histórico. Importe o CSV da estação na página “Histórico da estação”."; else setStatus("Só aparecem semanas com os 7 dias completos (fonte: estação local; não é dado oficial)."); }
    if (tipo === "dica") setStatus("Textos gerais: revise antes de publicar.");
    if (bloqueio) setStatus(bloqueio);
    $("baixar").disabled = !!bloqueio; $("copiar").disabled = !!bloqueio;
    if ($("compartilhar")) $("compartilhar").disabled = !!bloqueio;
    if (bloqueio) { limparCampos(); desenhar(); return; }
    montar();
  }

  function limparCampos() {
    $("titulo").value = ""; $("subtitulo").value = ""; $("linhas").value = ""; $("legenda").value = "";
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
      for (var k = 0; k < 5 && k < climaOM.daily.time.length; k++) {
        dias5.push(extrairDiaOM(k));
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
      var dd = historico.dias[v]; if (!dd) return;
      var dt = v.slice(8, 10) + "/" + v.slice(5, 7) + "/" + v.slice(0, 4);
      m.tag = "CHUVA MEDIDA EM CAJAMAR";
      $("titulo").value = "Chuva medida em " + dt;
      $("subtitulo").value = "Estação meteorológica local";
      L.push("Chuva no dia: " + f1(dd.chuva) + " mm");
      L.push("Maior chuva em 1 hora: " + f1(dd.c60) + " mm");
      if (dd.tmin !== null && dd.tmax !== null) L.push("Temperatura: " + n0(dd.tmin) + "° a " + n0(dd.tmax) + "°");
      if (dd.vmax !== null) L.push("Vento máximo: " + f1(dd.vmax) + " km/h");
      var soma = 0, completo = true, base = new Date(v + "T12:00:00");
      for (var i = 0; i < 7; i++) { var x = new Date(base); x.setDate(x.getDate() - i); var k2 = x.getFullYear() + "-" + p2(x.getMonth() + 1) + "-" + p2(x.getDate()); if (!historico.dias[k2] || historico.dias[k2].n < 1296) { completo = false; break; } soma += historico.dias[k2].chuva; }
      if (completo) L.push("Acumulado em 7 dias: " + f1(soma) + " mm");
      if (dd.n < 1296) L.push("Atenção: dia com leituras incompletas; a chuva pode ser maior.");
      m.rodape = "Medição de uma estação local em Cajamar. Não é dado oficial do INMET/CEMADEN.";
      leg = "🌧️ CHUVA MEDIDA EM CAJAMAR — " + dt + "\n\n" + L.join("\n") + "\n\nMedição de uma estação local, em um ponto da cidade. Não substitui os dados oficiais do INMET e do CEMADEN.";
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
    ctx.fillStyle = modelo.cor || LARANJA;
    rr(60, yTag, W - 120, hTag, 12);
    ctx.fill();
    var clara = /^#(f|e|d)/i.test(modelo.cor || "") && !/^#(dc|d9|ea)/i.test(modelo.cor || "");
    ctx.fillStyle = clara ? "#111" : "#fff";
    ctx.font = "800 " + (fmtKey === "feed" ? "24px " : "29px ") + FONTE;
    ctx.fillText(modelo.tag || "", W / 2, yTag + (fmtKey === "feed" ? 34 : 42));
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

    blocos.forEach(function (b) {
      ctx.fillStyle = modelo.cor || LARANJA;
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
      ctx.fillStyle = modelo.cor || LARANJA;
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

  ["titulo", "subtitulo", "linhas"].forEach(function (i) { $(i).oninput = desenhar; });
  $("tipo").onchange = atualizarEscolha;
  if ($("formato")) $("formato").onchange = desenhar;
  $("escolha").onchange = montar;
  $("contato").oninput = desenhar;
  $("contato").onchange = function () { try { localStorage.setItem(CHAVE_CONTATO, $("contato").value); } catch (e) {} if (!$("baixar").disabled) montar(); };
  try { $("contato").value = localStorage.getItem(CHAVE_CONTATO) || ""; } catch (e) {}

  carregarHistorico();
  Promise.all([carregarImg("logo", "assets/logo-dc-cajamar.jpg"), carregarImg("brasao", "assets/brasao-cajamar.gif")]).then(function () {
    desenhar(); carregarDados();
  });
})();
