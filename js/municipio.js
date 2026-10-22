// Limite oficial do município e dados do Censo (IBGE). Dados que quase não mudam: o último valor bom fica guardado.
(function (w) {
  "use strict";
  var IBGE = 3509205;
  var BASE = "https://servicodados.ibge.gov.br/api/v3/";
  var URL_MALHA = BASE + "malhas/municipios/" + IBGE + "?formato=application/vnd.geo+json&qualidade=maxima";
  // Cada variável numa consulta (pedir várias de uma vez devolve erro 500 no IBGE).
  var URL_POP = BASE + "agregados/4714/periodos/2022/variaveis/93?localidades=N6[" + IBGE + "]";
  var URL_DENS = BASE + "agregados/4714/periodos/2022/variaveis/614?localidades=N6[" + IBGE + "]";

  var estado = { geo: null, populacao: null, densidade: null, carregado: false };

  function geometria(j) {
    var g = j && (j.type === "FeatureCollection" ? (j.features || [])[0] : j);
    var geo = g && (g.type === "Feature" ? g.geometry : g);
    return geo && Geo.poligonos(geo).length ? geo : null;
  }
  function valor2022(j) {
    try {
      var n = Number(j[0].resultados[0].series[0].serie["2022"]);
      return isFinite(n) ? n : null;
    } catch (e) { return null; }
  }

  async function tentar(nome, url, validar) {
    try { return await Fontes.consultar(nome, url, validar); } catch (e) { return null; }
  }
  // Dados complementares (população, densidade): não entram no "estado das fontes"; se falhar, usa o último valor guardado.
  async function complementar(chave, url) {
    try {
      var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, 10000);
      var r = await fetch(url, { signal: ctl.signal }); clearTimeout(t);
      if (!r.ok) throw new Error("HTTP " + r.status);
      var v = valor2022(await r.json());
      if (v === null) throw new Error("formato inesperado");
      try { localStorage.setItem("cajamar:" + chave, String(v)); } catch (e) {}
      return v;
    } catch (e) {
      try { var g = Number(localStorage.getItem("cajamar:" + chave)); return isFinite(g) && g > 0 ? g : null; } catch (e2) { return null; }
    }
  }

  async function carregar() {
    var r = await Promise.all([
      tentar("ibge_limite", URL_MALHA, function (j) { return !!geometria(j); }),
      complementar("ibge_pop", URL_POP),
      complementar("ibge_dens", URL_DENS)
    ]);
    estado.geo = r[0] ? geometria(r[0].dados) : null;
    estado.populacao = r[1];
    estado.densidade = r[2];
    estado.carregado = true;
    document.dispatchEvent(new CustomEvent("cajamar:municipio", { detail: estado }));
    return estado;
  }

  w.Municipio = {
    IBGE: IBGE, URL_MALHA: URL_MALHA, URL_POP: URL_POP, URL_DENS: URL_DENS,
    geometria: geometria, valor2022: valor2022, carregar: carregar,
    dados: function () { return estado; }
  };
})(typeof window !== "undefined" ? window : globalThis);
