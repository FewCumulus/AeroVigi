/**
 * Vérification du convertisseur DFCI embarqué dans l'app.
 *
 * 1. Invariants de la projection Lambert 93 (définition unique de la conique) ;
 * 2. Aller-retour WGS84 ↔ L93 ;
 * 3. Bout en bout contre le shapefile officiel : pour N mailles tirées au sort,
 *    centre de la maille → WGS84 → code DFCI, comparé au nom du fichier source.
 *
 * Lancement : node tools/test-dfci.js
 */
const fs = require('fs');
const path = require('path');

const BASE = path.join(
    __dirname,
    '..',
    'docs',
    'CARRO_DFCI_2x2_L93',
    'CARRO_DFCI_2x2_L93',
    'CARRO_DFCI_2X2_L93',
);

let failures = 0;
function check(label, ok, detail) {
    console.log(`${ok ? '  OK  ' : ' ÉCHEC'}  ${label}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures++;
}

/**
 * Node exige une extension explicite dans les imports ESM, Metro non. Plutôt
 * que de tordre le code de l'app pour le testeur, on importe une copie
 * temporaire du même source, posée dans le même dossier (les chemins relatifs
 * restent donc valides) avec la seule extension ajoutée.
 */
async function importAppModule(relPath) {
    const src = path.join(__dirname, '..', 'apps', 'mobile', 'src', relPath);
    const code = fs.readFileSync(src, 'utf8').replace(
        /from '(\.[^']*)'/g,
        (mm, p) => `from '${p}.ts'`,
    );
    const tmp = src.replace(/\.ts$/, `.__test-${process.pid}.ts`);
    fs.writeFileSync(tmp, code, 'utf8');
    try {
        return await import('file:///' + tmp.replace(/\\/g, '/'));
    } finally {
        fs.unlinkSync(tmp);
    }
}

(async () => {
    const { wgs84ToL93, l93ToWgs84, dfciFromWgs84 } = await importAppModule('lib/dfci.ts');

    console.log('\n1. Projection Lambert 93');
    // L'origine de la projection doit tomber exactement sur les false easting/northing.
    const o = wgs84ToL93(46.5, 3);
    check(
        'origine (46.5N, 3E) → (700000, 6600000)',
        Math.hypot(o.x - 700000, o.y - 6600000) < 1e-6,
        `écart ${Math.hypot(o.x - 700000, o.y - 6600000).toExponential(2)} m`,
    );

    // Facteur d'échelle = 1 sur les deux parallèles standards (44° et 49°) : c'est
    // ce qui, avec l'origine, détermine la conique de façon unique.
    const scaleAt = (lat) => {
        const d = 1e-6; // degrés
        const p1 = wgs84ToL93(lat, 3 - d);
        const p2 = wgs84ToL93(lat, 3 + d);
        const projected = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        // Longueur réelle de l'arc de parallèle correspondant, sur l'ellipsoïde.
        const A = 6378137.0;
        const e2 = 2 / 298.257222101 - (1 / 298.257222101) ** 2;
        const phi = (lat * Math.PI) / 180;
        const nu = A / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
        const real = nu * Math.cos(phi) * ((2 * d * Math.PI) / 180);
        return projected / real;
    };
    for (const lat of [44, 49]) {
        const k = scaleAt(lat);
        check(`échelle = 1 sur le parallèle ${lat}°`, Math.abs(k - 1) < 1e-9, `k = ${k.toFixed(12)}`);
    }
    // Le facteur d'échelle de Lambert 93 à son origine est une constante
    // publiée : 0.99905102. La retrouver vaut validation externe de la conique.
    const kMid = scaleAt(46.5);
    check(
        'échelle à l’origine = 0.99905102 (valeur publiée du Lambert 93)',
        // 1e-6 : la dérivée numérique ci-dessus a son propre bruit, et 1e-6 en
        // facteur d'échelle vaut ~6 m sur un rayon terrestre — sans commune
        // mesure avec la maille de 2 km. La preuve réelle est le test n°3.
        Math.abs(kMid - 0.99905102) < 1e-6,
        `k = ${kMid.toFixed(9)}`,
    );

    console.log('\n2. Aller-retour WGS84 ↔ Lambert 93');
    let maxErr = 0;
    for (let i = 0; i < 20000; i++) {
        const lat = 41 + Math.random() * 10; // 41°N – 51°N
        const lon = -5 + Math.random() * 15; // 5°W – 10°E
        const p = wgs84ToL93(lat, lon);
        const b = l93ToWgs84(p.x, p.y);
        const err = Math.hypot((b.lat - lat) * 111320, (b.lon - lon) * 111320 * Math.cos((lat * Math.PI) / 180));
        maxErr = Math.max(maxErr, err);
    }
    check('20 000 aller-retours', maxErr < 1e-6, `écart max ${maxErr.toExponential(2)} m`);

    console.log('\n3. Bout en bout contre le shapefile officiel');
    const dbf = fs.readFileSync(BASE + '.dbf');
    const shx = fs.readFileSync(BASE + '.shx');
    const shp = fs.readFileSync(BASE + '.shp');
    const nRecords = dbf.readUInt32LE(4);
    const headerLen = dbf.readUInt16LE(8);
    const recordLen = dbf.readUInt16LE(10);

    const SAMPLE = 40000;
    let mismatch = 0;
    const examples = [];
    for (let k = 0; k < SAMPLE; k++) {
        const i = Math.floor(Math.random() * nRecords);
        const off = headerLen + i * recordLen;
        const expected = dbf.toString('latin1', off + 1, off + 1 + 254).trim();
        const recOff = shx.readInt32BE(100 + i * 8) * 2;
        const cx = (shp.readDoubleLE(recOff + 12) + shp.readDoubleLE(recOff + 28)) / 2;
        const cy = (shp.readDoubleLE(recOff + 20) + shp.readDoubleLE(recOff + 36)) / 2;
        const { lat, lon } = l93ToWgs84(cx, cy);
        const got = dfciFromWgs84(lat, lon);
        if (!got || got.code !== expected) {
            mismatch++;
            if (examples.length < 5) examples.push({ expected, got: got && got.code, lat, lon });
        }
    }
    check(
        `${SAMPLE} mailles tirées au sort → code identique au fichier`,
        mismatch === 0,
        mismatch ? `${mismatch} écarts : ${JSON.stringify(examples)}` : 'aucun écart',
    );

    // Un point clairement hors emprise ne doit pas produire de code fantaisiste.
    check('hors emprise (Berlin) → pas de code', dfciFromWgs84(52.52, 13.405) === null);
    check('hors emprise (Atlantique) → pas de code', dfciFromWgs84(45.0, -12.0) === null);

    // Repères concrets, pour l'œil : ces codes doivent rester stables.
    console.log('\n4. Repères');
    for (const [nom, lat, lon] of [
        ['Marseille Marignane LFML', 43.4393, 5.2214],
        ['Aix-en-Provence', 43.5297, 5.4474],
        ['Ajaccio LFKJ', 41.9236, 8.8029],
        ['Bordeaux LFBD', 44.8283, -0.7156],
    ]) {
        const d = dfciFromWgs84(lat, lon);
        console.log(`        ${nom.padEnd(26)} ${lat}, ${lon}  →  ${d ? d.spaced : 'hors emprise'}`);
    }

    console.log(failures ? `\n${failures} vérification(s) en échec\n` : '\nToutes les vérifications passent\n');
    process.exit(failures ? 1 : 0);
})();
