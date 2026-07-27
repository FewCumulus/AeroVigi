/**
 * Écran de confirmation du signalement.
 *
 * Un seul écran, tout pré-rempli, aucun champ à saisir en vol : le pilote
 * choisit la nature du signalement, son intention, et envoie. Le texte exact
 * qui partira est affiché avant l'envoi — on ne fait jamais partir un message
 * que l'expéditeur n'a pas pu lire.
 *
 * Deux modes : alerte initiale (quatre natures de feu, ampleur facultative) et
 * suivi d'un feu déjà signalé (véhicules sur place, feu maîtrisé).
 */
import { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Linking, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SMS from 'expo-sms';
import { Btn } from '../components/Btn';
import { C } from '../lib/theme';
import { formatDD } from '../lib/coords';
import {
    buildAlertMessage,
    FIRE_TYPES,
    INTENTION_UI,
    REPORT_TYPE_UI,
    SEVERITY_UI,
    UPDATE_TYPES,
    type Intention,
    type Observer,
    type ReportType,
    type Severity,
} from '../lib/message';
import type { PickedPoint } from './MapScreen';
import type { StoredReport } from '../lib/storage';

export const DESTINATION = '114';

type Props = {
    point: PickedPoint;
    observer: Observer;
    /** Renseigné pour un message de suivi sur un feu déjà signalé. */
    parent?: { id: string; at: string; dfci: string | null } | null;
    onDone: (r: StoredReport) => void;
    onCancel: () => void;
    /** Retire le marqueur de la carte (mode suivi uniquement). */
    onDeleteFire?: (id: string) => void;
};

export function ReportScreen({
    point,
    observer,
    parent,
    onDone,
    onCancel,
    onDeleteFire,
}: Props) {
    const insets = useSafeAreaInsets();
    const isUpdate = !!parent;
    const choices: ReportType[] = isUpdate ? UPDATE_TYPES : FIRE_TYPES;

    const [fireType, setFireType] = useState<ReportType>(choices[0]);
    const [severity, setSeverity] = useState<Severity>(null);
    const [intention, setIntention] = useState<Intention>(null);
    const [sending, setSending] = useState(false);
    const at = useMemo(() => new Date(), []);

    const built = useMemo(
        () =>
            buildAlertMessage(
                {
                    lat: point.lat,
                    lon: point.lon,
                    altitudeM: point.altitudeM,
                    fireType,
                    severity,
                    intention,
                    at,
                },
                observer,
            ),
        [point, fireType, severity, intention, observer, at],
    );

    const send = async () => {
        setSending(true);
        try {
            const available = await SMS.isAvailableAsync();
            if (!available) {
                Alert.alert(
                    'SMS indisponible',
                    "Aucune application de messagerie n'est disponible sur cet appareil.",
                );
                setSending(false);
                return;
            }
            const { result } = await SMS.sendSMSAsync([DESTINATION], built.text);
            onDone({
                id: `${at.getTime()}`,
                at: at.toISOString(),
                lat: point.lat,
                lon: point.lon,
                altitudeM: point.altitudeM,
                fireType,
                severity,
                intention,
                source: point.source,
                dfci: built.dfci,
                text: built.text,
                // Android ne remonte pas l'envoi effectif : « composed » signifie
                // que la fenêtre SMS a été ouverte avec le message prêt.
                state: result === 'cancelled' ? 'cancelled' : 'composed',
                parentId: parent ? parent.id : undefined,
            });
        } catch {
            Alert.alert('Erreur', "L'application de messagerie n'a pas pu être ouverte.");
            setSending(false);
        }
    };

    const over = built.sms.segments > 1;

    return (
        <View style={s.root}>
            <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
                <Text style={s.h1}>{isUpdate ? 'Mise à jour du feu' : 'Signalement'}</Text>

                <View style={s.posCard}>
                    <Text style={s.dfci}>
                        {built.dfci
                            ? `DFCI ${built.dfci.slice(0, 2)} ${built.dfci.slice(2, 4)} ${built.dfci[4]} ${built.dfci[5]}`
                            : 'Hors carroyage DFCI'}
                    </Text>
                    <Text style={s.dd}>{formatDD(point.lat, point.lon)}</Text>
                    <Text style={s.meta}>
                        {isUpdate
                            ? `Feu signalé à ${new Date(parent!.at).toLocaleTimeString('fr-FR', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                              })}`
                            : point.source === 'vertical'
                              ? 'Position de l’avion à l’appui (verticale)'
                              : 'Point relevé sur la carte'}
                    </Text>
                </View>

                <Text style={s.h2}>{isUpdate ? 'Nouvel élément' : 'Type'}</Text>
                <View style={s.grid}>
                    {choices.map((t) => (
                        <Choice
                            key={t}
                            label={REPORT_TYPE_UI[t]}
                            active={fireType === t}
                            onPress={() => setFireType(t)}
                        />
                    ))}
                </View>

                {isUpdate ? null : (
                    <>
                        <Text style={s.h2}>Ampleur (facultatif)</Text>
                        <View style={s.row}>
                            {(Object.keys(SEVERITY_UI) as Exclude<Severity, null>[]).map((v) => (
                                <Choice
                                    key={v}
                                    label={SEVERITY_UI[v]}
                                    active={severity === v}
                                    small
                                    onPress={() => setSeverity(severity === v ? null : v)}
                                />
                            ))}
                        </View>
                    </>
                )}

                <Text style={s.h2}>Votre intention</Text>
                <View style={s.row}>
                    {(Object.keys(INTENTION_UI) as Exclude<Intention, null>[]).map((v) => (
                        <Choice
                            key={v}
                            label={INTENTION_UI[v]}
                            active={intention === v}
                            small
                            onPress={() => setIntention(intention === v ? null : v)}
                        />
                    ))}
                </View>

                <Text style={s.h2}>Message qui sera envoyé au {DESTINATION}</Text>
                <View style={s.preview}>
                    <Text style={s.previewTxt}>{built.text}</Text>
                </View>
                <Text style={[s.counter, over && { color: C.warn }]}>
                    {built.sms.chars}/{built.sms.capacity} caractères ·{' '}
                    {built.sms.segments === 1
                        ? '1 SMS'
                        : `${built.sms.segments} SMS (ordre d’arrivée non garanti)`}
                </Text>
                {built.omitted.length > 0 ? (
                    <Text style={s.counter}>
                        Écarté pour tenir en un seul SMS :{' '}
                        {built.omitted.map((o) => `« ${o} »`).join(', ')}
                    </Text>
                ) : null}

                {isUpdate && onDeleteFire ? (
                    <Pressable
                        onPress={() =>
                            Alert.alert(
                                'Retirer ce feu de la carte',
                                'Le marqueur et son historique disparaissent de ce téléphone. Le SMS déjà envoyé n’est pas annulé.',
                                [
                                    { text: 'Annuler', style: 'cancel' },
                                    {
                                        text: 'Retirer',
                                        style: 'destructive',
                                        onPress: () => onDeleteFire(parent!.id),
                                    },
                                ],
                            )
                        }
                        hitSlop={8}
                        style={{ marginTop: 22, alignSelf: 'center' }}
                    >
                        <Text style={s.deleteLink}>Retirer ce feu de la carte</Text>
                    </Pressable>
                ) : null}
            </ScrollView>

            <View style={[s.actions, { paddingBottom: Math.max(insets.bottom, 12) }]}>
                <Btn
                    label={sending ? 'Ouverture…' : `ENVOYER AU ${DESTINATION}`}
                    variant="alert"
                    big
                    disabled={sending}
                    onPress={send}
                />
                <View style={s.actionRow}>
                    <Btn
                        label="Appeler le 18"
                        variant="secondary"
                        onPress={() => Linking.openURL('tel:18')}
                        style={{ flex: 1 }}
                    />
                    <Btn label="Annuler" variant="ghost" onPress={onCancel} style={{ flex: 1 }} />
                </View>
            </View>
        </View>
    );
}

function Choice({
    label,
    active,
    onPress,
    small,
}: {
    label: string;
    active: boolean;
    onPress: () => void;
    small?: boolean;
}) {
    return (
        <Pressable
            onPress={onPress}
            style={({ pressed }) => [
                s.choice,
                small && { minHeight: 52 },
                {
                    backgroundColor: active ? C.alert : C.white,
                    borderColor: active ? C.alert : C.border,
                    opacity: pressed ? 0.8 : 1,
                },
            ]}
        >
            <Text style={[s.choiceTxt, { color: active ? C.white : C.text }]}>{label}</Text>
        </Pressable>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#f4f6f8' },
    scroll: { padding: 16, paddingBottom: 8 },
    h1: { fontSize: 26, fontWeight: '900', color: C.text, marginBottom: 12 },
    h2: {
        fontSize: 13,
        fontWeight: '800',
        color: C.textDim,
        marginTop: 18,
        marginBottom: 8,
        textTransform: 'uppercase',
    },
    posCard: {
        backgroundColor: C.white,
        borderRadius: 12,
        padding: 14,
        borderWidth: 1,
        borderColor: C.border,
    },
    dfci: { fontSize: 28, fontWeight: '900', color: C.text, letterSpacing: 1 },
    dd: { fontSize: 18, fontWeight: '700', color: C.text, marginTop: 4 },
    meta: { fontSize: 12, color: C.textDim, marginTop: 6 },
    grid: { gap: 8 },
    row: { flexDirection: 'row', gap: 8 },
    choice: {
        flex: 1,
        minHeight: 62,
        borderRadius: 12,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 10,
    },
    choiceTxt: { fontSize: 16, fontWeight: '800', textAlign: 'center' },
    preview: {
        backgroundColor: '#fffbe6',
        borderColor: '#e6d68a',
        borderWidth: 1,
        borderRadius: 12,
        padding: 12,
    },
    previewTxt: { fontFamily: 'monospace', fontSize: 14, color: C.text, lineHeight: 20 },
    counter: { fontSize: 12, color: C.textDim, marginTop: 6 },
    deleteLink: { color: C.alert, fontWeight: '800', fontSize: 15 },
    actions: {
        paddingHorizontal: 12,
        paddingTop: 12,
        gap: 8,
        borderTopWidth: 1,
        borderColor: C.border,
        backgroundColor: C.white,
    },
    actionRow: { flexDirection: 'row', gap: 8 },
});
