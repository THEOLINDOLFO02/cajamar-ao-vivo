// Recordes e extremos (js/extremos.js). Dados FICTÍCIOS; os resultados esperados foram calculados à mão.
import test from "node:test";
import assert from "node:assert/strict";
import { carregarScripts } from "./util.mjs";

const { Extremos } = carregarScripts(["js/estacao.js", "js/extremos.js"]);

const dia = (o) => Object.assign({ chuva: null, c60: 0, c10: 0, tmin: null, tmax: null, umid: null, pmin: null, pmax: null, vmax: null, radmax: null, chuvaCompleta: true }, o);
const banco = {
  slots: {
    est1: { id: "est1", rotulo: "Estação Meteorológica 1", estacao: "Estação A", dias: {
      "2026-01-01": dia({ chuva: 12.4, c60: 8.2, c10: 2.1, tmin: 17.5, tmax: 26.0, umid: 80, pmin: 930.0, pmax: 936.5, vmax: 22.0, radmax: 900 }),
      "2026-01-02": dia({ chuva: 0, tmin: 15.0, tmax: 30.5, umid: 55, pmin: 931.0, pmax: 933.0, vmax: 35.5, radmax: 1100 }),
      "2026-01-03": dia({ chuva: 40.0, c60: 20.0, c10: 6.0, tmin: 16.0, tmax: 22.0, umid: 95, pmin: 925.0, pmax: 934.0, vmax: 18.0, chuvaCompleta: false })
    } },
    est2: { id: "est2", rotulo: "Estação Meteorológica 2", estacao: "Estação B", dias: {
      "2026-01-01": dia({ chuva: 30.0, c60: 12.0, c10: 3.0, tmin: 18.0, tmax: 24.0, vmax: 40.0 }),
      "2026-01-02": dia({ chuva: null, tmin: 14.0, tmax: 29.0, vmax: null })
    } },
    regua: { id: "regua", rotulo: "Régua de Nível — Jordanésia", estacao: "Jordanésia", dias: {
      "2026-01-01": { nvMin: 0.40, nvMax: 0.90, nvDelta: 0.5, cobHorasNivel: 24 },
      "2026-01-02": { nvMin: 0.50, nvMax: 2.20, nvDelta: 1.7, cobHorasNivel: 24 }
    } },
    regua2: { id: "regua2", rotulo: "Régua de Nível — Natura", estacao: "Natura", dias: {} }
  }
};

test("chuva: ordena os dias por volume e ignora dia sem registro (nunca vira zero)", () => {
  const r = Extremos.calcular(banco, {});
  assert.equal(r.chuva.dias.map((x) => x.valor).join(","), "40,30,12.4"); // dia 02/01 (0 mm) e o dia sem dado ficam de fora
  assert.equal(r.chuva.dias[0].estacao, "Estação A");
  assert.equal(r.chuva.dias[0].completo, false); // 40 mm é de um dia incompleto: sinalizado
  assert.equal(r.chuva.hora[0].valor, 20);
  assert.equal(r.chuva.dezMin[0].valor, 6);
});

test("temperatura: dia mais quente = maior máxima; dia mais frio = menor mínima; amplitude", () => {
  const r = Extremos.calcular(banco, {});
  assert.equal(r.temperatura.maisQuente[0].valor, 30.5);
  assert.equal(r.temperatura.maisQuente[0].data, "2026-01-02");
  assert.equal(r.temperatura.maisFrio[0].valor, 14);
  assert.equal(r.temperatura.maisFrio[0].estacao, "Estação B");
  assert.equal(r.temperatura.maiorAmplitude[0].valor, 15.5); // 30,5 − 15,0
});

test("vento, pressão, umidade e radiação: só entram dias com a medida", () => {
  const r = Extremos.calcular(banco, {});
  assert.equal(r.vento.dias[0].valor, 40);
  assert.equal(r.vento.dias.length, 4); // o dia com vmax nulo não aparece
  assert.equal(r.pressao.maior[0].valor, 936.5);
  assert.equal(r.pressao.menor[0].valor, 925);
  assert.equal(r.pressao.maiorVariacao[0].valor, 9); // 934,0 − 925,0
  assert.equal(r.umidade.maisUmido[0].valor, 95);
  assert.equal(r.umidade.maisSeco[0].valor, 55);
  assert.equal(r.radiacao.dias[0].valor, 1100);
  assert.equal(r.radiacao.dias.length, 2); // a Estação B não mede radiação
});

test("rio: maior nível e maior subida no dia, por régua; régua sem dado não aparece", () => {
  const r = Extremos.calcular(banco, {});
  assert.equal(r.rios.length, 1);
  assert.equal(r.rios[0].estacao, "Jordanésia");
  assert.equal(r.rios[0].maiorNivel[0].valor, 2.2);
  assert.equal(r.rios[0].maiorNivel[0].data, "2026-01-02");
  assert.equal(r.rios[0].maiorSubida[0].valor, 1.7);
  assert.equal(r.rios[0].menorNivel[0].valor, 0.4);
});

test("filtros: período, equipamento e somente dias completos", () => {
  assert.equal(Extremos.calcular(banco, { de: "2026-01-02", ate: "2026-01-02" }).chuva.dias.length, 0);
  assert.equal(Extremos.calcular(banco, { slot: "est2" }).temperatura.maisQuente[0].valor, 29);
  const comp = Extremos.calcular(banco, { apenasCompletos: true });
  assert.equal(comp.chuva.dias.map((x) => x.valor).join(","), "30,12.4"); // o dia incompleto de 40 mm sai
});

test("equipamentos: dias, último dia, chuva total (mínima se houver dia incompleto) e dias ≥ 1 mm", () => {
  const r = Extremos.calcular(banco, {});
  const a = r.equipamentos.find((e) => e.slot === "est1");
  assert.equal(a.dias, 3);
  assert.equal(a.chuvaTotal, 52.4); // 12,4 + 0 + 40,0
  assert.equal(a.chuvaTotalMinimo, true);
  assert.equal(a.diasComChuva, 2);
  assert.equal(a.tmax, 30.5);
  assert.equal(a.tmin, 15);
  const b = r.equipamentos.find((e) => e.slot === "est2");
  assert.equal(b.chuvaTotal, 30); // o dia sem dado não soma
  assert.equal(r.ultimaData, "2026-01-03");
  assert.equal(b.diasSemLeituraAteFim, 1);
});

test("banco vazio não quebra", () => {
  const r = Extremos.calcular({ slots: {} }, {});
  assert.equal(r.totalDias, 0);
  assert.equal(r.chuva.dias.length, 0);
});
