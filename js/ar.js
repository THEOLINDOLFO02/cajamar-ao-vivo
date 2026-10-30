// Qualidade do ar e índice UV (modelo CAMS/Copernicus via Open-Meteo). Estimativa de modelo, não é medição local.
(function (w) {
  "use strict";
  var LAT = -23.3547, LON = -46.8764;
  var URL_AR = "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=" + LAT + "&longitude=" + LON +
    "&current=us_aqi,pm10,pm2_5,ozone,uv_index&hourly=us_aqi,pm2_5,uv_index&forecast_days=2&timezone=America%2FSao_Paulo";

  // Faixas do índice US AQI (EPA). n = 0 (melhor) a 5 (pior).
  var FAIXAS_AQI = [
    { max: 50, n: 0, nome: "Boa", dica: "Qualidade do ar satisfatória." },
    { max: 100, n: 1, nome: "Moderada", dica: "Pessoas muito sensíveis podem notar efeitos; fique atento a sintomas respiratórios." },
    { max: 150, n: 2, nome: "Ruim para grupos sensíveis", dica: "Crianças, idosos e pessoas com asma ou problemas no coração devem reduzir esforço ao ar livre." },
    { max: 200, n: 3, nome: "Ruim", dica: "Todos podem sentir efeitos: reduza a atividade física intensa ao ar livre." },
    { max: 300, n: 4, nome: "Muito ruim", dica: "Evite atividades ao ar livre." },
    { max: Infinity, n: 5, nome: "Perigosa", dica: "Emergência de saúde: permaneça em ambiente fechado." }
  ];
  // Faixas do índice UV (OMS).
  var FAIXAS_UV = [
    { max: 2.99, n: 0, nome: "Baixo", dica: "Sem necessidade de proteção especial." },
    { max: 5.99, n: 1, nome: "Moderado", dica: "Use protetor solar e óculos se ficar muito tempo ao ar livre." },
    { max: 7.99, n: 2, nome: "Alto", dica: "Proteja-se: protetor solar, chapéu e sombra entre 10h e 16h." },
    { max: 10.99, n: 3, nome: "Muito alto", dica: "Evite o sol entre 10h e 16h e reforce a proteção." },
    { max: Infinity, n: 4, nome: "Extremo", dica: "Evite a exposição ao sol; proteção máxima." }
  ];

  function ok(v) { return typeof v === "number" && isFinite(v); }
  function achar(v, faixas) {
    if (!ok(v) || v < 0) return null;
    for (var i = 0; i < faixas.length; i++) if (v <= faixas[i].max) return faixas[i];
    return null;
  }
  function classificarAqi(v) { return achar(v, FAIXAS_AQI); }
  // O índice UV é divulgado como número inteiro (arredondado) na escala da OMS; 2,6 vira 3 (Moderado), igual ao publicar.js.
  function classificarUv(v) { return ok(v) ? achar(Math.round(v), FAIXAS_UV) : null; }

  // Resume a resposta da API: valores de agora, pior AQI nas próximas 24 h e UV máximo do dia.
  function resumir(j) {
    var h = j.hourly || {}, tempos = h.time || [], c = j.current || {};
    var i0 = SerieOM.indiceHora(tempos, c.time); // -1 = hora atual ausente: sem "pior AQI das próximas 24 h"
    var dia = String(c.time || tempos[0] || "").slice(0, 10);
    var pior = null, uvDia = null;
    for (var i = Math.max(i0, 0); i0 >= 0 && i < Math.min(tempos.length, i0 + 24); i++) {
      var a = h.us_aqi && h.us_aqi[i];
      if (ok(a) && (!pior || a > pior.v)) pior = { v: a, hora: String(tempos[i]).slice(11, 13) + "h" };
    }
    for (var k = 0; k < tempos.length; k++) {
      var u = h.uv_index && h.uv_index[k];
      if (String(tempos[k]).slice(0, 10) === dia && ok(u) && (!uvDia || u > uvDia.v)) uvDia = { v: u, hora: String(tempos[k]).slice(11, 13) + "h" };
    }
    return {
      aqi: ok(c.us_aqi) ? c.us_aqi : null, pm25: ok(c.pm2_5) ? c.pm2_5 : null, pm10: ok(c.pm10) ? c.pm10 : null,
      ozonio: ok(c.ozone) ? c.ozone : null, uv: ok(c.uv_index) ? c.uv_index : null,
      hora: String(c.time || "").slice(11, 16), piorAqi24h: pior, uvMaxDia: uvDia
    };
  }

  function validar(j) { return !!(j && j.current && j.hourly && Array.isArray(j.hourly.time)); }

  var api = { URL: URL_AR, classificarAqi: classificarAqi, classificarUv: classificarUv, resumir: resumir, validar: validar };

  // ---------- parte de tela (só roda no navegador) ----------
  if (typeof document !== "undefined") {
    var el = function (t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x !== undefined) e.textContent = x; return e; };
    var num = function (v, d) { return ok(v) ? v.toFixed(d === undefined ? 0 : d).replace(".", ",") : "—"; };

    api.carregar = async function () {
      var B = document.getElementById("ar");
      if (!B) return;
      try {
        var r = await Fontes.consultar("ar", URL_AR, validar);
        var d = resumir(r.dados), a = classificarAqi(d.aqi), u = classificarUv(d.uv);
        B.textContent = ""; B.className = "";
        if (r.antigo) B.appendChild(el("p", "stale", "Não foi possível atualizar agora. Mostrando dados antigos, coletados em " + new Date(r.de).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) + "."));

        var grade = el("div", "ar-grade");
        function tile(rotulo, valor, faixa, extra) {
          var t = el("div", "ar-tile"); t.dataset.n = faixa ? String(faixa.n) : "";
          t.appendChild(el("span", "", rotulo));
          t.appendChild(el("strong", "", valor));
          t.appendChild(el("em", "ar-nivel", faixa ? faixa.nome : "sem dado"));
          if (extra) t.appendChild(el("small", "", extra));
          return t;
        }
        var tAqi = tile("Qualidade do ar (US AQI)", num(d.aqi), a, d.piorAqi24h ? "Pior previsto em 24 h: " + num(d.piorAqi24h.v) + " (" + classificarAqi(d.piorAqi24h.v).nome + ") às " + d.piorAqi24h.hora : "");
        tAqi.classList.add("aqi");
        var tUv = tile("Índice UV agora", num(d.uv, 1), u, d.uvMaxDia ? "Máximo de hoje: " + num(d.uvMaxDia.v, 1) + " (" + classificarUv(d.uvMaxDia.v).nome + ") às " + d.uvMaxDia.hora : "");
        tUv.classList.add("uv");
        grade.appendChild(tAqi); grade.appendChild(tUv);
        B.appendChild(grade);

        var k = el("div", "k");
        [["PM2,5", num(d.pm25, 1) + " µg/m³"], ["PM10", num(d.pm10, 1) + " µg/m³"], ["Ozônio", num(d.ozonio) + " µg/m³"]].forEach(function (p) {
          var x = el("div"); x.appendChild(el("span", "", p[0])); x.appendChild(el("strong", "", p[1])); k.appendChild(x);
        });
        B.appendChild(k);

        var dicas = el("ul", "ar-dicas");
        if (a) dicas.appendChild(el("li", "", "Ar: " + a.dica));
        var uvRef = d.uvMaxDia && d.uvMaxDia.v > (d.uv || 0) ? classificarUv(d.uvMaxDia.v) : u;
        if (uvRef) dicas.appendChild(el("li", "", "Sol: " + uvRef.dica));
        B.appendChild(dicas);
        B.appendChild(el("p", "mut ar-fonte", "Estimativa do modelo CAMS (Copernicus) via Open-Meteo para a região de Cajamar, atualizada às " + (d.hora || "—") + ". Não é medição local; para dados oficiais do estado, consulte a CETESB."));

        document.dispatchEvent(new CustomEvent("cajamar:ar", { detail: { aqi: d.aqi, uv: d.uv, uvMax: d.uvMaxDia ? d.uvMaxDia.v : null, aqiNivel: a ? a.n : null, antigo: !!r.antigo } }));
      } catch (e) {
        B.textContent = ""; B.className = "";
        B.appendChild(el("span", "err", "Não foi possível consultar a qualidade do ar agora e não há dado guardado."));
      }
    };
  }

  w.Ar = api;
})(typeof window !== "undefined" ? window : globalThis);
