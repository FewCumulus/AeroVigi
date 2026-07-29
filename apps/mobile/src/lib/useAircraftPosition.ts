/**
 * Position de l'avion.
 *
 * Trois points de conception importants :
 *  - le dernier point est conservé dans une `ref` en plus de l'état React :
 *    à 100 kt on parcourt 50 m par seconde, donc la marque verticale doit lire
 *    le point à l'instant de l'appui, sans attendre un rendu ;
 *  - la précision demandée est la plus haute disponible, et l'échantillonnage
 *    est à 1 Hz : c'est le compromis usuel entre justesse et batterie ;
 *  - depuis Android 12 et iOS 14, l'utilisateur peut n'accorder qu'une
 *    position approximative (quelques kilomètres). Le carroyage DFCI ayant une
 *    maille de 2 km, une position approximative produirait un code FAUX plutôt
 *    qu'absent — pire qu'une absence de position. `precise` en informe
 *    l'appelant, qui doit alors masquer le DFCI plutôt que d'en afficher un
 *    qui pourrait tromper les secours.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';

export type Fix = {
    lat: number;
    lon: number;
    altitudeM: number | null;
    accuracyM: number | null;
    headingDeg: number | null;
    speedMs: number | null;
    at: Date;
};

export type PositionState = {
    fix: Fix | null;
    error: string | null;
    permission: 'unknown' | 'granted' | 'denied';
    /**
     * Faux si l'utilisateur n'a accordé qu'une position approximative
     * (« Position précise » désactivée sur Android, « Précision » réduite sur
     * iOS). Vrai tant que la plateforme ne rapporte rien (Android < 12,
     * iOS < 14) — ces versions ne connaissent pas la distinction.
     */
    precise: boolean;
};

export function useAircraftPosition() {
    const [state, setState] = useState<PositionState>({
        fix: null,
        error: null,
        permission: 'unknown',
        precise: true,
    });
    const latest = useRef<Fix | null>(null);

    useEffect(() => {
        let sub: Location.LocationSubscription | null = null;
        let cancelled = false;

        (async () => {
            const permResponse = await Location.requestForegroundPermissionsAsync();
            if (cancelled) return;
            if (permResponse.status !== 'granted') {
                setState((s) => ({
                    ...s,
                    permission: 'denied',
                    error: 'Accès à la position refusé',
                }));
                return;
            }
            const precise =
                permResponse.android?.accuracy !== 'coarse' &&
                permResponse.ios?.accuracy !== 'reduced';
            setState((s) => ({ ...s, permission: 'granted', precise }));

            try {
                sub = await Location.watchPositionAsync(
                    {
                        accuracy: Location.Accuracy.BestForNavigation,
                        timeInterval: 1000,
                        distanceInterval: 0,
                    },
                    (loc) => {
                        const fix: Fix = {
                            lat: loc.coords.latitude,
                            lon: loc.coords.longitude,
                            altitudeM: loc.coords.altitude ?? null,
                            accuracyM: loc.coords.accuracy ?? null,
                            headingDeg: loc.coords.heading ?? null,
                            speedMs: loc.coords.speed ?? null,
                            at: new Date(loc.timestamp),
                        };
                        latest.current = fix;
                        setState((s) => ({ ...s, fix, error: null }));
                    },
                );
            } catch (e) {
                if (!cancelled) {
                    setState((s) => ({ ...s, error: 'GPS indisponible' }));
                }
            }
        })();

        return () => {
            cancelled = true;
            sub?.remove();
        };
    }, []);

    /** Dernier point connu, lisible sans passer par un rendu. */
    const grab = useCallback((): Fix | null => latest.current, []);

    return { ...state, grab };
}
