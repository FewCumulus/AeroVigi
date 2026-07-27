/**
 * Formatage des coordonnées et calibrage SMS.
 *
 * Code sûreté : c'est ce qui détermine où les secours vont chercher le feu.
 * Toute modification doit être couverte par tools/test-coords.js.
 */

/** Degrés décimaux, 5 décimales (~1,1 m) — le format lisible par un CODIS. */
export function formatDD(lat: number, lon: number): string {
    const la = `${Math.abs(lat).toFixed(5)}${lat >= 0 ? 'N' : 'S'}`;
    // Longitude sur 3 chiffres entiers : convention aéronautique, et lève
    // l'ambiguïté 5° / 50° à la lecture radio.
    const lonAbs = Math.abs(lon);
    const lonStr = `${lonAbs < 10 ? '0' : ''}${lonAbs < 100 ? '0' : ''}${lonAbs.toFixed(5)}`;
    return `${la} ${lonStr}${lon >= 0 ? 'E' : 'W'}`;
}

/** Table de translittération des caractères non GSM-7 rencontrés en français. */
const TRANSLIT: Record<string, string> = {
    à: 'a', â: 'a', ä: 'a', á: 'a', ã: 'a', å: 'a',
    ç: 'c',
    è: 'e', é: 'e', ê: 'e', ë: 'e',
    ì: 'i', í: 'i', î: 'i', ï: 'i',
    ñ: 'n',
    ò: 'o', ó: 'o', ô: 'o', ö: 'o', õ: 'o', ø: 'o',
    ù: 'u', ú: 'u', û: 'u', ü: 'u',
    ý: 'y', ÿ: 'y',
    æ: 'ae', œ: 'oe', ß: 'ss',
    '’': "'", '‘': "'", '“': '"', '”': '"',
    '–': '-', '—': '-', '…': '...', '°': ' deg', ' ': ' ',
};

/**
 * Réduit un texte à l'ASCII imprimable.
 *
 * Un seul caractère hors alphabet GSM-7 fait basculer le SMS entier en UCS-2,
 * et le segment tombe de 160 à 70 caractères. On préfère « FORET » sans accent
 * à un message coupé en deux.
 */
export function toSmsAscii(input: string): string {
    let out = '';
    for (const ch of input) {
        const lower = ch.toLowerCase();
        const mapped = TRANSLIT[lower];
        if (mapped !== undefined) {
            out += ch === lower ? mapped : mapped.toUpperCase();
            continue;
        }
        const code = ch.charCodeAt(0);
        if (ch === '\n' || (code >= 32 && code <= 126)) out += ch;
        else out += ' ';
    }
    return out.replace(/[ \t]+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').trim();
}

export type SmsInfo = {
    chars: number;
    segments: number;
    /** Capacité totale du nombre de segments courant. */
    capacity: number;
    encoding: 'GSM-7' | 'UCS-2';
};

// Alphabet GSM-7 de base (les caractères de l'extension comptent double).
const GSM7 =
    '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡' +
    'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM7_EXT = '^{}\\[~]|€';

/** Nombre de caractères facturés et nombre de segments d'un SMS. */
export function smsInfo(text: string): SmsInfo {
    let units = 0;
    let gsm = true;
    for (const ch of text) {
        if (GSM7.includes(ch)) units += 1;
        else if (GSM7_EXT.includes(ch)) units += 2;
        else {
            gsm = false;
            break;
        }
    }
    if (!gsm) {
        const n = [...text].length;
        const segments = n <= 70 ? 1 : Math.ceil(n / 67);
        return {
            chars: n,
            segments,
            capacity: segments === 1 ? 70 : segments * 67,
            encoding: 'UCS-2',
        };
    }
    const segments = units <= 160 ? 1 : Math.ceil(units / 153);
    return {
        chars: units,
        segments,
        capacity: segments === 1 ? 160 : segments * 153,
        encoding: 'GSM-7',
    };
}

/** Horodatage « 1432 » en UTC — la référence non ambiguë en aéronautique. */
export function hhmmUtc(d: Date): string {
    const p = (n: number) => `${n}`.padStart(2, '0');
    return `${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
}

/**
 * Altitude d'observation en pieds, arrondie à la centaine (la précision
 * verticale du GPS ne justifie pas mieux), ou null si le récepteur n'en fournit
 * pas.
 *
 * Un 0,0 m exact est traité comme une absence de mesure, pas comme une
 * altitude : l'altitude rendue est rapportée à l'ellipsoïde, et au niveau de la
 * mer en France elle vaut environ +50 m. Un zéro franc est donc la valeur par
 * défaut d'un récepteur sans solution verticale — l'annoncer « 0ft » aux
 * secours serait faux.
 */
export function metersToFt(m: number | null | undefined): number | null {
    if (m == null || !Number.isFinite(m) || Math.abs(m) < 1) return null;
    return Math.round((m * 3.28084) / 100) * 100;
}
