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

## Windy

A rota `/windy` foi removida em 10/11/2026: a Windy deixou de entregar o que o sistema precisava (a chave gratuita só devolve dados de teste). Se o secret `WINDY_POINT_KEY` ainda existir no Worker, pode apagá-lo em **Settings → Variables and Secrets**.

## Rota `/cge` (estação do CGE por raspagem)
O Worker também lê a página pública do CGE (posto 1000880 Santana de Parnaíba; 504 Perus; 515 Pirituba) e devolve JSON em `/cge?posto=1000880`. Para ativar: cole o `cemaden-proxy.js` atualizado no editor do Worker e publique. Não precisa de chave. Chaves de outros serviços, se um dia forem usadas, ficam só em *Settings > Variables and Secrets* do Worker, nunca no repositório.

## Rota `/sync` (Sincronização em Tempo Real entre Celulares e Computadores — Item 2.6)
Permite que todos os aparelhos da equipe da Defesa Civil compartilhem ocorrências, observações manuais, cotas do rio e resumo das estações usando um **Código da Equipe** (`X-Equipe-Chave` ou `?sala=`).
- Funciona imediatamente em memória de borda do Worker e, para persistência permanente, basta criar um namespace gratuito no **Cloudflare KV** chamado `CAJAMAR_SYNC` e vinculá-lo em **Settings → Bindings → KV Namespace (`CAJAMAR_SYNC`)**.
- Opcionalmente, defina o secret `SYNC_SECRET` caso queira travar o Worker para aceitar apenas uma senha única da equipe.

## Rota `/alerta-telegram` e Robô GitHub Actions (Alertas em Segundo Plano — Item 2.7)
- O script `scripts/alertas-telegram.mjs` roda automaticamente a cada 10 minutos no GitHub Actions (`.github/workflows/publicar.yml`), verificando avisos do INMET, chuva forte no CEMADEN ($\ge 20\text{ mm/h}$ ou $\ge 50\text{ mm/24h}$) e focos de calor em Cajamar.
- Para ativar o envio automático em segundo plano no GitHub, adicione em **Settings → Secrets and variables → Actions** do repositório:
  - `TELEGRAM_BOT_TOKEN`: token gerado pelo `@BotFather` no Telegram;
  - `TELEGRAM_CHAT_ID`: ID do grupo ou canal da Defesa Civil (ex.: `-1001234567890`).
- No Cloudflare Worker, você também pode configurar `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID` em **Settings → Variables and Secrets** para disparar boletins pelo botão **"📲 Enviar Boletim Atual para o Telegram"** direto da aba *Dados e fontes* do painel.
