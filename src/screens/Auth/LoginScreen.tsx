import React, {useEffect, useState} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';

import {useForm} from 'react-hook-form';
import {z} from 'zod';
import {zodResolver} from '@hookform/resolvers/zod';
import {NativeStackScreenProps} from '@react-navigation/native-stack';

import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';

import {GoogleAuthProvider, signInWithCredential} from 'firebase/auth';

import {AuthStackParamList} from '../../navigation/AuthStack';
import {loginWithEmail} from '../../services/authService';
import {friendlyAuthError} from '../../utils/firebaseErrors';
import {auth} from '../../services/firebase';

import {
    AppButton,
    AppCard,
    AppGradientScreen,
    AppInput,
    AppStatusToast,
    AppText,
} from '../../components/ui';

import {colors, spacing} from '../../theme';

WebBrowser.maybeCompleteAuthSession();

const schema = z.object({
    email: z.string().email('Enter a valid email'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
});

type FormData = z.infer<typeof schema>;
type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

type ToastState = {
    visible: boolean;
    title: string;
    message?: string;
    tone?: 'success' | 'info' | 'warning' | 'danger';
};

const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const googleAndroidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;

export default function LoginScreen({navigation}: Props) {
    const [submitting, setSubmitting] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
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
        register('email');
        register('password');
    }, [register]);

    const [request, response, promptAsync] = Google.useAuthRequest({
        webClientId: googleWebClientId,
        androidClientId: googleAndroidClientId,
        scopes: ['profile', 'email'],
    });

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

    useEffect(() => {
        const signInWithGoogle = async () => {
            if (response?.type !== 'success') {
                return;
            }

            const idToken =
                response.authentication?.idToken ?? response.params?.id_token;

            if (!idToken) {
                showToast(
                    'Google login failed',
                    'Google did not return a valid ID token. Please try again or use email login.',
                    'danger',
                );
                return;
            }

            try {
                setGoogleLoading(true);
                const credential = GoogleAuthProvider.credential(idToken);
                await signInWithCredential(auth, credential);
            } catch (e: any) {
                showToast('Google login failed', friendlyAuthError(e?.code), 'danger');
            } finally {
                setGoogleLoading(false);
            }
        };

        signInWithGoogle();
    }, [response]);

    const onSubmit = async (data: FormData) => {
        try {
            setSubmitting(true);
            await loginWithEmail(data.email, data.password);
        } catch (e: any) {
            showToast('Login failed', friendlyAuthError(e?.code), 'danger');
        } finally {
            setSubmitting(false);
        }
    };

    const onGoogleLogin = async () => {
        if (!request) {
            showToast(
                'Google login unavailable',
                'Google sign-in is still preparing. Please try again shortly.',
                'warning',
            );
            return;
        }

        try {
            setGoogleLoading(true);
            await promptAsync();
        } catch {
            showToast(
                'Google login failed',
                'Unable to open Google sign-in. Please try again.',
                'danger',
            );
            setGoogleLoading(false);
        }
    };

    return (
        <AppGradientScreen contentStyle={styles.screenContent}>
            <View style={styles.hero}>
                <AppText variant="caption" color="textMuted">
                    STEMM Lab
                </AppText>

                <AppText variant="title" style={styles.title}>
                    Welcome back
                </AppText>

                <AppText variant="body" color="textMuted" style={styles.subtitle}>
                    Sign in to continue your activities, team collaboration, and offline submissions.
                </AppText>
            </View>

            <AppCard style={styles.card}>
                <AppText variant="sectionTitle" style={styles.cardTitle}>
                    Login
                </AppText>

                <View style={styles.inputGroup}>
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
                        placeholder="Password"
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
                </View>

                <AppButton
                    title={submitting ? 'Logging in...' : 'Login'}
                    onPress={handleSubmit(onSubmit)}
                    loading={submitting}
                    disabled={submitting}
                    style={styles.loginButton}
                />

                <AppButton
                    title={googleLoading ? 'Connecting...' : 'Continue with Google'}
                    variant="outline"
                    onPress={onGoogleLogin}
                    loading={googleLoading}
                    disabled={!request || googleLoading}
                    style={styles.googleButton}
                />
            </AppCard>

            <Pressable onPress={() => navigation.navigate('Register')}>
                <AppText variant="bodyStrong" color="primary" align="center" style={styles.link}>
                    No account? Create one
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

    hero: {
        marginBottom: spacing.xl,
    },

    title: {
        marginTop: spacing.xs,
    },

    subtitle: {
        marginTop: spacing.sm,
    },

    card: {
        marginBottom: spacing.lg,
    },

    cardTitle: {
        marginBottom: spacing.lg,
    },

    inputGroup: {
        gap: spacing.md,
    },

    error: {
        marginTop: -spacing.sm,
    },

    loginButton: {
        marginTop: spacing.xl,
    },

    googleButton: {
        marginTop: spacing.md,
        borderColor: colors.primary,
    },

    link: {
        marginTop: spacing.sm,
    },
});