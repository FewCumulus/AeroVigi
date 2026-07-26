/**
 * Génère src/data/dfciGrid.ts depuis le shapefile officiel CARRO_DFCI_2X2_L93.
 *
 * Pourquoi un ajustement plutôt que des constantes de projection en dur :
 * le carroyage DFCI est défini historiquement en Lambert II étendu ; reprojeté
 * en Lambert 93, il est légèrement tourné et l'angle varie avec la position
 * (les emprises des mailles font 2013 m et non 2000 m, et dérivent avec Y).
 * Coder à la main la chaîne WGS84 → NTF → Lambert II, c'est trois occasions de
 * se tromper de paramètre de datum sans s'en rendre compte.
 *
 * À la place : la reprojection conique→conique est conforme, donc sur l'emprise
 * d'un carré de 100 km elle est à une similitude près. On ajuste donc, pour
 * chaque carré de 100 km, une transformation affine
 *      [X_L93 ; Y_L93] = A · [gx ; gy] + t
 * (gx, gy = indices de maille de 2 km dans le carré, 0..49) par moindres
 * carrés sur les ~2500 mailles réelles, puis on VÉRIFIE le résultat en
 * recalculant le code des 339 264 mailles du fichier. 0 écart = grille exacte.
 *
 * Sortie : ~136 carrés × 6 coefficients — quelques kilo-octets embarqués.
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
const OUT = path.join(__dirname, '..', 'apps', 'mobile', 'src', 'data', 'dfciGrid.ts');

// Alphabets DFCI — I et J sont exclus (confusion avec 1 et à l'oral).
const ALPHA_100 = 'ABCDEFGHKLMN';
const ALPHA_2 = 'ABCDEFGHKL';

// --- Lecture du shapefile ---------------------------------------------------
console.log('Lecture du shapefile…');
const dbf = fs.readFileSync(BASE + '.dbf');
const shx = fs.readFileSync(BASE + '.shx');
const shp = fs.readFileSync(BASE + '.shp');

const nRecords = dbf.readUInt32LE(4);
const headerLen = dbf.readUInt16LE(8);
const recordLen = dbf.readUInt16LE(10);
console.log(`${nRecords} mailles`);

/** Centre de la maille i (centre de son emprise, suffisant : mailles convexes régulières). */
function centroid(i) {
    const recOff = shx.readInt32BE(100 + i * 8) * 2;
    const xmin = shp.readDoubleLE(recOff + 12);
    const ymin = shp.readDoubleLE(recOff + 20);
    const xmax = shp.readDoubleLE(recOff + 28);
    const ymax = shp.readDoubleLE(recOff + 36);
    return [(xmin + xmax) / 2, (ymin + ymax) / 2];
}

function parseCode(code) {
    if (code.length !== 6) return null;
    const l1 = ALPHA_100.indexOf(code[0]);
    const l2 = ALPHA_100.indexOf(code[1]);
    const d1 = code.charCodeAt(2) - 48;
    const d2 = code.charCodeAt(3) - 48;
    const s1 = ALPHA_2.indexOf(code[4]);
    const s2 = code.charCodeAt(5) - 48;
    if (l1 < 0 || l2 < 0 || s1 < 0 || d1 % 2 || d2 % 2) return null;
    return {
        square: code.slice(0, 2),
        gx: 10 * (d1 / 2) + s1, // 0..49
        gy: 10 * (d2 / 2) + s2, // 0..49
    };
}

const squares = new Map(); // "AA" -> { gx[], gy[], X[], Y[] }
for (let i = 0; i < nRecords; i++) {
    const off = headerLen + i * recordLen;
    const code = dbf.toString('latin1', off + 1, off + 1 + 254).trim();
    const p = parseCode(code);
    if (!p) throw new Error(`Code DFCI non conforme à l'enregistrement ${i} : "${code}"`);
    let s = squares.get(p.square);
    if (!s) {
        s = { gx: [], gy: [], X: [], Y: [], idx: [] };
        squares.set(p.square, s);
    }
    const [X, Y] = centroid(i);
    s.gx.push(p.gx);
    s.gy.push(p.gy);
    s.X.push(X);
    s.Y.push(Y);
    s.idx.push(i);
}
console.log(`${squares.size} carrés de 100 km`);

// --- Ajustement affine par carré -------------------------------------------
/** Résout par moindres carrés v = a*gx + b*gy + c (équations normales 3x3). */
function fit(gx, gy, v) {
    let s11 = 0, s12 = 0, s13 = 0, s22 = 0, s23 = 0, s33 = gx.length;
    let t1 = 0, t2 = 0, t3 = 0;
    for (let i = 0; i < gx.length; i++) {
        const x = gx[i], y = gy[i], w = v[i];
        s11 += x * x; s12 += x * y; s13 += x;
        s22 += y * y; s23 += y;
        t1 += x * w; t2 += y * w; t3 += w;
    }
    // Résolution 3x3 par élimination de Gauss avec pivot partiel.
    const M = [
        [s11, s12, s13, t1],
        [s12, s22, s23, t2],
        [s13, s23, s33, t3],
    ];
    for (let c = 0; c < 3; c++) {
        let p = c;
        for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
        [M[c], M[p]] = [M[p], M[c]];
        for (let r = 0; r < 3; r++) {
            if (r === c) continue;
            const f = M[r][c] / M[c][c];
            for (let k = c; k < 4; k++) M[r][k] -= f * M[c][k];
        }
    }
    return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
}

const fitted = [];
for (const [name, s] of [...squares.entries()].sort()) {
    const [ax, bx, cx] = fit(s.gx, s.gy, s.X);
    const [ay, by, cy] = fit(s.gx, s.gy, s.Y);
    let maxRes = 0;
    for (let i = 0; i < s.gx.length; i++) {
        const dx = ax * s.gx[i] + bx * s.gy[i] + cx - s.X[i];
        const dy = ay * s.gx[i] + by * s.gy[i] + cy - s.Y[i];
        maxRes = Math.max(maxRes, Math.hypot(dx, dy));
    }
    fitted.push({ name, ax, bx, cx, ay, by, cy, n: s.gx.length, maxRes });
}
const worst = fitted.reduce((a, b) => (a.maxRes > b.maxRes ? a : b));
console.log(
    `Résidu max de l'ajustement : ${worst.maxRes.toFixed(2)} m (carré ${worst.name}) ` +
        `— à comparer à la maille de 2000 m`,
);

// --- Inversion + vérification exhaustive ------------------------------------
for (const f of fitted) {
    const det = f.ax * f.by - f.bx * f.ay;
    f.ix = f.by / det;
    f.iy = -f.bx / det;
    f.jx = -f.ay / det;
    f.jy = f.ax / det;
}

/** (X,Y) L93 → indices de maille dans le carré `f` (non arrondis). */
function toGrid(f, X, Y) {
    const dx = X - f.cx;
    const dy = Y - f.cy;
    return [f.ix * dx + f.iy * dy, f.jx * dx + f.jy * dy];
}

console.log('Vérification des 339 264 mailles…');
let mismatch = 0;
let firstMismatch = null;
for (const [name, s] of squares) {
    const f = fitted.find((x) => x.name === name);
    for (let i = 0; i < s.gx.length; i++) {
        const [gx, gy] = toGrid(f, s.X[i], s.Y[i]);
        const rgx = Math.round(gx);
        const rgy = Math.round(gy);
        if (rgx !== s.gx[i] || rgy !== s.gy[i]) {
            mismatch++;
            if (!firstMismatch) firstMismatch = { name, expected: [s.gx[i], s.gy[i]], got: [gx, gy] };
        }
    }
}
if (mismatch) {
    console.error(`ÉCHEC : ${mismatch} mailles mal reconstruites`, firstMismatch);
    process.exit(1);
}
console.log('OK — les 339 264 mailles sont reconstruites à l’identique.');

// --- Écriture ---------------------------------------------------------------
const r = (v) => Number(v.toFixed(6));
const rows = fitted
    .map((f) => `'${f.name},${r(f.cx)},${r(f.cy)},${r(f.ix)},${r(f.iy)},${r(f.jx)},${r(f.jy)}'`)
    .join(',\n    ');

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
    OUT,
    `// FICHIER GÉNÉRÉ — ne pas éditer à la main.
// Régénérer : node tools/build-dfci-grid.js
//
// Carroyage DFCI 2 km, dérivé du shapefile officiel CARRO_DFCI_2X2_L93
// (${nRecords} mailles, ${fitted.length} carrés de 100 km).
// Chaque ligne : "LL,cx,cy,ix,iy,jx,jy" où (cx,cy) est l'origine du carré en
// Lambert 93 et (ix,iy,jx,jy) la matrice inverse donnant les indices de maille :
//     gx = ix*(X-cx) + iy*(Y-cy)
//     gy = jx*(X-cx) + jy*(Y-cy)
// Reconstruction vérifiée sur la totalité des mailles du fichier source.
export const DFCI_ALPHA_100 = '${ALPHA_100}';
export const DFCI_ALPHA_2 = '${ALPHA_2}';
export const DFCI_SQUARES: string[] = [
    ${rows},
];
`,
    'utf8',
);
console.log(`Écrit ${OUT} (${Math.round(fs.statSync(OUT).size / 1024)} Ko)`);
