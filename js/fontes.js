// Utilitários para consultar fontes de forma independente.
// Cada fonte tem estado próprio (ok / erro / dado antigo) e guarda a última resposta boa.
(function (w) {
  "use strict";
  var TIMEOUT_MS = 12000;
  var PREFIXO = "cajamar:";
  var CHAVES_PROTEGIDAS = {
    "cajamar:ocorrencias:v1": 1,
    "cajamar:observacoes:v1": 1,
    "cajamar:estacoes:v2": 1,
    "cajamar:historico:v1": 1,
    "cajamar:cotas_rio:v1": 1,
    "cajamar:tema": 1,
    "cajamar:contato": 1,
    "cajamar:alertaSom": 1
  };
  var estado = {}; // nome -> {estado, tentativa, sucesso, msg}
  var emAndamento = {}; // nome -> promessa da consulta em curso (evita pedidos duplicados)

  function obterStorage() {
    try {
      return w.localStorage || (typeof localStorage !== "undefined" ? localStorage : null);
    } catch (e) { return null; }
  }

  function liberarEspacoCache(excetoChave) {
    try {
      var st = obterStorage();
      if (!st) return;
      var candidatos = [];
      for (var i = 0; i < st.length; i++) {
        var k = st.key(i);
        if (!k || k.indexOf(PREFIXO) !== 0 || CHAVES_PROTEGIDAS[k] || k === excetoChave) continue;
        try {
          var obj = JSON.parse(st.getItem(k));
          if (obj && typeof obj.t === "number") candidatos.push({ k: k, t: obj.t });
        } catch (e2) {
          if (typeof console !== "undefined") console.warn("[fontes] cache ilegível ignorado:", k);
        }
      }
      candidatos.sort(function (a, b) { return a.t - b.t; });
      candidatos.slice(0, Math.max(1, Math.ceil(candidatos.length / 2))).forEach(function (c) {
        st.removeItem(c.k);
      });
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[fontes] não foi possível liberar espaço do cache:", e);
    }
  }

  function guardar(nome, dados) {
    var st = obterStorage();
    if (!st) return false;
    var chave = PREFIXO + nome;
    var payload = JSON.stringify({ t: Date.now(), d: dados });
    try {
      st.setItem(chave, payload);
    } catch (e) {
      liberarEspacoCache(chave);
      try { st.setItem(chave, payload); } catch (e2) {
        if (typeof console !== "undefined") console.warn("[fontes] não foi possível guardar o último dado de " + nome + ":", e2);
        return false;
      }
    }
    return true;
  }
  // Último dado guardado. Com "validar", um conteúdo fora do formato esperado é descartado (não é usado como dado válido).
  function lerGuardado(nome, validar) {
    try {
      var st = obterStorage();
      if (!st) return null;
      var cru = st.getItem(PREFIXO + nome);
      if (!cru) return null;
      var x = JSON.parse(cru);
      if (!x || !x.t) return null;
      if (validar && !validar(x.d)) {
        if (typeof console !== "undefined") console.warn("[fontes] dado guardado de " + nome + " em formato inesperado: descartado");
        return null;
      }
      return x;
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[fontes] dado guardado de " + nome + " ilegível:", e);
      return null;
    }
  }

  async function buscarJson(url) {
    var ctl = new AbortController();
    var t = setTimeout(function () { ctl.abort(); }, TIMEOUT_MS);
    try {
      var r = await fetch(url, { signal: ctl.signal, cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  }

  // Tenta 2 vezes. Devolve {dados, antigo:false} ou, se falhar, o último dado bom
  // ({dados, antigo:true, de:timestamp}); sem nada guardado, lança o erro.
  function consultar(nome, url, validar) {
    if (!emAndamento[nome]) {
      emAndamento[nome] = consultarUmaVez(nome, url, validar).finally(function () { delete emAndamento[nome]; });
    }
    return emAndamento[nome];
  }

  async function consultarUmaVez(nome, url, validar) {
    var ultimoErro;
    // Sem internet não adianta repetir: vai direto para o último dado guardado.
    var offline = typeof navigator !== "undefined" && navigator.onLine === false;
    var tentativas = offline ? 1 : 2;
    for (var i = 0; i < tentativas; i++) {
      try {
        var d = await buscarJson(url);
        if (validar && !validar(d)) throw new Error("resposta em formato inesperado");
        guardar(nome, d);
        estado[nome] = { estado: "ok", tentativa: Date.now(), sucesso: Date.now() };
        return { dados: d, antigo: false, de: Date.now() };
      } catch (e) {
        ultimoErro = e;
        if (i < tentativas - 1) await new Promise(function (r) { setTimeout(r, 1500); });
      }
    }
    var g = lerGuardado(nome, validar);
    var msg = ultimoErro && ultimoErro.name === "AbortError" ? "tempo esgotado" : (ultimoErro && ultimoErro.message) || "falha";
    if (g) {
      estado[nome] = { estado: "velho", tentativa: Date.now(), sucesso: g.t, msg: msg };
      return { dados: g.d, antigo: true, de: g.t, erro: msg };
    }
    estado[nome] = { estado: "erro", tentativa: Date.now(), sucesso: null, msg: msg };
    throw ultimoErro;
  }

  function marcarErro(nome, msg) {
    var s = estado[nome] || {};
    estado[nome] = { estado: "erro", tentativa: Date.now(), sucesso: s.sucesso || null, msg: msg };
  }
  function marcarOk(nome) {
    estado[nome] = { estado: "ok", tentativa: Date.now(), sucesso: Date.now() };
  }

  w.Fontes = {
    consultar: consultar,
    estado: estado,
    marcarErro: marcarErro,
    marcarOk: marcarOk,
    guardar: guardar,
    lerGuardado: lerGuardado
  };
})(typeof window !== "undefined" ? window : globalThis);
