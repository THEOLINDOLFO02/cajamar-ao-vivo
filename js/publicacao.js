// Regras puras da geração de publicações (sem DOM, testáveis no Node): números ausentes, referência temporal em
// America/Sao_Paulo, estado das fontes (INMET / INPE / modelo), rastreabilidade, faixa de status e ciclo de geração.
//
// Princípios: dado ausente NUNCA vira zero; consulta indisponível NUNCA vira "sem avisos" nem "0 focos";
// a referência temporal é validada (senão a geração é interrompida); a imagem só é exportável quando a montagem terminou.
// Os prazos de FRESCOR_MS são critérios de apresentação (idade do dado), não limiares meteorológicos.
(function (w) {
  "use strict";
  var TZ = "America/Sao_Paulo";
  var HORA = 3600000;
  var FRESCOR_MS = { clima: 3 * HORA, avisos: 3 * HORA, previsao: 6 * HORA, focos: 6 * HORA };

  // ---------- números ----------
  function num(v) { return typeof v === "number" && isFinite(v) ? v : null; }

  // Classifica um valor: ok (número ≠ 0), zero (0 informado), ausente (null/undefined/""), invalido (outro).
  function estadoValor(v) {
    if (v === null || v === undefined || v === "") return { estado: "ausente", valor: null };
    var n = num(v);
    if (n === null) return { estado: "invalido", valor: null };
    return { estado: n === 0 ? "zero" : "ok", valor: n };
  }
  function fmt(v, casas, sufixo) {
    var n = num(v);
    return n === null ? "—" : n.toFixed(casas).replace(".", ",") + (sufixo || "");
  }
  function mm(v) { return fmt(v, 1); }
  function pct(v) { var n = num(v); return n === null ? "—" : Math.round(n) + "%"; }
  function inteiro(v) { var n = num(v); return n === null ? "—" : String(Math.round(n)); }
  function graus(v) { var n = num(v); return n === null ? "—" : Math.round(n) + "°"; }
  function maiorOuIgual(v, limite) { var n = num(v); return n !== null && n >= limite; }

  // ---------- tempo (America/Sao_Paulo) ----------
  var fmtSP = null;
  function formatador() {
    if (!fmtSP) fmtSP = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    return fmtSP;
  }
  function partesSP(ms) {
    var p = {};
    formatador().formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; });
    return { ano: p.year, mes: p.month, dia: p.day, hora: p.hour === "24" ? "00" : p.hour, min: p.minute };
  }
  function dataSP(ms) { var p = partesSP(ms); return p.ano + "-" + p.mes + "-" + p.dia; }
  function horaSP(ms) { if (num(ms) === null) return "—"; var p = partesSP(ms); return p.hora + ":" + p.min; }
  function dataHoraSP(ms) { if (num(ms) === null) return "—"; var p = partesSP(ms); return p.dia + "/" + p.mes + " " + p.hora + ":" + p.min; }
  function dataHoraLongaSP(ms) { if (num(ms) === null) return "—"; var p = partesSP(ms); return p.dia + "/" + p.mes + "/" + p.ano + " " + p.hora + ":" + p.min; }
  function dataCurta(iso) { return String(iso).slice(8, 10) + "/" + String(iso).slice(5, 7) + "/" + String(iso).slice(0, 4); }

  function diaIsoValido(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
    if (!m) return null;
    var t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    var d = new Date(t);
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? t : null;
  }

  // Valida a série da API e determina o dia de hoje em Cajamar. Nunca assume o índice 0.
  // Devolve { ok, motivo, hojeIso, idxHoje, curMs, atrasoMs }.
  function referenciaTemporal(clima, agoraMs) {
    var falha = function (m) { return { ok: false, motivo: m, hojeIso: null, idxHoje: -1 }; };
    if (!clima || !clima.daily || !Array.isArray(clima.daily.time) || !clima.daily.time.length) return falha("série diária de datas ausente na resposta da API");
    var tempos = clima.daily.time, anterior = null;
    for (var i = 0; i < tempos.length; i++) {
      var t = diaIsoValido(tempos[i]);
      if (t === null) return falha("data inválida na série diária (" + tempos[i] + ")");
      if (anterior !== null) {
        if (t === anterior) return falha("data duplicada na série diária (" + tempos[i] + ")");
        if (t < anterior) return falha("série diária fora de ordem (" + tempos[i] + ")");
        if (t - anterior !== 86400000) return falha("série diária com lacuna antes de " + tempos[i]);
      }
      anterior = t;
    }
    if (clima.hourly && Array.isArray(clima.hourly.time)) {
      var vistos = {}, ant = null;
      for (var j = 0; j < clima.hourly.time.length; j++) {
        var h = clima.hourly.time[j];
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(h)) || diaIsoValido(String(h).slice(0, 10)) === null) return falha("horário inválido na série horária (" + h + ")");
        if (vistos[h]) return falha("horário duplicado na série horária (" + h + ")");
        if (ant !== null && h < ant) return falha("série horária fora de ordem (" + h + ")");
        vistos[h] = 1; ant = h;
      }
    }
    var cur = clima.current && clima.current.time;
    var mc = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(cur || ""));
    if (!mc || diaIsoValido(mc[1] + "-" + mc[2] + "-" + mc[3]) === null) return falha("horário atual da API ausente ou inválido");
    var curIso = mc[1] + "-" + mc[2] + "-" + mc[3];
    var curMs = Date.UTC(+mc[1], +mc[2] - 1, +mc[3], +mc[4], +mc[5]) + 3 * HORA; // a API devolve horário local de SP (UTC-3)
    var hojeSP = dataSP(agoraMs);
    if (curIso !== hojeSP) return falha("a API retornou dados de " + dataCurta(curIso) + ", mas hoje em Cajamar (America/Sao_Paulo) é " + dataCurta(hojeSP));
    var idx = tempos.indexOf(curIso);
    if (idx < 0) return falha("a data de hoje (" + dataCurta(curIso) + ") não foi encontrada na série diária");
    return { ok: true, motivo: "", hojeIso: curIso, idxHoje: idx, curMs: curMs, atrasoMs: agoraMs - curMs };
  }

  // ---------- estado das fontes ----------
  // resultado = retorno de Fontes.consultar ({dados, antigo, de, erro?}) ou null; erro = exceção quando não há dado algum.
  // estado: ok (consulta feita agora) | cache (consulta falhou; dado guardado ainda dentro do prazo) |
  //         desatualizado (dado guardado além do prazo) | indisponivel (nenhum dado).
  function estadoFonte(o) {
    var r = o.resultado, agora = o.agoraMs, limite = o.limiteMs;
    if (!r || r.dados === undefined || r.dados === null) {
      return { estado: "indisponivel", usavel: false, ultimaValida: null, coletadoEm: null, motivo: motivoErro(o.erro) };
    }
    var de = num(r.de);
    if (!r.antigo) return { estado: "ok", usavel: true, ultimaValida: de, coletadoEm: de, motivo: "" };
    var idade = de === null ? Infinity : agora - de;
    if (idade > limite) return { estado: "desatualizado", usavel: false, ultimaValida: de, coletadoEm: de, motivo: "consulta falhou e o último dado válido é de " + dataHoraLongaSP(de) + (r.erro ? " (" + r.erro + ")" : "") };
    return { estado: "cache", usavel: true, ultimaValida: de, coletadoEm: de, motivo: "consulta falhou; usando o último dado válido de " + dataHoraLongaSP(de) + (r.erro ? " (" + r.erro + ")" : "") };
  }
  function motivoErro(e) {
    if (!e) return "sem resposta";
    if (e.name === "AbortError") return "tempo esgotado";
    return e.message ? String(e.message) : String(e);
  }

  function avisoExpirado(a, agoraMs) {
    var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(a && a.fim || ""));
    if (!m) return false;
    var fimMs = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) + 3 * HORA;
    return fimMs < agoraMs;
  }

  // Estado dos avisos INMET: nunca confunde falha com ausência de avisos.
  // estado: com_avisos | sem_avisos | indisponivel | desatualizado.
  function statusAvisos(fonte, lista, agoraMs) {
    if (!fonte || !fonte.usavel || !Array.isArray(lista)) {
      return { estado: fonte && fonte.estado === "desatualizado" ? "desatualizado" : "indisponivel", avisos: null, ultimaValida: fonte ? fonte.ultimaValida : null, deCache: false, motivo: fonte ? fonte.motivo : "consulta não realizada" };
    }
    var ativos = lista.filter(function (a) { return !avisoExpirado(a, agoraMs); });
    return { estado: ativos.length ? "com_avisos" : "sem_avisos", avisos: ativos, ultimaValida: fonte.ultimaValida, deCache: fonte.estado === "cache", motivo: fonte.motivo };
  }

  var AREA_FOCOS = "município de Cajamar/SP e raio de 50 km";
  // Estado da consulta de focos INPE: com_focos | sem_focos | indisponivel.
  // coleta = { coletadoEm, fonte, focos, parcial, arquivosLidos, arquivosTentados } da consulta feita agora, ou null.
  // ultimaValida = { t, n } do último resultado completo guardado (informativo; nunca vale como contagem atual).
  function statusFocos(o) {
    var c = o.coleta, ult = o.ultimaValida || null;
    if (!c || !Array.isArray(c.focos)) {
      return { estado: "indisponivel", n: null, parcial: false, motivo: motivoErro(o.erro), fonte: "INPE BDQueimadas", area: AREA_FOCOS, coletadoEm: null, ultimaValida: ult };
    }
    var t = Date.parse(c.coletadoEm);
    var base = { fonte: c.fonte || "INPE BDQueimadas", area: AREA_FOCOS, coletadoEm: isFinite(t) ? t : null, ultimaValida: ult, parcial: !!c.parcial };
    if (c.parcial && !c.focos.length) {
      return Object.assign(base, { estado: "indisponivel", n: null, motivo: "consulta incompleta (" + c.arquivosLidos + " de " + c.arquivosTentados + " arquivos lidos): não é possível afirmar que não há focos" });
    }
    return Object.assign(base, { estado: c.focos.length ? "com_focos" : "sem_focos", n: c.focos.length, motivo: c.parcial ? "consulta parcial (" + c.arquivosLidos + " de " + c.arquivosTentados + " arquivos): contagem mínima" : "" });
  }

  // ---------- rastreabilidade ----------
  // o: { fonte, natureza ("previsão"|"medição"|"estimativa de modelo"|"mista"|"simulação"), referenciaIso, coletaMs, estado ("ok"|"cache"|"desatualizado"|"indisponivel"), ultimaValidaMs, parcial }
  function textoRastro(o) {
    var p = [];
    p.push("Fonte: " + (o.fonte || "não informada"));
    if (o.natureza) p.push(o.natureza);
    if (o.referenciaIso) p.push("ref. " + dataCurta(o.referenciaIso));
    if (num(o.coletaMs) !== null) p.push("coleta " + dataHoraSP(o.coletaMs) + " (SP)");
    if (o.estado === "cache") p.push("DADO DO CACHE (última atualização válida " + dataHoraSP(o.ultimaValidaMs) + ")");
    else if (o.estado === "desatualizado") p.push("DESATUALIZADO (última atualização válida " + dataHoraSP(o.ultimaValidaMs) + ")");
    else if (o.estado === "indisponivel") p.push("FONTE INDISPONÍVEL");
    if (o.parcial) p.push("DADOS PARCIAIS");
    if (o.extra) p.push(o.extra);
    return p.join(" · ");
  }

  // ---------- texto: quebra com limite ----------
  // medir(txt) devolve a largura em pixels. Quebra por palavras (e palavras gigantes por caractere); se passar de maxLinhas,
  // corta com reticências e informa quantas linhas ficaram de fora.
  function cortarComReticencias(txt, larg, medir) {
    if (medir(txt) <= larg) return txt;
    var t = txt;
    while (t.length > 1 && medir(t + "…") > larg) t = t.slice(0, -1);
    return t.replace(/\s+$/, "") + "…";
  }
  function encaixarTexto(texto, larg, medir, maxLinhas) {
    var palavras = String(texto === null || texto === undefined ? "" : texto).split(/\s+/).filter(Boolean), linhas = [], at = "";
    function empurra(p) {
      while (medir(p) > larg && p.length > 1) {
        var k = p.length - 1;
        while (k > 1 && medir(p.slice(0, k)) > larg) k--;
        if (at) { linhas.push(at); at = ""; }
        linhas.push(p.slice(0, k));
        p = p.slice(k);
      }
      return p;
    }
    palavras.forEach(function (p) {
      var t = at ? at + " " + p : p;
      if (medir(t) <= larg) { at = t; return; }
      if (at) linhas.push(at);
      at = "";
      at = empurra(p);
    });
    if (at) linhas.push(at);
    var total = linhas.length;
    if (maxLinhas && total > maxLinhas) {
      var vis = linhas.slice(0, maxLinhas);
      vis[maxLinhas - 1] = cortarComReticencias(vis[maxLinhas - 1] + " …", larg, medir);
      return { linhas: vis, truncado: true, ocultas: total - maxLinhas };
    }
    return { linhas: linhas, truncado: false, ocultas: 0 };
  }

  // ---------- faixa de status ----------
  var NIVEIS_FAIXA = {
    normal: { cor: "#15803d", sev: 0, rotulo: "NORMALIDADE" },
    atencao: { cor: "#d97706", sev: 1, rotulo: "OBSERVAÇÃO" },
    alerta: { cor: "#e5771a", sev: 2, rotulo: "ATENÇÃO" },
    emergencia: { cor: "#dc2626", sev: 3, rotulo: "ALERTA" },
    maximo: { cor: "#6b21a8", sev: 4, rotulo: "ALERTA MÁXIMO" }
  };
  // Gravidade que o TEXTO transmite (0 = normalidade, 2 = alerta/aviso, 3 = emergência) ou null quando é só informativo.
  function severidadeTexto(t) {
    var s = String(t || "").toLowerCase();
    if (!s.trim()) return null;
    if (/emerg[eê]ncia|evacu|perigo|desastre|alerta m[aá]ximo|aviso (ativo|oficial)|⚠️|🔴|🟣/.test(s)) return 3;
    if (/\balerta\b|aten[cç][aã]o|risco|ventania|chuva forte|🟠/.test(s)) return 2;
    if (/normal|sem alerta|tranquil|🟢/.test(s)) return 0;
    return null;
  }
  // auto = { cor, texto, origem ("inmet"|"automatica"), sev? }; operador = { nivel ("auto"|chave), texto, justificativa }
  function avaliarFaixa(auto, operador) {
    var op = operador || {}, nivel = op.nivel && NIVEIS_FAIXA[op.nivel] ? op.nivel : "auto";
    var textoOp = String(op.texto || "").trim();
    var textoAuto = (auto && auto.texto) || "";
    var texto = textoOp || textoAuto;
    var editouTexto = !!textoOp && textoOp !== textoAuto;
    var cor = nivel === "auto" ? (auto && auto.cor) || "#0284c7" : NIVEIS_FAIXA[nivel].cor;
    var porOperador = nivel !== "auto" || editouTexto;
    var sevCor = nivel === "auto" ? (auto && typeof auto.sev === "number" ? auto.sev : null) : NIVEIS_FAIXA[nivel].sev;
    var sevTexto = severidadeTexto(texto);
    var incoerente = false, motivo = "";
    if (porOperador && sevCor !== null && sevTexto !== null) {
      if (sevCor >= 2 && sevTexto === 0) { incoerente = true; motivo = "cor de alerta com texto de normalidade"; }
      else if (sevCor === 0 && sevTexto >= 2) { incoerente = true; motivo = "cor de normalidade com texto de alerta/emergência"; }
    }
    var just = String(op.justificativa || "").trim();
    var justificada = just.length >= 5;
    return {
      cor: cor, texto: texto, origem: porOperador ? "operador" : (auto && auto.origem) || "automatica",
      porOperador: porOperador, incoerente: incoerente, motivoIncoerencia: motivo, justificativa: just, justificada: justificada,
      bloqueia: incoerente && !justificada,
      selo: porOperador ? "FAIXA DEFINIDA PELO OPERADOR" + (incoerente && justificada ? " · Justificativa: " + just : "") : ""
    };
  }

  // ---------- ciclo de geração ----------
  // estados: ocioso | gerando | pronto | falha. Só "pronto" é exportável, e só para o modelo/formato em meta.
  function criarCiclo() {
    var s = { estado: "ocioso", token: 0, meta: null, motivo: "" };
    return {
      iniciar: function (info) { s.token++; s.estado = "gerando"; s.meta = Object.assign({}, info || {}); s.motivo = ""; return s.token; },
      concluir: function (token, meta) {
        if (token !== s.token) return false; // montagem antiga terminando depois de uma nova
        s.estado = "pronto"; s.meta = Object.assign({}, s.meta, meta || {}); s.motivo = ""; return true;
      },
      falhar: function (token, motivo) {
        if (token !== s.token) return false;
        s.estado = "falha"; s.meta = null; s.motivo = motivo || "falha na geração"; return true;
      },
      atualizar: function (meta) { if (s.estado === "pronto") s.meta = Object.assign({}, s.meta, meta || {}); },
      invalidar: function (motivo) { s.token++; s.estado = "falha"; s.meta = null; s.motivo = motivo || "prévia invalidada"; },
      get: function () { return { estado: s.estado, token: s.token, meta: s.meta, motivo: s.motivo }; },
      // Pode exportar? Devolve { ok, motivo }.
      podeExportar: function (tipoAtual, formatoAtual) {
        if (s.estado === "gerando") return { ok: false, motivo: "A publicação ainda está sendo gerada. Aguarde terminar." };
        if (s.estado !== "pronto" || !s.meta) return { ok: false, motivo: s.motivo ? "Sem imagem válida: " + s.motivo : "Nenhuma publicação gerada." };
        if (s.meta.tipo !== tipoAtual) return { ok: false, motivo: "A prévia não corresponde ao modelo selecionado. Gere a publicação novamente." };
        if (formatoAtual && s.meta.formato !== formatoAtual) return { ok: false, motivo: "O formato da prévia mudou. Gere a publicação novamente." };
        return { ok: true, motivo: "" };
      }
    };
  }

  w.Publicacao = {
    TZ: TZ, FRESCOR_MS: FRESCOR_MS, AREA_FOCOS: AREA_FOCOS, NIVEIS_FAIXA: NIVEIS_FAIXA,
    num: num, estadoValor: estadoValor, fmt: fmt, mm: mm, pct: pct, inteiro: inteiro, graus: graus, maiorOuIgual: maiorOuIgual,
    partesSP: partesSP, dataSP: dataSP, horaSP: horaSP, dataHoraSP: dataHoraSP, dataHoraLongaSP: dataHoraLongaSP, dataCurta: dataCurta,
    referenciaTemporal: referenciaTemporal,
    estadoFonte: estadoFonte, motivoErro: motivoErro, avisoExpirado: avisoExpirado, statusAvisos: statusAvisos, statusFocos: statusFocos,
    textoRastro: textoRastro, cortarComReticencias: cortarComReticencias, encaixarTexto: encaixarTexto,
    severidadeTexto: severidadeTexto, avaliarFaixa: avaliarFaixa, criarCiclo: criarCiclo
  };
})(typeof window !== "undefined" ? window : globalThis);
