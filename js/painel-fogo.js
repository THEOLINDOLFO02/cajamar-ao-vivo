// Painel: focos de calor (INPE), condição meteorológica para fogo e tabela de satélites.
(function () {
  "use strict";
  var P = window.Painel, $ = P.$, el = P.el, hm = P.hm, dh = P.dh, fdia = P.fdia, fhora = P.fhora, num = P.num, fail = P.fail, aviso = P.aviso;
  var notificarRisco = P.notificarRisco;
  var LAT = P.LAT, LON = P.LON;
  var ultimoClimaFogo = null;
  var dadosQueimadasAtual = null;
  var mapFogo = null, layerFocosSat = null, layerLimiteFogo = null, camadasSatFogo = {}, camadaAtivaFogo = null, camadaTermicaFogo = null;

  var INFO_SAT_IMG = {
    "termica_todos": "Satélite de Fogo ativo: Anomalias Térmicas NASA (VIIRS 375m NOAA-20/21/S-NPP + MODIS AQUA/TERRA) + Focos INPE BDQueimadas.",
    "AQUA_M-M": "Satélite AQUA_M-M (MODIS Manhã) + Anomalias Térmicas AQUA (NASA GIBS) e focos detectados pelo AQUA_M-M no INPE.",
    "AQUA_M-T": "Satélite AQUA_M-T (MODIS Tarde ~13h30) + Anomalias Térmicas AQUA (NASA GIBS) e focos detectados pelo AQUA_M-T no INPE.",
    "TERRA_M-M": "Satélite TERRA_M-M (MODIS Manhã ~10h30) + Anomalias Térmicas TERRA (NASA GIBS) e focos detectados pelo TERRA_M-M no INPE.",
    "TERRA_M-T": "Satélite TERRA_M-T (MODIS Tarde/Noite) + Anomalias Térmicas TERRA (NASA GIBS) e focos detectados pelo TERRA_M-T no INPE.",
    "GOES-19": "Satélite GOES-19 / GOES-East ABI Fire Temperature (Temperatura de Fogo em tempo real) + GeoColor e focos GOES-19 no INPE.",
    "NOAA-20": "Satélite NOAA-20 (VIIRS 375 m TrueColor + Anomalias Térmicas NASA GIBS) e focos detectados pelo NOAA-20 no INPE.",
    "NOAA-21": "Satélite NOAA-21 (VIIRS 375 m TrueColor + Anomalias Térmicas NASA GIBS) e focos detectados pelo NOAA-21 no INPE.",
    "METOP-B": "Satélite METOP-B (EUMETSAT AVHRR) — focos de calor detectados na passagem matinal/noturna do METOP-B sobre a região.",
    "METOP-C": "Satélite METOP-C (EUMETSAT AVHRR) — focos de calor detectados na passagem matinal/noturna do METOP-C sobre a região.",
    "MSG-03": "Satélite MSG-03 (EUMETSAT Meteosat SEVIRI) — vigilância contínua de focos de calor e radiação térmica no INPE."
  };

  function inicializarMapaFogo() {
    if (mapFogo || typeof L === "undefined" || !$("mapaFogo")) return;
    mapFogo = L.map("mapaFogo", { zoomControl: true }).setView([LAT, LON], 9);
    var baseSat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 14, attribution: "Tiles © Esri" });
    var baseRuas = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 14, attribution: "© OpenStreetMap" });
    baseSat.addTo(mapFogo);

    var gibsTile = function (id, nivel, ext, op, atrib) {
      return L.tileLayer("https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/" + id + "/default/default/GoogleMapsCompatible_Level" + nivel + "/{z}/{y}/{x}." + ext, {
        opacity: op, maxNativeZoom: nivel, maxZoom: 14, attribution: "NASA GIBS / " + atrib
      });
    };
    var gibsWms = function (layers, atrib) {
      return L.tileLayer.wms("https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi", {
        layers: layers, format: "image/png", transparent: true, opacity: 0.9, attribution: "NASA GIBS / " + atrib
      });
    };

    camadasSatFogo = {
      "AQUA_M-M": L.layerGroup([
        gibsTile("MODIS_Aqua_CorrectedReflectance_TrueColor", 9, "jpg", 0.82, "Aqua MODIS"),
        gibsWms("MODIS_Aqua_Thermal_Anomalies_All", "Aqua MODIS Thermal Anomalies")
      ]),
      "AQUA_M-T": L.layerGroup([
        gibsTile("MODIS_Aqua_CorrectedReflectance_TrueColor", 9, "jpg", 0.82, "Aqua MODIS"),
        gibsWms("MODIS_Aqua_Thermal_Anomalies_All", "Aqua MODIS Thermal Anomalies")
      ]),
      "TERRA_M-M": L.layerGroup([
        gibsTile("MODIS_Terra_CorrectedReflectance_TrueColor", 9, "jpg", 0.82, "Terra MODIS"),
        gibsWms("MODIS_Terra_Thermal_Anomalies_All", "Terra MODIS Thermal Anomalies")
      ]),
      "TERRA_M-T": L.layerGroup([
        gibsTile("MODIS_Terra_CorrectedReflectance_TrueColor", 9, "jpg", 0.82, "Terra MODIS"),
        gibsWms("MODIS_Terra_Thermal_Anomalies_All", "Terra MODIS Thermal Anomalies")
      ]),
      "GOES-19": L.layerGroup([
        gibsTile("GOES-East_ABI_GeoColor", 7, "jpg", 0.75, "GOES-19 / GOES-East GeoColor"),
        gibsTile("GOES-East_ABI_FireTemp", 7, "png", 0.9, "GOES-19 / GOES-East FireTemp")
      ]),
      "NOAA-20": L.layerGroup([
        gibsTile("VIIRS_NOAA20_CorrectedReflectance_TrueColor", 9, "jpg", 0.82, "NOAA-20 VIIRS"),
        gibsWms("VIIRS_NOAA20_Thermal_Anomalies_375m_All", "NOAA-20 VIIRS 375m")
      ]),
      "NOAA-21": L.layerGroup([
        gibsTile("VIIRS_NOAA21_CorrectedReflectance_TrueColor", 9, "jpg", 0.82, "NOAA-21 VIIRS"),
        gibsWms("VIIRS_NOAA21_Thermal_Anomalies_375m_All", "NOAA-21 VIIRS 375m")
      ]),
      "METOP-B": gibsWms("MODIS_Combined_Thermal_Anomalies_All,VIIRS_SNPP_Thermal_Anomalies_375m_All", "EUMETSAT METOP-B / INPE"),
      "METOP-C": gibsWms("MODIS_Combined_Thermal_Anomalies_All,VIIRS_SNPP_Thermal_Anomalies_375m_All", "EUMETSAT METOP-C / INPE"),
      "MSG-03": L.layerGroup([
        gibsTile("GOES-East_ABI_FireTemp", 7, "png", 0.85, "MSG-03 SEVIRI / Thermal"),
        gibsWms("MODIS_Combined_Thermal_Anomalies_All", "MSG-03 / INPE")
      ])
    };

    camadaTermicaFogo = gibsWms(
      "MODIS_Combined_Thermal_Anomalies_All,VIIRS_SNPP_Thermal_Anomalies_375m_All,VIIRS_NOAA20_Thermal_Anomalies_375m_All,VIIRS_NOAA21_Thermal_Anomalies_375m_All",
      "NASA FIRMS (MODIS AQUA/TERRA + VIIRS NOAA-20/21/S-NPP)"
    ).addTo(mapFogo);
    camadaAtivaFogo = camadaTermicaFogo;

    layerLimiteFogo = L.layerGroup().addTo(mapFogo);
    layerFocosSat = L.layerGroup().addTo(mapFogo);
    desenharLimiteNoMapaFogo();

    L.control.layers(
      { "Satélite (Esri)": baseSat, "Mapa de Ruas": baseRuas },
      { "🗺️ Limite de Cajamar (IBGE)": layerLimiteFogo, "🔥 Focos INPE (BDQueimadas)": layerFocosSat },
      { position: "topright" }
    ).addTo(mapFogo);
  }

  function desenharLimiteNoMapaFogo() {
    if (!layerLimiteFogo || typeof L === "undefined") return;
    layerLimiteFogo.clearLayers();
    var est = typeof Municipio !== "undefined" ? Municipio.dados() : null;
    if (!est || !est.geo) return;
    L.geoJSON(est.geo, { style: { color: "#f97316", weight: 3, dashArray: "8 5", fillColor: "#f97316", fillOpacity: 0.05 } }).addTo(layerLimiteFogo);
  }
  document.addEventListener("cajamar:municipio", desenharLimiteNoMapaFogo);

  function desenharFocosNoMapaFogo(lista) {
    inicializarMapaFogo();
    if (!layerFocosSat || typeof L === "undefined") return;
    layerFocosSat.clearLayers();
    lista.forEach(function (f) {
      var cor = f.emCajamar || f.distanciaKm <= 12 ? "#dc2626" : f.distanciaKm <= 30 ? "#ea580c" : "#f59e0b";
      var raio = f.emCajamar || f.distanciaKm <= 12 ? 8 : 6;
      var m = L.circleMarker([f.lat, f.lon], {
        radius: raio, color: "#7f1d1d", fillColor: cor, fillOpacity: 0.92, weight: 2
      });
      var pop = el("div");
      pop.appendChild(el("b", "", "🔥 Foco de Calor — " + f.municipio));
      pop.appendChild(el("br"));
      pop.appendChild(el("small", "", "Satélite: " + f.rotuloSat + " (" + f.satelite + ")"));
      pop.appendChild(el("br"));
      pop.appendChild(el("small", "", "Detecção (BRT): " + f.dataHoraBrt + " · Distância: " + f.distanciaKm.toFixed(1).replace(".", ",") + " km"));
      if (f.frp !== null || f.riscoFogo !== null) {
        pop.appendChild(el("br"));
        pop.appendChild(el("small", "",
          (f.frp !== null ? "FRP: " + f.frp.toFixed(1) + " MW " : "") +
          (f.riscoFogo !== null ? "· Risco INPE: " + Math.round(f.riscoFogo * 100) + "%" : "")
        ));
      }
      m.bindPopup(pop);
      m.bindTooltip("🔥 " + f.municipio + " · " + f.rotuloSat + " (" + f.distanciaKm.toFixed(0) + " km)", { direction: "top" });
      layerFocosSat.addLayer(m);
    });
  }

  function selecionarSateliteFogo(idSat) {
    inicializarMapaFogo();
    var botoes = document.querySelectorAll(".modo-sat-fogo");
    for (var i = 0; i < botoes.length; i++) {
      botoes[i].classList.toggle("ativo-modo", botoes[i].getAttribute("data-sat-img") === idSat);
    }
    if (mapFogo) {
      if (camadaAtivaFogo && mapFogo.hasLayer(camadaAtivaFogo)) mapFogo.removeLayer(camadaAtivaFogo);
      camadaAtivaFogo = idSat === "termica_todos" ? camadaTermicaFogo : (camadasSatFogo[idSat] || camadaTermicaFogo);
      if (camadaAtivaFogo) camadaAtivaFogo.addTo(mapFogo);
      setTimeout(function () { mapFogo.invalidateSize(); }, 60);
    }
    if ($("fogoSatMsg") && INFO_SAT_IMG[idSat]) {
      $("fogoSatMsg").textContent = INFO_SAT_IMG[idSat];
    }
    if ($("fSatelite")) {
      var novoVal = idSat === "termica_todos" ? "todos" : idSat;
      if ($("fSatelite").value !== novoVal) {
        $("fSatelite").value = novoVal;
        renderizarPainelFogo(false, null);
      }
    }
  }

  function focarFocoNoMapaFogo(f) {
    inicializarMapaFogo();
    if (mapFogo && $("mapaFogo")) {
      var wrap = $("mapaFogo");
      if (wrap.scrollIntoView) wrap.scrollIntoView({ behavior: "smooth", block: "center" });
      mapFogo.setView([f.lat, f.lon], 12);
      layerFocosSat.eachLayer(function (l) {
        if (l.getLatLng && Math.abs(l.getLatLng().lat - f.lat) < 0.0005 && Math.abs(l.getLatLng().lng - f.lon) < 0.0005) {
          l.openPopup();
        }
      });
    }
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
    d.appendChild(el("small", "mut", rf.aviso + " Índice de Angström clássico (sem ajustes): " + String(rf.angstromPuro).replace(".", ",") + "."));
    box.appendChild(d);
  }

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

  function textoParcialFocos(d) {
    return "Consulta ao INPE INCOMPLETA (" + d.arquivosLidos + " de " + d.arquivosTentados + " arquivos lidos): não é possível afirmar que não há focos. Os focos listados são só os dos arquivos lidos.";
  }

  function renderizarPainelFogo(antigo, deTs) {
    var box = $("fogo");
    if (!box || !dadosQueimadasAtual) return;
    box.textContent = ""; box.className = "";
    if (antigo && deTs) {
      box.appendChild(el("p", "stale", "Não foi possível atualizar o INPE agora. Mostrando focos coletados em " + dh(deTs) + "."));
    }

    if (dadosQueimadasAtual.parcial) box.appendChild(el("p", "stale", textoParcialFocos(dadosQueimadasAtual)));
    var todosFocos = dadosQueimadasAtual.focos || [];
    var emCajamar = todosFocos.filter(function (f) { return f.emCajamar; });
    var raio50 = todosFocos.filter(function (f) { return f.distanciaKm <= 50; });
    var filtrados = filtrarFocosAtuais();

    P.mapa.desenharFocos(filtrados);
    desenharFocosNoMapaFogo(filtrados);

    // Só notifica com consulta atual: focos de um cache antigo não são alerta novo.
    if (!antigo && emCajamar.length > 0) {
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
      var sem = el("p", "mut", dadosQueimadasAtual.parcial ? textoParcialFocos(dadosQueimadasAtual) : "Nenhum foco de calor detectado pelos satélites para o filtro selecionado nas últimas 24–48 h. Você pode ampliar o raio para 100 km ou 300 km (Estado de SP) acima.");
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
        btnVer.onclick = function () { focarFocoNoMapaFogo(f); if (P.mapa && P.mapa.focarFoco) P.mapa.focarFoco(f); };
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
    det.appendChild(el("summary", "mut", "🛰️ Ver status e cobertura dos satélites monitorados (AQUA_M-M, AQUA_M-T, GOES-19, METOP-B/C, MSG-03, NOAA-20/21, TERRA_M-M, TERRA_M-T, NPP-375)"));
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

  function iniciar() {
    inicializarMapaFogo();
    var botoesSat = document.querySelectorAll(".modo-sat-fogo");
    for (var i = 0; i < botoesSat.length; i++) {
      botoesSat[i].onclick = function () {
        selecionarSateliteFogo(this.getAttribute("data-sat-img"));
      };
    }
    if ($("fSatelite")) $("fSatelite").onchange = function () {
      var v = this.value;
      var idBtn = v === "todos" ? "termica_todos" : v;
      var b = document.querySelector('.modo-sat-fogo[data-sat-img="' + idBtn + '"]');
      if (b) selecionarSateliteFogo(idBtn);
      renderizarPainelFogo(false, null);
    };
    if ($("fRaioFogo")) $("fRaioFogo").onchange = function () { renderizarPainelFogo(false, null); };
  }

  P.fogo = {
    iniciar: iniciar, carregar: fogoSatelites, redimensionarMapa: function () { inicializarMapaFogo(); if (mapFogo) mapFogo.invalidateSize(); },
    definirClima: function (c) { ultimoClimaFogo = c; atualizarRiscoFogoBox(); }
  };
})();
