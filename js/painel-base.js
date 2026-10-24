// Painel: constantes, formatadores, lista de fontes e alerta sonoro. Todos os módulos painel-*.js usam window.Painel.
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
    climatologia: "Chuva normal de 30 anos (Open-Meteo / ERA5)",
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

  window.Painel = {
    IBGE: IBGE, UF: UF, LAT: LAT, LON: LON, $: $, el: el, hm: hm, dh: dh, fdia: fdia, fhora: fhora, num: num, fail: fail, aviso: aviso,
    desenharFontes: desenharFontes, notificarRisco: notificarRisco
  };
})();
