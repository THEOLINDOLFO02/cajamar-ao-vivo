// Guia de valores e procedimentos (js/guia-dados.js). Valores esperados calculados à mão.
import test from "node:test";
import assert from "node:assert/strict";
import { carregarScripts } from "./util.mjs";

const { Guia, Ar } = carregarScripts(["js/serie-om.js", "js/ar.js", "js/guia-dados.js"]);
const nome = (id, v, o) => { const r = Guia.avaliar(id, v, o); return r && r.banda ? r.banda.nome : null; };

test("estrutura: toda faixa tem fonte conhecida, efeitos e ao menos um procedimento", () => {
  for (const [id, el] of Object.entries(Guia.ELEMENTOS)) {
    const todas = [...el.bandas, ...Object.values(el.bandasPorJanela || {}).flat()];
    assert.ok(todas.length, id + " sem faixas");
    for (const b of todas) {
      assert.ok(Guia.FONTES[b.fonte], id + "/" + b.nome + ": fonte desconhecida");
      assert.ok(b.efeitos && b.procedimentos.length, id + "/" + b.nome + ": faltam efeitos ou procedimentos");
    }
  }
});

test("temperatura: faixas de referência", () => {
  assert.equal(nome("temperatura", 12), "Frio");
  assert.equal(nome("temperatura", 15), "Fresco");
  assert.equal(nome("temperatura", 20), "Conforto");
  assert.equal(nome("temperatura", 33), "Calor");
  assert.equal(nome("temperatura", 36), "Calor intenso");
  assert.equal(Guia.avaliar("temperatura", null), null); // dado ausente não vira zero
  assert.equal(Guia.avaliar("temperatura", NaN), null);
  assert.ok(Guia.avaliar("temperatura", 99).erro); // fora do intervalo
});

test("umidade: escala de baixa umidade (<30%) e faixas de referência", () => {
  assert.equal(nome("umidade", 11), "Emergência (ar muito seco)");
  assert.equal(nome("umidade", 12), "Alerta (ar seco)");
  assert.equal(nome("umidade", 25), "Atenção (ar seco)");
  assert.equal(nome("umidade", 40), "Aceitável");
  assert.equal(nome("umidade", 60), "Ideal (referência)");
  assert.equal(nome("umidade", 61), "Úmido");
  assert.equal(nome("umidade", 85), "Muito úmido");
});

test("pressão: só classifica depois de converter ao nível do mar com a altitude", () => {
  const semAlt = Guia.avaliar("pressao", 930);
  assert.equal(semAlt.banda, null);
  assert.equal(semAlt.extras.semAltitude, true);
  // 930 hPa a 760 m: 930 / (1 − 2,25577e-5 × 760)^5,25588 = 930 / 0,91312 ≈ 1018,5 hPa
  const r = Guia.avaliar("pressao", 930, { altitude: 760 });
  assert.ok(Math.abs(r.extras.nivelDoMar - 1018.5) < 0.3, "nível do mar: " + r.extras.nivelDoMar);
  assert.equal(r.banda.nome, "Normal");
  assert.equal(nome("pressao", 915, { altitude: 760 }), "Baixa pressão (instabilidade)"); // 915 → ≈ 1002 hPa
  assert.equal(nome("pressao", 950, { altitude: 760 }), "Alta pressão (estabilidade)"); // 950 → ≈ 1040 hPa
  assert.ok(Math.abs(Guia.pressaoNivelDoMar(1013.25, 0) - 1013.25) < 1e-9); // altitude 0: não muda
});

test("UV: arredonda como o painel (2,6 vira 3) e usa as mesmas faixas da OMS do painel", () => {
  assert.equal(nome("uv", 2.4), "Baixo");
  assert.equal(nome("uv", 2.6), "Moderado");
  assert.equal(nome("uv", 8), "Muito alto");
  assert.equal(nome("uv", 11), "Extremo");
  for (let u = 0; u <= 14; u += 0.5) assert.equal(nome("uv", u), Ar.classificarUv(u).nome, "UV " + u);
});

test("radiação: acima da constante solar é sinalizado como possível erro", () => {
  assert.equal(nome("radiacao", 0), "Sem Sol ou muito pouco");
  assert.equal(nome("radiacao", 900), "Sol presente");
  assert.equal(nome("radiacao", 1410), "Acima da constante solar");
});

test("vento: Beaufort em km/h e sensação térmica pelo vento (10 °C com 40 km/h ≈ 6 °C, não 2 °C)", () => {
  assert.equal(nome("vento", 10), "Brisa fraca (Beaufort 1 a 3)");
  assert.equal(nome("vento", 20), "Brisa moderada a forte (Beaufort 4 e 5)");
  assert.equal(nome("vento", 45), "Vento forte (Beaufort 6 e 7)");
  assert.equal(nome("vento", 70), "Ventania (Beaufort 8 e 9)");
  assert.equal(nome("vento", 120), "Força de furacão (Beaufort 12)");
  // 13,12 + 0,6215×10 − 11,37×40^0,16 + 0,3965×10×40^0,16, com 40^0,16 = 1,8044 → 5,97
  assert.ok(Math.abs(Guia.sensacaoVento(10, 40) - 5.97) < 0.02);
  assert.equal(Guia.sensacaoVento(15, 40), null); // fórmula só vale até 10 °C
  assert.equal(Guia.sensacaoVento(5, 2), null); // e com vento acima de 4,8 km/h
  assert.equal(Guia.avaliar("vento", 40, { temperatura: 10 }).extras.sensacao, 6);
});

test("direção: ponto cardeal de onde o vento vem e quadrante", () => {
  assert.equal(Guia.pontoCardeal(0).sigla, "N");
  assert.equal(Guia.pontoCardeal(350).sigla, "N");
  assert.equal(Guia.pontoCardeal(90).sigla, "L");
  assert.equal(Guia.pontoCardeal(200).sigla, "SSO");
  assert.equal(Guia.pontoCardeal(360).sigla, "N");
  assert.equal(nome("direcao", 10), "Quadrante Norte (NO a NE)");
  assert.equal(nome("direcao", 90), "Quadrante Leste (NE a SE)");
  assert.equal(nome("direcao", 180), "Quadrante Sul (SE a SO)");
  assert.equal(nome("direcao", 270), "Quadrante Oeste (SO a NO)");
  assert.equal(nome("direcao", 330), "Quadrante Norte (NO a NE)");
});

test("chuva: critérios do INMET em 1 h e 24 h e limiares informados em 72 h e 7 dias", () => {
  assert.equal(nome("chuva", 10, { janela: "1h" }), "Abaixo dos critérios do INMET");
  assert.equal(nome("chuva", 25, { janela: "1h" }), "Amarelo — perigo potencial");
  assert.equal(nome("chuva", 30, { janela: "1h" }), "Laranja — perigo");
  assert.equal(nome("chuva", 61, { janela: "1h" }), "Vermelho — grande perigo");
  assert.equal(nome("chuva", 75, { janela: "24h" }), "Laranja — perigo");
  assert.equal(nome("chuva", 120, { janela: "24h" }), "Vermelho — grande perigo");
  // 72 h e 168 h: limiares informados pela Defesa Civil (sem fonte técnica), sempre rotulados como tal
  assert.equal(nome("chuva", 50, { janela: "72h" }), "Abaixo do limiar de atenção informado");
  assert.equal(nome("chuva", 80, { janela: "72h" }), "Observação / Atenção (amarelo)");
  assert.equal(nome("chuva", 120, { janela: "72h" }), "Alerta (laranja)");
  assert.equal(nome("chuva", 200, { janela: "72h" }), "Alerta (laranja)");
  assert.equal(nome("chuva", 200.5, { janela: "72h" }), "Alerta máximo (vermelho)");
  assert.equal(nome("chuva", 119, { janela: "168h" }), "Abaixo do limiar de atenção informado");
  assert.equal(nome("chuva", 150, { janela: "168h" }), "Observação / Atenção (amarelo)");
  assert.equal(nome("chuva", 250, { janela: "168h" }), "Alerta (laranja)");
  assert.equal(nome("chuva", 251, { janela: "168h" }), "Alerta máximo (vermelho)");
  assert.equal(Guia.avaliar("chuva", 100, { janela: "72h" }).banda.fonte, "informado");
  assert.equal(Guia.avaliar("chuva", 100, { janela: "24h" }).banda.fonte, "inmet");
  assert.match(Guia.FONTES.informado, /sem fonte técnica verificada e não homologado/);
  // escala descritiva informada
  assert.equal(Guia.avaliar("chuva", 35, { janela: "1h" }).extras.intensidade, "Chuva forte");
  assert.equal(Guia.avaliar("chuva", 90, { janela: "72h" }).extras.intensidade, "Acumulado elevado");
  assert.equal(Guia.avaliar("chuva", 210, { janela: "168h" }).extras.intensidade, "Acumulado crítico ou extremo");
});

test("texto para publicação traz valor, faixa, procedimentos, fonte e o aviso de que é orientação geral", () => {
  const t = Guia.textoPublicacao(Guia.avaliar("temperatura", 33));
  assert.match(t, /Temperatura do ar: 33 ?°C — Calor/);
  assert.match(t, /Beba água/);
  assert.match(t, /Fonte da faixa: Referência geral, não é limiar oficial/);
  assert.match(t, /confirme avisos oficiais/);
  assert.equal(Guia.textoPublicacao(Guia.avaliar("pressao", 930)), ""); // sem altitude não há texto
});
