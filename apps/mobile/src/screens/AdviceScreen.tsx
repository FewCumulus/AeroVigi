/**
 * Consignes affichées juste après l'envoi d'une alerte.
 *
 * Deux rôles :
 *  - rappeler les règles de conduite au-dessus d'un feu, au moment précis où
 *    elles s'appliquent — pas dans un manuel lu au sol trois mois plus tôt ;
 *  - remettre sous les yeux la position et le texte transmis, en gros et en
 *    clair, pour que le pilote puisse les lire à la radio à l'organisme de
 *    contrôle ou à Info FIR sans rouvrir sa messagerie.
 */
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Btn } from '../components/Btn';
import { C } from '../lib/theme';
import { formatDD } from '../lib/coords';
import type { StoredReport } from '../lib/storage';

export function AdviceScreen({ report, onClose }: { report: StoredReport; onClose: () => void }) {
    const insets = useSafeAreaInsets();
    const dfci = report.dfci;

    return (
        <View style={s.root}>
            <ScrollView contentContainerStyle={s.scroll}>
                <Text style={s.h1}>Alerte transmise</Text>

                <Rule n="1">Maintenez au moins 3 000 ft au-dessus du feu.</Rule>
                <Rule n="2">
                    Transmettez dès que possible les coordonnées et le carroyage DFCI à l’organisme
                    de contrôle ou à Info FIR, par radio.
                </Rule>
                <Rule n="3">Quittez la zone dès l’arrivée de moyens aériens.</Rule>

                <Text style={s.h2}>À lire à la radio</Text>
                <View style={s.radioCard}>
                    <Text style={s.radioLabel}>Carroyage DFCI</Text>
                    <Text style={s.radioBig}>
                        {dfci
                            ? `${dfci.slice(0, 2)} ${dfci.slice(2, 4)} ${dfci[4]} ${dfci[5]}`
                            : '—'}
                    </Text>
                    <Text style={[s.radioLabel, { marginTop: 12 }]}>Coordonnées WGS84</Text>
                    <Text style={s.radioMed}>{formatDD(report.lat, report.lon)}</Text>
                </View>

                <Text style={s.h2}>Message envoyé</Text>
                <View style={s.preview}>
                    <Text style={s.previewTxt}>{report.text}</Text>
                </View>
            </ScrollView>

            <View style={[s.actions, { paddingBottom: Math.max(insets.bottom, 12) }]}>
                <Btn label="Retour à la carte" variant="primary" onPress={onClose} />
            </View>
        </View>
    );
}

function Rule({ n, children }: { n: string; children: React.ReactNode }) {
    return (
        <View style={s.rule}>
            <View style={s.bullet}>
                <Text style={s.bulletTxt}>{n}</Text>
            </View>
            <Text style={s.ruleTxt}>{children}</Text>
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#f4f6f8' },
    scroll: { padding: 16, paddingBottom: 8 },
    h1: { fontSize: 26, fontWeight: '900', color: C.ok, marginBottom: 16 },
    h2: {
        fontSize: 13,
        fontWeight: '800',
        color: C.textDim,
        marginTop: 22,
        marginBottom: 8,
        textTransform: 'uppercase',
    },
    rule: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
    bullet: {
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: C.alert,
        alignItems: 'center',
        justifyContent: 'center',
    },
    bulletTxt: { color: C.white, fontWeight: '900', fontSize: 15 },
    ruleTxt: { flex: 1, fontSize: 17, lineHeight: 24, color: C.text, fontWeight: '600' },
    radioCard: {
        backgroundColor: C.white,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: C.blue,
        padding: 14,
    },
    radioLabel: { fontSize: 12, fontWeight: '800', color: C.textDim, textTransform: 'uppercase' },
    radioBig: { fontSize: 38, fontWeight: '900', color: C.text, letterSpacing: 2 },
    radioMed: { fontSize: 22, fontWeight: '800', color: C.text },
    preview: {
        backgroundColor: '#fffbe6',
        borderColor: '#e6d68a',
        borderWidth: 1,
        borderRadius: 12,
        padding: 12,
    },
    previewTxt: { fontFamily: 'monospace', fontSize: 14, color: C.text, lineHeight: 20 },
    actions: {
        paddingHorizontal: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderColor: C.border,
        backgroundColor: C.white,
    },
});
