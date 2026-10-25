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
    $("form").hidden = true;
    $("boxStatus").hidden = true;
    $("err").hidden = true;
  };

  function editar(id) {
    var r = rows.find(function (x) { return x.id === id; });
    if (!r) return;
    editandoId = id;
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
    if (editandoId) {
      var idx = rows.findIndex(function (x) { return x.id === editandoId; });
      if (idx > -1) {
        rows[idx].tipo = $("tipo").value;
        rows[idx].subtipo = $("subtipo").value;
        rows[idx].local = $("local").value.trim();
        rows[idx].quando = dataIso;
        rows[idx].descricao = $("desc").value.trim();
        rows[idx].status = $("statusForm").value || rows[idx].status;
        rows[idx].atualizadoEm = new Date().toISOString();
      }
      editandoId = null;
      aviso("Ocorrência atualizada com sucesso.", "ok");
    } else {
      rows.unshift({
        id: novoId(), tipo: $("tipo").value, subtipo: $("subtipo").value,
        local: $("local").value.trim(), descricao: $("desc").value.trim(), status: "aberta",
        quando: dataIso, criadoEm: new Date().toISOString()
      });
      aviso("Ocorrência registrada com sucesso.", "ok");
    }
    salvar();
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
        ["est1", "est2", "est3"].forEach(function (id, idx) {
          var sl = banco.slots[id];
          if (!sl || !sl.dias) return;
          var ds = Object.keys(sl.dias).sort();
          if (!ds.length) return;
          var u = ds[ds.length - 1];
          var av = Deslizamento.avaliarDiaEstacao(sl.dias, u, sl.estacao || ("Estação " + (idx + 1)));
          if (av) avs.push(av);
        });
        var slReg = banco.slots && banco.slots.regua;
        var dsReg = slReg && slReg.dias ? Object.keys(slReg.dias).sort() : [];
        var dRio = dsReg.length ? slReg.dias[dsReg[dsReg.length - 1]] : null;
        if (avs.length || (dRio && dRio.nvMax !== null)) {
          texto += "\n⛰️ *Status Hidrometeorológico e Encostas:*\n";
          if (avs.length) {
            avs.sort(function (a, b) { return b.nivel - a.nivel || b.mm24h - a.mm24h; });
            var p = avs[0];
            texto += "• Risco Deslizamento: " + p.icone + " *" + p.estado.toUpperCase() + "* (" + p.fonte + " — 1h: " + p.mm1h.toFixed(1).replace(".", ",") + "mm | 24h: " + p.mm24h.toFixed(1).replace(".", ",") + "mm | 168h: " + p.mm168h.toFixed(1).replace(".", ",") + "mm)\n";
          }
          if (dRio && dRio.nvMax !== null) {
            var avRio = Estacao.avaliarNivelRio(dRio.nvMax, dRio.nvDelta);
            texto += "• Régua do Rio: " + avRio.icone + " *" + avRio.estado + "* (Máx: " + dRio.nvMax.toFixed(2).replace(".", ",") + "m · Δ: +" + Math.round((dRio.nvDelta || 0) * 100) + "cm)\n";
          }
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

  rows = carregar();
  if (memoria) aviso("Armazenamento do navegador indisponível: os registros não serão guardados. Use Exportar.", "ruim");
  render();
  window.addEventListener("storage", function (ev) {
    if (!ev || !ev.key || ev.key === KEY || ev.key.indexOf("cajamar:") === 0) {
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
