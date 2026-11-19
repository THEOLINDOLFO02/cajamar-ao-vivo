// 2.6 Sincronização em Nuvem entre Celulares e Computadores da Equipe + 2.7 Alertas Automáticos via Telegram.
// Funciona em todas as páginas que carregam este módulo (index.html, quadro.html, observacoes.html, historico.html).
(function (w) {
  "use strict";

  var CHAVE_CFG = "cajamar:sync_cfg:v1";
  var CHAVE_OC = "cajamar:ocorrencias:v1";
  var CHAVE_OB = "cajamar:observacoes:v1";
  var CHAVE_COTAS = "cajamar:cotas_rio:v1";
  var CHAVE_RISCO_GEO = "cajamar:areas_risco_custom:v1";
  var CHAVE_AVISOS_TG = "cajamar:tg_avisos_enviados:v1";

  var $ = function (id) { return typeof document !== "undefined" ? document.getElementById(id) : null; };

  // ---------- Banco IndexedDB de Espelho Local para as Estações CSV (protege contra limpeza ou quota do localStorage) ----------
  var DB_EST_NOME = "cajamar_estacoes_idb", DB_EST_STORE = "banco";
  function abrirDbEstacoes() {
    return new Promise(function (resolve) {
      if (typeof indexedDB === "undefined") { resolve(null); return; }
      try {
        var req = indexedDB.open(DB_EST_NOME, 1);
        req.onupgradeneeded = function (e) {
          var db = e.target.result;
          if (!db.objectStoreNames.contains(DB_EST_STORE)) db.createObjectStore(DB_EST_STORE, { keyPath: "id" });
        };
        req.onsuccess = function (e) { resolve(e.target.result); };
        req.onerror = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
  }
  async function salvarBancoNoIdb(bancoObj) {
    if (!bancoObj || !bancoObj.slots) return;
    var db = await abrirDbEstacoes();
    if (!db) return;
    return new Promise(function (resolve) {
      try {
        var tx = db.transaction(DB_EST_STORE, "readwrite");
        tx.objectStore(DB_EST_STORE).put({ id: "principal", atualizadoEm: Date.now(), banco: bancoObj });
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { resolve(false); };
      } catch (e) { resolve(false); }
    });
  }
  async function restaurarBancoDoIdbSeVazio() {
    if (typeof Estacao === "undefined" || !Estacao.carregarBanco || !Estacao.salvarBanco) return false;
    var atual = Estacao.carregarBanco();
    var temAlgumDia = Object.keys(atual.slots || {}).some(function (id) {
      return Object.keys((atual.slots[id] && atual.slots[id].dias) || {}).length > 0;
    });
    if (temAlgumDia) {
      // Atualiza o espelho IDB com os dados atuais do localStorage
      salvarBancoNoIdb(atual);
      return false;
    }
    var db = await abrirDbEstacoes();
    if (!db) return false;
    return new Promise(function (resolve) {
      try {
        var tx = db.transaction(DB_EST_STORE, "readonly");
        var req = tx.objectStore(DB_EST_STORE).get("principal");
        req.onsuccess = function () {
          var reg = req.result;
          if (reg && reg.banco && reg.banco.slots) {
            var temIdb = Object.keys(reg.banco.slots).some(function (id) {
              return Object.keys((reg.banco.slots[id] && reg.banco.slots[id].dias) || {}).length > 0;
            });
            if (temIdb) {
              Estacao.salvarBanco(reg.banco);
              try { w.dispatchEvent(new StorageEvent("storage", { key: "cajamar:estacoes:v2" })); } catch (e) {}
              resolve(true);
              return;
            }
          }
          resolve(false);
        };
        req.onerror = function () { resolve(false); };
      } catch (e) { resolve(false); }
    });
  }

  function urlPadraoWorker() {
    if (w.CAJAMAR_CONFIG && w.CAJAMAR_CONFIG.cemadenProxy) {
      return String(w.CAJAMAR_CONFIG.cemadenProxy).replace(/\/+$/, "");
    }
    return "https://cajamar-cemaden.theolindolfo02.workers.dev";
  }

  function lerConfig() {
    try {
      var c = JSON.parse(localStorage.getItem(CHAVE_CFG) || "null");
      if (c && typeof c === "object") {
        return {
          urlWorker: (c.urlWorker || urlPadraoWorker()).replace(/\/+$/, ""),
          sala: String(c.sala || "").trim(),
          autoSync: c.autoSync !== false,
          tgChatId: String(c.tgChatId || "").trim(),
          tgBotToken: String(c.tgBotToken || "").trim()
        };
      }
    } catch (e) {}
    return { urlWorker: urlPadraoWorker(), sala: "", autoSync: true, tgChatId: "", tgBotToken: "" };
  }

  function salvarConfig(cfg) {
    try {
      localStorage.setItem(CHAVE_CFG, JSON.stringify({
        urlWorker: String(cfg.urlWorker || urlPadraoWorker()).replace(/\/+$/, ""),
        sala: String(cfg.sala || "").trim(),
        autoSync: cfg.autoSync !== false,
        tgChatId: String(cfg.tgChatId || "").trim(),
        tgBotToken: String(cfg.tgBotToken || "").trim()
      }));
      return true;
    } catch (e) { return false; }
  }

  function montarPacoteLocal() {
    var ocorrencias = [], observacoes = [], cotasRio = null, areasRiscoCustom = null, estacoesResumo = null;
    try { ocorrencias = JSON.parse(localStorage.getItem(CHAVE_OC) || "[]"); } catch (e) {}
    try { observacoes = JSON.parse(localStorage.getItem(CHAVE_OB) || "[]"); } catch (e) {}
    try { cotasRio = JSON.parse(localStorage.getItem(CHAVE_COTAS) || "null"); } catch (e) {}
    try { areasRiscoCustom = JSON.parse(localStorage.getItem(CHAVE_RISCO_GEO) || "null"); } catch (e) {}
    if (typeof Estacao !== "undefined" && Estacao.carregarBanco) {
      try {
        var b = Estacao.carregarBanco();
        if (b && b.slots) {
          estacoesResumo = {};
          Object.keys(b.slots).forEach(function (id) {
            var sl = b.slots[id];
            if (!sl || !sl.dias) return;
            var ds = Object.keys(sl.dias).sort().slice(-400); // mantém histórico salvo completo (até ~400 dias por estação)
            var recorte = {};
            ds.forEach(function (d) { recorte[d] = sl.dias[d]; });
            estacoesResumo[id] = { id: sl.id, rotulo: sl.rotulo, estacao: sl.estacao, sn: sl.sn, ultimoRegistro: sl.ultimoRegistro, codigo: sl.codigo, atualizadoEm: sl.atualizadoEm, dias: recorte };
          });
        }
      } catch (e) {}
    }
    return {
      enviadoEm: new Date().toISOString(),
      ocorrencias: Array.isArray(ocorrencias) ? ocorrencias : [],
      observacoes: Array.isArray(observacoes) ? observacoes : [],
      cotasRio: cotasRio,
      areasRiscoCustom: areasRiscoCustom,
      estacoesResumo: estacoesResumo
    };
  }

  function aplicarPacoteRecebido(dadosRemotos) {
    if (!dadosRemotos || typeof dadosRemotos !== "object") return { ocNovas: 0, obNovas: 0 };
    var ocLoc = [], obLoc = [];
    try { ocLoc = JSON.parse(localStorage.getItem(CHAVE_OC) || "[]"); } catch (e) {}
    try { obLoc = JSON.parse(localStorage.getItem(CHAVE_OB) || "[]"); } catch (e) {}

    var mapaOc = {};
    (Array.isArray(ocLoc) ? ocLoc : []).forEach(function (o) { if (o && o.id) mapaOc[o.id] = o; });
    var ocAntes = Object.keys(mapaOc).length;
    (Array.isArray(dadosRemotos.ocorrencias) ? dadosRemotos.ocorrencias : []).forEach(function (o) {
      if (!o || !o.id) return;
      var ex = mapaOc[o.id];
      if (!ex) { mapaOc[o.id] = o; return; }
      var tRem = Date.parse(o.atualizadoEm || o.criadoEm || o.quando || 0) || 0;
      var tLoc = Date.parse(ex.atualizadoEm || ex.criadoEm || ex.quando || 0) || 0;
      if (tRem >= tLoc) mapaOc[o.id] = o;
    });
    var ocFinais = Object.keys(mapaOc).map(function (k) { return mapaOc[k]; }).sort(function (a, b) {
      return (Date.parse(b.quando || 0) || 0) - (Date.parse(a.quando || 0) || 0);
    });
    try { localStorage.setItem(CHAVE_OC, JSON.stringify(ocFinais)); } catch (e) {}

    var mapaOb = {};
    (Array.isArray(obLoc) ? obLoc : []).forEach(function (o) { if (o && o.id) mapaOb[o.id] = o; });
    var obAntes = Object.keys(mapaOb).length;
    (Array.isArray(dadosRemotos.observacoes) ? dadosRemotos.observacoes : []).forEach(function (o) {
      if (!o || !o.id) return;
      mapaOb[o.id] = o;
    });
    var obFinais = Object.keys(mapaOb).map(function (k) { return mapaOb[k]; }).sort(function (a, b) {
      return String(b.quando || "").localeCompare(String(a.quando || ""));
    });
    try { localStorage.setItem(CHAVE_OB, JSON.stringify(obFinais)); } catch (e) {}

    if (dadosRemotos.cotasRio && typeof Estacao !== "undefined" && Estacao.salvarCotasRio) {
      try { Estacao.salvarCotasRio(dadosRemotos.cotasRio); } catch (e) {}
    }
    if (dadosRemotos.areasRiscoCustom && dadosRemotos.areasRiscoCustom.type === "FeatureCollection") {
      try { localStorage.setItem(CHAVE_RISCO_GEO, JSON.stringify(dadosRemotos.areasRiscoCustom)); } catch (e) {}
    }
    if (dadosRemotos.estacoesResumo && typeof Estacao !== "undefined" && Estacao.carregarBanco && Estacao.salvarBanco) {
      try {
        var banco = Estacao.carregarBanco();
        Object.keys(dadosRemotos.estacoesResumo).forEach(function (id) {
          var rem = dadosRemotos.estacoesResumo[id];
          if (!rem || !rem.dias || !banco.slots[id]) return;
          var sl = banco.slots[id];
          if (!sl.dias) sl.dias = {};
          Object.keys(rem.dias).forEach(function (d) {
            if (!sl.dias[d]) {
              sl.dias[d] = rem.dias[d];
            } else if (typeof Estacao.mesclarDia === "function") {
              sl.dias[d] = Estacao.mesclarDia(sl.dias[d], rem.dias[d]).dia;
            } else if ((rem.dias[d].n || 0) >= (sl.dias[d].n || 0)) {
              sl.dias[d] = rem.dias[d];
            }
          });
          if (rem.estacao && !sl.estacao) sl.estacao = rem.estacao;
          if (rem.sn && !sl.sn) sl.sn = rem.sn;
          if (rem.ultimoRegistro && (!sl.ultimoRegistro || String(rem.ultimoRegistro) > String(sl.ultimoRegistro))) sl.ultimoRegistro = rem.ultimoRegistro;
          if (rem.atualizadoEm) sl.atualizadoEm = rem.atualizadoEm;
        });
        Estacao.salvarBanco(banco);
        salvarBancoNoIdb(banco);
      } catch (e) {}
    }

    try { w.dispatchEvent(new StorageEvent("storage", { key: CHAVE_OC })); } catch (e) {}
    try { w.dispatchEvent(new StorageEvent("storage", { key: "cajamar:estacoes:v2" })); } catch (e) {}
    return {
      ocTotal: ocFinais.length,
      ocNovas: Math.max(0, ocFinais.length - ocAntes),
      obTotal: obFinais.length,
      obNovas: Math.max(0, obFinais.length - obAntes)
    };
  }

  async function sincronizarAgora(opcoes) {
    var opc = opcoes || {};
    var cfg = lerConfig();
    if (!cfg.sala || cfg.sala.length < 4) {
      throw new Error("Informe um Código da Equipe (mínimo 4 caracteres) para sincronizar.");
    }
    var endpoint = cfg.urlWorker + "/sync?sala=" + encodeURIComponent(cfg.sala);
    var pacote = montarPacoteLocal();
    var r;
    try {
      // text/plain e sem cabeçalho personalizado: evita o "preflight" CORS (a sala vai na URL)
      r = await fetch(endpoint, opc.somenteBaixar ? { method: "GET" } : { method: "POST", headers: { "Content-Type": "text/plain;charset=UTF-8" }, body: JSON.stringify(pacote) });
    } catch (eNet) {
      throw new Error("Não consegui falar com o servidor (" + cfg.urlWorker + "). Verifique a internet e se o Worker da Cloudflare foi ATUALIZADO com o cemaden-proxy.js mais recente (a rota /sync é nova).");
    }
    var j = await r.json().catch(function () { return {}; });
    if (r.status === 404 || r.status === 405) {
      throw new Error("O Worker da Cloudflare está desatualizado (sem a rota /sync). Cole o worker/cemaden-proxy.js novo no editor do Worker e clique em Deploy.");
    }
    if (!r.ok || !j.ok) {
      throw new Error(j.erro || ("Servidor de sincronização respondeu HTTP " + r.status));
    }
    var res = aplicarPacoteRecebido(j.dados);
    return {
      ok: true,
      backend: j.backend || "nuvem",
      atualizadoEm: j.dados && j.dados.atualizadoEm,
      ocTotal: res.ocTotal,
      obTotal: res.obTotal
    };
  }

  async function enviarAlertaTelegram(textoMensagem) {
    var cfg = lerConfig();
    var texto = String(textoMensagem || "").trim();
    if (!texto) throw new Error("Texto do alerta vazio.");

    // Se o usuário preencheu Bot Token + Chat ID direto no aparelho, chama a API oficial do Telegram (suporta CORS) ou via Worker
    if (cfg.tgBotToken && cfg.tgChatId) {
      var r = await fetch("https://api.telegram.org/bot" + cfg.tgBotToken + "/sendMessage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: cfg.tgChatId,
          text: texto,
          parse_mode: "Markdown",
          disable_web_page_preview: true
        })
      });
      var j = await r.json().catch(function () { return {}; });
      if (!r.ok || j.ok === false) throw new Error(j.description || ("Telegram HTTP " + r.status));
      return { ok: true, via: "api_direta" };
    }

    // Caso contrário, envia pelo Cloudflare Worker (/alerta-telegram) que usa os Secrets do servidor
    var rW = await fetch(cfg.urlWorker + "/alerta-telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        botToken: cfg.tgBotToken || undefined,
        chatId: cfg.tgChatId || undefined,
        texto: texto
      })
    });
    var jW = await rW.json().catch(function () { return {}; });
    if (!rW.ok || !jW.ok) {
      throw new Error(jW.erro || ("Worker respondeu HTTP " + rW.status));
    }
    return { ok: true, via: "worker" };
  }

  function iniciarInterface() {
    var cfg = lerConfig();
    if ($("inpSyncSala")) $("inpSyncSala").value = cfg.sala;
    if ($("inpSyncUrl")) $("inpSyncUrl").value = cfg.urlWorker;
    if ($("chkSyncAuto")) $("chkSyncAuto").checked = cfg.autoSync;
    if ($("inpTgChatId")) $("inpTgChatId").value = cfg.tgChatId;
    if ($("inpTgBotToken")) $("inpTgBotToken").value = cfg.tgBotToken;

    function salvarDaTela() {
      var nova = {
        sala: $("inpSyncSala") ? $("inpSyncSala").value.trim() : cfg.sala,
        urlWorker: $("inpSyncUrl") ? $("inpSyncUrl").value.trim() : cfg.urlWorker,
        autoSync: $("chkSyncAuto") ? $("chkSyncAuto").checked : cfg.autoSync,
        tgChatId: $("inpTgChatId") ? $("inpTgChatId").value.trim() : cfg.tgChatId,
        tgBotToken: $("inpTgBotToken") ? $("inpTgBotToken").value.trim() : cfg.tgBotToken
      };
      salvarConfig(nova);
      return nova;
    }

    if ($("btnSyncAgora")) {
      $("btnSyncAgora").onclick = async function () {
        var b = this;
        var msg = $("msgSyncNuvem");
        salvarDaTela();
        b.disabled = true;
        if (msg) msg.textContent = "☁️ Sincronizando com a nuvem da equipe…";
        try {
          var r = await sincronizarAgora();
          var hora = new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
          if (msg) msg.textContent = "✅ Sincronizado às " + hora + " (" + r.ocTotal + " ocorrência(s), " + r.obTotal + " observação(ões)).";
        } catch (e) {
          if (msg) msg.textContent = "❌ " + (e && e.message ? e.message : "Falha ao sincronizar");
        } finally {
          b.disabled = false;
        }
      };
    }

    if ($("btnTestarTelegram")) {
      $("btnTestarTelegram").onclick = async function () {
        var b = this;
        var msg = $("msgTelegramBot");
        salvarDaTela();
        b.disabled = true;
        if (msg) msg.textContent = "📲 Enviando mensagem para o grupo do Telegram…";
        try {
          var hora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
          var tit = $("heroTitulo") ? $("heroTitulo").textContent.trim() : "Monitoramento ativo";
          var sub = $("heroSub") ? $("heroSub").textContent.trim() : "";
          var texto = "🛡️ *DEFESA CIVIL DE CAJAMAR — BOLETIM AUTOMÁTICO*\n🕒 *Horário:* " + hora + " (BRT)\n📌 *Situação:* " + tit + (sub ? "\n" + sub : "") + "\n🔗 https://theolindolfo02.github.io/cajamar-ao-vivo/";
          await enviarAlertaTelegram(texto);
          if (msg) msg.textContent = "✅ Alerta enviado com sucesso para o Telegram às " + hora.slice(-5) + "!";
        } catch (e) {
          if (msg) msg.textContent = "❌ " + (e && e.message ? e.message : "Falha ao enviar para o Telegram");
        } finally {
          b.disabled = false;
        }
      };
    }

    if ($("btnSalvarConfigNuvem")) {
      $("btnSalvarConfigNuvem").onclick = function () {
        salvarDaTela();
        if ($("msgSyncNuvem")) $("msgSyncNuvem").textContent = "✅ Configuração da equipe salva neste aparelho.";
      };
    }

    // Pede ao navegador armazenamento persistente (evita que o navegador apague localStorage/IndexedDB ao fechar)
    if (typeof navigator !== "undefined" && navigator.storage && navigator.storage.persist) {
      try { navigator.storage.persist().catch(function () {}); } catch (e) {}
    }
    restaurarBancoDoIdbSeVazio();

    // Auto-disparo de novos avisos do INMET para o Telegram assim que o painel os identifica (evita duplicatas por id do aviso)
    document.addEventListener("cajamar:avisos", function (ev) {
      try {
        var det = ev && ev.detail;
        if (!det || !det.ok || !Array.isArray(det.lista) || !det.lista.length) return;
        var cAtual = lerConfig();
        if (!cAtual.tgChatId && !cAtual.tgBotToken) return;
        var jaEnviados = {};
        try { jaEnviados = JSON.parse(localStorage.getItem(CHAVE_AVISOS_TG) || "{}") || {}; } catch (e) {}
        var novos = det.lista.filter(function (a) { return a && a.id && !jaEnviados[a.id]; });
        if (!novos.length) return;
        novos.forEach(function (a) { jaEnviados[a.id] = Date.now(); });
        try { localStorage.setItem(CHAVE_AVISOS_TG, JSON.stringify(jaEnviados)); } catch (e) {}
        var horaBrt = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
        var linhas = ["🚨 *NOVO AVISO INMET PARA CAJAMAR*", "🕒 *Detectado em:* " + horaBrt + " (BRT)", "━━━━━━━━━━━━━━━━━━━━"];
        novos.forEach(function (a) {
          linhas.push("⚠️ *" + (a.evento || "Aviso") + " — " + (a.severidade || "Ativo") + "*");
          linhas.push("Vigência: " + (a.inicio || "—") + " até " + (a.fim || "—"));
          if (a.risco) linhas.push("Risco: " + a.risco);
          linhas.push("");
        });
        linhas.push("🔗 https://theolindolfo02.github.io/cajamar-ao-vivo/");
        enviarAlertaTelegram(linhas.join("\n")).catch(function () {});
      } catch (e) {}
    });

    // Se autoSync estiver ativo e houver sala configurada, sincroniza ao abrir e a cada 2 minutos
    if (cfg.autoSync && cfg.sala && cfg.sala.length >= 4) {
      setTimeout(function () { sincronizarAgora().catch(function () {}); }, 2500);
      setInterval(function () {
        var cAtual = lerConfig();
        if (cAtual.autoSync && cAtual.sala && !document.hidden) {
          sincronizarAgora().catch(function () {});
        }
      }, 120000);
    }
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciarInterface);
    else iniciarInterface();
  }

  w.SyncNuvem = {
    espelharBanco: salvarBancoNoIdb,
    restaurarDoEspelho: restaurarBancoDoIdbSeVazio,
    lerConfig: lerConfig,
    salvarConfig: salvarConfig,
    montarPacoteLocal: montarPacoteLocal,
    aplicarPacoteRecebido: aplicarPacoteRecebido,
    sincronizarAgora: sincronizarAgora,
    enviarAlertaTelegram: enviarAlertaTelegram
  };
})(typeof window !== "undefined" ? window : globalThis);
