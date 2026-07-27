/**
 * Carroyage DFCI — conversion WGS84 → code DFCI 2 km.
 *
 * C'est le référentiel que les CODIS utilisent pour localiser un feu. Le calcul
 * est 100 % hors ligne (aucun appel réseau) : c'est la condition pour que
 * l'alerte parte depuis un avion sans couverture data.
 *
 * Chaîne : WGS84 → Lambert 93 (formules coniques conformes standard, RGF93 et
 * WGS84 étant confondus au centimètre) → indices de maille via l'affine du
 * carré de 100 km (voir src/data/dfciGrid.ts, dérivé du shapefile officiel).
 */
import { DFCI_ALPHA_100, DFCI_ALPHA_2, DFCI_SQUARES } from '../data/dfciGrid';

// --- Lambert 93 (EPSG:2154) -------------------------------------------------
// Paramètres repris du .prj du shapefile officiel : GRS80, parallèles
// standards 44° et 49°, origine 46.5°N / 3°E, décalages 700000 / 6600000.
const A = 6378137.0;
const F = 1 / 298.257222101;
const E = Math.sqrt(2 * F - F * F);
const LAT0 = (46.5 * Math.PI) / 180;
const LON0 = (3 * Math.PI) / 180;
const LAT1 = (44 * Math.PI) / 180;
const LAT2 = (49 * Math.PI) / 180;
const FE = 700000;
const FN = 6600000;

const m = (lat: number) => Math.cos(lat) / Math.sqrt(1 - E * E * Math.sin(lat) ** 2);
const t = (lat: number) =>
    Math.tan(Math.PI / 4 - lat / 2) /
    ((1 - E * Math.sin(lat)) / (1 + E * Math.sin(lat))) ** (E / 2);

const N_EXP = Math.log(m(LAT1) / m(LAT2)) / Math.log(t(LAT1) / t(LAT2));
const BIG_F = m(LAT1) / (N_EXP * t(LAT1) ** N_EXP);
const RHO0 = A * BIG_F * t(LAT0) ** N_EXP;

export type L93 = { x: number; y: number };

/** WGS84 (degrés décimaux) → Lambert 93 (mètres). */
export function wgs84ToL93(lat: number, lon: number): L93 {
    const phi = (lat * Math.PI) / 180;
    const lam = (lon * Math.PI) / 180;
    const rho = A * BIG_F * t(phi) ** N_EXP;
    const theta = N_EXP * (lam - LON0);
    return {
        x: FE + rho * Math.sin(theta),
        y: FN + RHO0 - rho * Math.cos(theta),
    };
}

/** Lambert 93 (mètres) → WGS84 (degrés décimaux). Utilisé par les tests. */
export function l93ToWgs84(x: number, y: number): { lat: number; lon: number } {
    const dx = x - FE;
    const dy = RHO0 - (y - FN);
    const rho = Math.sign(N_EXP) * Math.hypot(dx, dy);
    const theta = Math.atan2(dx, dy);
    const tt = (rho / (A * BIG_F)) ** (1 / N_EXP);
    let phi = Math.PI / 2 - 2 * Math.atan(tt);
    for (let i = 0; i < 12; i++) {
        const next =
            Math.PI / 2 -
            2 *
                Math.atan(
                    tt * ((1 - E * Math.sin(phi)) / (1 + E * Math.sin(phi))) ** (E / 2),
                );
        if (Math.abs(next - phi) < 1e-13) {
            phi = next;
            break;
        }
        phi = next;
    }
    return { lat: (phi * 180) / Math.PI, lon: ((theta / N_EXP + LON0) * 180) / Math.PI };
}

// --- Carroyage --------------------------------------------------------------
type Square = {
    name: string;
    cx: number;
    cy: number;
    ix: number;
    iy: number;
    jx: number;
    jy: number;
};

let squares: Square[] | null = null;

/** Parse paresseux de la table des carrés (11 Ko, ~144 entrées). */
function getSquares(): Square[] {
    if (squares) return squares;
    squares = DFCI_SQUARES.map((row) => {
        const p = row.split(',');
        return {
            name: p[0],
            cx: +p[1],
            cy: +p[2],
            ix: +p[3],
            iy: +p[4],
            jx: +p[5],
            jy: +p[6],
        };
    });
    return squares;
}

export type DfciResult = {
    /** Code compact, tel qu'il doit figurer dans le SMS : « LK84D5 ». */
    code: string;
    /** Code espacé pour la lecture radio et l'affichage : « LK 84 D 5 ». */
    spaced: string;
};

/**
 * Code DFCI 2 km d'un point WGS84, ou null si le point sort de l'emprise du
 * carroyage (hors France : le DFCI est un référentiel français).
 */
export function dfciFromWgs84(lat: number, lon: number): DfciResult | null {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const { x, y } = wgs84ToL93(lat, lon);

    for (const s of getSquares()) {
        const dx = x - s.cx;
        const dy = y - s.cy;
        const gx = Math.round(s.ix * dx + s.iy * dy);
        const gy = Math.round(s.jx * dx + s.jy * dy);
        if (gx < 0 || gx > 49 || gy < 0 || gy > 49) continue;

        const d1 = 2 * Math.floor(gx / 10);
        const d2 = 2 * Math.floor(gy / 10);
        const s1 = DFCI_ALPHA_2[gx % 10];
        const s2 = gy % 10;
        const code = `${s.name}${d1}${d2}${s1}${s2}`;
        return { code, spaced: `${s.name} ${d1}${d2} ${s1} ${s2}` };
    }
    return null;
}

/** Exporté pour les tests : vérifie que les alphabets n'ont pas dérivé. */
export const DFCI_ALPHABETS = { hundred: DFCI_ALPHA_100, two: DFCI_ALPHA_2 };
