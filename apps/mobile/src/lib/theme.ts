/**
 * Palette « cockpit » : fort contraste, lisible en plein soleil derrière une
 * verrière, cibles tactiles généreuses pour une utilisation en turbulence.
 */
import { Platform, StatusBar } from 'react-native';

export const C = {
    bg: '#0d1117',
    panel: 'rgba(255,255,255,0.94)',
    panelDark: '#161b22',
    text: '#0d1117',
    textDim: '#4a5462',
    textOnDark: '#f0f3f6',
    border: '#c8d0da',
    alert: '#d40000',
    alertDark: '#a30000',
    ok: '#1a7f37',
    warn: '#b45309',
    blue: '#0a58ff',
    white: '#ffffff',
};

/** Hauteur minimale d'une cible tactile utilisable en vol. */
export const TAP = 60;

/**
 * Hauteur de la barre d'état, à réserver en haut des écrans.
 * `SafeAreaView` de react-native n'applique aucune marge sur Android (et est
 * déprécié) : sans cela, les titres passent sous l'horloge.
 */
export const STATUS_BAR_H =
    Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 44;
