// Testes do robô de alertas do Telegram: sem repetição, agravamento, encerramento e falha de fonte.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { avaliarGatilhosAlerta, decidirEnvio, formatarMensagemTelegram, normalizarAvisosInmet, enviarTelegram, nivelDaSeveridade, msBrt, AUSENCIAS_PARA_ENCERRAR } from "../scripts/alertas-telegram.mjs";

const AGORA = Date.UTC(2026, 10, 16, 18, 0);   // 16/11/2026 15:00 em Brasília
const aviso = (o = {}) => ({ id_aviso: 1, id_sequencia: 1, geocodes: "3509205,3500105", descricao: "Tempestade", severidade: "Perigo", inicio: "2026-11-16 08:00", fim: "2026-11-16 23:59", riscos: JSON.stringify(["Chuva forte & vento <60 km/h"]), encerrado: false, ...o });
const chaves = (lista) => JSON.stringify(lista);

test("severidade: potencial=1, perigo=2, grande perigo=3", () => {
  assert.equal(nivelDaSeveridade("Perigo Potencial"), 1);
  assert.equal(nivelDaSeveridade("Perigo"), 2);
  assert.equal(nivelDaSeveridade("Grande Perigo"), 3);
});

test("INMET: só Cajamar, sem encerrados, sem duplicados, sem futuros distantes e sem os que já acabaram", () => {
  const j = {
    hoje: [aviso(), aviso(), aviso({ id_aviso: 2, geocodes: "3550308" }), aviso({ id_aviso: 3, encerrado: true }), aviso({ id_aviso: 4, fim: "2026-11-16 10:00" })],
    futuro: [aviso({ id_aviso: 5, inicio: "2026-11-17 08:00", fim: "2026-11-17 23:00" }), aviso({ id_aviso: 6, inicio: "2026-11-16 15:20" })]
  };
  const r = normalizarAvisosInmet(j, AGORA);
  assert.equal(r.ok, true);
  assert.equal(chaves(r.avisos.map((a) => a.id).sort()), chaves(["1/1", "6/1"]));
  assert.equal(r.avisos[0].risco, "Chuva forte & vento <60 km/h");
  assert.equal(normalizarAvisosInmet({}, AGORA).ok, false);
  assert.ok(Number.isNaN(msBrt("lixo")));
});

test("gatilhos: Perigo Potencial fica de fora por padrão; com nivelMinimo=1 entra; CEMADEN usa 20 mm/h ou 50 mm/24h", () => {
  const avisos = [{ id: "1/1", evento: "Tempestade", severidade: "Perigo Potencial" }, { id: "2/1", evento: "Vendaval", severidade: "Perigo" }];
  assert.equal(avaliarGatilhosAlerta({ avisosInmet: avisos }).length, 1);
  assert.equal(avaliarGatilhosAlerta({ avisosInmet: avisos, nivelMinimo: 1 }).length, 2);
  const e = (acc, ibge = 3509205) => ({ cemaden: { estacoes: [{ id: "x", ibge, nome: "Jordanésia", acc }] } });
  assert.equal(avaliarGatilhosAlerta(e({ h1: 19.9, h24: 49.9 })).length, 0);
  assert.equal(avaliarGatilhosAlerta(e({ h1: 20, h24: 0 })).length, 1);
  assert.equal(avaliarGatilhosAlerta(e({ h1: null, h24: 50 })).length, 1);
  assert.equal(avaliarGatilhosAlerta(e({ h1: 90, h24: 90 }, 3550308)).length, 0);   // outro município
});

test("sem repetição: o mesmo alerta ativo não gera nova mensagem; escalada gera; encerramento só após ciclos seguidos", () => {
  const a = (nivel) => avaliarGatilhosAlerta({ cemaden: { estacoes: [{ id: "x", ibge: 3509205, nome: "Jordanésia", acc: { h1: nivel === 1 ? 25 : 45, h24: 0 } }] } });
  const ok = { agoraMs: AGORA, fontesOk: { cemaden: true } };
  let estado = { alertas: {} };
  let d = decidirEnvio(estado, a(1), ok);
  assert.equal(d.novos.length, 1);
  assert.ok(d.temMensagem);
  estado = d.estadoNovo;
  for (let i = 0; i < 5; i++) {
    d = decidirEnvio(estado, a(1), ok);
    assert.equal(d.temMensagem, false, "ciclo " + i + " não deve reenviar");
    estado = d.estadoNovo;
  }
  d = decidirEnvio(estado, a(2), ok);
  assert.equal(d.agravados.length, 1);
  estado = d.estadoNovo;
  d = decidirEnvio(estado, a(1), ok);          // voltou ao nível 1: não reenvia
  assert.equal(d.temMensagem, false);
  estado = d.estadoNovo;
  for (let i = 1; i < AUSENCIAS_PARA_ENCERRAR; i++) {
    d = decidirEnvio(estado, [], ok);
    assert.equal(d.temMensagem, false);
    estado = d.estadoNovo;
  }
  d = decidirEnvio(estado, [], ok);
  assert.equal(d.encerrados.length, 1);
  assert.equal(Object.keys(d.estadoNovo.alertas).length, 0);
});

test("falha de fonte não encerra nem reenvia: o alerta fica como estava", () => {
  const alertas = avaliarGatilhosAlerta({ avisosInmet: [{ id: "1/1", evento: "Tempestade", severidade: "Perigo" }] });
  let estado = decidirEnvio({ alertas: {} }, alertas, { agoraMs: AGORA, fontesOk: { inmet: true } }).estadoNovo;
  for (let i = 0; i < 10; i++) {
    const d = decidirEnvio(estado, [], { agoraMs: AGORA, fontesOk: { inmet: false } });
    assert.equal(d.temMensagem, false);
    estado = d.estadoNovo;
  }
  assert.equal(Object.keys(estado.alertas).length, 1);
  const d = decidirEnvio(estado, alertas, { agoraMs: AGORA, fontesOk: { inmet: true } });   // fonte voltou, alerta continua: não reenvia
  assert.equal(d.temMensagem, false);
});

test("mensagem: HTML escapado (texto do INMET não quebra o Telegram), limite de itens e formato", () => {
  const alertas = avaliarGatilhosAlerta({ avisosInmet: [{ id: "1/1", evento: "Tempestade <b>&", severidade: "Perigo", risco: "vento <60 & chuva" }] });
  const msg = formatarMensagemTelegram(alertas, "16/11/2026 15:00");
  assert.match(msg, /Tempestade &lt;b&gt;&amp;/);
  assert.match(msg, /vento &lt;60 &amp; chuva/);
  assert.equal(formatarMensagemTelegram([], "x"), null);
  const muitos = Array.from({ length: 12 }, (_, i) => ({ titulo: "<b>T" + i + "</b>", detalhe: "d" }));
  assert.match(formatarMensagemTelegram(muitos, "x"), /e mais 4 alerta/);
  const enc = formatarMensagemTelegram([], "x", { encerrados: [{ titulo: "🟠 <b>AVISO INMET (Perigo): Tempestade</b>" }] });
  assert.match(enc, /ENCERRADO/);
});

test("enviarTelegram: usa HTML e devolve erro legível quando o Telegram recusa", async () => {
  let corpo = null;
  await enviarTelegram("TOKEN", "-1", "oi", async (url, o) => {
    corpo = JSON.parse(o.body);
    assert.match(url, /\/botTOKEN\/sendMessage$/);
    return { ok: true, json: async () => ({ ok: true }) };
  });
  assert.equal(corpo.parse_mode, "HTML");
  await assert.rejects(enviarTelegram("T", "-1", "x", async () => ({ ok: false, status: 400, json: async () => ({ ok: false, description: "chat not found" }) })), /chat not found/);
});

test("workflow: estado dos alertas é restaurado e salvo, e os secrets só entram por secrets.*", () => {
  const y = readFileSync(new URL("../.github/workflows/publicar.yml", import.meta.url), "utf8");
  assert.match(y, /actions\/cache\/restore@v4/);
  assert.match(y, /actions\/cache\/save@v4/);
  assert.match(y, /TELEGRAM_BOT_TOKEN: \$\{\{ secrets\.TELEGRAM_BOT_TOKEN \}\}/);
  assert.ok(!/\d{8,}:[A-Za-z0-9_-]{30,}/.test(y), "token do Telegram não pode aparecer no workflow");
});
