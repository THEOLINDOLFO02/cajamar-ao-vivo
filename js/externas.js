// Aba "Outras fontes": estação do CGE (Prefeitura de São Paulo) mais próxima de Cajamar, lida por raspagem de página
// através do Cloudflare Worker (worker/cemaden-proxy.js, rota /cge). Nada de chave de API neste arquivo.
(function (w) {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var el = function (t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x !== undefined) e.textContent = x; return e; };
  var cfg = w.CAJAMAR_CONFIG || {};

  function fmt(v, unid, casas) {
    if (typeof v !== "number" || !isFinite(v)) return "sem dado";
    return v.toFixed(casas === undefined ? 1 : casas).replace(".", ",") + (unid ? " " + unid : "");
  }

  function bloco(titulo, linhas) {
    var b = el("div", "ext-bloco");
    b.appendChild(el("h3", "", titulo));
    linhas.forEach(function (l) { var p = el("p", "", ""); p.appendChild(el("span", "mut", l[0] + ": ")); p.appendChild(el("b", "", l[1])); b.appendChild(p); });
    return b;
  }

  // Valida a resposta do Worker. Um Worker antigo (sem a rota /cge) devolve o JSON do CEMADEN: nesse caso avisa em vez de mostrar lixo.
  function validar(j) {
    if (!j || typeof j !== "object") return "Resposta inválida do Worker.";
    if (j.erro) return "O CGE não respondeu: " + j.erro;
    if (!j.posto || !j.temperatura || !j.chuva) return "O Worker publicado ainda não tem a rota /cge: cole o arquivo worker/cemaden-proxy.js atualizado no painel da Cloudflare e publique de novo.";
    return null;
  }

  function desenhar(j) {
    var s = $("cgeSaida"); s.textContent = "";
    var grade = el("div", "ext-grade");
    grade.appendChild(bloco("🌧️ Chuva", [["Período atual", fmt(j.chuva.atual, "mm")], ["Período anterior", fmt(j.chuva.anterior, "mm")], ["Zeramento", j.chuva.zeramento || "sem dado"]]));
    grade.appendChild(bloco("🌡️ Temperatura", [["Agora", fmt(j.temperatura.atual, "°C")], ["Máxima", fmt(j.temperatura.max, "°C")], ["Mínima", fmt(j.temperatura.min, "°C")]]));
    grade.appendChild(bloco("💧 Umidade", [["Agora", fmt(j.umidade.atual, "%", 0)], ["Máxima", fmt(j.umidade.max, "%", 0)], ["Mínima", fmt(j.umidade.min, "%", 0)]]));
    grade.appendChild(bloco("💨 Vento", [["Direção", j.vento.direcao || "sem dado"], ["Velocidade", fmt(j.vento.velocidade, "km/h")], ["Rajada", fmt(j.vento.rajada, "km/h")]]));
    grade.appendChild(bloco("🧭 Pressão (no local)", [["Agora", fmt(j.pressao.atual, "hPa")], ["Máxima", fmt(j.pressao.max, "hPa")], ["Mínima", fmt(j.pressao.min, "hPa")]]));
    s.appendChild(grade);
    var quando = new Date(j.consultadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    s.appendChild(el("p", "mut", "Estação do CGE: " + j.nome + " (posto " + j.posto + "). Consulta feita em " + quando + " (horário de Brasília). A página do CGE não informa a hora da medição, então este horário é o da consulta, não o da leitura. Os máximos e mínimos são do próprio CGE (janela de 24 h, critério deles). Dados obtidos por leitura da página pública, sem API oficial: podem falhar se o CGE mudar o site. Não é um equipamento da Defesa Civil de Cajamar."));
  }

  function carregar() {
    var msg = $("cgeMsg"), base = cfg.cemadenProxy;
    if (!base) { msg.textContent = "O endereço do Worker não está configurado em js/config.js."; return; }
    msg.textContent = "Consultando…"; $("cgeSaida").textContent = "";
    var ctl = typeof AbortController === "function" ? new AbortController() : null;
    var t = setTimeout(function () { if (ctl) ctl.abort(); }, 15000);
    fetch(base.replace(/\/+$/, "") + "/cge?posto=" + encodeURIComponent($("cgePosto").value), ctl ? { signal: ctl.signal } : {})
      .then(function (r) { return r.json().catch(function () { return null; }); })
      .then(function (j) {
        var erro = validar(j);
        if (erro) { msg.textContent = erro; return; }
        msg.textContent = ""; desenhar(j);
      })
      .catch(function () { msg.textContent = "Não consegui falar com o Worker agora. Tente de novo em instantes."; })
      .then(function () { clearTimeout(t); });
  }

  function iniciar() {
    if (!$("cgePosto")) return;
    $("cgeAtualizar").onclick = carregar;
    $("cgePosto").onchange = carregar;
    carregar();
  }
  w.Externas = { validar: validar, fmt: fmt };
  if (typeof document === "undefined") return;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})(window);
