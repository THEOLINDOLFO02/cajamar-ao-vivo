// Cartão "Chuva observada (CEMADEN)": lê data/cemaden.json, gerado pelo robô do GitHub Actions.
(function (w) {
  "use strict";
  var LIMITE_MIN = 360; // estações com leitura mais velha que isso (em relação à rede) não entram na lista
  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x !== undefined) e.textContent = x; return e; }
  function mm(v) { return v === null || v === undefined ? "sem dado" : String(v).replace(".", ",") + " mm"; }
  function dh(ts) { return new Date(ts).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); }
  function atraso(min) {
    if (min === null) return "—";
    if (min < 60) return min + " min";
    return Math.floor(min / 60) + " h" + (min % 60 ? " " + (min % 60) + " min" : "");
  }
  function nome(s) { return String(s).toLowerCase().replace(/(^|\s)(\S)/g, function (m, a, b) { return a + b.toUpperCase(); }).replace(/ (Da|De|Do|Das|Dos) /g, function (m) { return m.toLowerCase(); }); }
  function validar(j) { return !!(j && Array.isArray(j.estacoes) && j.coletadoEm); }

  async function carregar() {
    var B = document.getElementById("cemaden");
    if (!B) return;
    try {
      var r = await Fontes.consultar("cemaden", "data/cemaden.json?t=" + Math.floor(Date.now() / 60000), validar);
      var j = r.dados;
      B.textContent = ""; B.className = "";
      if (r.antigo) B.appendChild(el("p", "stale", "Não foi possível atualizar agora. Mostrando dados antigos, coletados em " + dh(r.de) + "."));
      var idadeColeta = Math.round((Date.now() - new Date(j.coletadoEm).getTime()) / 60000);
      B.appendChild(el("p", "mut", "Coletado do CEMADEN em " + dh(j.coletadoEm) + " (há " + atraso(idadeColeta) + "). Leitura mais recente da rede: " + j.referenciaRede + " (horário informado pelo CEMADEN)."));
      if (idadeColeta > 90) B.appendChild(el("p", "stale", "Coleta com mais de 1 h e meia: o robô pode estar atrasado. Confira no site do CEMADEN."));

      var vivas = j.estacoes.filter(function (e) { return e.minutosAntes !== null && e.minutosAntes <= LIMITE_MIN; });
      var paradas = j.estacoes.length - vivas.length;
      var caj = j.estacoes.filter(function (e) { return e.ibge === 3509205; });
      var cajVivas = vivas.filter(function (e) { return e.ibge === 3509205; });
      if (!cajVivas.length) B.appendChild(el("p", "err", "Nenhuma estação de Cajamar com leitura recente no CEMADEN (" + caj.length + " cadastrada(s), todas paradas). A chuva em Cajamar só pode ser avaliada pela estação local ou pelo radar."));

      var tw = el("div", "tw"), tb = el("table"), th = el("tr");
      ["Estação", "Leitura", "1 h", "24 h", "72 h"].forEach(function (x) { th.appendChild(el("th", "", x)); });
      tb.appendChild(th);
      vivas.forEach(function (e) {
        var tr = el("tr");
        tr.appendChild(el("td", "", (e.ibge === 3509205 ? "★ " : "") + nome(e.cidade) + " · " + e.nome));
        tr.appendChild(el("td", "", e.leitura.slice(9) + " (−" + atraso(e.minutosAntes) + ")"));
        tr.appendChild(el("td", "", mm(e.acc.h1)));
        tr.appendChild(el("td", "", mm(e.acc.h24)));
        tr.appendChild(el("td", "", mm(e.acc.h72)));
        tb.appendChild(tr);
      });
      tw.appendChild(tb); B.appendChild(tw);
      B.appendChild(el("p", "mut", "“sem dado” significa que o CEMADEN não informou o valor (não é zero). “−” indica quanto a leitura está atrás da mais recente da rede. " + paradas + " estação(ões) da região sem leitura recente foram omitidas. Fonte: CEMADEN (oficial); coleta feita por robô, com atraso de alguns minutos."));
    } catch (e) {
      var msg = "Chuva observada do CEMADEN indisponível agora. ";
      B.textContent = ""; B.className = "";
      B.appendChild(el("span", "err", msg + "O arquivo é gerado pelo robô do GitHub; ele só existe depois de publicado. Veja o mapa do CEMADEN (mapainterativo.cemaden.gov.br)."));
    }
  }
  w.Cemaden = { carregar: carregar };
})(window);
