// Testes do robô de alertas do Telegram: sem repetição, agravamento, encerramento e falha de fonte.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { avaliarGatilhosAlerta, avaliarEstacoesCatavento, decidirEnvio, formatarMensagemTelegram, normalizarAvisosInmet, enviarTelegram, nivelDaSeveridade, msBrt, lerCsvFocosCajamar, AUSENCIAS_PARA_ENCERRAR } from "../scripts/alertas-telegram.mjs";
import { lerCatavento } from "../worker/cemaden-proxy.js";
import { autenticarCatavento, coletar as coletarCatavento } from "../scripts/coletar-catavento.mjs";

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

test("Catavento-Surya: raspagem (HTML, JSON e CSV) e alertas no Telegram toda vez que mudar de faixa nos parâmetros", () => {
  const htmlCatavento = `
    <html><body>
      <div class="card"><h3>EMEB Karine</h3><p>Chuva 1h: 24,5 mm · Chuva 24h: 55,0 mm · Temperatura: 31,2 °C · Umidade: 26% · Vento: 44,0 km/h · 16/11/2026 15:00</p></div>
      <div class="card"><h3>Régua Jordanésia</h3><p>Nível do rio: 2,35 m · Chuva 1h: 10,0 mm · 16/11/2026 15:00</p></div>
    </body></html>
  `;
  const estacoes = lerCatavento(htmlCatavento);
  assert.equal(estacoes.length, 2);
  assert.equal(estacoes[0].nome, "EMEB Karine");
  assert.equal(estacoes[0].chuva1h, 24.5);
  assert.equal(estacoes[0].chuva24h, 55);
  assert.equal(estacoes[0].temperatura, 31.2);
  assert.equal(estacoes[0].umidade, 26);
  assert.equal(estacoes[0].vento, 44);
  assert.equal(estacoes[1].nome, "Régua Jordanésia");
  assert.equal(estacoes[1].nivelRio, 2.35);

  const gatilhos = avaliarGatilhosAlerta({ catavento: { estacoes } });
  const chavesCat = gatilhos.map((a) => a.chave);
  assert.ok(chavesCat.includes("catavento:chuva:emeb_karine"));
  assert.ok(chavesCat.includes("catavento:vento:emeb_karine"));
  assert.ok(chavesCat.includes("catavento:umidade:emeb_karine"));
  assert.ok(chavesCat.includes("catavento:temp:emeb_karine"));
  assert.ok(chavesCat.includes("catavento:nivel:r_gua_jordan_sia"));

  // Quando muda de faixa no Catavento (mesmo de Nível 2 para Nível 1 ou de 1 para 2), avisa no Telegram
  let estado = { alertas: {} };
  const g1 = avaliarEstacoesCatavento([{ id: "k", nome: "EMEB Karine", chuva1h: 22 }]); // Nível 1 (Atenção)
  let d = decidirEnvio(estado, g1, { agoraMs: AGORA, fontesOk: { catavento: true } });
  assert.equal(d.novos.length, 1);
  estado = d.estadoNovo;

  const g2 = avaliarEstacoesCatavento([{ id: "k", nome: "EMEB Karine", chuva1h: 35 }]); // Mudou para Nível 2 (Alerta)
  d = decidirEnvio(estado, g2, { agoraMs: AGORA, fontesOk: { catavento: true } });
  assert.equal(d.agravados.length, 1);
  estado = d.estadoNovo;

  const g3 = avaliarEstacoesCatavento([{ id: "k", nome: "EMEB Karine", chuva1h: 22 }]); // Mudou de volta para Nível 1 (Atenção)
  d = decidirEnvio(estado, g3, { agoraMs: AGORA, fontesOk: { catavento: true } });
  assert.equal(d.agravados.length, 1, "mudança de faixa no Catavento gera notificação");
});

test("Fogo em Cajamar: filtra focos no território de Cajamar e avisa no Telegram quando surgem novos focos", () => {
  const csvInpeDiario = [
    "id,lat,lon,data_hora_gmt,satelite,municipio,estado,pais,municipio_id,frp",
    "1,-23.3510,-46.8720,2026-11-16 17:30:00,NPP-375,CAJAMAR,SAO PAULO,Brasil,3509205,18.5",
    "2,-22.9000,-47.0600,2026-11-16 17:30:00,NPP-375,CAMPINAS,SAO PAULO,Brasil,3509502,25.0"
  ].join("\n");
  const focos = lerCsvFocosCajamar(csvInpeDiario, AGORA);
  assert.equal(focos.length, 1);
  assert.equal(focos[0].municipio, "CAJAMAR");
  assert.equal(focos[0].satelite, "NPP-375");

  let estado = { alertas: {} };
  const a1 = avaliarGatilhosAlerta({ focosRecentes: focos });
  assert.equal(a1.length, 1);
  assert.match(a1[0].titulo, /FOCO\(S\) DE CALOR EM CAJAMAR \(1 registro/);

  let d = decidirEnvio(estado, a1, { agoraMs: AGORA, fontesOk: { fogo: true } });
  assert.equal(d.novos.length, 1);
  estado = d.estadoNovo;

  // Surge um 2º foco em Cajamar: deve disparar nova notificação!
  const focos2 = [...focos, { ...focos[0], id: "outro", lat: -23.34, lon: -46.85 }];
  const a2 = avaliarGatilhosAlerta({ focosRecentes: focos2 });
  d = decidirEnvio(estado, a2, { agoraMs: AGORA, fontesOk: { fogo: true } });
  assert.equal(d.agravados.length, 1, "novo foco adicional em Cajamar gera alerta no Telegram");
});

test("Catavento-Surya login: autentica em cajamar-meteorologia.catavento-surya.com/login e repassa cookie/token na coleta", async () => {
  const chamadas = [];
  const buscarFalso = async (url, init = {}) => {
    chamadas.push({ url, method: init.method || "GET", headers: init.headers || {} });
    if (url.endsWith("/login") && (!init.method || init.method === "GET")) {
      return { ok: true, headers: { get: (k) => (k === "set-cookie" ? "sess=abc; Path=/" : null) }, text: async () => '<input name="_token" value="csrf123">' };
    }
    if (url.endsWith("/login") && init.method === "POST") {
      return { ok: true, headers: { get: (k) => (k === "set-cookie" ? "auth=logado; Path=/" : null) }, json: async () => ({ token: "jwt999" }) };
    }
    return {
      ok: true,
      headers: { get: () => null },
      text: async () => JSON.stringify({ estacoes: [{ sn: "1", alias: "EMEB Karine", chuva1h: 12, temperature_c: 24 }] })
    };
  };
  const res = await coletarCatavento({ buscar: buscarFalso, usuario: "defesacivil", senha: "123" });
  assert.equal(res.autenticado, true);
  assert.equal(res.estacoes.length, 1);
  assert.equal(res.estacoes[0].nome, "EMEB Karine");
  const reqPainel = chamadas.find((c) => c.url.startsWith("https://cajamar-meteorologia.catavento-surya.com/") && !c.url.endsWith("/login"));
  assert.ok(reqPainel);
  assert.match(reqPainel.headers.Cookie, /auth=logado/);
  assert.equal(reqPainel.headers.Authorization, "Bearer jwt999");
});

test("Catavento-Surya fixture real HTML (cajamar-meteorologia.catavento-surya.com): extrai as 3 tabelas e mescla chuva + nível dos rios", async () => {
  const { readFileSync } = await import("node:fs");
  const html = readFileSync(new URL("./fixtures/catavento-cajamar.html", import.meta.url), "utf8");
  const est = lerCatavento(html);
  assert.equal(est.length, 6);

  const vilaNova = est.find((e) => e.id === "140070634");
  assert.ok(vilaNova);
  assert.equal(vilaNova.nome, "GCM - Vila Nova");
  assert.equal(vilaNova.chuva1h, 0);
  assert.equal(vilaNova.chuva24h, 22);
  assert.equal(vilaNova.temperatura, 20.6);
  assert.equal(vilaNova.umidade, 77);
  assert.equal(vilaNova.vento, 3);
  assert.equal(vilaNova.direcao, 123);
  assert.equal(vilaNova.pressao, 929);

  const jord = est.find((e) => e.id === "140070661");
  assert.ok(jord);
  assert.equal(jord.nome, "Jordanésia");
  assert.equal(jord.chuva1h, 0);
  assert.equal(jord.chuva24h, 28);
  assert.equal(jord.nivelRio, 0.44);
  assert.equal(jord.statusRio, "normal");

  const natura = est.find((e) => e.id === "140070580");
  assert.ok(natura);
  assert.equal(natura.chuva24h, 17);
  assert.equal(natura.nivelRio, 3.57);
  assert.equal(natura.statusRio, "normal");

  // Ao avaliar gatilhos: Jordanésia tem 28 mm em 24h (Atenção >= 25 mm), mas Natura com statusRio="normal" não dispara falso alarme de rio
  const alertas = avaliarEstacoesCatavento(est);
  assert.ok(alertas.some((a) => a.chave === "catavento:chuva:140070661" && a.nivel === 1));
  assert.ok(!alertas.some((a) => a.chave === "catavento:nivel:140070580"), "statusRio=normal na tabela Rios evita falso positivo");
});

test("Catavento-Surya /api/cajamar/unified JSON: converte polegadas->mm e mph->km/h e mescla pluviômetro com rio", () => {
  const unifiedJson = JSON.stringify({
    lastUpdate: "2026-11-16T21:50:00.000Z",
    data: [
      {
        tipo: "estacao",
        nome: "G2- GCM - Vila Nova",
        valor_atual: 20.6,
        data_hora_atualizacao: "2026-11-16T21:50:00.000Z",
        detalhes: {
          humidity: 77,
          hourlyRainIn: 1.0,     // 25,4 mm
          dailyRainIn: 2.0,      // 50,8 mm
          windSpeedMph: 10,      // 16,1 km/h
          windDirectionDegrees: 123,
          pressureHpa: 929,
          solarRadiationWm2: 0
        }
      },
      {
        tipo: "pluviometro",
        nome: "Jordanésia",
        valor_atual: 28,
        data_hora_atualizacao: "2026-11-16T21:50:00.000Z",
        detalhes: { precip1h: 0, waterLevelM: 0.44 }
      },
      {
        tipo: "rio",
        nome: "Jordanésia",
        status: "alerta",
        valor_atual: 2.35,
        data_hora_atualizacao: "2026-11-16T21:50:00.000Z",
        detalhes: { nivelAtualCm: 235 }
      }
    ]
  });
  const est = lerCatavento(unifiedJson);
  assert.equal(est.length, 2);
  const vn = est.find((e) => e.id === "140070634");
  assert.equal(vn.temperatura, 20.6);
  assert.equal(vn.chuva1h, 25.4);
  assert.equal(vn.chuva24h, 50.8);
  assert.equal(vn.vento, 16.1);

  const jord = est.find((e) => e.id === "140070661");
  assert.equal(jord.chuva24h, 28);
  assert.equal(jord.statusRio, "alerta");
});

test("EMEB Guilhermina com status=alerta de chuva no unified JSON não gera falso Alerta Hidrológico (Cheia) e mensagem traz leitura atual e panorama", () => {
  const unifiedJson = JSON.stringify({
    data: [
      {
        tipo: "pluviometro",
        nome: "EMEB Guilhermina de C. Oliveira",
        status: "alerta",
        valor_atual: 28.4,
        data_hora_atualizacao: "20/11/2026 13:20",
        detalhes: { precip1h: 4.2 }
      },
      {
        tipo: "estacao",
        nome: "GCM - Vila Nova",
        valor_atual: 24.8,
        data_hora_atualizacao: "20/11/2026 13:20",
        detalhes: { humidity: 68, hourlyRainIn: 0, dailyRainIn: 0.5 }
      }
    ]
  });
  const est = lerCatavento(unifiedJson);
  const guilhermina = est.find((e) => /guilhermina/i.test(e.nome));
  assert.ok(guilhermina);
  assert.equal(guilhermina.statusRio, undefined, "pluviômetro escolar nunca deve receber statusRio de cheia");

  const alertas = avaliarEstacoesCatavento(est);
  assert.equal(alertas.length, 1);
  assert.equal(alertas[0].parametro, "chuva");
  assert.match(alertas[0].detalhe, /KM 43 \/ Anhanguera/);
  assert.match(alertas[0].detalhe, /Gatilho atingido/);
  assert.match(alertas[0].detalhe, /Orientação DC/);

  const msg = formatarMensagemTelegram(alertas, "20/11/2026 13:29", {
    encerrados: [{
      chave: "catavento:temp:140070634",
      titulo: "🌡️ <b>CATAVENTO-SURYA (🟡 Calor (30–36 °C)) — GCM - Vila Nova</b>",
      desde: "2026-11-20T15:00:00.000Z"
    }],
    catavento: { estacoes: est }
  });
  assert.match(msg, /Leitura atual na estação:.*24,8 °C/);
  assert.match(msg, /PANORAMA ATUAL DAS ESTAÇÕES EM CAJAMAR/);
});
