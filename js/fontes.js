// Utilitários para consultar fontes de forma independente.
// Cada fonte tem estado próprio (ok / erro / dado antigo) e guarda a última resposta boa.
(function (w) {
  "use strict";
  var TIMEOUT_MS = 12000;
  var PREFIXO = "cajamar:";
  var estado = {}; // nome -> {estado, tentativa, sucesso, msg}

  function guardar(nome, dados) {
    try { localStorage.setItem(PREFIXO + nome, JSON.stringify({ t: Date.now(), d: dados })); } catch (e) {}
  }
  function lerGuardado(nome) {
    try {
      var x = JSON.parse(localStorage.getItem(PREFIXO + nome));
      return x && x.t ? x : null;
    } catch (e) { return null; }
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
  async function consultar(nome, url, validar) {
    var ultimoErro;
    for (var i = 0; i < 2; i++) {
      try {
        var d = await buscarJson(url);
        if (validar && !validar(d)) throw new Error("resposta em formato inesperado");
        guardar(nome, d);
        estado[nome] = { estado: "ok", tentativa: Date.now(), sucesso: Date.now() };
        return { dados: d, antigo: false, de: Date.now() };
      } catch (e) {
        ultimoErro = e;
        if (i === 0) await new Promise(function (r) { setTimeout(r, 1500); });
      }
    }
    var g = lerGuardado(nome);
    var msg = ultimoErro && ultimoErro.name === "AbortError" ? "tempo esgotado" : (ultimoErro && ultimoErro.message) || "falha";
    if (g) {
      estado[nome] = { estado: "velho", tentativa: Date.now(), sucesso: g.t, msg: msg };
      return { dados: g.d, antigo: true, de: g.t };
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

  w.Fontes = { consultar: consultar, estado: estado, marcarErro: marcarErro, marcarOk: marcarOk };
})(window);
