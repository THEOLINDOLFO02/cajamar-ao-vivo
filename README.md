# Cajamar ao Vivo — Defesa Civil de Cajamar/SP

Sistema web de acompanhamento para a Defesa Civil de Cajamar (IBGE 3509205): previsão, chuva, alertas, radar e quadro de ocorrências da equipe. Funciona no celular, sem servidor pago, e pode ser hospedado de graça (GitHub Pages).

> **Aviso importante:** previsão, avisos e radar mostrados aqui são **auxiliares** e **não substituem** os avisos oficiais do INMET, do CEMADEN e da Defesa Civil estadual/nacional. Sempre confirme na fonte oficial antes de decidir.

## O que existe hoje

| Página | O que faz |
|---|---|
| `index.html` | Painel: tempo atual, chuva prevista (24 h e 7 dias), alertas do INMET para Cajamar e radar de chuva. Mostra o estado e a hora da última atualização de **cada fonte**. |
| `quadro.html` | Quadro de ocorrências da equipe (em evolução — ainda depende de um banco que será trocado). |

### Como o painel trata falhas

- Cada fonte é consultada separadamente: se uma cair, as outras continuam.
- Se uma consulta falha, o painel tenta de novo uma vez e, se continuar falhando, mostra o último dado bom **com aviso de que é antigo e a hora em que foi coletado**.
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
| [radarmeteorologico.com.br](https://radarmeteorologico.com.br/api-publica) | alertas do INMET | terceiro; não é oficial |
| [RainViewer](https://www.rainviewer.com/api.html) | radar | uso pessoal: zoom máx. 7, apenas dados passados |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) / [Leaflet](https://leafletjs.com) | mapa | |

Previstas: INMET (previsão, avisos e estações), CEMADEN, SAISP e Chuva Online (IAG/USP).

## Créditos dos repositórios de referência

- clima-agora-api, de Kel Baker — licença MIT. Origem da ideia de combinar Open-Meteo + alertas INMET filtrados por código IBGE.
- rainviewer-api-example — exemplo oficial do RainViewer, usado como referência de como animar os quadros do radar. Sem licença explícita: nenhum código foi copiado.
- dados_metereologicos_brasil — pipeline de dados históricos do INMET; estudado como referência do formato dos arquivos, sem uso de código. Sem licença explícita.

## Licença

[MIT](LICENSE) © 2026 Theobaldo, Defesa Civil de Cajamar/SP.
