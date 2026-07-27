import { Pressable, Text, StyleSheet, type ViewStyle } from 'react-native';
import { C, TAP } from '../lib/theme';

type Props = {
    label: string;
    onPress: () => void;
    variant?: 'alert' | 'primary' | 'secondary' | 'ghost';
    disabled?: boolean;
    big?: boolean;
    style?: ViewStyle;
};

export function Btn({ label, onPress, variant = 'primary', disabled, big, style }: Props) {
    const bg =
        variant === 'alert'
            ? C.alert
            : variant === 'primary'
              ? C.blue
              : variant === 'secondary'
                ? C.white
                : 'transparent';
    const fg = variant === 'secondary' ? C.text : variant === 'ghost' ? C.textDim : C.white;
    return (
        <Pressable
            onPress={onPress}
            disabled={disabled}
            style={({ pressed }) => [
                s.base,
                {
                    backgroundColor: bg,
                    opacity: disabled ? 0.4 : pressed ? 0.75 : 1,
                    minHeight: big ? 84 : TAP,
                    borderWidth: variant === 'secondary' || variant === 'ghost' ? 1 : 0,
                    borderColor: C.border,
                },
                style,
            ]}
        >
            <Text style={[s.label, { color: fg, fontSize: big ? 24 : 17 }]}>{label}</Text>
        </Pressable>
    );
}

const s = StyleSheet.create({
    base: {
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
    },
    label: { fontWeight: '800', letterSpacing: 0.3, textAlign: 'center' },
});
