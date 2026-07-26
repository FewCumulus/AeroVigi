/**
 * Sert la page de carte embarquée sur http://localhost:8123 pour la vérifier
 * dans un navigateur (rendu Leaflet, tuiles, pont window.VA) sans passer par
 * un téléphone. Outil de développement uniquement.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const MOD = path.join(__dirname, '..', 'apps', 'mobile', 'src', 'lib', 'mapHtml.ts');
const APP = path.join(__dirname, '..', 'apps', 'mobile', 'app.json');

const src = fs.readFileSync(MOD, 'utf8');
const start = src.indexOf('`') + 1;
const end = src.lastIndexOf('`');
// Le module stocke la page dans un littéral de gabarit échappé : on inverse.
const html = src
    .slice(start, end)
    .replace(/\\`/g, '`')
    .replace(/\\\$\{/g, '${')
    .replace(/\\\\/g, '\\');

const key = JSON.parse(fs.readFileSync(APP, 'utf8')).expo.extra.openAipKey;
const page = html
    .replace('__OSM_URL__', 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png')
    .replace(
        '__OPENAIP_URL__',
        `https://{s}.api.tiles.openaip.net/api/data/openaip/{z}/{x}/{y}.png?apiKey=${key}`,
    );

http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(page);
}).listen(8123, '127.0.0.1', () => console.log('Carte servie sur http://localhost:8123'));
