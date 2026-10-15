// Observações manuais de chuva e vento. Os dados ficam só no localStorage deste navegador.
(function () {
  "use strict";
  var CHAVE = "cajamar:observacoes:v1";
  var $ = function (i) { return document.getElementById(i); };
  var rows = [], editandoId = null;

  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x !== undefined) e.textContent = x; return e; }
  function p2(n) { return (n < 10 ? "0" : "") + n; }
  function f1(v) { return v.toFixed(1).replace(".", ","); }
  function novoId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function nowLocal() { var d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); }
  function fmt(iso) { var d = new Date(iso); return isNaN(d) ? "" : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }); }
  function aviso(t, tipo) { var a = $("aviso"); a.hidden = !t; a.textContent = t || ""; a.className = "warn" + (tipo ? " " + tipo : ""); }
  function num(v) { if (v === "" || v === null || v === undefined) return null; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : null; }

  // ---------- armazenamento ----------
  function valida(r) {
    return r && typeof r.id === "string" && !isNaN(new Date(r.quando)) && typeof r.local === "string" &&
      (r.chuvaMm === null || typeof r.chuvaMm === "number") && (r.ventoKmh === null || typeof r.ventoKmh === "number");
  }
  function carregar() {
    try { var x = JSON.parse(localStorage.getItem(CHAVE) || "[]"); return Array.isArray(x) ? x.filter(valida) : []; }
    catch (e) { return []; }
  }
  function salvar() {
    try { localStorage.setItem(CHAVE, JSON.stringify(rows)); return true; }
    catch (e) { aviso("Não foi possível gravar neste navegador (modo privado ou armazenamento cheio). Use Exportar para não perder os registros.", "ruim"); return false; }
  }

  // Alerta simples para o que parece telefone ou CPF (a regra é nunca guardar dado pessoal).
  function pareceDadoPessoal(texto) {
    var t = String(texto);
    if (/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/.test(t)) return true;                  // CPF
    if (/(\(?\b\d{2}\)?[\s.-]?)?9?\d{4}[\s.-]?\d{4}\b/.test(t) && /\d{8,}/.test(t.replace(/\D/g, ""))) return true; // telefone
    return false;
  }

  // ---------- formulário ----------
  function abrirForm(r) {
    $("form").hidden = false; $("err").hidden = true;
    editandoId = r ? r.id : null;
    $("tituloForm").textContent = r ? "Editar observação" : "Nova observação";
    var d = r ? new Date(r.quando) : new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    $("quando").value = isNaN(d) ? nowLocal() : d.toISOString().slice(0, 16);
    $("local").value = r ? r.local : (rows[0] ? rows[0].local : "");
    $("chuva").value = r && r.chuvaMm !== null ? r.chuvaMm : "";
    $("janela").value = r && r.janela ? r.janela : "24 h";
    $("intensidade").value = r ? r.intensidade || "" : "";
    $("vento").value = r && r.ventoKmh !== null ? r.ventoKmh : "";
    $("direcao").value = r ? r.ventoDir || "" : "";
    $("ventoEscala").value = r ? r.ventoEscala || "" : "";
    $("instrumento").value = r && r.instrumento ? r.instrumento : "Pluviômetro manual";
    $("obs").value = r ? r.obs || "" : "";
    $("form").scrollIntoView({ block: "start" });
    $("local").focus();
  }
  function fecharForm() { $("form").hidden = true; $("err").hidden = true; editandoId = null; }
  function erro(t) { var e = $("err"); e.hidden = !t; e.textContent = t || ""; }

  $("novo").onclick = function () { abrirForm(null); };
  $("cancelar").onclick = fecharForm;
  $("form").onsubmit = function (ev) {
    ev.preventDefault();
    var chuva = num($("chuva").value), vento = num($("vento").value);
    var d = new Date($("quando").value);
    if (isNaN(d)) return erro("Informe a data e a hora da leitura.");
    if (d.getTime() > Date.now() + 5 * 60000) return erro("A data da leitura está no futuro.");
    if (chuva !== null && (chuva < 0 || chuva > 500)) return erro("Chuva deve estar entre 0 e 500 mm.");
    if (vento !== null && (vento < 0 || vento > 300)) return erro("Vento deve estar entre 0 e 300 km/h.");
    if (chuva === null && vento === null && !$("intensidade").value && !$("ventoEscala").value) {
      return erro("Informe pelo menos uma medida: chuva (mm), vento (km/h) ou uma intensidade observada.");
    }
    if (pareceDadoPessoal($("local").value + " " + $("obs").value) &&
        !confirm("O texto parece conter telefone ou CPF. Não registre dados pessoais de moradores. Salvar mesmo assim?")) return;
    var reg = {
      id: editandoId || novoId(), quando: d.toISOString(), local: $("local").value.trim().slice(0, 120),
      chuvaMm: chuva, janela: chuva !== null ? $("janela").value : "", intensidade: $("intensidade").value,
      ventoKmh: vento, ventoDir: $("direcao").value, ventoEscala: $("ventoEscala").value,
      instrumento: $("instrumento").value, obs: $("obs").value.trim().slice(0, 300),
      criadoEm: new Date().toISOString()
    };
    if (editandoId) {
      rows = rows.map(function (r) { return r.id === editandoId ? Object.assign({}, reg, { criadoEm: r.criadoEm || reg.criadoEm, atualizadoEm: new Date().toISOString() }) : r; });
    } else rows.unshift(reg);
    rows.sort(function (a, b) { return new Date(b.quando) - new Date(a.quando); });
    aviso(""); salvar(); fecharForm(); render();
  };

  function apagar(id) {
    if (!confirm("Apagar esta observação? Não dá para desfazer (a menos que você tenha um backup).")) return;
    rows = rows.filter(function (r) { return r.id !== id; }); salvar(); render();
  }

  // ---------- exportar / importar ----------
  function baixar(nome, tipo, conteudo) {
    var blob = new Blob([conteudo], { type: tipo }), a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  function hoje() { var d = new Date(); return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()); }
  $("exportar").onclick = function () {
    baixar("observacoes-" + hoje() + ".json", "application/json", JSON.stringify({ versao: 1, exportadoEm: new Date().toISOString(), observacoes: rows }, null, 2));
  };
  $("exportarCsv").onclick = function () {
    function cel(v) { v = v === null || v === undefined ? "" : String(v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
    var cab = ["data_hora", "local", "chuva_mm", "periodo_chuva", "intensidade_chuva", "vento_kmh", "direcao_vento", "intensidade_vento", "como_medido", "observacoes"];
    var linhas = rows.slice().sort(function (a, b) { return new Date(a.quando) - new Date(b.quando); }).map(function (r) {
      var d = new Date(r.quando);
      var dh = p2(d.getDate()) + "/" + p2(d.getMonth() + 1) + "/" + d.getFullYear() + " " + p2(d.getHours()) + ":" + p2(d.getMinutes());
      return [dh, r.local, r.chuvaMm === null ? "" : String(r.chuvaMm).replace(".", ","), r.janela, r.intensidade,
        r.ventoKmh === null ? "" : String(r.ventoKmh).replace(".", ","), r.ventoDir, r.ventoEscala, r.instrumento, r.obs].map(cel).join(";");
    });
    baixar("observacoes-" + hoje() + ".csv", "text/csv;charset=utf-8", "﻿" + [cab.join(";")].concat(linhas).join("\r\n"));
  };
  $("importar").onclick = function () { $("arquivo").click(); };
  $("arquivo").onchange = function () {
    var f = this.files[0]; this.value = ""; if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var j = JSON.parse(rd.result), lista = Array.isArray(j) ? j : j.observacoes;
        if (!Array.isArray(lista)) throw 0;
        var ok = lista.filter(valida), ids = {};
        rows.forEach(function (r) { ids[r.id] = 1; });
        var novos = ok.filter(function (r) { return !ids[r.id]; }).map(function (r) {
          return { id: r.id, quando: r.quando, local: String(r.local).slice(0, 120), chuvaMm: r.chuvaMm, janela: String(r.janela || ""), intensidade: String(r.intensidade || ""),
            ventoKmh: r.ventoKmh, ventoDir: String(r.ventoDir || ""), ventoEscala: String(r.ventoEscala || ""), instrumento: String(r.instrumento || ""),
            obs: String(r.obs || "").slice(0, 300), criadoEm: r.criadoEm || r.quando };
        });
        rows = novos.concat(rows).sort(function (a, b) { return new Date(b.quando) - new Date(a.quando); });
        salvar(); render();
        aviso("Importação: " + novos.length + " nova(s); " + (ok.length - novos.length) + " já existiam; " + (lista.length - ok.length) + " ignorada(s) por formato inválido.", "ok");
      } catch (e) { aviso("Arquivo não reconhecido. Use um backup exportado por esta página.", "ruim"); }
    };
    rd.readAsText(f);
  };

  // ---------- lista e resumo ----------
  function filtradas() {
    var per = $("fperiodo").value, q = $("fbusca").value.trim().toLowerCase();
    var corte = per === "todos" ? 0 : Date.now() - Number(per) * 86400000;
    return rows.filter(function (r) {
      if (new Date(r.quando).getTime() < corte) return false;
      return !q || (r.local + " " + (r.obs || "")).toLowerCase().indexOf(q) > -1;
    });
  }
  function cartao(rot, val, nota) { var d = el("div", "cx"); d.appendChild(el("span", "", rot)); d.appendChild(el("strong", "", val)); if (nota) d.appendChild(el("small", "", nota)); return d; }

  function render() {
    var vis = filtradas();
    // resumo
    var rs = $("resumo"); rs.textContent = "";
    $("resumoCard").hidden = !vis.length;
    if (vis.length) {
      var maxC = null, maxV = null;
      vis.forEach(function (r) {
        if (r.chuvaMm !== null && (maxC === null || r.chuvaMm > maxC.chuvaMm)) maxC = r;
        if (r.ventoKmh !== null && (maxV === null || r.ventoKmh > maxV.ventoKmh)) maxV = r;
      });
      rs.appendChild(cartao("Observações", String(vis.length), "no filtro atual"));
      rs.appendChild(cartao("Maior chuva registrada", maxC ? f1(maxC.chuvaMm) + " mm" : "—", maxC ? "em " + maxC.janela + " · " + fmt(maxC.quando) : "nenhuma leitura em mm"));
      rs.appendChild(cartao("Maior vento registrado", maxV ? Math.round(maxV.ventoKmh) + " km/h" : "—", maxV ? fmt(maxV.quando) : "nenhuma leitura em km/h"));
    }
    // lista
    var ul = $("lista"); ul.textContent = "";
    if (!vis.length) {
      var li = el("li", "mut", rows.length ? "Nenhuma observação com esses filtros." : "Nenhuma observação registrada. Toque em “Nova observação” para começar.");
      ul.appendChild(li); return;
    }
    vis.forEach(function (r) {
      var li = el("li", "obs-item");
      var topo = el("div", "topo"); topo.appendChild(el("span", "quando", fmt(r.quando))); topo.appendChild(el("span", "meta", r.instrumento || "")); li.appendChild(topo);
      li.appendChild(el("div", "meta", r.local));
      var v = el("div", "valores");
      function par(rot, val) { var s = el("span"); s.appendChild(document.createTextNode(rot + " ")); s.appendChild(el("b", "", val)); v.appendChild(s); }
      if (r.chuvaMm !== null) par("Chuva:", f1(r.chuvaMm) + " mm (" + (r.janela || "período não informado") + ")");
      if (r.intensidade) par("Intensidade da chuva:", r.intensidade);
      if (r.ventoKmh !== null) par("Vento:", Math.round(r.ventoKmh) + " km/h" + (r.ventoDir ? " de " + r.ventoDir : ""));
      else if (r.ventoDir) par("Vento de:", r.ventoDir);
      if (r.ventoEscala) par("Intensidade do vento:", r.ventoEscala);
      li.appendChild(v);
      if (r.obs) li.appendChild(el("div", "texto", r.obs));
      var ac = el("div", "acoes");
      var be = el("button", "btn small", "Editar"); be.type = "button"; be.onclick = function () { abrirForm(r); }; ac.appendChild(be);
      var ba = el("button", "btn small", "Apagar"); ba.type = "button"; ba.onclick = function () { apagar(r.id); }; ac.appendChild(ba);
      li.appendChild(ac); ul.appendChild(li);
    });
  }
  $("fperiodo").onchange = render; $("fbusca").oninput = render;

  rows = carregar().sort(function (a, b) { return new Date(b.quando) - new Date(a.quando); });
  render();
})();
