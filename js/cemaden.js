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
      if (idadeColeta > 180) B.appendChild(el("p", "stale", "Coleta com mais de 3 h: a coleta automática do GitHub às vezes atrasa por horas. Para dado em tempo real, confira o site do CEMADEN."));

      var vivas = j.estacoes.filter(function (e) { return e.minutosAntes !== null && e.minutosAntes <= LIMITE_MIN; });
      var paradas = j.estacoes.length - vivas.length;
      var caj = j.estacoes.filter(function (e) { return e.ibge === 3509205; });
      var cajVivas = vivas.filter(function (e) { return e.ibge === 3509205; });
      if (!cajVivas.length) B.appendChild(el("p", "err", "Nenhuma estação de Cajamar com leitura recente no CEMADEN (" + caj.length + " cadastrada(s), todas paradas). A chuva em Cajamar só pode ser avaliada pela estação local ou pelo radar."));

      // Maior acumulado de 72 h entre as estações recentes. Só informa o valor: não há limites municipais
      // definidos para classificar risco, então nada é rotulado como "normal", "atenção" ou "alerta".
      var max72 = null, estMax72 = null;
      vivas.forEach(function (e) {
        if (e.acc.h72 !== null && (max72 === null || e.acc.h72 > max72)) { max72 = e.acc.h72; estMax72 = e; }
      });
      if (max72 !== null) {
        B.appendChild(el("p", "", "Maior acumulado em 72 h entre as estações com leitura recente: " + mm(max72) + " (" + nome(estMax72.cidade) + " · " + estMax72.nome + "). Valor informado pelo CEMADEN, sem classificação de risco."));
      }

      function celulaChuva(v) {
        return el("td", "", mm(v));
      }

      var tw = el("div", "tw"), tb = el("table"), th = el("tr");
      ["Estação", "Leitura", "1 h", "24 h", "72 h"].forEach(function (x) { th.appendChild(el("th", "", x)); });
      tb.appendChild(th);
      vivas.forEach(function (e) {
        var tr = el("tr");
        tr.appendChild(el("td", "", (e.ibge === 3509205 ? "★ " : "") + nome(e.cidade) + " · " + e.nome));
        tr.appendChild(el("td", "", e.leitura.slice(9) + " (−" + atraso(e.minutosAntes) + ")"));
        tr.appendChild(celulaChuva(e.acc.h1));
        tr.appendChild(celulaChuva(e.acc.h24));
        tr.appendChild(celulaChuva(e.acc.h72));
        tb.appendChild(tr);
      });
      tw.appendChild(tb); B.appendChild(tw);
      B.appendChild(el("p", "mut", "“sem dado” significa que o CEMADEN não informou o valor (não é zero). Este quadro apenas repassa os números: não classifica risco. " + paradas + " estação(ões) sem leitura recente foram omitidas."));
    } catch (e) {
      var msg = "Chuva observada do CEMADEN indisponível agora. ";
      B.textContent = ""; B.className = "";
      B.appendChild(el("span", "err", msg + "O arquivo é gerado pelo robô do GitHub; ele só existe depois de publicado. Veja o mapa do CEMADEN (mapainterativo.cemaden.gov.br)."));
    }
  }
  w.Cemaden = { carregar: carregar };
})(window);
