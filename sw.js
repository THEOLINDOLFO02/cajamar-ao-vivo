// Service Worker do Cajamar ao Vivo (Defesa Civil de Cajamar/SP).
// Só guarda os arquivos do PRÓPRIO site (páginas, CSS, JS, imagens) para abrir rápido e funcionar no celular.
// Dados meteorológicos (INMET, Open-Meteo, CEMADEN, RainViewer, data/*.json) NUNCA passam pelo cache daqui:
// se a rede falhar, o painel mostra o último dado guardado COM aviso de que é antigo (js/fontes.js).
// Aumente CACHE_NAME sempre que mudar a lista de arquivos.

var CACHE_NAME = "cajamar-ao-vivo-v2";
var RECURSOS_BASE = [
  "./",
  "./index.html",
  "./quadro.html",
  "./historico.html",
  "./publicar.html",
  "./comparar.html",
  "./css/estilo.css",
  "./css/publicar.css",
  "./js/fontes.js",
  "./js/inmet.js",
  "./js/cemaden.js",
  "./js/painel.js",
  "./js/quadro.js",
  "./js/historico.js",
  "./js/publicar.js",
  "./js/comparar.js",
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

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);

  // Outros domínios (APIs) e dados gerados pelo robô: deixa o navegador buscar direto, sem cache do SW.
  if (url.origin !== self.location.origin || url.pathname.indexOf("/data/") > -1) return;

  // Arquivos do site: rede primeiro (pega sempre a versão nova); sem rede, usa o guardado.
  event.respondWith(
    fetch(req).then(function (resposta) {
      if (resposta && resposta.status === 200) {
        var copia = resposta.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put(req, copia); });
      }
      return resposta;
    }).catch(function () {
      return caches.match(req).then(function (guardado) {
        return guardado || (req.mode === "navigate" ? caches.match("./index.html") : Response.error());
      });
    })
  );
});
