/**
 * Construction du message d'alerte.
 *
 * Contraintes qui pilotent la mise en forme :
 *  - un SMS de plus de 160 caractères part en plusieurs segments dont le
 *    réassemblage et l'ordre d'arrivée ne sont pas garantis côté destinataire :
 *    on vise UN segment, et l'écran affiche le compteur avant l'envoi ;
 *  - le carroyage DFCI d'abord : c'est le référentiel de travail des CODIS ;
 *  - les degrés décimaux ensuite, en secours et pour tout autre destinataire ;
 *  - ASCII pur : un seul accent ferait tomber la capacité à 70 caractères.
 */
import { formatDD, hhmmUtc, metersToFt, smsInfo, toSmsAscii, type SmsInfo } from './coords';
import { dfciFromWgs84 } from './dfci';

/** Première alerte sur un feu. */
export type FireType = 'foret' | 'vegetation' | 'batiment' | 'fumee';
/** Message de suivi sur un feu déjà signalé. */
export type UpdateType = 'vehicules' | 'maitrise';
export type ReportType = FireType | UpdateType;

export type Severity = 'debutant' | 'encours' | 'important' | null;

/**
 * Intention du pilote après le signalement. C'est une information
 * opérationnelle : elle dit au CODIS s'il peut compter sur un observateur au-
 * dessus du feu pour guider les moyens, ou si l'avion s'éloigne.
 */
export type Intention = 'reste' | 'poursuit' | null;

export const FIRE_TYPES: FireType[] = ['foret', 'vegetation', 'batiment', 'fumee'];
export const UPDATE_TYPES: UpdateType[] = ['vehicules', 'maitrise'];

export const REPORT_TYPE_LABEL: Record<ReportType, string> = {
    foret: 'FEU DE FORET',
    vegetation: 'FEU DE VEGETATION',
    batiment: 'FEU DE BATIMENT',
    fumee: 'FUMEE ORIGINE INDETERMINEE',
    vehicules: 'VEHICULES INTERVENTION SUR PLACE',
    maitrise: 'FEU SEMBLE MAITRISE',
};

/** Libellés d'interface (accentués — ils ne partent pas dans le SMS). */
export const REPORT_TYPE_UI: Record<ReportType, string> = {
    foret: 'Feu de forêt',
    vegetation: 'Feu de végétation',
    batiment: 'Feu de bâtiment',
    fumee: 'Fumée, origine indéterminée',
    vehicules: 'Arrivée de véhicules d’intervention',
    maitrise: 'Le feu semble maîtrisé',
};

export const SEVERITY_UI: Record<Exclude<Severity, null>, string> = {
    debutant: 'Débutant',
    encours: 'En cours',
    important: 'Important',
};

const SEVERITY_SMS: Record<Exclude<Severity, null>, string> = {
    debutant: 'DEBUTANT',
    encours: 'EN COURS',
    important: 'IMPORTANT',
};

export const INTENTION_UI: Record<Exclude<Intention, null>, string> = {
    reste: 'Je reste sur zone',
    poursuit: 'Je poursuis ma route',
};

// Volontairement courts : ces lignes sont les premières sacrifiées si le
// message déborde, autant qu'elles coûtent peu.
const INTENTION_SMS: Record<Exclude<Intention, null>, string> = {
    reste: 'Je reste sur zone',
    poursuit: 'Je poursuis ma route',
};

export type Observer = {
    name: string;
    aircraftReg: string;
    radioFreq: string;
    /** Mentionner l'impossibilité de parler en vol (justifie le canal écrit). */
    mentionInFlight: boolean;
    /**
     * Clé OpenAIP personnelle, facultative. Elle prend le pas sur celle
     * éventuellement injectée à la compilation : c'est ce qui permet de
     * distribuer l'application sans y embarquer de secret.
     */
    openAipKey?: string;
};

export type FireObservation = {
    lat: number;
    lon: number;
    /** Altitude GPS de l'avion en mètres, si connue. */
    altitudeM?: number | null;
    fireType: ReportType;
    severity: Severity;
    intention: Intention;
    at: Date;
};

export type BuiltMessage = {
    text: string;
    sms: SmsInfo;
    dfci: string | null;
    dd: string;
    /** Lignes facultatives écartées pour tenir en un seul SMS. */
    omitted: string[];
};

/**
 * Assemblage par priorité.
 *
 * Les lignes essentielles — nature du signalement, position DFCI, position en
 * degrés décimaux, identité, heure — partent toujours. Les lignes de confort ne
 * sont ajoutées que tant que le message tient en UN segment : un nom
 * d'observateur long ne doit pas transformer l'alerte en deux SMS dont l'ordre
 * d'arrivée n'est pas garanti. Ce qui a été écarté est renvoyé et affiché à
 * l'écran — l'expéditeur voit toujours le texte exact qui partira.
 */
export function buildAlertMessage(obs: FireObservation, observer: Observer): BuiltMessage {
    const dfci = dfciFromWgs84(obs.lat, obs.lon);
    const dd = formatDD(obs.lat, obs.lon);
    const alt = metersToFt(obs.altitudeM);

    let head = REPORT_TYPE_LABEL[obs.fireType];
    // L'ampleur ne qualifie qu'une alerte initiale, pas un message de suivi.
    if (obs.severity && !UPDATE_TYPES.includes(obs.fireType as UpdateType)) {
        head += ` ${SEVERITY_SMS[obs.severity]}`;
    }
    head += ' vu d avion';

    const essential = [head];
    if (dfci) essential.push(`DFCI ${dfci.code}`);
    essential.push(dd);

    const ident = [observer.name, observer.aircraftReg].filter(Boolean).join(' ');
    const freq = observer.radioFreq ? ` radio ${observer.radioFreq}` : '';
    if (ident || freq) essential.push(`${ident}${freq}`.trim());
    // « GPS » explicite : l'altitude rendue par le récepteur est rapportée à
    // l'ellipsoïde, pas au niveau de la mer — l'écart atteint 150 ft en France.
    // Elle renseigne la hauteur d'observation, elle ne se lit pas comme une
    // altitude QNH.
    essential.push(`${hhmmUtc(obs.at)}UTC${alt != null ? ` ${alt}ft GPS` : ''}`);

    // Par ordre d'importance décroissante. L'intention passe avant la mention
    // « en vol » : savoir si un observateur reste au-dessus du feu vaut plus,
    // pour le destinataire, que de savoir pourquoi le message est écrit.
    const optional: string[] = [];
    if (obs.intention) optional.push(INTENTION_SMS[obs.intention]);
    if (observer.mentionInFlight) optional.push('Appel vocal impossible');

    const lines = [...essential];
    const omitted: string[] = [];
    for (const line of optional) {
        const candidate = toSmsAscii([...lines, line].join('\n'));
        if (smsInfo(candidate).segments === 1) lines.push(line);
        else omitted.push(line);
    }

    const text = toSmsAscii(lines.join('\n'));
    return { text, sms: smsInfo(text), dfci: dfci ? dfci.code : null, dd, omitted };
}
