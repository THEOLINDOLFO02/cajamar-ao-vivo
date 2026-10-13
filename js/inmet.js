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
        evento: a.descricao, severidade: a.severidade, inicio: a.inicio, fim: a.fim,
        cor: /^#[0-9a-f]{6}$/i.test(a.aviso_cor || "") ? a.aviso_cor : null,
        risco: (riscos || [])[0], instrucoes: instr || []
      });
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

  w.Inmet = { IBGE: IBGE, URL_AVISOS: URL_AVISOS, URL_PREVISAO: URL_PREVISAO, validarAvisos: validarAvisos, validarPrevisao: validarPrevisao, avisosDoMunicipio: avisosDoMunicipio, previsaoDoMunicipio: previsaoDoMunicipio };
})(window);
