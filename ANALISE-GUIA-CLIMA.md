# Análise do manual dos 6 elementos do clima e dos limiares de chuva

Data: 10/11/2026. Objetivo: conferir o que a pesquisa entregou, apontar o que está certo, o que precisa de ajuste, o que está errado ou sem fonte e o que falta, e dizer o que o site passou a usar.

## 1. Como foi conferido

Busca na web (resultados de reportagens, sites de meteorologia e páginas da OMS e do Cemaden), cálculo à mão de fórmulas e comparação com os seus CSVs reais. Nem tudo tem fonte primária:

* **Fonte primária consultada:** OMS (escala do Índice UV). A página do INMET sobre avisos foi aberta, mas **não traz números** de severidade.
* **Fonte secundária (reportagens que citam o INMET):** critérios de chuva, vento e baixa umidade. Os números são consistentes entre várias reportagens, mas **ainda não foram conferidos na tabela oficial do INMET**.
* **Sem fonte encontrada:** as tabelas de 72 h e 168 h do segundo texto.

Cada faixa do guia mostra a sua origem na tela: `inmet` (critério divulgado do INMET), `oms`, `beaufort` ou `referência geral` (não oficial).

Legenda abaixo: ✔ certo · ⚠ precisa de ajuste · ✖ errado ou sem fonte.

## 2. Conferência elemento por elemento

### 2.1 Temperatura do ar

| Afirmação do texto | Veredito |
|---|---|
| Efeitos do frio (sangue desviado das extremidades, tremores) e do calor (suor, desidratação, insolação) | ✔ |
| Frio abaixo de 15 °C, conforto 18–24 °C, calor acima de 30 °C, atenção acima de 36 °C | ⚠ São referências gerais de conforto, **não limiares oficiais**. O conforto depende de umidade, vento e roupa. O guia usa esses cortes e preenche as lacunas (15–18 e 24–30) como "faixas de transição". |
| "Risco de hipotermia se abaixo de 0 °C" | ⚠ Hipotermia é temperatura **do corpo** abaixo de cerca de 35 °C. Pode ocorrer acima de 0 °C, principalmente com roupa molhada, vento, idosos e crianças. |
| "Estreitamento das artérias causa infarto" | ⚠ O frio aumenta o esforço do coração e a pressão; a frase é simplificada. |
| Ar quente sobe e favorece baixa pressão; ar frio desce e favorece alta pressão | ✔ (explicação simplificada, válida em escala local) |
| Calor "seca rios e favorece incêndios" | ⚠ Depende também da seca e da umidade baixa. |

Falta: sensação térmica / índice de calor (temperatura + umidade), amplitude térmica, ponto de orvalho, ondas de calor (o INMET tem critério próprio) e grupos de risco.

### 2.2 Umidade relativa do ar

| Afirmação | Veredito |
|---|---|
| Abaixo de 30% atenção, abaixo de 20% alerta, abaixo de 12% emergência | ✔ Consistente em várias fontes e com os avisos de "Baixa umidade" do INMET (30–20%, 20–12%, abaixo de 12%). A atribuição "OMS" aparece em fontes secundárias e não foi confirmada. |
| Ideal 50–60% | ⚠ As faixas citadas como ideais variam entre fontes (por exemplo 40–60%). Não há padrão oficial. |
| Acima de 80% é "próximo do ponto de condensação/chuva" | ⚠ Enganoso. Umidade alta não indica chuva; só 100% é saturação. |
| Efeitos de ar seco (garganta, olhos, sangramento nasal, asma) e de ar muito úmido (mofo, ácaros, abafamento) | ✔ |
| Vapor de água é o gás estufa mais abundante | ✔ |

Falta: relação com a temperatura (o mesmo vapor tem umidade relativa menor quando esquenta), ponto de orvalho, ligação com incêndios.

### 2.3 Pressão atmosférica

| Afirmação | Veredito |
|---|---|
| Padrão ao nível do mar 1013,25 hPa; baixa abaixo de 1008 (instabilidade); alta acima de 1020 (estabilidade) | ⚠ Regra prática **só vale ao nível do mar**. |
| **Os valores servem para Cajamar** | ✖ **Não servem diretamente.** O equipamento mede a pressão na altitude dele. Cajamar fica a cerca de 735 a 760 m (as fontes divergem), e os seus CSVs mostram **916,7 a 944,0 hPa**, que são valores normais para essa altitude. Comparar com 1008 classificaria tudo como "baixa pressão". |
| Quedas bruscas causam dor de cabeça e nas articulações | ⚠ Evidência científica limitada. |
| Pressão é o motor dos ventos; mapas de pressão ajudam a prever frentes | ✔ |

Cálculo de conferência: 930 hPa a 760 m equivale a cerca de 1018,5 hPa ao nível do mar (atmosfera padrão, aproximação), faixa "normal".
Falta: **tendência** (variação em 3 h), que costuma importar mais do que o valor, e a redução ao nível do mar.

### 2.4 Radiação solar e Índice UV

| Afirmação | Veredito |
|---|---|
| Índice UV baixo 0–2; moderado a alto 3–7; muito alto a extremo acima de 8 | ⚠ A escala da OMS é: baixo 0–2, moderado 3–5, alto 6–7, muito alto 8–10, extremo 11 ou mais. O texto juntou faixas. |
| "Queima a pele em menos de 15 minutos" | ⚠ Depende do tipo de pele e do horário; não consta na tabela da OMS. |
| O texto trata radiação solar e UV como a mesma coisa | ⚠ São diferentes: W/m² mede a energia total do Sol, e o índice UV mede só a parte que queima. |
| Falta de sol e vitamina D; excesso e câncer de pele; albedo | ✔ |

Dado dos seus CSVs: máximos de radiação de até **1410 W/m²**. A energia no topo da atmosfera é cerca de 1361 W/m². Acima disso só ocorre por instantes, com reflexo de nuvens, ou indica erro de sensor. O guia sinaliza esse caso.
Não existem limiares oficiais de W/m² para risco à saúde. O guia só descreve o valor e manda consultar o índice UV.

### 2.5 Velocidade do vento

| Afirmação | Veredito |
|---|---|
| Baixa abaixo de 20 km/h; moderada 20–50; alta acima de 60 | ⚠ Ficou uma lacuna de 50 a 60 km/h, e a escala de Beaufort tem 13 forças. O guia usa a tabela completa (limites aproximados). |
| Acima de 118 km/h é furacão | ✔ |
| **"10 °C com vento de 40 km/h faz sentir cerca de 2 °C"** | ✖ Pela fórmula canadense/NWS de sensação térmica pelo vento a conta dá **cerca de 6 °C** (13,12 + 0,6215·10 − 11,37·40^0,16 + 0,3965·10·40^0,16 = 5,97). A fórmula só vale até 10 °C e com vento acima de 4,8 km/h. |
| Vento zero acumula poluição e aumenta o calor local | ✔ |
| Vento distribui calor e umidade; energia eólica | ✔ |

Reportagens que citam o INMET: vendaval em 40–60 km/h é amarelo, 60–100 km/h é laranja e mais de 100 km/h é vermelho. **O INMET trabalha com rajadas**, e o seu CSV registra a velocidade do vento, não necessariamente a rajada.
Falta: rajada, e a relação vento-incêndio.

### 2.6 Direção do vento

| Afirmação | Veredito |
|---|---|
| A direção é de onde o vento vem | ✔ |
| Quadrante sul/sudoeste traz frentes frias; norte/noroeste, ar quente do interior | ✔ Regra geral para o Sudeste; não substitui a previsão. |
| Mudança de norte para sul pode derrubar a temperatura em mais de 10 °C em poucas horas | ⚠ Pode acontecer com frentes fortes, mas não é regra. |
| Aviões decolam e pousam contra o vento; a direção leva a fumaça | ✔ |
| Mudança de longo prazo na direção indica alteração de correntes e chuvas | ✔ (em escala climática) |

Falta: rosa dos ventos de 16 pontos, média circular (não se faz média simples de ângulos: 350° e 10° não dão 180°), brisas de vale e montanha em Cajamar.

## 3. Os limiares de chuva do segundo texto

| Trecho | Veredito |
|---|---|
| INMET 1 h: amarelo 20–30 mm/h, laranja 30–60, vermelho acima de 60 | ✔ Consistente em várias reportagens que citam o INMET. A tabela oficial do INMET não foi aberta; recomenda-se conferir antes de usar em aviso formal. |
| INMET 24 h: amarelo até 50 mm/dia, laranja 50–100, vermelho acima de 100 | ✔ Mesma ressalva. Os avisos do INMET combinam chuva e vento no mesmo nível. |
| "Escala geral de intensidade" (fraca, moderada, forte) por hora e por dia | ⚠ Essas escalas variam por fonte e não são um padrão único. O texto mistura duas definições de "chuva forte" (20–60 mm/h e 25–50 mm/dia). Não usei como classificação. |
| **Tabela de 72 h (80, 120, 200 mm) atribuída à Defesa Civil/Cemaden** | ✖ **Sem fonte.** O Cemaden usa limiares **por município** (exemplos citados pelo próprio órgão: cerca de 100 mm em 72 h para Campos do Jordão e cerca de 60 mm em outras regiões). Não há um número único nacional. |
| **Tabela de 168 h (120, 180, 250 mm)** | ✖ **Sem fonte.** Além disso diverge do indicador referencial do site (50, 100, 150 e 210 mm em 168 h; Pinheiro et al., 2005 e AlertaRio, 2013, feitos para o Rio de Janeiro). |
| "Acumulado crítico equivale à média de um mês inteiro" | ✖ Sem comprovação; depende da climatologia local. |

Por regra do projeto (não inventar limiar nem homologação para Cajamar), **as tabelas de 72 h e 168 h não foram usadas**. O guia mostra apenas 1 h e 24 h, com a fonte "critério do INMET", e avisa que o aviso oficial só vale quando o INMET o emite.

## 4. O que falta no manual

1. **Sensação térmica e índice de calor** (temperatura com umidade e com vento).
2. **Ponto de orvalho**, que liga temperatura, umidade e neblina.
3. **Rajadas de vento** (base dos avisos do INMET).
4. **Tendência da pressão** (variação em 3 h) e redução ao nível do mar.
5. **Visibilidade, cobertura de nuvens, raios e granizo.**
6. **Qualidade do ar** (o painel já mostra o índice).
7. **Grupos de risco** (idosos, crianças, doentes crônicos, pessoas em situação de rua) e **fontes oficiais** (INMET, Cemaden, Defesa Civil).
8. **Limiares do próprio município** de Cajamar, que só a Defesa Civil e o Cemaden podem fornecer.

## 5. O que o site passou a ter

Nova página **"Guia de valores"** (`guia.html`), no menu de todas as páginas:

* Oito cartões: temperatura, umidade, pressão, índice UV, radiação solar, velocidade do vento, direção do vento e chuva (1 h e 24 h).
* Você digita o valor e vê: **faixa**, **o que significa**, **o que fazer** e **a fonte da faixa**.
* Pressão pede a altitude do equipamento e converte para o nível do mar antes de classificar. Sem altitude, ela não classifica e explica por quê.
* Vento calcula a sensação térmica pelo vento quando a temperatura é de 10 °C ou menos. Direção mostra o ponto cardeal de onde o vento vem.
* Botão "Preencher com a última leitura do painel" (temperatura, umidade e vento do modelo Open-Meteo guardado no aparelho, identificado como modelo).
* Botão "Copiar texto para publicação" em cada resultado.
* Valor ausente ou inválido nunca vira zero. Todo texto traz o aviso de que é orientação geral e não aviso oficial.
* Os textos e faixas ficam em `js/guia-dados.js`, para a Defesa Civil revisar e ajustar em um só lugar.

## 6. Uso nas publicações

**Pode fazer parte da publicação como orientação**, com estas condições:

1. Os textos de procedimento são orientações gerais de saúde e proteção civil. A Defesa Civil de Cajamar deve **revisar e aprovar** antes de circular.
2. A faixa deve aparecer com a fonte. Só chamar de "alerta" ou "aviso" o que for emitido pelo INMET ou pela Defesa Civil.
3. Hoje o caminho é: preencher o valor no guia, copiar o texto e colar em "Gerar publicação". Um passo seguinte, se aprovado, é um seletor dentro de "Gerar publicação" que insira as linhas de orientação direto no panfleto.

## 7. Pendências e o que depende de você

* Conferir os critérios do INMET na **tabela oficial** (chuva, vento, baixa umidade) antes de usá-los em material formal.
* Pedir à Defesa Civil e ao Cemaden os **limiares de chuva de 72 h e 7 dias para Cajamar**.
* **Revisão dos textos** de procedimento pela Defesa Civil.
* Informar a **altitude de cada equipamento** para a pressão.
* Verificar o sensor de radiação dos equipamentos que registraram acima de 1361 W/m².
* Confirmar a atribuição da escala de umidade (INMET ou OMS) em documento oficial.

## 8. Fontes consultadas

* OMS, Índice UV: [Ultraviolet radiation](https://who.int/news-room/fact-sheets/detail/ultraviolet-radiation) e [tabela de proteção](https://www.who.int/publications/m/item/the-uv-index-sun-protection-table)
* INMET, página de avisos (sem números): [Aviso meteorológico ou alerta?](https://portal.inmet.gov.br/noticias/aviso-meteorológico-e-alerta-entenda-a-diferença)
* Critérios do INMET divulgados pela imprensa: [CNN Brasil](https://www.cnnbrasil.com.br/nacional/chuva-entenda-os-alertas-do-inmet-para-temporais/), [O Povo](https://www.opovo.com.br/noticias/brasil/2024/01/22/inmet-emite-avisos-de-perigo-devido-a-chuvas-intensas.html)
* Baixa umidade (reportagens): [Itatiaia](https://www.itatiaia.com.br/brasil/sudeste/mg/perigo-veja-a-lista-de-cidades-em-mg-onde-a-umidade-pode-chegar-a-12/)
* Escala de Beaufort: [Observatório de Hong Kong](https://www.hko.gov.hk/en/education/weather/meteorology-basics/00112-beaufort-wind-scale.html)
* Limiares do Cemaden: [JICA/Cemaden, volume 2](https://www.jica.go.jp/brazil/portuguese/office/publications/c8h0vm000001w9k8-att/volume2.pdf)
* Altitude de Cajamar: [Wikipedia](https://en.wikipedia.org/wiki/Cajamar,_S%C3%A3o_Paulo) (cita o IBGE; fontes variam entre 734 e 760 m)
