# Auditoria dos cálculos meteorológicos, pluviométricos, hidrológicos e ambientais

Base auditada: branch `main` no commit `f182c7b` (193 testes verdes antes desta auditoria). As linhas citadas nos achados são as desse commit.
Correções: branch `auditoria-calculos` (sem commit/push/deploy). Este documento NÃO afirma nada sobre homologação: nenhum limiar foi criado ou alterado.

## 1. Inventário e mapa do fluxo

| Fonte | Endpoint efetivo | Módulos | Observado / previsto / estimado |
|---|---|---|---|
| Open-Meteo forecast | `api.open-meteo.com/v1/forecast` (`current`, `hourly`, `daily`, `past_days=7`, `timezone=America/Sao_Paulo`) | `painel-clima.js`, `publicar.js`, `modelos.js` (multi-modelo), `deslizamento.js` | **modelo numérico**: passado recente = estimativa de modelo, futuro = previsão. Nunca medição. |
| Open-Meteo air-quality | `air-quality-api.open-meteo.com` | `ar.js` | estimativa CAMS |
| Open-Meteo archive (ERA5) | `archive-api.open-meteo.com` | `climatologia.js` | reanálise |
| Open-Meteo previous-runs / historical-forecast | `previous-runs-api…`, `historical-forecast-api…` | `comparar.js` | previsão antiga × estação |
| INMET | `apiprevmet3.inmet.gov.br/avisos/ativos` e `/previsao/3509205` | `inmet.js`, `painel-clima.js`, `publicar.js`, `resumo.js` | aviso/previsão oficiais (repasse) |
| CEMADEN | `resources.cemaden.gov.br/.../getJson2.php?uf=SP` via Worker e robô | `worker/cemaden-proxy.js`, `scripts/coletar-cemaden.mjs`, `cemaden.js` | observado (pluviômetros), repassado sem recálculo |
| INPE BDQueimadas | `dataserver-coids.inpe.br/.../diario/Brasil/` e `/10min/` | `queimadas.js`, `painel-fogo.js`, `publicar.js` | detecção por satélite |
| NASA GIBS / RainViewer | tiles WMTS/WMS e `weather-maps.json` | `painel-mapa.js` | imagem (sem cálculo; só rótulo de horário) |
| Windy | Worker `/windy` | `worker/cemaden-proxy.js`, `windy.js` | previsão GFS |
| Estações locais / régua | CSV do usuário → `localStorage` | `estacao.js`, `historico.js`, `comparar.js`, `publicar.js` | **observado (local)** |
| Observações manuais | formulário | `observacoes.js` | observado (humano) |

Fluxo: **fonte → `Fontes.consultar` (cache validado, timeout, 2 tentativas) → JSON bruto → validação de formato (`validar*`) → normalização (`SerieOM`, `Inmet`, `Publicacao`, `Estacao.resumir`) → armazenamento (`localStorage` / `data/cemaden.json`) → cálculo (`Deslizamento`, `Queimadas.calcularRiscoFogoLocal`, `Estacao.janelasDoDia`, `Modelos`, `Climatologia`) → classificação (indicadores referenciais, não oficiais) → interface (`index/historico/publicar/comparar`) → publicação (canvas/legenda).**

## 2. Fatos verificados nas fontes (evidência)

* **Open-Meteo, documentação oficial (open-meteo.com/en/docs, consultada em 30/10/2026):** `precipitation` horária = "soma da hora **anterior**"; `wind_gusts_10m` horária = máximo da hora anterior; `current` é baseado em dados de 15 min e `precipitation` em `current` é a soma do `interval` (segundos) anterior.
* **Resposta real (30/10/2026 13:00 BRT):** `current.interval = 900`, `current.precipitation = 0,1 mm` (= 15 min, não 1 h); `daily.precipitation_sum` de 29/10 = **17,6** = soma dos valores horários rotulados em 29/10 (00:00…23:00) = 17,6 ⇒ o "dia" do Open-Meteo cobre 23:00 do dia anterior a 23:00 do dia (deslocado 1 h do dia civil da estação).
* **CEMADEN, feed real coletado às 16:03 UTC (30/10/2026):** Ponunduva (Cajamar) = `30/10/26 16:00` (3 min antes ⇒ horário coerente com **UTC**), mas várias estações da rede = `30/10/26 16:40 … 17:00` (**até 57 min à frente** do relógio da coleta). O `data/cemaden.json` publicado trazia `referenciaRede = 16:20` com coleta às 15:18 UTC.
* **Windy (código):** K→°C (−273,15), `past3hprecip` m→mm (×1000), m/s→km/h (×3,6), direção `(270 − atan2(v,u)·180/π) mod 360` — **corretos** (testes existentes confirmam).

## 3. Auditoria matemática por variável (resumo)

| Variável | Resultado |
|---|---|
| Precipitação — janelas do histórico (`estacao.js`) | **Correto** (auditado na etapa anterior e re-testado de forma independente aqui): dia civil ≠ 24 h móvel ≠ 168 h móvel; cobertura horária e lacunas. |
| Precipitação — `deslizamento.extrairDeSerieHoraria` | **Correto**: 24 h = índices `i-23…i`, 168 h = `i-167…i`, projeção = `i+1…i+24` (coerente com a convenção "hora anterior"). |
| Precipitação — `painel-clima.js`, `modelos.js`, `comparar.js` | **Erros** A-01…A-06, A-09 (abaixo). |
| Temperatura / umidade / vento / pressão | Sem conversão de unidade no código (km/h, °C, %, hPa vêm prontos; `wind_speed_kmh`, `pressure_hpa` lidos das colunas certas). **Não havia verificação de plausibilidade física** (A-16, corrigido). Conversão °F, nós e mbar: **inexistente** (nada a auditar). |
| UV / AQI (`ar.js`) | Faixas AQI (EPA) corretas; faixas UV (OMS) corretas **mas aplicadas a valor não arredondado** (A-07). |
| Fogo (`queimadas.js`) | Fórmula de Angström clássica **correta** (U/20 + (27−T)/10), porém o valor exibido recebe **ajustes locais sem fonte** (A-12). Regra dos 30 usa `max(vento, rajada)` (A-12). |
| Deslizamento | Fórmulas = comparações com faixas referenciais (Pinheiro 2005 / AlertaRio 2013, calibradas para o Rio); **sem validade comprovada para Cajamar**; já rotuladas como não oficiais. |
| Rio | Unidade metros; Δ = máx − mín do dia; cotas padrão sem fonte (não classificam); já tratado na auditoria anterior. |

## 4. Achados

Legenda: P0 enganoso/decisão insegura · P1 erro relevante · P2 moderado · P3 melhoria. "Corrigido" = nesta branch.

| ID | Sev. | Arquivo / função (linhas) | Evidência e consequência | Estado |
|---|---|---|---|---|
| A-01 | P1 | `painel-clima.js` `clima()` L82 | `chuva24h = precipitation(current) + soma24 × 0,25`: mistura 15 min do modelo com **25 % da previsão das próximas 24 h** (fator inventado) e usa 0 se faltar. Alimenta o "risco de fogo" do painel (pode dar "Baixo" por chuva fictícia). Esperado: acumulado das **últimas 24 h** (estimativa do modelo, 24 valores completos) ou `null` ⇒ indicador não calculado. | Corrigido |
| A-02 | P1 | `painel-clima.js` L57, L91 | `Math.max(0, indexOf(...))`: se a hora/dia atual não existe na série, usa o índice 0 (início da série = 7 dias atrás) e rotula como "próximas 24 h"/"hoje". | Corrigido |
| A-03 | P1 | `painel-clima.js` L59–L71 | Hora sem dado vira 0 (`: 0`) nas barras e em "Total previsto em 24 h". | Corrigido |
| A-04 | P1 | `painel-clima.js` L46; `resumo.js` L66 | "Chuva (hora atual)"/"mm de chuva na hora" mostra `current.precipitation`, que é a soma de **15 min** (`interval=900`). Subestima 4× se lido como hora. | Corrigido (rótulo com o intervalo informado) |
| A-05 | P2 | `painel-clima.js` L57–71; `modelos.js` L34–37 | Janela "próximas 24 h" começava no valor da hora atual (que é a hora **anterior**): cobria [T−1 h, T+23 h] em vez de (T, T+24 h]. Os dois cartões do painel divergiam entre si. | Corrigido |
| A-06 | P1 | `modelos.js` L34; `ar.js` L38 | Mesmo fallback para índice 0. | Corrigido |
| A-07 | P2 | `ar.js` `classificarUv` L33 | UV 2,6 ⇒ "Baixo" no painel e "3 (Moderado)" no `publicar.js` (que arredonda). Escala OMS é de índice inteiro. | Corrigido |
| A-08 | P1 | `resumo.js` L55, L63 | Sem aviso **e dado antigo** ⇒ banner `normal` (verde). `agora.antigo` ignorado: medidas de cache aparecem como "agora". | Corrigido |
| A-09 | P1 | `comparar.js` L349, L356, L303–375 | (a) coluna ECMWF cai para `best_match` sem avisar (atribuição errada de fonte); (b) soma `previous_day1` sem exigir 24 horas; (c) `chuva` nula somada como 0; (d) "dia completo" = `n ≥ 1296` (contagem fixa de leituras, diferente do histórico); (e) `catch (eMod) {}` silencioso. | Corrigido (a–e) |
| A-10 | P2 | `climatologia.js` L86, L108 | `n ≥ 1296` e "ontem" calculado com o fuso do aparelho. | Corrigido |
| A-11 | P1 | `worker/cemaden-proxy.js` `montar` L55–57 | "Referência da rede" = **maior** horário, incluindo estações com relógio **à frente** (feed real: até +57 min). `minutosAntes` de todas as estações fica distorcido e a UI mostra "leitura mais recente da rede" no futuro. | Corrigido (ver 5) |
| A-12 | P1/P2 | `queimadas.js` L244–251 | Índice "Angström" exibido inclui +1,5/+0,6 por chuva e −0,5 por vento, e `vRef = max(vento, 0,75·rajada)`: **não fazem parte do índice clássico** nem têm fonte documentada; classes (1,5/2,2/2,8; chuva ≥ 10 mm) são regra local. Regra dos 30 usa a maior entre vento e rajada. | Parcial: rotulado (`adaptado`, `angstromPuro`, aviso) — **limiares não alterados** (sem fonte) |
| A-13 | P1 | `painel-fogo.js` L54, L80; `publicar.js` `resumoFocos` | Notificação "Foco em Cajamar" também com cache antigo; texto "Nenhum foco" com consulta **parcial**; card de publicação contava focos de ~48 h como situação atual. | Corrigido (janela de 24 h explícita, parcial sinalizada, sem notificar cache) |
| A-14 | P2 | `queimadas.js` L188 | `emCajamar` inclui foco a ≤ 8 km do centro (pode ser município vizinho). | Pendência documentada (regra de negócio) |
| A-15 | P2 | `painel-base.js` L8–10; `resumo.js` L9; `cemaden.js` L7; `painel-mapa.js` L208; `climatologia.js` L108 | Horários formatados no fuso do aparelho, não em America/Sao_Paulo. | Corrigido |
| A-16 | P2 | `estacao.js` `lerCsv` | Nenhuma checagem de faixa física (UR 150 %, 300 °C, 101300 "hPa"…). | Corrigido (limites físicos absolutos, valor vira ausente e é contado em `foraFaixa`) |
| A-17 | P3 | `worker/cemaden-proxy.js` L139 | Byte NUL cru no código-fonte (git/ferramentas tratam como binário). | Corrigido (`"\u0000"`) |
| A-18 | P3 | `worker/cemaden-proxy.js` L95 | `Math.max(0, c)` esconde chuva negativa (inválida) da Windy. | Pendência |
| A-19 | P2 | CEMADEN | Horários sem fuso; UTC é **hipótese sustentada por evidência**, não confirmada pela fonte. | Documentado; `fusoConfirmado` no JSON |
| A-20 | P2 | `comparar.js`, Open-Meteo `daily` | Dia do Open-Meteo deslocado 1 h do dia civil da estação (verificado: 17,6 = 17,6). Comparação "previsto × medido" tem essa defasagem. | Pendência documentada |
| A-21 | P2 | `estacao.js` (`BRT_MS` fixo −3 h) | Arquivos anteriores a 2019 (horário de verão) com `data_hora_brt` em −2 h seriam descartados por "timestamp não corresponde" (não somados errado). | Pendência documentada |
| A-22 | P3 | `inmet.js`/`publicacao.js` `avisoExpirado` | Assume `fim` do aviso em horário de Brasília; fuso não documentado no repositório. | Pendência |
| A-23 | P3 | `queimadas.js` `num()` | `parseFloat` aceita "12abc". | Pendência |

Nenhum achado P0 foi confirmado: os piores casos (A-01, A-08, A-11, A-13) induziam leitura enganosa, mas nenhum gera por si decisão automática.

## 5. Correções implementadas (resumo técnico)

* **`js/serie-om.js` (novo, puro):** `indiceHora` (sem fallback), `somaHoras/acumuladoAte/previstoDepois` (janela só com todas as horas numéricas), `intervaloCurrentMin`.
* **`painel-clima.js`:** rótulo com o intervalo de `current`; barras/total das próximas 24 h = valores **depois** da hora atual; ausente aparece "—"; sem hora/dia atual ⇒ mensagem, não índice 0; `chuva24h` do fogo = acumulado das últimas 24 h do modelo ou `null`.
* **`modelos.js`, `ar.js`:** sem índice 0; janela deslocada; UV por inteiro.
* **`resumo.js`:** dado antigo não é "normal"; medidas antigas ocultas; rótulo do intervalo.
* **`comparar.js`, `climatologia.js`:** dia completo = `Estacao.diaCompleto`; ECMWF sem substituição; 24 horas exigidas; sem soma de nulo; aviso no console.
* **`worker/cemaden-proxy.js`:** referência da rede ignora leituras > 10 min à frente da coleta quando o fuso UTC é coerente com a rede (`fusoConfirmado`), marca `leituraFutura` e `leiturasFuturas`; `cemaden.js` mostra os avisos.
* **`queimadas.js`:** `angstromPuro`, `adaptado`, `aviso`; `contarFocos(…, 24 h)`; `painel-fogo.js` e `publicar.js` usam a janela e tratam consulta parcial.
* **`estacao.js`:** limites físicos absolutos (`LIMITES_FISICOS`), `foraFaixa` por dia (e no backup).
* **Fusos:** `timeZone: "America/Sao_Paulo"` nos formatadores do painel, resumo, CEMADEN, radar e climatologia.

## 6. Pendências e limitações (não resolvidas por falta de fonte verificável)

* Validade dos limiares de deslizamento (Pinheiro/AlertaRio) e das cotas do rio para Cajamar; pesos de chuva/vento no índice de fogo; classes de fogo.
* Confirmar com o CEMADEN o fuso de `datahoraUltimovalor` e a causa dos relógios adiantados.
* **O Worker do Cloudflare precisa de novo deploy manual** (`worker/cemaden-proxy.js`) para a correção A-11 valer no tempo quase real; o robô do GitHub Pages usa o mesmo arquivo e passa a gerar `data/cemaden.json` corrigido quando a branch for publicada.
* A-14, A-18, A-20…A-23 (acima).
* `comparar.js`: definição de "dia" do Open-Meteo (−1 h) não corrigida.
