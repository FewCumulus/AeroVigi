/**
 * Profil observateur — saisi une fois au sol, jamais en vol.
 * Ces trois informations partent dans chaque message : elles permettent au
 * CODIS de rappeler l'observateur et, s'il le souhaite, de le joindre en radio.
 */
import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, Switch, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Btn } from '../components/Btn';
import { C } from '../lib/theme';
import type { Observer } from '../lib/message';

const FREQS = ['123.500', '123.450', '130.000', '121.500'];

export function ProfileScreen({
    initial,
    onSave,
    onCancel,
}: {
    initial: Observer;
    onSave: (o: Observer) => void;
    onCancel?: () => void;
}) {
    const insets = useSafeAreaInsets();
    const [p, setP] = useState<Observer>(initial);
    const ok = p.name.trim().length > 0 && p.aircraftReg.trim().length > 0;

    return (
        <View style={s.root}>
            <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
                <Text style={s.h1}>Profil</Text>
                <Text style={s.intro}>
                    Ces informations sont jointes à chaque signalement. Elles restent sur ce
                    téléphone.
                </Text>

                {/* Longueurs bornées : chaque caractère saisi ici consomme la
                    capacité du SMS d'alerte. Un nom court laisse la place aux
                    mentions utiles (voir buildAlertMessage). */}
                <Field
                    label="Nom de l’observateur"
                    value={p.name}
                    placeholder="Jo Pilote"
                    autoCapitalize="words"
                    maxLength={24}
                    onChange={(v) => setP({ ...p, name: v })}
                />
                <Field
                    label="Immatriculation de l’avion ou indicatif"
                    value={p.aircraftReg}
                    placeholder="F-GXYZ"
                    autoCapitalize="characters"
                    maxLength={10}
                    onChange={(v) => setP({ ...p, aircraftReg: v.toUpperCase() })}
                />
                <Field
                    label="Fréquence radio de contact"
                    value={p.radioFreq}
                    placeholder="123.500"
                    keyboardType="decimal-pad"
                    maxLength={8}
                    onChange={(v) => setP({ ...p, radioFreq: v })}
                />
                <View style={s.freqRow}>
                    {FREQS.map((f) => (
                        <Pressable
                            key={f}
                            onPress={() => setP({ ...p, radioFreq: f })}
                            style={({ pressed }) => [s.chip, pressed && { opacity: 0.7 }]}
                        >
                            <Text style={s.chipTxt}>{f}</Text>
                        </Pressable>
                    ))}
                </View>

                <View style={s.switchRow}>
                    <View style={{ flex: 1, paddingRight: 12 }}>
                        <Text style={s.label}>Mentionner « en vol, appel vocal impossible »</Text>
                        <Text style={s.help}>
                            Explique au destinataire pourquoi le signalement arrive par écrit.
                        </Text>
                    </View>
                    <Switch
                        value={p.mentionInFlight}
                        onValueChange={(v) => setP({ ...p, mentionInFlight: v })}
                    />
                </View>

                <Text style={s.section}>Carte</Text>
                <Field
                    label="Clé OpenAIP (facultative)"
                    value={p.openAipKey ?? ''}
                    placeholder="laisser vide si vous n’en avez pas"
                    autoCapitalize="none"
                    maxLength={64}
                    onChange={(v) => setP({ ...p, openAipKey: v.trim() })}
                />
                <Text style={s.help}>
                    Active la surcouche aéronautique de la carte (espaces aériens). Une clé
                    gratuite s’obtient sur openaip.net, dans les paramètres de votre compte. Sans
                    clé, la carte n’affiche que le fond OpenStreetMap — les alertes fonctionnent
                    normalement.
                </Text>
            </ScrollView>

            <View style={[s.actions, { paddingBottom: Math.max(insets.bottom, 12) }]}>
                <Btn label="Enregistrer" variant="primary" disabled={!ok} onPress={() => onSave(p)} />
                {onCancel ? (
                    <Btn label="Retour" variant="ghost" onPress={onCancel} style={{ marginTop: 8 }} />
                ) : null}
            </View>
        </View>
    );
}

function Field({
    label,
    value,
    onChange,
    placeholder,
    autoCapitalize,
    keyboardType,
    maxLength,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    autoCapitalize?: 'none' | 'words' | 'characters';
    keyboardType?: 'default' | 'decimal-pad';
    maxLength?: number;
}) {
    return (
        <View style={{ marginTop: 16 }}>
            <Text style={s.label}>{label}</Text>
            <TextInput
                value={value}
                onChangeText={onChange}
                placeholder={placeholder}
                placeholderTextColor="#9aa4b0"
                autoCapitalize={autoCapitalize}
                autoCorrect={false}
                keyboardType={keyboardType}
                maxLength={maxLength}
                style={s.input}
            />
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#f4f6f8' },
    scroll: { padding: 16 },
    h1: { fontSize: 26, fontWeight: '900', color: C.text },
    intro: { fontSize: 13, color: C.textDim, marginTop: 6, lineHeight: 18 },
    label: { fontSize: 13, fontWeight: '800', color: C.textDim, marginBottom: 6 },
    section: {
        fontSize: 13,
        fontWeight: '900',
        color: C.text,
        marginTop: 28,
        textTransform: 'uppercase',
    },
    help: { fontSize: 12, color: C.textDim, marginTop: 2 },
    input: {
        backgroundColor: C.white,
        borderWidth: 1,
        borderColor: C.border,
        borderRadius: 12,
        paddingHorizontal: 14,
        minHeight: 56,
        fontSize: 18,
        fontWeight: '700',
        color: C.text,
    },
    freqRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
    chip: {
        backgroundColor: C.white,
        borderWidth: 1,
        borderColor: C.border,
        borderRadius: 999,
        paddingVertical: 10,
        paddingHorizontal: 14,
    },
    chipTxt: { fontWeight: '700', color: C.text },
    switchRow: { flexDirection: 'row', alignItems: 'center', marginTop: 24 },
    actions: {
        paddingHorizontal: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderColor: C.border,
        backgroundColor: C.white,
    },
});
