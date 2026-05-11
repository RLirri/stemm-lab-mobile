import React from 'react';
import {Modal, Pressable, StyleSheet, View} from 'react-native';

import {colors, radius, shadows, spacing} from '../../theme';
import {AppButton} from './AppButton';
import {AppText} from './AppText';

type Props = {
    visible: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
};

export function AppConfirmDialog({
                                     visible,
                                     title,
                                     message,
                                     confirmLabel = 'Confirm',
                                     cancelLabel = 'Cancel',
                                     danger = false,
                                     onConfirm,
                                     onCancel,
                                 }: Props) {
    return (
        <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
            <Pressable style={styles.backdrop} onPress={onCancel}>
                <Pressable style={styles.dialog}>
                    <AppText variant="subtitle">{title}</AppText>

                    <AppText variant="body" color="textMuted" style={styles.message}>
                        {message}
                    </AppText>

                    <View style={styles.actions}>
                        <AppButton
                            title={cancelLabel}
                            variant="outline"
                            onPress={onCancel}
                            fullWidth={false}
                            style={styles.actionButton}
                        />

                        <AppButton
                            title={confirmLabel}
                            variant={danger ? 'danger' : 'primary'}
                            onPress={onConfirm}
                            fullWidth={false}
                            style={styles.actionButton}
                        />
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.38)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.xl,
    },

    dialog: {
        width: '100%',
        backgroundColor: colors.surface,
        borderRadius: radius.xl,
        padding: spacing.xl,
        ...shadows.floating,
    },

    message: {
        marginTop: spacing.sm,
    },

    actions: {
        flexDirection: 'row',
        gap: spacing.md,
        marginTop: spacing.xl,
    },

    actionButton: {
        flex: 1,
    },
});