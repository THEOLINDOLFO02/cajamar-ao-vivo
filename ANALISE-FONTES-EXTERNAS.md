# Fontes externas avaliadas (13/11/2026)

| Fonte | Resultado | Decisão |
|---|---|---|
| INMET RSS (`apiprevmet3.inmet.gov.br/avisos/rss`) | Responde (200). Traz os mesmos avisos já lidos de `avisos/ativos`, sem a geometria usada no mapa. Não tem CORS liberado. | Não usado: não acrescenta nada. O painel já mostra os avisos. |
| `avisos.inmet.gov.br/56392` e home | Página de mapa de um aviso. | Só link (aba "Outras fontes"). |
| CGE São Paulo, posto **Santana de Parnaíba** (1000880) | Existe. Página HTML pública, sem API, sem CORS, **sem hora da medição**. | Raspagem pelo Worker (rota `/cge`, só 3 postos autorizados). A tela avisa que o horário é o da consulta. |
| IPMet radar/satélite | Páginas de terceiros, sem API documentada nem licença para republicar imagens. | Só links que abrem em outra aba. Não copiamos as imagens. |
| Meteored (API) e OpenWeatherMap (API) | Chaves foram coladas no chat. Não integrados nesta etapa. | Ver "Chaves" e "Pendente". |

## Chaves
- As duas chaves coladas no chat **não foram gravadas em nenhum arquivo**. Há um teste (`tests/externas.test.mjs`) que falha se qualquer arquivo do site tiver sequência hexadecimal longa ou `appid=`/`apikey=` com valor.
- Como foram expostas em conversa, o mais seguro é **gerar chaves novas** nos dois serviços e guardar a nova só como *secret* do Worker da Cloudflare (nunca em `js/config.js`).

