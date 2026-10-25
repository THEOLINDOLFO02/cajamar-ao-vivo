// Comportamentos de interface compartilhados por todas as páginas (sem dependências).
(function () {
  "use strict";
  var raiz = document.documentElement;

  // ---------- tema: automático (segue o aparelho) → claro → escuro ----------
  var TEMAS = ["auto", "claro", "escuro"], ROTULOS = { auto: "automático", claro: "claro", escuro: "escuro" }, ICONES = { auto: "◐", claro: "☀", escuro: "☾" };
  function lerTema() { try { var t = localStorage.getItem("cajamar:tema"); return TEMAS.indexOf(t) > -1 ? t : "auto"; } catch (e) { return "auto"; } }
  function aplicarTema(t) {
    if (t === "auto") raiz.removeAttribute("data-tema"); else raiz.setAttribute("data-tema", t);
    var b = document.getElementById("btnTema");
    if (b) { b.textContent = ICONES[t]; b.title = "Tema: " + ROTULOS[t] + " (toque para mudar)"; b.setAttribute("aria-label", "Tema atual: " + ROTULOS[t] + ". Toque para alternar entre automático, claro e escuro."); }
  }
  aplicarTema(lerTema());
  document.addEventListener("DOMContentLoaded", function () {
    var b = document.getElementById("btnTema");
    aplicarTema(lerTema());
    if (b) b.onclick = function () {
      var prox = TEMAS[(TEMAS.indexOf(lerTema()) + 1) % TEMAS.length];
      try { localStorage.setItem("cajamar:tema", prox); } catch (e) {}
      aplicarTema(prox);
    };

    // ---------- menu: deixa o item da página atual visível no celular ----------
    var ativo = document.querySelector(".nav-bar a.ativo");
    if (ativo && ativo.scrollIntoView) { try { ativo.scrollIntoView({ inline: "center", block: "nearest" }); } catch (e) {} }

    // ---------- atalhos de seção: destaca a seção visível e mostra "voltar ao topo" ----------
    var links = document.querySelectorAll(".atalhos a[href^='#']");
    var btnTopo = document.getElementById("btnTopo");
    if (links.length && "IntersectionObserver" in window) {
      var porId = {};
      links.forEach(function (a) { var s = document.getElementById(a.getAttribute("href").slice(1)); if (s) porId[s.id] = a; });
      var atual = null;
      var io = new IntersectionObserver(function (itens) {
        itens.forEach(function (i) {
          if (!i.isIntersecting) return;
          var a = porId[i.target.id]; if (!a || a === atual) return;
          if (atual) { atual.classList.remove("na-secao"); atual.removeAttribute("aria-current"); }
          atual = a; a.classList.add("na-secao"); a.setAttribute("aria-current", "true");
          try { a.scrollIntoView({ inline: "center", block: "nearest" }); } catch (e) {}
        });
      }, { rootMargin: "-120px 0px -65% 0px" });
      Object.keys(porId).forEach(function (id) { io.observe(document.getElementById(id)); });
    }
    if (btnTopo) {
      btnTopo.onclick = function () { window.scrollTo({ top: 0, behavior: "smooth" }); };
      window.addEventListener("scroll", function () { btnTopo.hidden = window.scrollY < 900; }, { passive: true });
    }

    // ---------- esqueleto de carregamento: some assim que chega conteúdo ----------
    document.querySelectorAll(".carregando").forEach(function (el) {
      var ini = el.textContent;
      var obs = new MutationObserver(function () {
        if (el.textContent !== ini || el.children.length) { el.classList.remove("carregando"); obs.disconnect(); }
      });
      obs.observe(el, { childList: true, subtree: true, characterData: true });
      setTimeout(function () { el.classList.remove("carregando"); obs.disconnect(); }, 45000);
    });
  });

  // ---------- aviso de falta de internet ----------
  var aviso = null;
  function atualizarRede() {
    if (!navigator.onLine) {
      if (!aviso) { aviso = document.createElement("div"); aviso.className = "aviso-rede"; aviso.setAttribute("role", "status"); aviso.textContent = "Sem internet: os dados mostrados podem estar desatualizados."; document.body.appendChild(aviso); }
    } else if (aviso) { aviso.remove(); aviso = null; }
  }
  window.addEventListener("online", atualizarRede);
  window.addEventListener("offline", atualizarRede);
  document.addEventListener("DOMContentLoaded", atualizarRede);
})();
