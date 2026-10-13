# Cajamar ao Vivo — Defesa Civil de Cajamar/SP

Projeto pessoal (uso individual, por diversão e aprendizado) de acompanhamento para a Defesa Civil de Cajamar (IBGE 3509205): previsão, chuva, alertas, radar e quadro de ocorrências da equipe. Funciona no celular, sem servidor pago, e pode ser hospedado de graça (GitHub Pages).

> **Aviso importante:** previsão, avisos e radar mostrados aqui são **auxiliares** e **não substituem** os avisos oficiais do INMET, do CEMADEN e da Defesa Civil estadual/nacional. Sempre confirme na fonte oficial antes de decidir.

## O que existe hoje

| Página | O que faz |
|---|---|
| `index.html` | Painel: tempo atual, chuva prevista (24 h e 7 dias), alertas do INMET para Cajamar e radar de chuva. Mostra o estado e a hora da última atualização de **cada fonte**. |
| `quadro.html` | Quadro de ocorrências pessoal (6 categorias). Os registros ficam no navegador do próprio aparelho; há exportar/importar backup em arquivo `.json`. Sem login, sem banco externo, sem dados de moradores. |
| `historico.html` | Histórico da estação meteorológica de Cajamar: você importa o CSV baixado da plataforma (lido só no navegador) e vê chuva por dia, maiores chuvas em 1 h e 10 min, temperatura, vento e tabela dia a dia. Reimportar não duplica dias. O CSV não faz parte do repositório. |
| `publicar.html` | Gera imagem (Stories 1080×1920) e legenda para o Instagram a partir de avisos e previsão oficiais do INMET, da chuva medida pela estação ou de dicas de prevenção. Você revisa e publica manualmente; nada é postado sozinho. Bloqueia a geração quando não há dado novo. |
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
| [CEMADEN](https://www.cemaden.gov.br/) (pluviômetros) | chuva observada em Cajamar e região (1 h a 72 h) | coletado por um robô do GitHub Actions a cada ~10 min, porque o navegador não consegue ler o CEMADEN direto |
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

- O arquivo `scripts/coletar-cemaden.mjs` baixa as estações do CEMADEN para Cajamar e região e grava `data/cemaden.json`. Esse arquivo **não fica no repositório**: o workflow `.github/workflows/publicar.yml` roda a cada ~10 min, coleta e publica o site já com o arquivo novo.
- Se uma coleta agendada falhar, o job falha e o site anterior (com a última coleta boa) continua no ar; a tela mostra a hora da coleta.
- Os horários das leituras são os **informados pelo CEMADEN**; o fuso não está documentado e os valores mais recentes aparecem à frente do relógio local. Por isso o painel mostra a defasagem de cada estação em relação à leitura mais recente da rede, e não compara com a hora do seu aparelho.
- “sem dado” é ausência de valor (nunca zero). Muitas estações, inclusive em Cajamar, ficam paradas por meses.
- Repositórios públicos têm as execuções agendadas desativadas pelo GitHub após 60 dias sem atividade: se isso acontecer, ative o workflow de novo na aba Actions.

## Publicação (GitHub Pages)

O site é publicado pelo próprio workflow (Settings → Pages → Source: GitHub Actions). O endereço fica em https://NOME-DE-USUARIO.github.io/NOME-DO-REPOSITORIO/.
