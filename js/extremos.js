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
    var met = todos.filter(function (x) { return !x.nivel; });
    var rios = todos.filter(function (x) { return x.nivel; });
    var r = { filtros: filtros || {}, totalDias: todos.length, equipamentos: [], rios: [] };

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
      maisUmido: ranking(met, function (d) { return d.umid; }, true, 3),
      maisSeco: ranking(met, function (d) { return d.umid; }, false, 3)
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
      if (!e.nivel) {
        var comChuva = l.filter(function (x) { return ok(x.d.chuva); });
        e.chuvaTotal = comChuva.length ? Math.round(comChuva.reduce(function (s, x) { return s + x.d.chuva; }, 0) * 10) / 10 : null;
        e.diasComChuva = comChuva.filter(function (x) { return x.d.chuva >= 1; }).length;
        e.chuvaTotalMinimo = comChuva.some(function (x) { return x.completo !== true; });
        var tx = l.filter(function (x) { return ok(x.d.tmax); }), tn = l.filter(function (x) { return ok(x.d.tmin); });
        e.tmax = tx.length ? Math.max.apply(null, tx.map(function (x) { return x.d.tmax; })) : null;
        e.tmin = tn.length ? Math.min.apply(null, tn.map(function (x) { return x.d.tmin; })) : null;
        var vv = l.filter(function (x) { return ok(x.d.vmax); });
        e.vmax = vv.length ? Math.max.apply(null, vv.map(function (x) { return x.d.vmax; })) : null;
      }
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

  function tabela(titulo, itens, fmt, unid, vazio) {
    var b = el("div", "ext-bloco");
    b.appendChild(el("h3", "", titulo));
    if (!itens.length) { b.appendChild(el("p", "mut", vazio || "Sem dado no período.")); return b; }
    var tw = el("div", "tw"), tb = el("table"), th = el("tr");
    ["#", "Dia", "Equipamento", "Valor"].forEach(function (x) { th.appendChild(el("th", "", x)); });
    tb.appendChild(th);
    itens.forEach(function (x, i) {
      var tr = el("tr");
      tr.appendChild(el("td", "", String(i + 1)));
      tr.appendChild(el("td", "", dataBr(x.data)));
      tr.appendChild(el("td", "", x.estacao));
      tr.appendChild(el("td", "", fmt(x.valor) + " " + unid + (x.completo === true ? "" : " ⚠")));
      tb.appendChild(tr);
    });
    tw.appendChild(tb); b.appendChild(tw);
    return b;
  }

  function filtrosDaTela(banco) {
    var ultima = "";
    Object.keys(banco.slots).forEach(function (id) { Object.keys(banco.slots[id].dias || {}).forEach(function (k) { if (k > ultima) ultima = k; }); });
    var n = $("selPeriodoExt").value, f = { slot: $("selEquipExt").value, apenasCompletos: $("selCompletosExt").value === "sim" };
    if (n !== "todos" && ultima) {
      var d = new Date(Date.parse(ultima + "T12:00:00Z") - (+n - 1) * 86400000);
      f.de = d.toISOString().slice(0, 10); f.ate = ultima;
    }
    return f;
  }

  function desenhar() {
    var banco = w.Estacao.carregarBanco();
    var raiz = $("conteudoExt"); raiz.textContent = ""; raiz.className = "";
    var tem = Object.keys(banco.slots).some(function (id) { return Object.keys(banco.slots[id].dias || {}).length; });
    if (!tem) {
      var p = el("p", "mut", "Ainda não há CSV neste aparelho. Importe em ");
      var a = el("a", "", "Histórico da estação"); a.href = "historico.html"; p.appendChild(a); p.appendChild(document.createTextNode("."));
      raiz.appendChild(p); return;
    }
    var r = calcular(banco, filtrosDaTela(banco));
    var resumo = el("p", "mut", r.totalDias + " dia(s) de equipamento no período · último dia com dado: " + dataBr(r.ultimaData) + ". ⚠ = dia incompleto (horas sem leitura): chuva é valor mínimo e os extremos podem ser maiores/menores do que o registrado.");
    raiz.appendChild(resumo);

    var sec = function (titulo, filhos, dica) {
      var s = el("section", "card"); s.appendChild(el("h2", "", titulo)); if (dica) s.appendChild(el("p", "card-sub", dica));
      var g = el("div", "ext-grade"); filhos.forEach(function (c) { g.appendChild(c); }); s.appendChild(g); raiz.appendChild(s);
    };
    sec("🌧️ Chuva", [
      tabela("Dias que mais choveram (dia civil, 00h–24h)", r.chuva.dias, f1, "mm", "Nenhum dia com chuva registrada."),
      tabela("Maior chuva em 60 min", r.chuva.hora, f1, "mm", "Sem chuva registrada."),
      tabela("Maior chuva em 10 min", r.chuva.dezMin, f1, "mm", "Sem chuva registrada.")
    ]);
    sec("🌡️ Temperatura", [
      tabela("Dia mais quente (maior máxima)", r.temperatura.maisQuente, f1, "°C", "Sem temperatura no período."),
      tabela("Dia mais frio (menor mínima)", r.temperatura.maisFrio, f1, "°C", "Sem temperatura no período."),
      tabela("Maior amplitude no dia (máx − mín)", r.temperatura.maiorAmplitude, f1, "°C", "Sem temperatura no período.")
    ]);
    sec("💨 Vento", [tabela("Maior velocidade do vento no dia", r.vento.dias, f1, "km/h", "Sem vento no período.")], "Velocidade máxima registrada pelo equipamento em cada dia.");
    sec("🧭 Pressão e umidade", [
      tabela("Maior pressão", r.pressao.maior, f1, "hPa", "Sem pressão no período."),
      tabela("Menor pressão", r.pressao.menor, f1, "hPa", "Sem pressão no período."),
      tabela("Maior variação de pressão no dia", r.pressao.maiorVariacao, f1, "hPa", "Sem pressão no período."),
      tabela("Dia mais úmido (umidade média)", r.umidade.maisUmido, f1, "%", "Sem umidade no período."),
      tabela("Dia mais seco (umidade média)", r.umidade.maisSeco, f1, "%", "Sem umidade no período.")
    ]);
    sec("☀️ Radiação solar", [tabela("Maior radiação solar no dia", r.radiacao.dias, f0, "W/m²", "Nenhum equipamento deste período registra radiação solar.")]);
    var riosBlocos = [];
    r.rios.forEach(function (rg) {
      riosBlocos.push(tabela(rg.estacao + " — maiores níveis", rg.maiorNivel, f2, "m", "Sem nível no período."));
      riosBlocos.push(tabela(rg.estacao + " — maior subida no dia (máx − mín)", rg.maiorSubida, f2, "m", "Sem nível no período."));
    });
    if (!riosBlocos.length) riosBlocos.push(el("p", "mut", "Nenhuma régua de nível com dado no período."));
    sec("🌊 Nível dos rios", riosBlocos, "Valores medidos pela régua. Sem classificação de risco: as cotas de alerta ainda não estão validadas.");

    // equipamentos
    var s = el("section", "card"); s.appendChild(el("h2", "", "📋 Equipamentos no período"));
    var tw = el("div", "tw"), tb = el("table"), th = el("tr");
    ["Equipamento", "Dias com dado", "Primeiro / último dia", "Dias incompletos", "Chuva no período", "Dias ≥ 1 mm", "Temp. mín–máx", "Vento máx."].forEach(function (x) { th.appendChild(el("th", "", x)); });
    tb.appendChild(th);
    r.equipamentos.forEach(function (e) {
      var tr = el("tr");
      tr.appendChild(el("td", "", (e.nivel ? "🌊 " : "🌡️ ") + e.estacao));
      tr.appendChild(el("td", "", String(e.dias)));
      tr.appendChild(el("td", "", dataBr(e.primeiro) + " a " + dataBr(e.ultimo) + (e.diasSemLeituraAteFim > 1 ? " (sem dado nos últimos " + e.diasSemLeituraAteFim + " dias da rede)" : "")));
      tr.appendChild(el("td", "", String(e.incompletos)));
      tr.appendChild(el("td", "", e.nivel ? "—" : (e.chuvaTotal === null ? "sem dado" : f1(e.chuvaTotal) + " mm" + (e.chuvaTotalMinimo ? " (mínimo)" : ""))));
      tr.appendChild(el("td", "", e.nivel ? "—" : String(e.diasComChuva)));
      tr.appendChild(el("td", "", e.nivel ? "—" : (e.tmin === null && e.tmax === null ? "sem dado" : f1(e.tmin) + " a " + f1(e.tmax) + " °C")));
      tr.appendChild(el("td", "", e.nivel ? "—" : (e.vmax === null ? "sem dado" : f1(e.vmax) + " km/h")));
      tb.appendChild(tr);
    });
    tw.appendChild(tb); s.appendChild(tw);
    s.appendChild(el("p", "mut", "“sem dado” = o equipamento não registrou aquela medida (não é zero). Dados auxiliares dos CSV importados neste aparelho; não substituem INMET e CEMADEN."));
    raiz.appendChild(s);
  }

  function iniciar() {
    if (!$("conteudoExt") || !w.Estacao) return;
    var banco = w.Estacao.carregarBanco();
    var sel = $("selEquipExt");
    Object.keys(banco.slots).forEach(function (id) {
      var sl = banco.slots[id];
      if (!Object.keys(sl.dias || {}).length) return;
      var o = el("option", "", sl.estacao || sl.rotulo); o.value = id; sel.appendChild(o);
    });
    ["selPeriodoExt", "selEquipExt", "selCompletosExt"].forEach(function (id) { $(id).onchange = desenhar; });
    desenhar();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})(typeof window !== "undefined" ? window : this);
