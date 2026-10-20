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
