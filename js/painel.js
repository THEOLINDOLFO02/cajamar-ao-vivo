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
    Promise.all([P.clima.carregarClima(), P.clima.carregarAlertas(), P.clima.carregarPrevisaoInmet(), Cemaden.carregar(), P.fogo.carregar(), P.mapa.carregarRadar(), Ar.carregar(), Modelos.carregar(), Windy.carregar(), Clim.carregar(), Municipio.carregar()].map(function (p) { return p.then(P.desenharFontes); })).then(function () { atualizando = false; $("reload").disabled = false; $("reload").classList.remove("girando"); $("reloadTxt").textContent = "Atualizar agora"; P.desenharFontes(); });
    P.desenharFontes();
  }
  var atualizando = false;
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
