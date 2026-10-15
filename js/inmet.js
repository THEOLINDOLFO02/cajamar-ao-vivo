// Leitura dos dados oficiais do INMET (apiprevmet3) para um município.
(function (w) {
  "use strict";
  var IBGE = 3509205;
  var URL_AVISOS = "https://apiprevmet3.inmet.gov.br/avisos/ativos";
  var URL_PREVISAO = "https://apiprevmet3.inmet.gov.br/previsao/" + IBGE;

  function validarAvisos(j) { return !!(j && Array.isArray(j.hoje) && Array.isArray(j.futuro)); }
  function validarPrevisao(j) { return !!(j && j[String(IBGE)] && typeof j[String(IBGE)] === "object"); }

  // Avisos ativos que incluem o município, sem duplicatas e sem os encerrados.
  function avisosDoMunicipio(j) {
    var vistos = {}, out = [];
    (j.hoje || []).concat(j.futuro || []).forEach(function (a) {
      var cods = String(a.geocodes || "").replace(/[^0-9,]/g, "").split(",");
      var chave = a.id_aviso + "/" + a.id_sequencia;
      if (cods.indexOf(String(IBGE)) < 0 || a.encerrado || vistos[chave]) return;
      vistos[chave] = 1;
      var riscos = a.riscos, instr = a.instrucoes;
      try { if (typeof riscos === "string") riscos = JSON.parse(riscos); } catch (e) { riscos = [riscos]; }
      try { if (typeof instr === "string") instr = JSON.parse(instr); } catch (e) { instr = [instr]; }
      out.push({
        id: chave, poligono: lerPoligono(a.poligono), evento: a.descricao, severidade: a.severidade, inicio: a.inicio, fim: a.fim,
        cor: /^#[0-9a-f]{6}$/i.test(a.aviso_cor || "") ? a.aviso_cor : null,
        risco: (riscos || [])[0], instrucoes: instr || []
      });
    });
    return out;
  }

  // O campo "poligono" vem como texto JSON (às vezes duplamente codificado). Devolve um GeoJSON válido ou null.
  function lerPoligono(v) {
    try {
      var g = v;
      for (var i = 0; i < 2 && typeof g === "string"; i++) g = JSON.parse(g);
      if (g && (g.type === "Polygon" || g.type === "MultiPolygon") && Array.isArray(g.coordinates)) return g;
    } catch (e) {}
    return null;
  }

  function limites(g) {
    var polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates, b = [180, 90, -180, -90];
    polys.forEach(function (p) { (p[0] || []).forEach(function (c) {
      if (c[0] < b[0]) b[0] = c[0]; if (c[1] < b[1]) b[1] = c[1]; if (c[0] > b[2]) b[2] = c[0]; if (c[1] > b[3]) b[3] = c[1];
    }); });
    return b; // [oeste, sul, leste, norte]
  }

  // Avisos ativos que NÃO incluem o município, mas cuja área chega perto dele (para contexto no mapa).
  function avisosProximos(j, lat, lon, raio) {
    var vistos = {}, out = [];
    (j.hoje || []).concat(j.futuro || []).forEach(function (a) {
      var cods = String(a.geocodes || "").replace(/[^0-9,]/g, "").split(",");
      var chave = a.id_aviso + "/" + a.id_sequencia;
      if (cods.indexOf(String(IBGE)) > -1 || a.encerrado || vistos[chave]) return;
      var g = lerPoligono(a.poligono); if (!g) return;
      var b = limites(g);
      if (b[0] > lon + raio || b[2] < lon - raio || b[1] > lat + raio || b[3] < lat - raio) return;
      vistos[chave] = 1;
      out.push({ id: chave, poligono: g, evento: a.descricao, severidade: a.severidade, inicio: a.inicio, fim: a.fim,
        cor: /^#[0-9a-f]{6}$/i.test(a.aviso_cor || "") ? a.aviso_cor : null });
    });
    return out;
  }

  // Previsão ordenada por data; cada item tem "ref" (dados do dia) e, se houver, "per" (manhã/tarde/noite).
  function previsaoDoMunicipio(j) {
    var dias = j[String(IBGE)];
    function chave(s) { var p = String(s).split("/"); return p.length === 3 ? p[2] + p[1] + p[0] : s; }
    return Object.keys(dias).sort(function (a, b) { return chave(a) < chave(b) ? -1 : 1; }).map(function (dia) {
      var per = dias[dia] || {};
      var temPer = !!(per.manha || per.tarde || per.noite);
      return { dia: dia, ref: per.manha || per.tarde || per.noite || per, per: temPer ? per : null };
    });
  }

  w.Inmet = { IBGE: IBGE, URL_AVISOS: URL_AVISOS, URL_PREVISAO: URL_PREVISAO, validarAvisos: validarAvisos, validarPrevisao: validarPrevisao, avisosDoMunicipio: avisosDoMunicipio, avisosProximos: avisosProximos, previsaoDoMunicipio: previsaoDoMunicipio };
})(window);
