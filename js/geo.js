// Geometria simples para GeoJSON (Polygon e MultiPolygon). Sem dependência de página: pode ser testado no Node.
// Coordenadas no padrão GeoJSON: [longitude, latitude].
(function (w) {
  "use strict";

  function poligonos(geo) {
    if (!geo) return [];
    if (geo.type === "Feature") return poligonos(geo.geometry);
    if (geo.type === "FeatureCollection") return [].concat.apply([], (geo.features || []).map(poligonos));
    if (geo.type === "Polygon" && Array.isArray(geo.coordinates)) return [geo.coordinates];
    if (geo.type === "MultiPolygon" && Array.isArray(geo.coordinates)) return geo.coordinates;
    return [];
  }

  // Teste do raio: o ponto está dentro de um anel?
  function noAnel(lon, lat, anel) {
    var dentro = false;
    for (var i = 0, j = anel.length - 1; i < anel.length; j = i++) {
      var xi = anel[i][0], yi = anel[i][1], xj = anel[j][0], yj = anel[j][1];
      if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) dentro = !dentro;
    }
    return dentro;
  }

  // Dentro de algum polígono e fora dos buracos dele.
  function pontoDentro(lon, lat, geo) {
    return poligonos(geo).some(function (p) {
      return noAnel(lon, lat, p[0]) && !p.slice(1).some(function (buraco) { return noAnel(lon, lat, buraco); });
    });
  }

  // Menor distância (km) do ponto até a divisa, em aproximação plana (boa para distâncias de poucos km).
  function distanciaBordaKm(lon, lat, geo) {
    var menor = Infinity, kx = 111.32 * Math.cos(lat * Math.PI / 180), ky = 110.57;
    poligonos(geo).forEach(function (p) {
      p.forEach(function (anel) {
        for (var i = 0; i < anel.length - 1; i++) {
          var x1 = anel[i][0], y1 = anel[i][1], dx = (anel[i + 1][0] - x1) * kx, dy = (anel[i + 1][1] - y1) * ky;
          var px = (lon - x1) * kx, py = (lat - y1) * ky, tam = dx * dx + dy * dy;
          var t = tam ? Math.max(0, Math.min(1, (px * dx + py * dy) / tam)) : 0;
          var d = Math.hypot(px - t * dx, py - t * dy);
          if (d < menor) menor = d;
        }
      });
    });
    return menor;
  }

  // [oeste, sul, leste, norte]
  function limites(geo) {
    var b = [180, 90, -180, -90];
    poligonos(geo).forEach(function (p) {
      (p[0] || []).forEach(function (c) {
        if (c[0] < b[0]) b[0] = c[0]; if (c[1] < b[1]) b[1] = c[1];
        if (c[0] > b[2]) b[2] = c[0]; if (c[1] > b[3]) b[3] = c[1];
      });
    });
    return b;
  }

  w.Geo = { poligonos: poligonos, pontoDentro: pontoDentro, distanciaBordaKm: distanciaBordaKm, limites: limites };
})(typeof window !== "undefined" ? window : globalThis);
