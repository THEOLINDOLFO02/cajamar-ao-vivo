// Compara a chuva diária medida (1 a 3 estações meteorológicas) e a régua de nível do rio
// com as previsões dos boletins/modelos meteorológicos (Open-Meteo D-1, ECMWF e GFS).
(function () {
  "use strict";
  var LAT = -23.3547, LON = -46.8764, LIMITE = 1;
  var SVGNS = "http://www.w3.org/2000/svg";
  var $ = function (i) { return document.getElementById(i); };
  var banco = Estacao.carregarBanco();
  var slotUploadComp = null;

  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x !== undefined) e.textContent = x; return e; }
  function sv(t, a) { var e = document.createElementNS(SVGNS, t); for (var k in a) e.setAttribute(k, a[k]); return e; }
  function f1(v) { return v === null || v === undefined || !isFinite(v) ? "—" : v.toFixed(1).replace(".", ","); }
  function f2(v) { return v === null || v === undefined || !isFinite(v) ? "—" : v.toFixed(2).replace(".", ","); }
  function fd(k) { return k.slice(8, 10) + "/" + k.slice(5, 7); }
  function fdLonga(k) { return k.slice(8, 10) + "/" + k.slice(5, 7) + "/" + k.slice(0, 4); }
  function aviso(t, ruim) { var a = $("aviso"); a.hidden = !t; a.textContent = t || ""; a.className = "warn" + (ruim ? " ruim" : ""); }
  function cartao(rot, val, nota) { var d = el("div", "cx"); d.appendChild(el("span", "", rot)); d.appendChild(el("strong", "", val)); if (nota) d.appendChild(el("small", "", nota)); return d; }

  function atualizarPainelSlots() {
    banco = Estacao.carregarBanco();
    var g = $("gradeSlotsComp");
    if (g) {
      g.textContent = "";
      Estacao.SLOTS_PADRAO.forEach(function (info) {
        var sl = banco.slots[info.id];
        var chaves = Object.keys(sl.dias || {}).sort();
        var selAtual = $("selEstacaoComp") ? $("selEstacaoComp").value : banco.ativo;
        var ativo = (info.id === "regua" && $("selReguaComp") && $("selReguaComp").value === "sim" && chaves.length > 0) ||
                    (info.id !== "regua" && (selAtual === info.id || (selAtual === "todas" && chaves.length > 0)));
        var card = el("div", "slot-card" + (ativo ? " ativo" : ""));
        var icone = info.id === "regua" ? "🌊 " : "🌡️ ";
        var topo = el("div", "slot-topo");
        topo.appendChild(el("strong", "", icone + info.rotulo));
        topo.appendChild(el("span", "slot-badge " + (chaves.length ? "ok" : "vazio"), chaves.length ? chaves.length + " dia(s)" : "Sem CSV"));
        card.appendChild(topo);

        card.appendChild(el("p", "slot-nome", sl.estacao || (chaves.length ? info.rotulo : "Nenhum CSV enviado")));
        if (chaves.length) {
          card.appendChild(el("small", "mut", fdLonga(chaves[0]) + " a " + fdLonga(chaves[chaves.length - 1])));
        } else {
          card.appendChild(el("small", "mut", info.id === "regua" ? "Envia leitura de nível do rio (m)" : "Envia chuva e clima da estação"));
        }

        var acoes = el("div", "slot-acoes");
        if (info.id !== "regua" && chaves.length) {
          var btnUsar = el("button", "btn small" + (selAtual === info.id ? " primary" : ""), selAtual === info.id ? "✓ Escolhida" : "Escolher esta");
          btnUsar.type = "button";
          btnUsar.onclick = function () {
            if ($("selEstacaoComp")) $("selEstacaoComp").value = info.id;
            atualizarPainelSlots();
          };
          acoes.appendChild(btnUsar);
        }
        var btnUp = el("button", "btn small", chaves.length ? "📂 Atualizar CSV" : "📂 Enviar CSV");
        btnUp.type = "button";
        btnUp.onclick = function () {
          slotUploadComp = info.id;
          $("arqComp").click();
        };
        acoes.appendChild(btnUp);
        card.appendChild(acoes);
        g.appendChild(card);
      });
    }

    var sel = $("selEstacaoComp");
    if (sel) {
      var valAnt = sel.value || banco.ativo || "est1";
      sel.textContent = "";
      ["est1", "est2", "est3"].forEach(function (id, idx) {
        var s = banco.slots[id];
        var nDias = Object.keys(s.dias || {}).length;
        var nome = s.estacao ? s.estacao : ("Estação Meteorológica " + (idx + 1));
        var opt = el("option", "", nome + (nDias ? " (" + nDias + " dias)" : " (sem CSV)"));
        opt.value = id;
        sel.appendChild(opt);
      });
      var optTodas = el("option", "", "Todas as estações carregadas (comparar lado a lado + média)");
      optTodas.value = "todas";
      sel.appendChild(optTodas);

      var temDadosValAnt = valAnt === "todas" || (banco.slots[valAnt] && Object.keys(banco.slots[valAnt].dias || {}).length > 0);
      if (!temDadosValAnt) {
        if (Object.keys(banco.slots.est1.dias || {}).length) valAnt = "est1";
        else if (Object.keys(banco.slots.est2.dias || {}).length) valAnt = "est2";
        else if (Object.keys(banco.slots.est3.dias || {}).length) valAnt = "est3";
      }
      sel.value = valAnt;
    }

    renderizarQuadroSimultaneo();
  }

  function renderizarQuadroSimultaneo() {
    var card = $("cardSimultaneo");
    if (!card) return;
    var s1 = banco.slots.est1 || { dias: {} };
    var s2 = banco.slots.est2 || { dias: {} };
    var s3 = banco.slots.est3 || { dias: {} };
    var sr = banco.slots.regua || { dias: {} };

    var mapaDatas = {};
    [s1, s2, s3, sr].forEach(function (sl) {
      Object.keys(sl.dias || {}).forEach(function (k) { mapaDatas[k] = true; });
    });
    var datas = Object.keys(mapaDatas).sort().reverse();
    if (!datas.length) {
      card.hidden = true;
      return;
    }
    card.hidden = false;

    if ($("thSimEst1")) $("thSimEst1").textContent = "🌡️ " + (s1.estacao || "Estação 1");
    if ($("thSimEst2")) $("thSimEst2").textContent = "🌡️ " + (s2.estacao || "Estação 2");
    if ($("thSimEst3")) $("thSimEst3").textContent = "🌡️ " + (s3.estacao || "Estação 3");

    var tot1 = 0, n1 = 0, tot2 = 0, n2 = 0, tot3 = 0, n3 = 0, maxNv = null, maxDelta = null;
    var tb = $("tbSimultaneo");
    tb.textContent = "";

    datas.forEach(function (k) {
      var d1 = s1.dias ? s1.dias[k] : null;
      var d2 = s2.dias ? s2.dias[k] : null;
      var d3 = s3.dias ? s3.dias[k] : null;
      var dr = sr.dias ? sr.dias[k] : null;
      if (!dr) {
        [d1, d2, d3].forEach(function (dx) {
          if (dx && dx.nvMax !== null && dx.nvMax !== undefined && !dr) dr = dx;
        });
      }

      var vals = [];
      if (d1) { tot1 += d1.chuva; n1++; vals.push(d1.chuva); }
      if (d2) { tot2 += d2.chuva; n2++; vals.push(d2.chuva); }
      if (d3) { tot3 += d3.chuva; n3++; vals.push(d3.chuva); }
      if (dr && dr.nvMax !== null && dr.nvMax !== undefined) {
        if (!maxNv || dr.nvMax > maxNv.v) maxNv = { v: dr.nvMax, k: k };
        if (!maxDelta || (dr.nvDelta || 0) > maxDelta.v) maxDelta = { v: dr.nvDelta || 0, k: k };
      }

      var tr = el("tr");
      tr.appendChild(el("td", "", fdLonga(k)));
      [d1, d2, d3].forEach(function (dx) {
        if (!dx) {
          tr.appendChild(el("td", "mut", "—"));
        } else {
          tr.appendChild(el("td", "", f1(dx.chuva) + " mm (1h: " + f1(dx.c60) + " mm)"));
        }
      });

      if (vals.length) {
        var media = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
        var diffEspacial = vals.length > 1 ? (Math.max.apply(null, vals) - Math.min.apply(null, vals)) : 0;
        tr.appendChild(el("td", "", f1(media) + " mm" + (vals.length > 1 ? " (Δ " + f1(diffEspacial) + " mm)" : "")));
      } else {
        tr.appendChild(el("td", "mut", "—"));
      }

      if (dr && dr.nvMax !== null && dr.nvMax !== undefined) {
        tr.appendChild(el("td", "", f2(dr.nvMin) + " a " + f2(dr.nvMax) + " m (+" + Math.round((dr.nvDelta || 0) * 100) + " cm)"));
      } else {
        tr.appendChild(el("td", "mut", "—"));
      }
      tb.appendChild(tr);
    });

    var rs = $("resumoSimultaneo");
    if (rs) {
      rs.textContent = "";
      if (n1) rs.appendChild(cartao("🌡️ " + (s1.estacao || "Estação 1"), f1(tot1) + " mm", n1 + " dia(s) carregado(s)"));
      if (n2) rs.appendChild(cartao("🌡️ " + (s2.estacao || "Estação 2"), f1(tot2) + " mm", n2 + " dia(s) carregado(s)"));
      if (n3) rs.appendChild(cartao("🌡️ " + (s3.estacao || "Estação 3"), f1(tot3) + " mm", n3 + " dia(s) carregado(s)"));
      if (maxNv) rs.appendChild(cartao("🌊 Pico na Régua do Rio", f2(maxNv.v) + " m", "em " + fdLonga(maxNv.k) + (maxDelta ? " (Δ máx +" + Math.round(maxDelta.v * 100) + " cm)" : "")));
    }
  }

  function importarArquivosComp(arquivos) {
    var lista = Array.prototype.slice.call(arquivos || []);
    if (!lista.length) return;
    var alvoForcado = slotUploadComp;
    slotUploadComp = null;
    var resumos = [], erros = [], lidos = 0;

    lista.forEach(function (f) {
      var rd = new FileReader();
      rd.onerror = function () { erros.push(f.name + ": erro de leitura"); fim(); };
      rd.onload = function () {
        try {
          var rows = Estacao.lerCsv(String(rd.result));
          var alvo = lista.length > 1 ? "auto" : (alvoForcado || "auto");
          var r = Estacao.mesclarNoSlot(banco, alvo, rows, f.name);
          if (r.slotId !== "regua" && $("selEstacaoComp")) $("selEstacaoComp").value = r.slotId;
          if (r.slotId === "regua" && $("selReguaComp")) $("selReguaComp").value = "sim";
          resumos.push(r.rotulo + " (" + r.estacao + "): " + r.totalDias + " dia(s)");
        } catch (e) {
          erros.push(f.name + ": " + (e && e.message ? e.message : "formato inválido"));
        }
        fim();
      };
      rd.readAsText(f);
    });

    function fim() {
      lidos++;
      if (lidos < lista.length) return;
      Estacao.salvarBanco(banco);
      atualizarPainelSlots();
      if (erros.length && !resumos.length) {
        aviso("Não foi possível importar: " + erros.join(" | "), true);
      } else {
        aviso("CSV(s) carregado(s): " + resumos.join(" · ") + (erros.length ? " | Erros: " + erros.join(" | ") : "") + ". Clique em “Comparar” abaixo.", false);
      }
    }
  }

  function graficoComparativo(linhas, temNivel) {
    var W = 720, H = 220, x0 = 40, x1 = temNivel ? W - 44 : W - 10, y0 = 12, y1 = H - 28;
    var svg = sv("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Gráfico comparativo de chuva medida, prevista e nível do rio", class: "graf" });
    var maxChuva = 5;
    linhas.forEach(function (x) {
      if (x.med > maxChuva) maxChuva = x.med;
      if (x.prev > maxChuva) maxChuva = x.prev;
    });
    maxChuva = maxChuva > 10 ? Math.ceil(maxChuva / 10) * 10 : Math.ceil(maxChuva / 5) * 5;

    [0, 0.5, 1].forEach(function (f) {
      var y = y1 - f * (y1 - y0);
      svg.appendChild(sv("line", { x1: x0, x2: x1, y1: y, y2: y, class: "grd" }));
      var t = sv("text", { x: x0 - 4, y: y + 3, "text-anchor": "end", class: "eix" });
      t.textContent = Math.round(maxChuva * f) + "mm";
      svg.appendChild(t);
    });

    var larg = x1 - x0;
    var passoGrupo = larg / linhas.length;
    var bw = Math.max(2, Math.min(14, passoGrupo * 0.36));

    linhas.forEach(function (x, i) {
      var cx = x0 + (i + 0.5) * passoGrupo;
      var hMed = (x.med / maxChuva) * (y1 - y0);
      var hPrev = (x.prev / maxChuva) * (y1 - y0);

      var rMed = sv("rect", { x: cx - bw - 1, y: y1 - hMed, width: bw, height: Math.max(hMed, x.med > 0 ? 1.5 : 0), class: "barra" });
      var tt1 = sv("title", {}); tt1.textContent = fdLonga(x.k) + " · Medido: " + f1(x.med) + " mm"; rMed.appendChild(tt1);
      svg.appendChild(rMed);

      var rPrev = sv("rect", { x: cx + 1, y: y1 - hPrev, width: bw, height: Math.max(hPrev, x.prev > 0 ? 1.5 : 0), fill: "var(--yel)", opacity: "0.85" });
      var tt2 = sv("title", {}); tt2.textContent = fdLonga(x.k) + " · Previsto D-1: " + f1(x.prev) + " mm"; rPrev.appendChild(tt2);
      svg.appendChild(rPrev);
    });

    if (temNivel) {
      var vsNv = [];
      linhas.forEach(function (x) { if (x.nvMax !== null && x.nvMax !== undefined) vsNv.push(x.nvMax); });
      if (vsNv.length) {
        var mnNv = Math.max(0, Math.floor(Math.min.apply(null, vsNv) * 2) / 2 - 0.1);
        var mxNv = Math.ceil(Math.max.apply(null, vsNv) * 2) / 2 + 0.1;
        if (mxNv <= mnNv) mxNv = mnNv + 1;
        [0, 0.5, 1].forEach(function (f) {
          var y = y1 - f * (y1 - y0);
          var t = sv("text", { x: x1 + 4, y: y + 3, "text-anchor": "start", class: "eix" });
          t.textContent = (mnNv + f * (mxNv - mnNv)).toFixed(2).replace(".", ",") + "m";
          svg.appendChild(t);
        });
        var pts = [];
        linhas.forEach(function (x, i) {
          if (x.nvMax === null || x.nvMax === undefined) return;
          var px = (x0 + (i + 0.5) * passoGrupo).toFixed(1);
          var py = (y1 - ((x.nvMax - mnNv) / (mxNv - mnNv)) * (y1 - y0)).toFixed(1);
          pts.push(px + "," + py);
        });
        if (pts.length) svg.appendChild(sv("polyline", { points: pts.join(" "), class: "lin max" }));
      }
    }

    var step = Math.max(1, Math.ceil(linhas.length / 10));
    linhas.forEach(function (x, i) {
      if (i % step) return;
      var t = sv("text", { x: x0 + (i + 0.5) * passoGrupo, y: H - 8, "text-anchor": "middle", class: "eix" });
      t.textContent = fd(x.k);
      svg.appendChild(t);
    });
    return svg;
  }

  async function buscarJsonTimeout(url, ms) {
    var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, ms || 20000);
    try {
      var r = await fetch(url, { signal: ctl.signal });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } finally {
      clearTimeout(t);
    }
  }

  function numValido(v) { return typeof v === "number" && isFinite(v) ? v : null; }

  async function rodar() {
    banco = Estacao.carregarBanco();
    var modoEst = $("selEstacaoComp") ? $("selEstacaoComp").value : "est1";
    var usarRegua = $("selReguaComp") ? $("selReguaComp").value === "sim" : true;
    var aceitarParciais = $("selDiasParciais") ? $("selDiasParciais").value === "todos" : false;
    // Dia completo = cobertura horária completa e sem lacunas (mesma definição do histórico), não uma contagem fixa de leituras.
    var diaValido = function (d) { return !!d && numValido(d.chuva) !== null && (aceitarParciais || Estacao.diaCompleto(d) === true); };

    var estacoesAtivas = [];
    if (modoEst === "todas") {
      ["est1", "est2", "est3"].forEach(function (id) {
        if (Object.keys(banco.slots[id].dias || {}).length) estacoesAtivas.push(banco.slots[id]);
      });
    } else if (banco.slots[modoEst] && Object.keys(banco.slots[modoEst].dias || {}).length) {
      estacoesAtivas.push(banco.slots[modoEst]);
    }

    var reguaSlot = banco.slots.regua;
    var diasRegua = (usarRegua && reguaSlot && reguaSlot.dias) ? reguaSlot.dias : {};

    var mapaDatas = {};
    estacoesAtivas.forEach(function (sl) {
      Object.keys(sl.dias || {}).forEach(function (k) {
        if (diaValido(sl.dias[k])) mapaDatas[k] = true;
      });
    });
    var chaves = Object.keys(mapaDatas).sort();

    if (!chaves.length) {
      aviso("Sem dias suficientes para comparar: envie o CSV de pelo menos 1 estação acima (ou mude “Dias no CSV” para “Todos os dias importados”).", true);
      $("dadosComp").hidden = true;
      return;
    }

    aviso("Consultando boletins/modelos históricos no Open-Meteo (Previsão D-1 e Multimodelo)…");
    var btnRodar = $("rodar");
    if (btnRodar && !btnRodar.dataset.originalHtml) btnRodar.dataset.originalHtml = btnRodar.innerHTML;
    if (btnRodar) { btnRodar.disabled = true; btnRodar.innerHTML = "⏳ Consultando modelos…"; }
    try {
      var dIni = chaves[0], dFim = chaves[chaves.length - 1];
      var urlPrevRuns = "https://previous-runs-api.open-meteo.com/v1/forecast?latitude=" + LAT + "&longitude=" + LON +
        "&hourly=precipitation_previous_day1&start_date=" + dIni + "&end_date=" + dFim + "&timezone=America%2FSao_Paulo";
      var urlModelos = "https://historical-forecast-api.open-meteo.com/v1/forecast?latitude=" + LAT + "&longitude=" + LON +
        "&start_date=" + dIni + "&end_date=" + dFim + "&daily=precipitation_sum&models=best_match,ecmwf_ifs04,gfs_seamless&timezone=America%2FSao_Paulo";

      var resRuns = await buscarJsonTimeout(urlPrevRuns, 20000);
      if (!resRuns.hourly || !Array.isArray(resRuns.hourly.time)) throw new Error("formato inesperado da API Previous Runs");

      // Cada valor horário é a soma da hora ANTERIOR ao instante: a soma por data cobre 23:00 do dia anterior até 23:00 do dia
      // (deslocada 1 h do dia civil da estação). O dia só vale com as 24 horas numéricas; senão fica fora da comparação.
      var prevD1 = {}, nulos = {}, contH = {};
      resRuns.hourly.time.forEach(function (h, i) {
        var d = h.slice(0, 10), v = resRuns.hourly.precipitation_previous_day1[i];
        if (typeof v !== "number" || !isFinite(v) || v < 0) { nulos[d] = (nulos[d] || 0) + 1; return; }
        contH[d] = (contH[d] || 0) + 1;
        prevD1[d] = (prevD1[d] || 0) + v;
      });
      Object.keys(contH).forEach(function (d) { if (contH[d] !== 24) { nulos[d] = (nulos[d] || 0) + (24 - contH[d]); } });

      var modEcmwf = {}, modGfs = {};
      try {
        var resMod = await buscarJsonTimeout(urlModelos, 12000);
        if (resMod && resMod.daily && Array.isArray(resMod.daily.time)) {
          var arrEc = resMod.daily.precipitation_sum_ecmwf_ifs04 || []; // sem substituir por outro modelo: coluna ECMWF só traz ECMWF
          var arrGfs = resMod.daily.precipitation_sum_gfs_seamless || [];
          resMod.daily.time.forEach(function (d, i) {
            if (typeof arrEc[i] === "number") modEcmwf[d] = arrEc[i];
            if (typeof arrGfs[i] === "number") modGfs[d] = arrGfs[i];
          });
        }
      } catch (eMod) { if (typeof console !== "undefined") console.warn("[comparar] modelos ECMWF/GFS indisponíveis:", eMod); }

      var linhas = [];
      var temAlgumNivel = false;

      chaves.forEach(function (k) {
        if (prevD1[k] === undefined || (nulos[k] || 0) > 0) return;
        var valsEst = [];
        var nvMinDia = null, nvMaxDia = null, nvDeltaDia = null;

        estacoesAtivas.forEach(function (sl) {
          var d = sl.dias[k];
          if (diaValido(d)) {
            valsEst.push({ id: sl.id, nome: sl.estacao || sl.rotulo, chuva: d.chuva });
            if (usarRegua && d.nvMax !== null && d.nvMax !== undefined) {
              nvMinDia = d.nvMin; nvMaxDia = d.nvMax; nvDeltaDia = d.nvDelta;
            }
          }
        });
        if (!valsEst.length) return;

        if (usarRegua && diasRegua[k] && diasRegua[k].nvMax !== null && diasRegua[k].nvMax !== undefined) {
          nvMinDia = diasRegua[k].nvMin;
          nvMaxDia = diasRegua[k].nvMax;
          nvDeltaDia = diasRegua[k].nvDelta;
        }
        if (nvMaxDia !== null && nvMaxDia !== undefined) temAlgumNivel = true;

        var somaMed = valsEst.reduce(function (s, x) { return s + x.chuva; }, 0);
        var medRef = somaMed / valsEst.length;

        linhas.push({
          k: k,
          med: medRef,
          porEstacao: valsEst,
          prev: prevD1[k],
          ecmwf: modEcmwf[k] !== undefined ? modEcmwf[k] : null,
          gfs: modGfs[k] !== undefined ? modGfs[k] : null,
          nvMin: nvMinDia,
          nvMax: nvMaxDia,
          nvDelta: nvDeltaDia
        });
      });

      if (!linhas.length) {
        aviso("O Open-Meteo não devolveu previsões antigas completas para esses dias.", true);
        return;
      }

      var sMed = 0, sPrev = 0, erro = 0, acertos = 0, choveuPrev = 0, choveuMed = 0, falso = 0, perdido = 0;
      var nvMaxPeriodo = null, nvMinPeriodo = null, maiorDeltaRio = { v: 0, k: linhas[0].k };

      linhas.forEach(function (x) {
        sMed += x.med; sPrev += x.prev; erro += Math.abs(x.prev - x.med);
        var cm = x.med >= LIMITE, cp = x.prev >= LIMITE; x.ok = cm === cp;
        if (x.ok) acertos++;
        if (cm) choveuMed++;
        if (cp) choveuPrev++;
        if (cp && !cm) falso++;
        if (!cp && cm) perdido++;
        if (x.nvMax !== null && (nvMaxPeriodo === null || x.nvMax > nvMaxPeriodo.v)) nvMaxPeriodo = { v: x.nvMax, k: x.k };
        if (x.nvMin !== null && (nvMinPeriodo === null || x.nvMin < nvMinPeriodo.v)) nvMinPeriodo = { v: x.nvMin, k: x.k };
        if (x.nvDelta !== null && x.nvDelta > maiorDeltaRio.v) maiorDeltaRio = { v: x.nvDelta, k: x.k };
      });

      var rs = $("resumo"); rs.textContent = "";
      rs.appendChild(cartao("Dias comparados", String(linhas.length), fd(linhas[0].k) + " a " + fd(linhas[linhas.length - 1].k)));
      rs.appendChild(cartao(estacoesAtivas.length > 1 ? "Chuva medida (média)" : "Chuva medida (" + (estacoesAtivas[0].estacao || estacoesAtivas[0].rotulo) + ")", f1(sMed) + " mm", "soma no período"));

      if (estacoesAtivas.length > 1) {
        estacoesAtivas.forEach(function (sl) {
          var somaSl = linhas.reduce(function (acc, l) {
            var achou = l.porEstacao.filter(function (p) { return p.id === sl.id; })[0];
            return acc + (achou ? achou.chuva : 0);
          }, 0);
          rs.appendChild(cartao("🌡️ " + (sl.estacao || sl.rotulo), f1(somaSl) + " mm", "acumulado nos dias comparados"));
        });
      }

      rs.appendChild(cartao("Previsto (1 dia antes)", f1(sPrev) + " mm", (sPrev >= sMed ? "acima" : "abaixo") + " do medido em " + f1(Math.abs(sPrev - sMed)) + " mm"));
      rs.appendChild(cartao("Erro médio por dia", f1(erro / linhas.length) + " mm", "diferença absoluta média"));
      rs.appendChild(cartao("Acertou chuva/não", acertos + " de " + linhas.length + " (" + Math.round(acertos / linhas.length * 100) + "%)", "limite de 1 mm no dia"));
      rs.appendChild(cartao("Falsos alarmes / não prevista", falso + " / " + perdido, "previu e não choveu / choveu e não previu"));

      if (temAlgumNivel) {
        rs.appendChild(cartao("🌊 Nível Máx. na Régua", nvMaxPeriodo ? f2(nvMaxPeriodo.v) + " m" : "—", nvMaxPeriodo ? "em " + fdLonga(nvMaxPeriodo.k) : ""));
        rs.appendChild(cartao("🌊 Maior Subida Diária do Rio", Math.round(maiorDeltaRio.v * 100) + " cm (" + f2(maiorDeltaRio.v) + " m)", "em " + fdLonga(maiorDeltaRio.k)));
      }

      $("nota").textContent = "Período analisado: " + linhas.length + " dia(s), sendo " + choveuMed + " com chuva medida (≥ 1 mm) e " + choveuPrev + " com chuva prevista pelo boletim D-1." +
        (temAlgumNivel ? " Dados da Régua de Nível do Rio vinculados para análise de resposta hidrológica." : "");

      var gc = $("gComp");
      if (gc) {
        gc.textContent = "";
        gc.appendChild(graficoComparativo(linhas, temAlgumNivel));
      }

      var cab = $("cabComp");
      cab.textContent = "";
      cab.appendChild(el("th", "", "Dia"));
      if (estacoesAtivas.length > 1) {
        estacoesAtivas.forEach(function (sl) {
          cab.appendChild(el("th", "", sl.estacao || sl.rotulo));
        });
        cab.appendChild(el("th", "", "Média Est."));
      } else {
        cab.appendChild(el("th", "", "Medido (" + (estacoesAtivas[0].estacao || estacoesAtivas[0].rotulo) + ")"));
      }
      if (temAlgumNivel) {
        cab.appendChild(el("th", "", "🌊 Régua Nível (Mín–Máx / Δ)"));
      }
      cab.appendChild(el("th", "", "Previsto D-1"));
      cab.appendChild(el("th", "", "ECMWF / GFS"));
      cab.appendChild(el("th", "", "Diferença"));
      cab.appendChild(el("th", "", "Acertou chuva/não"));

      var tb = $("tabela"); tb.textContent = "";
      linhas.slice().reverse().forEach(function (x) {
        var tr = el("tr"), d = x.prev - x.med;
        tr.appendChild(el("td", "", fdLonga(x.k)));
        if (estacoesAtivas.length > 1) {
          estacoesAtivas.forEach(function (sl) {
            var p = x.porEstacao.filter(function (e) { return e.id === sl.id; })[0];
            tr.appendChild(el("td", "", p ? f1(p.chuva) + " mm" : "—"));
          });
          tr.appendChild(el("td", "", f1(x.med) + " mm"));
        } else {
          tr.appendChild(el("td", "", f1(x.med) + " mm"));
        }
        if (temAlgumNivel) {
          var txtNv = x.nvMax !== null && x.nvMax !== undefined
            ? f2(x.nvMin) + "–" + f2(x.nvMax) + " m (+" + Math.round((x.nvDelta || 0) * 100) + " cm)"
            : "—";
          tr.appendChild(el("td", "", txtNv));
        }
        tr.appendChild(el("td", "", f1(x.prev) + " mm"));
        var txtMod = (x.ecmwf !== null ? f1(x.ecmwf) : "—") + " / " + (x.gfs !== null ? f1(x.gfs) : "—");
        tr.appendChild(el("td", "", txtMod));
        tr.appendChild(el("td", "", (d > 0 ? "+" : "") + f1(d) + " mm"));
        var tdAc = el("td");
        var bdgAc = el("span", "desliz-badge", x.ok ? "✓ Sim" : (x.prev >= LIMITE ? "Falso alarme" : "Chuva não prev."));
        bdgAc.dataset.nivel = x.ok ? "0" : (x.prev >= LIMITE ? "1" : "2");
        tdAc.appendChild(bdgAc);
        tr.appendChild(tdAc);
        tb.appendChild(tr);
      });
      $("dadosComp").hidden = false;
      aviso("Comparação concluída com sucesso.", false);
      $("aviso").className = "warn ok";
      $("dadosComp").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      aviso("Não foi possível obter as previsões antigas agora (" + (e && e.message ? e.message : "falha") + "). Tente de novo mais tarde.", true);
    } finally {
      if (btnRodar) {
        btnRodar.disabled = false;
        if (btnRodar.dataset.originalHtml) btnRodar.innerHTML = btnRodar.dataset.originalHtml;
      }
    }
  }

  if ($("btnImportarMulti")) {
    $("btnImportarMulti").onclick = function () { slotUploadComp = null; $("arqComp").click(); };
  }
  if ($("arqComp")) {
    $("arqComp").onchange = function () {
      if (this.files && this.files.length) importarArquivosComp(this.files);
      this.value = "";
    };
  }
  if ($("selEstacaoComp")) $("selEstacaoComp").onchange = atualizarPainelSlots;
  if ($("selReguaComp")) $("selReguaComp").onchange = atualizarPainelSlots;
  $("rodar").onclick = rodar;

  atualizarPainelSlots();
  window.addEventListener("storage", function (ev) {
    if (!ev || !ev.key || ev.key.indexOf("cajamar:estacoes") === 0) {
      atualizarPainelSlots();
    }
  });
})();
