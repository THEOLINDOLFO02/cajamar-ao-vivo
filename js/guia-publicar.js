// "Orientação do Guia" dentro de Gerar publicação: o operador escolhe o elemento e o valor, e as orientações entram
// nas linhas e na legenda do panfleto (ele revisa e edita antes de compartilhar). Textos e faixas: js/guia-dados.js.
(function (w) {
  "use strict";
  var G = w.Guia;
  var $ = function (id) { return document.getElementById(id); };
  if (!G || !$("gpAdicionar")) return;

  var EXTRA = {
    pressao: { rotulo: "Altitude do equipamento (m):", dica: "Ex.: 760" },
    vento: { rotulo: "Temperatura (°C), opcional:", dica: "Para a sensação térmica" }
  };

  function num(txt) {
    var t = String(txt === undefined || txt === null ? "" : txt).trim().replace(",", ".");
    return t !== "" && /^[-+]?\d+(\.\d+)?$/.test(t) ? parseFloat(t) : null;
  }

  function atualizarCampos() {
    var id = $("gpElemento").value, ex = EXTRA[id];
    $("gpExtraRot").hidden = !ex; $("gpExtra").hidden = !ex;
    if (ex) { $("gpExtraRot").firstChild.nodeValue = ex.rotulo; $("gpExtra").placeholder = ex.dica; }
    $("gpJanelaRot").hidden = id !== "chuva";
    $("gpMsg").textContent = "";
  }

  function acrescentar(campo, texto) {
    var atual = campo.value.replace(/\s+$/, "");
    campo.value = (atual ? atual + "\n" : "") + texto;
  }

  function adicionar() {
    var id = $("gpElemento").value, msg = $("gpMsg"), v = num($("gpValor").value);
    if (v === null) { msg.textContent = "Digite o valor (só números)."; return; }
    var op = {};
    if (id === "pressao") op.altitude = num($("gpExtra").value);
    if (id === "vento") op.temperatura = num($("gpExtra").value);
    if (id === "chuva") op.janela = $("gpJanela").value;
    var r = G.avaliar(id, v, op);
    if (!r) { msg.textContent = "Valor inválido."; return; }
    if (r.erro) { msg.textContent = r.erro; return; }
    if (!r.banda) { msg.textContent = "Para a pressão, informe a altitude do equipamento: sem ela não há como comparar com as faixas."; return; }
    var el = r.elemento, b = r.banda, un = el.unidade && /^[°%]/.test(el.unidade) ? el.unidade : (el.unidade ? " " + el.unidade : "");
    var linhas = [el.icone + " " + el.titulo + ": " + String(v).replace(".", ",") + un + " — " + b.nome];
    b.procedimentos.slice(0, 3).forEach(function (p) { linhas.push("• " + p); });
    linhas.push("Orientação geral; não é aviso oficial.");
    acrescentar($("linhas"), linhas.join("\n"));
    acrescentar($("legenda"), (G.textoPublicacao(r) || ""));
    if ($("linhas").oninput) $("linhas").oninput();
    var avisoFonte = b.fonte === "informado" ? " Atenção: esta faixa é um limiar informado pela Defesa Civil, sem fonte técnica verificada e não homologado." : "";
    msg.textContent = "Orientação adicionada às linhas e à legenda. Revise o texto antes de compartilhar." + avisoFonte;
    // abre o bloco de edição para o operador ver o que entrou
    var det = $("detEditarPub"); if (det && !det.open) det.open = true;
  }

  $("gpElemento").onchange = atualizarCampos;
  $("gpAdicionar").onclick = adicionar;
  atualizarCampos();
})(window);
