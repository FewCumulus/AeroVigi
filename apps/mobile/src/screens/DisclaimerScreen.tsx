/**
 * Conditions d'utilisation, affichées au premier lancement.
 *
 * Ce n'est pas une formalité : le 114 est un service dont la vocation première
 * est l'accès aux secours des personnes sourdes, malentendantes ou aphasiques.
 * L'utilisateur doit savoir ce qu'il envoie, à qui, et ce que l'application ne
 * garantit pas.
 *
 * Ces textes sont aussi ce que lira un relecteur de magasin d'applications :
 * les modifier engage la conformité de la fiche (cf. docs/02-ios-app-store.md).
 */
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Btn } from '../components/Btn';
import { C } from '../lib/theme';

export function DisclaimerScreen({
    onAccept,
    readOnly,
    onClose,
}: {
    onAccept?: () => void;
    readOnly?: boolean;
    onClose?: () => void;
}) {
    const insets = useSafeAreaInsets();
    return (
        <View style={s.root}>
            <ScrollView contentContainerStyle={s.scroll}>
                <Text style={s.h1}>Avant d’utiliser AeroVigi</Text>

                <P title="La conduite de l’appareil d’abord">
                    En vol, la priorité reste la conduite de votre aéronef, la surveillance du ciel
                    et le respect des règles de l’air. L’usage du réseau mobile en vol est encadré
                    par la réglementation applicable à votre aéronef et à votre exploitation. Il
                    vous appartient de vérifier ce que vous avez le droit de faire à bord.
                </P>

                <P title="Ce qu’est le 114">
                    Le 114 est le numéro d’urgence national accessible par SMS, prévu d’abord pour
                    les personnes sourdes, malentendantes, sourdaveugles ou aphasiques, ainsi que
                    pour toute personne dans l’incapacité de parler. Un pilote au casque, moteur en
                    marche, ne peut pas tenir une conversation vocale. Utilisez ce canal avec
                    discernement : un signalement inutile occupe une ligne de secours.
                </P>

                <P title="Aucune garantie de transmission">
                    L’application ouvre votre messagerie avec un message prêt à partir. L’envoi
                    effectif dépend de votre opérateur et de la couverture réseau ; la prise en
                    compte dépend du service destinataire. AeroVigi ne garantit ni l’un ni l’autre,
                    et n’a aucune valeur d’alerte tant que le SMS n’est pas parti. Doublez toujours
                    votre envoi d’un signalement à la radio auprès de l’organisme de contrôle
                    aérien le plus proche, en lui lisant le message généré.
                </P>

                <P title="Au sol, appelez">
                    Dès que vous pouvez parler — au sol, moteur coupé — appelez le 18 ou le 112.
                    C’est plus rapide et plus complet qu’un échange écrit.
                </P>

                <P title="Vos données">
                    Nom, immatriculation, fréquence et positions restent sur ce téléphone. Ils ne
                    sont transmis qu’aux destinataires de vos messages, par votre propre
                    application de messagerie.
                </P>
            </ScrollView>
            <View style={[s.actions, { paddingBottom: Math.max(insets.bottom, 12) }]}>
                {readOnly ? (
                    <Btn label="Retour" variant="primary" onPress={onClose!} />
                ) : (
                    <Btn label="J’ai lu et je comprends" variant="primary" onPress={onAccept!} />
                )}
            </View>
        </View>
    );
}

function P({ title, children }: { title: string; children: string }) {
    return (
        <View style={{ marginTop: 20 }}>
            <Text style={s.h2}>{title}</Text>
            <Text style={s.body}>{children}</Text>
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#f4f6f8' },
    scroll: { padding: 20, paddingBottom: 8 },
    h1: { fontSize: 26, fontWeight: '900', color: C.text },
    h2: { fontSize: 16, fontWeight: '800', color: C.text },
    body: { fontSize: 15, color: C.textDim, lineHeight: 22, marginTop: 4 },
    actions: {
        paddingHorizontal: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderColor: C.border,
        backgroundColor: C.white,
    },
});
