// Service Worker do Cajamar ao Vivo (Defesa Civil de Cajamar/SP).
// Só guarda os arquivos do PRÓPRIO site (páginas, CSS, JS, imagens) para abrir rápido e funcionar no celular.
// Dados meteorológicos (INMET, Open-Meteo, CEMADEN, RainViewer, data/*.json) NUNCA passam pelo cache daqui:
// se a rede falhar, o painel mostra o último dado guardado COM aviso de que é antigo (js/fontes.js).
// Aumente CACHE_NAME sempre que mudar a lista de arquivos.

var CACHE_NAME = "cajamar-ao-vivo-v19";
var RECURSOS_BASE = [
  "./",
  "./index.html",
  "./quadro.html",
  "./historico.html",
  "./publicar.html",
  "./comparar.html",
  "./css/estilo.css",
  "./js/config.js",
  "./js/fontes.js",
  "./js/serie-om.js",
  "./js/ui.js",
  "./js/geo.js",
  "./js/inmet.js",
  "./js/municipio.js",
  "./js/ar.js",
  "./js/modelos.js",
  "./js/windy.js",
  "./js/climatologia.js",
  "./js/cemaden.js",
  "./js/queimadas.js",
  "./js/deslizamento.js",
  "./js/resumo.js",
  "./js/painel-base.js",
  "./js/painel-deslizamento.js",
  "./js/painel-fogo.js",
  "./js/painel-mapa.js",
  "./js/painel-clima.js",
  "./js/painel.js",
  "./js/quadro.js",
  "./js/estacao.js",
  "./js/historico.js",
  "./js/publicacao.js",
  "./js/publicar.js",
  "./js/comparar.js",
  "./js/observacoes.js",
  "./observacoes.html",
  "./manifest.json",
  "./assets/logo-dc-cajamar.jpg",
  "./assets/brasao-cajamar.gif"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) { return cache.addAll(RECURSOS_BASE); }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { if (k !== CACHE_NAME) return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function comLimite(promessa, ms) {
  return new Promise(function (ok, erro) {
    var t = setTimeout(function () { erro(new Error("lento")); }, ms);
    promessa.then(function (r) { clearTimeout(t); ok(r); }, function (e) { clearTimeout(t); erro(e); });
  });
}

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);

  // Outros domínios (APIs) e dados gerados pelo robô: deixa o navegador buscar direto, sem cache do SW.
  if (url.origin !== self.location.origin || url.pathname.indexOf("/data/") > -1) return;

  // Arquivos do site: rede primeiro (pega sempre a versão nova); sem rede ou com rede lenta (> 6 s), usa o guardado.
  event.respondWith(
    comLimite(fetch(req), 6000).then(function (resposta) {
      if (resposta && resposta.status === 200) {
        var copia = resposta.clone();
        var chaveCache = url.search ? url.origin + url.pathname : req;
        caches.open(CACHE_NAME).then(function (cache) { cache.put(chaveCache, copia); });
      }
      return resposta;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (guardado) {
        return guardado || (req.mode === "navigate" ? caches.match("./index.html") : Response.error());
      });
    })
  );
});
