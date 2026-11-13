// Edição de QUALQUER texto desenhado no panfleto. Cada texto que a arte desenha (cabeçalho, rótulos, indicadores, avisos,
// orientações, rodapé…) vira um campo editável. A troca vale para o modelo de panfleto escolhido e fica guardada neste aparelho.
// A edição é pelo texto original: se o dado mudar e o texto original deixar de aparecer, a edição fica numa lista "sem uso"
// (nunca é aplicada a outro texto por engano) e pode ser descartada.
(function (w) {
  "use strict";
  var CHAVE = "cajamar:pub:textos:v1";

  // Núcleo (sem tela): testável. `arm` precisa de getItem/setItem.
  function criar(arm) {
    var todos = {}, tipo = "", vistos = [], setVistos = {}, excluidos = {};
    try { todos = JSON.parse(arm.getItem(CHAVE) || "{}") || {}; } catch (e) { todos = {}; }
    function mapa() { return todos[tipo] || {}; }
    function gravar() { try { arm.setItem(CHAVE, JSON.stringify(todos)); return true; } catch (e) { return false; } }
    return {
      // Começa um novo desenho. `excluir` = textos que já têm campo próprio (título, subtítulo, faixa, linhas).
      iniciar: function (t, excluir) {
        tipo = String(t || ""); vistos = []; setVistos = {}; excluidos = {};
        (excluir || []).forEach(function (x) { if (x) excluidos[String(x)] = 1; });
      },
      aplicar: function (txt) {
        txt = String(txt);
        if (excluidos[txt] || !/[A-Za-zÀ-ÿ0-9]/.test(txt)) return txt;
        if (!setVistos[txt]) { setVistos[txt] = 1; vistos.push(txt); }
        var m = mapa();
        return Object.prototype.hasOwnProperty.call(m, txt) ? m[txt] : txt;
      },
      vistos: function () { return vistos.slice(); },
      valor: function (orig) { var m = mapa(); return Object.prototype.hasOwnProperty.call(m, orig) ? m[orig] : null; },
      // Texto vazio ou igual ao original remove a edição.
      definir: function (orig, novo) {
        if (!todos[tipo]) todos[tipo] = {};
        if (novo === null || novo === undefined || novo === "" || novo === orig) delete todos[tipo][orig]; else todos[tipo][orig] = String(novo);
        if (!Object.keys(todos[tipo]).length) delete todos[tipo];
        return gravar();
      },
      limpar: function () { delete todos[tipo]; return gravar(); },
      semUso: function () { var m = mapa(); return Object.keys(m).filter(function (k) { return !setVistos[k]; }); },
      descartarSemUso: function () {
        var m = mapa(); Object.keys(m).forEach(function (k) { if (!setVistos[k]) delete m[k]; });
        if (!Object.keys(m).length) delete todos[tipo];
        return gravar();
      },
      total: function () { return Object.keys(mapa()).length; }
    };
  }

  var armazenamento = { getItem: function (k) { try { return w.localStorage.getItem(k); } catch (e) { return null; } }, setItem: function (k, v) { w.localStorage.setItem(k, v); } };
  var nucleo = criar(armazenamento);
  var ui = null;

  // ---------- Tela ----------
  function montarUI() {
    var $ = function (id) { return document.getElementById(id); };
    if (!$("txLista")) return null;
    var el = function (t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x !== undefined) e.textContent = x; return e; };
    var assinatura = "", busca = "";
    function redesenhar() { var c = $("titulo"); if (c && typeof c.oninput === "function") c.oninput(); }

    function linha(orig) {
      var editado = nucleo.valor(orig) !== null;
      var d = el("div", "tx-item" + (editado ? " tx-editado" : "")); d.setAttribute("data-orig", orig);
      d.appendChild(el("small", "mut tx-orig", "Original: " + orig));
      var campo = el("div", "tx-campo");
      var i = el("input"); i.type = "text"; i.value = editado ? nucleo.valor(orig) : orig; i.setAttribute("aria-label", "Texto da arte: " + orig);
      var b = el("button", "btn small", "↺"); b.type = "button"; b.title = "Voltar ao texto original"; b.setAttribute("aria-label", "Voltar ao texto original"); b.hidden = !editado;
      i.oninput = function () {
        nucleo.definir(orig, i.value);
        var ed = nucleo.valor(orig) !== null; d.classList.toggle("tx-editado", ed); b.hidden = !ed;
        resumo(); redesenhar();
      };
      b.onclick = function () { nucleo.definir(orig, null); i.value = orig; d.classList.remove("tx-editado"); b.hidden = true; resumo(); redesenhar(); };
      campo.appendChild(i); campo.appendChild(b); d.appendChild(campo);
      return d;
    }

    function resumo() {
      var n = nucleo.total(), sem = nucleo.semUso(), r = $("txResumo");
      r.textContent = "";
      r.appendChild(document.createTextNode(n ? n + " texto(s) editado(s) neste modelo de panfleto." : "Nenhum texto editado neste modelo. Mude qualquer campo abaixo e a arte atualiza na hora."));
      $("txRestaurar").disabled = !n;
      var s = $("txSemUso"); s.textContent = "";
      if (sem.length) {
        s.appendChild(el("p", "mut", sem.length + " edição(ões) guardada(s) de textos que mudaram e não aparecem mais nesta arte (não estão sendo aplicadas):"));
        var ul = el("ul", "tx-sem");
        sem.forEach(function (k) { ul.appendChild(el("li", "", "“" + k + "” → “" + nucleo.valor(k) + "”")); });
        s.appendChild(ul);
        var b = el("button", "btn small", "Descartar essas edições"); b.type = "button";
        b.onclick = function () { nucleo.descartarSemUso(); resumo(); };
        s.appendChild(b);
      }
    }

    function filtrar() {
      var q = busca.trim().toLowerCase();
      Array.prototype.forEach.call($("txLista").children, function (d) { d.hidden = !!q && (d.getAttribute("data-orig") || "").toLowerCase().indexOf(q) < 0 && (d.querySelector("input").value || "").toLowerCase().indexOf(q) < 0; });
    }

    // chamado a cada desenho da arte: só reconstrói a lista se os textos mudaram (assim o campo em edição não perde o foco)
    function atualizar() {
      var v = nucleo.vistos(), ass = v.join("\u0001");
      if (ass !== assinatura) {
        assinatura = ass;
        var lista = $("txLista"); lista.textContent = "";
        v.forEach(function (o) { lista.appendChild(linha(o)); });
        filtrar();
      }
      resumo();
    }

    $("txBusca").oninput = function () { busca = this.value; filtrar(); };
    $("txRestaurar").onclick = function () { if (!nucleo.total()) return; nucleo.limpar(); assinatura = ""; atualizar(); redesenhar(); };
    return { atualizar: atualizar, forcar: function () { assinatura = ""; } };
  }

  w.PubTextos = {
    criar: criar,
    iniciar: function (tipo, excluir) { nucleo.iniciar(tipo, excluir); },
    aplicar: function (t) { return nucleo.aplicar(t); },
    terminou: function () { if (!ui) ui = montarUI(); if (ui) ui.atualizar(); }
  };
})(typeof window !== "undefined" ? window : globalThis);
