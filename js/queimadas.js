// Monitoramento de focos de calor (INPE BDQueimadas / NASA FIRMS & GIBS) e satélites meteorológicos/ambientais.
// Sem dependência obrigatória de DOM nas funções puras (pode ser testado no Node).
(function (w) {
  "use strict";
  var LAT_CAJAMAR = -23.3547, LON_CAJAMAR = -46.8764, IBGE_CAJAMAR = 3509205;
  var URL_DIARIO_BASE = "https://dataserver-coids.inpe.br/queimadas/queimadas/focos/csv/diario/Brasil/";
  var URL_10MIN_BASE = "https://dataserver-coids.inpe.br/queimadas/queimadas/focos/csv/10min/";

  // Catálogo dos satélites monitorados solicitados pela Defesa Civil de Cajamar
  var SATELITES = [
    {
      id: "GOES-19",
      aliases: ["GOES-19", "GOES-16", "GOES_19", "GOES_16", "GOES-EAST"],
      nome: "GOES-19 / GOES-16 (GOES-East)",
      orgao: "NOAA / NASA / INPE",
      orbita: "Geoestacionária (varredura a cada 10 min)",
      uso: "Clima severo, topo de nuvens (IR) e focos persistentes de calor em tempo real"
    },
    {
      id: "NPP-375",
      aliases: ["NPP-375", "SUOMI-NPP", "S-NPP"],
      nome: "NPP-375 — Tarde (Suomi-NPP VIIRS 375 m)",
      orgao: "NASA / NOAA (Satélite de Referência INPE)",
      orbita: "Polar heliossíncrona · passagem ~13h30 BRT",
      uso: "Detecção de alta resolução (375 m) de queimadas no período crítico da tarde"
    },
    {
      id: "NPP-375D",
      aliases: ["NPP-375D", "MANHA NPP-375", "NPP-375-M"],
      nome: "Manhã NPP-375 (Suomi-NPP VIIRS 375 m)",
      orgao: "NASA / NOAA / INPE",
      orbita: "Polar heliossíncrona · passagem ~01h30 / manhã",
      uso: "Detecção noturna/matinal de focos ativos de queimada (375 m)"
    },
    {
      id: "NOAA-20",
      aliases: ["NOAA-20", "JPSS-1"],
      nome: "NOAA-20 (VIIRS 375 m)",
      orgao: "NOAA / NASA",
      orbita: "Polar heliossíncrona (50 min à frente do S-NPP)",
      uso: "Focos de calor de alta sensibilidade (375 m) e imagens multiespectrais"
    },
    {
      id: "NOAA-21",
      aliases: ["NOAA-21", "JPSS-2"],
      nome: "NOAA-21 (VIIRS 375 m)",
      orgao: "NOAA / NASA",
      orbita: "Polar heliossíncrona (nova geração JPSS)",
      uso: "Monitoramento térmico de queimadas e cobertura de nuvens"
    },
    {
      id: "METOP-B",
      aliases: ["METOP-B", "METOP_B"],
      nome: "METOP-B (AVHRR/3)",
      orgao: "EUMETSAT",
      orbita: "Polar matinal (~09h30 / 21h30 local)",
      uso: "Monitoramento complementar de focos de calor e perfil atmosférico"
    },
    {
      id: "METOP-C",
      aliases: ["METOP-C", "METOP_C"],
      nome: "METOP-C (AVHRR/3)",
      orgao: "EUMETSAT",
      orbita: "Polar matinal (~09h30 / 21h30 local)",
      uso: "Detecção termal pela manhã/noite e apoio meteorológico"
    },
    {
      id: "MSG-03",
      aliases: ["MSG-03", "MSG_03", "METEOSAT-10"],
      nome: "MSG-03 (Meteosat SEVIRI)",
      orgao: "EUMETSAT / INPE",
      orbita: "Geoestacionária (varredura a cada 15 min)",
      uso: "Vigilância contínua de radiação térmica e sistemas atmosféricos"
    },
    {
      id: "MODIS",
      aliases: ["AQUA_M-T", "AQUA_M-M", "TERRA_M-M", "TERRA_M-T", "AQUA", "TERRA"],
      nome: "AQUA & TERRA (MODIS 1 km / Área Queimada MCD64A1)",
      orgao: "NASA Earthdata / LASA-UFRJ",
      orbita: "Polar manhã (Terra ~10h30) e tarde (Aqua ~13h30)",
      uso: "Série histórica de focos e mapeamento de cicatrizes de área queimada"
    }
  ];

  function distanciaKm(lat1, lon1, lat2, lon2) {
    var R = 6371;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function grupoSatelite(satBruto) {
    var s = String(satBruto || "").trim().toUpperCase();
    for (var i = 0; i < SATELITES.length; i++) {
      if (SATELITES[i].aliases.indexOf(s) >= 0) return SATELITES[i].id;
    }
    return s || "OUTRO";
  }

  function rotuloSatelite(satBruto) {
    var s = String(satBruto || "").trim().toUpperCase();
    if (s === "NPP-375D") return "Manhã NPP-375";
    if (s === "NPP-375") return "NPP-375 (Tarde)";
    if (s === "AQUA_M-T") return "AQUA (Tarde)";
    if (s === "AQUA_M-M") return "AQUA (Manhã)";
    if (s === "TERRA_M-M") return "TERRA (Manhã)";
    if (s === "TERRA_M-T") return "TERRA (Tarde)";
    return s || "Desconhecido";
  }

  function num(v) {
    if (v === undefined || v === null || v === "") return null;
    var n = parseFloat(String(v).trim());
    return isFinite(n) ? n : null;
  }

  // Converte "YYYY-MM-DD HH:MM:SS" (GMT) para timestamp ms e texto BRT "DD/MM HH:MM"
  function converterDataGmt(s) {
    if (!s) return { ts: null, brt: "—" };
    var str = String(s).trim();
    var ts, dBrt, brt;
    var p2 = function (n) { return String(n).padStart(2, "0"); };

    // Fast path: string slicing for standard "YYYY-MM-DD HH:MM:SS" format
    if (str.length >= 16 && str.charAt(4) === '-' && str.charAt(7) === '-') {
      var y = +str.slice(0, 4), mth = +str.slice(5, 7), d = +str.slice(8, 10);
      var h = +str.slice(11, 13), min = +str.slice(14, 16);
      var sec = str.length >= 19 && str.charAt(16) === ':' ? +str.slice(17, 19) : 0;

      if (!isNaN(y) && !isNaN(mth) && !isNaN(d) && !isNaN(h) && !isNaN(min)) {
        ts = Date.UTC(y, mth - 1, d, h, min, sec);
        dBrt = new Date(ts - 3 * 3600000);
        brt = p2(dBrt.getUTCDate()) + "/" + p2(dBrt.getUTCMonth() + 1) + " " + p2(dBrt.getUTCHours()) + ":" + p2(dBrt.getUTCMinutes());
        return { ts: ts, brt: brt };
      }
    }

    // Fallback: regex for other potential date formats
    var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(str);
    if (!m) return { ts: null, brt: str };
    ts = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
    dBrt = new Date(ts - 3 * 3600000);
    brt = p2(dBrt.getUTCDate()) + "/" + p2(dBrt.getUTCMonth() + 1) + " " + p2(dBrt.getUTCHours()) + ":" + p2(dBrt.getUTCMinutes());
    return { ts: ts, brt: brt };
  }

  // Lê o CSV diário do INPE (id,lat,lon,data_hora_gmt,satelite,municipio,estado,pais,municipio_id,estado_id,pais_id,numero_dias_sem_chuva,precipitacao,risco_fogo,bioma,frp)
  // ou o CSV de 10 minutos (lat,lon,satelite,data).
  function lerCsvFocos(texto, raioMaxKm) {
    var maxKm = typeof raioMaxKm === "number" ? raioMaxKm : 250;
    var linhas = String(texto || "").replace(/^\uFEFF/, "").split(/\r?\n/).filter(function (l) { return l.trim() !== ""; });
    if (linhas.length < 2) return [];
    var cab = linhas[0].split(",").map(function (c) { return c.trim().toLowerCase(); });
    var idx = {};
    cab.forEach(function (c, i) { idx[c] = i; });
    if (idx.lat === undefined || idx.lon === undefined || idx.satelite === undefined) {
      throw new Error("CSV de focos em formato inesperado");
    }
    var out = [];
    // 1 grau de latitude é aprox 111km. Para longitude, precisamos considerar o cosseno da latitude.
    // Em Cajamar (-23.35°), 1 grau de longitude é aprox 111 * cos(-23.35°) ~= 101.8km.
    // Usamos 100km como denominador seguro para não perder pontos nas bordas leste/oeste.
    var limiteGrausLat = (maxKm / 110) + 0.1;
    var limiteGrausLon = (maxKm / 100) + 0.1;
    for (var i = 1; i < linhas.length; i++) {
      var c = linhas[i].split(",");
      var lat = num(c[idx.lat]), lon = num(c[idx.lon]);
      if (lat === null || lon === null) continue;
      // Filtro rápido por caixa antes de Haversine
      var estado = idx.estado !== undefined && c[idx.estado] ? c[idx.estado].trim() : "";
      var estadoMaiusculo = estado.toUpperCase();
      var ufSp = estadoMaiusculo === "SP" || estadoMaiusculo === "SÃO PAULO" || estadoMaiusculo === "SAO PAULO";

      var foraDaCaixa = Math.abs(lat - LAT_CAJAMAR) > limiteGrausLat || Math.abs(lon - LON_CAJAMAR) > limiteGrausLon;
      if (foraDaCaixa && !ufSp) continue;

      var dist = distanciaKm(LAT_CAJAMAR, LON_CAJAMAR, lat, lon);
      if (dist > maxKm && !ufSp) continue;

      var dhBruto = idx.data_hora_gmt !== undefined ? c[idx.data_hora_gmt] : (idx.data !== undefined ? c[idx.data] : "");
      var dt = converterDataGmt(dhBruto);
      var sat = c[idx.satelite] ? c[idx.satelite].trim() : "";
      var mun = idx.municipio !== undefined && c[idx.municipio] ? c[idx.municipio].trim() : (dist <= 10 ? "Cajamar / Limítrofe" : "Região (" + Math.round(dist) + " km)");
      var munId = idx.municipio_id !== undefined ? Number(c[idx.municipio_id]) : null;
      var emCajamar = munId === IBGE_CAJAMAR || /^CAJAMAR$/i.test(mun) || dist <= 8;

      out.push({
        id: (idx.id !== undefined && c[idx.id] ? c[idx.id].trim() : (lat.toFixed(4) + "_" + lon.toFixed(4) + "_" + sat + "_" + (dt.ts || i))),
        lat: lat,
        lon: lon,
        ts: dt.ts,
        dataHoraBrt: dt.brt,
        satelite: sat,
        grupoSat: grupoSatelite(sat),
        rotuloSat: rotuloSatelite(sat),
        municipio: mun,
        estado: estado || "SP",
        municipioId: munId,
        emCajamar: emCajamar,
        distanciaKm: Math.round(dist * 10) / 10,
        diasSemChuva: idx.numero_dias_sem_chuva !== undefined ? num(c[idx.numero_dias_sem_chuva]) : null,
        precipitacao: idx.precipitacao !== undefined ? num(c[idx.precipitacao]) : null,
        riscoFogo: idx.risco_fogo !== undefined ? num(c[idx.risco_fogo]) : null,
        bioma: idx.bioma !== undefined && c[idx.bioma] ? c[idx.bioma].trim() : "",
        frp: idx.frp !== undefined ? num(c[idx.frp]) : null
      });
    }
    return out;
  }

  // Mescla e remove duplicatas (mesmo satélite, coordenada muito próxima e horário próximo)
  function consolidarFocos(lista) {
    var vistos = {};
    var unicos = [];
    lista.forEach(function (f) {
      var chave = f.satelite + ":" + f.lat.toFixed(3) + ":" + f.lon.toFixed(3) + ":" + (f.dataHoraBrt || "").slice(0, 13);
      if (vistos[chave]) return;
      vistos[chave] = true;
      unicos.push(f);
    });
    unicos.sort(function (a, b) {
      if (a.emCajamar !== b.emCajamar) return a.emCajamar ? -1 : 1;
      if (a.distanciaKm !== b.distanciaKm) return a.distanciaKm - b.distanciaKm;
      return (b.ts || 0) - (a.ts || 0);
    });
    return unicos;
  }

  // Calcula o Risco Meteorológico Local de Fogo para Cajamar (Regra dos 30 + Índice de Angström adaptado)
  function calcularRiscoFogoLocal(dadosClima) {
    if (!dadosClima) return null;
    var temp = typeof dadosClima.temp === "number" ? dadosClima.temp : null;
    var umid = typeof dadosClima.umid === "number" ? dadosClima.umid : null;
    var vento = typeof dadosClima.vento === "number" ? dadosClima.vento : 0;
    var rajada = typeof dadosClima.rajada === "number" ? dadosClima.rajada : vento;
    var chuva24h = typeof dadosClima.chuva24h === "number" ? dadosClima.chuva24h : 0;

    if (temp === null || umid === null) return null;

    var vRef = Math.max(vento, rajada * 0.75);
    // Índice de Angström: I = (U / 20) + ((27 - T) / 10). Valores < 2.5 indicam condição favorável ao fogo.
    var angstrom = (umid / 20) + ((27 - temp) / 10);
    if (chuva24h >= 5) angstrom += 1.5;
    else if (chuva24h >= 1) angstrom += 0.6;
    if (vRef >= 30) angstrom -= 0.5;

    var regra30 = (temp >= 30 ? 1 : 0) + (umid <= 30 ? 1 : 0) + (Math.max(vento, rajada) >= 30 ? 1 : 0);

    var nivel, classe, recomendacao;
    if (chuva24h >= 10 || (umid >= 75 && temp < 24)) {
      nivel = "Baixo";
      classe = "ok";
      recomendacao = "Umidade elevada ou chuva recente reduz a propagação de queimadas.";
    } else if (regra30 === 3 || angstrom < 1.5 || umid <= 20) {
      nivel = "Crítico (Alerta de Queimada)";
      classe = "v";
      recomendacao = "Condição extrema (Regra dos 30 / baixa umidade). Risco severo de propagação rápida de fogo em vegetação.";
    } else if (regra30 >= 2 || angstrom < 2.2 || umid <= 30) {
      nivel = "Alto";
      classe = "l";
      recomendacao = "Ar seco e/ou vento favorecem ignição e espalhamento rápido. Atenção redobrada em áreas de mata e pastagem.";
    } else if (angstrom < 2.8 || umid <= 45) {
      nivel = "Moderado";
      classe = "am";
      recomendacao = "Condição intermediária: monitorar focos de satélite e queimas irregulares.";
    } else {
      nivel = "Baixo";
      classe = "ok";
      recomendacao = "Condições meteorológicas atuais com baixo potencial de propagação.";
    }

    return {
      nivel: nivel,
      classe: classe,
      regra30: regra30,
      angstrom: Math.round(angstrom * 100) / 100,
      temp: temp,
      umid: umid,
      ventoMax: Math.round(Math.max(vento, rajada)),
      recomendacao: recomendacao
    };
  }

  function datasRecentesUtc() {
    var agora = new Date();
    var ontem = new Date(agora.getTime() - 86400000);
    function fmt(d) {
      return d.getUTCFullYear() +
        String(d.getUTCMonth() + 1).padStart(2, "0") +
        String(d.getUTCDate()).padStart(2, "0");
    }
    return [fmt(agora), fmt(ontem)];
  }

  async function buscarTexto(url, timeoutMs) {
    var ctl = new AbortController();
    var t = setTimeout(function () { ctl.abort(); }, timeoutMs || 15000);
    try {
      var r = await fetch(url, { signal: ctl.signal, cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.text();
    } finally {
      clearTimeout(t);
    }
  }

  // Coleta focos do INPE (últimos 2 arquivos diários disponíveis no servidor + últimos arquivos de 10 min)
  async function coletarInpeAoVivo() {
    var todos = [];
    var lidos = 0;
    var arqsDiarios = [];

    try {
      var htmlDiario = await buscarTexto(URL_DIARIO_BASE, 10000);
      var rxD = /href="([^"]*focos_diario_br_\d{8}\.csv)"/g, md;
      while ((md = rxD.exec(htmlDiario)) !== null) arqsDiarios.push(md[1]);
    } catch (e) {}

    var ultimosDiarios = arqsDiarios.length
      ? arqsDiarios.slice(-2)
      : datasRecentesUtc().map(function (d) { return "focos_diario_br_" + d + ".csv"; });

    for (var i = 0; i < ultimosDiarios.length; i++) {
      try {
        var nomeArq = ultimosDiarios[i];
        var urlD = nomeArq.indexOf("http") === 0 ? nomeArq : URL_DIARIO_BASE + nomeArq;
        var txt = await buscarTexto(urlD, 15000);
        todos = todos.concat(lerCsvFocos(txt, 300));
        lidos++;
      } catch (e) {}
    }

    // Também tenta os últimos 3 arquivos de 10 min (tempo real)
    try {
      var html10 = await buscarTexto(URL_10MIN_BASE, 10000);
      var arq10 = [];
      var rx = /href="([^"]*focos_10min_[^"]+\.csv)"/g, m;
      while ((m = rx.exec(html10)) !== null) arq10.push(m[1]);
      var ultimos = arq10.slice(-3);
      for (var j = 0; j < ultimos.length; j++) {
        try {
          var u10 = ultimos[j].indexOf("http") === 0 ? ultimos[j] : URL_10MIN_BASE + ultimos[j];
          var t10 = await buscarTexto(u10, 8000);
          todos = todos.concat(lerCsvFocos(t10, 300));
          lidos++;
        } catch (e2) {}
      }
    } catch (e) {}

    if (!lidos) throw new Error("servidor de focos do INPE indisponível no momento");
    var focos = consolidarFocos(todos);
    return {
      coletadoEm: new Date().toISOString(),
      fonte: "INPE BDQueimadas (DataServer COIDS — 10 min + Diário)",
      focos: focos
    };
  }

  w.Queimadas = {
    SATELITES: SATELITES,
    distanciaKm: distanciaKm,
    grupoSatelite: grupoSatelite,
    rotuloSatelite: rotuloSatelite,
    lerCsvFocos: lerCsvFocos,
    consolidarFocos: consolidarFocos,
    calcularRiscoFogoLocal: calcularRiscoFogoLocal,
    coletarInpeAoVivo: coletarInpeAoVivo
  };
})(typeof window !== "undefined" ? window : globalThis);
