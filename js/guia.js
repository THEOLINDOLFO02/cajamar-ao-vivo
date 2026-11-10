// Tela do Guia de valores e procedimentos (os textos e faixas ficam em js/guia-dados.js).
(function (w) {
  "use strict";
  var G = w.Guia;
  var $ = function (id) { return document.getElementById(id); };
  var el = function (t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x !== undefined) e.textContent = x; return e; };
  var num = function (txt) {
    var t = String(txt === undefined || txt === null ? "" : txt).trim().replace(",", ".");
    if (t === "" || !/^[-+]?\d+(\.\d+)?$/.test(t)) return null;
    return parseFloat(t);
  };
  var ORDEM = ["temperatura", "umidade", "pressao", "uv", "radiacao", "vento", "direcao", "chuva"];
  var campos = {};

  function lerCache(nome) {
    try {
      var o = JSON.parse(localStorage.getItem("cajamar:" + nome) || "null");
      return o && o.d ? o : null;
    } catch (e) { return null; }
  }

  function opcoesDe(id) {
    var o = {};
    if (id === "pressao") o.altitude = num(campos.pressao.alt.value);
    if (id === "vento") o.temperatura = num(campos.vento.temp.value);
    if (id === "chuva") o.janela = campos.chuva.janela.value;
    return o;
  }

  function desenhar(id) {
    var c = campos[id], saida = c.saida; saida.textContent = ""; saida.removeAttribute("data-tom");
    var txt = c.valor.value.trim();
    if (txt === "") { saida.appendChild(el("p", "mut", "Digite um valor para ver a faixa e o que fazer.")); return; }
    var v = num(txt);
    if (v === null) { saida.appendChild(el("p", "err", "Digite só números (use ponto ou vírgula para decimais).")); return; }
    var r = G.avaliar(id, v, opcoesDe(id));
    if (!r) { saida.appendChild(el("p", "err", "Valor inválido.")); return; }
    if (r.erro) { saida.appendChild(el("p", "err", r.erro)); return; }
    if (r.extras && r.extras.semAltitude) {
      saida.appendChild(el("p", "mut", "Informe a altitude do equipamento para comparar com as faixas ao nível do mar. A pressão medida no local (em Cajamar, cerca de 925 a 945 hPa) não é comparável com 1013 hPa."));
      return;
    }
    saida.setAttribute("data-tom", String(r.banda.tom));
    saida.appendChild(el("h3", "", r.banda.nome));
    saida.appendChild(el("p", "guia-faixa", "Faixa: " + r.banda.faixa));
    if (id === "pressao" && r.extras.nivelDoMar !== undefined) saida.appendChild(el("p", "", "Equivale a " + String(r.extras.nivelDoMar).replace(".", ",") + " hPa ao nível do mar (conversão aproximada)."));
    if (id === "direcao" && r.extras.ponto) saida.appendChild(el("p", "", "O vento vem do " + r.extras.ponto.nome + " (" + r.extras.ponto.sigla + ") e sopra para o lado oposto."));
    if (id === "chuva" && r.extras.intensidade) saida.appendChild(el("p", "", "Escala de intensidade (informada, varia por fonte): " + r.extras.intensidade + "."));
    if (id === "vento" && r.extras.sensacao !== undefined) saida.appendChild(el("p", "", "Sensação térmica pelo vento: cerca de " + String(r.extras.sensacao).replace(".", ",") + " °C."));
    saida.appendChild(el("p", "", r.banda.efeitos));
    saida.appendChild(el("h4", "", "O que fazer"));
    var ul = el("ul");
    r.banda.procedimentos.forEach(function (p) { ul.appendChild(el("li", "", p)); });
    saida.appendChild(ul);
    saida.appendChild(el("p", "mut guia-fonte", "Fonte da faixa: " + G.FONTES[r.banda.fonte] + "."));

    var bt = el("button", "btn small", "📋 Copiar texto para publicação");
    bt.type = "button";
    bt.onclick = function () {
      var t = G.textoPublicacao(r);
      var fim = function (okc) { bt.textContent = okc ? "✓ Copiado" : "Não foi possível copiar: selecione o texto abaixo"; if (!okc) { var ta = el("textarea"); ta.value = t; ta.rows = 8; ta.style.width = "100%"; saida.appendChild(ta); ta.select(); } };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { fim(true); }, function () { fim(false); });
      else fim(false);
    };
    saida.appendChild(bt);
  }

  function montar(id) {
    var d = G.ELEMENTOS[id];
    var card = el("section", "card guia-card"); card.id = "guia-" + id;
    card.appendChild(el("h2", "", d.icone + " " + d.titulo));
    card.appendChild(el("p", "card-sub", d.explica));
    var linha = el("div", "filtro-periodo"); linha.style.margin = "0 0 8px";
    var c = campos[id] = {};
    var campo = function (rotulo, atributos) {
      var l = el("label"); l.appendChild(document.createTextNode(rotulo));
      var i = el("input"); i.type = "text"; i.inputMode = "decimal"; i.autocomplete = "off";
      Object.keys(atributos || {}).forEach(function (k) { i.setAttribute(k, atributos[k]); });
      l.appendChild(i); linha.appendChild(l); return i;
    };
    c.valor = campo("Valor" + (d.unidade ? " (" + d.unidade + ")" : "") + ":", { placeholder: "Ex.: " + (id === "temperatura" ? "33" : id === "umidade" ? "25" : id === "pressao" ? "930" : id === "uv" ? "8" : id === "radiacao" ? "900" : id === "vento" ? "45" : id === "direcao" ? "200" : "35") });
    if (id === "pressao") c.alt = campo("Altitude do equipamento (m):", { placeholder: "Ex.: 760 (Cajamar: ~735 a 760 m)" });
    if (id === "vento") c.temp = campo("Temperatura (°C), opcional:", { placeholder: "Para a sensação térmica" });
    if (id === "chuva") {
      var l = el("label"); l.appendChild(document.createTextNode("Janela de tempo:"));
      var s = el("select"); [["1h", "Acumulado em 1 hora (mm/h)"], ["24h", "Acumulado em 24 horas (mm)"], ["72h", "Acumulado em 72 horas (mm)"], ["168h", "Acumulado em 7 dias / 168 horas (mm)"]].forEach(function (p) { var o = el("option", "", p[1]); o.value = p[0]; s.appendChild(o); });
      l.appendChild(s); linha.appendChild(l); c.janela = s;
    }
    card.appendChild(linha);
    c.saida = el("div", "guia-saida"); card.appendChild(c.saida);
    if (d.nota) card.appendChild(el("p", "mut guia-nota", "Nota: " + d.nota));
    Object.keys(c).forEach(function (k) { if (c[k] && c[k].addEventListener && k !== "saida") { c[k].addEventListener("input", function () { desenhar(id); }); c[k].addEventListener("change", function () { desenhar(id); }); } });
    $("guiaLista").appendChild(card);
    desenhar(id);
  }

  function preencher() {
    var msg = $("guiaMsgPainel"), cl = lerCache("clima");
    var cur = cl && cl.d && cl.d.current;
    if (!cur) { msg.textContent = "O painel ainda não guardou uma leitura neste aparelho. Abra o Painel ao vivo uma vez e volte aqui."; return; }
    var quando = new Date(cl.t).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    var usou = [];
    var poe = function (id, campo, v, rot) {
      if (typeof v === "number" && isFinite(v)) { campos[id][campo].value = String(v).replace(".", ","); desenhar(id); usou.push(rot); }
    };
    poe("temperatura", "valor", cur.temperature_2m, "temperatura");
    poe("umidade", "valor", cur.relative_humidity_2m, "umidade");
    poe("vento", "valor", cur.wind_speed_10m, "vento");
    if (typeof cur.temperature_2m === "number") { campos.vento.temp.value = String(cur.temperature_2m).replace(".", ","); desenhar("vento"); }
    msg.textContent = usou.length ? "Preenchido com " + usou.join(", ") + " do modelo Open-Meteo guardado em " + quando + " (modelo, não é medição local). Pressão, UV, radiação, direção e chuva: digite o valor." : "A leitura guardada não tem esses valores.";
  }

  function iniciar() {
    if (!$("guiaLista") || !G) return;
    ORDEM.forEach(montar);
    $("btnPreencher").onclick = preencher;
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})(window);
