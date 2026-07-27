/**
 * VigiAero — vigilance feux de forêt depuis un avion léger.
 *
 * Navigation volontairement tenue par un état local plutôt que par un routeur :
 * cinq écrans, aucune URL à partager, et une chaîne d'outils en moins entre le
 * code et l'APK.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StatusBar, StyleSheet, View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SMS from 'expo-sms';
import { MapScreen, type PickedPoint } from './src/screens/MapScreen';
import { ReportScreen, DESTINATION } from './src/screens/ReportScreen';
import { AdviceScreen } from './src/screens/AdviceScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { MenuScreen } from './src/screens/MenuScreen';
import { DisclaimerScreen } from './src/screens/DisclaimerScreen';
import { useAircraftPosition } from './src/lib/useAircraftPosition';
import {
    EMPTY_PROFILE,
    addReport,
    firesFromReports,
    hasAccepted,
    loadProfile,
    loadReports,
    profileIsComplete,
    saveProfile,
    setAccepted,
    type StoredReport,
} from './src/lib/storage';
import type { Observer } from './src/lib/message';
import { C, STATUS_BAR_H } from './src/lib/theme';

type ReportParent = { id: string; at: string; dfci: string | null };

type Screen =
    | { name: 'loading' }
    | { name: 'disclaimer'; readOnly: boolean }
    | { name: 'profile'; firstRun: boolean }
    | { name: 'map' }
    | { name: 'report'; point: PickedPoint; parent: ReportParent | null }
    | { name: 'advice'; report: StoredReport }
    | { name: 'menu' };

export default function App() {
    const [screen, setScreen] = useState<Screen>({ name: 'loading' });
    const [profile, setProfile] = useState<Observer>(EMPTY_PROFILE);
    const [reports, setReports] = useState<StoredReport[]>([]);
    const [mapMounted, setMapMounted] = useState(false);
    const { fix, error, grab } = useAircraftPosition();

    const fires = useMemo(() => firesFromReports(reports), [reports]);

    useEffect(() => {
        (async () => {
            const [p, accepted, r] = await Promise.all([
                loadProfile(),
                hasAccepted(),
                loadReports(),
            ]);
            setProfile(p);
            setReports(r);
            if (!accepted) setScreen({ name: 'disclaimer', readOnly: false });
            else if (!profileIsComplete(p)) setScreen({ name: 'profile', firstRun: true });
            else setScreen({ name: 'map' });
        })();
    }, []);

    const onPick = useCallback(
        (point: PickedPoint) => setScreen({ name: 'report', point, parent: null }),
        [],
    );

    /** Appui sur un marqueur de feu : on rouvre la fiche en mode suivi. */
    const onOpenFire = useCallback(
        (id: string) => {
            const fire = fires.find((f) => f.id === id);
            if (!fire) return;
            setScreen({
                name: 'report',
                point: {
                    lat: fire.lat,
                    lon: fire.lon,
                    altitudeM: grab()?.altitudeM ?? null,
                    source: 'map',
                },
                parent: { id: fire.id, at: fire.at, dfci: fire.dfci },
            });
        },
        [fires, grab],
    );

    // La carte reste montée dès qu'on y est passé une fois, et les autres
    // écrans se superposent. La démonter rechargerait ses tuiles au retour —
    // c'est-à-dire une carte vide après chaque signalement fait hors couverture,
    // exactement la situation pour laquelle l'application existe.
    useEffect(() => {
        if (screen.name === 'map') setMapMounted(true);
    }, [screen.name]);

    const overlay = () => {
        switch (screen.name) {
            case 'loading':
                return (
                    <View style={s.center}>
                        <ActivityIndicator size="large" color={C.white} />
                    </View>
                );

            case 'map':
                return null;

            case 'disclaimer':
                return (
                    <DisclaimerScreen
                        readOnly={screen.readOnly}
                        onClose={() => setScreen({ name: 'menu' })}
                        onAccept={async () => {
                            await setAccepted();
                            setScreen(
                                profileIsComplete(profile)
                                    ? { name: 'map' }
                                    : { name: 'profile', firstRun: true },
                            );
                        }}
                    />
                );

            case 'profile':
                return (
                    <ProfileScreen
                        initial={profile}
                        onCancel={screen.firstRun ? undefined : () => setScreen({ name: 'menu' })}
                        onSave={async (p) => {
                            await saveProfile(p);
                            setProfile(p);
                            setScreen({ name: 'map' });
                        }}
                    />
                );

            case 'report':
                return (
                    <ReportScreen
                        point={screen.point}
                        observer={profile}
                        parent={screen.parent}
                        onCancel={() => setScreen({ name: 'map' })}
                        onDone={async (r) => {
                            setReports(await addReport(r));
                            // Les consignes ne s'affichent que si le message est
                            // effectivement parti dans la messagerie : après une
                            // annulation, elles n'ont pas lieu d'être.
                            setScreen(
                                r.state === 'composed'
                                    ? { name: 'advice', report: r }
                                    : { name: 'map' },
                            );
                        }}
                    />
                );

            case 'advice':
                return (
                    <AdviceScreen
                        report={screen.report}
                        onClose={() => setScreen({ name: 'map' })}
                    />
                );

            case 'menu':
                return (
                    <MenuScreen
                        reports={reports}
                        onClose={() => setScreen({ name: 'map' })}
                        onProfile={() => setScreen({ name: 'profile', firstRun: false })}
                        onDisclaimer={() => setScreen({ name: 'disclaimer', readOnly: true })}
                        onResend={(r) => void SMS.sendSMSAsync([DESTINATION], r.text)}
                    />
                );
        }
    };

    // La carte occupe tout l'écran et gère elle-même ses marges ; les écrans
    // superposés sont décalés sous la barre d'état. `SafeAreaView` de
    // react-native n'applique aucune marge sur Android, et il est déprécié :
    // on lit donc directement la hauteur de la barre.
    const content = overlay();
    const onMap = screen.name === 'map';

    return (
        <SafeAreaProvider>
            <View style={s.root}>
                <StatusBar barStyle={onMap ? 'light-content' : 'dark-content'} />
                {mapMounted ? (
                    <MapScreen
                        fix={fix}
                        gpsError={error}
                        grab={grab}
                        fires={fires}
                        openAipKey={profile.openAipKey}
                        onPick={onPick}
                        onOpenFire={onOpenFire}
                        onOpenMenu={() => setScreen({ name: 'menu' })}
                    />
                ) : null}
                {content ? (
                    <View
                        style={[
                            mapMounted ? s.overlay : s.root,
                            screen.name !== 'loading' && { paddingTop: STATUS_BAR_H },
                        ]}
                    >
                        {content}
                    </View>
                ) : null}
            </View>
        </SafeAreaProvider>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    // Opaque : la carte reste montée dessous, elle ne doit pas transparaître.
    overlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#f4f6f8',
    },
});
