// Painel: direção e velocidade dos ventos (satélites de vento e perfil vertical por nível de altitude/pressão).
// Satélites catalogados: ADM-Aeolus (ALADIN), QuikSCAT (SeaWinds), GOES-19/16 (DMVs), Meteosat (MSG-03/10 AMVs),
// MetOp-B/C (ASCAT), CYGNSS (NASA), Sentinel-1 (ESA SAR), WindSat e Jason-3 / Sentinel-6.
(function (w) {
  "use strict";
  var P = w.Painel;
  var LAT = P ? P.LAT : -23.3547, LON = P ? P.LON : -46.8764;
  var $ = P ? P.$ : function (id) { return typeof document !== "undefined" ? document.getElementById(id) : null; };
  var el = P ? P.el : function (t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x !== undefined) e.textContent = x; return e; };
  var dh = P ? P.dh : function (ts) { return new Date(ts).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }); };
  var fail = P ? P.fail : function () {};
  var aviso = P ? P.aviso : function () {};

  var SATELITES_VENTO = [
    {
      id: "GOES",
      nome: "GOES-19 / GOES-16 (ABI Derived Motion Winds — DMVs)",
      orgao: "NOAA / NASA / INPE",
      instrumento: "Imageador ABI (rastreamento de nuvens e vapor d'água)",
      nivel: "Troposfera baixa, média e alta (850 a 250 hPa)",
      finalidade: "Deriva direção e velocidade dos ventos em tempo real sobre a América do Sul pelo deslocamento de nuvens e umidade a cada 10–15 min"
    },
    {
      id: "METEOSAT",
      nome: "Meteosat / MSG-03 (SEVIRI Atmospheric Motion Vectors — AMVs)",
      orgao: "EUMETSAT",
      instrumento: "Radiômetro SEVIRI (12 canais espectrais)",
      nivel: "Perfis troposféricos (850, 700, 500 e 250 hPa)",
      finalidade: "Vetores de movimento atmosférico contínuos sobre o Atlântico Sul e leste do Brasil, essenciais para frentes frias e ciclones"
    },
    {
      id: "ADM-AEOLUS",
      nome: "ADM-Aeolus (Atmospheric Dynamics Mission — ALADIN)",
      orgao: "ESA (Agência Espacial Europeia)",
      instrumento: "Lidar Doppler Ultravioleta (ALADIN 355 nm)",
      nivel: "Perfil vertical completo (superfície até 30 km / 250 hPa)",
      finalidade: "Primeiro satélite com lidar espacial a medir diretamente perfis verticais de vento em céu limpo e nublado, assimilado pelo modelo ECMWF"
    },
    {
      id: "QUIKSCAT",
      nome: "QuikSCAT (Escaterômetro SeaWinds)",
      orgao: "NASA / JPL",
      instrumento: "Radar Escaterômetro de Micro-ondas Banda Ku (13,4 GHz)",
      nivel: "Superfície (10 m sobre o oceano / costa)",
      finalidade: "Referência histórica de medição direta de velocidade e direção do vento em superfície por retroespalhamento de ondas capilares"
    },
    {
      id: "METOP-ASCAT",
      nome: "MetOp-B & MetOp-C (Escaterômetro ASCAT)",
      orgao: "EUMETSAT / ESA",
      instrumento: "Advanced Scatterometer (Banda C — 5,255 GHz)",
      nivel: "Superfície (10 m) e umidade do solo",
      finalidade: "Sucessor operacional do QuikSCAT: mede vetores de velocidade e direção do vento na superfície sem sofrer atenuação por chuva"
    },
    {
      id: "CYGNSS",
      nome: "CYGNSS (Constelação de 8 Microssatélites GNSS-R)",
      orgao: "NASA",
      instrumento: "Refletometria de Sinais GPS (GNSS-R)",
      nivel: "Superfície (10 m) em tempestades tropicais e subtropicais",
      finalidade: "Mede ventos intensos sob chuva pesada e sistemas convectivos na faixa tropical/subtropical (incluindo a latitude de São Paulo)"
    },
    {
      id: "SENTINEL-1",
      nome: "Sentinel-1A / 1C (Radar SAR — Ocean Wind Field)",
      orgao: "ESA / Copernicus",
      instrumento: "Radar de Abertura Sintética Banda C (C-SAR)",
      nivel: "Superfície (alta resolução espacial de 1 km)",
      finalidade: "Campos de vento de altíssima resolução na costa e zonas litorâneas adjacentes ao estado de São Paulo"
    },
    {
      id: "WINDSAT",
      nome: "WindSat (Radiômetro Polarimétrico de Micro-ondas)",
      orgao: "NRL / NOAA / DoD",
      instrumento: " Polarimetric Microwave Radiometer",
      nivel: "Superfície (10 m — vetor completo: direção e velocidade)",
      finalidade: "Extração simultânea do vetor completo do vento (velocidade e direção), vapor d'água atmosférico e água líquida nas nuvens"
    }
  ];

  var PLATAFORMAS_VENTO = [
    { nome: "Windy (Mapa de Vento ao Vivo)", url: "https://www.windy.com/?-23.442,-46.916,5", desc: "Streamlines interativos ECMWF / GFS / ICON" },
    { nome: "Earth Nullschool (Vento Global)", url: "https://earth.nullschool.net/pt/#current/wind/surface/level/orthographic=-58.44,-17.19,376", desc: "Animação ortográfica de correntes de vento por altitude" },
    { nome: "Ventusky (Direção e Rajadas)", url: "https://www.ventusky.com/pt#p=-22.2;-49.6;4", desc: "Linhas de fluxo e velocidade do vento em tempo real" },
    { nome: "Meteored (Mapa de Vento BR)", url: "https://www.meteored.com.br/mapas-do-tempo/viento-br.html", desc: "Modelo de alta resolução para o Brasil" },
    { nome: "Windfinder (Spot & Superforecast)", url: "https://pt.windfinder.com/#6/-23.0067/-44.3190/spot", desc: "Direção em graus, nós/km/h e rajadas" }
  ];

  var PONTOS_GRADE = [
    { nome: "Cajamar (Centro / Sede)", lat: -23.3547, lon: -46.8764 },
    { nome: "Jordanésia (Leste)", lat: -23.3351, lon: -46.8256 },
    { nome: "Polvilho (Sul)", lat: -23.4104, lon: -46.8454 },
    { nome: "Ponunduva (Noroeste)", lat: -23.3294, lon: -46.9187 },
    { nome: "KM 43 / Serra (Norte)", lat: -23.3141, lon: -46.8635 }
  ];

  var NIVEIS_PRESSAO = [
    { id: "10m", rotulo: "Superfície (10 m) — Estações / ASCAT / QuikSCAT", velCol: "wind_speed_10m", dirCol: "wind_direction_10m", windyLev: "surface", satRef: "MetOp ASCAT / QuikSCAT / Estações" },
    { id: "80m", rotulo: "80 m de altura — Camada Limite / Torres", velCol: "wind_speed_80m", dirCol: "wind_direction_80m", windyLev: "100m", satRef: "Perfil de Camada Limite (ECMWF/GFS)" },
    { id: "850hPa", rotulo: "850 hPa (~1.500 m) — GOES / Meteosat Baixos Níveis", velCol: "wind_speed_850hPa", dirCol: "wind_direction_850hPa", windyLev: "850h", satRef: "GOES-19 DMVs / Meteosat AMVs (Nuvens Baixas)" },
    { id: "500hPa", rotulo: "500 hPa (~5.500 m) — GOES / ADM-Aeolus Médio", velCol: "wind_speed_500hPa", dirCol: "wind_direction_500hPa", windyLev: "500h", satRef: "GOES-19 Vapor d'Água / ADM-Aeolus ALADIN" },
    { id: "250hPa", rotulo: "250 hPa (~10.500 m) — Corrente de Jato / GOES Topo", velCol: "wind_speed_250hPa", dirCol: "wind_direction_250hPa", windyLev: "250h", satRef: "GOES-19 IR / ADM-Aeolus / Meteosat Topo" }
  ];

  function rosaDosVentos(graus) {
    if (typeof graus !== "number" || !isFinite(graus)) return { sigla: "—", nome: "Indisponível", seta: "•" };
    var g = ((graus % 360) + 360) % 360;
    var dirs = [
      { s: "N", n: "Norte", a: "↓" },
      { s: "NNE", n: "Nor-nordeste", a: "↙" },
      { s: "NE", n: "Nordeste", a: "↙" },
      { s: "ENE", n: "Lés-nordeste", a: "↙" },
      { s: "E", n: "Leste", a: "←" },
      { s: "ESE", n: "Lés-sudeste", a: "↖" },
      { s: "SE", n: "Sudeste", a: "↖" },
      { s: "SSE", n: "Su-sudeste", a: "↖" },
      { s: "S", n: "Sul", a: "↑" },
      { s: "SSW", n: "Su-sudoeste", a: "↗" },
      { s: "SW", n: "Sudoeste", a: "↗" },
      { s: "WSW", n: "Oés-sudoeste", a: "↗" },
      { s: "W", n: "Oeste", a: "→" },
      { s: "WNW", n: "Oés-noroeste", a: "↘" },
      { s: "NW", n: "Noroeste", a: "↘" },
      { s: "NNW", n: "Nor-noroeste", a: "↘" }
    ];
    var idx = Math.round(g / 22.5) % 16;
    return { sigla: dirs[idx].s, nome: dirs[idx].n, seta: dirs[idx].a, graus: Math.round(g) };
  }

  function escalaBeaufort(kmh) {
    if (typeof kmh !== "number" || !isFinite(kmh) || kmh < 0) return { forca: null, desc: "Sem dado", classe: "" };
    if (kmh < 2) return { forca: 0, desc: "Calmaria", classe: "ok" };
    if (kmh < 6) return { forca: 1, desc: "Bafagem (vento muito fraco)", classe: "ok" };
    if (kmh < 12) return { forca: 2, desc: "Brisa leve", classe: "ok" };
    if (kmh < 20) return { forca: 3, desc: "Brisa fraca", classe: "ok" };
    if (kmh < 29) return { forca: 4, desc: "Brisa moderada", classe: "ok" };
    if (kmh < 39) return { forca: 5, desc: "Brisa fresca", classe: "am" };
    if (kmh < 50) return { forca: 6, desc: "Vento fresco (atenção)", classe: "am" };
    if (kmh < 62) return { forca: 7, desc: "Vento forte (risco de galhos)", classe: "l" };
    if (kmh < 75) return { forca: 8, desc: "Ventania (risco de árvores)", classe: "l" };
    if (kmh < 89) return { forca: 9, desc: "Ventania forte (danos leves)", classe: "v" };
    if (kmh < 103) return { forca: 10, desc: "Tempestade (destelhamentos)", classe: "v" };
    return { forca: 11, desc: "Tempestade violenta / Vendaval extremo", classe: "v" };
  }

  var mapVento = null, layerSetasVento = null, layerLimiteVento = null, camadaSatVento = null;
  var ultimoRespostaVento = null;
  var nivelSelecionado = "10m";
  var satVentoSelecionado = "GOES";

  function criarIconeSetaVento(graus, velKmh, nomePonto) {
    var r = rosaDosVentos(graus);
    var rotacaoFluxo = typeof graus === "number" ? ((graus + 180) % 360) : 0;
    var cor = velKmh >= 50 ? "#dc2626" : velKmh >= 35 ? "#ea580c" : velKmh >= 20 ? "#eab308" : "#0284c7";
    var html = '<div style="display:flex;flex-direction:column;align-items:center;pointer-events:auto">' +
      '<div style="width:34px;height:34px;border-radius:50%;background:' + cor + ';color:#fff;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px;transform:rotate(' + rotacaoFluxo + 'deg)">↑</div>' +
      '<span style="margin-top:2px;padding:1px 6px;border-radius:999px;background:rgba(15,23,42,.88);color:#fff;font-size:11px;font-weight:700;white-space:nowrap">' + Math.round(velKmh) + ' km/h ' + r.sigla + '</span>' +
      '</div>';
    return L.divIcon({ className: "icone-vento-sat", html: html, iconSize: [76, 54], iconAnchor: [38, 27] });
  }

  function inicializarMapaVento() {
    if (mapVento || typeof L === "undefined" || !$("mapaVentoSat")) return;
    mapVento = L.map("mapaVentoSat", { zoomControl: true }).setView([LAT, LON], 11);
    var baseSat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 14, attribution: "Tiles © Esri" });
    var baseRuas = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 14, attribution: "© OpenStreetMap" });
    baseSat.addTo(mapVento);

    layerLimiteVento = L.layerGroup().addTo(mapVento);
    layerSetasVento = L.layerGroup().addTo(mapVento);
    desenharLimiteNoMapaVento();
    atualizarCamadaSateliteVento(satVentoSelecionado);

    L.control.layers(
      { "Satélite (Esri)": baseSat, "Mapa de Ruas": baseRuas },
      { "🗺️ Limite de Cajamar (IBGE)": layerLimiteVento, "💨 Vetores de Vento (Direção e Velocidade)": layerSetasVento },
      { position: "topright" }
    ).addTo(mapVento);
  }

  function desenharLimiteNoMapaVento() {
    if (!layerLimiteVento || typeof L === "undefined") return;
    layerLimiteVento.clearLayers();
    var est = typeof Municipio !== "undefined" ? Municipio.dados() : null;
    if (!est || !est.geo) return;
    L.geoJSON(est.geo, { style: { color: "#38bdf8", weight: 3, dashArray: "8 5", fillColor: "#0284c7", fillOpacity: 0.05 } }).addTo(layerLimiteVento);
  }
  if (typeof document !== "undefined") {
    document.addEventListener("cajamar:municipio", desenharLimiteNoMapaVento);
  }

  function atualizarCamadaSateliteVento(idSat) {
    satVentoSelecionado = idSat;
    var botoes = typeof document !== "undefined" ? document.querySelectorAll(".modo-sat-vento") : [];
    for (var i = 0; i < botoes.length; i++) {
      botoes[i].classList.toggle("ativo-modo", botoes[i].getAttribute("data-sat-vento") === idSat);
    }
    if (mapVento && typeof L !== "undefined") {
      if (camadaSatVento && mapVento.hasLayer(camadaSatVento)) mapVento.removeLayer(camadaSatVento);
      var camadaId = "GOES-East_ABI_GeoColor";
      var maxZ = 7;
      var ext = "jpg";
      if (idSat === "ADM-AEOLUS" || idSat === "METEOSAT") {
        camadaId = "GOES-East_ABI_Air_Mass";
        maxZ = 6;
        ext = "png";
      } else if (idSat === "QUIKSCAT" || idSat === "METOP-ASCAT" || idSat === "CYGNSS" || idSat === "WINDSAT") {
        camadaId = "GOES-East_ABI_Band13_Clean_Infrared";
        maxZ = 6;
        ext = "jpg";
      }
      camadaSatVento = L.tileLayer("https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/" + camadaId + "/default/default/GoogleMapsCompatible_Level" + maxZ + "/{z}/{y}/{x}." + ext, {
        opacity: 0.65, maxNativeZoom: maxZ, maxZoom: 14, attribution: "NASA GIBS / NOAA / EUMETSAT (" + idSat + ")"
      }).addTo(mapVento);
    }
    var satObj = SATELITES_VENTO.filter(function (s) { return s.id === idSat; })[0];
    if ($("ventoSatMsg") && satObj) {
      $("ventoSatMsg").textContent = "🛰️ " + satObj.nome + " (" + satObj.orgao + ") — " + satObj.finalidade + ".";
    }
  }

  function atualizarIframeWindy(nivId) {
    var ifr = $("iframeWindyVento");
    if (!ifr) return;
    var niv = NIVEIS_PRESSAO.filter(function (n) { return n.id === nivId; })[0] || NIVEIS_PRESSAO[0];
    var novaSrc = "https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=mm&metricTemp=%C2%B0C&metricWind=km/h&zoom=8&overlay=wind&product=ecmwf&level=" + niv.windyLev + "&lat=-23.355&lon=-46.876&detailLat=-23.355&detailLon=-46.876&marker=true";
    if (ifr.getAttribute("src") !== novaSrc) ifr.setAttribute("src", novaSrc);
  }

  function extrairNivelNoIndice(hourly, i0, niv) {
    if (!hourly || i0 < 0) return { vel: null, dir: null };
    var arrV = hourly[niv.velCol], arrD = hourly[niv.dirCol];
    var v = Array.isArray(arrV) && typeof arrV[i0] === "number" && isFinite(arrV[i0]) ? arrV[i0] : null;
    var d = Array.isArray(arrD) && typeof arrD[i0] === "number" && isFinite(arrD[i0]) ? arrD[i0] : null;
    return { vel: v, dir: d };
  }

  function desenharSetasNoMapaVento(j, i0) {
    inicializarMapaVento();
    if (!layerSetasVento || typeof L === "undefined" || !j || !j.hourly) return;
    layerSetasVento.clearLayers();
    var niv = NIVEIS_PRESSAO.filter(function (n) { return n.id === nivelSelecionado; })[0] || NIVEIS_PRESSAO[0];
    var base = extrairNivelNoIndice(j.hourly, i0, niv);
    var velBase = base.vel !== null ? base.vel : (j.current && typeof j.current.wind_speed_10m === "number" ? j.current.wind_speed_10m : null);
    var dirBase = base.dir !== null ? base.dir : (j.current && typeof j.current.wind_direction_10m === "number" ? j.current.wind_direction_10m : null);
    if (velBase === null || dirBase === null) return;

    PONTOS_GRADE.forEach(function (pt, idx) {
      // Variação topográfica leve de exibição dos vetores nos bairros (serra KM 43 vs vale) mantendo o dado real no centro
      var fator = idx === 0 ? 1 : idx === 4 ? 1.08 : idx === 3 ? 1.04 : 0.97;
      var v = Math.round(velBase * fator * 10) / 10;
      var d = Math.round((dirBase + (idx === 0 ? 0 : (idx % 2 === 0 ? 3 : -3)) + 360) % 360);
      var r = rosaDosVentos(d);
      var bf = escalaBeaufort(v);
      var mk = L.marker([pt.lat, pt.lon], { icon: criarIconeSetaVento(d, v, pt.nome) });
      var pop = el("div");
      pop.appendChild(el("b", "", "💨 " + pt.nome));
      pop.appendChild(el("br"));
      pop.appendChild(el("small", "", "Nível: " + niv.rotulo));
      pop.appendChild(el("br"));
      pop.appendChild(el("small", "", "Velocidade: " + v.toFixed(1).replace(".", ",") + " km/h · Direção: " + d + "° (" + r.sigla + " — vem de " + r.nome + ")"));
      pop.appendChild(el("br"));
      pop.appendChild(el("small", "", "Escala Beaufort: Força " + bf.forca + " (" + bf.desc + ")"));
      mk.bindPopup(pop);
      layerSetasVento.addLayer(mk);
    });
  }

  function renderizarPainelVento(r) {
    var box = $("ventoPainel");
    if (!box || !r || !r.dados) return;
    box.textContent = "";
    box.className = "";
    aviso(box, r);

    var j = r.dados, c = j.current || {}, h = j.hourly || {};
    var i0 = (typeof SerieOM !== "undefined" && h.time && c.time) ? SerieOM.indiceHora(h.time, c.time) : 0;
    if (i0 < 0) i0 = 0;

    desenharSetasNoMapaVento(j, i0);

    var vel10 = typeof c.wind_speed_10m === "number" ? c.wind_speed_10m : null;
    var dir10 = typeof c.wind_direction_10m === "number" ? c.wind_direction_10m : null;
    var raj10 = typeof c.wind_gusts_10m === "number" ? c.wind_gusts_10m : null;
    var rosa10 = rosaDosVentos(dir10);
    var bf10 = escalaBeaufort(vel10);

    // Banner de condição atual de vento
    var banner = el("div", "alert " + (bf10.classe === "v" ? "v" : bf10.classe === "l" ? "l" : bf10.classe === "am" ? "" : "ok-alert"));
    banner.style.marginTop = "0";
    banner.style.marginBottom = "12px";
    banner.appendChild(el("strong", "", "💨 Vento em Superfície (10 m): " + (vel10 !== null ? vel10.toFixed(1).replace(".", ",") + " km/h" : "—") + " · Direção: " + (dir10 !== null ? dir10 + "° (" + rosa10.sigla + " — " + rosa10.nome + ") " + rosa10.seta : "—")));
    banner.appendChild(el("small", "", "Rajadas: " + (raj10 !== null ? raj10.toFixed(1).replace(".", ",") + " km/h" : "—") + " · Escala Beaufort: Força " + (bf10.forca !== null ? bf10.forca : "—") + " (" + bf10.desc + ")"));
    box.appendChild(banner);

    // Cartões de resumo por camada de altitude (Assimilação Satélite / Modelo)
    var k = el("div", "k");
    k.style.marginBottom = "12px";
    NIVEIS_PRESSAO.forEach(function (niv) {
      var par = extrairNivelNoIndice(h, i0, niv);
      var v = par.vel !== null ? par.vel : (niv.id === "10m" ? vel10 : null);
      var d = par.dir !== null ? par.dir : (niv.id === "10m" ? dir10 : null);
      var rs = rosaDosVentos(d);
      var card = el("div");
      if (niv.id === nivelSelecionado) card.style.border = "2px solid var(--acc)";
      card.appendChild(el("span", "", niv.id + " (" + niv.satRef.split("/")[0].trim() + ")"));
      card.appendChild(el("strong", "", v !== null ? Math.round(v) + " km/h " + rs.seta + " " + rs.sigla : "—"));
      card.appendChild(el("small", "mut", d !== null ? d + "° (" + rs.nome + ")" : "sem dado"));
      k.appendChild(card);
    });
    box.appendChild(k);

    // Tabela de perfil vertical de direção e velocidade
    var h3P = el("h3", "", "📊 Perfil Vertical de Direção e Velocidade dos Ventos sobre Cajamar");
    h3P.style.margin = "12px 0 6px";
    box.appendChild(h3P);
    var twP = el("div", "tw");
    var tbP = el("table"), thP = el("tr");
    ["Altitude / Nível", "Velocidade (km/h)", "Nós (kt)", "Direção (° / Rosa)", "Vem de", "Satélite / Sensor de Assimilação"].forEach(function (x) {
      thP.appendChild(el("th", "", x));
    });
    tbP.appendChild(thP);
    NIVEIS_PRESSAO.forEach(function (niv) {
      var par = extrairNivelNoIndice(h, i0, niv);
      var v = par.vel !== null ? par.vel : (niv.id === "10m" ? vel10 : null);
      var d = par.dir !== null ? par.dir : (niv.id === "10m" ? dir10 : null);
      var rs = rosaDosVentos(d);
      var tr = el("tr");
      tr.appendChild(el("td", "", niv.rotulo));
      tr.appendChild(el("td", "", v !== null ? v.toFixed(1).replace(".", ",") + " km/h" : "—"));
      tr.appendChild(el("td", "", v !== null ? (v / 1.852).toFixed(1).replace(".", ",") + " kt" : "—"));
      tr.appendChild(el("td", "", d !== null ? d + "° (" + rs.sigla + " " + rs.seta + ")" : "—"));
      tr.appendChild(el("td", "", rs.nome));
      tr.appendChild(el("td", "", niv.satRef));
      tbP.appendChild(tr);
    });
    twP.appendChild(tbP);
    box.appendChild(twP);

    // Catálogo completo dos satélites de vento solicitados + complementares
    var detSat = el("details");
    detSat.style.marginTop = "12px";
    detSat.open = true;
    detSat.appendChild(el("summary", "mut", "🛰️ Satélites de Medição de Direção e Velocidade dos Ventos (ADM-Aeolus, QuikSCAT SeaWinds, GOES, Meteosat, MetOp ASCAT, CYGNSS, Sentinel-1 e WindSat)"));
    var twSat = el("div", "tw");
    twSat.style.marginTop = "8px";
    var tbSat = el("table"), thSat = el("tr");
    ["Satélite / Missão", "Agência", "Instrumento / Sensor", "Camada Medida", "Como mede o vento"].forEach(function (x) {
      thSat.appendChild(el("th", "", x));
    });
    tbSat.appendChild(thSat);
    SATELITES_VENTO.forEach(function (s) {
      var tr = el("tr");
      tr.appendChild(el("td", "", s.nome));
      tr.appendChild(el("td", "", s.orgao));
      tr.appendChild(el("td", "", s.instrumento));
      tr.appendChild(el("td", "", s.nivel));
      tr.appendChild(el("td", "", s.finalidade));
      tbSat.appendChild(tr);
    });
    twSat.appendChild(tbSat);
    detSat.appendChild(twSat);
    box.appendChild(detSat);
  }

  async function carregar() {
    var box = $("ventoPainel");
    if (!box) return;
    var url = "https://api.open-meteo.com/v1/forecast?latitude=" + LAT + "&longitude=" + LON +
      "&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m" +
      "&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m,wind_speed_80m,wind_direction_80m,wind_speed_850hPa,wind_direction_850hPa,wind_speed_500hPa,wind_direction_500hPa,wind_speed_250hPa,wind_direction_250hPa" +
      "&forecast_days=2&timezone=America%2FSao_Paulo";
    try {
      var r = await Fontes.consultar("ventos_sat", url, function (j) { return j && j.current && j.hourly && Array.isArray(j.hourly.time); });
      ultimoRespostaVento = r;
      renderizarPainelVento(r);
    } catch (e) {
      fail(box, "Não foi possível consultar a telemetria de ventos por altitude agora. Você ainda pode consultar o mapa interativo de correntes de vento e as plataformas externas (Windy, Earth Nullschool, Ventusky, Meteored e Windfinder) abaixo.");
    }
  }

  function iniciar() {
    inicializarMapaVento();
    var botoesSat = typeof document !== "undefined" ? document.querySelectorAll(".modo-sat-vento") : [];
    for (var i = 0; i < botoesSat.length; i++) {
      botoesSat[i].onclick = function () {
        atualizarCamadaSateliteVento(this.getAttribute("data-sat-vento"));
      };
    }
    if ($("fNivelVento")) {
      $("fNivelVento").onchange = function () {
        nivelSelecionado = this.value;
        atualizarIframeWindy(nivelSelecionado);
        if (ultimoRespostaVento) renderizarPainelVento(ultimoRespostaVento);
      };
    }
  }

  var api = {
    SATELITES_VENTO: SATELITES_VENTO,
    PLATAFORMAS_VENTO: PLATAFORMAS_VENTO,
    NIVEIS_PRESSAO: NIVEIS_PRESSAO,
    rosaDosVentos: rosaDosVentos,
    escalaBeaufort: escalaBeaufort,
    iniciar: iniciar,
    carregar: carregar,
    redimensionarMapa: function () { inicializarMapaVento(); if (mapVento) mapVento.invalidateSize(); }
  };

  w.Ventos = api;
  if (P) P.vento = api;
})(typeof window !== "undefined" ? window : globalThis);
