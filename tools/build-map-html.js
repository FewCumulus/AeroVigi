/**
 * Génère src/lib/mapHtml.ts : la page Leaflet embarquée dans la WebView.
 *
 * Leaflet est INTÉGRÉ au fichier (et non chargé depuis un CDN) pour que la
 * carte s'affiche même sans couverture data — les tuiles manqueront, mais
 * l'interface, le pointage et les coordonnées, eux, continuent de fonctionner.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT = path.join(__dirname, '..', 'apps', 'mobile', 'src', 'lib', 'mapHtml.ts');
const LEAFLET = '1.9.4';

const get = (url) =>
    new Promise((resolve, reject) => {
        https
            .get(url, { headers: { 'User-Agent': 'VigiAero/0.1' } }, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    return resolve(get(res.headers.location));
                }
                if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} ${url}`));
                let body = '';
                res.setEncoding('utf8');
                res.on('data', (c) => (body += c));
                res.on('end', () => resolve(body));
            })
            .on('error', reject);
    });

const PAGE = (css, js) => `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes">
<style>${css}</style>
<style>
  html, body, #map { margin:0; padding:0; height:100%; width:100%; background:#e8e6e1; }
  .leaflet-container { background:#e8e6e1; font-family: sans-serif; }
  /* Anti-scintillement des tuiles au pinch-zoom sur Android : chaque panneau
     de tuiles sur sa propre couche GPU (repris de l'ops map Cumulus). */
  .leaflet-tile-pane, .leaflet-tile-container { will-change: transform; transform: translateZ(0); }
  .leaflet-tile { image-rendering: -webkit-optimize-contrast; }
  .own {
    width:0; height:0;
    border-left:9px solid transparent; border-right:9px solid transparent;
    border-bottom:26px solid #0a58ff;
    filter: drop-shadow(0 0 2px #fff) drop-shadow(0 0 2px #fff);
  }
  .fire {
    font-size:26px; line-height:30px; text-align:center; cursor:pointer;
    text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 5px #fff;
    position:relative;
  }
  .fire-done { filter: grayscale(1); opacity:0.6; }
  /* Heure du signalement, collée sous le marqueur : le pilote repasse souvent
     sur une zone déjà traitée et doit distinguer ses feux d'un coup d'oeil. */
  .fire-tag {
    position:absolute; top:26px; left:50%; transform:translateX(-50%);
    font-size:11px; line-height:13px; font-weight:700; white-space:nowrap;
    background:rgba(255,255,255,0.9); color:#0d1117;
    border-radius:4px; padding:0 3px; text-shadow:none;
  }
  .crosshair {
    position:absolute; left:50%; top:50%; z-index:900;
    width:44px; height:44px; margin:-22px 0 0 -22px; pointer-events:none; display:none;
  }
  .crosshair::before, .crosshair::after {
    content:''; position:absolute; background:#d40000; box-shadow:0 0 0 1px #fff;
  }
  .crosshair::before { left:21px; top:0; width:2px; height:44px; }
  .crosshair::after { top:21px; left:0; height:2px; width:44px; }
  body.pointing .crosshair { display:block; }
  .leaflet-control-attribution { font-size:9px; }
</style>
</head>
<body>
<div id="map"></div>
<div class="crosshair"></div>
<script>${js}</script>
<script>
(function () {
  // Substitués à l'exécution par MapScreen (voir en-tête du fichier généré).
  var OSM_URL = '__OSM_URL__';
  var OPENAIP_URL = '__OPENAIP_URL__';

  var send = function (o) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(o));
  };

  var map = L.map('map', { zoomControl: false, attributionControl: true, tap: true })
             .setView([43.5, 5.4], 9);

  // Fond OSM. Les tuiles OpenAIP viennent en surcouche unique (raster), sans
  // découpage vertical des volumes : c'est le calque de référence VFR.
  L.tileLayer(OSM_URL, {
    maxZoom: 17, subdomains: 'abc',
    attribution: '&copy; OpenStreetMap | aeronautique &copy; OpenAIP'
  }).addTo(map);

  // Cree meme sans URL : la couche existe pour que setAipUrl puisse l'activer
  // plus tard si une cle est saisie, mais elle n'est ajoutee a la carte que
  // lorsqu'elle a une URL exploitable.
  var aip = L.tileLayer(OPENAIP_URL || '', { maxZoom: 14, subdomains: 'abc', opacity: 0.85 });
  if (OPENAIP_URL) aip.addTo(map);

  var own = null, ownAcc = null, follow = true, pointing = false;
  var fires = L.layerGroup().addTo(map);

  map.on('movestart', function (e) { if (e.hard !== true) {} });
  map.on('dragstart', function () { follow = false; send({ type: 'follow', value: false }); });

  window.VA = {
    setOwn: function (lat, lon, accuracy, heading) {
      var ll = [lat, lon];
      if (!own) {
        own = L.marker(ll, {
          icon: L.divIcon({ className: '', html: '<div class="own"></div>', iconSize: [18, 26], iconAnchor: [9, 13] }),
          interactive: false, keyboard: false, zIndexOffset: 1000
        }).addTo(map);
        ownAcc = L.circle(ll, { radius: accuracy || 0, color: '#0a58ff', weight: 1, fillOpacity: 0.08, interactive: false }).addTo(map);
      } else {
        own.setLatLng(ll);
        ownAcc.setLatLng(ll).setRadius(accuracy || 0);
      }
      var el = own.getElement();
      if (el && el.firstChild && heading != null) {
        el.firstChild.style.transform = 'rotate(' + heading + 'deg)';
      }
      if (follow) map.setView(ll, map.getZoom(), { animate: false });
    },
    setFollow: function (v) { follow = !!v; if (v && own) map.setView(own.getLatLng(), map.getZoom(), { animate: false }); },
    setPointing: function (v) {
      pointing = !!v;
      document.body.classList.toggle('pointing', pointing);
    },
    /** Renvoie le point visé par le réticule (centre de l'écran). */
    grabCenter: function () {
      var c = map.getCenter();
      send({ type: 'point', lat: c.lat, lng: c.lng });
    },
    /**
     * (Re)pose l'ensemble des feux signalés. list = [{id, lat, lon, label,
     * done}] ; done grise le marqueur (feu annonce maitrise). Un appui sur un
     * marqueur remonte son identifiant au natif, qui rouvre la fiche du feu.
     */
    setFires: function (list) {
      fires.clearLayers();
      list.forEach(function (f) {
        var cls = 'fire' + (f.done ? ' fire-done' : '');
        L.marker([f.lat, f.lon], {
          icon: L.divIcon({
            className: '',
            html: '<div class="' + cls + '">&#128293;<span class="fire-tag">' + f.label + '</span></div>',
            iconSize: [30, 30],
            iconAnchor: [15, 15],
          }),
          // Cible tactile élargie : on vise un marqueur en turbulence.
          riseOnHover: true,
        })
          .addTo(fires)
          .on('click', function (e) {
            L.DomEvent.stopPropagation(e);
            send({ type: 'fire', id: f.id });
          });
      });
    },
    clearFires: function () { fires.clearLayers(); },
    zoom: function (d) { map.setZoom(map.getZoom() + d); },
    /**
     * Change la surcouche aeronautique a chaud. Une chaine vide la retire :
     * c'est le cas quand aucune cle OpenAIP n'est configuree, ou quand le
     * pilote desactive le calque.
     */
    setAipUrl: function (url) {
      if (!url) { if (map.hasLayer(aip)) map.removeLayer(aip); return; }
      aip.setUrl(url);
      if (!map.hasLayer(aip)) aip.addTo(map);
    }
  };

  map.on('click', function (e) {
    if (pointing) send({ type: 'point', lat: e.latlng.lat, lng: e.latlng.lng });
  });
  map.on('moveend', function () {
    var c = map.getCenter();
    send({ type: 'center', lat: c.lat, lng: c.lng, zoom: map.getZoom() });
  });

  send({ type: 'ready' });
})();
</script>
</body>
</html>`;

(async () => {
    console.log(`Téléchargement de Leaflet ${LEAFLET}…`);
    const [css, js] = await Promise.all([
        get(`https://unpkg.com/leaflet@${LEAFLET}/dist/leaflet.css`),
        get(`https://unpkg.com/leaflet@${LEAFLET}/dist/leaflet.js`),
    ]);
    // Les images de marqueurs par défaut de Leaflet sont référencées en url()
    // relative : on n'en charge aucune (marqueurs en divIcon), donc on purge
    // ces règles pour éviter des requêtes mortes.
    const cleanCss = css.replace(/url\([^)]*\)/g, 'none');

    // Échappement systématique : le source de Leaflet contient des antislashs
    // (expressions régulières) et peut contenir des accents graves.
    const page = PAGE(cleanCss, js)
        .replace(/\\/g, '\\\\')
        .replace(/`/g, '\\`')
        .replace(/\$\{/g, '\\${');

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(
        OUT,
        `// FICHIER GÉNÉRÉ — ne pas éditer à la main.\n` +
            `// Régénérer : node tools/build-map-html.js  (Leaflet ${LEAFLET} intégré)\n` +
            `//\n` +
            `// Les deux URLs de tuiles sont injectées à l'exécution par MapScreen\n` +
            `// (substitution de __OSM_URL__ / __OPENAIP_URL__) pour que la clé\n` +
            `// OpenAIP reste dans la configuration de l'app et non dans ce fichier.\n` +
            `export const MAP_HTML = \`${page}\`;\n`,
        'utf8',
    );
    console.log(`Écrit ${OUT} (${Math.round(fs.statSync(OUT).size / 1024)} Ko)`);
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
