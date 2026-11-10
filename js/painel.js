// Painel Cajamar ao Vivo: ponto de entrada. Cada cartão consulta sua fonte e falha sozinho (ver js/painel-*.js).
(function () {
  "use strict";
  var P = window.Painel, $ = P.$;

  P.desliz.iniciar();
  P.fogo.iniciar();

  // ---------- Backup Unificado do Sistema ----------
  if ($("btnExportarTudo") && typeof Estacao !== "undefined" && Estacao.gerarBackupCompleto) {
    $("btnExportarTudo").onclick = function () {
      var bkp = Estacao.gerarBackupCompleto();
      var blob = new Blob([JSON.stringify(bkp, null, 2)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "backup-completo-defesa-civil-cajamar-" + new Date().toISOString().slice(0, 10) + ".json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      if ($("msgBackupTudo")) $("msgBackupTudo").textContent = "✅ Backup completo exportado com sucesso.";
    };
  }
  if ($("btnImportarTudo") && $("arqBackupTudo") && typeof Estacao !== "undefined" && Estacao.restaurarBackupCompleto) {
    $("btnImportarTudo").onclick = function () { $("arqBackupTudo").click(); };
    $("arqBackupTudo").onchange = function () {
      var f = this.files && this.files[0];
      this.value = "";
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        try {
          var res = Estacao.restaurarBackupCompleto(String(rd.result));
          P.desliz.atualizar();
          if ($("msgBackupTudo")) {
            $("msgBackupTudo").textContent = "✅ Backup restaurado por completo: " + res.estacoesRestauradas + " equipamento(s) (+" + res.diasAdicionados + " dia(s) novo(s), " + res.diasAtualizados + " atualizado(s)), +" + res.ocorrenciasNovas + " ocorrência(s) e +" + res.observacoesNovas + " observação(ões); cotas: " + res.cotas + ".";
          }
        } catch (e) {
          if (typeof console !== "undefined") console.error("[painel] restauração:", e);
          if ($("msgBackupTudo")) $("msgBackupTudo").textContent = "❌ Backup NÃO restaurado: " + (e && e.message ? e.message : "arquivo inválido") + " Nenhum dado foi alterado ou a alteração foi revertida.";
        }
      };
      rd.readAsText(f);
    };
  }

  function go() {
    if (atualizando) return;
    atualizando = true;
    $("reload").disabled = true; $("reload").classList.add("girando"); $("reloadTxt").textContent = "Atualizando…";
    Promise.all([P.clima.carregarClima(), P.clima.carregarAlertas(), P.clima.carregarPrevisaoInmet(), Cemaden.carregar(), P.fogo.carregar(), P.mapa.carregarRadar(), Ar.carregar(), Modelos.carregar(), Clim.carregar(), Municipio.carregar()].map(function (p) { return p.then(P.desenharFontes); })).then(function () { atualizando = false; $("reload").disabled = false; $("reload").classList.remove("girando"); $("reloadTxt").textContent = "Atualizar agora"; P.desenharFontes(); });
    P.desenharFontes();
  }
  var atualizando = false;

  // ---------- Compartilhar a situação (abre o WhatsApp; quem clica revisa e envia) ----------
  if ($("btnCompartilhar")) {
    $("btnCompartilhar").onclick = function () {
      var t = $("heroTitulo") ? $("heroTitulo").textContent.trim() : "";
      var s = $("heroSub") ? $("heroSub").textContent.trim() : "";
      var m = $("heroMetricas") ? Array.prototype.map.call($("heroMetricas").children, function (c) { return c.innerText.replace(/\s*\n\s*/g, " ").trim(); }).filter(Boolean) : [];
      var hora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
      var linhas = ["*Cajamar ao Vivo* — " + hora, t];
      if (s) linhas.push(s);
      if (m.length) linhas.push(m.join(" · "));
      linhas.push("Dados auxiliares: confirme no INMET e no CEMADEN antes de decidir.", location.origin + location.pathname);
      window.open("https://wa.me/?text=" + encodeURIComponent(linhas.filter(Boolean).join("\n")), "_blank", "noopener");
    };
  }

  // ---------- Modo TV: tela cheia, letras maiores, sem menus ----------
  function sairModoTv() {
    document.body.classList.remove("modo-tv");
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {});
  }
  if ($("btnModoTv")) {
    $("btnModoTv").onclick = function () {
      document.body.classList.add("modo-tv");
      var el = document.documentElement;
      if (el.requestFullscreen) el.requestFullscreen().catch(function () {});
      window.scrollTo(0, 0);
    };
    var sair = document.createElement("button");
    sair.type = "button"; sair.id = "btnSairTv"; sair.className = "btn"; sair.textContent = "✕ Sair do modo TV";
    sair.onclick = sairModoTv;
    document.body.appendChild(sair);
    document.addEventListener("fullscreenchange", function () { if (!document.fullscreenElement) document.body.classList.remove("modo-tv"); });
    document.addEventListener("keydown", function (ev) { if (ev.key === "Escape") document.body.classList.remove("modo-tv"); });
  }
  $("reload").onclick = go;
  go();
  setInterval(go, 600000);
  document.addEventListener("visibilitychange", function () {
    var t = Object.keys(Fontes.estado).map(function (k) { return Fontes.estado[k].tentativa; });
    if (!document.hidden && (!t.length || Date.now() - Math.min.apply(null, t) > 300000)) go();
  });
  window.addEventListener("storage", function (ev) {
    if (!ev || !ev.key || ev.key.indexOf("cajamar:") === 0) {
      P.desliz.atualizar();
    }
  });
  setInterval(P.desenharFontes, 60000);
})();
