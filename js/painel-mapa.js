// Painel: mapa operacional (Leaflet), radar, satélites, avisos do INMET, focos, pontos de Cajamar, GPS e tela cheia.
(function () {
  "use strict";
  var P = window.Painel, $ = P.$, el = P.el, hm = P.hm, dh = P.dh, fdia = P.fdia, fhora = P.fhora, num = P.num, fail = P.fail, aviso = P.aviso;
  var LAT = P.LAT, LON = P.LON;

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

  var map = null, frames = [], layers = [], cur = 0, timer = null, host = "", pastCount = 0;
  var layerFogo = null, layerPontos = null, camadaGoesGeo = null, camadaGoesIr = null, camadaViirsSnpp = null, camadaViirsNoaa20 = null, camadaTermicaNasa = null;
  var modoMapaAtual = "radar";

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
      } else if (P.desliz.ultima() && pt.tipo.indexOf("Encosta") > -1) {
        avDesl = P.desliz.ultima();
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
      btnOc.onclick = function () { P.desliz.abrirOcorrencia(pt.nome); };
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

  P.mapa = {
    carregarRadar: radar, desenharFocos: desenharFocosNoMapa, atualizarPontos: atualizarPontosCajamarNoMapa,
    definirAvisos: function (dentro, proximos) { avisosMapa = dentro; avisosProximosMapa = proximos; desenharAvisosNoMapa(); }
  };
})();
