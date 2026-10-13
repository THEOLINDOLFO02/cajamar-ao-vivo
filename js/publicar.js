// Gerador de publicações (Stories 1080x1920) a partir de dados oficiais. Nada é postado sozinho.
(function () {
  "use strict";
  var W = 1080, H = 1920;
  var AZUL = "#29408a", LARANJA = "#e5771a";
  var $ = function (i) { return document.getElementById(i); };
  var cv = $("tela"), ctx = cv.getContext("2d");
  var CHAVE_CONTATO = "cajamar:contato";

  // Estado dos dados carregados
  var avisos = null, previsao = null, historico = null;
  var coletaAvisos = null, coletaPrev = null;
  var modelo = { cor: LARANJA, tag: "", rodape: "" };

  var DICAS = {
    "Chuva forte": {
      linhas: ["Evite áreas alagadas. Nunca atravesse enchente a pé ou de carro.", "Afaste-se de árvores, postes e fios caídos.", "Não se abrigue debaixo de árvores durante tempestade.", "Se notar rachaduras, estalos ou deslizamento no terreno, saia do local e avise a Defesa Civil.", "Em emergência, ligue 199 (Defesa Civil) ou 193 (Bombeiros)."],
      legenda: "Chuva forte pede atenção. Siga as orientações e, em caso de risco, ligue 199 (Defesa Civil) ou 193 (Bombeiros)."
    },
    "Vendaval e raios": {
      linhas: ["Permaneça em local fechado, longe de janelas e portas de vidro.", "Prenda ou recolha objetos que o vento possa arremessar.", "Durante raios, evite usar aparelhos ligados na tomada.", "Não fique em áreas abertas, topos de morro ou perto de árvores isoladas.", "Em emergência, ligue 199 (Defesa Civil) ou 193 (Bombeiros)."],
      legenda: "Em temporais com vento e raios, proteja-se em local fechado. Em emergência, ligue 199 (Defesa Civil) ou 193 (Bombeiros)."
    },
    "Baixa umidade": {
      linhas: ["Beba bastante água ao longo do dia.", "Evite atividade física intensa entre 10h e 16h.", "Umidifique o ambiente (bacia com água, toalha molhada).", "Não faça queimadas nem jogue bituca de cigarro em mato seco.", "Em caso de incêndio, ligue 193 (Bombeiros)."],
      legenda: "Tempo seco exige cuidados com a saúde e com o fogo. Em caso de incêndio, ligue 193 (Bombeiros)."
    },
    "Depois da chuva": {
      linhas: ["Cuidado com entulho e mato alto: animais peçonhentos podem se abrigar ali. Use luvas e botas.", "Não encoste em fios caídos nem em postes danificados.", "Evite caminhar em ruas alagadas: a água pode estar contaminada.", "Árvore ou imóvel com risco de queda? Avise a Defesa Civil: 199."],
      legenda: "Depois da chuva, os cuidados continuam. Em caso de risco, avise a Defesa Civil pelo 199."
    }
  };

  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x !== undefined) e.textContent = x; return e; }
  function p2(n) { return (n < 10 ? "0" : "") + n; }
  function agora() { var d = new Date(); return p2(d.getDate()) + "/" + p2(d.getMonth() + 1) + "/" + d.getFullYear() + " " + p2(d.getHours()) + ":" + p2(d.getMinutes()); }
  function hm(ts) { var d = new Date(ts); return p2(d.getHours()) + ":" + p2(d.getMinutes()); }
  function fhora(s) { // "2026-10-13 08:57" -> "13/10 às 08:57"
    var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(s)); return m ? m[3] + "/" + m[2] + " às " + m[4] + ":" + m[5] : String(s);
  }
  function f1(v) { return typeof v === "number" ? v.toFixed(1).replace(".", ",") : "—"; }
  function n0(v) { return typeof v === "number" ? Math.round(v) : "—"; }
  function setMsg(t) { $("msg").textContent = t || ""; }
  function setStatus(t) { $("status").textContent = t || ""; }

  // ---------- carregamento ----------
  async function carregarInmet() {
    avisos = null; previsao = null;
    var erros = [];
    try {
      var a = await Fontes.consultar("avisos_inmet", Inmet.URL_AVISOS, Inmet.validarAvisos);
      if (a.antigo) throw new Error("sem resposta nova");
      avisos = Inmet.avisosDoMunicipio(a.dados); coletaAvisos = Date.now();
    } catch (e) { erros.push("avisos"); }
    try {
      var p = await Fontes.consultar("previsao_inmet", Inmet.URL_PREVISAO, Inmet.validarPrevisao);
      if (p.antigo) throw new Error("sem resposta nova");
      previsao = Inmet.previsaoDoMunicipio(p.dados); coletaPrev = Date.now();
    } catch (e) { erros.push("previsão"); }
    if (erros.length) setStatus("Sem dado novo do INMET (" + erros.join(" e ") + "). Para não publicar informação velha, esses tipos ficam bloqueados. Tente de novo mais tarde.");
    atualizarEscolha();
  }
  function carregarHistorico() {
    try { var x = JSON.parse(localStorage.getItem("cajamar:historico:v1") || "null"); historico = x && x.dias ? x : null; } catch (e) { historico = null; }
  }

  // ---------- por tipo: lista de opções e modelo ----------
  function opcoes(tipo) {
    var o = [];
    if (tipo === "aviso") {
      if (avisos) avisos.forEach(function (a, i) { o.push([i, (a.evento || "Aviso") + " — " + (a.severidade || "") + " (" + fhora(a.inicio) + " a " + fhora(a.fim) + ")"]); });
    } else if (tipo === "prevdia") {
      if (previsao) previsao.forEach(function (d, i) { o.push([i, (d.ref.dia_semana || "") + " " + d.dia.slice(0, 5)]); });
    } else if (tipo === "chuva") {
      if (historico) Object.keys(historico.dias).sort().reverse().forEach(function (k) {
        var d = historico.dias[k]; o.push([k, k.slice(8, 10) + "/" + k.slice(5, 7) + "/" + k.slice(0, 4) + " — " + f1(d.chuva) + " mm" + (d.n < 1296 ? " (dia incompleto)" : "")]);
      });
    } else if (tipo === "dica") {
      Object.keys(DICAS).forEach(function (k) { o.push([k, k]); });
    }
    return o;
  }

  function atualizarEscolha() {
    var tipo = $("tipo").value, sel = $("escolha");
    sel.textContent = "";
    $("boxEscolha").hidden = tipo === "prevsemana";
    var o = opcoes(tipo);
    o.forEach(function (x) { var op = document.createElement("option"); op.value = x[0]; op.textContent = x[1]; sel.appendChild(op); });
    var bloqueio = "";
    if (tipo === "aviso") { if (!avisos) bloqueio = "Sem dado novo dos avisos do INMET."; else if (!o.length) bloqueio = "Nenhum aviso ativo para Cajamar agora: não há o que publicar."; else setStatus("Avisos do INMET coletados às " + hm(coletaAvisos) + "."); }
    if (tipo === "prevdia" || tipo === "prevsemana") { if (!previsao) bloqueio = "Sem dado novo da previsão do INMET."; else setStatus("Previsão do INMET coletada às " + hm(coletaPrev) + "."); }
    if (tipo === "chuva") { if (!o.length) bloqueio = "Sem histórico: importe o CSV da estação na página “Histórico da estação”."; else setStatus("Histórico guardado neste aparelho (fonte: estação local; não é dado oficial)."); }
    if (tipo === "dica") setStatus("Textos gerais: revise antes de publicar.");
    if (bloqueio) setStatus(bloqueio);
    $("baixar").disabled = !!bloqueio; $("copiar").disabled = !!bloqueio;
    if (bloqueio) { limparCampos(); desenhar(); return; }
    montar();
  }

  function limparCampos() { $("titulo").value = ""; $("subtitulo").value = ""; $("linhas").value = ""; $("legenda").value = ""; modelo = { cor: LARANJA, tag: "", rodape: "" }; }

  function corAviso(a) {
    if (a.cor) return a.cor;
    var s = String(a.severidade || "").toLowerCase();
    return s.indexOf("grande") > -1 ? "#d92d20" : s.indexOf("potencial") > -1 ? "#facc15" : LARANJA;
  }

  function descPeriodo(x) { return (x.resumo || "sem descrição") + (x.dir_vento ? " · vento " + x.dir_vento + (x.int_vento ? " (" + String(x.int_vento).toLowerCase() + ")" : "") : ""); }

  function montar() {
    var tipo = $("tipo").value, v = $("escolha").value, L = [], leg = "";
    var m = { cor: LARANJA, tag: "", rodape: "" };
    if (tipo === "aviso") {
      var a = avisos[+v]; if (!a) return;
      m.cor = corAviso(a); m.tag = "AVISO OFICIAL · INMET";
      $("titulo").value = a.evento || "Aviso";
      $("subtitulo").value = "Aviso " + (a.severidade || "") + " para Cajamar";
      L.push("Válido de " + fhora(a.inicio) + " até " + fhora(a.fim));
      if (a.risco) L.push(a.risco);
      (a.instrucoes || []).slice(0, 3).forEach(function (t) { if (t) L.push(String(t)); });
      m.rodape = "Fonte: INMET (aviso oficial), coletado às " + hm(coletaAvisos);
      leg = "⚠️ AVISO DO INMET PARA CAJAMAR\n" + (a.evento || "Aviso") + " — " + (a.severidade || "") + "\nVálido de " + fhora(a.inicio) + " até " + fhora(a.fim) + ".\n" + (a.risco ? "\n" + a.risco + "\n" : "") + "\nEm emergência, ligue 199 (Defesa Civil) ou 193 (Bombeiros).\nFonte: INMET (previsao.inmet.gov.br). Informação repassada pela Defesa Civil de Cajamar.";
    } else if (tipo === "prevdia") {
      var d = previsao[+v]; if (!d) return;
      m.tag = "PREVISÃO · INMET";
      $("titulo").value = "Previsão para " + (d.ref.dia_semana || "") + ", " + d.dia.slice(0, 5);
      $("subtitulo").value = "Cajamar · previsão oficial do INMET";
      L.push("Mín " + n0(d.ref.temp_min) + "° · Máx " + n0(d.ref.temp_max) + "°");
      L.push("Umidade " + n0(d.ref.umidade_min) + "% a " + n0(d.ref.umidade_max) + "%");
      if (d.per) [["manha", "Manhã"], ["tarde", "Tarde"], ["noite", "Noite"]].forEach(function (p) { if (d.per[p[0]]) L.push(p[1] + ": " + descPeriodo(d.per[p[0]])); });
      else L.push(descPeriodo(d.ref));
      m.rodape = "Fonte: INMET, previsão coletada às " + hm(coletaPrev);
      leg = "🌦️ PREVISÃO PARA CAJAMAR — " + (d.ref.dia_semana || "") + ", " + d.dia.slice(0, 5) + "\n\n" + L.join("\n") + "\n\nPrevisão pode mudar: acompanhe os avisos oficiais.\nFonte: INMET (previsao.inmet.gov.br).";
    } else if (tipo === "prevsemana") {
      m.tag = "PREVISÃO · INMET";
      $("titulo").value = "Previsão dos próximos dias";
      $("subtitulo").value = "Cajamar · previsão oficial do INMET";
      previsao.slice(0, 5).forEach(function (d) { L.push(d.dia.slice(0, 5) + " · " + n0(d.ref.temp_min) + "°/" + n0(d.ref.temp_max) + "° · " + (d.ref.resumo || "—")); });
      m.rodape = "Fonte: INMET, previsão coletada às " + hm(coletaPrev);
      leg = "🌦️ PREVISÃO PARA CAJAMAR — PRÓXIMOS DIAS\n\n" + L.join("\n") + "\n\nPrevisão pode mudar: acompanhe os avisos oficiais.\nFonte: INMET (previsao.inmet.gov.br).";
    } else if (tipo === "chuva") {
      var dd = historico.dias[v]; if (!dd) return;
      var dt = v.slice(8, 10) + "/" + v.slice(5, 7) + "/" + v.slice(0, 4);
      m.tag = "CHUVA MEDIDA EM CAJAMAR";
      $("titulo").value = "Chuva medida em " + dt;
      $("subtitulo").value = "Estação meteorológica local";
      L.push("Chuva no dia: " + f1(dd.chuva) + " mm");
      L.push("Maior chuva em 1 hora: " + f1(dd.c60) + " mm");
      if (dd.tmin !== null && dd.tmax !== null) L.push("Temperatura: " + n0(dd.tmin) + "° a " + n0(dd.tmax) + "°");
      if (dd.vmax !== null) L.push("Vento máximo: " + f1(dd.vmax) + " km/h");
      var soma = 0, completo = true, base = new Date(v + "T12:00:00");
      for (var i = 0; i < 7; i++) { var x = new Date(base); x.setDate(x.getDate() - i); var k = x.getFullYear() + "-" + p2(x.getMonth() + 1) + "-" + p2(x.getDate()); if (!historico.dias[k] || historico.dias[k].n < 1296) { completo = false; break; } soma += historico.dias[k].chuva; }
      if (completo) L.push("Acumulado em 7 dias: " + f1(soma) + " mm");
      if (dd.n < 1296) L.push("Atenção: dia com leituras incompletas; a chuva pode ser maior.");
      m.rodape = "Medição de uma estação local em Cajamar. Não é dado oficial do INMET/CEMADEN.";
      leg = "🌧️ CHUVA MEDIDA EM CAJAMAR — " + dt + "\n\n" + L.join("\n") + "\n\nMedição de uma estação local, em um ponto da cidade. Não substitui os dados oficiais do INMET e do CEMADEN.";
    } else if (tipo === "dica") {
      var dc = DICAS[v]; if (!dc) return;
      m.tag = "DICA DE PREVENÇÃO";
      $("titulo").value = v; $("subtitulo").value = "Defesa Civil de Cajamar";
      L = dc.linhas.slice();
      m.rodape = "Orientação geral de prevenção.";
      leg = "🛟 DICA DE PREVENÇÃO — " + v + "\n\n" + dc.legenda + "\n\n" + L.map(function (t) { return "• " + t; }).join("\n");
    }
    $("linhas").value = L.join("\n");
    modelo = m;
    var c = contatoLocal(); if (c) leg += "\nDefesa Civil de Cajamar: " + c;
    $("legenda").value = leg + "\n\n#DefesaCivil #Cajamar";
    desenhar();
  }

  function contatoLocal() { return $("contato").value.trim(); }

  // ---------- desenho ----------
  var imgs = {};
  function carregarImg(k, src) {
    return new Promise(function (ok) { var i = new Image(); i.onload = function () { imgs[k] = i; ok(); }; i.onerror = function () { ok(); }; i.src = src; });
  }
  function quebrar(txt, larg) {
    var palavras = String(txt).split(/\s+/), linhas = [], at = "";
    palavras.forEach(function (p) {
      var t = at ? at + " " + p : p;
      if (ctx.measureText(t).width <= larg || !at) at = t; else { linhas.push(at); at = p; }
    });
    if (at) linhas.push(at);
    return linhas;
  }
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  var FONTE = "'Segoe UI', system-ui, -apple-system, Roboto, Arial, sans-serif";

  function desenhar() {
    var g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#14214d"); g.addColorStop(1, "#0b1330");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    var temConteudo = $("titulo").value || $("linhas").value;
    // cabeçalho (zona segura do Stories: ~250 px livres no topo)
    var yTopo = 260;
    ctx.fillStyle = "#fff"; rr(60, yTopo, 170, 170, 18); ctx.fill();
    if (imgs.logo) ctx.drawImage(imgs.logo, 66, yTopo + 6, 158, 158);
    if (imgs.brasao) { var bh = 150, bw = bh * imgs.brasao.width / imgs.brasao.height; ctx.drawImage(imgs.brasao, W - 60 - bw, yTopo + 10, bw, bh); }
    ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.font = "700 34px " + FONTE; ctx.fillText("DEFESA CIVIL", W / 2, yTopo + 70);
    ctx.font = "600 30px " + FONTE; ctx.fillText("CAJAMAR · SP", W / 2, yTopo + 112);
    // faixa do tipo
    var yTag = yTopo + 210;
    ctx.fillStyle = modelo.cor || LARANJA; rr(60, yTag, W - 120, 74, 16); ctx.fill();
    var clara = /^#(f|e|d)/i.test(modelo.cor || "") && !/^#d9/i.test(modelo.cor || "");
    ctx.fillStyle = clara ? "#111" : "#fff"; ctx.font = "800 36px " + FONTE; ctx.fillText(modelo.tag || "", W / 2, yTag + 50);
    if (!temConteudo) { ctx.fillStyle = "#9db0e0"; ctx.font = "500 36px " + FONTE; ctx.fillText("Escolha um tipo de publicação", W / 2, 900); return; }
    ctx.textAlign = "left";
    var x = 80, larg = W - 160, y = yTag + 150;
    // título
    ctx.fillStyle = "#fff"; ctx.font = "800 72px " + FONTE;
    quebrar($("titulo").value, larg).slice(0, 3).forEach(function (l) { ctx.fillText(l, x, y); y += 84; });
    ctx.fillStyle = "#b9c6ee"; ctx.font = "500 40px " + FONTE;
    quebrar($("subtitulo").value, larg).slice(0, 2).forEach(function (l) { y += 4; ctx.fillText(l, x, y + 30); y += 50; });
    y += 40;
    // linhas, com tamanho que se ajusta ao espaço disponível
    var limite = 1560, linhas = $("linhas").value.split(/\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    var tam = 46, blocos;
    for (; tam >= 26; tam -= 2) {
      ctx.font = "500 " + tam + "px " + FONTE;
      blocos = linhas.map(function (l) { return quebrar(l, larg - 40); });
      var alt = blocos.reduce(function (s, b) { return s + b.length * (tam * 1.3) + tam * .5; }, 0);
      if (y + alt <= limite) break;
    }
    ctx.fillStyle = modelo.cor || LARANJA;
    blocos.forEach(function (b) {
      ctx.fillStyle = modelo.cor || LARANJA; ctx.fillRect(x, y - tam * .75, 10, b.length * tam * 1.3 - tam * .2);
      ctx.fillStyle = "#fff";
      b.forEach(function (l) { ctx.fillText(l, x + 36, y); y += tam * 1.3; });
      y += tam * .5;
    });
    // rodapé
    var yr = 1600; ctx.fillStyle = "rgba(255,255,255,.18)"; ctx.fillRect(80, yr - 24, W - 160, 2);
    ctx.fillStyle = "#dbe4ff"; ctx.font = "600 28px " + FONTE;
    var c = contatoLocal();
    var rod = [modelo.rodape, "Gerado em " + agora() + ". Informação auxiliar: confirme em previsao.inmet.gov.br.", "Emergência: Defesa Civil 199 · Bombeiros 193" + (c ? " · Defesa Civil Cajamar: " + c : "")];
    var yy = yr + 10;
    rod.forEach(function (t) { if (!t) return; ctx.font = "500 26px " + FONTE; quebrar(t, W - 160).slice(0, 2).forEach(function (l) { ctx.fillText(l, 80, yy); yy += 34; }); });
  }

  // ---------- ações ----------
  $("baixar").onclick = function () {
    setMsg("");
    try {
      cv.toBlob(function (b) {
        if (!b) { setMsg("Não foi possível gerar a imagem."); return; }
        var a = document.createElement("a"), d = new Date();
        a.href = URL.createObjectURL(b);
        a.download = "story-" + $("tipo").value + "-" + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + "-" + p2(d.getHours()) + p2(d.getMinutes()) + ".png";
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
        setMsg("Imagem baixada. Revise antes de publicar.");
      }, "image/png");
    } catch (e) { setMsg("Não foi possível exportar a imagem. Abra a página por http(s) (por exemplo, o endereço do GitHub Pages) e tente de novo."); }
  };
  $("copiar").onclick = async function () {
    try { await navigator.clipboard.writeText($("legenda").value); setMsg("Legenda copiada."); }
    catch (e) { $("legenda").select(); setMsg("Não consegui copiar sozinho: o texto está selecionado, use copiar do aparelho."); }
  };

  ["titulo", "subtitulo", "linhas"].forEach(function (i) { $(i).oninput = desenhar; });
  $("tipo").onchange = atualizarEscolha;
  $("escolha").onchange = montar;
  $("contato").oninput = desenhar;
  $("contato").onchange = function () { try { localStorage.setItem(CHAVE_CONTATO, $("contato").value); } catch (e) {} if (!$("baixar").disabled) montar(); };
  try { $("contato").value = localStorage.getItem(CHAVE_CONTATO) || ""; } catch (e) {}

  carregarHistorico();
  Promise.all([carregarImg("logo", "assets/logo-dc-cajamar.jpg"), carregarImg("brasao", "assets/brasao-cajamar.gif")]).then(function () {
    desenhar(); carregarInmet();
  });
})();
