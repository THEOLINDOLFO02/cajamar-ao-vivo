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
  var rows = [], memoria = false;

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
    catch (e) { memoria = true; aviso("Não foi possível gravar neste navegador (modo privado ou armazenamento cheio). Os registros desta sessão podem se perder: use Exportar."); return false; }
  }
  function novoId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function opt(sel, vals) { vals.forEach(function (v) { var o = document.createElement("option"); o.value = v; o.textContent = v; sel.appendChild(o); }); }
  opt($("tipo"), Object.keys(CAT)); opt($("ftipo"), Object.keys(CAT));
  function subs() { var s = $("subtipo"); s.textContent = ""; opt(s, CAT[$("tipo").value] || []); }
  $("tipo").onchange = subs; subs();
  function nowLocal() { var d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); }
  function fmt(iso) { var d = new Date(iso); return isNaN(d) ? "" : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }); }
  function aviso(t) { var a = $("aviso"); a.hidden = !t; a.textContent = t || ""; }

  $("novo").onclick = function () { $("form").hidden = false; $("quando").value = nowLocal(); $("local").focus(); };
  $("cancelar").onclick = function () { $("form").hidden = true; $("err").hidden = true; };
  $("form").onsubmit = function (e) {
    e.preventDefault();
    var d = new Date($("quando").value);
    rows.unshift({
      id: novoId(), tipo: $("tipo").value, subtipo: $("subtipo").value,
      local: $("local").value.trim(), descricao: $("desc").value.trim(), status: "aberta",
      quando: isNaN(d) ? new Date().toISOString() : d.toISOString(), criadoEm: new Date().toISOString()
    });
    aviso(""); salvar();
    $("form").reset(); subs(); $("form").hidden = true; render();
  };

  function setStatus(id, s) {
    rows.forEach(function (r) { if (r.id === id) { r.status = s; r.atualizadoEm = new Date().toISOString(); } });
    salvar(); render();
  }
  function apagar(id) {
    if (!confirm("Apagar esta ocorrência? Não dá para desfazer (a menos que você tenha um backup).")) return;
    rows = rows.filter(function (r) { return r.id !== id; });
    salvar(); render();
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
        aviso("Importação: " + novos.length + " nova(s); " + (ok.length - novos.length) + " já existiam; " + (lista.length - ok.length) + " ignorada(s) por formato inválido.");
      } catch (e) { aviso("Arquivo não reconhecido. Use um backup exportado por este quadro."); }
    };
    rd.readAsText(f);
  };

  function render() {
    var fs = $("fstatus").value, ft = $("ftipo").value;
    var c = { aberta: 0, atendimento: 0, concluida: 0 };
    rows.forEach(function (r) { c[r.status]++; });
    var cn = $("counts"); cn.textContent = "";
    [["aberta", "Abertas"], ["atendimento", "Em atendimento"], ["concluida", "Concluídas"]].forEach(function (p) {
      var d = document.createElement("div"); d.className = "count";
      var b = document.createElement("b"); b.textContent = c[p[0]];
      var s = document.createElement("span"); s.textContent = p[1];
      d.append(b, s); cn.appendChild(d);
    });
    var ul = $("lista"); ul.textContent = "";
    var vis = rows.filter(function (r) { return (!fs || r.status === fs) && (!ft || r.tipo === ft); });
    if (!vis.length) {
      var li = document.createElement("li"); li.className = "empty";
      var b = document.createElement("b"); b.textContent = rows.length ? "Nenhuma ocorrência com esses filtros" : "Nenhuma ocorrência registrada";
      var p = document.createElement("span"); p.textContent = rows.length ? "Mude os filtros acima para ver outras." : "Toque em “Nova ocorrência” para o primeiro registro.";
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
      Object.keys(ST).forEach(function (k) {
        if (k === r.status) return;
        var bt = document.createElement("button"); bt.className = "btn small"; bt.type = "button"; bt.textContent = "→ " + ST[k];
        bt.onclick = function () { setStatus(r.id, k); }; a.appendChild(bt);
      });
      var ap = document.createElement("button"); ap.className = "btn small"; ap.type = "button"; ap.textContent = "Apagar";
      ap.onclick = function () { apagar(r.id); }; a.appendChild(ap);
      li.appendChild(a); ul.appendChild(li);
    });
  }
  $("fstatus").onchange = render; $("ftipo").onchange = render;

  rows = carregar();
  if (memoria) aviso("Armazenamento do navegador indisponível: os registros não serão guardados. Use Exportar.");
  render();
})();
