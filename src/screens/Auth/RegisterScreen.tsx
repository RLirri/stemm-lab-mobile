import React, {useEffect, useState} from 'react';
import {Pressable, StyleSheet} from 'react-native';

import {useForm} from 'react-hook-form';
import {z} from 'zod';
import {zodResolver} from '@hookform/resolvers/zod';
import {NativeStackScreenProps} from '@react-navigation/native-stack';

import {AuthStackParamList} from '../../navigation/AuthStack';
import {registerWithEmail} from '../../services/authService';
import {friendlyAuthError} from '../../utils/firebaseErrors';

import {
    AppButton,
    AppCard,
    AppGradientScreen,
    AppInput,
    AppStatusToast,
    AppText,
} from '../../components/ui';

import {spacing} from '../../theme';

const schema = z
    .object({
        displayName: z.string().min(2, 'Name must be at least 2 characters'),
        email: z.string().email('Enter a valid email'),
        password: z.string().min(6, 'Password must be at least 6 characters'),
        confirmPassword: z.string().min(6, 'Confirm your password'),
    })
    .refine((d) => d.password === d.confirmPassword, {
        message: 'Passwords do not match',
        path: ['confirmPassword'],
    });

type FormData = z.infer<typeof schema>;
type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

type ToastState = {
    visible: boolean;
    title: string;
    message?: string;
    tone?: 'success' | 'info' | 'warning' | 'danger';
};

export default function RegisterScreen({navigation}: Props) {
    const [submitting, setSubmitting] = useState(false);

    const [toast, setToast] = useState<ToastState>({
        visible: false,
        title: '',
    });

    const {
        register,
        setValue,
        handleSubmit,
        formState: {errors},
    } = useForm<FormData>({
        resolver: zodResolver(schema),
    });

    useEffect(() => {
        register('displayName');
        register('email');
        register('password');
        register('confirmPassword');
    }, [register]);

    const showToast = (
        title: string,
        message?: string,
        tone: ToastState['tone'] = 'danger',
    ) => {
        setToast({
            visible: true,
            title,
            message,
            tone,
        });
    };

    const onSubmit = async (data: FormData) => {
        try {
            setSubmitting(true);

            await registerWithEmail(
                data.email,
                data.password,
                data.displayName,
            );

            showToast(
                'Account created',
                'Your STEMM Lab account has been created successfully.',
                'success',
            );
        } catch (e: any) {
            showToast(
                'Registration failed',
                friendlyAuthError(e?.code),
                'danger',
            );
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <AppGradientScreen contentStyle={styles.screenContent}>
            <AppText variant="caption" color="textMuted">
                STEMM Lab
            </AppText>

            <AppText variant="title" style={styles.title}>
                Create account
            </AppText>

            <AppText variant="body" color="textMuted" style={styles.subtitle}>
                Join STEMM Lab to participate in collaborative activities, experiments,
                and offline learning workflows.
            </AppText>

            <AppCard style={styles.card}>
                <AppText variant="sectionTitle">
                    Register
                </AppText>

                <AppInput
                    placeholder="Your name"
                    onChangeText={(text) =>
                        setValue('displayName', text, {
                            shouldValidate: true,
                        })
                    }
                />

                {errors.displayName ? (
                    <AppText variant="caption" color="danger" style={styles.error}>
                        {errors.displayName.message}
                    </AppText>
                ) : null}

                <AppInput
                    placeholder="you@example.com"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    onChangeText={(text) =>
                        setValue('email', text, {
                            shouldValidate: true,
                        })
                    }
                />

                {errors.email ? (
                    <AppText variant="caption" color="danger" style={styles.error}>
                        {errors.email.message}
                    </AppText>
                ) : null}

                <AppInput
                    placeholder="At least 6 characters"
                    secureTextEntry
                    onChangeText={(text) =>
                        setValue('password', text, {
                            shouldValidate: true,
                        })
                    }
                />

                {errors.password ? (
                    <AppText variant="caption" color="danger" style={styles.error}>
                        {errors.password.message}
                    </AppText>
                ) : null}

                <AppInput
                    placeholder="Repeat password"
                    secureTextEntry
                    onChangeText={(text) =>
                        setValue('confirmPassword', text, {
                            shouldValidate: true,
                        })
                    }
                />

                {errors.confirmPassword ? (
                    <AppText variant="caption" color="danger" style={styles.error}>
                        {errors.confirmPassword.message}
                    </AppText>
                ) : null}

                <AppButton
                    title={submitting ? 'Creating account...' : 'Register'}
                    onPress={handleSubmit(onSubmit)}
                    loading={submitting}
                    disabled={submitting}
                    style={styles.registerButton}
                />
            </AppCard>

            <Pressable onPress={() => navigation.navigate('Login')}>
                <AppText
                    variant="bodyStrong"
                    color="primary"
                    align="center"
                    style={styles.link}
                >
                    Already have an account? Login
                </AppText>
            </Pressable>

            <AppStatusToast
                visible={toast.visible}
                title={toast.title}
                message={toast.message}
                tone={toast.tone}
                onHide={() =>
                    setToast((prev) => ({
                        ...prev,
                        visible: false,
                    }))
                }
            />
        </AppGradientScreen>
    );
}

const styles = StyleSheet.create({
    screenContent: {
        justifyContent: 'center',
    },

    title: {
        marginTop: spacing.xs,
    },

    subtitle: {
        marginTop: spacing.sm,
        marginBottom: spacing.xl,
    },

    card: {
        marginBottom: spacing.lg,
    },

    error: {
        marginTop: -spacing.sm,
        marginBottom: spacing.sm,
    },

    registerButton: {
        marginTop: spacing.md,
    },

    link: {
        marginTop: spacing.sm,
        marginBottom: spacing.lg,
    },
});