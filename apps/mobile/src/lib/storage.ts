/**
 * Persistance locale — profil observateur, acceptation des conditions,
 * historique des signalements. Tout reste sur le téléphone : à ce stade
 * l'application n'a pas de serveur.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Intention, Observer, ReportType, Severity } from './message';

const K_PROFILE = 'vigiaero.profile.v1';
const K_ACCEPTED = 'vigiaero.disclaimer.v1';
const K_REPORTS = 'vigiaero.reports.v1';

export const EMPTY_PROFILE: Observer = {
    name: '',
    aircraftReg: '',
    radioFreq: '',
    mentionInFlight: true,
    openAipKey: '',
};

export async function loadProfile(): Promise<Observer> {
    try {
        const raw = await AsyncStorage.getItem(K_PROFILE);
        if (!raw) return EMPTY_PROFILE;
        return { ...EMPTY_PROFILE, ...JSON.parse(raw) };
    } catch {
        return EMPTY_PROFILE;
    }
}

export async function saveProfile(p: Observer): Promise<void> {
    await AsyncStorage.setItem(K_PROFILE, JSON.stringify(p));
}

export function profileIsComplete(p: Observer): boolean {
    return p.name.trim().length > 0 && p.aircraftReg.trim().length > 0;
}

export async function hasAccepted(): Promise<boolean> {
    return (await AsyncStorage.getItem(K_ACCEPTED)) === 'yes';
}

export async function setAccepted(): Promise<void> {
    await AsyncStorage.setItem(K_ACCEPTED, 'yes');
}

export type StoredReport = {
    id: string;
    at: string; // ISO
    lat: number;
    lon: number;
    altitudeM: number | null;
    fireType: ReportType;
    severity: Severity;
    intention: Intention;
    source: 'vertical' | 'map';
    dfci: string | null;
    text: string;
    /** « composed » = fenêtre SMS ouverte ; l'envoi effectif appartient à l'OS. */
    state: 'composed' | 'cancelled';
    /**
     * Alerte initiale à laquelle ce message se rattache. Les messages de suivi
     * (véhicules sur place, feu maîtrisé) pointent sur l'alerte d'origine, ce
     * qui permet de n'afficher qu'un seul marqueur par feu sur la carte.
     */
    parentId?: string;
};

export async function loadReports(): Promise<StoredReport[]> {
    try {
        const raw = await AsyncStorage.getItem(K_REPORTS);
        return raw ? (JSON.parse(raw) as StoredReport[]) : [];
    } catch {
        return [];
    }
}

export async function addReport(r: StoredReport): Promise<StoredReport[]> {
    const all = [r, ...(await loadReports())].slice(0, 200);
    await AsyncStorage.setItem(K_REPORTS, JSON.stringify(all));
    return all;
}

/**
 * Les feux à représenter sur la carte : une entrée par alerte initiale
 * effectivement transmise. Les suivis n'ajoutent pas de marqueur, ils
 * enrichissent celui du feu d'origine.
 */
export type MappedFire = {
    id: string;
    lat: number;
    lon: number;
    at: string;
    dfci: string | null;
    fireType: ReportType;
    /** Dernier état connu, issu du message de suivi le plus récent. */
    lastUpdate: ReportType | null;
};

export function firesFromReports(reports: StoredReport[]): MappedFire[] {
    const fires: MappedFire[] = [];
    for (const r of reports) {
        if (r.state !== 'composed' || r.parentId) continue;
        const updates = reports.filter((u) => u.parentId === r.id && u.state === 'composed');
        fires.push({
            id: r.id,
            lat: r.lat,
            lon: r.lon,
            at: r.at,
            dfci: r.dfci,
            fireType: r.fireType,
            lastUpdate: updates.length ? updates[0].fireType : null,
        });
    }
    return fires;
}
