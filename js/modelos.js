// Incerteza da previsão de chuva: compara vários modelos meteorológicos (Open-Meteo) para Cajamar.
// Cada modelo é uma simulação diferente do tempo. Quando eles divergem, a previsão é mais incerta.
(function (w) {
  "use strict";
  var LAT = -23.3547, LON = -46.8764;
  // best_match é o que o painel já usa; fica como referência e NÃO entra na estatística (é uma mistura dos outros).
  var REFERENCIA = { id: "best_match", nome: "Padrão do painel (Open-Meteo)" };
  var MODELOS = [
    { id: "ecmwf_ifs025", nome: "ECMWF IFS (Europa)" },
    { id: "gfs_seamless", nome: "GFS (EUA)" },
    { id: "icon_seamless", nome: "ICON (Alemanha)" },
    { id: "gem_seamless", nome: "GEM (Canadá)" },
    { id: "meteofrance_seamless", nome: "Météo-France" }
  ];
  var LIMITE_CHUVA = 1; // mm: abaixo disso, "sem chuva relevante"

  var URL_MODELOS = "https://api.open-meteo.com/v1/forecast?latitude=" + LAT + "&longitude=" + LON +
    "&current=precipitation&hourly=precipitation&models=" + [REFERENCIA.id].concat(MODELOS.map(function (m) { return m.id; })).join(",") +
    "&forecast_days=3&timezone=America%2FSao_Paulo";

  function ok(v) { return typeof v === "number" && isFinite(v); }
  function validar(j) { return !!(j && j.current && j.current.time && j.hourly && Array.isArray(j.hourly.time)); }

  // Soma 24 h começando em "ini". Se faltar qualquer hora, o total é null (não completa com zero).
  // O valor horário de precipitação é a soma da hora ANTERIOR ao instante: "próximas 24 h" começam no valor DEPOIS da hora atual.
  function somar24(v, ini) {
    if (!Array.isArray(v) || ini + 24 > v.length) return null;
    var t = 0;
    for (var i = ini; i < ini + 24; i++) { if (!ok(v[i])) return null; t += v[i]; }
    return Math.round(t * 10) / 10;
  }

  // Totais por modelo nas próximas 24 h e de 24 a 48 h, a partir da hora atual da resposta.
  function totais(j) {
    var i0 = SerieOM.indiceHora(j.hourly.time, j.current.time); // -1 = hora atual ausente: sem totais (nunca o índice 0)
    function linha(m, ehRef) {
      var v = j.hourly["precipitation_" + m.id];
      return { id: m.id, nome: m.nome, referencia: !!ehRef, h24: i0 < 0 ? null : somar24(v, i0 + 1), h48: i0 < 0 ? null : somar24(v, i0 + 25) };
    }
    return { referencia: linha(REFERENCIA, true), modelos: MODELOS.map(function (m) { return linha(m, false); }), hora: String(j.current.time).slice(11, 16) };
  }

  // Estatística de uma janela entre os modelos que têm dado.
  function resumirJanela(valores) {
    var v = valores.filter(ok);
    if (!v.length) return null;
    var min = Math.min.apply(null, v), max = Math.max.apply(null, v);
    var media = v.reduce(function (a, b) { return a + b; }, 0) / v.length;
    return {
      n: v.length, min: min, max: max, media: Math.round(media * 10) / 10, amplitude: Math.round((max - min) * 10) / 10,
      comChuva: v.filter(function (x) { return x >= LIMITE_CHUVA; }).length
    };
  }

  // Indicador simples (regra do sistema, não é padrão meteorológico): quanto os modelos concordam.
  function concordancia(r) {
    if (!r) return null;
    if (r.max < LIMITE_CHUVA) return { nivel: 0, nome: "Modelos concordam: pouca ou nenhuma chuva" };
    if (r.amplitude < 3 || r.amplitude / r.max < 0.35) return { nivel: 0, nome: "Boa concordância entre os modelos" };
    if (r.amplitude / r.max < 0.7) return { nivel: 1, nome: "Concordância moderada" };
    return { nivel: 2, nome: "Os modelos divergem muito" };
  }

  var api = { URL: URL_MODELOS, MODELOS: MODELOS, REFERENCIA: REFERENCIA, validar: validar, totais: totais, resumirJanela: resumirJanela, concordancia: concordancia };

  // ---------- parte de tela (só roda no navegador) ----------
  if (typeof document !== "undefined") {
    var el = function (t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x !== undefined) e.textContent = x; return e; };
    var f1 = function (v) { return ok(v) ? v.toFixed(1).replace(".", ",") : "—"; };

    var bloco = function (titulo, campo, t, escala) {
      var wrap = el("div", "mod-bloco");
      var lista = t.modelos.filter(function (m) { return ok(m[campo]); });
      var r = resumirJanela(lista.map(function (m) { return m[campo]; }));
      var c = concordancia(r);
      wrap.appendChild(el("h3", "", titulo));
      if (!r) { wrap.appendChild(el("p", "mut", "Sem dados dos modelos para este período.")); return wrap; }
      var resumo = el("p", "mod-resumo");
      resumo.appendChild(el("strong", "", r.min === r.max ? f1(r.min) + " mm" : "Entre " + f1(r.min) + " e " + f1(r.max) + " mm"));
      resumo.appendChild(document.createTextNode(" · " + r.comChuva + " de " + r.n + " modelos preveem chuva (" + LIMITE_CHUVA + " mm ou mais)"));
      wrap.appendChild(resumo);
      var selo = el("p", "mod-selo", c.nome); selo.dataset.n = String(c.nivel);
      wrap.appendChild(selo);

      var linhas = lista.concat(ok(t.referencia[campo]) ? [t.referencia] : []);
      linhas.forEach(function (m) {
        var l = el("div", "mod-linha" + (m.referencia ? " ref" : ""));
        l.appendChild(el("span", "mod-nome", m.nome));
        var trilho = el("span", "mod-trilho"), barra = el("i");
        barra.style.width = Math.max(2, m[campo] / escala * 100) + "%";
        trilho.appendChild(barra); l.appendChild(trilho);
        l.appendChild(el("b", "mod-valor", f1(m[campo]) + " mm"));
        wrap.appendChild(l);
      });
      return wrap;
    };

    api.carregar = async function () {
      var B = document.getElementById("modelos");
      if (!B) return;
      try {
        var r = await Fontes.consultar("modelos", URL_MODELOS, validar);
        var t = totais(r.dados);
        var todos = t.modelos.concat([t.referencia]).reduce(function (a, m) { return a.concat([m.h24, m.h48]); }, []).filter(ok);
        var escala = Math.max.apply(null, todos.concat([5]));
        B.textContent = ""; B.className = "";
        if (r.antigo) B.appendChild(el("p", "stale", "Não foi possível atualizar agora. Mostrando dados antigos, coletados em " + new Date(r.de).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) + "."));
        var grade = el("div", "mod-grade");
        grade.appendChild(bloco("Próximas 24 h", "h24", t, escala));
        grade.appendChild(bloco("De 24 a 48 h", "h48", t, escala));
        B.appendChild(grade);
        B.appendChild(el("p", "mut mod-fonte", "Cada modelo é uma simulação diferente do tempo; quando divergem, a previsão é mais incerta. A faixa e o indicador de concordância são cálculos deste sistema (a linha 'Padrão do painel' é a que o painel já usa e fica de fora do cálculo). Previsão de modelo, não oficial: confira os avisos do INMET. Dados: Open-Meteo.com, a partir das " + t.hora + "."));
      } catch (e) {
        B.textContent = ""; B.className = "";
        B.appendChild(el("span", "err", "Não foi possível comparar os modelos agora e não há dado guardado."));
      }
    };
  }

  w.Modelos = api;
})(typeof window !== "undefined" ? window : globalThis);
