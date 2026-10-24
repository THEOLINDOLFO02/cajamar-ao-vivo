// Painel: focos de calor (INPE), condição meteorológica para fogo e tabela de satélites.
(function () {
  "use strict";
  var P = window.Painel, $ = P.$, el = P.el, hm = P.hm, dh = P.dh, fdia = P.fdia, fhora = P.fhora, num = P.num, fail = P.fail, aviso = P.aviso;
  var notificarRisco = P.notificarRisco;
  var ultimoClimaFogo = null;
  var dadosQueimadasAtual = null;

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

  function renderizarPainelFogo(antigo, deTs) {
    var box = $("fogo");
    if (!box || !dadosQueimadasAtual) return;
    box.textContent = ""; box.className = "";
    if (antigo && deTs) {
      box.appendChild(el("p", "stale", "Não foi possível atualizar o INPE agora. Mostrando focos coletados em " + dh(deTs) + "."));
    }

    var todosFocos = dadosQueimadasAtual.focos || [];
    var emCajamar = todosFocos.filter(function (f) { return f.emCajamar; });
    var raio50 = todosFocos.filter(function (f) { return f.distanciaKm <= 50; });
    var filtrados = filtrarFocosAtuais();

    P.mapa.desenharFocos(filtrados);

    if (emCajamar.length > 0) {
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
      var sem = el("p", "mut", "Nenhum foco de calor detectado pelos satélites para o filtro selecionado nas últimas 24–48 h. Você pode ampliar o raio para 100 km ou 300 km (Estado de SP) acima.");
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
        btnVer.onclick = function () { focarFocoNoMapa(f); };
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
    det.appendChild(el("summary", "mut", "🛰️ Ver status e cobertura dos satélites monitorados (GOES-19, MSG-03, METOP-B/C, NOAA-20/21, NPP-375 Manhã/Tarde)"));
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
    if ($("fSatelite")) $("fSatelite").onchange = function () { renderizarPainelFogo(false, null); };
    if ($("fRaioFogo")) $("fRaioFogo").onchange = function () { renderizarPainelFogo(false, null); };
  }

  P.fogo = {
    iniciar: iniciar, carregar: fogoSatelites,
    definirClima: function (c) { ultimoClimaFogo = c; atualizarRiscoFogoBox(); }
  };
})();
