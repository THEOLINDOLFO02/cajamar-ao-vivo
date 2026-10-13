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

  var NOMES = { clima: "Previsão e tempo atual (Open-Meteo)", avisos_inmet: "Avisos INMET (oficial)", previsao_inmet: "Previsão INMET (oficial)", alertas: "Avisos via radarmeteorologico.com.br (reserva)", radar: "Radar (RainViewer)" };

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

  async function clima() {
    var url = "https://api.open-meteo.com/v1/forecast?latitude=" + LAT + "&longitude=" + LON +
      "&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m&hourly=precipitation" +
      "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum&forecast_days=7&timezone=America%2FSao_Paulo";
    try {
      var r = await Fontes.consultar("clima", url, function (j) { return j && j.current && j.hourly && j.hourly.time && j.daily && j.daily.time; });
      var j = r.dados, c = j.current, a = $("agora");
      a.textContent = ""; a.className = "";
      aviso(a, r);
      var n = el("div", "now");
      n.appendChild(el("b", "", typeof c.temperature_2m === "number" ? Math.round(c.temperature_2m) + "°C" : "—"));
      n.appendChild(el("span", "mut", "em Cajamar · dado do modelo das " + String(c.time).slice(11, 16)));
      a.appendChild(n);
      var k = el("div", "k"); a.appendChild(k);
      [["Umidade", num(c.relative_humidity_2m) + "%"], ["Chuva (hora atual)", num(c.precipitation) + " mm"], ["Vento", num(c.wind_speed_10m) + " km/h"]].forEach(function (p) {
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
    if (ofi && !ofi.antigo) lista = Inmet.avisosDoMunicipio(ofi.dados);
    else {
      var ter = await tentar("alertas", "https://radarmeteorologico.com.br/api/v1/alertas?uf=" + UF, function (j) { return j && Array.isArray(j.alertas); });
      if (ter && !ter.antigo) { r = ter; lista = doTerceiro(ter.dados); rotulo = "radarmeteorologico.com.br (terceiro, usado porque a fonte oficial falhou)"; }
      else if (ofi) { lista = Inmet.avisosDoMunicipio(ofi.dados); }
      else if (ter) { r = ter; lista = doTerceiro(ter.dados); rotulo = "radarmeteorologico.com.br (terceiro)"; }
    }
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

  var map = null, frames = [], layers = [], cur = 0, timer = null, host = "";
  function show(i) {
    if (!layers.length) return;
    if (layers[cur]) layers[cur].setOpacity(0);
    cur = i; layers[cur].setOpacity(.7);
    $("slider").value = i;
    $("rt").textContent = new Date(frames[i].time * 1000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
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
      // Quadro de radar guardado enganaria: se a consulta nova falhou, não mostra.
      if (r.antigo) { Fontes.marcarErro("radar", "sem resposta nova"); throw new Error("sem resposta nova"); }
      var j = r.dados;
      host = j.host; frames = (j.radar.past || []).concat(j.radar.nowcast || []);
      if (!frames.length) throw new Error("sem quadros");
      if (!map) {
        map = L.map("mapa", { zoomControl: true }).setView([LAT, LON], 9);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 12, attribution: "© OpenStreetMap" }).addTo(map);
        L.circleMarker([LAT, LON], { radius: 6, color: "#b91c1c", fillOpacity: 1 }).addTo(map).bindTooltip("Cajamar");
      }
      layers.forEach(function (l) { map.removeLayer(l); }); layers = [];
      frames.forEach(function (f) {
        var l = L.tileLayer(host + f.path + "/256/{z}/{x}/{y}/2/1_1.png", { opacity: 0, maxNativeZoom: 7, maxZoom: 12 });
        l.addTo(map); layers.push(l);
      });
      var s = $("slider"); s.max = frames.length - 1; cur = 0; show(frames.length - 1); play(true);
      var idade = Math.round((Date.now() / 1000 - frames[frames.length - 1].time) / 60);
      m.textContent = "Último quadro do radar há " + idade + " min. Mostra chuva detectada (passado), não previsão.";
    } catch (e) {
      m.textContent = "Não foi possível carregar o radar agora. Abra o atalho do RainViewer.";
    }
  }

  $("play").onclick = function () { play(!timer); };
  $("slider").oninput = function () { play(false); show(+this.value); };

  function go() {
    $("reload").disabled = true;
    Promise.all([clima(), alertas(), previsaoInmet(), radar()]).then(function () { $("reload").disabled = false; desenharFontes(); });
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
