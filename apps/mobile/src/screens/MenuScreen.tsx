/**
 * Menu + historique des signalements du téléphone.
 * L'historique sert à deux choses : retrouver un message pour le renvoyer si
 * le premier n'est pas parti, et rendre compte a posteriori à l'association
 * ou au SDIS.
 */
import { View, Text, StyleSheet, ScrollView, Pressable, Share } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Btn } from '../components/Btn';
import { C } from '../lib/theme';
import { REPORT_TYPE_UI } from '../lib/message';
import type { StoredReport } from '../lib/storage';

export function MenuScreen({
    reports,
    onProfile,
    onDisclaimer,
    onClose,
    onResend,
}: {
    reports: StoredReport[];
    onProfile: () => void;
    onDisclaimer: () => void;
    onClose: () => void;
    onResend: (r: StoredReport) => void;
}) {
    const insets = useSafeAreaInsets();
    return (
        <View style={s.root}>
            <ScrollView contentContainerStyle={s.scroll}>
                <Text style={s.h1}>VigiAero</Text>

                <Btn label="Profil observateur" variant="secondary" onPress={onProfile} />
                <Btn
                    label="Conditions d’utilisation"
                    variant="secondary"
                    onPress={onDisclaimer}
                    style={{ marginTop: 8 }}
                />

                <Text style={s.h2}>Signalements ({reports.length})</Text>
                {reports.length === 0 ? (
                    <Text style={s.empty}>Aucun signalement enregistré sur ce téléphone.</Text>
                ) : (
                    reports.map((r) => (
                        <View key={r.id} style={s.item}>
                            <View style={s.itemHead}>
                                <Text style={s.itemTitle}>{REPORT_TYPE_UI[r.fireType]}</Text>
                                <Text
                                    style={[
                                        s.badge,
                                        r.state === 'composed'
                                            ? { backgroundColor: '#dcfce7', color: C.ok }
                                            : { backgroundColor: '#fee2e2', color: C.alert },
                                    ]}
                                >
                                    {r.state === 'composed' ? 'transmis' : 'annulé'}
                                </Text>
                            </View>
                            <Text style={s.itemMeta}>
                                {new Date(r.at).toLocaleString('fr-FR')}
                                {r.dfci ? ` · DFCI ${r.dfci}` : ''}
                            </Text>
                            <Text style={s.itemTxt}>{r.text}</Text>
                            <View style={s.itemActions}>
                                <Pressable onPress={() => onResend(r)} hitSlop={8}>
                                    <Text style={s.link}>Renvoyer au 114</Text>
                                </Pressable>
                                <Pressable
                                    onPress={() => void Share.share({ message: r.text })}
                                    hitSlop={8}
                                >
                                    <Text style={s.link}>Partager</Text>
                                </Pressable>
                            </View>
                        </View>
                    ))
                )}
            </ScrollView>
            <View style={[s.actions, { paddingBottom: Math.max(insets.bottom, 12) }]}>
                <Btn label="Retour à la carte" variant="primary" onPress={onClose} />
            </View>
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#f4f6f8' },
    scroll: { padding: 16 },
    h1: { fontSize: 26, fontWeight: '900', color: C.text, marginBottom: 16 },
    h2: { fontSize: 13, fontWeight: '800', color: C.textDim, marginTop: 26, marginBottom: 10, textTransform: 'uppercase' },
    empty: { color: C.textDim, fontSize: 14 },
    item: {
        backgroundColor: C.white,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: C.border,
        padding: 12,
        marginBottom: 10,
    },
    itemHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    itemTitle: { fontWeight: '800', fontSize: 16, color: C.text, flex: 1 },
    badge: {
        fontSize: 11,
        fontWeight: '800',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
        overflow: 'hidden',
    },
    itemMeta: { fontSize: 12, color: C.textDim, marginTop: 4 },
    itemTxt: {
        fontFamily: 'monospace',
        fontSize: 12,
        color: C.textDim,
        marginTop: 8,
        lineHeight: 17,
    },
    itemActions: { flexDirection: 'row', gap: 18, marginTop: 10 },
    link: { color: C.blue, fontWeight: '800', fontSize: 14 },
    actions: {
        paddingHorizontal: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderColor: C.border,
        backgroundColor: C.white,
    },
});
