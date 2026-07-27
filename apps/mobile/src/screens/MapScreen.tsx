/**
 * Écran carte — l'écran de vol.
 *
 * La carte est du Leaflet dans une WebView (même principe que l'ops map de
 * Cumulus), mais la page est embarquée dans l'app : aucune dépendance à un
 * serveur, et l'interface reste utilisable sans couverture data.
 *
 * Point d'architecture : le bandeau de position et le bouton d'alerte sont des
 * composants natifs POSÉS AU-DESSUS de la WebView, jamais dans la page. Si la
 * carte ne charge pas — pas de réseau, tuiles indisponibles — le pilote garde
 * ses coordonnées, son code DFCI et son bouton d'alerte.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useKeepAwake } from 'expo-keep-awake';
import Constants from 'expo-constants';
import { MAP_HTML } from '../lib/mapHtml';
import { C, STATUS_BAR_H } from '../lib/theme';
import { Btn } from '../components/Btn';
import { formatDD, metersToFt } from '../lib/coords';
import { dfciFromWgs84 } from '../lib/dfci';
import type { Fix } from '../lib/useAircraftPosition';
import type { MappedFire } from '../lib/storage';

const OSM_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

/** Point retenu pour un signalement. */
export type PickedPoint = {
    lat: number;
    lon: number;
    altitudeM: number | null;
    source: 'vertical' | 'map';
};

type Props = {
    fix: Fix | null;
    gpsError: string | null;
    grab: () => Fix | null;
    fires: MappedFire[];
    /** Clé OpenAIP saisie par l'utilisateur, prioritaire sur celle du build. */
    openAipKey?: string;
    onPick: (p: PickedPoint) => void;
    onOpenFire: (id: string) => void;
    onOpenMenu: () => void;
};

export function MapScreen({
    fix,
    gpsError,
    grab,
    fires,
    openAipKey,
    onPick,
    onOpenFire,
    onOpenMenu,
}: Props) {
    useKeepAwake();
    const insets = useSafeAreaInsets();
    const webRef = useRef<WebView>(null);
    const [ready, setReady] = useState(false);
    const [follow, setFollow] = useState(true);
    const [pointing, setPointing] = useState(false);
    const [aip, setAip] = useState(true);

    // La clé saisie dans le profil l'emporte sur celle éventuellement injectée
    // à la compilation : c'est ce qui permet de distribuer une application
    // publique sans y embarquer de secret.
    const aipUrl = useMemo(() => {
        const key = openAipKey || ((Constants.expoConfig?.extra as any)?.openAipKey ?? '');
        return key
            ? `https://{s}.api.tiles.openaip.net/api/data/openaip/{z}/{x}/{y}.png?apiKey=${key}`
            : '';
    }, [openAipKey]);

    // La page n'est construite qu'une fois : un changement de clé est appliqué
    // à chaud (setAipUrl) plutôt qu'en remontant la carte, ce qui coûterait le
    // rechargement de toutes les tuiles.
    const html = useMemo(
        () => MAP_HTML.replace('__OSM_URL__', OSM_URL).replace('__OPENAIP_URL__', aipUrl),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [],
    );

    // Alimentation de la carte par le GPS natif : la WebView n'a pas accès à
    // l'API Geolocation sur une origine locale, on lui pousse donc les points.
    useEffect(() => {
        if (!ready || !fix) return;
        webRef.current?.injectJavaScript(
            `window.VA && window.VA.setOwn(${fix.lat},${fix.lon},${fix.accuracyM ?? 0},${
                fix.headingDeg ?? 'null'
            }); true;`,
        );
    }, [ready, fix]);

    const send = (js: string) => webRef.current?.injectJavaScript(`${js} true;`);

    // Application à chaud d'un changement de clé OpenAIP.
    useEffect(() => {
        if (!ready) return;
        send(`window.VA && window.VA.setAipUrl(${JSON.stringify(aip ? aipUrl : '')});`);
    }, [ready, aipUrl, aip]);

    // Report des feux signalés sur la carte, avec l'heure locale du
    // signalement — le pilote repasse souvent sur une zone déjà traitée.
    useEffect(() => {
        if (!ready) return;
        const payload = fires.map((f) => ({
            id: f.id,
            lat: f.lat,
            lon: f.lon,
            label: new Date(f.at).toLocaleTimeString('fr-FR', {
                hour: '2-digit',
                minute: '2-digit',
            }),
            done: f.lastUpdate === 'maitrise',
        }));
        send(`window.VA && window.VA.setFires(${JSON.stringify(payload)});`);
    }, [ready, fires]);

    const dfci = fix ? dfciFromWgs84(fix.lat, fix.lon) : null;
    const alt = metersToFt(fix?.altitudeM);
    const ageS = fix ? Math.round((Date.now() - fix.at.getTime()) / 1000) : null;
    const stale = ageS != null && ageS > 10;

    const verticalMark = () => {
        // Lecture du point à l'instant de l'appui — voir useAircraftPosition.
        const now = grab();
        if (!now) return;
        onPick({
            lat: now.lat,
            lon: now.lon,
            altitudeM: now.altitudeM,
            source: 'vertical',
        });
    };

    return (
        <View style={s.root}>
            <WebView
                ref={webRef}
                source={{ html, baseUrl: 'https://vigiaero.local' }}
                style={s.web}
                originWhitelist={['*']}
                javaScriptEnabled
                domStorageEnabled
                // Composition GPU stable : sans cela les tuiles clignotent au
                // pinch-zoom sur Android (constat repris de Cumulus).
                androidLayerType="hardware"
                overScrollMode="never"
                setBuiltInZoomControls={false}
                onMessage={(e) => {
                    try {
                        const m = JSON.parse(e.nativeEvent.data);
                        if (m.type === 'ready') setReady(true);
                        else if (m.type === 'follow') setFollow(false);
                        else if (m.type === 'fire') onOpenFire(m.id);
                        else if (m.type === 'point') {
                            setPointing(false);
                            send('window.VA && window.VA.setPointing(false);');
                            onPick({
                                lat: m.lat,
                                lon: m.lng,
                                altitudeM: grab()?.altitudeM ?? null,
                                source: 'map',
                            });
                        }
                    } catch {
                        /* message non exploitable : sans effet */
                    }
                }}
            />

            {/* Bandeau de position — natif, donc toujours affiché. */}
            <View style={s.top} pointerEvents="box-none">
                <View style={s.card}>
                    {fix ? (
                        <>
                            <Text style={s.dfci}>
                                {dfci ? `DFCI ${dfci.spaced}` : 'Hors carroyage DFCI'}
                            </Text>
                            <Text style={s.dd}>{formatDD(fix.lat, fix.lon)}</Text>
                            <Text style={[s.meta, stale && { color: C.warn }]}>
                                {`GPS ${
                                    fix.accuracyM != null ? `+/-${Math.round(fix.accuracyM)} m` : '--'
                                }`}
                                {alt != null ? ` · ${alt} ft` : ''}
                                {stale ? ` · point vieux de ${ageS} s` : ''}
                            </Text>
                        </>
                    ) : (
                        <>
                            <Text style={s.dfci}>Acquisition GPS…</Text>
                            <Text style={s.meta}>
                                {gpsError ?? 'Placez le téléphone avec vue sur le ciel'}
                            </Text>
                        </>
                    )}
                </View>
                <Pressable onPress={onOpenMenu} style={s.menu} hitSlop={10}>
                    <Text style={s.menuTxt}>☰</Text>
                </Pressable>
            </View>

            {/* Commandes carte */}
            <View style={s.side} pointerEvents="box-none">
                <SideBtn
                    label={follow ? '⦿' : '⌖'}
                    active={follow}
                    onPress={() => {
                        setFollow(true);
                        send('window.VA && window.VA.setFollow(true);');
                    }}
                />
                {/* L'effet ci-dessus applique le changement : le bouton ne fait
                    que basculer l'état, il n'y a pas deux chemins de code. */}
                <SideBtn label="AIP" active={aip && !!aipUrl} onPress={() => setAip(!aip)} />
                <SideBtn label="+" onPress={() => send('window.VA && window.VA.zoom(1);')} />
                <SideBtn label="–" onPress={() => send('window.VA && window.VA.zoom(-1);')} />
            </View>

            {/* Actions — remontées au-dessus de la barre de navigation Android. */}
            <View
                style={[s.bottom, { bottom: Math.max(insets.bottom, 12) + 16 }]}
                pointerEvents="box-none"
            >
                {pointing ? (
                    <>
                        <Text style={s.hint}>
                            Centrez le réticule sur le feu, puis validez
                        </Text>
                        <Btn
                            label="VALIDER CE POINT"
                            variant="alert"
                            big
                            onPress={() => send('window.VA && window.VA.grabCenter();')}
                        />
                        <Btn
                            label="Annuler le pointage"
                            variant="secondary"
                            onPress={() => {
                                setPointing(false);
                                send('window.VA && window.VA.setPointing(false);');
                            }}
                            style={{ marginTop: 8 }}
                        />
                    </>
                ) : (
                    <>
                        <Btn
                            label="MARQUE VERTICALE"
                            variant="alert"
                            big
                            disabled={!fix}
                            onPress={verticalMark}
                        />
                        <Btn
                            label="Pointer sur la carte"
                            variant="secondary"
                            onPress={() => {
                                setPointing(true);
                                setFollow(false);
                                send('window.VA && window.VA.setPointing(true);');
                            }}
                            style={{ marginTop: 8 }}
                        />
                    </>
                )}
            </View>
        </View>
    );
}

function SideBtn({
    label,
    onPress,
    active,
}: {
    label: string;
    onPress: () => void;
    active?: boolean;
}) {
    return (
        <Pressable
            onPress={onPress}
            style={({ pressed }) => [
                s.sideBtn,
                { backgroundColor: active ? C.blue : C.panel, opacity: pressed ? 0.7 : 1 },
            ]}
        >
            <Text style={[s.sideTxt, { color: active ? C.white : C.text }]}>{label}</Text>
        </Pressable>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },
    web: { flex: 1 },
    top: {
        position: 'absolute',
        top: STATUS_BAR_H + 8,
        left: 8,
        right: 8,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
    },
    card: {
        flex: 1,
        backgroundColor: C.panel,
        borderRadius: 12,
        paddingVertical: 8,
        paddingHorizontal: 12,
    },
    dfci: { fontSize: 26, fontWeight: '900', color: C.text, letterSpacing: 1 },
    dd: { fontSize: 17, fontWeight: '700', color: C.text, marginTop: 2 },
    meta: { fontSize: 12, color: C.textDim, marginTop: 2 },
    menu: {
        width: 48,
        height: 48,
        borderRadius: 12,
        backgroundColor: C.panel,
        alignItems: 'center',
        justifyContent: 'center',
    },
    menuTxt: { fontSize: 22, color: C.text },
    side: { position: 'absolute', right: 8, top: '38%', gap: 8 },
    sideBtn: {
        width: 52,
        height: 52,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sideTxt: { fontSize: 18, fontWeight: '800' },
    // `bottom` est calculé à partir des marges système (barre de gestes ou
    // barre à trois boutons selon l'appareil).
    bottom: { position: 'absolute', left: 12, right: 12 },
    hint: {
        color: C.white,
        backgroundColor: 'rgba(13,17,23,0.8)',
        textAlign: 'center',
        paddingVertical: 6,
        borderRadius: 8,
        marginBottom: 8,
        fontWeight: '600',
    },
});
