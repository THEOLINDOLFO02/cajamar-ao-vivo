// Funções puras para ler séries horárias do Open-Meteo sem erro de janela.
// Fato documentado (open-meteo.com/en/docs): o valor horário de "precipitation" no instante T é a SOMA da hora ANTERIOR (T-1 h a T);
// "wind_gusts_10m" horário é o MÁXIMO da hora anterior. Em "current", "precipitation" é a soma dos últimos "interval" segundos
// (900 s = 15 min na prática), não da hora. Por isso:
//  - "últimas N horas até T" = valores de T-(N-1) h até T (N valores);
//  - "próximas N horas depois de T" = valores de T+1 h até T+N h (N valores) — o valor de T já é passado;
//  - a hora de T NÃO é encontrada por aproximação: se o instante exato não existe na série, não há janela (nunca o índice 0).
(function (w) {
  "use strict";

  function num(v) { return typeof v === "number" && isFinite(v) ? v : null; }

  // Índice do instante "YYYY-MM-DDTHH:00" correspondente à hora cheia de currentTime ("YYYY-MM-DDTHH:MM"); -1 se não existir.
  function indiceHora(tempos, currentTime) {
    if (!Array.isArray(tempos)) return -1;
    var m = /^(\d{4}-\d{2}-\d{2}T\d{2}):\d{2}/.exec(String(currentTime || ""));
    return m ? tempos.indexOf(m[1] + ":00") : -1;
  }

  // Soma de nHoras valores consecutivos a partir de "ini" (inclusive). Só vale com TODAS as horas presentes e numéricas.
  function somaHoras(valores, ini, nHoras) {
    var r = { valor: null, esperadas: nHoras, comDado: 0, completo: false };
    if (!Array.isArray(valores) || ini < 0 || ini + nHoras > valores.length) return r;
    var t = 0;
    for (var i = ini; i < ini + nHoras; i++) {
      var x = num(valores[i]);
      if (x !== null && x >= 0) { t += x; r.comDado++; }
    }
    r.completo = r.comDado === nHoras;
    r.valor = r.completo ? Math.round(t * 1000) / 1000 : null;
    return r;
  }

  // Últimas nHoras horas terminando em idxFim (inclusive): precipitação acumulada que já ocorreu (estimativa do modelo).
  function acumuladoAte(valores, idxFim, nHoras) { return somaHoras(valores, idxFim - nHoras + 1, nHoras); }
  // Próximas nHoras horas depois de idxAgora (exclusive): precipitação PREVISTA.
  function previstoDepois(valores, idxAgora, nHoras) { return somaHoras(valores, idxAgora + 1, nHoras); }

  // Duração (minutos) que a precipitação de "current" representa, ou null se a API não informou.
  function intervaloCurrentMin(current) {
    var s = current && num(current.interval);
    return s !== null && s > 0 ? Math.round(s / 60) : null;
  }

  w.SerieOM = { indiceHora: indiceHora, somaHoras: somaHoras, acumuladoAte: acumuladoAte, previstoDepois: previstoDepois, intervaloCurrentMin: intervaloCurrentMin };
})(typeof window !== "undefined" ? window : globalThis);
