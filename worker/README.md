# Worker do CEMADEN (Cloudflare, gratuito)

O CEMADEN não libera leitura direta pelo navegador e o agendamento do GitHub atrasa horas. Este Worker busca o CEMADEN sob demanda (com cache de 5 min) e entrega o mesmo formato de `data/cemaden.json`, deixando a chuva observada com poucos minutos de atraso.

Sem chaves, sem cartão de crédito. O plano gratuito permite 100 mil requisições por dia.

## Publicar (cerca de 5 minutos, pelo site, sem instalar nada)

1. Crie uma conta gratuita em https://dash.cloudflare.com/sign-up (só e-mail e senha).
2. No painel: **Workers & Pages → Create → Create Worker**. Dê o nome `cajamar-cemaden` e clique em **Deploy**.
3. Clique em **Edit code**, apague o código de exemplo, cole **todo** o conteúdo de `cemaden-proxy.js` e clique em **Deploy**.
4. Copie o endereço do Worker, algo como `https://cajamar-cemaden.SEU-USUARIO.workers.dev`.
5. Teste abrindo o endereço no navegador: deve aparecer um JSON com `"estacoes"`.
6. Coloque o endereço em `js/config.js`, no campo `cemadenProxy`, e publique o site de novo.

O endereço do Worker não é segredo (é público por natureza), mas só os sites listados em `ORIGENS` no código conseguem lê-lo pelo navegador. Se você mudar o endereço do site, atualize essa lista.

## Se o Worker cair

O painel volta sozinho para o arquivo do robô do GitHub (`data/cemaden.json`) e mostra a hora da coleta.

## Previsão pontual da Windy (rota /windy, opcional)

O mesmo Worker entrega a previsão pontual da Windy (modelo GFS) para Cajamar em `SEU-WORKER.workers.dev/windy`. A chave da Windy **nunca vai para o repositório nem para o site**: ela fica só como *secret* do Worker.

1. Em https://api.windy.com/keys, crie ou copie a chave de **Previsão pontual (Point Forecast)**. As chaves de mapa e de plugins não funcionam aqui.
2. No painel da Cloudflare: **Workers & Pages → seu Worker → Settings → Variables and Secrets → Add**. Tipo **Secret**, nome `WINDY_POINT_KEY`, valor = a chave. Clique em **Deploy**.
3. Cole o código novo de `cemaden-proxy.js` no Worker (**Edit code → Deploy**), pois a rota `/windy` é nova.
4. Teste `https://SEU-WORKER.workers.dev/windy`: deve aparecer um JSON com `"pontos"`. Sem o secret, responde 503 `Windy não configurado`; o painel mostra o cartão como indisponível e o resto continua normal.

Pelo terminal, o equivalente é `npx wrangler secret put WINDY_POINT_KEY` (cola a chave quando pedir).

A resposta fica 30 min no cache da Cloudflare, então o painel não gasta o limite da chave a cada visita. Se a chave vazar (por exemplo, colada em conversa ou commit), gere outra em api.windy.com/keys e troque o secret.
