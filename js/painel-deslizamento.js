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
      tr.dataset.nivel = String(st.nivel);
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

  // Atributo CSS do nível: "semdados" quando a avaliação não é conclusiva.
  function nivelAttr(n) { return n === null || n === undefined ? "semdados" : String(n); }

  // Escolhe a avaliação mais crítica entre as CONCLUSIVAS; se nenhuma for, devolve a primeira (sem dados).
  function maisCritica(lista) {
    var concl = lista.filter(function (x) { return x.conclusivo; });
    if (!concl.length) return lista[0];
    concl.sort(function (a, b) {
      if (b.nivel !== a.nivel) return b.nivel - a.nivel;
      if (b.mm24h !== a.mm24h) return b.mm24h - a.mm24h;
      return b.mm168h - a.mm168h;
    });
    return concl[0];
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
      // Campo vazio permanece ausente (não vira 0 mm).
      avEscolhida = Deslizamento.avaliarRisco({
        mm1h: $("simMm1h") ? $("simMm1h").value : null,
        mm24h: $("simMm24h") ? $("simMm24h").value : null,
        mm168h: $("simMm168h") ? $("simMm168h").value : null,
        tipo: "simulacao",
        fonte: "Simulador / Leitura Manual de Campo"
      });
    } else if (modo === "estacoes") {
      if (avEstacoes.length) {
        avEscolhida = maisCritica(avEstacoes);
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
      if (candidatos.length) avEscolhida = maisCritica(candidatos);
    }

    if (!avEscolhida) {
      avEscolhida = Deslizamento.avaliarRisco({ fonte: "Aguardando leitura pluviométrica" });
    }

    // Sincroniza campos do simulador quando não está em modo simulador manual
    if (modo !== "simulador") {
      if ($("simMm1h")) $("simMm1h").value = avEscolhida.mm1h === null ? "" : avEscolhida.mm1h;
      if ($("simMm24h")) $("simMm24h").value = avEscolhida.mm24h === null ? "" : avEscolhida.mm24h;
      if ($("simMm168h")) $("simMm168h").value = avEscolhida.mm168h === null ? "" : avEscolhida.mm168h;
    }

    renderizarTabelaCriteriosDesliz(avEscolhida.nivel);

    // Só notifica com dado medido e completo; o critério é referencial, não oficial.
    if (avEscolhida.conclusivo && avEscolhida.nivel >= 2 && modo !== "simulador" && avEscolhida.tipoDado === "medicao") {
      notificarRisco(
        "⛰️ Indicador pluviométrico referencial: " + avEscolhida.estado.toUpperCase(),
        "Critério não oficial. Cajamar: 1h=" + Deslizamento.fmtMm(avEscolhida.mm1h) + "mm · 24h=" + Deslizamento.fmtMm(avEscolhida.mm24h) + "mm · 168h=" + Deslizamento.fmtMm(avEscolhida.mm168h) + "mm."
      );
    }

    box.textContent = "";
    box.className = "";

    // Faixa principal: indicador pluviométrico REFERENCIAL (não é classificação oficial da Defesa Civil)
    var banner = el("div", "desliz-banner");
    banner.dataset.nivel = nivelAttr(avEscolhida.nivel);
    banner.appendChild(el("strong", "", avEscolhida.icone + " INDICADOR PLUVIOMÉTRICO REFERENCIAL: " + avEscolhida.estado.toUpperCase() + " — " + avEscolhida.fonte));
    banner.appendChild(el("span", "", "Critério da faixa: " + avEscolhida.descricaoCriterio));
    banner.appendChild(el("small", "", "⚠️ " + Deslizamento.AVISO_CRITERIO));
    banner.appendChild(el("small", "", "Gatilho(s): " + avEscolhida.gatilhos.join(" · ")));
    box.appendChild(banner);

    // 3 Cartões de Volume de Água (1h, 24h, 168h)
    var grid = el("div", "desliz-grid");
    var cartoes = [
      {
        titulo: "🌧️ Volume em 1 hora (mm/h)",
        valor: Deslizamento.fmtMm(avEscolhida.mm1h) + " mm/h",
        estado: avEscolhida.estado1h,
        nivel: avEscolhida.nivel1h,
        ref: "Ref.1 ≥ 10 · Ref.2 ≥ 20 · Ref.3 ≥ 30 · Ref.4 > 50 mm/h"
      },
      {
        titulo: "🌧️ Volume em 24 horas (mm/24h)",
        valor: Deslizamento.fmtMm(avEscolhida.mm24h) + " mm/24h",
        estado: avEscolhida.estado24h,
        nivel: avEscolhida.nivel24h,
        ref: "Ref.1 ≥ 25 · Ref.2 ≥ 50 · Ref.3 ≥ 100 · Ref.4 > 150 mm/24h"
      },
      {
        titulo: "🌧️ Volume em 7 dias / 168h (mm/168h)",
        valor: Deslizamento.fmtMm(avEscolhida.mm168h) + " mm/168h",
        estado: avEscolhida.estado168h,
        nivel: avEscolhida.nivel168h,
        ref: "Ref.1 ≥ 50 · Ref.2 ≥ 100 · Ref.3 ≥ 150 · Ref.4 > 210 mm/168h"
      }
    ];

    cartoes.forEach(function (c) {
      var cx = el("div", "desliz-cx");
      cx.dataset.nivel = nivelAttr(c.nivel);
      cx.appendChild(el("span", "", c.titulo));
      var linhaVal = el("div", "desliz-cx-val");
      linhaVal.appendChild(el("strong", "", c.valor));
      var bdg = el("span", "desliz-badge", c.estado);
      bdg.dataset.nivel = nivelAttr(c.nivel);
      linhaVal.appendChild(bdg);
      cx.appendChild(linhaVal);
      cx.appendChild(el("small", "mut", c.ref));
      grid.appendChild(cx);
    });
    box.appendChild(grid);

    // Orientação Operacional Defesa Civil + População
    var orient = el("div", "alert " + (avEscolhida.nivel >= 3 ? "v" : avEscolhida.nivel === 2 ? "l" : avEscolhida.nivel === 0 ? "ok-alert" : ""));
    orient.style.marginTop = "0";
    orient.appendChild(el("strong", "", "🛟 Atenção (" + avEscolhida.estado + "): " + avEscolhida.acaoDefesaCivil));
    orient.appendChild(el("span", "", "📢 Orientação geral: " + avEscolhida.orientacaoPopulacao));
    if (avProj && avProj.conclusivo && avEscolhida.conclusivo && avProj.nivel > avEscolhida.nivel && modo !== "simulador") {
      orient.appendChild(el("small", "", "⚠️ Previsão do modelo (não é medição) para as próximas 24h: a chuva prevista pode atingir " + avProj.icone + " " + avProj.estado.toUpperCase() + " (previsto ~" + Deslizamento.fmtMm(avProj.mm24h) + " mm/24h)."));
    }
    box.appendChild(orient);

    // Se houver estações locais carregadas via CSV, mostra o resumo individual de cada estação
    if (avEstacoes.length) {
      var pEst = el("p", "mut", "");
      pEst.style.margin = "8px 0 0";
      pEst.style.fontSize = ".82rem";
      pEst.textContent = "📍 Estações locais carregadas (CSV): " + avEstacoes.map(function (e) {
        return e.nomeEstacao + " [" + e.dataIso.slice(8, 10) + "/" + e.dataIso.slice(5, 7) + "]: " + e.icone + " " + e.estado +
          " (1h: " + Deslizamento.fmtMm(e.mm1h) + " mm · 24h: " + Deslizamento.fmtMm(e.mm24h) + " mm · 168h: " + Deslizamento.fmtMm(e.mm168h) + " mm)";
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
      var avRio = Estacao.avaliarNivelRio(dRio.nvMax, dRio.nvDelta, cotas, Estacao.qualidadeNivel(dRio));
      boxRio.hidden = false;
      boxRio.textContent = "";
      var ban = el("div", "desliz-banner");
      ban.dataset.rio = avRio.id || "sem_dado";
      ban.style.marginBottom = "0";
      ban.appendChild(el("strong", "", "🌊 " + (slReg.estacao || "Régua de Nível do Rio") + " [" + ultD.slice(8, 10) + "/" + ultD.slice(5, 7) + "]: " + avRio.icone + " " + avRio.estado.toUpperCase()));
      ban.appendChild(el("span", "", "Nível Máx: " + dRio.nvMax.toFixed(2).replace(".", ",") + " m · Mín: " + (dRio.nvMin !== null ? dRio.nvMin.toFixed(2).replace(".", ",") : "—") + " m · Subida (Δ): +" + Math.round((dRio.nvDelta || 0) * 100) + " cm"));
      ban.appendChild(el("small", "", avRio.motivo + " (Cotas configuradas: Atenção " + cotas.atencaoM.toFixed(2).replace(".", ",") + "m · Alerta " + cotas.alertaM.toFixed(2).replace(".", ",") + "m · Transbordo " + cotas.transbordoM.toFixed(2).replace(".", ",") + "m — sem homologação técnica)"));
      boxRio.appendChild(ban);
    } catch (e) {
      boxRio.hidden = true;
    }
  }

  function abrirOcorrenciaEncosta(localSugerido) {
    var av = ultimaAvDeslizamento || (typeof Deslizamento !== "undefined" ? Deslizamento.avaliarRisco({}) : null);
    var rascunho = {
      tipo: "Eventos Hidrológicos e Geológicos",
      // O subtipo não depende do critério pluviométrico referencial: escorregamento exige constatação em campo.
      subtipo: "Monitoramento de áreas de risco",
      local: localSugerido || "",
      descricao: av
        ? "Indicador pluviométrico referencial (não oficial): " + av.estado.toUpperCase() + " (" + av.fonte + "). Volumes: 1h = " +
          Deslizamento.fmtMm(av.mm1h) + " mm/h (" + av.estado1h + ") | 24h = " +
          Deslizamento.fmtMm(av.mm24h) + " mm/24h (" + av.estado24h + ") | 168h (7d) = " +
          Deslizamento.fmtMm(av.mm168h) + " mm/168h (" + av.estado168h + "). " + av.acaoDefesaCivil
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
