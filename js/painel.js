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

  var NOMES = { clima: "Previsão e tempo atual (Open-Meteo)", avisos_inmet: "Avisos INMET (oficial)", previsao_inmet: "Previsão INMET (oficial)", cemaden: "Chuva observada CEMADEN", alertas: "Avisos via radarmeteorologico.com.br (reserva)", radar: "Radar (RainViewer)" };

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

  async function clima() {
    var url = "https://api.open-meteo.com/v1/forecast?latitude=" + LAT + "&longitude=" + LON +
      "&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_gusts_10m&hourly=precipitation" +
      "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum&forecast_days=7&timezone=America%2FSao_Paulo";
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
      $("tot24").textContent = "Total previsto em 24 h: " + hv.reduce(function (s, x) { return s + x; }, 0).toFixed(1) + " mm (modelo, não é medição)";

      var D = $("dias"); D.textContent = ""; D.className = "tw";
      aviso(D, r);
      var tb = el("table"), th = el("tr");
      ["Dia", "Mín", "Máx", "Chance", "Chuva mm"].forEach(function (x) { th.appendChild(el("th", "", x)); });
      tb.appendChild(th);
      var ps = j.daily.precipitation_sum;
      var dm = Math.max.apply(null, ps.filter(function (x) { return typeof x === "number"; }).concat([1]));
      j.daily.time.forEach(function (d, i) {
        var tr = el("tr");
        tr.appendChild(el("td", "", fdia(d)));
        tr.appendChild(el("td", "", typeof j.daily.temperature_2m_min[i] === "number" ? Math.round(j.daily.temperature_2m_min[i]) + "°" : "—"));
        tr.appendChild(el("td", "", typeof j.daily.temperature_2m_max[i] === "number" ? Math.round(j.daily.temperature_2m_max[i]) + "°" : "—"));
        tr.appendChild(el("td", "", num(j.daily.precipitation_probability_max[i]) + "%"));
        var c4 = el("td", "", num(ps[i], 1)), b = el("span", "bar");
        b.style.width = ((typeof ps[i] === "number" ? ps[i] : 0) / dm * 50) + "px"; c4.appendChild(b); tr.appendChild(c4); tb.appendChild(tr);
      });
      D.appendChild(tb);
    } catch (e) {
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

  // ---------- Radar, Mapa Operacional e Pontos de Referência ----------
  var map = null, frames = [], layers = [], cur = 0, timer = null, host = "", pastCount = 0;
  var PONTOS_CAJAMAR = [
    { nome: "Cajamar (Centro)", lat: -23.3556, lon: -46.8778, cor: "#c2410c", tipo: "Distrito" },
    { nome: "Jordanésia", lat: -23.3283, lon: -46.8622, cor: "#c2410c", tipo: "Distrito" },
    { nome: "Polvilho", lat: -23.3853, lon: -46.8286, cor: "#c2410c", tipo: "Distrito" },
    { nome: "Ponunduva", lat: -23.3108, lon: -46.9458, cor: "#0b6e8f", tipo: "Região" },
    { nome: "Defesa Civil / Bombeiros", lat: -23.3325, lon: -46.8603, cor: "#b91c1c", tipo: "Base Operacional" }
  ];

  function show(i) {
    if (!layers.length || !frames[i]) return;
    if (layers[cur]) layers[cur].setOpacity(0);
    cur = i; layers[cur].setOpacity(.7);
    $("slider").value = i;
    var hora = new Date(frames[i].time * 1000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    var ehFuturo = i >= pastCount;
    var rt = $("rt"); rt.textContent = hora + " ";
    rt.appendChild(el("span", "badge-frame " + (ehFuturo ? "futuro" : "passado"), ehFuturo ? "Projeção (Nowcast)" : "Chuva detectada"));
  }

  function play(on) {
    clearInterval(timer); timer = null;
    $("play").textContent = on ? "Pausar" : "Reproduzir";
    if (on) timer = setInterval(function () { show((cur + 1) % frames.length); }, 700);
  }

  async function radar() {
    var m = $("rmsg");
    if (typeof L === "undefined") {
      Fontes.marcarErro("radar", "biblioteca do mapa não carregou");
      m.textContent = "Mapa indisponível (biblioteca não carregou). Use o atalho do RainViewer.";
      return;
    }
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

      if (!map) {
        map = L.map("mapa", { zoomControl: true }).setView([LAT, LON], 10);
        var camadaRuas = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 14, attribution: "© OpenStreetMap" });
        var camadaSatelite = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 14, attribution: "Tiles © Esri" });
        var camadaRelevo = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", { maxZoom: 14, attribution: "© OpenTopoMap" });
        camadaRuas.addTo(map);

        var layerPontos = L.layerGroup();
        PONTOS_CAJAMAR.forEach(function (pt) {
          var circ = L.circleMarker([pt.lat, pt.lon], {
            radius: pt.tipo === "Base Operacional" ? 7 : 5,
            color: pt.cor, fillColor: pt.cor, fillOpacity: 0.9, weight: 2
          });
          circ.bindTooltip("<b>" + pt.nome + "</b><br><small>" + pt.tipo + "</small>", { direction: "top" });
          layerPontos.addLayer(circ);
        });
        layerPontos.addTo(map);
        layerAvisos = L.layerGroup().addTo(map);

        L.control.layers(
          { "Ruas": camadaRuas, "Satélite": camadaSatelite, "Relevo/Topografia": camadaRelevo },
          { "Pontos de Cajamar": layerPontos, "Áreas dos avisos do INMET": layerAvisos },
          { position: "topright" }
        ).addTo(map);
      }

      desenharAvisosNoMapa();
      layers.forEach(function (l) { map.removeLayer(l); }); layers = [];
      frames.forEach(function (f) {
        var l = L.tileLayer(host + f.path + "/256/{z}/{x}/{y}/2/1_1.png", { opacity: 0, maxNativeZoom: 7, maxZoom: 14 });
        l.addTo(map); layers.push(l);
      });
      var s = $("slider"); s.max = frames.length - 1; cur = 0;
      var quadroInicial = pastCount > 0 ? pastCount - 1 : frames.length - 1;
      show(quadroInicial); play(true);
      m.textContent = pastFrames.length + " quadros passados (chuva detectada) + " + nowcastFrames.length + " de projeção (nowcast).";
    } catch (e) {
      m.textContent = "Não foi possível carregar o radar agora. Abra o atalho do RainViewer.";
    }
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
    Promise.all([clima(), alertas(), previsaoInmet(), Cemaden.carregar(), radar()].map(function (p) { return p.then(desenharFontes); })).then(function () { $("reload").disabled = false; desenharFontes(); });
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
