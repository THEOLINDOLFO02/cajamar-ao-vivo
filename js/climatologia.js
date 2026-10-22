// Chuva recente comparada com o "normal" de 30 anos (1991-2020) para Cajamar.
// Fonte: reanálise ERA5 via Open-Meteo (estimativa de modelo, não pluviômetro). Os dados diários ficam guardados no aparelho
// e só são baixados de novo quando muda o dia.
(function (w) {
  "use strict";
  var LAT = -23.3547, LON = -46.8764;
  var ANO_INI = 1991, ANO_FIM = 2020; // normal climatológica padrão (OMS)
  var CHAVE = "cajamar:clim:v1";
  var MIN_ANOS = 25;

  // ---------- datas (números de dia em UTC, sem fuso) ----------
  function diaNum(ano, mes, dia) { return Date.UTC(ano, mes - 1, dia) / 86400000; }
  function diaDeISO(iso) { var p = String(iso).split("-"); return diaNum(+p[0], +p[1], +p[2]); }
  function isoDeDia(n) { return new Date(n * 86400000).toISOString().slice(0, 10); }
  function ultimoDiaMes(ano, mes) { return new Date(Date.UTC(ano, mes, 0)).getUTCDate(); }
  function ok(v) { return typeof v === "number" && isFinite(v); }

  // ---------- série diária compacta: décimos de mm (inteiros); -1 = sem dado ----------
  function serieDeResposta(j) {
    var d = j && j.daily;
    if (!d || !Array.isArray(d.time) || !Array.isArray(d.precipitation_sum) || d.time.length !== d.precipitation_sum.length || !d.time.length) return null;
    var ini = diaDeISO(d.time[0]);
    if (diaDeISO(d.time[d.time.length - 1]) - ini !== d.time.length - 1) return null; // dias precisam ser seguidos
    return { ini: ini, v: d.precipitation_sum.map(function (x) { return ok(x) && x >= 0 ? Math.round(x * 10) : -1; }) };
  }
  function valorDia(s, n) {
    var i = n - s.ini;
    return i < 0 || i >= s.v.length || s.v[i] < 0 ? null : s.v[i] / 10;
  }
  // Soma de n0 a n1 (inclusive). Se faltar qualquer dia, devolve null (nunca completa com zero).
  function somar(s, n0, n1) {
    var t = 0;
    for (var n = n0; n <= n1; n++) { var x = valorDia(s, n); if (x === null) return null; t += x; }
    return Math.round(t * 10) / 10;
  }
  function ultimoDiaComDado(s) { for (var i = s.v.length - 1; i >= 0; i--) if (s.v[i] >= 0) return s.ini + i; return null; }

  // ---------- janelas e comparação com o normal ----------
  // tipo "mes": do dia 1 do mês até o mesmo dia; tipo "dias": os últimos N dias. O fim cai no mesmo mês/dia de cada ano.
  function janelaDoAno(tipo, dias, ano, mes, dia) {
    var fim = diaNum(ano, mes, Math.min(dia, ultimoDiaMes(ano, mes)));
    return [tipo === "mes" ? diaNum(ano, mes, 1) : fim - (dias - 1), fim];
  }

  function posicao(valor, lista) {
    var menos = 0, iguais = 0;
    lista.forEach(function (x) { if (x < valor) menos++; else if (x === valor) iguais++; });
    return { menos: menos, rank: (menos + 0.5 * iguais) / lista.length };
  }
  // Quintis dos 30 anos (regra usual para descrever chuva em relação ao normal).
  function classe(rank) {
    if (!ok(rank)) return null;
    if (rank < 0.2) return { n: 0, nome: "Bem abaixo do normal" };
    if (rank < 0.4) return { n: 1, nome: "Abaixo do normal" };
    if (rank < 0.6) return { n: 2, nome: "Próximo do normal" };
    if (rank < 0.8) return { n: 3, nome: "Acima do normal" };
    return { n: 4, nome: "Bem acima do normal" };
  }

  function comparar(s, fimISO, tipo, dias) {
    var p = String(fimISO).split("-").map(Number), ano = p[0], mes = p[1], dia = p[2];
    var j = janelaDoAno(tipo, dias, ano, mes, dia), atual = somar(s, j[0], j[1]);
    if (atual === null) return null;
    var base = [];
    for (var a = ANO_INI; a <= ANO_FIM; a++) {
      var jb = janelaDoAno(tipo, dias, a, mes, dia), x = somar(s, jb[0], jb[1]);
      if (x !== null) base.push(x);
    }
    if (base.length < MIN_ANOS) return null;
    var ord = base.slice().sort(function (a, b) { return a - b; });
    var media = base.reduce(function (a, b) { return a + b; }, 0) / base.length;
    var pos = posicao(atual, base);
    return {
      atual: atual, inicio: isoDeDia(j[0]), fim: isoDeDia(j[1]),
      media: Math.round(media * 10) / 10, mediana: Math.round((ord[Math.floor((ord.length - 1) / 2)] + ord[Math.ceil((ord.length - 1) / 2)]) / 2 * 10) / 10,
      min: ord[0], max: ord[ord.length - 1], anos: base.length, anosComMenosChuva: pos.menos,
      pctDaMedia: media > 0 ? Math.round(atual / media * 100) : null, classe: classe(pos.rank)
    };
  }

  // Conferência do modelo com a estação local: soma só os dias em que a estação tem leitura completa.
  function conferir(s, diasEstacao, fimISO, ultimosDias) {
    var fim = diaDeISO(fimISO), modelo = 0, estacao = 0, n = 0;
    for (var d = fim - ultimosDias + 1; d <= fim; d++) {
      var e = diasEstacao && diasEstacao[isoDeDia(d)], m = valorDia(s, d);
      if (e && ok(e.n) && e.n >= 1296 && ok(e.chuva) && m !== null) { modelo += m; estacao += e.chuva; n++; }
    }
    if (n < 7) return null;
    return { dias: n, modelo: Math.round(modelo * 10) / 10, estacao: Math.round(estacao * 10) / 10, difPct: estacao > 0 ? Math.round((modelo - estacao) / estacao * 100) : null };
  }

  function urlArquivo(fimISO) {
    return "https://archive-api.open-meteo.com/v1/archive?latitude=" + LAT + "&longitude=" + LON + "&start_date=" + ANO_INI + "-01-01&end_date=" + fimISO +
      "&daily=precipitation_sum&timezone=America%2FSao_Paulo";
  }

  var api = {
    ANO_INI: ANO_INI, ANO_FIM: ANO_FIM, urlArquivo: urlArquivo, serieDeResposta: serieDeResposta, somar: somar, valorDia: valorDia,
    ultimoDiaComDado: ultimoDiaComDado, janelaDoAno: janelaDoAno, comparar: comparar, classe: classe, posicao: posicao, conferir: conferir,
    diaDeISO: diaDeISO, isoDeDia: isoDeDia
  };

  // ---------- parte de tela (só roda no navegador) ----------
  if (typeof document !== "undefined") {
    var el = function (t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x !== undefined) e.textContent = x; return e; };
    var f0 = function (v) { return v.toFixed(v < 10 ? 1 : 0).replace(".", ","); };
    var dm = function (iso) { return iso.slice(8, 10) + "/" + iso.slice(5, 7); };
    var hojeLocal = function () { var d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
    var ontem = function () { return isoDeDia(diaDeISO(hojeLocal()) - 1); };

    function guardar(fim, s) { try { localStorage.setItem(CHAVE, JSON.stringify({ fim: fim, ini: s.ini, v: s.v })); } catch (e) {} }
    function lerGuardado() {
      try { var x = JSON.parse(localStorage.getItem(CHAVE) || "null"); return x && Array.isArray(x.v) && ok(x.ini) && x.fim ? x : null; } catch (e) { return null; }
    }

    async function obterSerie() {
      var fim = ontem(), g = lerGuardado();
      if (g && g.fim === fim) { Fontes.marcarOk("climatologia"); return { s: { ini: g.ini, v: g.v }, fim: fim, antigo: false }; }
      try {
        var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, 30000);
        var r = await fetch(urlArquivo(fim), { signal: ctl.signal }); clearTimeout(t);
        if (!r.ok) throw new Error("HTTP " + r.status);
        var s = serieDeResposta(await r.json());
        if (!s) throw new Error("formato inesperado");
        var ult = ultimoDiaComDado(s);
        if (ult === null) throw new Error("sem dados");
        guardar(isoDeDia(ult), s);
        Fontes.marcarOk("climatologia");
        return { s: s, fim: isoDeDia(ult), antigo: false };
      } catch (e) {
        var msg = e && e.name === "AbortError" ? "tempo esgotado" : (e && e.message) || "falha";
        if (g) { Fontes.marcarErro("climatologia", msg + "; usando dados guardados até " + g.fim); return { s: { ini: g.ini, v: g.v }, fim: g.fim, antigo: true }; }
        Fontes.marcarErro("climatologia", msg);
        throw e;
      }
    }

    function linha(titulo, c, escala) {
      var l = el("div", "norm-linha");
      var cab = el("div", "norm-cab");
      cab.appendChild(el("strong", "", titulo));
      cab.appendChild(el("span", "mut", dm(c.inicio) + " a " + dm(c.fim)));
      l.appendChild(cab);
      var val = el("p", "norm-valor");
      val.appendChild(el("b", "", f0(c.atual) + " mm"));
      val.appendChild(document.createTextNode(" · normal " + f0(c.media) + " mm" + (c.pctDaMedia !== null ? " (" + c.pctDaMedia + "% do normal)" : "")));
      l.appendChild(val);
      if (c.classe) { var selo = el("span", "norm-selo", c.classe.nome); selo.dataset.n = String(c.classe.n); l.appendChild(selo); }
      var trilho = el("div", "norm-trilho"), faixa = el("i", "faixa"), barra = el("i", "atual"), marca = el("i", "media");
      faixa.style.left = (c.min / escala * 100) + "%"; faixa.style.width = Math.max(1, (c.max - c.min) / escala * 100) + "%";
      barra.style.width = Math.min(100, c.atual / escala * 100) + "%";
      marca.style.left = (c.media / escala * 100) + "%";
      trilho.appendChild(faixa); trilho.appendChild(barra); trilho.appendChild(marca);
      l.appendChild(trilho);
      l.appendChild(el("p", "mut norm-nota", "Choveu mais que em " + c.anosComMenosChuva + " dos " + c.anos + " anos no mesmo período (faixa dos 30 anos: " + f0(c.min) + " a " + f0(c.max) + " mm)."));
      return l;
    }

    api.carregar = async function () {
      var B = document.getElementById("normal");
      if (!B) return;
      try {
        var d = await obterSerie();
        var defs = [["Este mês", "mes", 0], ["Últimos 30 dias", "dias", 30], ["Últimos 90 dias", "dias", 90]];
        var comps = defs.map(function (x) { return comparar(d.s, d.fim, x[1], x[2]); });
        if (!comps.some(function (c) { return c; })) throw new Error("sem dados suficientes");
        var escala = Math.max.apply(null, comps.filter(Boolean).reduce(function (a, c) { return a.concat([c.max, c.atual]); }, [5])) * 1.05;
        B.textContent = ""; B.className = "";
        if (d.antigo) B.appendChild(el("p", "stale", "Não foi possível atualizar agora. Mostrando dados guardados até " + dm(d.fim) + "."));
        comps.forEach(function (c, i) { if (c) B.appendChild(linha(defs[i][0], c, escala)); });
        B.appendChild(el("p", "mut norm-legenda", "Barra azul: chuva do período. Faixa clara: do ano mais seco ao mais chuvoso (1991-2020). Traço: média."));

        // conferência com a estação local (se o CSV foi importado)
        var conf = null, nomeEst = "";
        if (typeof Estacao !== "undefined" && Estacao.carregarBanco) {
          var banco = Estacao.carregarBanco();
          ["est1", "est2", "est3"].forEach(function (id) {
            var sl = banco && banco.slots && banco.slots[id];
            var c = sl && sl.dias ? conferir(d.s, sl.dias, d.fim, 60) : null;
            if (c && (!conf || c.dias > conf.dias)) { conf = c; nomeEst = sl.estacao || sl.rotulo || id; }
          });
        }
        if (conf) {
          B.appendChild(el("p", "norm-conf", "Conferência com a sua estação (" + nomeEst + "): em " + conf.dias + " dias completos dos últimos 60, o modelo estimou " + f0(conf.modelo) + " mm e a estação mediu " + f0(conf.estacao) + " mm" + (conf.difPct !== null ? " (modelo " + (conf.difPct >= 0 ? "+" : "") + conf.difPct + "%)" : "") + "."));
        }
        B.appendChild(el("p", "mut norm-fonte", "Reanálise ERA5 (Open-Meteo, CC BY 4.0) para a região de Cajamar: é uma estimativa de modelo, que pode diferir de um pluviômetro. Normal = média de 1991 a 2020. Use como contexto, não como medição oficial."));
      } catch (e) {
        B.textContent = ""; B.className = "";
        B.appendChild(el("span", "err", "Não foi possível calcular a chuva em relação ao normal agora e não há dado guardado."));
      }
    };
  }

  w.Clim = api;
})(typeof window !== "undefined" ? window : globalThis);
