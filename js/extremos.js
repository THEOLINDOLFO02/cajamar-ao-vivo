// Recordes e extremos: a partir dos CSV importados neste aparelho (js/estacao.js), mostra qual dia choveu mais, o mais quente, o mais frio,
// vento, pressão, radiação, umidade e nível dos rios. Só repassa o que foi medido: não classifica risco e dado ausente nunca vira zero.
(function (w) {
  "use strict";
  var TOP = 5;

  function ok(v) { return typeof v === "number" && isFinite(v); }
  function dias(a, b) { return Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000); }

  // Lista plana { slot, estacao, data, d, completo } dos equipamentos que têm dado, já dentro do período e do filtro de equipamento.
  function listar(banco, filtros) {
    var f = filtros || {}, lista = [];
    if (!banco || !banco.slots) return lista;
    Object.keys(banco.slots).forEach(function (id) {
      var sl = banco.slots[id];
      if (!sl || !sl.dias) return;
      if (f.slot && f.slot !== "todas" && f.slot !== id) return;
      var nivel = w.Estacao ? w.Estacao.ehSlotNivel(id) : /^regua/.test(id);
      Object.keys(sl.dias).forEach(function (k) {
        if (f.de && k < f.de) return;
        if (f.ate && k > f.ate) return;
        var d = sl.dias[k];
        if (!d) return;
        var completo = null;
        if (w.Estacao) completo = nivel ? w.Estacao.qualidadeNivel(d).completo : w.Estacao.diaCompleto(d);
        if (f.apenasCompletos && completo !== true) return;
        lista.push({ slot: id, nivel: nivel, estacao: sl.estacao || sl.rotulo || id, data: k, d: d, completo: completo });
      });
    });
    return lista;
  }

  // Ordena por um valor (maior ou menor primeiro) ignorando dado ausente; desempate por data mais recente.
  function ranking(itens, valorDe, maior, n) {
    return itens
      .map(function (x) { return { slot: x.slot, estacao: x.estacao, data: x.data, valor: valorDe(x.d), completo: x.completo }; })
      .filter(function (x) { return ok(x.valor); })
      .sort(function (a, b) { return (maior ? b.valor - a.valor : a.valor - b.valor) || (a.data < b.data ? 1 : -1); })
      .slice(0, n || TOP);
  }

  function amplitude(d) { return ok(d.tmax) && ok(d.tmin) ? Math.round((d.tmax - d.tmin) * 10) / 10 : null; }
  function quedaPressao(d) { return ok(d.pmax) && ok(d.pmin) ? Math.round((d.pmax - d.pmin) * 10) / 10 : null; }

  function calcular(banco, filtros) {
    var todos = listar(banco, filtros);
    // Equipamentos que têm chuva (incluindo Réguas de Nível Jordanésia e Natura que possuem pluviômetro) entram nos recordes de chuva;
    // todos os que possuem sensores meteorológicos (temperatura, vento, pressão, umidade, radiação) entram nas respectivas tabelas.
    var met = todos;
    var rios = todos.filter(function (x) { return x.nivel || ok(x.d.nvMax); });
    var r = { filtros: filtros || {}, totalDias: todos.length, equipamentos: [], rios: [], acumuladosPeriodo: {} };

    // Maiores acumulados de chuva por janela (30, 60, 90, 180 / semestre e 365 / ano) entre todos os equipamentos filtrados
    if (w.Estacao && w.Estacao.maiorAcumuladoJanelaDias) {
      [30, 60, 90, 180, 365].forEach(function (nDias) {
        var listaJan = [];
        Object.keys(banco.slots || {}).forEach(function (id) {
          if (filtros && filtros.slot && filtros.slot !== "todas" && filtros.slot !== id) return;
          var sl = banco.slots[id];
          if (!sl || !sl.dias) return;
          var chs = Object.keys(sl.dias).filter(function (k) {
            if (filtros && filtros.de && k < filtros.de) return false;
            if (filtros && filtros.ate && k > filtros.ate) return false;
            return true;
          }).sort();
          var mj = w.Estacao.maiorAcumuladoJanelaDias(sl.dias, chs, nDias);
          if (mj && mj.valor > 0) {
            listaJan.push({ slot: id, estacao: sl.estacao || sl.rotulo || id, data: mj.fim, inicio: mj.inicio, valor: mj.valor, diasComDado: mj.diasComDado, completo: true });
          }
        });
        listaJan.sort(function (a, b) { return b.valor - a.valor; });
        r.acumuladosPeriodo["d" + nDias] = listaJan.slice(0, TOP);
      });
    }

    r.chuva = {
      dias: ranking(met, function (d) { return d.chuva; }, true),
      hora: ranking(met, function (d) { return d.c60; }, true, 3).filter(function (x) { return x.valor > 0; }),
      dezMin: ranking(met, function (d) { return d.c10; }, true, 3).filter(function (x) { return x.valor > 0; })
    };
    r.chuva.dias = r.chuva.dias.filter(function (x) { return x.valor > 0; });
    r.temperatura = {
      maisQuente: ranking(met, function (d) { return d.tmax; }, true),
      maisFrio: ranking(met, function (d) { return d.tmin; }, false),
      maiorAmplitude: ranking(met, amplitude, true, 3)
    };
    r.vento = { dias: ranking(met, function (d) { return d.vmax; }, true) };
    r.pressao = {
      maior: ranking(met, function (d) { return d.pmax; }, true, 3),
      menor: ranking(met, function (d) { return d.pmin; }, false, 3),
      maiorVariacao: ranking(met, quedaPressao, true, 3)
    };
    r.radiacao = { dias: ranking(met, function (d) { return d.radmax; }, true) };
    r.umidade = {
      maisUmido: ranking(met, function (d) { return ok(d.umax) ? d.umax : d.umid; }, true, 3),
      maisSeco: ranking(met, function (d) { return ok(d.umin) ? d.umin : d.umid; }, false, 3)
    };

    // por equipamento: resumo do período
    var porSlot = {};
    todos.forEach(function (x) { (porSlot[x.slot] = porSlot[x.slot] || []).push(x); });
    var ultimaGlobal = todos.reduce(function (m, x) { return x.data > m ? x.data : m; }, "");
    Object.keys(porSlot).forEach(function (id) {
      var l = porSlot[id].sort(function (a, b) { return a.data < b.data ? -1 : 1; });
      var e = { slot: id, nivel: l[0].nivel, estacao: l[0].estacao, dias: l.length, primeiro: l[0].data, ultimo: l[l.length - 1].data,
        incompletos: l.filter(function (x) { return x.completo !== true; }).length,
        diasSemLeituraAteFim: ultimaGlobal ? dias(l[l.length - 1].data, ultimaGlobal) : 0 };
      var comChuva = l.filter(function (x) { return ok(x.d.chuva); });
      e.chuvaTotal = comChuva.length ? Math.round(comChuva.reduce(function (s, x) { return s + x.d.chuva; }, 0) * 10) / 10 : null;
      e.diasComChuva = comChuva.filter(function (x) { return x.d.chuva >= 1; }).length;
      e.chuvaTotalMinimo = comChuva.some(function (x) { return x.completo !== true; });
      var tx = l.filter(function (x) { return ok(x.d.tmax); }), tn = l.filter(function (x) { return ok(x.d.tmin); });
      e.tmax = tx.length ? Math.max.apply(null, tx.map(function (x) { return x.d.tmax; })) : null;
      e.tmin = tn.length ? Math.min.apply(null, tn.map(function (x) { return x.d.tmin; })) : null;
      var vv = l.filter(function (x) { return ok(x.d.vmax); });
      e.vmax = vv.length ? Math.max.apply(null, vv.map(function (x) { return x.d.vmax; })) : null;
      r.equipamentos.push(e);
    });
    r.ultimaData = ultimaGlobal || null;

    // rios: por régua, maior nível e maior subida no dia (máximo − mínimo do próprio dia)
    var ids = {};
    rios.forEach(function (x) { ids[x.slot] = true; });
    Object.keys(ids).sort().forEach(function (id) {
      var meus = rios.filter(function (x) { return x.slot === id; });
      r.rios.push({
        slot: id, estacao: meus[0].estacao,
        maiorNivel: ranking(meus, function (d) { return d.nvMax; }, true),
        maiorSubida: ranking(meus, function (d) { return d.nvDelta; }, true, 3),
        menorNivel: ranking(meus, function (d) { return d.nvMin; }, false, 1)
      });
    });
    return r;
  }

  var api = { calcular: calcular, listar: listar, ranking: ranking };
  w.Extremos = api;

  // ---------- tela (só no navegador) ----------
  if (typeof document === "undefined") return;
  var el = function (t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x !== undefined) e.textContent = x; return e; };
  var $ = function (id) { return document.getElementById(id); };
  var f1 = function (v) { return ok(v) ? v.toFixed(1).replace(".", ",") : "—"; };
  var f2 = function (v) { return ok(v) ? v.toFixed(2).replace(".", ",") : "—"; };
  var f0 = function (v) { return ok(v) ? String(Math.round(v)) : "—"; };
  var dataBr = function (k) { return k ? k.slice(8, 10) + "/" + k.slice(5, 7) + "/" + k.slice(0, 4) : "—"; };

  var MEDALHAS = ["🥇 1º", "🥈 2º", "🥉 3º", "4º", "5º"];

  function calcularLarguraBarra(valor, itens, menorMelhor) {
    var vals = itens.map(function (x) { return x.valor; }).filter(ok);
    if (!vals.length || !ok(valor)) return 100;
    var min = Math.min.apply(null, vals);
    var max = Math.max.apply(null, vals);
    if (max === min) return 100;
    // Se a faixa é estreita (ex.: pressão 925 a 938 hPa ou temperatura), usa escala relativa com base mínima de 35%
    var rel = menorMelhor ? (max - valor) / (max - min) : (valor - (min > 0 && min / max > 0.7 ? min * 0.98 : 0)) / (max - (min > 0 && min / max > 0.7 ? min * 0.98 : 0));
    return Math.max(22, Math.min(100, Math.round(rel * 100)));
  }

  function tabela(titulo, itens, fmt, unid, vazio, opcoes) {
    var opt = opcoes || {};
    var tom = opt.tom || "azul";
    var menorMelhor = !!opt.menor;
    var b = el("div", "rec-bloco rec-tom-" + tom);
    var cab = el("div", "rec-bloco-cab");
    cab.appendChild(el("h3", "", titulo));
    b.appendChild(cab);

    if (!itens.length) {
      b.appendChild(el("p", "mut rec-vazio", vazio || "Sem dado no período."));
      return b;
    }

    // Destaque do 1º colocado (Recorde do indicador)
    var top1 = itens[0];
    var dest = el("div", "rec-top1");
    var destEsq = el("div", "rec-top1-info");
    destEsq.appendChild(el("span", "rec-top1-selo", "🥇 RECORDE DO PERÍODO"));
    destEsq.appendChild(el("strong", "rec-top1-est", top1.estacao));
    var txtDataTop = top1.inicio ? (dataBr(top1.inicio) + " a " + dataBr(top1.data)) : dataBr(top1.data);
    destEsq.appendChild(el("span", "rec-top1-data", "📅 " + txtDataTop + (top1.completo === true ? "" : " · ⚠ dia incompleto")));
    var destVal = el("div", "rec-top1-valor", fmt(top1.valor) + " " + unid);
    dest.appendChild(destEsq);
    dest.appendChild(destVal);
    b.appendChild(dest);

    // Lista visual dos Top 5 com barras proporcionais e tipografia grande
    var lista = el("div", "rec-lista");
    itens.forEach(function (x, i) {
      var item = el("div", "rec-item" + (i === 0 ? " rec-item-lider" : ""));
      var linhaSup = el("div", "rec-item-topo");

      var pos = el("span", "rec-pos rec-pos-" + (i + 1), MEDALHAS[i] || ((i + 1) + "º"));
      var meio = el("div", "rec-item-meta");
      meio.appendChild(el("strong", "rec-item-estacao", x.estacao));
      var perTxt = x.inicio ? (dataBr(x.inicio) + " a " + dataBr(x.data)) : dataBr(x.data);
      meio.appendChild(el("span", "rec-item-data", perTxt));

      var val = el("strong", "rec-item-valor", fmt(x.valor) + " " + unid + (x.completo === true ? "" : " ⚠"));

      linhaSup.appendChild(pos);
      linhaSup.appendChild(meio);
      linhaSup.appendChild(val);
      item.appendChild(linhaSup);

      var trilho = el("div", "rec-barra");
      var ench = el("i", "");
      ench.style.width = calcularLarguraBarra(x.valor, itens, menorMelhor) + "%";
      trilho.appendChild(ench);
      item.appendChild(trilho);

      lista.appendChild(item);
    });
    b.appendChild(lista);
    return b;
  }

  function criarPainelCampeoes(r) {
    var sec = el("section", "card rec-resumo-card");
    sec.appendChild(el("h2", "", "🏆 Destaques e Recordes Absolutos do Período"));
    var grade = el("div", "rec-campeoes-grade");

    function cardCampeao(icone, rotulo, item, fmt, unid, tom) {
      var c = el("div", "rec-campeao rec-tom-" + tom);
      c.appendChild(el("span", "rec-campeao-rot", icone + " " + rotulo));
      if (!item) {
        c.appendChild(el("strong", "rec-campeao-val mut", "Sem dado"));
        return c;
      }
      c.appendChild(el("strong", "rec-campeao-val", fmt(item.valor) + " " + unid + (item.completo === true ? "" : " ⚠")));
      c.appendChild(el("span", "rec-campeao-meta", "📍 " + item.estacao + " · 📅 " + dataBr(item.data)));
      return c;
    }

    var maiorRio = null;
    r.rios.forEach(function (rg) {
      if (rg.maiorNivel && rg.maiorNivel[0]) {
        if (!maiorRio || rg.maiorNivel[0].valor > maiorRio.valor) {
          maiorRio = { valor: rg.maiorNivel[0].valor, data: rg.maiorNivel[0].data, estacao: rg.estacao, completo: rg.maiorNivel[0].completo };
        }
      }
    });

    grade.appendChild(cardCampeao("🌧️", "Maior chuva em 1 dia", r.chuva.dias[0], f1, "mm", "azul"));
    grade.appendChild(cardCampeao("⛈️", "Maior chuva em 60 min", r.chuva.hora[0], f1, "mm", "azul"));
    grade.appendChild(cardCampeao("🌊", "Maior nível de rio", maiorRio, f2, "m", "ciano"));
    grade.appendChild(cardCampeao("🔥", "Dia mais quente", r.temperatura.maisQuente[0], f1, "°C", "laranja"));
    grade.appendChild(cardCampeao("❄️", "Dia mais frio", r.temperatura.maisFrio[0], f1, "°C", "frio"));
    grade.appendChild(cardCampeao("💨", "Vento mais forte", r.vento.dias[0], f1, "km/h", "roxo"));

    sec.appendChild(grade);
    return sec;
  }

  function filtrosDaTela(banco) {
    var ultima = "";
    Object.keys(banco.slots).forEach(function (id) { Object.keys(banco.slots[id].dias || {}).forEach(function (k) { if (k > ultima) ultima = k; }); });
    var n = $("selPeriodoExt").value, f = { slot: $("selEquipExt").value, apenasCompletos: $("selCompletosExt").value === "sim" };
    if (n.indexOf("mes:") === 0) {
      var ym = n.slice(4);
      f.de = ym + "-01";
      f.ate = ym + "-31";
    } else if (n.indexOf("ano:") === 0) {
      var ano = n.slice(4);
      f.de = ano + "-01-01";
      f.ate = ano + "-12-31";
    } else if (n.indexOf("sem:") === 0) {
      var ps = n.slice(4).split("-S");
      f.de = ps[0] + (ps[1] === "1" ? "-01-01" : "-07-01");
      f.ate = ps[0] + (ps[1] === "1" ? "-06-30" : "-12-31");
    } else if (n !== "todos" && ultima) {
      var d = new Date(Date.parse(ultima + "T12:00:00Z") - (+n - 1) * 86400000);
      f.de = d.toISOString().slice(0, 10); f.ate = ultima;
    }
    return f;
  }

  function atualizarBotoesCategoria(catAtiva) {
    var cont = $("abasCategoriaExt");
    if (!cont) return;
    var btns = cont.querySelectorAll(".rec-cat-btn");
    for (var i = 0; i < btns.length; i++) {
      var ativo = btns[i].getAttribute("data-cat") === catAtiva;
      if (ativo) btns[i].classList.add("ativo");
      else btns[i].classList.remove("ativo");
    }
  }

  function desenhar() {
    var banco = w.Estacao.carregarBanco();
    var raiz = $("conteudoExt"); raiz.textContent = ""; raiz.className = "";
    var layoutModo = $("selLayoutExt") ? $("selLayoutExt").value : "amplo";
    var catFiltro = $("selCategoriaExt") ? $("selCategoriaExt").value : "todas";
    atualizarBotoesCategoria(catFiltro);
    if (layoutModo === "expandido") raiz.classList.add("rec-layout-expandido");

    var tem = Object.keys(banco.slots).some(function (id) { return Object.keys(banco.slots[id].dias || {}).length; });
    if (!tem) {
      var p = el("p", "mut", "Ainda não há CSV neste aparelho. Importe em ");
      var a = el("a", "", "Histórico da estação"); a.href = "historico.html"; p.appendChild(a); p.appendChild(document.createTextNode("."));
      raiz.appendChild(p); return;
    }
    var r = calcular(banco, filtrosDaTela(banco));
    var resumo = el("p", "mut", r.totalDias + " dia(s) de equipamento no período · último dia com dado: " + dataBr(r.ultimaData) + ". ⚠ = dia incompleto (horas sem leitura): chuva é valor mínimo e os extremos podem ser maiores/menores do que o registrado.");
    raiz.appendChild(resumo);

    try {
      var qGuardado = JSON.parse(localStorage.getItem("cajamar:queimadas") || "null");
      if (qGuardado && qGuardado.d && Array.isArray(qGuardado.d.focos)) {
        var focosCaj = qGuardado.d.focos.filter(function (f) { return f.emCajamar; });
        var focos50 = qGuardado.d.focos.filter(function (f) { return f.distanciaKm <= 50; });
        var pFogo = el("p", "norm-conf", "🔥 Focos de Fogo no território de Cajamar (últimas 24–48 h INPE BDQueimadas): " + focosCaj.length + " foco(s) em Cajamar · " + focos50.length + " foco(s) no raio de 50 km.");
        pFogo.style.marginTop = "0";
        pFogo.style.marginBottom = "10px";
        raiz.appendChild(pFogo);
      }
    } catch (e) {}

    if (catFiltro === "todas") {
      raiz.appendChild(criarPainelCampeoes(r));
    }

    var sec = function (catId, titulo, filhos, dica) {
      if (catFiltro !== "todas" && catFiltro !== catId) return;
      var s = el("section", "card rec-secao");
      s.appendChild(el("h2", "rec-secao-titulo", titulo));
      if (dica) s.appendChild(el("p", "card-sub", dica));
      var g = el("div", "rec-grade");
      filhos.forEach(function (c) { g.appendChild(c); });
      s.appendChild(g);
      raiz.appendChild(s);
    };

    sec("chuva", "🌧️ Chuva — Diária, Pancadas (60 min / 10 min) e Acumulados", [
      tabela("Dias que mais choveram (dia civil, 00h–24h)", r.chuva.dias, f1, "mm", "Nenhum dia com chuva registrada.", { tom: "azul" }),
      tabela("Maior chuva em 60 min (1 hora)", r.chuva.hora, f1, "mm", "Sem chuva registrada.", { tom: "azul" }),
      tabela("Maior chuva em 10 min (intensidade curta)", r.chuva.dezMin, f1, "mm", "Sem chuva registrada.", { tom: "azul" }),
      tabela("Maior acumulado em 30 dias", r.acumuladosPeriodo.d30 || [], f1, "mm", "Sem acumulado no período.", { tom: "azul" }),
      tabela("Maior acumulado em 60 dias", r.acumuladosPeriodo.d60 || [], f1, "mm", "Sem acumulado no período.", { tom: "azul" }),
      tabela("Maior acumulado em 90 dias", r.acumuladosPeriodo.d90 || [], f1, "mm", "Sem acumulado no período.", { tom: "azul" }),
      tabela("Maior acumulado no Semestre (180 dias)", r.acumuladosPeriodo.d180 || [], f1, "mm", "Sem acumulado no período.", { tom: "azul" }),
      tabela("Maior acumulado no Ano (365 dias)", r.acumuladosPeriodo.d365 || [], f1, "mm", "Sem acumulado no período.", { tom: "azul" })
    ], "Volumes máximos medidos pelas estações e pluviômetros de Cajamar no período selecionado.");

    var riosBlocos = [];
    r.rios.forEach(function (rg) {
      riosBlocos.push(tabela("🌊 " + rg.estacao + " — Maiores níveis atingidos", rg.maiorNivel, f2, "m", "Sem nível no período.", { tom: "ciano" }));
      riosBlocos.push(tabela("📈 " + rg.estacao + " — Maior subida no dia (máx − mín)", rg.maiorSubida, f2, "m", "Sem nível no período.", { tom: "ciano" }));
    });
    if (!riosBlocos.length) riosBlocos.push(el("p", "mut", "Nenhuma régua de nível com dado no período."));
    sec("rios", "🌊 Nível dos Rios — Réguas Fluviométricas (Jordanésia e Natura)", riosBlocos, "Valores medidos pelas réguas de nível em metros. Sem classificação de risco: as cotas de alerta ainda não estão validadas.");

    sec("temperatura", "🌡️ Temperatura — Máximas, Mínimas e Amplitude Térmica", [
      tabela("🔥 Dia mais quente (maior máxima)", r.temperatura.maisQuente, f1, "°C", "Sem temperatura no período.", { tom: "laranja" }),
      tabela("❄️ Dia mais frio (menor mínima)", r.temperatura.maisFrio, f1, "°C", "Sem temperatura no período.", { tom: "frio", menor: true }),
      tabela("↕️ Maior amplitude térmica no dia (máx − mín)", r.temperatura.maiorAmplitude, f1, "°C", "Sem temperatura no período.", { tom: "laranja" })
    ]);

    sec("pressao_umidade", "🧭 Pressão Atmosférica e Umidade Relativa do Ar", [
      tabela("💧 Dia mais seco (menor umidade)", r.umidade.maisSeco, f1, "%", "Sem umidade no período.", { tom: "laranja", menor: true }),
      tabela("🌧️ Dia mais úmido (maior umidade)", r.umidade.maisUmido, f1, "%", "Sem umidade no período.", { tom: "verde" }),
      tabela("⬆️ Maior pressão atmosférica", r.pressao.maior, f1, "hPa", "Sem pressão no período.", { tom: "roxo" }),
      tabela("⬇️ Menor pressão atmosférica", r.pressao.menor, f1, "hPa", "Sem pressão no período.", { tom: "roxo", menor: true }),
      tabela("📉 Maior variação de pressão no dia (máx − mín)", r.pressao.maiorVariacao, f1, "hPa", "Sem pressão no período.", { tom: "roxo" })
    ]);

    sec("vento_radiacao", "💨 Vento e ☀️ Radiação Solar", [
      tabela("💨 Maior velocidade do vento no dia", r.vento.dias, f1, "km/h", "Sem vento no período.", { tom: "roxo" }),
      tabela("☀️ Maior radiação solar no dia", r.radiacao.dias, f0, "W/m²", "Nenhum equipamento deste período registra radiação solar.", { tom: "laranja" })
    ], "Velocidade máxima de vento e pico de radiação solar registrados em cada dia.");

    // equipamentos
    if (catFiltro === "todas" || catFiltro === "equipamentos") {
      var s = el("section", "card rec-secao"); s.appendChild(el("h2", "rec-secao-titulo", "📋 Equipamentos no período"));
      var tw = el("div", "tw"), tb = el("table"), th = el("tr");
      ["Equipamento", "Dias com dado", "Primeiro / último dia", "Dias incompletos", "Chuva no período", "Dias ≥ 1 mm", "Temp. mín–máx", "Vento máx."].forEach(function (x) { th.appendChild(el("th", "", x)); });
      tb.appendChild(th);
      r.equipamentos.forEach(function (e) {
        var tr = el("tr");
        tr.appendChild(el("td", "", (e.nivel ? "🌊 " : "🌡️ ") + e.estacao));
        tr.appendChild(el("td", "", String(e.dias)));
        tr.appendChild(el("td", "", dataBr(e.primeiro) + " a " + dataBr(e.ultimo) + (e.diasSemLeituraAteFim > 1 ? " (sem dado nos últimos " + e.diasSemLeituraAteFim + " dias da rede)" : "")));
        tr.appendChild(el("td", "", String(e.incompletos)));
        tr.appendChild(el("td", "", e.chuvaTotal === null ? "sem dado" : f1(e.chuvaTotal) + " mm" + (e.chuvaTotalMinimo ? " (mínimo)" : "")));
        tr.appendChild(el("td", "", e.chuvaTotal === null ? "—" : String(e.diasComChuva)));
        tr.appendChild(el("td", "", e.tmin === null && e.tmax === null ? "sem dado" : f1(e.tmin) + " a " + f1(e.tmax) + " °C"));
        tr.appendChild(el("td", "", e.vmax === null ? "sem dado" : f1(e.vmax) + " km/h"));
        tb.appendChild(tr);
      });
      tw.appendChild(tb); s.appendChild(tw);
      s.appendChild(el("p", "mut", "“sem dado” = o equipamento não registrou aquela medida (não é zero). Dados auxiliares dos CSV importados neste aparelho; não substituem INMET e CEMADEN."));
      raiz.appendChild(s);
    }
  }

  var MESES_NOMES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  function iniciar() {
    if (!$("conteudoExt") || !w.Estacao) return;
    var banco = w.Estacao.carregarBanco();
    var sel = $("selEquipExt");
    var mesesMap = {}, anosMap = {}, semMap = {};
    Object.keys(banco.slots).forEach(function (id) {
      var sl = banco.slots[id];
      var ks = Object.keys(sl.dias || {});
      if (!ks.length) return;
      var o = el("option", "", sl.estacao || sl.rotulo); o.value = id; sel.appendChild(o);
      ks.forEach(function (k) {
        mesesMap[k.slice(0, 7)] = true;
        var a = k.slice(0, 4);
        anosMap[a] = true;
        var m = parseInt(k.slice(5, 7), 10);
        semMap[a + "-S" + (m <= 6 ? "1" : "2")] = true;
      });
    });
    var selPer = $("selPeriodoExt");
    if (selPer) {
      Object.keys(anosMap).sort().reverse().forEach(function (ano) {
        var oA = el("option", "", "Ano de " + ano); oA.value = "ano:" + ano; selPer.appendChild(oA);
      });
      Object.keys(semMap).sort().reverse().forEach(function (sem) {
        var ps = sem.split("-S");
        var oS = el("option", "", ps[1] + "º Semestre de " + ps[0]); oS.value = "sem:" + sem; selPer.appendChild(oS);
      });
      Object.keys(mesesMap).sort().reverse().forEach(function (ym) {
        var p = ym.split("-");
        var oM = el("option", "", "Mês de " + (MESES_NOMES[parseInt(p[1], 10) - 1] || ym) + " / " + p[0]);
        oM.value = "mes:" + ym;
        selPer.appendChild(oM);
      });
    }
    ["selPeriodoExt", "selEquipExt", "selCompletosExt", "selCategoriaExt", "selLayoutExt"].forEach(function (id) {
      if ($(id)) $(id).onchange = desenhar;
    });
    var contAbas = $("abasCategoriaExt");
    if (contAbas) {
      var btns = contAbas.querySelectorAll(".rec-cat-btn");
      for (var i = 0; i < btns.length; i++) {
        btns[i].onclick = function () {
          var c = this.getAttribute("data-cat") || "todas";
          if ($("selCategoriaExt")) $("selCategoriaExt").value = c;
          desenhar();
        };
      }
    }
    desenhar();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})(typeof window !== "undefined" ? window : this);
