// Abas internas do Painel ao vivo: só a aba escolhida fica visível (Resumo, Chuva e encostas, Previsão, Mapa e satélite,
// Fogo, Ar e UV, Dados e fontes). Cada bloco da página tem data-aba; sem JavaScript tudo continua visível.
// Os links antigos (#chuva, #fogoCard, #mapaCard…) continuam funcionando: abrem a aba do bloco e rolam até ele.
(function (w) {
  "use strict";
  var d = document;
  var barra = d.querySelector(".atalhos[data-abas]");
  if (!barra) return;
  var links = Array.prototype.slice.call(barra.querySelectorAll("a[data-aba]"));
  var blocos = Array.prototype.slice.call(d.querySelectorAll("main [data-aba]")).filter(function (e) { return e.tagName !== "A"; });
  var NOMES = links.map(function (a) { return a.getAttribute("data-aba"); });
  var atual = null;

  function guardar(v) { try { sessionStorage.setItem("cajamar:aba", v); } catch (e) {} }
  function lembrada() { try { return sessionStorage.getItem("cajamar:aba"); } catch (e) { return null; } }

  function mostrar(nome, opc) {
    if (NOMES.indexOf(nome) < 0) nome = "resumo";
    atual = nome;
    d.body.classList.add("tem-abas");
    blocos.forEach(function (b) { b.classList.toggle("aba-ativa", b.getAttribute("data-aba") === nome); });
    links.forEach(function (a) {
      var on = a.getAttribute("data-aba") === nome;
      a.classList.toggle("ativa", on);
      if (on) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
      if (on && opc && opc.rolarAba && a.scrollIntoView) { try { a.scrollIntoView({ inline: "center", block: "nearest" }); } catch (e) {} }
    });
    guardar(nome);
    // o mapa (Leaflet) precisa recalcular o tamanho quando sai de uma aba escondida
    if (nome === "mapa") setTimeout(function () { try { w.dispatchEvent(new Event("resize")); } catch (e) {} }, 60);
  }

  function abaDoAlvo(id) {
    var alvo = id && d.getElementById(id);
    for (var n = alvo; n && n !== d.body; n = n.parentElement) if (n.getAttribute && n.getAttribute("data-aba") && n.tagName !== "A") return { aba: n.getAttribute("data-aba"), alvo: alvo };
    return null;
  }

  function irParaHash(rolar) {
    var id = decodeURIComponent(location.hash.replace(/^#/, ""));
    var r = abaDoAlvo(id);
    if (!r) return false;
    mostrar(r.aba, { rolarAba: true });
    if (rolar && r.alvo) setTimeout(function () { try { r.alvo.scrollIntoView({ block: "start" }); } catch (e) {} }, 30);
    return true;
  }

  links.forEach(function (a) {
    a.addEventListener("click", function (e) {
      e.preventDefault();
      mostrar(a.getAttribute("data-aba"), { rolarAba: true });
      try { history.replaceState(null, "", "#" + a.getAttribute("href").slice(1)); } catch (x) {}
      w.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  // botões "Ver no mapa": trocam para a aba do mapa e escolhem o modo (radar, satélite + fogo…)
  d.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-ir-aba]");
    if (!b) return;
    mostrar(b.getAttribute("data-ir-aba"), { rolarAba: true });
    var modo = b.getAttribute("data-modo");
    if (modo) {
      var alvo = d.querySelector('.modo-mapa[data-modo="' + modo + '"]');
      if (alvo) setTimeout(function () { alvo.click(); }, 120);
    }
    w.scrollTo({ top: 0, behavior: "smooth" });
  });

  // links internos (#avisos, #chuva…) em qualquer lugar da página abrem a aba certa
  d.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[href^='#']");
    if (!a || a.hasAttribute("data-aba") || a.getAttribute("href").length < 2) return;
    var r = abaDoAlvo(a.getAttribute("href").slice(1));
    if (r && r.aba !== atual) { mostrar(r.aba, { rolarAba: true }); setTimeout(function () { try { r.alvo.scrollIntoView({ block: "start" }); } catch (x) {} }, 30); e.preventDefault(); }
  });
  w.addEventListener("hashchange", function () { irParaHash(true); });

  w.AbasPainel = { mostrar: mostrar, atual: function () { return atual; } };
  if (!irParaHash(true)) mostrar(lembrada() || "resumo");
})(window);
