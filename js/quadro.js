// Quadro de ocorrências pessoal. Os dados ficam no localStorage deste navegador.
(function () {
  "use strict";
  var CAT = {
    "Incêndios": ["Terreno baldio", "Vegetação", "Residência", "Apoio a fogo"],
    "Enxames e Himenópteros": ["Monitoramento de enxame de abelhas", "Atendimento de ouvidoria – enxame", "Vespas e marimbondos", "Outras situações com abelhas/insetos de risco"],
    "Ocorrências com Árvores": ["Poda", "Supressão", "Corte com motosserra", "Avaliação/atendimento de risco"],
    "Eventos Hidrológicos e Geológicos": ["Inundação", "Escorregamento", "Monitoramento de áreas de risco"],
    "Vistorias e Avaliação de Edificações": ["Vistoria estrutural", "Avaliação de condições de risco em imóveis"],
    "Animais Peçonhentos e Fauna": ["Cobras", "Manuseio e transporte de cobras", "Resgate e manejo de animais"]
  };
  var ST = { aberta: "Aberta", atendimento: "Em atendimento", concluida: "Concluída" };
  var CHAVE = "cajamar:ocorrencias:v1";
  var $ = function (i) { return document.getElementById(i); };
  var rows = [], memoria = false, editandoId = null;
  var fotosPendentes = []; // até 2 fotos em DataURL comprimido (salvas em IndexedDB por id da ocorrência)

  // ---------- 1.4 Banco IndexedDB para fotos de ocorrências (sem estourar a quota de 5 MB do localStorage) ----------
  var DB_NOME = "cajamar_ocorrencias_midia", DB_STORE = "fotos";
  function abrirDbFotos() {
    return new Promise(function (resolve) {
      if (typeof indexedDB === "undefined") { resolve(null); return; }
      try {
        var req = indexedDB.open(DB_NOME, 1);
        req.onupgradeneeded = function (e) {
          var db = e.target.result;
          if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE, { keyPath: "id" });
        };
        req.onsuccess = function (e) { resolve(e.target.result); };
        req.onerror = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
  }
  async function salvarFotosNoDb(idOcorrencia, listaDataUrl) {
    var db = await abrirDbFotos();
    if (!db) return;
    return new Promise(function (resolve) {
      try {
        var tx = db.transaction(DB_STORE, "readwrite");
        var st = tx.objectStore(DB_STORE);
        if (listaDataUrl && listaDataUrl.length) st.put({ id: idOcorrencia, fotos: listaDataUrl.slice(0, 2) });
        else st.delete(idOcorrencia);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { resolve(false); };
      } catch (e) { resolve(false); }
    });
  }
  async function lerFotosDoDb(idOcorrencia) {
    var db = await abrirDbFotos();
    if (!db) return [];
    return new Promise(function (resolve) {
      try {
        var tx = db.transaction(DB_STORE, "readonly");
        var req = tx.objectStore(DB_STORE).get(idOcorrencia);
        req.onsuccess = function () { resolve(req.result && Array.isArray(req.result.fotos) ? req.result.fotos : []); };
        req.onerror = function () { resolve([]); };
      } catch (e) { resolve([]); }
    });
  }
  async function apagarFotosDoDb(idOcorrencia) {
    return salvarFotosNoDb(idOcorrencia, []);
  }
  function comprimirImagemArquivo(file) {
    return new Promise(function (resolve, reject) {
      var rd = new FileReader();
      rd.onload = function () {
        var img = new Image();
        img.onload = function () {
          var maxLado = 960;
          var w = img.width, h = img.height;
          if (w > maxLado || h > maxLado) {
            if (w >= h) { h = Math.round(h * maxLado / w); w = maxLado; }
            else { w = Math.round(w * maxLado / h); h = maxLado; }
          }
          var cv = document.createElement("canvas");
          cv.width = w; cv.height = h;
          var ctx = cv.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);
          resolve(cv.toDataURL("image/jpeg", 0.72));
        };
        img.onerror = reject;
        img.src = String(rd.result);
      };
      rd.onerror = reject;
      rd.readAsDataURL(file);
    });
  }
  function desenharPreviaFotosForm() {
    var box = $("previaFotosForm");
    if (!box) return;
    box.textContent = "";
    fotosPendentes.forEach(function (src, idx) {
      var wrap = document.createElement("div");
      wrap.style.position = "relative";
      var im = document.createElement("img");
      im.src = src;
      im.alt = "Foto " + (idx + 1);
      im.style.cssText = "width:68px;height:68px;object-fit:cover;border-radius:8px;border:1px solid var(--line)";
      var rm = document.createElement("button");
      rm.type = "button";
      rm.className = "btn small perigo";
      rm.textContent = "✕";
      rm.style.cssText = "min-height:22px;padding:0 6px;font-size:.75rem;position:absolute;top:-6px;right:-6px;border-radius:999px";
      rm.onclick = function () { fotosPendentes.splice(idx, 1); desenharPreviaFotosForm(); };
      wrap.append(im, rm);
      box.appendChild(wrap);
    });
  }

  function carregar() {
    try {
      var x = JSON.parse(localStorage.getItem(CHAVE) || "[]");
      return Array.isArray(x) ? x.filter(valida) : [];
    } catch (e) { memoria = true; return []; }
  }
  function valida(r) {
    return r && typeof r.id === "string" && CAT[r.tipo] && typeof r.subtipo === "string" &&
      typeof r.local === "string" && ST[r.status] && !isNaN(new Date(r.quando));
  }
  function salvar() {
    try { localStorage.setItem(CHAVE, JSON.stringify(rows)); return true; }
    catch (e) { memoria = true; aviso("Não foi possível gravar neste navegador (modo privado ou armazenamento cheio). Os registros desta sessão podem se perder: use Exportar.", "ruim"); return false; }
  }
  function novoId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function opt(sel, vals) { vals.forEach(function (v) { var o = document.createElement("option"); o.value = v; o.textContent = v; sel.appendChild(o); }); }
  opt($("tipo"), Object.keys(CAT)); opt($("ftipo"), Object.keys(CAT));
  function subs() { var s = $("subtipo"); s.textContent = ""; opt(s, CAT[$("tipo").value] || []); }
  $("tipo").onchange = subs; subs();
  function nowLocal() { var d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); }
  function toLocalInput(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return nowLocal();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }
  function fmt(iso) { var d = new Date(iso); return isNaN(d) ? "" : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }); }
  function aviso(t, tipo) {
    var a = $("aviso");
    a.hidden = !t;
    a.textContent = t || "";
    a.className = "warn" + (tipo ? " " + tipo : "");
  }

  $("novo").onclick = function () {
    editandoId = null;
    fotosPendentes = [];
    desenharPreviaFotosForm();
    if ($("coordGps")) $("coordGps").value = "";
    $("formTitulo").textContent = "Nova ocorrência";
    $("salvar").textContent = "Registrar";
    $("boxStatus").hidden = true;
    $("form").reset();
    subs();
    $("quando").value = nowLocal();
    $("form").hidden = false;
    $("form").scrollIntoView({ behavior: "smooth", block: "start" });
    $("local").focus({ preventScroll: true });
  };
  $("cancelar").onclick = function () {
    editandoId = null;
    fotosPendentes = [];
    desenharPreviaFotosForm();
    $("form").hidden = true;
    $("boxStatus").hidden = true;
    $("err").hidden = true;
  };

  if ($("btnGpsOcorrencia")) {
    $("btnGpsOcorrencia").onclick = function () {
      if (!navigator.geolocation) { aviso("Geolocalização não suportada neste navegador.", "ruim"); return; }
      var b = this;
      b.disabled = true; b.textContent = "📍…";
      navigator.geolocation.getCurrentPosition(function (pos) {
        b.disabled = false; b.textContent = "📍 GPS";
        var lat = pos.coords.latitude.toFixed(5), lon = pos.coords.longitude.toFixed(5);
        var coordStr = lat + ", " + lon;
        if ($("coordGps")) $("coordGps").value = coordStr;
        var inp = $("local");
        if (inp) {
          var atual = inp.value.trim().replace(/\s*\(GPS:\s*[-0-9.,\s]+\)/i, "");
          inp.value = (atual ? atual + " (GPS: " + coordStr + ")" : "GPS: " + coordStr).slice(0, 120);
        }
        aviso("📍 Coordenadas GPS capturadas com sucesso (" + coordStr + ").", "ok");
      }, function () {
        b.disabled = false; b.textContent = "📍 GPS";
        aviso("Não foi possível obter o GPS. Verifique a permissão de localização do navegador.", "ruim");
      }, { enableHighAccuracy: true, timeout: 10000 });
    };
  }

  if ($("fotosInput")) {
    $("fotosInput").onchange = async function () {
      var arqs = Array.prototype.slice.call(this.files || []).slice(0, 2);
      this.value = "";
      for (var i = 0; i < arqs.length; i++) {
        if (fotosPendentes.length >= 2) break;
        try {
          var dataUrl = await comprimirImagemArquivo(arqs[i]);
          fotosPendentes.push(dataUrl);
        } catch (e) {}
      }
      desenharPreviaFotosForm();
    };
  }

  function editar(id) {
    var r = rows.find(function (x) { return x.id === id; });
    if (!r) return;
    editandoId = id;
    fotosPendentes = [];
    desenharPreviaFotosForm();
    lerFotosDoDb(id).then(function (fs) { fotosPendentes = fs.slice(0, 2); desenharPreviaFotosForm(); });
    if ($("coordGps")) $("coordGps").value = r.gps || "";
    $("formTitulo").textContent = "Editar ocorrência";
    $("salvar").textContent = "Salvar alterações";
    $("tipo").value = r.tipo;
    subs();
    $("subtipo").value = r.subtipo;
    $("local").value = r.local;
    $("quando").value = toLocalInput(r.quando);
    $("desc").value = r.descricao || "";
    $("statusForm").value = r.status || "aberta";
    $("boxStatus").hidden = false;
    $("err").hidden = true;
    $("form").hidden = false;
    $("form").scrollIntoView({ behavior: "smooth", block: "start" });
    $("local").focus();
  }

  var BAIRROS_PADRAO = [
    "Jordanésia",
    "Polvilho",
    "Cajamar Centro",
    "Ponunduva",
    "KM 43 (Anhanguera)",
    "Guaturinho",
    "Vila Nova",
    "Portal dos Ipês",
    "Parque São Roberto",
    "Paraíso"
  ];

  function atualizarBairrosSugeridos() {
    var dl = $("bairrosCajamar");
    if (!dl) return;
    dl.textContent = "";
    var vistos = {};
    rows.forEach(function (r) {
      var l = String(r.local || "").trim();
      if (l && !vistos[l.toLowerCase()]) {
        vistos[l.toLowerCase()] = true;
        var o = document.createElement("option"); o.value = l; dl.appendChild(o);
      }
    });
    BAIRROS_PADRAO.forEach(function (l) {
      if (!vistos[l.toLowerCase()]) {
        vistos[l.toLowerCase()] = true;
        var o = document.createElement("option"); o.value = l; dl.appendChild(o);
      }
    });
  }

  function pareceDadoPessoal(texto) {
    var t = String(texto);
    if (/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/.test(t)) return true;
    if (/(\(?\b\d{2}\)?[\s.-]?)?9?\d{4}[\s.-]?\d{4}\b/.test(t) && /\d{8,}/.test(t.replace(/\D/g, ""))) return true;
    return false;
  }

  $("form").onsubmit = function (e) {
    e.preventDefault();
    if (pareceDadoPessoal($("local").value + " " + $("desc").value) &&
        !confirm("O texto parece conter telefone ou CPF. Não registre dados pessoais de moradores. Salvar mesmo assim?")) return;
    var d = new Date($("quando").value);
    var dataIso = isNaN(d) ? new Date().toISOString() : d.toISOString();
    var gpsVal = $("coordGps") ? $("coordGps").value.trim() : "";
    var fotosParaSalvar = fotosPendentes.slice(0, 2);
    var idAlvo = editandoId;
    if (editandoId) {
      var idx = rows.findIndex(function (x) { return x.id === editandoId; });
      if (idx > -1) {
        rows[idx].tipo = $("tipo").value;
        rows[idx].subtipo = $("subtipo").value;
        rows[idx].local = $("local").value.trim();
        rows[idx].quando = dataIso;
        rows[idx].descricao = $("desc").value.trim();
        rows[idx].status = $("statusForm").value || rows[idx].status;
        rows[idx].gps = gpsVal || rows[idx].gps || "";
        rows[idx].qtdFotos = fotosParaSalvar.length;
        rows[idx].atualizadoEm = new Date().toISOString();
      }
      editandoId = null;
      aviso("Ocorrência atualizada com sucesso.", "ok");
    } else {
      idAlvo = novoId();
      rows.unshift({
        id: idAlvo, tipo: $("tipo").value, subtipo: $("subtipo").value,
        local: $("local").value.trim(), descricao: $("desc").value.trim(), status: "aberta",
        gps: gpsVal, qtdFotos: fotosParaSalvar.length,
        quando: dataIso, criadoEm: new Date().toISOString()
      });
      aviso("Ocorrência registrada com sucesso.", "ok");
    }
    salvar();
    if (idAlvo) salvarFotosNoDb(idAlvo, fotosParaSalvar);
    fotosPendentes = [];
    desenharPreviaFotosForm();
    $("form").reset(); subs(); $("form").hidden = true; $("boxStatus").hidden = true; render();
  };

  function setStatus(id, s) {
    rows.forEach(function (r) { if (r.id === id) { r.status = s; r.atualizadoEm = new Date().toISOString(); } });
    salvar(); render();
  }
  function apagar(id) {
    if (!confirm("Apagar esta ocorrência? Não dá para desfazer (a menos que você tenha um backup).")) return;
    if (editandoId === id) {
      editandoId = null;
      $("form").hidden = true;
      $("boxStatus").hidden = true;
    }
    rows = rows.filter(function (r) { return r.id !== id; });
    apagarFotosDoDb(id);
    salvar(); render();
  }

  function gerarRelatorio() {
    var fs = $("fstatus").value, ft = $("ftipo").value, fb = $("fbusca").value.trim().toLowerCase();
    var listaAlvo = rows.filter(function (r) {
      if (fs && r.status !== fs) return false;
      if (ft && r.tipo !== ft) return false;
      if (fb) {
        var txt = (r.local + " " + (r.descricao || "") + " " + r.tipo + " " + r.subtipo).toLowerCase();
        if (txt.indexOf(fb) < 0) return false;
      }
      return true;
    });

    if (!listaAlvo.length) {
      aviso("Nenhuma ocorrência encontrada com os filtros atuais para gerar o relatório.", "ruim");
      return;
    }

    var agora = new Date();
    var agoraStr = agora.toLocaleDateString("pt-BR") + " às " + agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

    var c = { aberta: 0, atendimento: 0, concluida: 0 };
    listaAlvo.forEach(function (r) { c[r.status] = (c[r.status] || 0) + 1; });

    var texto = "🚨 *DEFESA CIVIL DE CAJAMAR — RELATÓRIO DE PLANTÃO*\n";
    texto += "📅 *Data/Hora:* " + agoraStr + "\n";
    if (listaAlvo.length !== rows.length) {
      texto += "🔍 *Filtro:* " + (fs ? ST[fs] + " " : "") + (ft ? ft + " " : "") + (fb ? '"' + fb + '"' : "") + "\n";
    }

    // Inclui resumo hidrometeorológico e de risco de deslizamento se houver dados das estações/régua
    if (typeof Estacao !== "undefined" && typeof Deslizamento !== "undefined") {
      try {
        var banco = Estacao.carregarBanco();
        var avs = [];
        ["est1", "est2", "est3", "est4", "est5"].forEach(function (id, idx) {
          var sl = banco.slots[id];
          if (!sl || !sl.dias) return;
          var ds = Object.keys(sl.dias).sort();
          if (!ds.length) return;
          var u = ds[ds.length - 1];
          var av = Deslizamento.avaliarDiaEstacao(sl.dias, u, sl.estacao || ("Estação " + (idx + 1)));
          if (av) avs.push(av);
        });
        var rios = [];
        Estacao.IDS_NIVEL.forEach(function (idNivel) {
          var slReg = banco.slots && banco.slots[idNivel];
          var dsReg = slReg && slReg.dias ? Object.keys(slReg.dias).sort() : [];
          var dR = dsReg.length ? slReg.dias[dsReg[dsReg.length - 1]] : null;
          if (dR && dR.nvMax !== null && dR.nvMax !== undefined) rios.push({ nome: (slReg.rotulo || "").replace("Régua de Nível — ", ""), d: dR });
        });
        if (avs.length || rios.length) {
          texto += "\n⛰️ *Status Hidrometeorológico e Encostas:*\n";
          if (avs.length) {
            var concl = avs.filter(function (a) { return a.conclusivo; });
            concl.sort(function (a, b) { return b.nivel - a.nivel || b.mm24h - a.mm24h; });
            var p = concl.length ? concl[0] : avs[0];
            texto += "• Indicador pluviométrico referencial (não oficial): " + p.icone + " *" + p.estado.toUpperCase() + "* (" + p.fonte + " — 1h: " + Deslizamento.fmtMm(p.mm1h) + "mm | 24h: " + Deslizamento.fmtMm(p.mm24h) + "mm | 168h: " + Deslizamento.fmtMm(p.mm168h) + "mm)\n";
          }
          rios.forEach(function (r) {
            var avRio = Estacao.avaliarNivelRio(r.d.nvMax, r.d.nvDelta, undefined, Estacao.qualidadeNivel(r.d));
            texto += "• Régua do Rio (" + r.nome + "): " + avRio.icone + " *" + avRio.estado + "* (Máx: " + r.d.nvMax.toFixed(2).replace(".", ",") + "m · Δ: +" + Math.round((r.d.nvDelta || 0) * 100) + "cm)\n";
          });
        }
      } catch (e) {}
    }

    texto += "\n📊 *Resumo:*\n";
    texto += "• Total no relatório: " + listaAlvo.length + "\n";
    texto += "• 🔴 Abertas: " + c.aberta + "\n";
    texto += "• 🟡 Em atendimento: " + c.atendimento + "\n";
    texto += "• 🟢 Concluídas: " + c.concluida + "\n";
    texto += "\n━━━━━━━━━━━━━━━━━━━━\n";
    texto += "📋 *Ocorrências:*\n\n";

    var tagStatus = { aberta: "🔴 [ABERTA]", atendimento: "🟡 [EM ATENDIMENTO]", concluida: "🟢 [CONCLUÍDA]" };

    listaAlvo.forEach(function (r, i) {
      var st = tagStatus[r.status] || r.status.toUpperCase();
      texto += (i + 1) + ". " + st + " *" + r.tipo + " · " + r.subtipo + "*\n";
      texto += "📍 *Local:* " + r.local + "\n";
      texto += "🕒 *Quando:* " + fmt(r.quando) + "\n";
      if (r.descricao) {
        texto += "📝 *Providência:* " + r.descricao + "\n";
      }
      texto += "\n";
    });

    texto += "━━━━━━━━━━━━━━━━━━━━\n";
    texto += "Defesa Civil de Cajamar (199)";

    var btnRel = $("relatorio");
    // Guarda o HTML original se ainda não estiver salvo para evitar destruir ícones ou ficar preso no estado copiado
    if (btnRel && !btnRel.dataset.originalHtml) {
      btnRel.dataset.originalHtml = btnRel.innerHTML;
    }

    function showFeedback() {
      aviso("📋 Resumo do plantão copiado! Cole no WhatsApp da equipe.", "ok");
      if (!btnRel) return;
      btnRel.disabled = true;
      btnRel.innerHTML = "✅ Copiado!";
      setTimeout(function() {
        btnRel.innerHTML = btnRel.dataset.originalHtml;
        btnRel.disabled = false;
      }, 2000);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texto).then(showFeedback).catch(function () {
        copiarFallback(texto, showFeedback);
      });
    } else {
      copiarFallback(texto, showFeedback);
    }
  }

  function copiarFallback(texto, callback) {
    var ta = document.createElement("textarea");
    ta.value = texto;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      if (callback) callback();
    } catch (e) {
      prompt("Copie o texto do relatório abaixo:", texto);
    }
    ta.remove();
  }

  $("exportar").onclick = function () {
    var blob = new Blob([JSON.stringify({ versao: 1, exportadoEm: new Date().toISOString(), ocorrencias: rows }, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ocorrencias-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  };
  $("importar").onclick = function () { $("arquivo").click(); };
  $("arquivo").onchange = function () {
    var f = this.files[0]; this.value = "";
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var j = JSON.parse(rd.result), lista = Array.isArray(j) ? j : j.ocorrencias;
        if (!Array.isArray(lista)) throw 0;
        var ok = lista.filter(valida), ids = {};
        rows.forEach(function (r) { ids[r.id] = 1; });
        var novos = ok.filter(function (r) { return !ids[r.id]; }).map(function (r) {
          return { id: r.id, tipo: r.tipo, subtipo: r.subtipo, local: String(r.local).slice(0, 120), descricao: String(r.descricao || "").slice(0, 600), status: r.status, quando: r.quando, criadoEm: r.criadoEm || r.quando };
        });
        rows = novos.concat(rows).sort(function (a, b) { return new Date(b.quando) - new Date(a.quando); });
        salvar(); render();
        aviso("Importação: " + novos.length + " nova(s); " + (ok.length - novos.length) + " já existiam; " + (lista.length - ok.length) + " ignorada(s) por formato inválido.", "ok");
      } catch (e) { aviso("Arquivo não reconhecido. Use um backup exportado por este quadro.", "ruim"); }
    };
    rd.readAsText(f);
  };

  function render() {
    atualizarBairrosSugeridos();
    var fs = $("fstatus").value, ft = $("ftipo").value, fb = $("fbusca").value.trim().toLowerCase();
    var c = { aberta: 0, atendimento: 0, concluida: 0 };
    rows.forEach(function (r) { c[r.status]++; });
    var cn = $("counts"); cn.textContent = "";
    [["aberta", "Abertas"], ["atendimento", "Em atendimento"], ["concluida", "Concluídas"]].forEach(function (p) {
      var d = document.createElement("button"); d.type = "button"; d.className = "count"; d.dataset.s = p[0];
      d.setAttribute("aria-pressed", fs === p[0] ? "true" : "false");
      d.title = fs === p[0] ? "Mostrar todos os status" : "Filtrar: " + p[1];
      d.onclick = function () { $("fstatus").value = fs === p[0] ? "" : p[0]; render(); };
      var b = document.createElement("b"); b.textContent = c[p[0]];
      var s = document.createElement("span"); s.textContent = p[1];
      d.append(b, s); cn.appendChild(d);
    });
    var ul = $("lista"); ul.textContent = "";
    var vis = rows.filter(function (r) {
      if (fs && r.status !== fs) return false;
      if (ft && r.tipo !== ft) return false;
      if (fb) {
        var txt = (r.local + " " + (r.descricao || "") + " " + r.tipo + " " + r.subtipo).toLowerCase();
        if (txt.indexOf(fb) < 0) return false;
      }
      return true;
    });
    if (!vis.length) {
      var li = document.createElement("li"); li.className = "empty";
      var b = document.createElement("b"); b.textContent = rows.length ? "Nenhuma ocorrência com esses filtros ou busca" : "Nenhuma ocorrência registrada";
      var p = document.createElement("span"); p.textContent = rows.length ? "Ajuste os filtros ou o termo de busca para ver outras." : "Toque em “Nova ocorrência” para o primeiro registro.";
      li.append(b, p); ul.appendChild(li); return;
    }
    vis.forEach(function (r) {
      var li = document.createElement("li"); li.className = "item"; li.dataset.s = r.status;
      var top = document.createElement("div"); top.className = "top";
      var t = document.createElement("span"); t.className = "tipo"; t.textContent = r.tipo + " · " + r.subtipo;
      var bd = document.createElement("span"); bd.className = "badge"; bd.textContent = ST[r.status];
      top.append(t, bd);
      var m = document.createElement("div"); m.className = "meta"; m.textContent = r.local + " · " + fmt(r.quando);
      li.append(top, m);
      if (r.descricao) { var d = document.createElement("div"); d.className = "desc"; d.textContent = r.descricao; li.appendChild(d); }
      if (r.qtdFotos > 0) {
        var boxFotosItem = document.createElement("div");
        boxFotosItem.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;margin-top:4px";
        li.appendChild(boxFotosItem);
        lerFotosDoDb(r.id).then(function (fotos) {
          fotos.forEach(function (src, idxF) {
            var im = document.createElement("img");
            im.src = src;
            im.alt = "Foto da ocorrência " + (idxF + 1);
            im.style.cssText = "width:110px;height:82px;object-fit:cover;border-radius:8px;border:1px solid var(--line);cursor:pointer";
            im.onclick = function () {
              var w = window.open("");
              if (w) { w.document.write('<img src="' + src + '" style="max-width:100%;height:auto">'); }
            };
            boxFotosItem.appendChild(im);
          });
        });
      }
      var a = document.createElement("div"); a.className = "actions";
      var ed = document.createElement("button"); ed.className = "btn small"; ed.type = "button"; ed.textContent = "Editar";
      ed.onclick = function () { editar(r.id); }; a.appendChild(ed);
      Object.keys(ST).forEach(function (k) {
        if (k === r.status) return;
        var bt = document.createElement("button"); bt.className = "btn small"; bt.type = "button"; bt.textContent = "→ " + ST[k];
        bt.onclick = function () { setStatus(r.id, k); }; a.appendChild(bt);
      });
      var ap = document.createElement("button"); ap.className = "btn small perigo"; ap.type = "button"; ap.textContent = "Apagar";
      ap.onclick = function () { apagar(r.id); }; a.appendChild(ap);
      li.appendChild(a); ul.appendChild(li);
    });
  }
  $("fstatus").onchange = render;
  $("ftipo").onchange = render;
  $("fbusca").oninput = render;
  $("relatorio").onclick = gerarRelatorio;

  // ---------- 1.5 Relatório Consolidado de Passagem de Plantão (12h / 24h) ----------
  function montarTextoPassagemPlantao() {
    var agora = new Date();
    var agoraStr = agora.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    var linhas = [
      "🛡️ *DEFESA CIVIL DE CAJAMAR — PASSAGEM DE PLANTÃO (12h / 24h)*",
      "📅 *Fechamento:* " + agoraStr + " (Horário de Brasília)",
      "━━━━━━━━━━━━━━━━━━━━"
    ];

    // 1. Chuva observada (CEMADEN + Estações CSV) e Encostas
    linhas.push("🌧️ *1. CHUVA OBSERVADA E ENCOSTAS (24 h):*");
    try {
      var cemGuardado = JSON.parse(localStorage.getItem("cajamar:cemaden") || "null");
      if (cemGuardado && cemGuardado.d && Array.isArray(cemGuardado.d.estacoes)) {
        var estCaj = cemGuardado.d.estacoes.filter(function (e) { return Number(e.ibge) === 3509205; });
        if (estCaj.length) {
          estCaj.forEach(function (e) {
            var c1 = typeof e.acc1hr === "number" ? e.acc1hr.toFixed(1).replace(".", ",") + " mm" : "—";
            var c24 = typeof e.acc24hr === "number" ? e.acc24hr.toFixed(1).replace(".", ",") + " mm" : "—";
            linhas.push("• Pluviômetro CEMADEN " + e.nome + ": 1h=" + c1 + " | 24h=" + c24);
          });
        }
      }
    } catch (e) {}

    if (typeof Estacao !== "undefined" && typeof Deslizamento !== "undefined") {
      try {
        var banco = Estacao.carregarBanco();
        ["est1", "est2", "est3", "est4", "est5"].forEach(function (id, idx) {
          var sl = banco && banco.slots && banco.slots[id];
          if (!sl || !sl.dias) return;
          var ds = Object.keys(sl.dias).sort();
          if (!ds.length) return;
          var u = ds[ds.length - 1];
          var av = Deslizamento.avaliarDiaEstacao(sl.dias, u, sl.estacao || ("Estação " + (idx + 1)));
          if (av) {
            linhas.push("• " + (sl.estacao || ("Estação " + (idx + 1))) + " [" + u.slice(8, 10) + "/" + u.slice(5, 7) + "]: " + av.icone + " " + av.estado + " (1h: " + Deslizamento.fmtMm(av.mm1h) + " mm | 24h: " + Deslizamento.fmtMm(av.mm24h) + " mm | 168h: " + Deslizamento.fmtMm(av.mm168h) + " mm)");
          }
        });
        // 2. Nível dos Rios
        linhas.push("\n🌊 *2. NÍVEL DO RIO JUQUERY (RÉGUAS):*");
        var temRio = false;
        Estacao.IDS_NIVEL.forEach(function (idNivel) {
          var slReg = banco && banco.slots && banco.slots[idNivel];
          var dsReg = slReg && slReg.dias ? Object.keys(slReg.dias).sort() : [];
          var dR = dsReg.length ? slReg.dias[dsReg[dsReg.length - 1]] : null;
          if (dR && dR.nvMax !== null && dR.nvMax !== undefined) {
            temRio = true;
            var avRio = Estacao.avaliarNivelRio(dR.nvMax, dR.nvDelta, undefined, Estacao.qualidadeNivel(dR));
            linhas.push("• " + (slReg.rotulo || idNivel) + ": " + avRio.icone + " *" + avRio.estado + "* — Máx: " + dR.nvMax.toFixed(2).replace(".", ",") + " m (Δ +" + Math.round((dR.nvDelta || 0) * 100) + " cm)");
          }
        });
        if (!temRio) linhas.push("• Sem CSV de régua de nível importado neste aparelho.");
      } catch (e) {}
    }

    // 3. Focos de Calor (INPE)
    linhas.push("\n🔥 *3. FOCOS DE CALOR POR SATÉLITE (INPE 24–48 h):*");
    try {
      var qGuardado = JSON.parse(localStorage.getItem("cajamar:queimadas") || "null");
      if (qGuardado && qGuardado.d && Array.isArray(qGuardado.d.focos)) {
        var focos = qGuardado.d.focos;
        var emCaj = focos.filter(function (f) { return f.emCajamar; });
        var r50 = focos.filter(function (f) { return f.distanciaKm <= 50; });
        linhas.push("• Em Cajamar: " + emCaj.length + " foco(s) | Região (raio 50 km): " + r50.length + " foco(s)");
      } else {
        linhas.push("• Sem consulta recente do INPE guardada neste aparelho.");
      }
    } catch (e) {}

    // 4. Previsão para o próximo turno e Avisos INMET
    linhas.push("\n⛅ *4. AVISOS INMET E PREVISÃO PARA O PRÓXIMO TURNO:*");
    try {
      var avInmet = JSON.parse(localStorage.getItem("cajamar:avisos_inmet") || "null");
      if (avInmet && avInmet.d) {
        linhas.push("• Avisos INMET consultados às " + new Date(avInmet.t).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }) + ".");
      }
      var clGuardado = JSON.parse(localStorage.getItem("cajamar:clima") || "null");
      if (clGuardado && clGuardado.d && clGuardado.d.current && clGuardado.d.daily) {
        var cur = clGuardado.d.current, dly = clGuardado.d.daily;
        linhas.push("• Condição atual: " + Math.round(cur.temperature_2m) + "°C · Umidade " + Math.round(cur.relative_humidity_2m) + "% · Vento " + Math.round(cur.wind_speed_10m) + " km/h");
        if (Array.isArray(dly.time) && dly.time.length >= 2) {
          var iHoje = dly.time.length - 7 >= 0 ? dly.time.length - 7 : 0;
          linhas.push("• Próximo dia (" + dly.time[iHoje + 1].slice(8, 10) + "/" + dly.time[iHoje + 1].slice(5, 7) + "): Mín " + Math.round(dly.temperature_2m_min[iHoje + 1]) + "°C / Máx " + Math.round(dly.temperature_2m_max[iHoje + 1]) + "°C · Chuva prevista: " + Number(dly.precipitation_sum[iHoje + 1] || 0).toFixed(1).replace(".", ",") + " mm (" + (dly.precipitation_probability_max[iHoje + 1] || 0) + "%)");
        }
      }
    } catch (e) {}

    // 5. Ocorrências do Plantão
    var c = { aberta: 0, atendimento: 0, concluida: 0 };
    rows.forEach(function (r) { c[r.status] = (c[r.status] || 0) + 1; });
    linhas.push("\n📋 *5. OCORRÊNCIAS REGISTRADAS (" + rows.length + " total):*");
    linhas.push("• 🔴 Abertas (pendências p/ próximo turno): " + c.aberta);
    linhas.push("• 🟡 Em atendimento: " + c.atendimento);
    linhas.push("• 🟢 Concluídas: " + c.concluida);
    if (rows.length) {
      linhas.push("");
      var tagStatus = { aberta: "🔴 [ABERTA]", atendimento: "🟡 [ATENDIMENTO]", concluida: "🟢 [CONCLUÍDA]" };
      rows.slice(0, 20).forEach(function (r, idx) {
        linhas.push((idx + 1) + ". " + (tagStatus[r.status] || r.status) + " *" + r.tipo + " · " + r.subtipo + "* — " + r.local + " (" + fmt(r.quando) + ")" + (r.descricao ? " — " + r.descricao : ""));
      });
    }
    linhas.push("━━━━━━━━━━━━━━━━━━━━");
    linhas.push("Defesa Civil de Cajamar · Emergência 199");
    return linhas.join("\n");
  }

  if ($("btnPassagemPlantao")) {
    $("btnPassagemPlantao").onclick = function () {
      var txt = montarTextoPassagemPlantao();
      if ($("textoPassagemPlantao")) $("textoPassagemPlantao").textContent = txt;
      if ($("boxPassagemPlantao")) {
        $("boxPassagemPlantao").hidden = false;
        $("boxPassagemPlantao").scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
  }
  if ($("btnFecharBoxPlantao")) {
    $("btnFecharBoxPlantao").onclick = function () {
      if ($("boxPassagemPlantao")) $("boxPassagemPlantao").hidden = true;
    };
  }
  if ($("btnCopiarPlantao")) {
    $("btnCopiarPlantao").onclick = function () {
      var txt = $("textoPassagemPlantao") ? $("textoPassagemPlantao").textContent : montarTextoPassagemPlantao();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(function () { aviso("✅ Relatório de Passagem de Plantão copiado!", "ok"); }).catch(function () { copiarFallback(txt); });
      } else {
        copiarFallback(txt);
      }
    };
  }
  if ($("btnWhatsPlantao")) {
    $("btnWhatsPlantao").onclick = function () {
      var txt = $("textoPassagemPlantao") ? $("textoPassagemPlantao").textContent : montarTextoPassagemPlantao();
      window.open("https://wa.me/?text=" + encodeURIComponent(txt), "_blank", "noopener");
    };
  }
  if ($("btnImprimirPlantao")) {
    $("btnImprimirPlantao").onclick = function () {
      var txt = montarTextoPassagemPlantao();
      if ($("textoPassagemPlantao")) $("textoPassagemPlantao").textContent = txt;
      if ($("boxPassagemPlantao")) $("boxPassagemPlantao").hidden = false;
      window.print();
    };
  }

  rows = carregar();
  if (memoria) aviso("Armazenamento do navegador indisponível: os registros não serão guardados. Use Exportar.", "ruim");
  render();
  window.addEventListener("storage", function (ev) {
    if (!ev || !ev.key || ev.key === CHAVE || ev.key.indexOf("cajamar:") === 0) {
      rows = carregar();
      render();
    }
  });

  // Se veio do Painel de Deslizamento ou do Mapa ("Abrir Vistoria / Ocorrência"), abre o formulário já preenchido
  try {
    var rasc = JSON.parse(sessionStorage.getItem("cajamar:rascunho_ocorrencia") || "null");
    if (rasc && typeof rasc === "object") {
      sessionStorage.removeItem("cajamar:rascunho_ocorrencia");
      $("novo").click();
      if (rasc.tipo && CAT[rasc.tipo]) {
        $("tipo").value = rasc.tipo;
        subs();
      }
      if (rasc.subtipo) $("subtipo").value = rasc.subtipo;
      if (rasc.local) $("local").value = rasc.local;
      if (rasc.descricao) $("desc").value = rasc.descricao.slice(0, 600);
      aviso("Formulário preenchido automaticamente com os volumes de água e o estado de risco de deslizamento atual. Informe o bairro/local e clique em Registrar.", "ok");
    }
  } catch (e) {}
})();
