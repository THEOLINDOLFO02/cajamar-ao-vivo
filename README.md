# Cajamar ao Vivo — Defesa Civil de Cajamar/SP

Projeto pessoal (uso individual, por diversão e aprendizado) de acompanhamento para a Defesa Civil de Cajamar (IBGE 3509205): previsão, chuva, alertas, radar e quadro de ocorrências da equipe. Funciona no celular, sem servidor pago, e pode ser hospedado de graça (GitHub Pages).

> **Aviso importante:** previsão, avisos e radar mostrados aqui são **auxiliares** e **não substituem** os avisos oficiais do INMET, do CEMADEN e da Defesa Civil estadual/nacional. Sempre confirme na fonte oficial antes de decidir.

## O que existe hoje

| Página | O que faz |
|---|---|
| `index.html` | Painel: tempo atual com sensação e rajadas de vento, chuva prevista (24 h e 7 dias), avisos do INMET para Cajamar (com as áreas desenhadas no mapa), chuva observada dos pluviômetros do CEMADEN (sem classificação de risco) e radar. Mostra o estado e a hora da última atualização de **cada fonte**. |
| `quadro.html` | Quadro de ocorrências pessoal (6 categorias). Permite registrar e editar ocorrências, buscar por bairro/texto, copiar resumo formatado para o WhatsApp da equipe e exportar/importar backup em `.json`. Sem login, sem banco externo, sem dados de moradores. |
| `observacoes.html` | Registro **manual** de chuva (mm, período, intensidade visual) e vento (km/h, direção, intensidade visual), para leituras feitas à mão enquanto não há registro automático. Editar, apagar, exportar JSON e planilha CSV, importar. Avisa se o texto parecer ter telefone ou CPF. Os campos são um ponto de partida: não são um modelo oficial. |
| `historico.html` | Histórico da estação meteorológica de Cajamar: você importa o CSV baixado da plataforma (lido só no navegador) e vê chuva por dia, maiores chuvas em 1 h e 10 min, temperatura, vento e tabela dia a dia. Reimportar não duplica dias. O CSV não faz parte do repositório. |
| `publicar.html` | Gera imagem nos formatos Stories (9:16) ou Feed (1:1 e 4:5) e legenda para redes sociais (com compartilhamento nativo para Instagram/WhatsApp), a partir de avisos e previsão oficiais do INMET, da chuva medida pela estação ou dicas de prevenção. Bloqueia a geração quando não há dado novo. |
| `comparar.html` | Compara a chuva medida pela estação com a previsão do Open-Meteo feita 1 dia antes (acerto de chuva/não chuva, erro médio, soma). |

### Como o painel trata falhas

- Cada fonte é consultada separadamente: se uma cair, as outras continuam.
- Se uma consulta falha, o painel tenta de novo uma vez e, se continuar falhando, mostra o último dado bom **com aviso de que é antigo e a hora em que foi coletado**.
- Os avisos vêm da API oficial do INMET; se ela falhar, usa-se um repassador de terceiros como reserva e a tela diz qual fonte foi usada.
- Falha ao consultar alertas **nunca** é mostrada como "sem alerta".
- O radar não reaproveita quadro antigo (poderia enganar).

## Rodar no computador

Basta servir a pasta por HTTP (não abrir o arquivo direto), por exemplo:

```
npx serve .
```

## Fontes de dados

| Fonte | Uso | Observação |
|---|---|---|
| [Open-Meteo](https://open-meteo.com/) | tempo atual e previsão | modelo, não é medição |
| [INMET – previsão](https://apiprevmet3.inmet.gov.br/previsao/3509205) | previsão oficial por município (manhã/tarde/noite nos 2 primeiros dias, depois resumo diário) | |
| [INMET – avisos ativos](https://apiprevmet3.inmet.gov.br/avisos/ativos) | avisos oficiais para Cajamar (fonte principal) | filtrado pelo código IBGE 3509205 |
| [radarmeteorologico.com.br](https://radarmeteorologico.com.br/api-publica) | reserva dos avisos, só se a API oficial falhar | terceiro; não é oficial |
| [RainViewer](https://www.rainviewer.com/api.html) | radar | uso pessoal (gratuito): zoom máx. 7, apenas dados passados. Se o site ficar público e muito acessado, confira os termos do RainViewer |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) / [Leaflet](https://leafletjs.com) | mapa | |
| [CEMADEN](https://www.cemaden.gov.br/) (pluviômetros) | chuva observada em Cajamar e região (1 h a 72 h) | coletado por um robô do GitHub Actions (agendado a cada 10 min, mas na prática roda a cada 2–5 h), porque o navegador não consegue ler o CEMADEN direto |
| [Open-Meteo Previous Runs](https://open-meteo.com/en/docs/previous-runs-api) | previsão feita 1 dia antes, para a página de comparação | |

SAISP e Chuva Online (IAG/USP) não têm API de dados: ficam como links.

## Créditos dos repositórios de referência

- clima-agora-api, de Kel Baker — licença MIT. Origem da ideia de combinar Open-Meteo + alertas INMET filtrados por código IBGE.
- rainviewer-api-example — exemplo oficial do RainViewer, usado como referência de como animar os quadros do radar. Sem licença explícita: nenhum código foi copiado.
- dados_metereologicos_brasil — pipeline de dados históricos do INMET; estudado como referência do formato dos arquivos, sem uso de código. Sem licença explícita.

## Licença

[MIT](LICENSE) © 2026 Theobaldo, Defesa Civil de Cajamar/SP.

## Sobre os dados do quadro

Tudo fica no `localStorage` do navegador onde você registrou: não há servidor e nada é enviado pela internet. Consequências: cada aparelho tem a sua própria lista, e limpar os dados do navegador apaga os registros. Use **Exportar backup** de vez em quando e **Importar backup** para levar os registros a outro aparelho. Não registre nomes, telefones ou documentos de moradores.

## Publicações para o Instagram

- A página `publicar.html` só **gera rascunhos**: imagem PNG e texto da legenda. A publicação é manual.
- Avisos e previsão só são gerados com dado **recém-coletado** do INMET (nunca com dado guardado/antigo) e a imagem mostra a fonte e a hora da geração.
- As **dicas de prevenção** são textos gerais escritos como ponto de partida: revise e ajuste conforme o protocolo da sua Defesa Civil antes de publicar. Os telefones 199 (Defesa Civil) e 193 (Bombeiros) são os nacionais; o contato local é opcional e preenchido por você.
- O brasão e o logo em `assets/` foram incluídos com a confirmação do responsável pela página de que há autorização de uso; ao reutilizar o projeto, confirme os direitos desses símbolos.
- Para baixar a imagem é preciso abrir a página por http(s) (por exemplo, GitHub Pages ou `npx serve .`), não direto do arquivo.

## Chuva observada do CEMADEN (robô)

- O arquivo `scripts/coletar-cemaden.mjs` baixa as estações do CEMADEN para Cajamar e região e grava `data/cemaden.json`. Esse arquivo **não fica no repositório**: o workflow `.github/workflows/publicar.yml` está agendado para cada 10 min, mas o GitHub atrasa agendamentos de repositórios com pouca atividade (medimos intervalos de 2 a 5 horas); ele coleta e publica o site já com o arquivo novo.
- Se uma coleta agendada falhar, o job falha e o site anterior (com a última coleta boa) continua no ar; a tela mostra a hora da coleta.
- Os horários das leituras são os **informados pelo CEMADEN**; o fuso não está documentado e os valores mais recentes aparecem à frente do relógio local. Por isso o painel mostra a defasagem de cada estação em relação à leitura mais recente da rede, e não compara com a hora do seu aparelho.
- “sem dado” é ausência de valor (nunca zero). Muitas estações, inclusive em Cajamar, ficam paradas por meses.
- Repositórios públicos têm as execuções agendadas desativadas pelo GitHub após 60 dias sem atividade: se isso acontecer, ative o workflow de novo na aba Actions.

## Publicação (GitHub Pages)

O site é publicado pelo próprio workflow (Settings → Pages → Source: GitHub Actions). O endereço fica em https://NOME-DE-USUARIO.github.io/NOME-DO-REPOSITORIO/.

## Sobre níveis de risco (PPDC)

O painel **não classifica risco** de chuva (observação/atenção/alerta). Os limites do Plano Preventivo de Defesa Civil (PPDC) são definidos por município, e Cajamar ainda não tem limites próprios para chuva acumulada. Os números do CEMADEN e da estação são apenas repassados. Se o município adotar critérios oficiais, eles podem ser configurados aqui com a fonte citada.

## Aplicativo instalável (PWA) e cache

O site pode ser instalado no celular. O cache (`sw.js`) guarda só os arquivos do próprio site; os dados meteorológicos nunca vêm do cache do aplicativo, para que o aviso de "dado antigo" continue verdadeiro. Ao mudar a lista de arquivos, aumente `CACHE_NAME` em `sw.js`.

## Mapa: áreas dos avisos do INMET

O mapa do painel desenha a área de cada aviso ativo do INMET: contorno cheio para os que **incluem Cajamar** e tracejado cinza para avisos **próximos** que não incluem. Ligue ou desligue em "Camadas". As áreas só aparecem com dado novo da fonte oficial (nunca de cópia guardada).

## Resumo semanal da chuva

Em `publicar.html`, o tipo "Resumo semanal da chuva (estação)" gera a imagem com gráfico de barras dos últimos 7 dias. Só aparecem semanas com os **7 dias completos** no histórico importado.

## Testes automáticos

```
npm test
```

Não precisa instalar nada (usa o executor de testes do próprio Node, versão 22 ou mais nova). Os testes cobrem a leitura dos avisos e da previsão do INMET, a montagem dos dados do CEMADEN, a leitura do CSV da estação e a integridade do site (sintaxe dos scripts, arquivos referenciados, menu, cache do aplicativo). Os dados de teste são fictícios. No GitHub, o publicador roda os testes antes de cada publicação: se um falhar, o site **não** é atualizado e a versão anterior continua no ar.

## Interface e acessibilidade

- **Resumo "Situação agora"** no topo do painel: mostra os avisos oficiais do INMET para Cajamar, o tempo atual e a saúde das fontes. Nunca afirma que está tudo bem: sem aviso listado, diz "nenhum aviso listado" e lembra que isso não garante ausência de risco; se a consulta falhar, diz que não foi possível verificar.
- **Menu fixo** no topo (com a página atual destacada), atalhos por seção no painel, itens técnicos recolhidos (estado das fontes, backup) e esqueleto de carregamento.
- **Tema** automático (segue o aparelho), claro ou escuro, pelo botão ◐ no cabeçalho; a escolha fica salva no aparelho.
- **Celular primeiro:** sem rolagem horizontal em telas de 390 px, botões e campos com pelo menos 40 a 44 px de altura, texto de 16 px nos campos (evita o zoom automático do iPhone).
- **Acessibilidade:** atalho "Pular para o conteúdo", foco visível em tudo que se clica, contraste mínimo de 4,5:1 nos dois temas (conferido), respeita "reduzir movimento" e avisa quando o aparelho está sem internet.
- O estilo fica todo em `css/estilo.css` (cores da Defesa Civil de Cajamar como variáveis no topo do arquivo).
