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
  var fontes = {}, focosRes = null, carregando = false, ciclo = Publicacao.criarCiclo();
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
  // Datas e horas SEMPRE em America/Sao_Paulo (não no fuso do aparelho).
  function agora() { return Publicacao.dataHoraLongaSP(Date.now()); }
  function hm(ts) { return Publicacao.horaSP(ts); }
  function kmhTxt(v) { var n = Publicacao.num(v); return n === null ? "—" : Math.round(n) + " km/h"; }
  function fhora(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(s)); return m ? m[3] + "/" + m[2] + " às " + m[4] + ":" + m[5] : String(s);
  }
  function f1(v) { return typeof v === "number" && isFinite(v) ? v.toFixed(1).replace(".", ",") : "—"; }
  function n0(v) { return typeof v === "number" && isFinite(v) ? Math.round(v) : "—"; }
  function setMsg(t) { $("msg").textContent = t || ""; }
  function setStatus(t) { $("status").textContent = t || ""; }

  function infoWmo(cod) {
    if (typeof cod !== "number") return { icone: "❔", curto: "Sem informação", longo: "Condição do tempo indisponível" };
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
  var ROTULO_FONTE = { clima: "Open-Meteo (modelo)", avisos: "Avisos INMET", previsao: "Previsão INMET", focos: "Focos INPE" };

  // Uma linha por fonte: o operador vê se cada consulta deu certo, veio do cache, está desatualizada ou indisponível.
  function textoFontes() {
    return ["clima", "avisos", "previsao", "focos"].map(function (n) {
      var f = fontes[n], base = ROTULO_FONTE[n] + ": ";
      if (!f) return base + (carregando ? "consultando…" : "sem consulta");
      if (n === "focos") {
        var ult = f.ultimaValida ? " · última atualização válida " + Publicacao.dataHoraSP(f.ultimaValida.t) + " (" + f.ultimaValida.n + " foco(s), não é a situação atual)" : "";
        if (f.estado === "indisponivel") return base + "CONSULTA INDISPONÍVEL (" + f.motivo + ")" + ult;
        return base + (f.estado === "sem_focos" ? "consulta válida, sem focos identificados" : "consulta válida, " + f.n + " foco(s)") + (f.parcial ? " (PARCIAL)" : "") + " · " + Publicacao.dataHoraSP(f.coletadoEm) + " · área: " + f.area;
      }
      if (f.estado === "ok") return base + "ok · coletado " + Publicacao.dataHoraSP(f.coletadoEm);
      if (f.estado === "cache") return base + "consulta falhou; usando o último dado válido (" + Publicacao.dataHoraSP(f.ultimaValida) + ")";
      if (f.estado === "desatualizado") return base + "DESATUALIZADO (última atualização válida " + Publicacao.dataHoraSP(f.ultimaValida) + ")";
      return base + "INDISPONÍVEL (" + f.motivo + ")";
    }).join("\n");
  }
  function renderFontes() { if ($("fontesPub")) $("fontesPub").textContent = textoFontes(); }

  function statusAvisosAtual() { return Publicacao.statusAvisos(fontes.avisos, avisos, Date.now()); }

  async function carregarDados() {
    carregando = true;
    avisos = null; previsao = null; climaOM = null; focosRes = null; fontes = {};
    coletaAvisos = null; coletaPrev = null; coletaOM = null; coletaFocos = null;
    renderFontes();
    var urlOM = "https://api.open-meteo.com/v1/forecast?latitude=" + LAT + "&longitude=" + LON +
      "&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_gusts_10m" +
      "&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m" +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max" +
      "&past_days=7&forecast_days=7&timezone=America%2FSao_Paulo";

    function registrar(nome, r) { fontes[nome] = Publicacao.estadoFonte({ resultado: r, agoraMs: Date.now(), limiteMs: Publicacao.FRESCOR_MS[nome] }); }
    function falhou(nome, e) {
      if (typeof console !== "undefined") console.error("[publicar] consulta " + nome + " falhou:", e);
      fontes[nome] = Publicacao.estadoFonte({ resultado: null, erro: e, agoraMs: Date.now(), limiteMs: Publicacao.FRESCOR_MS[nome] });
    }

    var pOM = Fontes.consultar("clima_flyer", urlOM, function (j) { return j && j.daily && Array.isArray(j.daily.time) && j.hourly; })
      .then(function (r) { registrar("clima", r); climaOM = r.dados; coletaOM = r.de; })
      .catch(function (e) { falhou("clima", e); });

    var pAv = Fontes.consultar("avisos_inmet", Inmet.URL_AVISOS, Inmet.validarAvisos)
      .then(function (a) { registrar("avisos", a); avisos = Inmet.avisosDoMunicipio(a.dados); coletaAvisos = a.de; })
      .catch(function (e) { falhou("avisos", e); });

    var pPr = Fontes.consultar("previsao_inmet", Inmet.URL_PREVISAO, Inmet.validarPrevisao)
      .then(function (p) { registrar("previsao", p); previsao = Inmet.previsaoDoMunicipio(p.dados); coletaPrev = p.de; })
      .catch(function (e) { falhou("previsao", e); });

    function lerUltimosFocos() {
      var g = Fontes.lerGuardado("focos_inpe_resumo", function (d) { return d && typeof d.t === "number" && typeof d.n === "number"; });
      return g ? { t: g.d.t, n: g.d.n } : null;
    }
    var pFocos = (typeof Queimadas !== "undefined" && Queimadas.coletarInpeAoVivo)
      ? Queimadas.coletarInpeAoVivo().then(function (res) {
          focosRes = res;
          coletaFocos = Date.parse(res.coletadoEm) || Date.now();
          fontes.focos = Publicacao.statusFocos({ coleta: res, ultimaValida: lerUltimosFocos() });
          if (!res.parcial) Fontes.guardar("focos_inpe_resumo", { t: coletaFocos, n: res.focos.length });
        }).catch(function (e) {
          if (typeof console !== "undefined") console.error("[publicar] consulta focos INPE falhou:", e);
          fontes.focos = Publicacao.statusFocos({ coleta: null, erro: e, ultimaValida: lerUltimosFocos() });
        })
      : Promise.resolve().then(function () { fontes.focos = Publicacao.statusFocos({ coleta: null, erro: new Error("módulo de queimadas não carregado") }); });

    await Promise.all([pOM, pAv, pPr, pFocos]);
    carregando = false;
    renderFontes();
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
    } catch (e) { if (typeof console !== "undefined") console.error("[publicar] histórico local ilegível:", e); historico = null; bancoEstacoes = null; }
  }

  // ---------- referência temporal (America/Sao_Paulo) ----------
  var refCache = { clima: null, minuto: null, ref: null };
  function referencia() {
    var agoraMs = Date.now(), minuto = Math.floor(agoraMs / 60000);
    if (refCache.clima !== climaOM || refCache.minuto !== minuto) {
      refCache = { clima: climaOM, minuto: minuto, ref: Publicacao.referenciaTemporal(climaOM, agoraMs) };
    }
    return refCache.ref;
  }

  var FAIXA_INFO = "#0284c7";
  // Faixa automática SEM limiares inventados: só o aviso oficial do INMET (consulta válida) muda a cor; o resto é informativo.
  function faixaAutomatica(offsetDia) {
    var st = statusAvisosAtual();
    if (offsetDia) return { cor: FAIXA_INFO, texto: "PREVISÃO DO TEMPO · INFORMATIVO", origem: "automatica", sev: null };
    if (st.estado === "com_avisos") {
      var a = st.avisos[0];
      return { cor: corAviso(a), texto: "⚠️ AVISO INMET ATIVO: " + String(a.evento || "ATENÇÃO").toUpperCase(), origem: "inmet", sev: 3 };
    }
    if (st.estado === "sem_avisos") return { cor: FAIXA_INFO, texto: "PREVISÃO · INFORMATIVO · SEM AVISO INMET (" + Publicacao.horaSP(st.ultimaValida) + ")", origem: "automatica", sev: null };
    return { cor: FAIXA_INFO, texto: "PREVISÃO · INFORMATIVO · AVISOS INMET INDISPONÍVEIS", origem: "automatica", sev: null };
  }

  // ---------- extração de dados por dia (Open-Meteo + INMET) ----------
  // Valores ausentes ficam null (nunca 0). Devolve null e preenche ultimoMotivoDia quando o dia não pode ser determinado.
  var ultimoMotivoDia = "";
  function extrairDiaOM(offsetDia) {
    ultimoMotivoDia = "";
    if (!climaOM || !climaOM.daily) { ultimoMotivoDia = "dados meteorológicos indisponíveis"; return null; }
    var ref = referencia();
    if (!ref.ok) { ultimoMotivoDia = "referência temporal inválida: " + ref.motivo; return null; }
    var idx = ref.idxHoje + (offsetDia || 0);
    var dl = climaOM.daily;
    if (idx < 0 || idx >= dl.time.length) { ultimoMotivoDia = "o dia solicitado (+" + (offsetDia || 0) + ") não existe na série da API"; return null; }
    var dataIso = dl.time[idx]; // "YYYY-MM-DD"
    var dt = new Date(dataIso + "T12:00:00Z");
    var diaSemLongo = DIAS_LONGO[dt.getUTCDay()];
    var diaSemCurto = DIAS_CURTO[dt.getUTCDay()];
    var dataCurta = dataIso.slice(8, 10) + "/" + dataIso.slice(5, 7);
    var dataExtenso = dataIso.slice(8, 10) + " de " + MESES_CURTO[dt.getUTCMonth()] + " de " + dataIso.slice(0, 4);
    function serieDia(nome) { return Array.isArray(dl[nome]) ? Publicacao.num(dl[nome][idx]) : null; }

    // Períodos do dia (Manhã 06-11h, Tarde 12-17h, Noite 18-23h) e umidade min/max do dia
    var hr = climaOM.hourly || {};
    var uMin = null, uMax = null;
    function hv(nome, i) { return Array.isArray(hr[nome]) ? Publicacao.num(hr[nome][i]) : null; }
    var tempoH = Array.isArray(hr.time) ? hr.time : [];
    function resumirJanela(hIni, hFim) {
      var temps = [], probs = [], chs = [], cods = [];
      for (var i = 0; i < tempoH.length; i++) {
        if (tempoH[i].slice(0, 10) !== dataIso) continue;
        var h = parseInt(tempoH[i].slice(11, 13), 10);
        var u = hv("relative_humidity_2m", i);
        if (u !== null) {
          uMin = uMin === null ? u : Math.min(uMin, u);
          uMax = uMax === null ? u : Math.max(uMax, u);
        }
        if (h >= hIni && h <= hFim) {
          var t = hv("temperature_2m", i); if (t !== null) temps.push(t);
          var p = hv("precipitation_probability", i); if (p !== null) probs.push(p);
          var c = hv("precipitation", i); if (c !== null) chs.push(c);
          var wc = hv("weather_code", i); if (wc !== null) cods.push(wc);
        }
      }
      var tMed = temps.length ? Math.round(temps.reduce(function (a, b) { return a + b; }, 0) / temps.length) : null;
      var tMaxP = temps.length ? Math.round(Math.max.apply(null, temps)) : null;
      var pMax = probs.length ? Math.round(Math.max.apply(null, probs)) : null;
      var cDom = cods.length ? Math.max.apply(null, cods) : serieDia("weather_code");
      var w = infoWmo(cDom);
      return {
        icone: w.icone, curto: w.curto,
        temp: tMaxP !== null ? tMaxP + "°C" : (tMed !== null ? tMed + "°C" : "—"),
        prob: pMax,
        chuva: chs.length ? Math.round(chs.reduce(function (a, b) { return a + b; }, 0) * 10) / 10 : null,
        horasComDado: temps.length
      };
    }

    var manha = resumirJanela(6, 11);
    var tarde = resumirJanela(12, 17);
    var noite = resumirJanela(18, 23);

    var tmin = serieDia("temperature_2m_min"), tmax = serieDia("temperature_2m_max");
    var sMax = serieDia("apparent_temperature_max");
    var chuvaMm = serieDia("precipitation_sum");
    var probChuva = serieDia("precipitation_probability_max");
    var ventoMax = serieDia("wind_speed_10m_max");
    var rajadaMax = serieDia("wind_gusts_10m_max");
    var uvMax = serieDia("uv_index_max");
    var wmo = infoWmo(serieDia("weather_code"));
    var ge = Publicacao.maiorOuIgual;
    var campos = { tmin: tmin, tmax: tmax, chuvaMm: chuvaMm, probChuva: probChuva, ventoMax: ventoMax, rajadaMax: rajadaMax, uMin: uMin };
    var ausentes = Object.keys(campos).filter(function (k) { return campos[k] === null; });

    // Orientações gerais (dicas práticas); a faixa de status NÃO é decidida por estes números.
    var recs = [];
    var stAv = statusAvisosAtual();
    if (!offsetDia && stAv.estado === "com_avisos") {
      recs.push("Aviso ativo do INMET para Cajamar: " + (stAv.avisos[0].evento || "Atenção meteorológica") + ".");
    } else if (!offsetDia && stAv.estado !== "sem_avisos") {
      recs.push("Avisos do INMET indisponíveis no momento: consulte inmet.gov.br e acompanhe a Defesa Civil (199).");
    }

    if (ge(probChuva, 50) || ge(chuvaMm, 2)) {
      var perChuva = [];
      if (ge(manha.prob, 45) || ge(manha.chuva, 1)) perChuva.push("manhã");
      if (ge(tarde.prob, 45) || ge(tarde.chuva, 1)) perChuva.push("tarde");
      if (ge(noite.prob, 45) || ge(noite.chuva, 1)) perChuva.push("noite");
      recs.push("Leve guarda-chuva! Maior chance de chuva " + (perChuva.length ? "no período da " + perChuva.join(" e ") : "ao longo do dia") + " (" + Publicacao.pct(probChuva) + " · ~" + f1(chuvaMm) + " mm).");
    } else if (probChuva !== null && chuvaMm !== null) {
      recs.push("Baixa chance de chuva (" + probChuva + "%) na previsão do modelo. Acompanhe os avisos oficiais.");
    } else {
      recs.push("Previsão de chuva incompleta nos dados recebidos: não é possível informar a chance de chuva.");
    }

    if (ge(chuvaMm, 15)) {
      recs.push("Atenção motoristas e moradores: evite áreas sujeitas a alagamento e nunca atravesse enxurradas.");
    }
    if (ge(rajadaMax, 40)) {
      recs.push("Rajadas de vento podem chegar a " + n0(rajadaMax) + " km/h: evite parar veículos sob árvores e recolha objetos soltos.");
    }
    if (uMin !== null && uMin <= 35) {
      recs.push("Umidade baixa à tarde (" + n0(uMin) + "%): beba bastante água e NÃO faça queimadas (crime ambiental — ligue 193/199).");
    } else if (ge(tmax, 29) || ge(uvMax, 8)) {
      recs.push("Calor e Índice UV elevado (" + nivelUvTexto(uvMax) + "): hidrate-se bem e use proteção solar entre 10h e 16h.");
    }
    if (tmin !== null && tmin <= 14) {
      recs.push("Madrugada e amanhecer frios (" + n0(tmin) + "°C): agasalhe bem crianças, idosos e proteja animais domésticos.");
    }
    if (ausentes.length) {
      recs.push("Dados incompletos na previsão (" + ausentes.length + " campo(s) indisponível(is)): valores ausentes aparecem como “—”.");
    }
    if (recs.length < 4) {
      recs.push("Em caso de emergência em Cajamar (Jordanésia, Polvilho, Centro, Ponunduva), acione a Defesa Civil pelo 199.");
    }

    var faixa = faixaAutomatica(offsetDia);
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
      ausentes: ausentes,
      parcial: ausentes.length > 0,
      faixaAuto: faixa,
      corStatus: faixa.cor,
      textoStatus: faixa.texto,
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
      if (!d || diaCompleto(d) !== true) return null;
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
          completo: d ? diaCompleto(d) : null,
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
    var comChuva = comDados.filter(function (e) { return Publicacao.num(e.d.chuva) !== null; });
    var maxChuva = null, somaChuva = 0, maior1h = null, estMaior = null;
    comChuva.forEach(function (e) {
      somaChuva += e.d.chuva;
      if (maxChuva === null || e.d.chuva >= maxChuva) { maxChuva = e.d.chuva; estMaior = e; }
      if (Publicacao.num(e.d.c60) !== null && (maior1h === null || e.d.c60 > maior1h)) maior1h = e.d.c60;
    });
    var mediaChuva = comChuva.length ? somaChuva / comChuva.length : null;
    var incompletos = comDados.filter(function (e) { return e.completo !== true; }).length;

    return {
      dataIso: dataIso,
      dtCurta: dtCurta,
      diaSemLongo: diaSemLongo,
      estacoes: estacoes,
      comDados: comDados,
      comChuva: comChuva,
      semChuva: comDados.length - comChuva.length,
      incompletos: incompletos,
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
            o.push(["serie:atual", "Estimativa de modelo (1h/24h/168h) — " + serieD.atual.icone + " " + serieD.atual.estado + " (" + f1(serieD.atual.mm168h) + " mm/168h)"]);
            o.push(["serie:proj", "Previsão do modelo, próximas 24h — " + serieD.projecao24h.icone + " " + serieD.projecao24h.estado + " (~" + f1(serieD.projecao24h.mm24h) + " mm/24h)"]);
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
        o.push(["sim:0", "Exemplo ilustrativo — Referencial 0 (< 10 mm/h · < 25 mm/24h · < 50 mm/168h)"]);
        o.push(["sim:1", "Exemplo ilustrativo — Referencial 1 (10–20 mm/h · 25–50 mm/24h · 50–100 mm/168h)"]);
        o.push(["sim:2", "Exemplo ilustrativo — Referencial 2 (20–30 mm/h · 50–100 mm/24h · 100–150 mm/168h)"]);
        o.push(["sim:3", "Exemplo ilustrativo — Referencial 3 (30–50 mm/h · 100–150 mm/24h · 150–210 mm/168h)"]);
        o.push(["sim:4", "Exemplo ilustrativo — Referencial 4 (> 50 mm/h · > 150 mm/24h · > 210 mm/168h)"]);
      }
    } else if (tipo === "flyer_fogo") {
      if (climaOM && climaOM.daily && Array.isArray(climaOM.daily.time)) {
        [0, 1, 2].forEach(function (i) {
          var d = extrairDiaOM(i);
          if (!d) return;
          var rf = riscoFogoDoDia(d);
          var rot = (i === 0 ? "Hoje — " : i === 1 ? "Amanhã — " : "") + d.diaSemLongo + " (" + d.dataCurta + ") · Risco " + (rf ? rf.nivel : "Dados insuficientes") + " · Umid. mín " + n0(d.uMin) + "%";
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
      var stOpAv = statusAvisosAtual(); if (stOpAv.avisos) stOpAv.avisos.forEach(function (a, i) { o.push([i, (a.evento || "Aviso") + " — " + (a.severidade || "") + " (" + fhora(a.inicio) + " a " + fhora(a.fim) + ")"]); });
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
            o.push([id + ":" + k, "[" + nomeEst + "] " + k.slice(8, 10) + "/" + k.slice(5, 7) + "/" + k.slice(0, 4) + " — " + f1(d.chuva) + " mm" + (diaCompleto(d) !== true ? " (parcial)" : "")]);
          });
        });
      } else if (historico) {
        Object.keys(historico.dias).sort().reverse().forEach(function (k) {
          var d = historico.dias[k]; o.push([k, k.slice(8, 10) + "/" + k.slice(5, 7) + "/" + k.slice(0, 4) + " — " + f1(d.chuva) + " mm" + (diaCompleto(d) !== true ? " (dia incompleto)" : "")]);
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

  // Regras de disponibilidade por tipo: consulta indisponível, desatualizada ou ainda em andamento NÃO viram "sem alertas".
  function bloqueioDoTipo(tipo, o) {
    var r = { bloqueio: "", status: "", carregando: false };
    function aguardando(nome) { return carregando && !fontes[nome]; }
    if (tipo === "flyer_dia" || tipo === "flyer_5dias" || tipo === "flyer_fogo") {
      if (!climaOM) {
        if (aguardando("clima")) { r.carregando = true; r.status = "Consultando dados meteorológicos atualizados para o panfleto…"; }
        else r.bloqueio = "Open-Meteo indisponível (" + ((fontes.clima && fontes.clima.motivo) || "sem resposta") + "). Sem dados meteorológicos não é possível gerar este panfleto.";
        return r;
      }
      var ref = referencia();
      if (!ref.ok) { r.bloqueio = "Referência temporal inválida: " + ref.motivo + "."; return r; }
      if (tipo !== "flyer_5dias" && !o.length) { r.bloqueio = "Nenhum dia utilizável na série da API."; return r; }
      var fc = fontes.clima || {};
      r.status = "Dados meteorológicos (Open-Meteo, previsão do modelo) coletados em " + Publicacao.dataHoraSP(coletaOM) + " (SP)" +
        (fc.estado === "cache" ? " · consulta falhou: dado do cache" : fc.estado === "desatualizado" ? " · DESATUALIZADO" : "") +
        (tipo === "flyer_fogo" ? " · " + resumoFocos().legenda : "") + ".";
      return r;
    }
    if (tipo === "flyer_deslizamento") {
      r.status = "Indicador pluviométrico REFERENCIAL (Pinheiro et al., 2005; AlertaRio, 2013) — NÃO homologado pela Defesa Civil de Cajamar e não oficial. " + (typeof Deslizamento !== "undefined" ? Deslizamento.AVISO_INFORMATIVO : "");
      return r;
    }
    if (tipo === "flyer_estacoes") {
      if (!o.length) r.bloqueio = "Nenhum arquivo CSV carregado ainda. Envie de 1 a 4 CSVs (estações e régua do rio) na aba “Histórico da estação” ou “Previsão × medido”.";
      else r.status = "Dados locais das estações e régua de nível prontos para gerar o panfleto consolidado (medição local; dias incompletos são sinalizados).";
      return r;
    }
    if (tipo === "aviso") {
      if (aguardando("avisos")) { r.carregando = true; r.status = "Consultando avisos do INMET…"; return r; }
      var st = statusAvisosAtual();
      if (st.estado === "indisponivel") r.bloqueio = "Consulta dos avisos do INMET indisponível (" + st.motivo + "). Não é possível afirmar que não há avisos: consulte inmet.gov.br.";
      else if (st.estado === "desatualizado") r.bloqueio = "Avisos do INMET DESATUALIZADOS (última atualização válida " + Publicacao.dataHoraSP(st.ultimaValida) + "). Não publique: o aviso pode ter sido alterado ou encerrado.";
      else if (st.estado === "sem_avisos") r.bloqueio = "Consulta válida às " + Publicacao.horaSP(st.ultimaValida) + ": nenhum aviso ativo do INMET para Cajamar. Não há o que publicar.";
      else r.status = "Avisos do INMET " + (st.deCache ? "do cache (consulta falhou), última atualização válida " : "coletados às ") + Publicacao.dataHoraSP(st.ultimaValida) + " (SP).";
      return r;
    }
    if (tipo === "prevdia" || tipo === "prevsemana") {
      if (aguardando("previsao")) { r.carregando = true; r.status = "Consultando a previsão do INMET…"; return r; }
      var fp = fontes.previsao;
      if (!previsao || !fp) r.bloqueio = "Previsão do INMET indisponível (" + ((fp && fp.motivo) || "sem resposta") + "). Use o “Panfleto Diário” ou “Panfleto de 5 Dias” acima!";
      else if (fp.estado === "desatualizado") r.bloqueio = "Previsão do INMET DESATUALIZADA (última atualização válida " + Publicacao.dataHoraSP(fp.ultimaValida) + ").";
      else r.status = "Previsão do INMET " + (fp.estado === "cache" ? "do cache (consulta falhou), última atualização válida " : "coletada às ") + Publicacao.dataHoraSP(fp.ultimaValida) + " (SP).";
      return r;
    }
    if (tipo === "chuva") { if (!o.length) r.bloqueio = "Sem histórico: importe o CSV da estação na página “Histórico da estação”."; else r.status = "Histórico guardado neste aparelho (fonte: estação local; não é dado oficial)."; return r; }
    if (tipo === "semana") { if (!o.length) r.bloqueio = "Não há 7 dias seguidos e completos no histórico. Importe o CSV da estação na página “Histórico da estação”."; else r.status = "Só aparecem semanas com os 7 dias completos (fonte: estação local; não é dado oficial)."; return r; }
    if (tipo === "dica") r.status = "Textos gerais: revise antes de publicar.";
    return r;
  }

  function atualizarEscolha() {
    atualizarBotoesAtalho();
    var tipo = $("tipo").value, sel = $("escolha");
    sel.textContent = "";
    $("boxEscolha").hidden = (tipo === "prevsemana" || tipo === "flyer_5dias");
    var o = opcoes(tipo);
    o.forEach(function (x) { var op = document.createElement("option"); op.value = x[0]; op.textContent = x[1]; sel.appendChild(op); });
    var b = bloqueioDoTipo(tipo, o);
    setStatus(b.bloqueio || b.status);
    if (b.carregando) {
      ciclo.iniciar({ tipo: tipo, formato: ($("formato") && $("formato").value) || "stories" });
      limparCampos();
      pintarPrevia("Consultando dados atualizados…");
      setMsg("");
      atualizarMetaPrevia();
      atualizarBotoes();
      return;
    }
    if (b.bloqueio) {
      var tk = ciclo.iniciar({ tipo: tipo, formato: ($("formato") && $("formato").value) || "stories" });
      finalizarFalha(tk, b.bloqueio);
      return;
    }
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

  // ---------- montagem do conteúdo (texto + dados do desenho) ----------
  var montagemFalhou = "";
  function semDados(motivo) { montagemFalhou = motivo || "dados insuficientes"; return false; }
  function gC(v) { var n = Publicacao.num(v); return n === null ? "—" : Math.round(n) + "°C"; }
  function pctTxt(v) { return Publicacao.pct(v); }
  function janelasEstacao(dias, k) { return typeof Estacao !== "undefined" && Estacao.janelasDoDia ? Estacao.janelasDoDia(dias, k) : null; }
  function diaCompleto(d) { return typeof Estacao !== "undefined" && Estacao.diaCompleto ? Estacao.diaCompleto(d) : null; }

  function rastroOM(refIso, extra, parcial) {
    var f = fontes.clima || {};
    return { fonte: "Open-Meteo (modelo numérico)", natureza: "previsão do modelo", referenciaIso: refIso, coletaMs: coletaOM, estado: f.estado, ultimaValidaMs: f.ultimaValida, parcial: !!parcial, extra: extra };
  }
  // Estado dos avisos INMET para o rastro dos panfletos que mostram a faixa de status.
  function textoAvisosRastro() {
    var st = statusAvisosAtual();
    if (st.estado === "com_avisos") return "Avisos INMET: " + st.avisos.length + " ativo(s)" + (st.deCache ? " (do cache; última atualização válida " + Publicacao.dataHoraSP(st.ultimaValida) + ")" : " (consulta " + Publicacao.dataHoraSP(st.ultimaValida) + ")");
    if (st.estado === "sem_avisos") return "Avisos INMET: consulta válida " + Publicacao.dataHoraSP(st.ultimaValida) + ", sem avisos ativos";
    if (st.estado === "desatualizado") return "Avisos INMET: DESATUALIZADOS (última atualização válida " + Publicacao.dataHoraSP(st.ultimaValida) + ")";
    return "Avisos INMET: INDISPONÍVEIS";
  }
  function rastroPrevisaoInmet() {
    var f = fontes.previsao || {};
    return { fonte: "INMET (previsão oficial)", natureza: "previsão", referenciaIso: Publicacao.dataSP(coletaPrev), coletaMs: coletaPrev, estado: f.estado, ultimaValidaMs: f.ultimaValida };
  }

  // Risco de fogo calculado pelo módulo Queimadas: só com TODOS os dados meteorológicos; sem eles, null (dados insuficientes).
  function riscoFogoDoDia(d) {
    if (typeof Queimadas === "undefined" || !Queimadas.calcularRiscoFogoLocal) return null;
    var obrigatorios = [d.tmax, d.uMin, d.ventoMax, d.rajadaMax, d.chuvaMm];
    if (obrigatorios.some(function (v) { return Publicacao.num(v) === null; })) return null;
    return Queimadas.calcularRiscoFogoLocal({ temp: d.tmax, umid: d.uMin, vento: d.ventoMax, rajada: d.rajadaMax, chuva24h: d.chuvaMm });
  }

  // Três estados da consulta de focos: com focos | sem focos | indisponível. Nunca "0 focos" sem consulta concluída.
  function resumoFocos() {
    var f = fontes.focos;
    var res = { estado: "indisponivel", nCajamar: null, nRaio50: null, total: null, titulo: "Indisponível", sub: "Consulta ao INPE não concluída", legenda: "Consulta aos satélites INPE INDISPONÍVEL: não é possível informar a situação dos focos." };
    if (!f || f.estado === "indisponivel") {
      var u = f && f.ultimaValida ? " Última atualização válida: " + Publicacao.dataHoraSP(f.ultimaValida.t) + " (" + f.ultimaValida.n + " foco(s); não é a situação atual)." : "";
      res.sub = "Última atualização: " + (f && f.ultimaValida ? Publicacao.dataHoraSP(f.ultimaValida.t) : "nenhuma válida");
      res.legenda = "Consulta aos satélites INPE INDISPONÍVEL (" + (f ? f.motivo : "sem resposta") + "): não é possível informar a situação dos focos." + u;
      return res;
    }
    var lista = focosRes && Array.isArray(focosRes.focos) ? focosRes.focos : [];
    res.estado = f.estado;
    res.total = lista.length;
    res.nCajamar = lista.filter(function (x) { return x.emCajamar; }).length;
    res.nRaio50 = lista.filter(function (x) { return x.distanciaKm <= 50; }).length;
    var quando = Publicacao.dataHoraSP(f.coletadoEm), area = Publicacao.AREA_FOCOS;
    if (f.estado === "sem_focos") {
      res.titulo = "0 focos";
      res.sub = "Consulta válida · INPE " + quando;
      res.legenda = "Consulta INPE válida em " + quando + " (SP): nenhum foco identificado — " + area + ".";
    } else {
      res.titulo = (res.nCajamar > 0 ? res.nCajamar + " foco(s) em Cajamar" : res.nRaio50 + " foco(s) (50 km)") + (f.parcial ? " ou mais" : "");
      res.sub = "INPE · " + quando + (f.parcial ? " · consulta parcial" : "");
      res.legenda = "Consulta INPE válida em " + quando + " (SP) — " + area + ": " + (res.nCajamar > 0 ? res.nCajamar + " foco(s) em Cajamar / " : "nenhum foco em Cajamar / ") + res.nRaio50 + " foco(s) num raio de 50 km" + (f.parcial ? " (consulta parcial: contagem mínima)" : "") + ".";
    }
    return res;
  }

  function somaNumeros(vals) {
    var t = 0, n = 0;
    vals.forEach(function (v) { if (Publicacao.num(v) !== null) { t += v; n++; } });
    return { soma: t, n: n };
  }

  // Monta título, linhas, legenda e dados do desenho. Devolve true se montou; false (com motivo em montagemFalhou) se não.
  function construir() {
    var tipo = $("tipo").value, v = $("escolha").value, L = [], leg = "";
    var m = { cor: LARANJA, tag: "", rodape: "", tipoFlyer: null, rastro: null, faixaAuto: null, simulado: false, referenciaIso: null };
    if ($("nivelFaixa")) $("nivelFaixa").value = "auto";
    if ($("justificativaFaixa")) $("justificativaFaixa").value = "";

    if (tipo === "flyer_dia") {
      var dDia = extrairDiaOM(+v || 0);
      if (!dDia) return semDados(ultimoMotivoDia);
      m.tipoFlyer = "dia";
      m.dadosDia = dDia;
      m.faixaAuto = dDia.faixaAuto;
      m.cor = dDia.corStatus;
      m.tag = dDia.textoStatus;
      m.referenciaIso = dDia.dataIso;
      m.rastro = rastroOM(dDia.dataIso, textoAvisosRastro() + " · Faixa informativa (não é classificação oficial)", dDia.parcial);
      $("titulo").value = dDia.diaSemLongo.toUpperCase() + " · " + dDia.dataCurta;
      $("subtitulo").value = dDia.wmo.icone + " " + dDia.wmo.longo + " em Cajamar/SP";
      L = dDia.recs.slice();

      leg = "🌤️ BOLETIM DO TEMPO EM CAJAMAR — " + dDia.diaSemLongo.toUpperCase() + " (" + dDia.dataCurta + ")\n\n" +
        "📍 Situação prevista: " + dDia.wmo.icone + " " + dDia.wmo.longo + "\n" +
        "🌡️ Temperatura: Mín " + gC(dDia.tmin) + " / Máx " + gC(dDia.tmax) + " (Sensação até " + gC(dDia.sMax) + ")\n" +
        "🌧️ Chuva: Chance de " + pctTxt(dDia.probChuva) + " · Volume previsto: " + (dDia.chuvaMm === null ? "—" : f1(dDia.chuvaMm) + " mm") + "\n" +
        "💧 Umidade do ar: " + (dDia.uMin !== null ? n0(dDia.uMin) + "% a " + n0(dDia.uMax) + "%" : "—") + "\n" +
        "💨 Vento: até " + (dDia.ventoMax === null ? "—" : n0(dDia.ventoMax) + " km/h") + " (rajadas de " + (dDia.rajadaMax === null ? "—" : n0(dDia.rajadaMax) + " km/h") + ")\n\n" +
        "🕒 Por período:\n" +
        "• Manhã: " + dDia.manha.icone + " " + dDia.manha.curto + " (" + dDia.manha.temp + " · chuva " + pctTxt(dDia.manha.prob) + ")\n" +
        "• Tarde: " + dDia.tarde.icone + " " + dDia.tarde.curto + " (" + dDia.tarde.temp + " · chuva " + pctTxt(dDia.tarde.prob) + ")\n" +
        "• Noite: " + dDia.noite.icone + " " + dDia.noite.curto + " (" + dDia.noite.temp + " · chuva " + pctTxt(dDia.noite.prob) + ")\n\n" +
        "📌 O QUE A POPULAÇÃO PRECISA SABER:\n" +
        L.map(function (t) { return "✔️ " + t; }).join("\n") +
        "\n\n📞 Emergência: Defesa Civil 199 | Bombeiros 193";
    } else if (tipo === "flyer_5dias") {
      var dias5 = [], motivoFalta = "";
      for (var k = 0; k < 5; k++) {
        var d5 = extrairDiaOM(k);
        if (d5) dias5.push(d5);
        else { if (k === 0) return semDados(ultimoMotivoDia); motivoFalta = ultimoMotivoDia; }
      }
      m.tipoFlyer = "5dias";
      m.dados5Dias = dias5;
      m.referenciaIso = dias5[0].dataIso;

      var chuvas = dias5.filter(function (x) { return x.chuvaMm !== null; });
      var somaChuva5 = somaNumeros(chuvas.map(function (x) { return x.chuvaMm; })).soma;
      var maxChuvaDia = chuvas.reduce(function (a, x) { return !a || x.chuvaMm > a.chuvaMm ? x : a; }, null);
      var comTmax = dias5.filter(function (x) { return x.tmax !== null; }), comTmin = dias5.filter(function (x) { return x.tmin !== null; });
      var maisQuente = comTmax.reduce(function (a, x) { return !a || x.tmax > a.tmax ? x : a; }, null);
      var maisFrio = comTmin.reduce(function (a, x) { return !a || x.tmin < a.tmin ? x : a; }, null);
      var diasChuvosos = dias5.filter(function (x) { return Publicacao.maiorOuIgual(x.chuvaMm, 1) || Publicacao.maiorOuIgual(x.probChuva, 50); }).length;
      var parcial5 = dias5.length < 5 || chuvas.length < dias5.length || dias5.some(function (x) { return x.parcial; });

      m.faixaAuto = { cor: FAIXA_INFO, texto: "📅 PREVISÃO PARA " + (dias5.length < 5 ? "OS DIAS DISPONÍVEIS" : "OS PRÓXIMOS 5 DIAS") + " · INFORMATIVO", origem: "automatica", sev: null };
      m.cor = m.faixaAuto.cor;
      m.tag = m.faixaAuto.texto;
      m.rastro = rastroOM(dias5[0].dataIso, dias5.length < 5 ? "Série com " + dias5.length + " dia(s): " + motivoFalta : "", parcial5);
      var per5 = dias5[0].dataCurta + " a " + dias5[dias5.length - 1].dataCurta;
      $("titulo").value = "PREVISÃO " + dias5.length + " DIAS · " + per5;
      $("subtitulo").value = "Programe sua semana em Cajamar · Informes à população";

      if (!chuvas.length) {
        L.push("Volume de chuva previsto indisponível nos dados recebidos.");
      } else if (somaChuva5 >= 5) {
        L.push("Chuva acumulada prevista" + (chuvas.length < dias5.length ? " (apenas nos " + chuvas.length + " dia(s) com dado)" : " nos " + dias5.length + " dias") + ": ~" + f1(somaChuva5) + " mm (" + diasChuvosos + " dia(s) com chance de chuva).");
        L.push("Dia com mais chuva: " + maxChuvaDia.diaSemLongo + " (" + maxChuvaDia.dataCurta + ") com ~" + f1(maxChuvaDia.chuvaMm) + " mm (" + pctTxt(maxChuvaDia.probChuva) + ").");
      } else {
        L.push(chuvas.length < dias5.length ? "Pouca chuva prevista nos dias com dado (previsão incompleta)." : "Semana com predomínio de tempo firme e pouca chuva prevista em Cajamar.");
        L.push("Atenção à hidratação e proibição total de queimadas em terrenos e matas.");
      }
      if (maisFrio && maisQuente) L.push("Temperaturas na semana: mínima de " + n0(maisFrio.tmin) + "°C (" + maisFrio.diaSemCurto + ") e máxima de " + n0(maisQuente.tmax) + "°C (" + maisQuente.diaSemCurto + ").");
      L.push("Em caso de emergência, alagamento ou queda de árvore, ligue 199 (Defesa Civil) ou 193 (Bombeiros).");

      leg = "📅 PREVISÃO DO TEMPO PARA " + dias5.length + " DIAS EM CAJAMAR (" + per5 + ")\n\n" +
        "Confira como fica o tempo nos próximos dias para se programar:\n\n" +
        dias5.map(function (x) {
          return "• " + x.diaSemCurto + " (" + x.dataCurta + "): " + x.wmo.icone + " " + x.wmo.curto + " | 🌡️ " + gC(x.tmin).replace("°C", "") + "° a " + gC(x.tmax) + " | 🌧️ " + pctTxt(x.probChuva) + " (" + (x.chuvaMm === null ? "—" : f1(x.chuvaMm) + " mm") + ")";
        }).join("\n") +
        "\n\n📌 DESTAQUES PARA A POPULAÇÃO:\n" +
        L.map(function (t) { return "✔️ " + t; }).join("\n") +
        "\n\n📞 Emergência: Defesa Civil 199 | Bombeiros 193";
    } else if (tipo === "flyer_deslizamento") {
      if (typeof Deslizamento === "undefined") return semDados("módulo de deslizamento não carregado");
      var avDesl = null, origemDesl = null;
      if (v === "serie:atual" || v === "serie:proj") {
        if (!climaOM || !climaOM.hourly) return semDados("série horária do modelo indisponível");
        var refD = referencia();
        if (!refD.ok) return semDados("referência temporal inválida: " + refD.motivo);
        var sD = Deslizamento.extrairDeSerieHoraria(climaOM.hourly, climaOM.current && climaOM.current.time);
        if (!sD) return semDados("série horária do modelo em formato inesperado");
        avDesl = v === "serie:atual" ? sD.atual : sD.projecao24h;
        origemDesl = { fonte: "Open-Meteo (modelo numérico)", natureza: v === "serie:atual" ? "estimativa de modelo (não é medição)" : "previsão do modelo (não é medição)", referenciaIso: refD.hojeIso, coletaMs: coletaOM, estado: (fontes.clima || {}).estado, ultimaValidaMs: (fontes.clima || {}).ultimaValida };
      } else if (v && v.indexOf("est:") === 0 && bancoEstacoes && bancoEstacoes.slots) {
        var pEst = v.split(":");
        var slE = bancoEstacoes.slots[pEst[1]];
        if (!slE || !slE.dias) return semDados("estação selecionada sem dados");
        avDesl = Deslizamento.avaliarDiaEstacao(slE.dias, pEst[2], slE.estacao || slE.rotulo);
        if (!avDesl) return semDados("dia da estação não encontrado");
        origemDesl = { fonte: "Estação local: " + (slE.estacao || slE.rotulo) + " (CSV importado)", natureza: "medição de estação local", referenciaIso: pEst[2], coletaMs: null, estado: "ok", extra: "Dados importados manualmente neste aparelho" };
      } else if (v && v.indexOf("sim:") === 0) {
        var nvSim = parseInt(v.slice(4), 10) || 0;
        var exemplos = [
          { mm1h: 2, mm24h: 8, mm168h: 22 },
          { mm1h: 14, mm24h: 35, mm168h: 68 },
          { mm1h: 24, mm24h: 72, mm168h: 120 },
          { mm1h: 38, mm24h: 118, mm168h: 175 },
          { mm1h: 56, mm24h: 165, mm168h: 230 }
        ];
        var ex = exemplos[nvSim] || exemplos[0];
        avDesl = Deslizamento.avaliarRisco({ mm1h: ex.mm1h, mm24h: ex.mm24h, mm168h: ex.mm168h, tipo: "simulacao", fonte: "SIMULAÇÃO — dados fictícios" });
        origemDesl = { fonte: "Simulação (dados fictícios)", natureza: "simulação", referenciaIso: null, coletaMs: null, estado: "ok" };
        m.simulado = true;
      } else {
        return semDados("selecione a fonte dos dados do indicador");
      }

      m.tipoFlyer = "deslizamento";
      m.dadosDeslizamento = avDesl;
      m.referenciaIso = origemDesl.referenciaIso;
      m.rastro = Object.assign({}, origemDesl, { parcial: !avDesl.conclusivo && avDesl.janelasSemDado.length < 3, extra: (origemDesl.extra ? origemDesl.extra + " · " : "") + "Critério referencial NÃO homologado (Pinheiro 2005; AlertaRio 2013)" });
      var inconclusivo = !avDesl.conclusivo;
      var rotuloNivel = inconclusivo ? "DADOS INSUFICIENTES PARA AVALIAÇÃO" : avDesl.estado.toUpperCase();
      m.cor = avDesl.corFundo;
      m.tag = m.simulado ? "🧪 SIMULAÇÃO — NÃO É MONITORAMENTO REAL" : (inconclusivo ? "⚪ DADOS INSUFICIENTES PARA AVALIAÇÃO" : "⛰️ INDICADOR PLUVIOMÉTRICO REFERENCIAL (NÃO OFICIAL): " + avDesl.icone + " " + rotuloNivel);
      m.faixaAuto = { cor: m.cor, texto: m.tag, origem: "automatica", sev: null };

      $("titulo").value = (m.simulado ? "SIMULAÇÃO · " : "") + (inconclusivo ? rotuloNivel : "INDICADOR REFERENCIAL: " + rotuloNivel);
      $("subtitulo").value = "Critério não oficial · " + avDesl.fonte;

      L.push(Deslizamento.AVISO_INFORMATIVO);
      if (inconclusivo) L.push("DADOS INSUFICIENTES PARA AVALIAÇÃO. " + avDesl.motivoIndisponibilidade);
      else L.push(avDesl.orientacaoPopulacao);
      L.push("Sinais de perigo: rachaduras em paredes/muros, árvores ou postes inclinados e água barrenta brotando do barranco.");
      L.push("Critério referencial não homologado: " + avDesl.gatilhos.join(" · "));
      L.push("Ao notar qualquer sinal de movimento do terreno, ligue 199 (Defesa Civil) ou 193 (Bombeiros). Evacuação e interdição são decididas apenas pela Defesa Civil.");

      leg = (m.simulado ? "🧪 SIMULAÇÃO — NÃO É MONITORAMENTO REAL\n\n" : "") +
        "⛰️ INDICADOR PLUVIOMÉTRICO REFERENCIAL PARA ENCOSTAS — CAJAMAR/SP\n\n" +
        avDesl.icone + " " + (inconclusivo ? "DADOS INSUFICIENTES PARA AVALIAÇÃO" : "INDICADOR REFERENCIAL (NÃO OFICIAL): " + rotuloNivel) + "\n" +
        "⚠️ " + Deslizamento.AVISO_INFORMATIVO + "\n" +
        "⚠️ " + Deslizamento.AVISO_CRITERIO + "\n" +
        (inconclusivo ? "" : "📋 Faixa de critério: " + avDesl.descricaoCriterio + "\n") + "\n" +
        "🌧️ VOLUMES DE ÁGUA ANALISADOS (" + origemDesl.natureza + "):\n" +
        "• Em 1 hora (mm/h): " + f1(avDesl.mm1h) + " mm/h (" + avDesl.estado1h + ")\n" +
        "• Em 24 horas (mm/24h): " + f1(avDesl.mm24h) + " mm/24h (" + avDesl.estado24h + ")\n" +
        "• Em 7 dias / 168h (mm/168h): " + f1(avDesl.mm168h) + " mm/168h (" + avDesl.estado168h + ")\n\n" +
        "📌 ORIENTAÇÕES GERAIS:\n" +
        L.slice(1).map(function (t) { return "✔️ " + t; }).join("\n") +
        "\n\n📞 Emergência: Defesa Civil 199 | Bombeiros 193";
    } else if (tipo === "flyer_fogo") {
      var dFogo = extrairDiaOM(+v || 0);
      if (!dFogo) return semDados(ultimoMotivoDia);
      var rfFogo = riscoFogoDoDia(dFogo);
      var fc = resumoFocos();
      var insuf = !rfFogo;

      m.tipoFlyer = "fogo";
      m.dadosFogo = { dia: dFogo, risco: rfFogo, insuficiente: insuf, focos: fc, nCajamar: fc.nCajamar, nRaio50: fc.nRaio50, totalRegiao: fc.total };
      m.referenciaIso = dFogo.dataIso;

      var ehCritico = !insuf && (rfFogo.classe === "v" || fc.nCajamar > 0);
      var ehAlto = !insuf && (rfFogo.classe === "l" || fc.nRaio50 >= 3);
      m.cor = insuf ? "#64748b" : ehCritico ? VERMELHO : ehAlto ? LARANJA : rfFogo.classe === "am" ? "#d97706" : VERDE;
      m.tag = insuf ? "🔥 INDICADOR DE RISCO DE FOGO · DADOS INSUFICIENTES" : "🔥 INDICADOR CALCULADO (NÃO OFICIAL) · RISCO " + rfFogo.nivel.toUpperCase();
      m.faixaAuto = { cor: m.cor, texto: m.tag, origem: "automatica", sev: null };
      var fFocos = fontes.focos || {};
      m.rastro = {
        fonte: "Open-Meteo (previsão) + INPE BDQueimadas (satélites)", natureza: "previsão do modelo + detecção por satélite", referenciaIso: dFogo.dataIso,
        coletaMs: coletaOM, estado: (fontes.clima || {}).estado, ultimaValidaMs: (fontes.clima || {}).ultimaValida, parcial: dFogo.parcial || !!fFocos.parcial,
        extra: fc.estado === "indisponivel" ? "FOCOS INPE: CONSULTA INDISPONÍVEL" : "Focos INPE consultados " + Publicacao.dataHoraSP(fFocos.coletadoEm)
      };

      $("titulo").value = "RISCO DE FOGO: " + (insuf ? "DADOS INSUFICIENTES" : rfFogo.nivel.toUpperCase());
      $("subtitulo").value = dFogo.diaSemLongo + " (" + dFogo.dataCurta + ") · Cajamar/SP · Vigilância por Satélite";

      L.push(insuf ? "Indicador não calculado: faltam dados meteorológicos (temperatura, umidade, vento ou chuva) na previsão recebida." : rfFogo.recomendacao);
      L.push("Indicador calculado a partir da previsão do modelo; não é classificação oficial da Defesa Civil.");
      L.push("PROIBIDO atear fogo em mato, terrenos, lixo ou folhas secas (Crime Ambiental — Lei Municipal e Federal).");
      L.push("Não jogue bitucas de cigarro às margens de rodovias (Anhanguera, Bandeirantes e Edgard Máximo Zambotto).");
      if (dFogo.uMin !== null && dFogo.uMin <= 35) {
        L.push("Umidade do ar baixa (" + n0(dFogo.uMin) + "%): beba bastante água e evite esforço físico no sol entre 11h e 16h.");
      }
      L.push("Ao avistar fumaça ou foco de incêndio em vegetação, acione imediatamente o 193 (Bombeiros) ou 199 (Defesa Civil).");

      leg = "🔥 BOLETIM DE RISCO DE FOGO E ESTIAGEM — CAJAMAR (" + dFogo.dataCurta + ")\n\n" +
        "⚠️ Indicador de Risco Meteorológico (calculado, não oficial): " + (insuf ? "DADOS INSUFICIENTES" : rfFogo.nivel.toUpperCase()) + "\n" +
        "💧 Umidade mínima prevista: " + (dFogo.uMin === null ? "—" : n0(dFogo.uMin) + "%") + "\n" +
        "🌡️ Temperatura máxima: " + gC(dFogo.tmax) + "\n" +
        "💨 Rajadas de vento: até " + (dFogo.rajadaMax === null ? "—" : n0(dFogo.rajadaMax) + " km/h") + "\n" +
        "🛰️ Monitoramento Satelital (INPE): " + fc.legenda + "\n\n" +
        "🚫 ORIENTAÇÕES IMPORTANTES À POPULAÇÃO:\n" +
        L.map(function (t) { return "• " + t; }).join("\n") +
        "\n\n📞 Denúncias e Emergências: Defesa Civil 199 | Bombeiros 193";
    } else if (tipo === "flyer_estacoes") {
      var bal = extrairBalancoEstacoesDia(v);
      if (!bal) return semDados("dia sem dados importados das estações");
      m.tipoFlyer = "estacoes";
      m.dadosEstacoes = bal;
      m.referenciaIso = bal.dataIso;
      m.faixaAuto = { cor: FAIXA_INFO, texto: "🌧️🌊 BALANÇO DAS ESTAÇÕES + NÍVEL DO RIO · MEDIÇÃO LOCAL", origem: "automatica", sev: null };
      m.cor = m.faixaAuto.cor;
      m.tag = m.faixaAuto.texto;
      m.rastro = { fonte: "Rede de Estações Locais e Régua (CSV importados neste aparelho)", natureza: "medição", referenciaIso: bal.dataIso, coletaMs: null, estado: "ok", parcial: bal.incompletos > 0 || bal.semChuva > 0, extra: "Medição local, não é dado oficial do INMET/CEMADEN" };
      $("titulo").value = "MONITORAMENTO LOCAL · " + bal.dtCurta;
      $("subtitulo").value = "3 Estações Meteorológicas e Régua de Nível do Rio em Cajamar";

      if (bal.maxChuva !== null) {
        L.push("Maior volume registrado no dia: " + f1(bal.maxChuva) + " mm" + (bal.estMaior ? " (" + bal.estMaior.nome + ")" : "") + (bal.maior1h !== null ? " · Pico em 60 min: " + f1(bal.maior1h) + " mm." : "."));
        if (bal.comChuva.length > 1) L.push("Média de chuva entre as " + bal.comChuva.length + " estações com dado: " + f1(bal.mediaChuva) + " mm.");
      } else {
        L.push("Nenhuma estação com leitura de chuva válida neste dia.");
      }
      if (bal.incompletos > 0) L.push("Atenção: " + bal.incompletos + " estação(ões) com dia incompleto ou sem detalhe horário — valores de chuva são MÍNIMOS.");
      if (bal.regua) {
        L.push("Régua de Nível do Rio: mínimo de " + f2(bal.regua.nvMin) + " m, máximo de " + f2(bal.regua.nvMax) + " m (variação no dia Δ " + (bal.regua.nvDelta === null || bal.regua.nvDelta === undefined ? "—" : "+" + Math.round(bal.regua.nvDelta * 100) + " cm") + ").");
      }
      L.push("Em caso de alagamento, elevação rápida do rio ou risco em encostas, acione a Defesa Civil pelo 199.");

      leg = "🌧️🌊 BALANÇO DAS ESTAÇÕES E NÍVEL DO RIO EM CAJAMAR — " + bal.dtCurta + "\n\n" +
        "Confira os registros medidos pela rede de monitoramento de Cajamar (" + bal.diaSemLongo + "):\n\n" +
        bal.estacoes.map(function (e) {
          if (!e.temDado) return "• 🌡️ " + e.nome + ": sem leitura importada";
          return "• 🌡️ " + e.nome + ": " + (Publicacao.num(e.d.chuva) === null ? "chuva indisponível" : f1(e.d.chuva) + " mm no dia" + (e.completo !== true ? " (mínimo)" : "")) + " (máx 60 min: " + f1(e.d.c60) + " mm | Temp " + gC(e.d.tmin).replace("°C", "") + "° a " + gC(e.d.tmax) + ")";
        }).join("\n") +
        (bal.regua ? "\n• 🌊 " + bal.regua.nome + ": Nível mín " + f2(bal.regua.nvMin) + " m / máx " + f2(bal.regua.nvMax) + " m (variação Δ " + (bal.regua.nvDelta === null || bal.regua.nvDelta === undefined ? "—" : "+" + Math.round(bal.regua.nvDelta * 100) + " cm") + ")" : "") +
        "\n\n📌 DESTAQUES:\n" +
        L.map(function (t) { return "✔️ " + t; }).join("\n") +
        "\n\n📞 Emergência: Defesa Civil 199 | Bombeiros 193";
    } else if (tipo === "aviso") {
      var stAv = statusAvisosAtual();
      var a = stAv.avisos && stAv.avisos[+v];
      if (!a) return semDados("o aviso selecionado não está mais disponível");
      m.cor = corAviso(a); m.tag = "AVISO OFICIAL · INMET";
      m.faixaAuto = { cor: m.cor, texto: m.tag, origem: "inmet", sev: 3 };
      m.referenciaIso = Publicacao.dataSP(coletaAvisos);
      m.rastro = { fonte: "INMET (aviso oficial)", natureza: "aviso", referenciaIso: m.referenciaIso, coletaMs: coletaAvisos, estado: fontes.avisos.estado, ultimaValidaMs: fontes.avisos.ultimaValida };
      $("titulo").value = a.evento || "Aviso";
      $("subtitulo").value = "Aviso " + (a.severidade || "") + " para Cajamar";
      L.push("Válido de " + fhora(a.inicio) + " até " + fhora(a.fim));
      if (a.risco) L.push(a.risco);
      (a.instrucoes || []).slice(0, 3).forEach(function (t) { if (t) L.push(String(t)); });
      leg = "⚠️ AVISO DO INMET PARA CAJAMAR\n" + (a.evento || "Aviso") + " — " + (a.severidade || "") + "\nVálido de " + fhora(a.inicio) + " até " + fhora(a.fim) + ".\n" + (a.risco ? "\n" + a.risco + "\n" : "") + "\nEm emergência, ligue 199 (Defesa Civil) ou 193 (Bombeiros).\nFonte: INMET (previsao.inmet.gov.br). Informação repassada pela Defesa Civil de Cajamar.";
    } else if (tipo === "prevdia") {
      var d = previsao && previsao[+v]; if (!d) return semDados("a previsão selecionada não está disponível");
      m.tag = "PREVISÃO · INMET";
      m.referenciaIso = String(d.dia).split("/").reverse().join("-");
      m.rastro = rastroPrevisaoInmet();
      $("titulo").value = "Previsão para " + (d.ref.dia_semana || "") + ", " + d.dia.slice(0, 5);
      $("subtitulo").value = "Cajamar · previsão oficial do INMET";
      L.push("Mín " + n0(d.ref.temp_min) + "° · Máx " + n0(d.ref.temp_max) + "°");
      L.push("Umidade " + n0(d.ref.umidade_min) + "% a " + n0(d.ref.umidade_max) + "%");
      if (d.per) [["manha", "Manhã"], ["tarde", "Tarde"], ["noite", "Noite"]].forEach(function (p) { if (d.per[p[0]]) L.push(p[1] + ": " + descPeriodo(d.per[p[0]])); });
      else L.push(descPeriodo(d.ref));
      leg = "🌦️ PREVISÃO PARA CAJAMAR — " + (d.ref.dia_semana || "") + ", " + d.dia.slice(0, 5) + "\n\n" + L.join("\n") + "\n\nPrevisão pode mudar: acompanhe os avisos oficiais.\nFonte: INMET (previsao.inmet.gov.br).";
    } else if (tipo === "prevsemana") {
      if (!previsao || !previsao.length) return semDados("previsão do INMET indisponível");
      m.tag = "PREVISÃO · INMET";
      m.referenciaIso = String(previsao[0].dia).split("/").reverse().join("-");
      m.rastro = rastroPrevisaoInmet();
      $("titulo").value = "Previsão dos próximos dias";
      $("subtitulo").value = "Cajamar · previsão oficial do INMET";
      previsao.slice(0, 5).forEach(function (d) { L.push(d.dia.slice(0, 5) + " · " + n0(d.ref.temp_min) + "°/" + n0(d.ref.temp_max) + "° · " + (d.ref.resumo || "—")); });
      leg = "🌦️ PREVISÃO PARA CAJAMAR — PRÓXIMOS DIAS\n\n" + L.join("\n") + "\n\nPrevisão pode mudar: acompanhe os avisos oficiais.\nFonte: INMET (previsao.inmet.gov.br).";
    } else if (tipo === "chuva") {
      var slotRef = historico, chaveData = v;
      if (v && v.indexOf(":") > 0 && bancoEstacoes && bancoEstacoes.slots) {
        var partes = v.split(":");
        slotRef = bancoEstacoes.slots[partes[0]] || historico;
        chaveData = partes[1];
      }
      var dd = slotRef && slotRef.dias ? slotRef.dias[chaveData] : null; if (!dd) return semDados("dia da estação não encontrado");
      var nomeEstChuva = (slotRef && slotRef.estacao) ? slotRef.estacao : "Estação meteorológica local";
      var dt = chaveData.slice(8, 10) + "/" + chaveData.slice(5, 7) + "/" + chaveData.slice(0, 4);
      var jn = janelasEstacao(slotRef.dias, chaveData);
      var completoDia = diaCompleto(dd);
      m.tag = "CHUVA MEDIDA EM CAJAMAR";
      m.faixaAuto = { cor: LARANJA, texto: m.tag, origem: "automatica", sev: null };
      m.referenciaIso = chaveData;
      m.rastro = { fonte: "Estação local: " + nomeEstChuva, natureza: "medição", referenciaIso: chaveData, coletaMs: null, estado: "ok", parcial: completoDia !== true, extra: "Medição local, não é dado oficial do INMET/CEMADEN" };
      $("titulo").value = "Chuva medida em " + dt;
      $("subtitulo").value = nomeEstChuva + " · Cajamar/SP";
      L.push("Chuva do dia civil: " + (Publicacao.num(dd.chuva) === null ? "—" : f1(dd.chuva) + " mm") + (completoDia !== true ? " (valor MÍNIMO: dia incompleto ou sem detalhe horário)" : ""));
      L.push("Maior acumulado em 60 min: " + (jn && jn.max60.estado === "OK" ? f1(jn.max60.valor) + " mm" : "Dados insuficientes"));
      if (Publicacao.num(dd.tmin) !== null && Publicacao.num(dd.tmax) !== null) L.push("Temperatura: " + n0(dd.tmin) + "° a " + n0(dd.tmax) + "°");
      if (Publicacao.num(dd.vmax) !== null) L.push("Vento máximo: " + f1(dd.vmax) + " km/h");
      if (jn && jn.mov168.estado === "OK") L.push("Acumulado móvel em 168 h (até " + jn.fimRotulo + "): " + f1(jn.mov168.valor) + " mm");
      else L.push("Acumulado móvel em 168 h: Dados insuficientes" + (jn && jn.mov168.motivo ? " (" + jn.mov168.motivo.split(";")[0] + ")" : ""));
      leg = "🌧️ CHUVA MEDIDA EM CAJAMAR — " + dt + " (" + nomeEstChuva + ")\n\n" + L.join("\n") + "\n\nMedição de estação local em Cajamar. Não substitui os dados oficiais do INMET e do CEMADEN.";
    } else if (tipo === "semana") {
      var sem = semanaCompleta(v); if (!sem) return semDados("a semana não tem 7 dias completos no histórico");
      var tot = 0, comChuva = 0, maxD = sem[0], max1h = sem[0];
      sem.forEach(function (x) { tot += x.d.chuva; if (x.d.chuva >= 1) comChuva++; if (x.d.chuva > maxD.d.chuva) maxD = x; if (x.d.c60 > max1h.d.c60) max1h = x; });
      m.tag = "RESUMO DA SEMANA · CHUVA";
      m.faixaAuto = { cor: LARANJA, texto: m.tag, origem: "automatica", sev: null };
      m.referenciaIso = v;
      m.rastro = { fonte: "Estação local (CSV importado)", natureza: "medição", referenciaIso: v, coletaMs: null, estado: "ok", extra: "7 dias completos · não é dado oficial do INMET/CEMADEN" };
      m.grafico = sem.map(function (x) { return { k: x.k, v: x.d.chuva }; });
      var periodo = fdm(sem[0].k) + " a " + fdm(v);
      $("titulo").value = "Chuva da semana em Cajamar";
      $("subtitulo").value = periodo + " · estação meteorológica local";
      L.push("Total na semana: " + f1(tot) + " mm");
      L.push("Dias com chuva (1 mm ou mais): " + comChuva + " de 7");
      L.push(maxD.d.chuva > 0 ? "Dia mais chuvoso: " + fdm(maxD.k) + " (" + f1(maxD.d.chuva) + " mm)" : "Sem chuva registrada na semana (7 dias com leituras completas)");
      if (max1h.d.c60 > 0) L.push("Maior acumulado em 60 min: " + f1(max1h.d.c60) + " mm (" + fdm(max1h.k) + ")");
      leg = "🌧️ CHUVA DA SEMANA EM CAJAMAR — " + periodo + "\n\n" + L.join("\n") + "\n\nMedição de uma estação local, em um ponto da cidade. Não substitui os dados oficiais do INMET e do CEMADEN.";
    } else if (tipo === "dica") {
      var dc = DICAS[v]; if (!dc) return semDados("dica selecionada não encontrada");
      m.tag = "DICA DE PREVENÇÃO";
      m.faixaAuto = { cor: LARANJA, texto: m.tag, origem: "automatica", sev: null };
      m.rastro = { fonte: "Orientação geral da Defesa Civil de Cajamar", natureza: "orientação geral (sem dados meteorológicos)", estado: "ok" };
      $("titulo").value = v; $("subtitulo").value = "Defesa Civil de Cajamar";
      L = dc.linhas.slice();
      leg = "🛟 DICA DE PREVENÇÃO — " + v + "\n\n" + dc.legenda + "\n\n" + L.map(function (t) { return "• " + t; }).join("\n");
    } else {
      return semDados("tipo de publicação desconhecido");
    }

    if (!m.faixaAuto) m.faixaAuto = { cor: m.cor, texto: m.tag, origem: "automatica", sev: null };
    m.rodape = m.rastro ? Publicacao.textoRastro(m.rastro) : "";
    $("linhas").value = L.join("\n");
    if ($("textoFaixa")) $("textoFaixa").value = m.tag || "";
    modelo = m;
    var c = contatoLocal(); if (c) leg += "\nDefesa Civil de Cajamar: " + c;
    if (m.rodape) leg += "\n\n" + m.rodape;
    $("legenda").value = m.simulado
      ? "🧪 SIMULAÇÃO — NÃO É MONITORAMENTO REAL. Material de treinamento: não publique como informação oficial.\n\n" + leg
      : leg + "\n\n#DefesaCivil #Cajamar #ClimaCajamar #Jordanésia #Polvilho";
    return true;
  }

  // Gera a publicação: invalida a prévia anterior, valida/monta, desenha e só então libera a exportação.
  function montar() {
    var tipo = $("tipo").value, fmt = ($("formato") && $("formato").value) || "stories";
    var token = ciclo.iniciar({ tipo: tipo, formato: fmt });
    montagemFalhou = "";
    limparCampos();
    pintarPrevia("Gerando publicação…");
    atualizarMetaPrevia();
    atualizarBotoes();
    var ok = false;
    try { ok = construir(); }
    catch (e) {
      if (typeof console !== "undefined") console.error("[publicar] falha ao montar:", e);
      montagemFalhou = "erro inesperado na montagem (" + (e && e.message ? e.message : e) + ")";
    }
    if (!ok) return finalizarFalha(token, montagemFalhou || "dados insuficientes");
    try { desenharTudo(); }
    catch (e2) {
      if (typeof console !== "undefined") console.error("[publicar] falha ao desenhar:", e2);
      return finalizarFalha(token, "erro ao desenhar a imagem (" + (e2 && e2.message ? e2.message : e2) + ")");
    }
    ciclo.concluir(token, {
      tipo: tipo, formato: fmt, dataRef: modelo.referenciaIso || Publicacao.dataSP(Date.now()), geradoEm: Date.now(),
      coletaMs: modelo.rastro ? modelo.rastro.coletaMs : null, simulado: !!modelo.simulado
    });
    setMsg(modelo.simulado ? "SIMULAÇÃO: o PNG leva marca d'água e não pode ser compartilhado nem ter a legenda copiada." : "");
    atualizarMetaPrevia();
    atualizarBotoes();
  }

  function finalizarFalha(token, motivo) {
    ciclo.falhar(token, motivo);
    limparCampos();
    pintarPrevia("Publicação não gerada: " + motivo);
    setMsg("Publicação não gerada: " + motivo);
    atualizarMetaPrevia();
    atualizarBotoes();
  }

  function contatoLocal() { return $("contato").value.trim(); }

  // ---------- desenho ----------
  var imgs = {};
  function carregarImg(k, src) {
    return new Promise(function (ok) { var i = new Image(); i.onload = function () { imgs[k] = i; ok(); }; i.onerror = function () { if (typeof console !== "undefined") console.warn("[publicar] imagem não carregada:", src); ok(); }; i.src = src; });
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

  // Faixa de status: cor e texto vêm do mesmo cálculo (Publicacao.avaliarFaixa). Alteração manual é marcada como do operador.
  function faixaAtual() {
    var auto = modelo.faixaAuto || { cor: modelo.cor || LARANJA, texto: modelo.tag || "", origem: "automatica", sev: null };
    return Publicacao.avaliarFaixa(auto, {
      nivel: $("nivelFaixa") ? $("nivelFaixa").value : "auto",
      texto: $("textoFaixa") ? $("textoFaixa").value : "",
      justificativa: $("justificativaFaixa") ? $("justificativaFaixa").value : ""
    });
  }
  function corEfetivaFaixa() { return faixaAtual().cor; }
  function textoEfetivoFaixa() { return faixaAtual().texto; }

  // ---------- texto dentro do canvas ----------
  var limiteLargura = null; // largura máxima (px) imposta por quem desenha em colunas/cartões
  function medirTexto(s) { return ctx.measureText(s).width; }
  function larguraDisponivel(x) {
    var a = ctx.textAlign;
    if (a === "right") return Math.max(40, x - 60);
    if (a === "center") return Math.max(40, 2 * Math.min(x - 60, W - 60 - x));
    return Math.max(40, W - 60 - x);
  }
  // Escreve o texto sem sair do espaço: reduz a fonte no máximo 18% e, se ainda não couber, corta com reticências.
  function fillTextFit(txt, x, y, maxW) {
    txt = String(txt);
    var lim = maxW || limiteLargura || larguraDisponivel(x);
    var m = /(\d+)px/.exec(ctx.font);
    if (m && medirTexto(txt) > lim) {
      var orig = ctx.font, tam = +m[1], min = Math.round(tam * 0.82);
      for (var t = tam - 1; t >= min && medirTexto(txt) > lim; t--) ctx.font = orig.replace(/\d+px/, t + "px");
      txt = Publicacao.cortarComReticencias(txt, lim, medirTexto);
      ctx.fillText(txt, x, y);
      ctx.font = orig;
      return;
    }
    ctx.fillText(txt, x, y);
  }

  // Lista de itens com marcador, quebrando cada um em até maxPorItem linhas. Se faltar espaço, para e avisa que há mais na legenda.
  function desenharItens(linhas, x, y, larg, tam, yLimite, maxPorItem, passo) {
    var altLinha = tam * 1.26, i, ocultos = 0;
    for (i = 0; i < linhas.length; i++) {
      var disp = Math.floor((yLimite - y) / altLinha);
      var reserva = i === linhas.length - 1 ? 0 : 1;
      if (disp - reserva < 1) { ocultos = linhas.length - i; break; }
      var enc = Publicacao.encaixarTexto("• " + linhas[i], larg, medirTexto, Math.min(maxPorItem, disp - reserva));
      enc.linhas.forEach(function (ql) { ctx.fillText(ql, x, y); y += altLinha; });
      y += passo;
    }
    if (ocultos > 0) {
      var corAntes = ctx.fillStyle;
      ctx.fillStyle = "#fde047";
      ctx.fillText("… +" + ocultos + " informação(ões) completa(s) na legenda", x, Math.min(y, yLimite));
      ctx.fillStyle = corAntes;
    }
    return y;
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
    fillTextFit("DEFESA CIVIL DE CAJAMAR", W / 2, yTopo + cfg.headerBox * 0.44);
    ctx.fillStyle = "#93c5fd";
    ctx.font = "600 " + tamSub + "px " + FONTE;
    fillTextFit("BOLETIM METEOROLÓGICO À POPULAÇÃO", W / 2, yTopo + cfg.headerBox * 0.76);

    var hTag = fmtKey === "feed" ? 50 : 62;
    var yTag = yTopo + cfg.headerBox + (fmtKey === "feed" ? 12 : 16);
    var fx = faixaAtual();
    var corTag = fx.cor, hTag0 = hTag;
    if (fx.selo) hTag += fmtKey === "feed" ? 22 : 26;
    ctx.fillStyle = corTag;
    rr(60, yTag, W - 120, hTag, 12);
    ctx.fill();
    var clara = /^#(f|e|d)/i.test(corTag) && !/^#(dc|d9|ea)/i.test(corTag);
    ctx.fillStyle = clara ? "#111" : "#fff";
    ctx.font = "800 " + (fmtKey === "feed" ? "24px " : "29px ") + FONTE;
    fillTextFit(fx.texto, W / 2, yTag + (fmtKey === "feed" ? 34 : 42));
    if (fx.selo) {
      ctx.font = "700 " + (fmtKey === "feed" ? "14px " : "16px ") + FONTE;
      fillTextFit(fx.selo, W / 2, yTag + hTag0 + (fmtKey === "feed" ? 8 : 10));
    }
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
    fillTextFit("📞 EMERGÊNCIA: DEFESA CIVIL 199 · BOMBEIROS 193" + (c ? " · " + c : ""), W / 2, yr + (fmtKey === "feed" ? 32 : 39));

    ctx.textAlign = "left";
    ctx.fillStyle = "#cbd5e1";
    var yy = yr + hEmg + (fmtKey === "feed" ? 26 : 32);
    var tamRodape = fmtKey === "feed" ? 18 : 22;
    ctx.font = "500 " + tamRodape + "px " + FONTE;
    var txt1 = (modelo.rodape || "Fonte: Defesa Civil de Cajamar") + " · Emitido em " + agora() + " (SP)";
    var encRod = Publicacao.encaixarTexto(txt1, W - 120, medirTexto, 3);
    var passoRod = tamRodape * 1.28;
    encRod.linhas.forEach(function (l, i) { ctx.fillText(l, 60, yy + i * passoRod); });
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
    fillTextFit($("titulo").value || (d.diaSemLongo.toUpperCase() + " · " + d.dataCurta), x + 24, y + (fmtKey === "stories" ? 56 : fmtKey === "retrato" ? 46 : 38));

    ctx.fillStyle = "#fde047";
    ctx.font = "700 " + (fmtKey === "stories" ? "34px " : fmtKey === "retrato" ? "28px " : "23px ") + FONTE;
    fillTextFit($("subtitulo").value || (d.wmo.icone + " " + d.wmo.longo), x + 24, y + (fmtKey === "stories" ? 110 : fmtKey === "retrato" ? 88 : 72));

    y += hHero + (fmtKey === "feed" ? 14 : 20);

    // Grid 2x2 de Indicadores Principais (Temperatura, Chuva, Umidade, Vento/UV)
    var hCard = fmtKey === "stories" ? 145 : fmtKey === "retrato" ? 112 : 90;
    var gap = 16;
    var wCard = (larg - gap) / 2;
    var indicadores = [
      { rot: "🌡️ TEMPERATURA", val: gC(d.tmin) + " a " + gC(d.tmax), sub: "Sensação térmica até " + gC(d.sMax), cor: "#38bdf8" },
      { rot: "🌧️ CHUVA PREVISTA", val: Publicacao.pct(d.probChuva) + " · " + (d.chuvaMm === null ? "—" : f1(d.chuvaMm) + " mm"), sub: d.chuvaMm === null && d.probChuva === null ? "Previsão de chuva indisponível" : "Previsão do modelo (volume do dia)", cor: "#60a5fa" },
      { rot: "💧 UMIDADE DO AR", val: (d.uMin !== null ? n0(d.uMin) + "% a " + n0(d.uMax) + "%" : "—"), sub: d.uMin === null ? "Dado indisponível" : (d.uMin <= 30 ? "⚠️ Umidade baixa — hidrate-se" : "Umidade prevista no dia"), cor: "#34d399" },
      { rot: "💨 VENTO E ÍNDICE UV", val: "Rajadas " + kmhTxt(d.rajadaMax), sub: "Índice UV máx: " + nivelUvTexto(d.uvMax), cor: "#fbbf24" }
    ];

    indicadores.forEach(function (ind, i) {
      var col = i % 2, row = Math.floor(i / 2);
      var cx = x + col * (wCard + gap);
      var cy = y + row * (hCard + gap);
      limiteLargura = wCard - 34;
      ctx.fillStyle = "rgba(15, 23, 42, 0.65)";
      rr(cx, cy, wCard, hCard, 14);
      ctx.fill();
      ctx.fillStyle = ind.cor;
      ctx.fillRect(cx, cy + 14, 7, hCard - 28);

      ctx.fillStyle = "#93c5fd";
      ctx.font = "700 " + (fmtKey === "feed" ? "17px " : "21px ") + FONTE;
      fillTextFit(ind.rot, cx + 22, cy + (fmtKey === "stories" ? 36 : fmtKey === "retrato" ? 30 : 24));

      ctx.fillStyle = "#fff";
      ctx.font = "800 " + (fmtKey === "stories" ? "40px " : fmtKey === "retrato" ? "32px " : "26px ") + FONTE;
      fillTextFit(ind.val, cx + 22, cy + (fmtKey === "stories" ? 86 : fmtKey === "retrato" ? 68 : 54));

      ctx.fillStyle = "#cbd5e1";
      ctx.font = "500 " + (fmtKey === "feed" ? "16px " : "20px ") + FONTE;
      fillTextFit(ind.sub, cx + 22, cy + (fmtKey === "stories" ? 124 : fmtKey === "retrato" ? 98 : 78));
    });

    limiteLargura = null;
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
      limiteLargura = wPer - 16;
      ctx.fillStyle = "rgba(255,255,255,0.09)";
      rr(px, y, wPer, hPer, 14);
      ctx.fill();

      ctx.textAlign = "center";
      var mid = px + wPer / 2;
      ctx.fillStyle = "#fde047";
      ctx.font = "800 " + (fmtKey === "feed" ? "18px " : "22px ") + FONTE;
      fillTextFit(p.tit, mid, y + (fmtKey === "stories" ? 36 : 28));

      ctx.fillStyle = "#fff";
      ctx.font = "800 " + (fmtKey === "stories" ? "36px " : fmtKey === "retrato" ? "28px " : "23px ") + FONTE;
      fillTextFit(p.d.icone + " " + p.d.temp, mid, y + (fmtKey === "stories" ? 84 : fmtKey === "retrato" ? 66 : 54));

      ctx.fillStyle = "#e2e8f0";
      ctx.font = "600 " + (fmtKey === "feed" ? "16px " : "20px ") + FONTE;
      fillTextFit(p.d.curto.slice(0, 20), mid, y + (fmtKey === "stories" ? 120 : fmtKey === "retrato" ? 94 : 76));

      ctx.fillStyle = p.d.prob >= 50 ? "#fb923c" : "#93c5fd";
      ctx.font = "700 " + (fmtKey === "feed" ? "15px " : "19px ") + FONTE;
      fillTextFit("Chuva: " + Publicacao.pct(p.d.prob) + (Publicacao.num(p.d.chuva) !== null && p.d.chuva > 0 ? " (" + f1(p.d.chuva) + " mm)" : ""), mid, y + (fmtKey === "stories" ? 150 : fmtKey === "retrato" ? 118 : 94));
    });
    ctx.textAlign = "left";
    limiteLargura = null;
    y += hPer + (fmtKey === "feed" ? 14 : 24);

    // Bloco "O QUE A POPULAÇÃO PRECISA SABER HOJE"
    var altRestante = cfg.limite - y;
    ctx.fillStyle = "rgba(15, 23, 42, 0.72)";
    rr(x, y, larg, Math.max(120, altRestante), 16);
    ctx.fill();

    ctx.fillStyle = "#fde047";
    var tamCabRec = fmtKey === "stories" ? 28 : fmtKey === "retrato" ? 23 : 20;
    ctx.font = "800 " + tamCabRec + "px " + FONTE;
    fillTextFit("📌 O QUE A POPULAÇÃO PRECISA SABER HOJE:", x + 24, y + tamCabRec + 14);

    var yTxt = y + tamCabRec * 2 + (fmtKey === "feed" ? 12 : 22);
    var linhas = $("linhas").value.split(/\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    var tamTxt = fmtKey === "stories" ? 28 : fmtKey === "retrato" ? 22 : 18;
    ctx.font = "500 " + tamTxt + "px " + FONTE;
    ctx.fillStyle = "#fff";

    desenharItens(linhas, x + 24, yTxt, larg - 48, tamTxt, cfg.limite - 12, 2, 6);
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
    fillTextFit($("titulo").value || "PREVISÃO PARA 5 DIAS", x, y + (fmtKey === "feed" ? 26 : 34));
    ctx.fillStyle = "#b9c6ee";
    ctx.font = "500 " + (fmtKey === "stories" ? "26px " : "21px ") + FONTE;
    fillTextFit($("subtitulo").value || "Cajamar/SP · Planeje sua semana", x, y + (fmtKey === "feed" ? 52 : 68));

    y += (fmtKey === "feed" ? 66 : 86);

    // 5 Cartões Horizontais (um por dia)
    var hRow = fmtKey === "stories" ? 148 : fmtKey === "retrato" ? 102 : 76;
    var gapRow = fmtKey === "stories" ? 16 : fmtKey === "retrato" ? 10 : 8;

    dias5.forEach(function (d, idx) {
      var ry = y + idx * (hRow + gapRow);
      ctx.fillStyle = idx === 0 ? "rgba(56, 189, 248, 0.16)" : "rgba(15, 23, 42, 0.68)";
      rr(x, ry, larg, hRow, 14);
      ctx.fill();

      var corBarra = "#38bdf8"; // informativa: sem cor de risco por limiar
      ctx.fillStyle = corBarra;
      ctx.fillRect(x, ry + 12, 8, hRow - 24);

      var cyMid = ry + hRow * 0.44;
      var cySub = ry + hRow * 0.78;

      // Coluna 1: Dia e Data
      ctx.textAlign = "left";
      ctx.fillStyle = "#fde047";
      ctx.font = "800 " + (fmtKey === "stories" ? "32px " : fmtKey === "retrato" ? "25px " : "21px ") + FONTE;
      fillTextFit(d.diaSemCurto + " " + d.dataCurta, x + 24, cyMid, 200);
      ctx.fillStyle = "#cbd5e1";
      ctx.font = "500 " + (fmtKey === "stories" ? "22px " : "17px ") + FONTE;
      fillTextFit(idx === 0 ? "Hoje" : d.diaSemLongo.split("-")[0], x + 24, cySub);

      // Coluna 2: Ícone + Condição
      ctx.fillStyle = "#fff";
      ctx.font = "700 " + (fmtKey === "stories" ? "30px " : fmtKey === "retrato" ? "23px " : "19px ") + FONTE;
      fillTextFit(d.wmo.icone + " " + d.wmo.curto, x + 235, cyMid, larg - 235 - 340);
      ctx.fillStyle = "#93c5fd";
      ctx.font = "500 " + (fmtKey === "stories" ? "21px " : "16px ") + FONTE;
      fillTextFit("Umid. mín " + Publicacao.pct(d.uMin) + " · Rajadas " + kmhTxt(d.rajadaMax), x + 235, cySub, larg - 235 - 340);

      // Coluna 3 (Direita): Temperaturas Mín/Máx e Chuva
      ctx.textAlign = "right";
      ctx.fillStyle = "#fff";
      ctx.font = "800 " + (fmtKey === "stories" ? "36px " : fmtKey === "retrato" ? "27px " : "22px ") + FONTE;
      fillTextFit(Publicacao.graus(d.tmin) + " / " + gC(d.tmax), x + larg - 24, cyMid, 330);

      ctx.fillStyle = d.probChuva >= 50 ? "#fb923c" : "#38bdf8";
      ctx.font = "700 " + (fmtKey === "stories" ? "23px " : "18px ") + FONTE;
      fillTextFit("🌧️ " + Publicacao.pct(d.probChuva) + " · " + (d.chuvaMm === null ? "—" : f1(d.chuvaMm) + " mm"), x + larg - 24, cySub, 330);
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
      fillTextFit("📌 DESTAQUES E ORIENTAÇÕES À POPULAÇÃO:", x + 22, y + tamTit + 10);

      var yL = y + tamTit * 2 + (fmtKey === "feed" ? 8 : 16);
      var tamL = fmtKey === "stories" ? 25 : fmtKey === "retrato" ? 19 : 16;
      ctx.font = "500 " + tamL + "px " + FONTE;
      ctx.fillStyle = "#fff";
      var linhas = $("linhas").value.split(/\n/).map(function (s) { return s.trim(); }).filter(Boolean);
      desenharItens(linhas, x + 22, yL, larg - 44, tamL, cfg.limite - 10, 2, 4);
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
    fillTextFit($("titulo").value || ("RISCO DE FOGO: " + (rf ? rf.nivel.toUpperCase() : "DADOS INSUFICIENTES")), x + 26, y + (fmtKey === "stories" ? 56 : fmtKey === "retrato" ? 44 : 36));

    ctx.fillStyle = "#fde047";
    ctx.font = "700 " + (fmtKey === "stories" ? "30px " : fmtKey === "retrato" ? "24px " : "20px ") + FONTE;
    fillTextFit($("subtitulo").value || (d.diaSemLongo + " (" + d.dataCurta + ") · Cajamar/SP"), x + 26, y + (fmtKey === "stories" ? 102 : fmtKey === "retrato" ? 80 : 64));

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "500 " + (fmtKey === "stories" ? "23px " : "18px ") + FONTE;
    fillTextFit((rf ? "Regra dos 30: " + rf.regra30 + "/3 fatores ativos · Índice de Angström: " + String(rf.angstrom).replace(".", ",") : "Indicador não calculado: faltam dados meteorológicos"), x + 26, y + (fmtKey === "stories" ? 136 : fmtKey === "retrato" ? 105 : 84));

    y += hHero + (fmtKey === "feed" ? 14 : 22);

    var hCard = fmtKey === "stories" ? 150 : fmtKey === "retrato" ? 114 : 90;
    var gap = 16;
    var wCard = (larg - gap) / 2;
    var cards = [
      { rot: "💧 UMIDADE MÍNIMA", val: Publicacao.pct(d.uMin), sub: d.uMin === null ? "Dado indisponível" : (d.uMin <= 30 ? "⚠️ Umidade muito baixa" : "Mínima prevista para a tarde"), cor: "#f97316" },
      { rot: "🌡️ TEMPERATURA MÁXIMA", val: gC(d.tmax), sub: "Sensação térmica até " + gC(d.sMax), cor: "#ef4444" },
      { rot: "💨 RAJADAS DE VENTO", val: kmhTxt(d.rajadaMax), sub: d.rajadaMax === null ? "Dado indisponível" : (d.rajadaMax >= 30 ? "⚠️ Vento acelera propagação" : "Velocidade máxima prevista"), cor: "#eab308" },
      { rot: "🛰️ SATÉLITES INPE / NASA", val: fg.focos.titulo, sub: fg.focos.sub, cor: fg.focos.estado === "indisponivel" ? "#64748b" : "#38bdf8" }
    ];

    cards.forEach(function (ind, i) {
      var col = i % 2, row = Math.floor(i / 2);
      var cx = x + col * (wCard + gap);
      var cy = y + row * (hCard + gap);
      limiteLargura = wCard - 34;
      ctx.fillStyle = "rgba(15, 23, 42, 0.72)";
      rr(cx, cy, wCard, hCard, 14);
      ctx.fill();
      ctx.fillStyle = ind.cor;
      ctx.fillRect(cx, cy + 14, 7, hCard - 28);

      ctx.fillStyle = "#93c5fd";
      ctx.font = "700 " + (fmtKey === "feed" ? "17px " : "21px ") + FONTE;
      fillTextFit(ind.rot, cx + 22, cy + (fmtKey === "stories" ? 36 : fmtKey === "retrato" ? 30 : 24));

      ctx.fillStyle = "#fff";
      ctx.font = "800 " + (fmtKey === "stories" ? "42px " : fmtKey === "retrato" ? "32px " : "26px ") + FONTE;
      fillTextFit(ind.val, cx + 22, cy + (fmtKey === "stories" ? 88 : fmtKey === "retrato" ? 68 : 54));

      ctx.fillStyle = "#cbd5e1";
      ctx.font = "500 " + (fmtKey === "feed" ? "16px " : "20px ") + FONTE;
      fillTextFit(ind.sub, cx + 22, cy + (fmtKey === "stories" ? 128 : fmtKey === "retrato" ? 98 : 78));
    });

    limiteLargura = null;
    y += hCard * 2 + gap + (fmtKey === "feed" ? 14 : 24);

    var altRest = cfg.limite - y;
    ctx.fillStyle = "rgba(15, 23, 42, 0.78)";
    rr(x, y, larg, Math.max(120, altRest), 16);
    ctx.fill();

    ctx.fillStyle = "#fde047";
    var tamCab = fmtKey === "stories" ? 28 : fmtKey === "retrato" ? 23 : 19;
    ctx.font = "800 " + tamCab + "px " + FONTE;
    fillTextFit("🚫 QUEIMADA É CRIME AMBIENTAL · ORIENTAÇÕES À POPULAÇÃO:", x + 24, y + tamCab + 14);

    var yTxt = y + tamCab * 2 + (fmtKey === "feed" ? 12 : 22);
    var linhas = $("linhas").value.split(/\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    var tamTxt = fmtKey === "stories" ? 27 : fmtKey === "retrato" ? 21 : 17;
    ctx.font = "500 " + tamTxt + "px " + FONTE;
    ctx.fillStyle = "#fff";
    desenharItens(linhas, x + 24, yTxt, larg - 48, tamTxt, cfg.limite - 12, 2, 6);
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
    fillTextFit($("titulo").value || ("BALANÇO DAS ESTAÇÕES · " + b.dtCurta), x, y + (fmtKey === "feed" ? 26 : 34));
    ctx.fillStyle = "#b9c6ee";
    ctx.font = "500 " + (fmtKey === "stories" ? "26px " : "21px ") + FONTE;
    fillTextFit($("subtitulo").value || "Rede Meteorológica e Fluviométrica de Cajamar/SP", x, y + (fmtKey === "feed" ? 52 : 68));

    y += (fmtKey === "feed" ? 66 : 86);

    var hRow = fmtKey === "stories" ? 156 : fmtKey === "retrato" ? 110 : 82;
    var gapRow = fmtKey === "stories" ? 16 : fmtKey === "retrato" ? 10 : 8;

    // 3 Cartões de Estações + 1 Cartão da Régua do Rio
    var blocos = b.estacoes.map(function (e) {
      return {
        icone: "🌡️",
        nome: e.nome,
        cor: e.temDado ? "#38bdf8" : "#64748b",
        principal: e.temDado ? (Publicacao.num(e.d.chuva) === null ? "—" : (e.completo !== true ? "≥ " : "") + f1(e.d.chuva) + " mm") : "Sem CSV",
        det1: e.temDado ? ("Pico 60 min: " + f1(e.d.c60) + " mm · 10 min: " + f1(e.d.c10) + " mm" + (e.completo !== true ? " · dia incompleto" : "")) : "Envie o CSV na aba Histórico",
        det2: e.temDado ? ("Temp: " + Publicacao.graus(e.d.tmin) + " a " + gC(e.d.tmax) + " · Vento máx: " + (Publicacao.num(e.d.vmax) === null ? "—" : f1(e.d.vmax) + " km/h")) : "—"
      };
    });

    blocos.push({
      icone: "🌊",
      nome: b.regua ? b.regua.nome : "Régua de Nível do Rio",
      cor: b.regua ? "#34d399" : "#64748b",
      principal: b.regua ? (f2(b.regua.nvMax) + " m (máx)") : "Sem CSV",
      det1: b.regua ? ("Nível Mín: " + f2(b.regua.nvMin) + " m · Médio: " + f2(b.regua.nvMed) + " m") : "Envie o CSV da régua de nível",
      det2: b.regua ? ("Variação no dia (Δ): " + (Publicacao.num(b.regua.nvDelta) === null ? "—" : "+" + Math.round(b.regua.nvDelta * 100) + " cm (" + f2(b.regua.nvDelta) + " m)")) : "—"
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
      fillTextFit(bl.icone + " " + bl.nome, x + 24, ry + hRow * 0.36, larg - 24 - 320);

      ctx.fillStyle = "#e2e8f0";
      ctx.font = "600 " + (fmtKey === "stories" ? "22px " : "17px ") + FONTE;
      fillTextFit(bl.det1, x + 24, ry + hRow * 0.65, larg - 24 - 320);

      ctx.fillStyle = "#93c5fd";
      ctx.font = "500 " + (fmtKey === "stories" ? "20px " : "15px ") + FONTE;
      fillTextFit(bl.det2, x + 24, ry + hRow * 0.88, larg - 24 - 320);

      ctx.textAlign = "right";
      ctx.fillStyle = "#fff";
      ctx.font = "800 " + (fmtKey === "stories" ? "40px " : fmtKey === "retrato" ? "30px " : "24px ") + FONTE;
      fillTextFit(bl.principal, x + larg - 24, ry + hRow * 0.56, 300);
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
      fillTextFit("📌 RESUMO HIDROMETEOROLÓGICO DO DIA:", x + 22, y + tamTit + 10);

      var yL = y + tamTit * 2 + (fmtKey === "feed" ? 8 : 16);
      var tamL = fmtKey === "stories" ? 25 : fmtKey === "retrato" ? 19 : 16;
      ctx.font = "500 " + tamL + "px " + FONTE;
      ctx.fillStyle = "#fff";
      var linhas = $("linhas").value.split(/\n/).map(function (s) { return s.trim(); }).filter(Boolean);
      desenharItens(linhas, x + 22, yL, larg - 44, tamL, cfg.limite - 10, 2, 4);
    }
  }

  // ---------- Panfleto Visual de Risco de Deslizamento (flyer_deslizamento) ----------
  // Estado de uma janela; sem dado (null) usa o estado "sem dados", nunca o nível 0.
  function estJanela(n) {
    var D = window.Deslizamento;
    return n === null || n === undefined ? Object.assign({}, D.SEM_DADOS, { estado: "Sem dado" }) : D.ESTADOS[n];
  }

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
    fillTextFit($("titulo").value || ("INDICADOR REFERENCIAL: " + String(av.estado).toUpperCase()), x + 26, y + (fmtKey === "stories" ? 54 : fmtKey === "retrato" ? 42 : 34));

    ctx.fillStyle = "#fde047";
    ctx.font = "700 " + (fmtKey === "stories" ? "28px " : fmtKey === "retrato" ? "23px " : "19px ") + FONTE;
    fillTextFit($("subtitulo").value || ((av.fonte || "Monitoramento Cajamar") + " · Cajamar/SP"), x + 26, y + (fmtKey === "stories" ? 96 : fmtKey === "retrato" ? 76 : 60));

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "500 " + (fmtKey === "stories" ? "22px " : "17px ") + FONTE;
    fillTextFit("Critério referencial NÃO homologado (Pinheiro 2005; AlertaRio 2013) — 1h · 24h · 168h", x + 26, y + (fmtKey === "stories" ? 128 : fmtKey === "retrato" ? 100 : 80));

    y += hHero + (fmtKey === "feed" ? 12 : 20);

    // 3 Cartões de Janelas de Acumulado (1h, 24h, 168h)
    var hJan = fmtKey === "stories" ? 156 : fmtKey === "retrato" ? 118 : 92;
    var gap = 16;
    var wJan = (larg - gap * 2) / 3;
    var janelas = [
      { rot: "⏱️ CHUVA 1 HORA", val: f1(av.mm1h) + " mm/h", est: estJanela(av.nivel1h), ref: "Ref.0 < 10 · Ref.3 ≥ 30" },
      { rot: "🌧️ ACUMULADO 24H", val: f1(av.mm24h) + " mm/24h", est: estJanela(av.nivel24h), ref: "Ref.0 < 25 · Ref.3 ≥ 100" },
      { rot: "📅 ACUM. 168H (7 DIAS)", val: f1(av.mm168h) + " mm", est: estJanela(av.nivel168h), ref: "Ref.0 < 50 · Ref.3 ≥ 150" }
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
      fillTextFit(j.rot, jx + 20, y + (fmtKey === "stories" ? 34 : 26));

      ctx.fillStyle = "#fff";
      ctx.font = "800 " + (fmtKey === "stories" ? "36px " : fmtKey === "retrato" ? "28px " : "23px ") + FONTE;
      fillTextFit(j.val, jx + 20, y + (fmtKey === "stories" ? 80 : fmtKey === "retrato" ? 62 : 50));

      ctx.fillStyle = j.est.corFundo;
      ctx.font = "800 " + (fmtKey === "stories" ? "22px " : "17px ") + FONTE;
      fillTextFit(j.est.icone + " " + j.est.estado, jx + 20, y + (fmtKey === "stories" ? 116 : fmtKey === "retrato" ? 90 : 72));

      ctx.fillStyle = "#cbd5e1";
      ctx.font = "500 " + (fmtKey === "stories" ? "17px " : "13px ") + FONTE;
      fillTextFit(j.ref, jx + 20, y + (fmtKey === "stories" ? 142 : fmtKey === "retrato" ? 110 : 86));
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
      fillTextFit(e.estado.toUpperCase(), ex + wEsc / 2, y + hEsc * 0.46);
      ctx.fillStyle = ativo ? e.corTexto : "#cbd5e1";
      ctx.font = "600 " + (fmtKey === "stories" ? "15px " : "12px ") + FONTE;
      fillTextFit(e.faixa24h, ex + wEsc / 2, y + hEsc * 0.78);
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
    fillTextFit("⛰️ SINAIS NAS ENCOSTAS E ORIENTAÇÕES GERAIS:", x + 24, y + tamCab + 12);

    var yTxt = y + tamCab * 2 + (fmtKey === "feed" ? 10 : 18);
    var linhas = $("linhas").value.split(/\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    var tamTxt = fmtKey === "stories" ? 26 : fmtKey === "retrato" ? 20 : 16;
    ctx.font = "500 " + tamTxt + "px " + FONTE;
    ctx.fillStyle = "#fff";
    desenharItens(linhas, x + 24, yTxt, larg - 48, tamTxt, cfg.limite - 12, 2, 5);
  }

  function fundoDaArte() {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#14214d");
    g.addColorStop(0.55, "#0f1c3f");
    g.addColorStop(1, "#091026");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function ajustarTela() {
    var fmtKey = ($("formato") && $("formato").value) || "stories";
    var cfg = FORMATOS[fmtKey] || FORMATOS.stories;
    W = cfg.w; H = cfg.h;
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    return { fmtKey: fmtKey, cfg: cfg };
  }

  // Apaga a arte anterior e mostra só uma mensagem (carregando / não gerada). Nada da imagem antiga fica no canvas.
  function pintarPrevia(texto) {
    ajustarTela();
    fundoDaArte();
    ctx.fillStyle = "#9db0e0";
    ctx.textAlign = "center";
    ctx.font = "500 34px " + FONTE;
    var enc = Publicacao.encaixarTexto(texto, W - 200, medirTexto, 9);
    enc.linhas.forEach(function (l, i) { ctx.fillText(l, W / 2, H / 2 - 40 + i * 46); });
    ctx.textAlign = "left";
  }

  function desenharMarcaDagua() {
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-Math.PI / 6);
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.font = "900 " + Math.round(W * 0.1) + "px " + FONTE;
    ctx.fillText("SIMULAÇÃO", 0, -10);
    ctx.font = "800 " + Math.round(W * 0.042) + "px " + FONTE;
    ctx.fillText("NÃO É MONITORAMENTO REAL", 0, 60);
    ctx.restore();
    ctx.textAlign = "left";
  }

  // Desenha a arte completa para o modelo atual. LANÇA exceção se algo falhar (quem chama invalida a exportação).
  function desenharTudo() {
    var t = ajustarTela(), fmtKey = t.fmtKey, cfg = t.cfg;
    fundoDaArte();
    limiteLargura = null;
    var yBase = desenharCabecalhoInstitucional(cfg, fmtKey);

    if (modelo.tipoFlyer === "dia" && modelo.dadosDia) desenharFlyerDia(cfg, fmtKey, yBase);
    else if (modelo.tipoFlyer === "5dias" && modelo.dados5Dias) desenharFlyer5Dias(cfg, fmtKey, yBase);
    else if (modelo.tipoFlyer === "fogo" && modelo.dadosFogo) desenharFlyerFogo(cfg, fmtKey, yBase);
    else if (modelo.tipoFlyer === "estacoes" && modelo.dadosEstacoes) desenharFlyerEstacoes(cfg, fmtKey, yBase);
    else if (modelo.tipoFlyer === "deslizamento" && modelo.dadosDeslizamento) desenharFlyerDeslizamento(cfg, fmtKey, yBase);
    else desenharLayoutPadrao(cfg, fmtKey, yBase);

    limiteLargura = null;
    desenharRodapeInstitucional(cfg, fmtKey);
    if (modelo.simulado) desenharMarcaDagua();
  }

  // Layout padrão (Avisos, Chuva da estação, Semana, Dicas, Previsão INMET)
  function desenharLayoutPadrao(cfg, fmtKey, yBase) {
    ctx.textAlign = "left";
    var x = 80, larg = W - 160;
    var y = yBase + (fmtKey === "feed" ? 32 : 44) + Math.round(cfg.titleSize * 0.7);

    ctx.fillStyle = "#fff";
    ctx.font = "800 " + cfg.titleSize + "px " + FONTE;
    Publicacao.encaixarTexto($("titulo").value, larg, medirTexto, 3).linhas.forEach(function (l) {
      ctx.fillText(l, x, y);
      y += cfg.titleSize * 1.15;
    });

    ctx.fillStyle = "#b9c6ee";
    ctx.font = "500 " + cfg.subSize + "px " + FONTE;
    Publicacao.encaixarTexto($("subtitulo").value, larg, medirTexto, 2).linhas.forEach(function (l) {
      y += 2;
      ctx.fillText(l, x, y + cfg.subSize * 0.6);
      y += cfg.subSize * 1.25;
    });

    y += (fmtKey === "feed" ? 14 : 24);

    var linhas = $("linhas").value.split(/\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    var altGraf = modelo.grafico ? (fmtKey === "stories" ? 380 : fmtKey === "retrato" ? 280 : 200) : 0;
    var limiteTexto = cfg.limite - (altGraf ? altGraf + 24 : 0);
    function medirBlocos(tam) {
      ctx.font = "500 " + tam + "px " + FONTE;
      var bl = linhas.map(function (l) { return Publicacao.encaixarTexto(l, larg - 40, medirTexto, 6).linhas; });
      var alt = bl.reduce(function (s, b) { return s + b.length * (tam * 1.25) + tam * 0.35; }, 0);
      return { bl: bl, alt: alt };
    }
    // reduz a fonte só até o tamanho mínimo do formato; se ainda não couber, corta e avisa (não encolhe mais)
    var tam = cfg.maxLinhas, r = medirBlocos(tam);
    while (y + r.alt > limiteTexto && tam - 2 >= cfg.minLinhas) { tam -= 2; r = medirBlocos(tam); }
    ctx.font = "500 " + tam + "px " + FONTE;

    var corBarraLateral = corEfetivaFaixa(), ocultos = 0;
    for (var bi = 0; bi < r.bl.length; bi++) {
      var b = r.bl[bi], alt = b.length * tam * 1.25 + tam * 0.35, ultimo = bi === r.bl.length - 1;
      if (y + alt > limiteTexto - (ultimo ? 0 : tam * 1.25)) { ocultos = r.bl.length - bi; break; }
      ctx.fillStyle = corBarraLateral;
      ctx.fillRect(x, y - tam * 0.75, 8, b.length * tam * 1.25 - tam * 0.2);
      ctx.fillStyle = "#fff";
      b.forEach(function (l) {
        ctx.fillText(l, x + 28, y);
        y += tam * 1.25;
      });
      y += tam * 0.35;
    }
    if (ocultos) {
      ctx.fillStyle = "#fde047";
      ctx.fillText("… +" + ocultos + " informação(ões) completa(s) na legenda", x + 28, Math.min(y, limiteTexto));
    }

    if (modelo.grafico) desenharBarras(modelo.grafico, x, cfg.limite - altGraf, larg, altGraf);
  }

  // Redesenho ao vivo (edição de texto, formato, faixa): só redesenha uma publicação já válida; nunca "ressuscita" uma falha.
  function desenhar() {
    var st = ciclo.get();
    if (st.estado !== "pronto") {
      pintarPrevia(st.estado === "gerando" ? "Gerando publicação…" : st.motivo ? "Publicação não gerada: " + st.motivo : "Carregando dados para o panfleto…");
      atualizarBotoes();
      return;
    }
    try {
      desenharTudo();
      ciclo.atualizar({ formato: ($("formato") && $("formato").value) || "stories" });
    } catch (e) {
      if (typeof console !== "undefined") console.error("[publicar] falha ao redesenhar:", e);
      ciclo.invalidar("erro ao desenhar a imagem (" + (e && e.message ? e.message : e) + ")");
      pintarPrevia("Publicação não gerada: " + ciclo.get().motivo);
      setMsg("Publicação não gerada: " + ciclo.get().motivo);
    }
    atualizarMetaPrevia();
    atualizarBotoes();
  }

  var ROTULO_TIPO = {
    flyer_dia: "Panfleto Diário", flyer_5dias: "Panfleto 5 Dias", flyer_deslizamento: "Indicador de Deslizamento", flyer_fogo: "Risco de Fogo",
    flyer_estacoes: "Estações + Rio", aviso: "Aviso INMET", prevdia: "Previsão do dia (INMET)", prevsemana: "Previsão dos próximos dias (INMET)",
    chuva: "Chuva medida (estação)", semana: "Resumo semanal da chuva", dica: "Dica de prevenção"
  };
  var ROTULO_FORMATO = { stories: "Stories 9:16", retrato: "Retrato 4:5", feed: "Quadrado 1:1" };

  // Legenda sob a prévia: de qual modelo/data/formato é a imagem que está na tela.
  function atualizarMetaPrevia() {
    var el = $("metaPrevia");
    if (!el) return;
    var st = ciclo.get();
    if (st.estado === "pronto" && st.meta) {
      el.textContent = "Prévia: " + (ROTULO_TIPO[st.meta.tipo] || st.meta.tipo) + " · referência " + (st.meta.dataRef ? Publicacao.dataCurta(st.meta.dataRef) : "—") +
        " · " + (ROTULO_FORMATO[st.meta.formato] || st.meta.formato) + " · gerada " + Publicacao.dataHoraSP(st.meta.geradoEm) + " (SP)" + (st.meta.simulado ? " · SIMULAÇÃO" : "");
    } else if (st.estado === "gerando") {
      el.textContent = "Prévia: gerando…";
    } else {
      el.textContent = "Sem prévia válida" + (st.motivo ? ": " + st.motivo : ".");
    }
  }

  // Botões de exportação: só habilitados com imagem pronta, do modelo atual e sem faixa incoerente sem justificativa.
  function atualizarBotoes() {
    var pe = ciclo.podeExportar($("tipo").value, null);
    var fx = faixaAtual();
    var simulado = !!(ciclo.get().meta && ciclo.get().meta.simulado);
    var pronto = pe.ok && !fx.bloqueia;
    $("baixar").disabled = !pronto;
    if ($("copiarImg")) $("copiarImg").disabled = !pronto || simulado;
    if ($("compartilhar")) $("compartilhar").disabled = !pronto || simulado;
    $("copiar").disabled = !pronto || simulado;
    if (pe.ok && fx.bloqueia) {
      setMsg("Faixa incoerente (" + fx.motivoIncoerencia + "): escreva uma justificativa visível (mín. 5 caracteres) para liberar a exportação.");
    }
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
    var meta = ciclo.get().meta || {};
    var fmtKey = meta.formato || ($("formato") && $("formato").value) || "stories";
    var prefix = (FORMATOS[fmtKey] && FORMATOS[fmtKey].prefix) || "post";
    var ref = String(meta.dataRef || Publicacao.dataSP(Date.now())).replace(/-/g, "");
    var hora = Publicacao.horaSP(meta.geradoEm || Date.now()).replace(":", "");
    return prefix + "-" + (meta.tipo || $("tipo").value) + "-" + ref + "-" + hora + ".png";
  }

  // ---------- ações ----------
  function feedbackBotao(btn, texto) {
    if (!btn) return;
    if (!btn.dataset.originalHtml) btn.dataset.originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = texto;
    setTimeout(function () {
      btn.innerHTML = btn.dataset.originalHtml;
      atualizarBotoes(); // reabilita só se a publicação ainda estiver pronta (não reativa botão de uma falha)
    }, 2000);
  }

  // Bloqueia exportação durante a geração, após falha, com prévia de outro modelo, faixa incoerente ou (para compartilhar/copiar legenda) simulação.
  function guardaExport(acao) {
    var pe = ciclo.podeExportar($("tipo").value, null);
    if (!pe.ok) { setMsg(pe.motivo); atualizarBotoes(); return false; }
    var fx = faixaAtual();
    if (fx.bloqueia) { setMsg("Faixa incoerente (" + fx.motivoIncoerencia + "): escreva uma justificativa para liberar a exportação."); return false; }
    if ((acao === "compartilhar" || acao === "legenda" || acao === "copiarImg") && ciclo.get().meta.simulado) {
      setMsg("SIMULAÇÃO: não é monitoramento real. Só é permitido baixar o PNG com marca d'água.");
      return false;
    }
    return true;
  }

  function exportarBlob(acao, aoPronto) {
    if (!guardaExport(acao)) return;
    var tk = ciclo.get().token;
    try {
      cv.toBlob(function (b) {
        var st = ciclo.get();
        if (st.token !== tk || st.estado !== "pronto") { setMsg("A prévia mudou durante a exportação. Tente novamente."); atualizarBotoes(); return; }
        if (!b) { setMsg("Não foi possível gerar o arquivo da imagem."); return; }
        aoPronto(b);
      }, "image/png");
    } catch (e) {
      if (typeof console !== "undefined") console.error("[publicar] exportação:", e);
      setMsg("Não foi possível exportar a imagem (" + (e && e.message ? e.message : e) + "). Abra a página por http(s) e tente de novo.");
    }
  }

  function baixarBlob(b, nomeArq) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = nomeArq;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  $("compartilhar").onclick = function () {
    setMsg("");
    exportarBlob("compartilhar", async function (b) {
      var nomeArq = obterNomeArquivo();
      var file = new File([b], nomeArq, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ title: $("titulo").value || "Defesa Civil de Cajamar", text: $("legenda").value || "", files: [file] });
          setMsg("Compartilhado com sucesso!");
          return;
        } catch (err) {
          if (err && err.name === "AbortError") return;
          if (typeof console !== "undefined") console.warn("[publicar] compartilhamento nativo falhou:", err);
        }
      }
      baixarBlob(b, nomeArq);
      try {
        await navigator.clipboard.writeText($("legenda").value);
        feedbackBotao($("compartilhar"), "✅ Baixado + Copiado!");
        setMsg("Panfleto baixado e legenda copiada! Cole no Instagram, WhatsApp ou Facebook.");
      } catch (e) {
        if (typeof console !== "undefined") console.warn("[publicar] cópia da legenda falhou:", e);
        feedbackBotao($("compartilhar"), "✅ Baixado!");
        setMsg("Panfleto baixado, mas a legenda NÃO foi copiada automaticamente: use “Copiar legenda”.");
      }
    });
  };

  if ($("copiarImg")) {
    $("copiarImg").onclick = function () {
      setMsg("");
      exportarBlob("copiarImg", async function (b) {
        if (navigator.clipboard && navigator.clipboard.write && typeof ClipboardItem !== "undefined") {
          try {
            await navigator.clipboard.write([new ClipboardItem({ "image/png": b })]);
            feedbackBotao($("copiarImg"), "✅ Imagem copiada!");
            setMsg("✅ Imagem copiada! Agora basta dar Ctrl+V direto na conversa do WhatsApp Web.");
            return;
          } catch (errClip) {
            if (typeof console !== "undefined") console.warn("[publicar] cópia da imagem bloqueada:", errClip);
          }
        }
        setMsg("Seu navegador bloqueou a cópia direta de imagem. Use o botão “Baixar PNG”.");
      });
    };
  }

  $("baixar").onclick = function () {
    setMsg("");
    exportarBlob("baixar", function (b) {
      baixarBlob(b, obterNomeArquivo());
      feedbackBotao($("baixar"), "✅ Baixado!");
      setMsg(ciclo.get().meta.simulado ? "PNG de SIMULAÇÃO baixado (com marca d'água). Não publique como informação oficial." : "Panfleto baixado em PNG. Revise antes de publicar.");
    });
  };
  $("copiar").onclick = async function () {
    if (!guardaExport("legenda")) return;
    try {
      await navigator.clipboard.writeText($("legenda").value);
      feedbackBotao($("copiar"), "✅ Legenda copiada!");
      setMsg("Legenda copiada.");
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[publicar] cópia da legenda falhou:", e);
      if ($("detEditarPub")) $("detEditarPub").open = true;
      $("legenda").select();
      setMsg("Não consegui copiar sozinho: o texto está selecionado, use copiar do aparelho.");
    }
  };

  var btsAtalho = document.querySelectorAll(".atalho-pub");
  for (var bi = 0; bi < btsAtalho.length; bi++) {
    btsAtalho[bi].onclick = function () {
      $("tipo").value = this.getAttribute("data-tipo");
      atualizarEscolha();
    };
  }

  if ($("detEditarPub") && window.innerWidth >= 820) {
    $("detEditarPub").open = true;
  }

  ["titulo", "subtitulo", "linhas", "textoFaixa", "justificativaFaixa"].forEach(function (i) { if ($(i)) $(i).oninput = desenhar; });
  $("tipo").onchange = atualizarEscolha;
  if ($("formato")) $("formato").onchange = desenhar;
  if ($("nivelFaixa")) $("nivelFaixa").onchange = desenhar;
  $("escolha").onchange = montar;
  $("contato").oninput = desenhar;
  $("contato").onchange = function () {
    try { localStorage.setItem(CHAVE_CONTATO, $("contato").value); }
    catch (e) { if (typeof console !== "undefined") console.warn("[publicar] não foi possível guardar o contato:", e); }
    if (ciclo.get().estado === "pronto") montar();
  };
  try { $("contato").value = localStorage.getItem(CHAVE_CONTATO) || ""; }
  catch (e) { if (typeof console !== "undefined") console.warn("[publicar] contato guardado indisponível:", e); }

  carregarHistorico();
  pintarPrevia("Carregando dados para o panfleto…");
  atualizarMetaPrevia();
  atualizarBotoes();
  Promise.all([carregarImg("logo", "assets/logo-dc-cajamar.jpg"), carregarImg("brasao", "assets/brasao-cajamar.gif")]).then(function () {
    return carregarDados();
  }).catch(function (e) {
    if (typeof console !== "undefined") console.error("[publicar] inicialização:", e);
    var tk = ciclo.iniciar({ tipo: $("tipo").value, formato: ($("formato") && $("formato").value) || "stories" });
    finalizarFalha(tk, "erro ao carregar os dados (" + (e && e.message ? e.message : e) + ")");
  });
})();
