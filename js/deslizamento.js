// Critérios de risco de deslizamento de terra para Cajamar/SP.
// Adaptado de: Pinheiro et al. (2005); AlertaRio (2013).
// Avalia simultaneamente os volumes de água em 1h (mm/h), 24h (mm/24h) e 168h / 7 dias (mm/168h).
// Sem dependência de DOM nas funções de cálculo (pode ser testado no Node).
(function (w) {
  "use strict";

  // Escala oficial de 5 estados conforme tabela de referência (Pinheiro et al., 2005; AlertaRio, 2013)
  var ESTADOS = [
    {
      nivel: 0,
      id: "normalidade",
      estado: "Normalidade",
      corFundo: "#4ade80",
      corBorda: "#16a34a",
      corTexto: "#052e16",
      icone: "🟢",
      faixa1h: "Menor que 10 mm/h",
      faixa24h: "Menor que 25 mm/24h",
      faixa168h: "Menor que 50 mm/168h",
      descricao: "Menor que 10 mm/h; Menor que 25 mm/24h; Menor que 50 mm/168h",
      acaoDefesaCivil: "Monitoramento de rotina. Sem indícios pluviométricos de instabilidade crítica nas encostas.",
      orientacaoPopulacao: "Situação dentro da normalidade. Mantenha calhas, ralos e canaletas de drenagem limpos."
    },
    {
      nivel: 1,
      id: "observacao",
      estado: "Observação",
      corFundo: "#facc15",
      corBorda: "#ca8a04",
      corTexto: "#1f2937",
      icone: "🟡",
      faixa1h: "10 a 20 mm/h",
      faixa24h: "25 a 50 mm/24h",
      faixa168h: "50 a 100 mm/168h",
      descricao: "10 a 20 mm/h; 25 a 50mm/24h; 50 a 100 mm/168h",
      acaoDefesaCivil: "Acompanhar evolução do radar e pluviômetros. Início de umedecimento do solo nas encostas.",
      orientacaoPopulacao: "Acompanhe os boletins da Defesa Civil. Observe o escoamento da água da chuva no seu terreno."
    },
    {
      nivel: 2,
      id: "atencao",
      estado: "Atenção",
      corFundo: "#f97316",
      corBorda: "#c2410c",
      corTexto: "#111827",
      icone: "🟠",
      faixa1h: "20 a 30 mm/h",
      faixa24h: "50 a 100 mm/24h",
      faixa168h: "100 a 150 mm/168h (e 40 mm/h)",
      descricao: "20 a 30 mm/h; 50 a 100mm/24h; 100 a 150mm/168h e 40mm/h",
      acaoDefesaCivil: "Equipes em prontidão. Vistoria preventiva em áreas de encosta e taludes (Jordanésia, Polvilho, Ponunduva, Centro).",
      orientacaoPopulacao: "Solo bastante úmido. Fique atento a rachaduras em muros/paredes, água barrenta e inclinação de árvores ou postes."
    },
    {
      nivel: 3,
      id: "alerta",
      estado: "Alerta",
      corFundo: "#991b1b",
      corBorda: "#7f1d1d",
      corTexto: "#ffffff",
      icone: "🔴",
      faixa1h: "30 a 50 mm/h",
      faixa24h: "100 a 150 mm/24h",
      faixa168h: "150 a 210 mm/168h e 40 a 80 mm/h",
      descricao: "30 a 50 mm/h; 100 a 150mm/24h; 150 a 210mm/168h e 40 a 80mm/h",
      acaoDefesaCivil: "ELEVADO RISCO DE DESLIZAMENTO. Mobilização imediata de equipes de campo e interdição preventiva de pontos críticos.",
      orientacaoPopulacao: "RISCO ALTO DE DESLIZAMENTO! Se morar próximo a barranco/encosta e notar estalos, trincas ou lama, saia imediatamente e ligue 199."
    },
    {
      nivel: 4,
      id: "alerta_maximo",
      estado: "Alerta Máximo",
      corFundo: "#6b21a8",
      corBorda: "#581c87",
      corTexto: "#ffffff",
      icone: "🟣",
      faixa1h: "Maior que 50 mm/h",
      faixa24h: "Maior que 150 mm/24h",
      faixa168h: "Maior que 210 mm/168h e maior que 80 mm/h",
      descricao: "Maior que 50mm/h; Maior que 150mm/24h; Maior que 210mm/168h e maior que 80mm/h",
      acaoDefesaCivil: "EMERGÊNCIA GEODINÂMICA CRÍTICA. Evacuação imediata de áreas de risco de escorregamento e acionamento integral do Plano de Contingência.",
      orientacaoPopulacao: "ALERTA MÁXIMO! Saia imediatamente de áreas de encosta ou próximas a barrancos para um local seguro. Ligue 199 (Defesa Civil) ou 193 (Bombeiros)."
    }
  ];

  function nValido(v) {
    if (v === null || v === undefined || v === "") return 0;
    var n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
    return isFinite(n) && n >= 0 ? n : 0;
  }

  // Classifica apenas pela intensidade horária (mm/h)
  // Normalidade: < 10 | Observação: 10 a 20 | Atenção: 20 a 30 | Alerta: 30 a 50 | Alerta Máximo: > 50
  function classificarPor1h(mm1h) {
    var v = nValido(mm1h);
    if (v > 50) return 4;
    if (v >= 30) return 3;
    if (v >= 20) return 2;
    if (v >= 10) return 1;
    return 0;
  }

  // Classifica pelo acumulado em 24 horas (mm/24h)
  // Normalidade: < 25 | Observação: 25 a 50 | Atenção: 50 a 100 | Alerta: 100 a 150 | Alerta Máximo: > 150
  function classificarPor24h(mm24h) {
    var v = nValido(mm24h);
    if (v > 150) return 4;
    if (v >= 100) return 3;
    if (v >= 50) return 2;
    if (v >= 25) return 1;
    return 0;
  }

  // Classifica pelo acumulado em 168 horas / 7 dias (mm/168h) e condição combinada com mm/h
  // Normalidade: < 50 | Observação: 50 a 100 | Atenção: 100 a 150 (e 40 mm/h) | Alerta: 150 a 210 (e 40 a 80 mm/h) | Alerta Máximo: > 210 (e > 80 mm/h)
  function classificarPor168h(mm168h, mm1h) {
    var v168 = nValido(mm168h);
    var v1 = nValido(mm1h);
    // Critério combinado severo (solo saturado em 168h + pancada horária extrema)
    if (v168 > 210 && v1 > 80) return 4;
    if (v168 >= 150 && v1 >= 40) return 3;
    if (v168 >= 100 && v1 >= 40) return 2;
    // Classificação pelo limiar acumulado de 168h (saturação antecedente de 7 dias)
    if (v168 > 210) return 4;
    if (v168 >= 150) return 3;
    if (v168 >= 100) return 2;
    if (v168 >= 50) return 1;
    return 0;
  }

  // Avalia os 3 volumes (mm/h, mm/24h, mm/168h) e retorna o diagnóstico completo de risco de deslizamento
  function avaliarRisco(dados) {
    var d = dados || {};
    var mm1h = Math.round(nValido(d.mm1h) * 10) / 10;
    var mm24h = Math.round(nValido(d.mm24h) * 10) / 10;
    var mm168h = Math.round(nValido(d.mm168h) * 10) / 10;

    var nv1h = classificarPor1h(mm1h);
    var nv24h = classificarPor24h(mm24h);
    var nv168h = classificarPor168h(mm168h, mm1h);

    var nivelFinal = Math.max(nv1h, nv24h, nv168h);
    var info = ESTADOS[nivelFinal];

    var gatilhos = [];
    if (nv1h === nivelFinal && nivelFinal > 0) gatilhos.push("Intensidade 1h (" + mm1h.toFixed(1).replace(".", ",") + " mm/h → " + ESTADOS[nv1h].estado + ")");
    if (nv24h === nivelFinal && nivelFinal > 0) gatilhos.push("Acumulado 24h (" + mm24h.toFixed(1).replace(".", ",") + " mm/24h → " + ESTADOS[nv24h].estado + ")");
    if (nv168h === nivelFinal && nivelFinal > 0) gatilhos.push("Acumulado 168h / 7 dias (" + mm168h.toFixed(1).replace(".", ",") + " mm/168h → " + ESTADOS[nv168h].estado + ")");
    if (!gatilhos.length) gatilhos.push("Todos os volumes abaixo dos limiares de observação (< 10 mm/h, < 25 mm/24h e < 50 mm/168h)");

    return {
      nivel: nivelFinal,
      id: info.id,
      estado: info.estado,
      corFundo: info.corFundo,
      corBorda: info.corBorda,
      corTexto: info.corTexto,
      icone: info.icone,
      descricaoCriterio: info.descricao,
      acaoDefesaCivil: info.acaoDefesaCivil,
      orientacaoPopulacao: info.orientacaoPopulacao,
      mm1h: mm1h,
      mm24h: mm24h,
      mm168h: mm168h,
      nivel1h: nv1h,
      estado1h: ESTADOS[nv1h].estado,
      cor1h: ESTADOS[nv1h].corFundo,
      nivel24h: nv24h,
      estado24h: ESTADOS[nv24h].estado,
      cor24h: ESTADOS[nv24h].corFundo,
      nivel168h: nv168h,
      estado168h: ESTADOS[nv168h].estado,
      cor168h: ESTADOS[nv168h].corFundo,
      gatilhos: gatilhos,
      fonte: d.fonte || "Análise Pluviométrica"
    };
  }

  // Calcula os acumulados (1h = máx 60 min do dia, 24h = chuva do dia, 168h = soma dos 7 dias até a data)
  // a partir do mapa de dias resumidos de uma estação meteorológica (Estacao.resumir)
  function avaliarDiaEstacao(diasMap, dataIso, nomeEstacao) {
    if (!diasMap || !dataIso || !diasMap[dataIso]) return null;
    var diaAtual = diasMap[dataIso];
    var mm1h = typeof diaAtual.c60 === "number" ? diaAtual.c60 : 0;
    var mm24h = typeof diaAtual.chuva === "number" ? diaAtual.chuva : 0;

    var base = new Date(dataIso + "T12:00:00");
    var soma168 = 0, diasContados = 0;
    for (var i = 0; i < 7; i++) {
      var dt = new Date(base);
      dt.setDate(dt.getDate() - i);
      var k = dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-" + String(dt.getDate()).padStart(2, "0");
      if (diasMap[k] && typeof diasMap[k].chuva === "number") {
        soma168 += diasMap[k].chuva;
        diasContados++;
      }
    }

    var res = avaliarRisco({
      mm1h: mm1h,
      mm24h: mm24h,
      mm168h: soma168,
      fonte: (nomeEstacao || "Estação Local") + " (" + dataIso.slice(8, 10) + "/" + dataIso.slice(5, 7) + ")"
    });
    res.dataIso = dataIso;
    res.diasJanela168h = diasContados;
    return res;
  }

  // Extrai os volumes (1h atual, últimas 24h e últimas 168h, além do pico previsto nas próximas 24h)
  // a partir da série horária do Open-Meteo (quando consultado com past_days=7)
  function extrairDeSerieHoraria(hourly, horaAtualIso) {
    if (!hourly || !Array.isArray(hourly.time) || !Array.isArray(hourly.precipitation)) return null;
    var alvoHora = String(horaAtualIso || "").slice(0, 13) + ":00";
    var idxAgora = hourly.time.indexOf(alvoHora);
    if (idxAgora < 0) idxAgora = Math.max(0, hourly.time.length - 25);

    var p = hourly.precipitation;
    var mm1h = typeof p[idxAgora] === "number" ? p[idxAgora] : 0;

    var mm24h = 0;
    for (var i = Math.max(0, idxAgora - 23); i <= idxAgora; i++) {
      if (typeof p[i] === "number") mm24h += p[i];
    }

    var mm168h = 0;
    for (var j = Math.max(0, idxAgora - 167); j <= idxAgora; j++) {
      if (typeof p[j] === "number") mm168h += p[j];
    }

    // Também verifica se nas próximas 24h o pico horário ou acumulado 24h previsto vai elevar o risco
    var max1hProx24 = mm1h, somaProx24 = 0;
    for (var k = idxAgora + 1; k <= Math.min(hourly.time.length - 1, idxAgora + 24); k++) {
      var val = typeof p[k] === "number" ? p[k] : 0;
      somaProx24 += val;
      if (val > max1hProx24) max1hProx24 = val;
    }

    return {
      atual: avaliarRisco({ mm1h: mm1h, mm24h: mm24h, mm168h: mm168h, fonte: "Série Horária Cajamar (1h / 24h / 168h)" }),
      projecao24h: avaliarRisco({
        mm1h: max1hProx24,
        mm24h: somaProx24,
        mm168h: mm168h - mm24h + somaProx24,
        fonte: "Projeção Próximas 24h (Modelo)"
      })
    };
  }

  w.Deslizamento = {
    ESTADOS: ESTADOS,
    classificarPor1h: classificarPor1h,
    classificarPor24h: classificarPor24h,
    classificarPor168h: classificarPor168h,
    avaliarRisco: avaliarRisco,
    avaliarDiaEstacao: avaliarDiaEstacao,
    extrairDeSerieHoraria: extrairDeSerieHoraria
  };
})(typeof window !== "undefined" ? window : globalThis);
