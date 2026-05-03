import React, {useEffect, useState} from 'react';
import {Pressable, StyleSheet} from 'react-native';

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
        clientId: 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com',
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
        if (response?.type === 'success') {
            const {id_token} = response.params;
            const credential = GoogleAuthProvider.credential(id_token);

            setGoogleLoading(true);

            signInWithCredential(auth, credential)
                .catch((e) => {
                    showToast('Google login failed', friendlyAuthError(e?.code), 'danger');
                })
                .finally(() => {
                    setGoogleLoading(false);
                });
        }
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

    return (
        <AppGradientScreen contentStyle={styles.screenContent}>
            <AppText variant="caption" color="textMuted">
                STEMM Lab
            </AppText>

            <AppText variant="title" style={styles.title}>
                Welcome back
            </AppText>

            <AppText variant="body" color="textMuted" style={styles.subtitle}>
                Sign in to continue your activities, team collaboration, and offline submissions.
            </AppText>

            <AppCard style={styles.card}>
                <AppText variant="sectionTitle">Login</AppText>

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
                    onPress={() => promptAsync()}
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

    loginButton: {
        marginTop: spacing.md,
    },

    googleButton: {
        marginTop: spacing.md,
        borderColor: colors.primary,
    },

    link: {
        marginTop: spacing.sm,
    },
});