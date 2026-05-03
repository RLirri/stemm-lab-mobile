import React, {useEffect} from 'react';
import {Modal, StyleSheet, View} from 'react-native';
import {Feather} from '@expo/vector-icons';

import {colors, radius, shadows, spacing} from '../../theme';
import {AppText} from './AppText';

type Tone = 'success' | 'info' | 'warning' | 'danger';

type Props = {
    visible: boolean;
    title: string;
    message?: string;
    tone?: Tone;
    onHide: () => void;
};

const toneConfig = {
    success: {icon: 'check-circle', color: colors.success},
    info: {icon: 'info', color: colors.primary},
    warning: {icon: 'alert-circle', color: colors.warning},
    danger: {icon: 'alert-triangle', color: colors.danger},
} as const;

export function AppStatusToast({
                                   visible,
                                   title,
                                   message,
                                   tone = 'success',
                                   onHide,
                               }: Props) {
    useEffect(() => {
        if (!visible) return;

        const timer = setTimeout(onHide, 1600);
        return () => clearTimeout(timer);
    }, [visible, onHide]);

    const config = toneConfig[tone];

    return (
        <Modal transparent visible={visible} animationType="fade">
            <View style={styles.wrapper}>
                <View style={styles.toast}>
                    <Feather name={config.icon} size={24} color={config.color}/>

                    <View style={styles.textArea}>
                        <AppText variant="bodyStrong">{title}</AppText>
                        {message ? (
                            <AppText variant="caption" color="textMuted" style={styles.message}>
                                {message}
                            </AppText>
                        ) : null}
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        flex: 1,
        justifyContent: 'flex-start',
        paddingTop: 80,
        paddingHorizontal: spacing.lg,
    },

    toast: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        backgroundColor: colors.surface,
        borderRadius: radius.xl,
        padding: spacing.lg,
        ...shadows.floating,
    },

    textArea: {
        flex: 1,
    },

    message: {
        marginTop: spacing.xs,
    },
});