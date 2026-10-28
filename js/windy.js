// Previsão pontual da Windy (modelo GFS) para Cajamar, lida pelo Worker da Cloudflare (rota /windy).
// A chave da Windy fica só no Worker; este arquivo não tem chave. Estimativa de modelo, não é medição.
(function (w) {
  "use strict";
  var FUSO = "America/Sao_Paulo";

  // Faixas usuais de CAPE (J/kg): indicam a instabilidade que o modelo vê, não o aviso de tempestade.
  var FAIXAS_CAPE = [
    { max: 999, n: 0, nome: "Baixa", dica: "Pouca energia para tempestades fortes." },
    { max: 2499, n: 1, nome: "Moderada", dica: "Tempestades isoladas são possíveis." },
    { max: 3999, n: 2, nome: "Alta", dica: "Ambiente favorável a tempestades fortes; acompanhe os avisos do INMET." },
    { max: Infinity, n: 3, nome: "Extrema", dica: "Instabilidade muito alta no modelo; acompanhe os avisos do INMET e o radar." }
  ];
  var DIRECOES = ["N", "NE", "L", "SE", "S", "SO", "O", "NO"];

  function ok(v) { return typeof v === "number" && isFinite(v); }
  function classificarCape(v) {
    if (!ok(v) || v < 0) return null;
    for (var i = 0; i < FAIXAS_CAPE.length; i++) if (v <= FAIXAS_CAPE[i].max) return FAIXAS_CAPE[i];
    return null;
  }
  function direcao(graus) { return ok(graus) ? DIRECOES[Math.round(graus / 45) % 8] : "—"; }
  function hora(ts) { return new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: FUSO }); }
  function validar(j) { return !!(j && Array.isArray(j.pontos) && j.pontos.length && j.coletadoEm); }

  // Resume as próximas 24 h (8 passos de 3 h a partir de agora). `agora` em ms.
  function resumir(j, agora) {
    var t0 = (agora === undefined ? Date.now() : agora) - 90 * 60000;
    var lista = j.pontos.filter(function (p) { return p.ts >= t0; }).slice(0, 8);
    var r = { pontos: lista, chuvaMm: null, rajadaMax: null, capeMax: null, tempMin: null, tempMax: null };
    lista.forEach(function (p) {
      if (ok(p.chuvaMm3h)) r.chuvaMm = (r.chuvaMm || 0) + p.chuvaMm3h;
      if (ok(p.rajadaKmh) && (!r.rajadaMax || p.rajadaKmh > r.rajadaMax.v)) r.rajadaMax = { v: p.rajadaKmh, ts: p.ts };
      if (ok(p.cape) && (!r.capeMax || p.cape > r.capeMax.v)) r.capeMax = { v: p.cape, ts: p.ts };
      if (ok(p.tempC)) { r.tempMin = r.tempMin === null ? p.tempC : Math.min(r.tempMin, p.tempC); r.tempMax = r.tempMax === null ? p.tempC : Math.max(r.tempMax, p.tempC); }
    });
    if (r.chuvaMm !== null) r.chuvaMm = Math.round(r.chuvaMm * 10) / 10;
    return r;
  }

  var api = { FAIXAS_CAPE: FAIXAS_CAPE, classificarCape: classificarCape, direcao: direcao, resumir: resumir, validar: validar };

  // ---------- parte de tela (só roda no navegador) ----------
  if (typeof document !== "undefined") {
    var el = function (t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x !== undefined) e.textContent = x; return e; };
    var num = function (v, d) { return ok(v) ? v.toFixed(d === undefined ? 0 : d).replace(".", ",") : "—"; };

    api.carregar = async function () {
      var B = document.getElementById("windy");
      if (!B) return;
      var base = (w.CAJAMAR_CONFIG || {}).cemadenProxy;
      if (!base) {
        Fontes.marcarErro("windy", "Worker não configurado");
        B.textContent = ""; B.className = "";
        B.appendChild(el("span", "mut", "Previsão da Windy desligada: falta o endereço do Worker em js/config.js."));
        return;
      }
      try {
        var r = await Fontes.consultar("windy", base.replace(/\/+$/, "") + "/windy", validar);
        // Chave de teste da Windy devolve dados embaralhados de propósito: nunca mostrar como previsão real.
        if (r.dados.aviso) {
          Fontes.marcarErro("windy", "chave de teste da Windy (dados embaralhados)");
          B.textContent = ""; B.className = "";
          B.appendChild(el("span", "err", "Previsão da Windy bloqueada: a chave configurada é de TESTE e a Windy embaralha os dados de propósito. Troque por uma chave de produção no Worker para exibir."));
          return;
        }
        var d = resumir(r.dados), cape = d.capeMax ? classificarCape(d.capeMax.v) : null;
        if (!d.pontos.length) throw new Error("sem pontos futuros");
        B.textContent = ""; B.className = "";
        if (r.antigo) B.appendChild(el("p", "stale", "Não foi possível atualizar agora. Mostrando dados antigos, coletados em " + new Date(r.de).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) + "."));

        var k = el("div", "k");
        [
          ["Chuva prevista em 24 h", num(d.chuvaMm, 1) + " mm"],
          ["Maior rajada", d.rajadaMax ? num(d.rajadaMax.v) + " km/h às " + hora(d.rajadaMax.ts) : "—"],
          ["Temperatura", num(d.tempMin) + "° a " + num(d.tempMax) + "°"],
          ["Instabilidade (CAPE máx.)", d.capeMax ? num(d.capeMax.v) + " J/kg · " + (cape ? cape.nome : "—") + " às " + hora(d.capeMax.ts) : "—"]
        ].forEach(function (p) { var x = el("div"); x.appendChild(el("span", "", p[0])); x.appendChild(el("strong", "", p[1])); k.appendChild(x); });
        B.appendChild(k);
        if (cape && cape.n >= 2) B.appendChild(el("p", "", "Instabilidade " + cape.nome.toLowerCase() + " no modelo: " + cape.dica));

        var tw = el("div", "tw"), tb = el("table"), th = el("tr");
        ["Hora", "Temp.", "Chuva (3 h)", "Vento", "Rajada", "CAPE"].forEach(function (x) { th.appendChild(el("th", "", x)); });
        tb.appendChild(th);
        d.pontos.forEach(function (p) {
          var tr = el("tr");
          [hora(p.ts), num(p.tempC) + "°", num(p.chuvaMm3h, 1) + " mm", num(p.ventoKmh) + " km/h " + direcao(p.direcaoGraus), num(p.rajadaKmh) + " km/h", num(p.cape)].forEach(function (x) { tr.appendChild(el("td", "", x)); });
          tb.appendChild(tr);
        });
        tw.appendChild(tb); B.appendChild(tw);
        B.appendChild(el("p", "mut", "Previsão pontual da Windy (modelo GFS, passos de 3 h) para Cajamar. É estimativa de modelo, não medição: o aviso oficial vem do INMET e a chuva observada, do CEMADEN."));
        document.dispatchEvent(new CustomEvent("cajamar:windy", { detail: { chuvaMm: d.chuvaMm, rajadaMax: d.rajadaMax && d.rajadaMax.v, capeMax: d.capeMax && d.capeMax.v, antigo: !!r.antigo } }));
      } catch (e) {
        B.textContent = ""; B.className = "";
        B.appendChild(el("span", "err", "Não foi possível consultar a previsão da Windy agora (" + (e && e.message ? e.message : "falha") + "). As demais previsões do painel não dependem dela."));
      }
    };
  }

  w.Windy = api;
})(typeof window !== "undefined" ? window : globalThis);
