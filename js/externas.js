// Aba "Outras fontes": estação do CGE (Prefeitura de São Paulo) mais próxima de Cajamar, lida por raspagem de página
// pelo robô do GitHub (scripts/coletar-cge.mjs -> data/cge.json). Nada de chave de API neste arquivo.
(function (w) {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var el = function (t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x !== undefined) e.textContent = x; return e; };

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

  // Valida o arquivo data/cge.json (gerado pelo robô do GitHub) para o posto escolhido.
  function validar(arq, posto) {
    if (!arq || typeof arq !== "object" || !arq.postos) return "Ainda não há leitura do CGE neste site: o robô do GitHub ainda não conseguiu coletar. Tente de novo em alguns minutos.";
    if (!arq.postos[posto]) return "O robô não conseguiu ler este posto na última coleta" + (arq.falhas && arq.falhas[posto] ? " (" + arq.falhas[posto] + ")" : "") + ".";
    return null;
  }

  function desenhar(j, arq) {
    var s = $("cgeSaida"); s.textContent = "";
    var grade = el("div", "ext-grade");
    grade.appendChild(bloco("🌧️ Chuva", [["Período atual", fmt(j.chuva.atual, "mm")], ["Período anterior", fmt(j.chuva.anterior, "mm")], ["Zeramento", j.chuva.zeramento || "sem dado"]]));
    grade.appendChild(bloco("🌡️ Temperatura", [["Agora", fmt(j.temperatura.atual, "°C")], ["Máxima", fmt(j.temperatura.max, "°C")], ["Mínima", fmt(j.temperatura.min, "°C")]]));
    grade.appendChild(bloco("💧 Umidade", [["Agora", fmt(j.umidade.atual, "%", 0)], ["Máxima", fmt(j.umidade.max, "%", 0)], ["Mínima", fmt(j.umidade.min, "%", 0)]]));
    grade.appendChild(bloco("💨 Vento", [["Direção", j.vento.direcao || "sem dado"], ["Velocidade", fmt(j.vento.velocidade, "km/h")], ["Rajada", fmt(j.vento.rajada, "km/h")]]));
    grade.appendChild(bloco("🧭 Pressão (no local)", [["Agora", fmt(j.pressao.atual, "hPa")], ["Máxima", fmt(j.pressao.max, "hPa")], ["Mínima", fmt(j.pressao.min, "hPa")]]));
    s.appendChild(grade);
    var quando = new Date(arq.coletadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    s.appendChild(el("p", "mut", "Estação do CGE: " + j.nome + ". Coletada pelo robô do GitHub em " + quando + " (horário de Brasília), repetida a cada cerca de 10 a 20 minutos. A página do CGE não informa a hora da medição, então este horário é o da coleta, não o da leitura. Os máximos e mínimos são do próprio CGE (janela de 24 h, critério deles). Dados obtidos por leitura da página pública, sem API oficial: podem falhar se o CGE mudar o site. Não é um equipamento da Defesa Civil de Cajamar."));
  }

  function carregar() {
    var msg = $("cgeMsg"), posto = $("cgePosto").value;
    msg.textContent = "Consultando…"; $("cgeSaida").textContent = "";
    fetch("data/cge.json?t=" + Math.floor(Date.now() / 60000))
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (arq) {
        var erro = validar(arq, posto);
        if (erro) { msg.textContent = erro; return; }
        msg.textContent = ""; desenhar(arq.postos[posto], arq);
      });
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
