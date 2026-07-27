/**
 * Position de l'avion.
 *
 * Deux points de conception importants :
 *  - le dernier point est conservé dans une `ref` en plus de l'état React :
 *    à 100 kt on parcourt 50 m par seconde, donc la marque verticale doit lire
 *    le point à l'instant de l'appui, sans attendre un rendu ;
 *  - la précision demandée est la plus haute disponible, et l'échantillonnage
 *    est à 1 Hz : c'est le compromis usuel entre justesse et batterie.
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
};

export function useAircraftPosition() {
    const [state, setState] = useState<PositionState>({
        fix: null,
        error: null,
        permission: 'unknown',
    });
    const latest = useRef<Fix | null>(null);

    useEffect(() => {
        let sub: Location.LocationSubscription | null = null;
        let cancelled = false;

        (async () => {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (cancelled) return;
            if (status !== 'granted') {
                setState((s) => ({
                    ...s,
                    permission: 'denied',
                    error: 'Accès à la position refusé',
                }));
                return;
            }
            setState((s) => ({ ...s, permission: 'granted' }));

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
