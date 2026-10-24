// Painel: risco de deslizamento, nível do rio e atalho para abrir ocorrência de encosta.
(function () {
  "use strict";
  var P = window.Painel, $ = P.$, el = P.el, hm = P.hm, dh = P.dh, fdia = P.fdia, fhora = P.fhora, num = P.num, fail = P.fail, aviso = P.aviso;
  var notificarRisco = P.notificarRisco;

  var ultimoDeslizSerie = null;

  function renderizarTabelaCriteriosDesliz(nivelAtivo) {
    var tbody = $("tbodyCriteriosDesliz");
    if (!tbody || typeof Deslizamento === "undefined") return;
    tbody.textContent = "";
    Deslizamento.ESTADOS.forEach(function (st) {
      var tr = el("tr", st.nivel === nivelAtivo ? "ativo-criterio" : "");
      tr.style.background = st.corFundo;
      tr.style.color = st.corTexto;
      var tdEst = el("td");
      tdEst.appendChild(el("strong", "", st.icone + " " + st.estado + (st.nivel === nivelAtivo ? " (ATUAL)" : "")));
      var tdDesc = el("td", "", st.descricao);
      var tdAcao = el("td", "", st.acaoDefesaCivil);
      tr.appendChild(tdEst);
      tr.appendChild(tdDesc);
      tr.appendChild(tdAcao);
      tbody.appendChild(tr);
    });
  }

  function obterAvaliacoesEstacoesLocais() {
    if (typeof Estacao === "undefined" || typeof Deslizamento === "undefined") return [];
    var out = [];
    try {
      var banco = Estacao.carregarBanco();
      ["est1", "est2", "est3"].forEach(function (id, idx) {
        var sl = banco.slots[id];
        if (!sl || !sl.dias) return;
        var datas = Object.keys(sl.dias).sort();
        if (!datas.length) return;
        var ultData = datas[datas.length - 1];
        var av = Deslizamento.avaliarDiaEstacao(sl.dias, ultData, sl.estacao || ("Estação " + (idx + 1)));
        if (av) {
          av.nomeEstacao = sl.estacao || ("Estação " + (idx + 1));
          out.push(av);
        }
      });
    } catch (e) {}
    return out;
  }

  function atualizarPainelDeslizamento() {
    var box = $("deslizamentoPainel");
    if (!box || typeof Deslizamento === "undefined") return;

    var modo = $("fFonteDesliz") ? $("fFonteDesliz").value : "auto";
    var avEstacoes = obterAvaliacoesEstacoesLocais();
    var avSerie = ultimoDeslizSerie ? ultimoDeslizSerie.atual : null;
    var avProj = ultimoDeslizSerie ? ultimoDeslizSerie.projecao24h : null;
    var avEscolhida = null;

    if (modo === "simulador") {
      var s1 = $("simMm1h") ? parseFloat($("simMm1h").value) || 0 : 0;
      var s24 = $("simMm24h") ? parseFloat($("simMm24h").value) || 0 : 0;
      var s168 = $("simMm168h") ? parseFloat($("simMm168h").value) || 0 : 0;
      avEscolhida = Deslizamento.avaliarRisco({
        mm1h: s1,
        mm24h: s24,
        mm168h: s168,
        fonte: "Simulador / Leitura Manual de Campo"
      });
    } else if (modo === "estacoes") {
      if (avEstacoes.length) {
        avEscolhida = avEstacoes.slice().sort(function (a, b) {
          if (b.nivel !== a.nivel) return b.nivel - a.nivel;
          return b.mm24h - a.mm24h;
        })[0];
      } else if (avSerie) {
        avEscolhida = avSerie;
      }
    } else if (modo === "serie") {
      avEscolhida = avSerie || (avEstacoes[0] || null);
    } else {
      // modo === "auto": adota o cenário mais crítico entre estações locais recentes e série horária 168h
      var candidatos = [];
      if (avSerie) candidatos.push(avSerie);
      avEstacoes.forEach(function (x) { candidatos.push(x); });
      if (candidatos.length) {
        candidatos.sort(function (a, b) {
          if (b.nivel !== a.nivel) return b.nivel - a.nivel;
          if (b.mm24h !== a.mm24h) return b.mm24h - a.mm24h;
          return b.mm168h - a.mm168h;
        });
        avEscolhida = candidatos[0];
      }
    }

    if (!avEscolhida) {
      avEscolhida = Deslizamento.avaliarRisco({ mm1h: 0, mm24h: 0, mm168h: 0, fonte: "Aguardando leitura pluviométrica" });
    }

    // Sincroniza campos do simulador quando não está em modo simulador manual
    if (modo !== "simulador") {
      if ($("simMm1h")) $("simMm1h").value = avEscolhida.mm1h;
      if ($("simMm24h")) $("simMm24h").value = avEscolhida.mm24h;
      if ($("simMm168h")) $("simMm168h").value = avEscolhida.mm168h;
    }

    renderizarTabelaCriteriosDesliz(avEscolhida.nivel);

    if (avEscolhida.nivel >= 2 && modo !== "simulador") {
      notificarRisco(
        "⛰️ Risco de Deslizamento: " + avEscolhida.estado.toUpperCase(),
        "Cajamar: 1h=" + avEscolhida.mm1h.toFixed(1) + "mm · 24h=" + avEscolhida.mm24h.toFixed(1) + "mm · 168h=" + avEscolhida.mm168h.toFixed(1) + "mm."
      );
    }

    box.textContent = "";
    box.className = "";

    // Faixa Principal de Estado (Normalidade, Observação, Atenção, Alerta, Alerta Máximo)
    var banner = el("div", "desliz-banner");
    banner.style.background = avEscolhida.corFundo;
    banner.style.borderLeftColor = avEscolhida.corBorda;
    banner.style.color = avEscolhida.corTexto;
    banner.appendChild(el("strong", "", avEscolhida.icone + " ESTADO ATUAL: " + avEscolhida.estado.toUpperCase() + " — " + avEscolhida.fonte));
    banner.appendChild(el("span", "", "Critério da faixa: " + avEscolhida.descricaoCriterio));
    banner.appendChild(el("small", "", "Gatilho(s): " + avEscolhida.gatilhos.join(" · ")));
    box.appendChild(banner);

    // 3 Cartões de Volume de Água (1h, 24h, 168h)
    var grid = el("div", "desliz-grid");
    var cartoes = [
      {
        titulo: "🌧️ Volume em 1 hora (mm/h)",
        valor: avEscolhida.mm1h.toFixed(1).replace(".", ",") + " mm/h",
        estado: avEscolhida.estado1h,
        cor: avEscolhida.cor1h,
        corTxt: avEscolhida.nivel1h >= 3 ? "#fff" : "#111",
        ref: "Obs ≥ 10 · Atenção ≥ 20 · Alerta ≥ 30 · Máx > 50 mm/h"
      },
      {
        titulo: "🌧️ Volume em 24 horas (mm/24h)",
        valor: avEscolhida.mm24h.toFixed(1).replace(".", ",") + " mm/24h",
        estado: avEscolhida.estado24h,
        cor: avEscolhida.cor24h,
        corTxt: avEscolhida.nivel24h >= 3 ? "#fff" : "#111",
        ref: "Obs ≥ 25 · Atenção ≥ 50 · Alerta ≥ 100 · Máx > 150 mm/24h"
      },
      {
        titulo: "🌧️ Volume em 7 dias / 168h (mm/168h)",
        valor: avEscolhida.mm168h.toFixed(1).replace(".", ",") + " mm/168h",
        estado: avEscolhida.estado168h,
        cor: avEscolhida.cor168h,
        corTxt: avEscolhida.nivel168h >= 3 ? "#fff" : "#111",
        ref: "Obs ≥ 50 · Atenção ≥ 100 · Alerta ≥ 150 · Máx > 210 mm/168h"
      }
    ];

    cartoes.forEach(function (c) {
      var cx = el("div", "desliz-cx");
      cx.style.borderTopColor = c.cor;
      cx.appendChild(el("span", "", c.titulo));
      var linhaVal = el("div", "");
      linhaVal.style.display = "flex";
      linhaVal.style.justifyContent = "space-between";
      linhaVal.style.alignItems = "center";
      linhaVal.style.gap = "8px";
      linhaVal.appendChild(el("strong", "", c.valor));
      var bdg = el("span", "desliz-badge", c.estado);
      bdg.style.background = c.cor;
      bdg.style.color = c.corTxt;
      linhaVal.appendChild(bdg);
      cx.appendChild(linhaVal);
      cx.appendChild(el("small", "mut", c.ref));
      grid.appendChild(cx);
    });
    box.appendChild(grid);

    // Orientação Operacional Defesa Civil + População
    var orient = el("div", "alert " + (avEscolhida.nivel >= 3 ? "v" : avEscolhida.nivel === 2 ? "l" : avEscolhida.nivel === 0 ? "ok-alert" : ""));
    orient.style.marginTop = "0";
    orient.appendChild(el("strong", "", "🛟 Protocolo Defesa Civil (" + avEscolhida.estado + "): " + avEscolhida.acaoDefesaCivil));
    orient.appendChild(el("span", "", "📢 Orientação aos moradores de áreas de encosta: " + avEscolhida.orientacaoPopulacao));
    if (avProj && avProj.nivel > avEscolhida.nivel && modo !== "simulador") {
      orient.appendChild(el("small", "", "⚠️ Projeção próximas 24h: a chuva prevista pode elevar o estado para " + avProj.icone + " " + avProj.estado.toUpperCase() + " (previsto ~" + avProj.mm24h.toFixed(1).replace(".", ",") + " mm/24h)."));
    }
    box.appendChild(orient);

    // Se houver estações locais carregadas via CSV, mostra o resumo individual de cada estação
    if (avEstacoes.length) {
      var pEst = el("p", "mut", "");
      pEst.style.margin = "8px 0 0";
      pEst.style.fontSize = ".82rem";
      pEst.textContent = "📍 Estações locais carregadas (CSV): " + avEstacoes.map(function (e) {
        return e.nomeEstacao + " [" + e.dataIso.slice(8, 10) + "/" + e.dataIso.slice(5, 7) + "]: " + e.icone + " " + e.estado +
          " (1h: " + e.mm1h.toFixed(1).replace(".", ",") + " mm · 24h: " + e.mm24h.toFixed(1).replace(".", ",") + " mm · 168h: " + e.mm168h.toFixed(1).replace(".", ",") + " mm)";
      }).join(" | ");
      box.appendChild(pEst);
    }

    ultimaAvDeslizamento = avEscolhida;
    atualizarStatusRioPainel();
    if (P.mapa) P.mapa.atualizarPontos();
  }

  var ultimaAvDeslizamento = null;

  function atualizarStatusRioPainel() {
    var boxRio = $("statusRioPainel");
    if (!boxRio || typeof Estacao === "undefined") return;
    try {
      var banco = Estacao.carregarBanco();
      var slReg = banco.slots && banco.slots.regua;
      var datas = slReg && slReg.dias ? Object.keys(slReg.dias).sort() : [];
      if (!datas.length) {
        boxRio.hidden = true;
        return;
      }
      var ultD = datas[datas.length - 1];
      var dRio = slReg.dias[ultD];
      if (!dRio || dRio.nvMax === null || dRio.nvMax === undefined) {
        boxRio.hidden = true;
        return;
      }
      var cotas = Estacao.carregarCotasRio();
      var avRio = Estacao.avaliarNivelRio(dRio.nvMax, dRio.nvDelta, cotas);
      boxRio.hidden = false;
      boxRio.textContent = "";
      var ban = el("div", "desliz-banner");
      ban.style.background = avRio.corFundo;
      ban.style.borderLeftColor = avRio.corBorda || "#0b6e8f";
      ban.style.color = avRio.corTexto;
      ban.style.marginBottom = "0";
      ban.appendChild(el("strong", "", "🌊 " + (slReg.estacao || "Régua de Nível do Rio") + " [" + ultD.slice(8, 10) + "/" + ultD.slice(5, 7) + "]: " + avRio.icone + " " + avRio.estado.toUpperCase()));
      ban.appendChild(el("span", "", "Nível Máx: " + dRio.nvMax.toFixed(2).replace(".", ",") + " m · Mín: " + (dRio.nvMin !== null ? dRio.nvMin.toFixed(2).replace(".", ",") : "—") + " m · Subida (Δ): +" + Math.round((dRio.nvDelta || 0) * 100) + " cm"));
      ban.appendChild(el("small", "", avRio.motivo + " (Cotas configuradas: Atenção " + cotas.atencaoM.toFixed(2).replace(".", ",") + "m · Alerta " + cotas.alertaM.toFixed(2).replace(".", ",") + "m · Transbordo " + cotas.transbordoM.toFixed(2).replace(".", ",") + "m)"));
      boxRio.appendChild(ban);
    } catch (e) {
      boxRio.hidden = true;
    }
  }

  function abrirOcorrenciaEncosta(localSugerido) {
    var av = ultimaAvDeslizamento || (typeof Deslizamento !== "undefined" ? Deslizamento.avaliarRisco({ mm1h: 0, mm24h: 0, mm168h: 0 }) : null);
    var rascunho = {
      tipo: "Eventos Hidrológicos e Geológicos",
      subtipo: av && av.nivel >= 3 ? "Escorregamento" : "Monitoramento de áreas de risco",
      local: localSugerido || "",
      descricao: av
        ? "Estado de Deslizamento: " + av.estado.toUpperCase() + " (" + av.fonte + "). Volumes registrados: 1h = " +
          av.mm1h.toFixed(1).replace(".", ",") + " mm/h (" + av.estado1h + ") | 24h = " +
          av.mm24h.toFixed(1).replace(".", ",") + " mm/24h (" + av.estado24h + ") | 168h (7d) = " +
          av.mm168h.toFixed(1).replace(".", ",") + " mm/168h (" + av.estado168h + "). Protocolo: " + av.acaoDefesaCivil
        : "Vistoria preventiva de área de risco de escorregamento."
    };
    try { sessionStorage.setItem("cajamar:rascunho_ocorrencia", JSON.stringify(rascunho)); } catch (e) {}
    window.location.href = "quadro.html?acao=encosta";
  }



  // Liga os controles da seção e faz o primeiro desenho.
  function iniciar() {
    if ($("fFonteDesliz")) $("fFonteDesliz").onchange = atualizarPainelDeslizamento;
    if ($("btnAbrirOcorrenciaDesliz")) {
      $("btnAbrirOcorrenciaDesliz").onclick = function () { abrirOcorrenciaEncosta(""); };
    }
    if ($("btnSimularDesliz")) {
      $("btnSimularDesliz").onclick = function () {
        if ($("fFonteDesliz")) $("fFonteDesliz").value = "simulador";
        atualizarPainelDeslizamento();
      };
    }
    if ($("btnResetDesliz")) {
      $("btnResetDesliz").onclick = function () {
        if ($("fFonteDesliz")) $("fFonteDesliz").value = "auto";
        atualizarPainelDeslizamento();
      };
    }
    ["simMm1h", "simMm24h", "simMm168h"].forEach(function (id) {
      if ($(id)) {
        $(id).oninput = function () {
          if ($("fFonteDesliz")) $("fFonteDesliz").value = "simulador";
          atualizarPainelDeslizamento();
        };
      }
    });
    atualizarPainelDeslizamento();
  }

  P.desliz = {
    iniciar: iniciar, atualizar: atualizarPainelDeslizamento, abrirOcorrencia: abrirOcorrenciaEncosta,
    definirSerie: function (s) { ultimoDeslizSerie = s; atualizarPainelDeslizamento(); },
    ultima: function () { return ultimaAvDeslizamento; }
  };
})();
