// Histórico das 3 estações meteorológicas e 1 régua de nível do rio em Cajamar:
// Os CSVs são lidos no próprio navegador (nada é enviado).
// O resumo por dia de cada equipamento fica guardado no localStorage deste aparelho.
(function () {
  "use strict";
  var $ = function (i) { return document.getElementById(i); };
  var banco = Estacao.carregarBanco();
  var slotForcadoUpload = null;
  var SVGNS = "http://www.w3.org/2000/svg";

  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x !== undefined) e.textContent = x; return e; }
  function sv(t, a) { var e = document.createElementNS(SVGNS, t); for (var k in a) e.setAttribute(k, a[k]); return e; }
  function fdata(k) { return k.slice(8, 10) + "/" + k.slice(5, 7); }
  function fdataLonga(k) { return k.slice(8, 10) + "/" + k.slice(5, 7) + "/" + k.slice(0, 4); }
  function f1(v) { return v === null || v === undefined ? "—" : v.toFixed(1).replace(".", ","); }
  function f2(v) { return v === null || v === undefined ? "—" : v.toFixed(2).replace(".", ","); }
  function aviso(t, ruim) { var a = $("aviso"); a.hidden = !t; a.textContent = t || ""; a.className = "warn" + (ruim ? " ruim" : ""); }

  function slotAtual() {
    return banco.slots[banco.ativo] || banco.slots.est1;
  }

  function guardar() {
    if (!Estacao.salvarBanco(banco)) {
      aviso("Não foi possível guardar neste navegador (modo privado ou armazenamento cheio). O histórico some ao fechar a página.", true);
      return false;
    }
    return true;
  }

  function renderizarGradeSlots() {
    var g = $("gradeSlots");
    if (!g) return;
    g.textContent = "";
    Estacao.SLOTS_PADRAO.forEach(function (info) {
      var sl = banco.slots[info.id];
      var chaves = Object.keys(sl.dias || {}).sort();
      var ativo = banco.ativo === info.id;
      var card = el("div", "slot-card" + (ativo ? " ativo" : ""));
      var icone = info.id === "regua" ? "🌊 " : "🌡️ ";
      var topo = el("div", "slot-topo");
      topo.appendChild(el("strong", "", icone + info.rotulo));
      var badge = el("span", "slot-badge " + (chaves.length ? "ok" : "vazio"), chaves.length ? chaves.length + " dia(s)" : "Sem CSV");
      topo.appendChild(badge);
      card.appendChild(topo);

      var nome = sl.estacao ? sl.estacao : (chaves.length ? info.rotulo : "Nenhum arquivo enviado");
      card.appendChild(el("p", "slot-nome", nome));
      if (chaves.length) {
        card.appendChild(el("small", "mut", fdataLonga(chaves[0]) + " a " + fdataLonga(chaves[chaves.length - 1])));
      } else {
        card.appendChild(el("small", "mut", info.id === "regua" ? "Leituras de nível do rio (m)" : "Chuva, temperatura, vento e umidade"));
      }

      var acoes = el("div", "slot-acoes");
      var btnVer = el("button", "btn small" + (ativo ? " primary" : ""), ativo ? "✓ Selecionado" : "Visualizar");
      btnVer.type = "button";
      btnVer.onclick = function () {
        banco.ativo = info.id;
        guardar();
        desenhar(false);
      };
      acoes.appendChild(btnVer);

      var btnUp = el("button", "btn small", "📂 Enviar CSV");
      btnUp.type = "button";
      btnUp.onclick = function () {
        slotForcadoUpload = info.id;
        $("arquivo").click();
      };
      acoes.appendChild(btnUp);

      card.appendChild(acoes);
      g.appendChild(card);
    });
  }

  // ---------- gráficos (SVG, sem bibliotecas) ----------
  function eixoX(svg, chaves, x0, larg, y, passo) {
    var step = Math.max(1, Math.ceil(chaves.length / passo));
    chaves.forEach(function (k, i) {
      if (i % step) return;
      var t = sv("text", { x: x0 + (i + .5) * larg / chaves.length, y: y, "text-anchor": "middle", class: "eix" }); t.textContent = fdata(k); svg.appendChild(t);
    });
  }
  function grade(svg, max, x0, x1, y0, y1, un) {
    [0, .5, 1].forEach(function (f) {
      var y = y1 - f * (y1 - y0);
      svg.appendChild(sv("line", { x1: x0, x2: x1, y1: y, y2: y, class: "grd" }));
      var t = sv("text", { x: x0 - 4, y: y + 3, "text-anchor": "end", class: "eix" }); t.textContent = (max * f).toFixed(max < 10 ? 1 : 0) + (un || ""); svg.appendChild(t);
    });
  }
  function graficoChuva(dias, chaves) {
    var W = 720, H = 220, x0 = 36, x1 = W - 6, y0 = 10, y1 = H - 26;
    var svg = sv("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Chuva por dia em milímetros", class: "graf" });
    var max = Math.max.apply(null, chaves.map(function (k) { return dias[k].chuva || 0; }).concat([5]));
    max = max > 10 ? Math.ceil(max / 10) * 10 : Math.ceil(max / 5) * 5;
    grade(svg, max, x0, x1, y0, y1, "");
    var larg = x1 - x0, bw = Math.max(3, larg / chaves.length * .7);
    chaves.forEach(function (k, i) {
      var d = dias[k], h = (d.chuva || 0) / max * (y1 - y0), cx = x0 + (i + .5) * larg / chaves.length;
      var r = sv("rect", { x: cx - bw / 2, y: y1 - h, width: bw, height: Math.max(h, d.chuva > 0 ? 1 : 0), class: "barra" + (Estacao.diaCompleto(d) !== true ? " parcial" : "") });
      var tt = sv("title", {}); tt.textContent = fdataLonga(k) + ": " + f1(d.chuva) + " mm" + (Estacao.diaCompleto(d) !== true ? " (dia incompleto ou sem detalhe: valor mínimo)" : ""); r.appendChild(tt);
      svg.appendChild(r);
    });
    eixoX(svg, chaves, x0, larg, H - 8, 10);
    return svg;
  }
  function graficoTemp(dias, chaves) {
    var W = 720, H = 200, x0 = 36, x1 = W - 6, y0 = 10, y1 = H - 26;
    var svg = sv("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Temperatura mínima e máxima por dia", class: "graf" });
    var vs = [];
    chaves.forEach(function (k) { if (dias[k].tmin !== null) vs.push(dias[k].tmin); if (dias[k].tmax !== null) vs.push(dias[k].tmax); });
    if (!vs.length) return svg;
    var mn = Math.floor(Math.min.apply(null, vs) / 5) * 5, mx = Math.ceil(Math.max.apply(null, vs) / 5) * 5;
    if (mx === mn) mx = mn + 5;
    [0, .5, 1].forEach(function (f) {
      var y = y1 - f * (y1 - y0);
      svg.appendChild(sv("line", { x1: x0, x2: x1, y1: y, y2: y, class: "grd" }));
      var t = sv("text", { x: x0 - 4, y: y + 3, "text-anchor": "end", class: "eix" }); t.textContent = Math.round(mn + f * (mx - mn)) + "°"; svg.appendChild(t);
    });
    var larg = x1 - x0;
    function linha(campo, cls) {
      var pts = [];
      chaves.forEach(function (k, i) {
        var v = dias[k][campo]; if (v === null || v === undefined) return;
        pts.push((x0 + (i + .5) * larg / chaves.length).toFixed(1) + "," + (y1 - (v - mn) / (mx - mn) * (y1 - y0)).toFixed(1));
      });
      if (pts.length) svg.appendChild(sv("polyline", { points: pts.join(" "), class: "lin " + cls }));
    }
    linha("tmax", "max"); linha("tmin", "min");
    eixoX(svg, chaves, x0, larg, H - 8, 10);
    return svg;
  }

  function graficoNivel(dias, chaves) {
    var W = 720, H = 200, x0 = 42, x1 = W - 6, y0 = 10, y1 = H - 26;
    var svg = sv("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Nível do rio mínimo e máximo por dia em metros", class: "graf" });
    var vs = [];
    chaves.forEach(function (k) {
      if (dias[k].nvMin !== null && dias[k].nvMin !== undefined) vs.push(dias[k].nvMin);
      if (dias[k].nvMax !== null && dias[k].nvMax !== undefined) vs.push(dias[k].nvMax);
    });
    if (!vs.length) return svg;
    var cotas = (typeof Estacao !== "undefined" && Estacao.carregarCotasRio) ? Estacao.carregarCotasRio() : null;
    var mn = Math.max(0, Math.floor(Math.min.apply(null, vs) * 2) / 2 - 0.2);
    var mx = Math.ceil(Math.max.apply(null, vs.concat(cotas ? [cotas.atencaoM + 0.1] : [])) * 2) / 2 + 0.2;
    if (mx <= mn) mx = mn + 1;
    [0, .5, 1].forEach(function (f) {
      var y = y1 - f * (y1 - y0);
      svg.appendChild(sv("line", { x1: x0, x2: x1, y1: y, y2: y, class: "grd" }));
      var t = sv("text", { x: x0 - 4, y: y + 3, "text-anchor": "end", class: "eix" });
      t.textContent = (mn + f * (mx - mn)).toFixed(2).replace(".", ",") + "m";
      svg.appendChild(t);
    });
    if (cotas && cotas.origem === "usuario") {
      [
        { v: cotas.atencaoM, cor: "#ca8a04", rot: "Atenção " + cotas.atencaoM.toFixed(2).replace(".", ",") + "m" },
        { v: cotas.alertaM, cor: "#ea580c", rot: "Alerta " + cotas.alertaM.toFixed(2).replace(".", ",") + "m" },
        { v: cotas.transbordoM, cor: "#dc2626", rot: "Transbordo " + cotas.transbordoM.toFixed(2).replace(".", ",") + "m" }
      ].forEach(function (ct) {
        if (ct.v >= mn && ct.v <= mx) {
          var yc = y1 - (ct.v - mn) / (mx - mn) * (y1 - y0);
          svg.appendChild(sv("line", { x1: x0, x2: x1, y1: yc, y2: yc, stroke: ct.cor, "stroke-width": "1.5", "stroke-dasharray": "5 4" }));
          var tc = sv("text", { x: x1 - 4, y: Math.max(12, yc - 3), "text-anchor": "end", class: "eix", fill: ct.cor });
          tc.textContent = ct.rot;
          svg.appendChild(tc);
        }
      });
    }
    var larg = x1 - x0;
    function linha(campo, cls) {
      var pts = [];
      chaves.forEach(function (k, i) {
        var v = dias[k][campo]; if (v === null || v === undefined) return;
        pts.push((x0 + (i + .5) * larg / chaves.length).toFixed(1) + "," + (y1 - (v - mn) / (mx - mn) * (y1 - y0)).toFixed(1));
      });
      if (pts.length) svg.appendChild(sv("polyline", { points: pts.join(" "), class: "lin " + cls }));
    }
    linha("nvMax", "max");
    linha("nvMin", "min");
    eixoX(svg, chaves, x0, larg, H - 8, 10);
    return svg;
  }

  function cartao(rot, val, nota) {
    var d = el("div", "cx"); d.appendChild(el("span", "", rot)); d.appendChild(el("strong", "", val));
    if (nota) d.appendChild(el("small", "", nota));
    return d;
  }

  var MESES_PT = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  function atualizarSeletorPeriodos(chavesTodas) {
    var sel = $("fperiodo");
    if (!sel) return;
    var valorAtual = sel.value || "todos";
    var mesesMap = {};
    chavesTodas.forEach(function (k) {
      mesesMap[k.slice(0, 7)] = true;
    });
    var listaMeses = Object.keys(mesesMap).sort().reverse();
    sel.textContent = "";
    var optTodos = el("option", "", "Todo o período registrado (" + chavesTodas.length + " dias)");
    optTodos.value = "todos";
    sel.appendChild(optTodos);
    if (chavesTodas.length > 30) {
      var opt30 = el("option", "", "Últimos 30 dias");
      opt30.value = "30";
      sel.appendChild(opt30);
    }
    listaMeses.forEach(function (ym) {
      var p = ym.split("-");
      var ano = p[0], mIdx = parseInt(p[1], 10) - 1;
      var nomeMes = MESES_PT[mIdx] || ym;
      var opt = el("option", "", "Mês de " + nomeMes + " / " + ano);
      opt.value = "mes:" + ym;
      sel.appendChild(opt);
    });
    for (var i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === valorAtual) { sel.selectedIndex = i; break; }
    }
  }

  function desenhar(preservarSeletor) {
    renderizarGradeSlots();
    var sl = slotAtual();
    var dias = sl.dias || {};
    var estacao = sl.estacao || sl.rotulo;
    var chavesTodas = Object.keys(dias).sort();
    var vazio = !chavesTodas.length;
    $("vazio").hidden = !vazio; $("dadosHist").hidden = vazio; $("limpar").disabled = vazio;
    if ($("imprimir")) $("imprimir").disabled = vazio;
    if (vazio) return;

    if (!preservarSeletor) {
      atualizarSeletorPeriodos(chavesTodas);
    }

    var sel = $("fperiodo") ? $("fperiodo").value : "todos";
    var chaves = chavesTodas;
    if (sel === "30") {
      chaves = chavesTodas.slice(-30);
    } else if (sel.indexOf("mes:") === 0) {
      var m = sel.slice(4);
      chaves = chavesTodas.filter(function (k) { return k.indexOf(m) === 0; });
    }
    if (!chaves.length) chaves = chavesTodas;

    if ($("bolEstacao")) $("bolEstacao").textContent = estacao + " (" + sl.rotulo + ")";
    if ($("bolPeriodo")) $("bolPeriodo").textContent = fdataLonga(chaves[0]) + " a " + fdataLonga(chaves[chaves.length - 1]) + " (" + chaves.length + " dia" + (chaves.length > 1 ? "s" : "") + ")";
    if ($("bolEmissao")) $("bolEmissao").textContent = new Date().toLocaleString("pt-BR");

    var total = 0, comChuva = 0, maxK = chaves[0], c10 = { v: 0, k: chaves[0] }, c60 = { v: 0, k: chaves[0] }, vento = { v: 0, k: chaves[0] }, tmin = null, tmax = null;
    var nvMaxGlobal = null, nvMinGlobal = null, nvDeltaMax = { v: 0, k: chaves[0] }, temNivel = false, temTemp = false;

    chaves.forEach(function (k) {
      var d = dias[k];
      total += d.chuva || 0;
      if ((d.chuva || 0) >= 1) comChuva++;
      if ((d.chuva || 0) > (dias[maxK].chuva || 0)) maxK = k;
      if ((d.c10 || 0) > c10.v) c10 = { v: d.c10, k: k };
      if ((d.c60 || 0) > c60.v) c60 = { v: d.c60, k: k };
      if (d.vmax !== null && d.vmax !== undefined && d.vmax > vento.v) vento = { v: d.vmax, k: k };
      if (d.tmin !== null && d.tmin !== undefined) { temTemp = true; if (tmin === null || d.tmin < tmin.v) tmin = { v: d.tmin, k: k }; }
      if (d.tmax !== null && d.tmax !== undefined) { temTemp = true; if (tmax === null || d.tmax > tmax.v) tmax = { v: d.tmax, k: k }; }
      if (d.nvMax !== null && d.nvMax !== undefined) {
        temNivel = true;
        if (nvMaxGlobal === null || d.nvMax > nvMaxGlobal.v) nvMaxGlobal = { v: d.nvMax, k: k };
      }
      if (d.nvMin !== null && d.nvMin !== undefined) {
        temNivel = true;
        if (nvMinGlobal === null || d.nvMin < nvMinGlobal.v) nvMinGlobal = { v: d.nvMin, k: k };
      }
      if (d.nvDelta !== null && d.nvDelta !== undefined && d.nvDelta > nvDeltaMax.v) {
        nvDeltaMax = { v: d.nvDelta, k: k };
      }
    });

    // qualidade dos dados do período exibido (dia completo = cobertura horária completa e sem lacunas)
    var qual = { completos: 0, incompletos: 0, desconhecidos: 0, faltantes: 0, dup: 0, inv: 0, foraOrdem: 0, lacunas: 0 };
    chaves.forEach(function (k) {
      var dq = dias[k];
      var ok = sl.id === "regua" ? Estacao.qualidadeNivel(dq).completo : Estacao.diaCompleto(dq);
      if (ok === true) qual.completos++; else qual.incompletos++;
      if (ok === null) qual.desconhecidos++;
      qual.dup += dq.dup || 0; qual.inv += dq.inv || 0; qual.foraOrdem += dq.foraOrdem || 0; qual.lacunas += (dq.lacunas || []).length;
    });
    var diasNoIntervalo = Math.round((Date.parse(chaves[chaves.length - 1] + "T12:00:00Z") - Date.parse(chaves[0] + "T12:00:00Z")) / 86400000) + 1;
    qual.faltantes = Math.max(0, diasNoIntervalo - chaves.length);
    var incompletos = qual.incompletos;
    $("periodo").textContent = estacao + " · " + fdataLonga(chaves[0]) + " a " + fdataLonga(chaves[chaves.length - 1]) + " · " + chaves.length + " dia(s) exibido(s)";
    var rs = $("resumo"); rs.textContent = "";

    if (temNivel) {
      rs.appendChild(cartao("🌊 Nível Máximo do Rio", nvMaxGlobal ? f2(nvMaxGlobal.v) + " m" : "—", nvMaxGlobal ? "em " + fdataLonga(nvMaxGlobal.k) : ""));
      rs.appendChild(cartao("🌊 Nível Mínimo do Rio", nvMinGlobal ? f2(nvMinGlobal.v) + " m" : "—", nvMinGlobal ? "em " + fdataLonga(nvMinGlobal.k) : ""));
      rs.appendChild(cartao("🌊 Maior Variação Diária (Δ)", f2(nvDeltaMax.v) + " m (" + Math.round(nvDeltaMax.v * 100) + " cm)", fdataLonga(nvDeltaMax.k)));
    }
    if (sl.id !== "regua" || total > 0 || temTemp) {
      rs.appendChild(cartao("Chuva do dia civil no período" + (qual.incompletos || qual.faltantes ? " (mínimo)" : ""), f1(total) + " mm", comChuva + " dia(s) com 1 mm ou mais" + (qual.incompletos ? " · " + qual.incompletos + " dia(s) incompleto(s) ou sem detalhe" : "") + (qual.faltantes ? " · " + qual.faltantes + " dia(s) sem registro no período" : "")));
      rs.appendChild(cartao("Dia mais chuvoso", f1(dias[maxK].chuva) + " mm", fdataLonga(maxK)));
      rs.appendChild(cartao("Maior acumulado em 60 min", f1(c60.v) + " mm", fdataLonga(c60.k) + (qual.incompletos ? " · dias incompletos podem subestimar" : "")));
      rs.appendChild(cartao("Maior chuva em 10 min", f1(c10.v) + " mm", "≈ " + f1(c10.v * 6) + " mm/h · " + fdataLonga(c10.k)));
      rs.appendChild(cartao("Temperatura", (tmin ? Math.round(tmin.v) : "—") + "° a " + (tmax ? Math.round(tmax.v) : "—") + "°", "mín " + (tmin ? fdataLonga(tmin.k) : "—") + " · máx " + (tmax ? fdataLonga(tmax.k) : "—")));
      rs.appendChild(cartao("Vento mais forte", f1(vento.v) + " km/h", fdataLonga(vento.k)));
    }

    rs.appendChild(cartao("Qualidade dos dados", qual.completos + "/" + chaves.length + " dia(s) completo(s)",
      (qual.desconhecidos ? qual.desconhecidos + " sem detalhe horário (reimporte o CSV) · " : "") + qual.lacunas + " lacuna(s) · " + qual.dup + " leitura(s) duplicada(s) · " + qual.inv + " valor(es) inválido(s) · " + qual.foraOrdem + " fora de ordem"));

    if ($("cardDeslizamentoHist") && typeof Deslizamento !== "undefined") {
      var mostrarDesliz = sl.id !== "regua" || total > 0;
      $("cardDeslizamentoHist").hidden = !mostrarDesliz;
      if (mostrarDesliz) {
        var bxD = $("boxDeslizamentoHist");
        bxD.textContent = "";
        var ultDia = chaves[chaves.length - 1];
        var avUlt = Deslizamento.avaliarDiaEstacao(dias, ultDia, estacao);
                var contEstados = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, sem: 0 };
        var avPior = null;
        chaves.forEach(function (k) {
          var avK = Deslizamento.avaliarDiaEstacao(dias, k, estacao);
          if (avK) {
            // Dia sem dados completos não entra nas faixas e nunca conta como "abaixo dos limiares".
            if (!avK.conclusivo) { contEstados.sem++; return; }
            contEstados[avK.nivel] = (contEstados[avK.nivel] || 0) + 1;
            if (!avPior || avK.nivel > avPior.nivel || (avK.nivel === avPior.nivel && avK.mm24h > avPior.mm24h)) {
              avPior = avK;
            }
          }
        });
        if (avUlt) {
          var ban = el("div", "desliz-banner");
          ban.dataset.nivel = avUlt.nivel === null ? "semdados" : String(avUlt.nivel);
          ban.appendChild(el("strong", "", "Indicador referencial (não oficial) — " + avUlt.icone + " último dia registrado (" + fdataLonga(ultDia) + "): " + avUlt.estado.toUpperCase()));
          ban.appendChild(el("span", "", "Volumes: 1h = " + Deslizamento.fmtMm(avUlt.mm1h) + " mm/h (" + avUlt.estado1h + ") · 24h = " + Deslizamento.fmtMm(avUlt.mm24h) + " mm/24h (" + avUlt.estado24h + ") · 168h (7d) = " + Deslizamento.fmtMm(avUlt.mm168h) + " mm/168h (" + avUlt.estado168h + ")" + (avUlt.conclusivo ? "" : " · janelas sem dado completo: " + avUlt.janelasSemDado.join(", "))));
          ban.appendChild(el("small", "", avUlt.acaoDefesaCivil));
          bxD.appendChild(ban);

          var pRes = el("p", "mut", "");
          pRes.style.margin = "4px 0 0";
          pRes.style.fontSize = ".82rem";
          pRes.textContent = "No período filtrado (" + chaves.length + " dias): " +
            "🟢 Referencial 0: " + contEstados[0] + " d · " +
            "🟡 Referencial 1: " + contEstados[1] + " d · " +
            "🟠 Referencial 2: " + contEstados[2] + " d · " +
            "🔴 Referencial 3: " + contEstados[3] + " d · " +
            "🟣 Referencial 4: " + contEstados[4] + " d · " +
            "⚪ Sem dados suficientes: " + contEstados.sem + " d" +
            (avPior && avPior.nivel > 0 ? " | Maior indicador referencial no período: " + avPior.icone + " " + avPior.estado + " em " + fdataLonga(avPior.dataIso) + " (24h: " + f1(avPior.mm24h) + " mm · 168h: " + f1(avPior.mm168h) + " mm)." : ".");
          bxD.appendChild(pRes);
        }
      }
    }

    if ($("cardNivel")) {
      $("cardNivel").hidden = !temNivel;
      if (temNivel) {
        var cotasAtuais = Estacao.carregarCotasRio ? Estacao.carregarCotasRio() : null;
        if (cotasAtuais) {
          if ($("cotaAtencaoM")) $("cotaAtencaoM").value = cotasAtuais.atencaoM.toFixed(2);
          if ($("cotaAlertaM")) $("cotaAlertaM").value = cotasAtuais.alertaM.toFixed(2);
          if ($("cotaTransbordoM")) $("cotaTransbordoM").value = cotasAtuais.transbordoM.toFixed(2);
          if ($("cotaPonto")) $("cotaPonto").value = cotasAtuais.pontoMedicao || "";
          if ($("notaCotas")) {
            $("notaCotas").textContent = cotasAtuais.invalida
              ? "⚠️ As cotas guardadas são inválidas (" + cotasAtuais.erros.join("; ") + "). Os campos mostram valores padrão sugeridos; corrija e salve."
              : cotasAtuais.origem === "padrao"
                ? "⚠️ Valores padrão SUGERIDOS, sem fonte técnica nem homologação. O rio só será classificado depois que você informar e salvar as cotas do ponto de medição correspondente."
                : "Cotas definidas por quem opera o sistema, sem homologação técnica documentada: valide-as para o ponto de medição. Este sistema não controla quem pode alterá-las.";
          }
        }
        if ($("boxStatusRioHist") && Estacao.avaliarNivelRio) {
          var bxRio = $("boxStatusRioHist");
          bxRio.textContent = "";
          var ultDiaRio = chaves[chaves.length - 1];
          var dUltRio = dias[ultDiaRio];
          var avRioUlt = Estacao.avaliarNivelRio(dUltRio.nvMax, dUltRio.nvDelta, cotasAtuais, Estacao.qualidadeNivel(dUltRio));
          var banRio = el("div", "desliz-banner");
          banRio.dataset.rio = avRioUlt.id || "sem_dado";
          banRio.appendChild(el("strong", "", avRioUlt.icone + " Último dia na Régua (" + fdataLonga(ultDiaRio) + "): " + avRioUlt.estado.toUpperCase()));
          banRio.appendChild(el("span", "", "Nível Máx: " + f2(dUltRio.nvMax) + " m · Mín: " + f2(dUltRio.nvMin) + " m · Variação no dia (Δ): " + (dUltRio.nvDelta === null || dUltRio.nvDelta === undefined ? "—" : "+" + Math.round(dUltRio.nvDelta * 100) + " cm") + " · Leituras de nível em " + (dUltRio.cobHorasNivel === undefined ? "?" : dUltRio.cobHorasNivel) + "/24 h"));
          banRio.appendChild(el("small", "", avRioUlt.motivo));
          bxRio.appendChild(banRio);
        }
        var gn = $("gNivel"); gn.textContent = ""; gn.appendChild(graficoNivel(dias, chaves));
      }
    }
    if ($("cardChuva")) {
      $("cardChuva").hidden = (sl.id === "regua" && total === 0 && !temTemp);
      var g1 = $("gChuva"); g1.textContent = ""; g1.appendChild(graficoChuva(dias, chaves));
      $("notaParcial").textContent = incompletos ? incompletos + " dia(s) incompleto(s) ou sem detalhe horário (barras claras): a chuva desses dias é um valor MÍNIMO, pode estar subestimada." : "";
    }
    if ($("cardTemp")) {
      $("cardTemp").hidden = !temTemp;
      if (temTemp) {
        var g2 = $("gTemp"); g2.textContent = ""; g2.appendChild(graficoTemp(dias, chaves));
      }
    }

    var tb = $("tabela"); tb.textContent = "";
    var ehRegua = sl.id === "regua";
    function tdJanela(j) {
      var td = el("td");
      if (!j) { td.textContent = "—"; return td; }
      if (j.estado === "OK") {
        td.textContent = f1(j.valor) + " mm";
        td.title = j.leituras + " leitura(s) · " + j.horasComDado + "/" + j.horasEsperadas + " h cobertas";
      } else {
        var sp = el("span", "dados-insuf", "Dados insuficientes");
        sp.title = j.motivo + (j.minimoParcial !== null && j.minimoParcial !== undefined ? " · soma parcial (NÃO é o acumulado): " + f1(j.minimoParcial) + " mm" : "");
        td.appendChild(sp);
      }
      return td;
    }
    function tdCobertura(dq) {
      var h = ehRegua ? dq.cobHorasNivel : dq.cobHoras;
      var td = el("td", "", h === undefined ? "sem detalhe" : h + "/24 h" + (!ehRegua && (dq.lacunas || []).length ? " · " + dq.lacunas.length + " lacuna(s)" : ""));
      td.title = h === undefined ? "Dia guardado por versão anterior: reimporte o CSV" :
        "Intervalo típico: " + (dq.intMin === null || dq.intMin === undefined ? "—" : dq.intMin + " min") + " · duplicadas: " + (dq.dup || 0) + " · inválidas: " + (dq.inv || 0) + " · fora de ordem: " + (dq.foraOrdem || 0);
      return td;
    }
    chaves.slice().reverse().forEach(function (k) {
      var d = dias[k], tr = el("tr");
      var txtNivel = (d.nvMax !== null && d.nvMax !== undefined)
        ? f2(d.nvMin) + "–" + f2(d.nvMax) + " m (Δ " + (d.nvDelta === null || d.nvDelta === undefined ? "—" : Math.round(d.nvDelta * 100)) + " cm)"
        : "—";
      var avDia = (typeof Deslizamento !== "undefined") ? Deslizamento.avaliarDiaEstacao(dias, k, estacao) : null;
      var temChuva = d.nChuva === undefined ? !ehRegua : d.nChuva > 0;
      var jn = avDia && avDia.janelas && temChuva ? avDia.janelas : null;
      var compl = ehRegua ? Estacao.qualidadeNivel(d).completo : Estacao.diaCompleto(d);

      tr.appendChild(el("td", "", fdataLonga(k) + (compl !== true ? " *" : "")));
      tr.appendChild(el("td", "", temChuva ? f1(d.chuva) + (Estacao.diaCompleto(d) !== true && d.chuva !== null && d.chuva !== undefined ? " (mín.)" : "") : "—"));
      tr.appendChild(tdJanela(jn && jn.max60));
      tr.appendChild(tdJanela(jn && jn.mov24));
      tr.appendChild(tdJanela(jn && jn.mov168));
      tr.appendChild(tdCobertura(d));

      var tdRisco = el("td");
      if (avDia && temChuva) {
        var bdg = el("span", "desliz-badge", avDia.icone + " " + avDia.estado);
        bdg.dataset.nivel = avDia.nivel === null ? "semdados" : String(avDia.nivel);
        if (!avDia.conclusivo) bdg.title = avDia.motivoIndisponibilidade;
        tdRisco.appendChild(bdg);
      } else {
        tdRisco.textContent = "—";
      }
      tr.appendChild(tdRisco);

      [
        temChuva ? f1(d.c10) : "—",
        d.tmin === null || d.tmin === undefined ? "—" : f1(d.tmin),
        d.tmax === null || d.tmax === undefined ? "—" : f1(d.tmax),
        d.umid === null || d.umid === undefined ? "—" : Math.round(d.umid) + "%",
        d.vmax === null || d.vmax === undefined ? "—" : f1(d.vmax),
        txtNivel
      ].forEach(function (x) { tr.appendChild(el("td", "", x)); });
      tb.appendChild(tr);
    });
  }

  var importando = false;

  function lerArquivoTexto(f) {
    return new Promise(function (resolve) {
      var max = Estacao.LIMITES_IMPORTACAO.maxBytesArquivo;
      if (f.size > max) { resolve({ nome: f.name, tamanho: f.size, erroLeitura: "arquivo maior que " + Math.round(max / 1048576) + " MB" }); return; }
      var rd = new FileReader();
      rd.onerror = function () { resolve({ nome: f.name, tamanho: f.size, erroLeitura: (rd.error && rd.error.message) || "erro desconhecido" }); };
      rd.onload = function () { resolve({ nome: f.name, tamanho: f.size, texto: String(rd.result) }); };
      try { rd.readAsText(f); } catch (e) { resolve({ nome: f.name, tamanho: f.size, erroLeitura: e && e.message ? e.message : "erro de leitura" }); }
    });
  }

  function textoRelatorioImportacao(rel) {
    var partes = [];
    rel.importados.forEach(function (r) {
      var extra = [];
      if (r.descartadas) extra.push(r.descartadas + " linha(s) descartada(s)");
      if (r.duplicados) extra.push(r.duplicados + " duplicada(s)");
      if (r.invalidos) extra.push(r.invalidos + " valor(es) de chuva inválido(s)");
      if (r.foraDeOrdem) extra.push(r.foraDeOrdem + " fora de ordem");
      partes.push("✔ " + r.nome + " → " + r.rotulo + " (" + r.estacao + "): +" + r.add + " dia(s) novo(s), " + r.subst + " atualizado(s), " + r.mantidos + " mantido(s)" + (extra.length ? " [" + extra.join("; ") + "]" : ""));
    });
    rel.rejeitados.forEach(function (r) { partes.push("✖ " + r.nome + ": " + r.motivo); });
    return "Importação — importados: " + rel.importados.length + ", rejeitados: " + rel.rejeitados.length + ". " + partes.join(" | ");
  }

  // Lê os arquivos, valida e monta TUDO em memória; só grava se a importação puder ser concluída. Falha não altera o histórico.
  function lerArquivosMultiplos(arquivos) {
    var lista = Array.prototype.slice.call(arquivos || []);
    if (!lista.length) return;
    var destinoPadrao = slotForcadoUpload || ($("slotDestino") ? $("slotDestino").value : "auto");
    slotForcadoUpload = null;
    if (importando) { aviso("Já existe uma importação em andamento. Aguarde terminar antes de enviar outros arquivos.", true); return; }
    var lim = Estacao.LIMITES_IMPORTACAO;
    if (lista.length > lim.maxArquivos) { aviso("Selecione no máximo " + lim.maxArquivos + " arquivos CSV por importação (selecionados: " + lista.length + "). Nenhum dado foi alterado.", true); return; }
    var totalBytes = lista.reduce(function (t, f) { return t + (f.size || 0); }, 0);
    if (totalBytes > lim.maxBytesTotal) { aviso("Tamanho total dos arquivos maior que " + Math.round(lim.maxBytesTotal / 1048576) + " MB. Nenhum dado foi alterado.", true); return; }

    importando = true;
    if ($("escolher")) $("escolher").disabled = true;
    Promise.all(lista.map(lerArquivoTexto)).then(function (arqs) {
      var atual = Estacao.carregarBanco(); // dado mais recente (outra aba pode ter alterado)
      if (atual.erroCarga) throw new Error(atual.erroCarga + " Importação cancelada.");
      var plano = Estacao.planejarImportacao(atual, arqs, destinoPadrao);
      if (plano.alterado) {
        if (!Estacao.salvarBanco(plano.banco)) throw new Error("Não foi possível gravar neste navegador (modo privado ou armazenamento cheio).");
        banco = plano.banco;
      }
      desenhar(false);
      aviso(textoRelatorioImportacao(plano.relatorio), plano.relatorio.rejeitados.length > 0);
    }).catch(function (e) {
      if (typeof console !== "undefined") console.error("[historico] importação:", e);
      aviso("Importação não realizada: " + (e && e.message ? e.message : "erro inesperado") + " Os dados existentes foram preservados.", true);
    }).then(function () {
      importando = false;
      if ($("escolher")) $("escolher").disabled = false;
    });
  }

  $("arquivo").onchange = function () {
    var fs = this.files;
    if (fs && fs.length) lerArquivosMultiplos(fs);
    this.value = "";
  };
  $("escolher").onclick = function () { slotForcadoUpload = null; $("arquivo").click(); };
  if ($("imprimir")) $("imprimir").onclick = function () { window.print(); };
  if ($("fperiodo")) $("fperiodo").onchange = function () { desenhar(true); };
  $("limpar").onclick = function () {
    var sl = slotAtual();
    if (!confirm("Apagar o histórico guardado de “" + (sl.estacao || sl.rotulo) + "” neste navegador? Seus arquivos CSV não são afetados.")) return;
    sl.dias = {}; sl.estacao = ""; sl.sn = "";
    guardar();
    aviso("Histórico de " + sl.rotulo + " apagado."); desenhar(false);
  };
  if ($("limparTudo")) {
    $("limparTudo").onclick = function () {
      if (!confirm("Apagar o histórico das 3 estações e da régua de nível guardado neste navegador?")) return;
      banco = Estacao.criarBancoVazio();
      guardar();
      aviso("Todos os históricos foram apagados."); desenhar(false);
    };
  }
  if ($("btnSalvarCotasRio") && Estacao.salvarCotasRio) {
    $("btnSalvarCotasRio").onclick = function () {
      var b = this;
      if (!b.dataset.originalHtml) b.dataset.originalHtml = b.innerHTML;
      var entrada = { atencaoM: $("cotaAtencaoM").value, alertaM: $("cotaAlertaM").value, transbordoM: $("cotaTransbordoM").value };
      if ($("cotaPonto")) entrada.pontoMedicao = $("cotaPonto").value;
      try {
        var salvas = Estacao.salvarCotasRio(entrada);
        desenhar(true);
        aviso("Cotas salvas (Atenção: " + f2(salvas.atencaoM) + " m · Alerta: " + f2(salvas.alertaM) + " m · Transbordamento: " + f2(salvas.transbordoM) + " m). São parâmetros definidos por você, sem homologação técnica documentada.", false);
        b.disabled = true; b.innerHTML = "✅ Cotas salvas!";
        setTimeout(function () { b.innerHTML = b.dataset.originalHtml; b.disabled = false; }, 2000);
      } catch (e) {
        aviso((e && e.message ? e.message : "Cotas inválidas") + ". As cotas anteriores foram mantidas.", true);
      }
    };
  }
  if ($("btnExportarTudoHist") && Estacao.gerarBackupCompleto) {
    $("btnExportarTudoHist").onclick = function () {
      var bkp;
      try { bkp = Estacao.gerarBackupCompleto(); } catch (e) { if (typeof console !== "undefined") console.error(e); aviso("Backup NÃO exportado: dados locais ilegíveis (" + (e && e.message ? e.message : "erro") + ").", true); return; }
      var blob = new Blob([JSON.stringify(bkp, null, 2)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "backup-completo-defesa-civil-cajamar-" + new Date().toISOString().slice(0, 10) + ".json";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      aviso("Backup completo do sistema exportado (.json).", false);
    };
  }
  if ($("btnImportarTudoHist") && $("arqBackupTudoHist") && Estacao.restaurarBackupCompleto) {
    $("btnImportarTudoHist").onclick = function () { $("arqBackupTudoHist").click(); };
    $("arqBackupTudoHist").onchange = function () {
      var f = this.files && this.files[0];
      this.value = "";
      if (!f) return;
      if (f.size > Estacao.LIMITES_IMPORTACAO.maxBytesArquivo) { aviso("Backup NÃO restaurado: arquivo grande demais. Nenhum dado foi alterado.", true); return; }
      var rd = new FileReader();
      rd.onerror = function () { aviso("Backup NÃO restaurado: falha na leitura do arquivo. Nenhum dado foi alterado.", true); };
      rd.onload = function () {
        try {
          var res = Estacao.restaurarBackupCompleto(String(rd.result));
          banco = Estacao.carregarBanco();
          desenhar(false);
          aviso("Backup restaurado por completo: " + res.estacoesRestauradas + " equipamento(s) tocado(s) (+" + res.diasAdicionados + " dia(s) novo(s), " + res.diasAtualizados + " atualizado(s), " + res.diasMantidos + " mantido(s)), +" + res.ocorrenciasNovas + " ocorrência(s), +" + res.observacoesNovas + " observação(ões); cotas: " + res.cotas + "; contato: " + res.contato + "." + (res.avisos.length ? " " + res.avisos.join(" ") : ""), false);
        } catch (e) {
          if (typeof console !== "undefined") console.error("[historico] restauração:", e);
          aviso((e && e.message ? e.message : "Backup não restaurado") + " Nenhum dado foi alterado ou a alteração foi revertida.", true);
        }
      };
      rd.readAsText(f);
    };
  }

  desenhar(false);
  if (banco.erroCarga) aviso(banco.erroCarga, true);
  window.addEventListener("storage", function (ev) {
    if (!ev || !ev.key || ev.key.indexOf("cajamar:estacoes") === 0 || ev.key.indexOf("cajamar:cotas_rio") === 0) {
      banco = Estacao.carregarBanco();
      desenhar(false);
    }
  });
})();
