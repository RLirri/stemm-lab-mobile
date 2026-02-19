import React, {useEffect, useState} from "react";
import {
    View,
    Text,
    TextInput,
    Pressable,
    StyleSheet,
    Alert,
    ActivityIndicator,
} from "react-native";

import {useForm} from "react-hook-form";
import {z} from "zod";
import {zodResolver} from "@hookform/resolvers/zod";
import {NativeStackScreenProps} from "@react-navigation/native-stack";

import {AuthStackParamList} from "../../navigation/AuthStack";
import {loginWithEmail} from "../../services/authService";
import {friendlyAuthError} from "../../utils/firebaseErrors";

import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";

import {GoogleAuthProvider, signInWithCredential} from "firebase/auth";
import {auth} from "../../services/firebase";

WebBrowser.maybeCompleteAuthSession();

const schema = z.object({
    email: z.string().email("Enter a valid email"),
    password: z.string().min(6, "Password must be at least 6 characters"),
});

type FormData = z.infer<typeof schema>;
type Props = NativeStackScreenProps<AuthStackParamList, "Login">;

export default function LoginScreen({navigation}: Props) {
    const [submitting, setSubmitting] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);

    const {
        register,
        setValue,
        handleSubmit,
        formState: {errors},
    } = useForm<FormData>({
        resolver: zodResolver(schema),
    });

    // Register form fields
    useEffect(() => {
        register("email");
        register("password");
    }, [register]);

    // 🔥 Google OAuth configuration
    const [request, response, promptAsync] = Google.useAuthRequest({
        clientId: "YOUR_WEB_CLIENT_ID.apps.googleusercontent.com",
    });

    // 🔥 Handle Google response
    useEffect(() => {
        if (response?.type === "success") {
            const {id_token} = response.params;

            const credential = GoogleAuthProvider.credential(id_token);

            setGoogleLoading(true);

            signInWithCredential(auth, credential)
                .catch((e) => {
                    Alert.alert("Google login failed", friendlyAuthError(e?.code));
                })
                .finally(() => {
                    setGoogleLoading(false);
                });
        }
    }, [response]);

    // Email login
    const onSubmit = async (data: FormData) => {
        try {
            setSubmitting(true);
            await loginWithEmail(data.email, data.password);
        } catch (e: any) {
            Alert.alert("Login failed", friendlyAuthError(e?.code));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Welcome back</Text>

            {/* EMAIL */}
            <Text style={styles.label}>Email</Text>
            <TextInput
                style={styles.input}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="you@example.com"
                onChangeText={(t) =>
                    setValue("email", t, {shouldValidate: true})
                }
            />
            {!!errors.email && (
                <Text style={styles.error}>{errors.email.message}</Text>
            )}

            {/* PASSWORD */}
            <Text style={styles.label}>Password</Text>
            <TextInput
                style={styles.input}
                secureTextEntry
                placeholder="••••••••"
                onChangeText={(t) =>
                    setValue("password", t, {shouldValidate: true})
                }
            />
            {!!errors.password && (
                <Text style={styles.error}>{errors.password.message}</Text>
            )}

            {/* LOGIN BUTTON */}
            <Pressable
                style={[styles.button, submitting && styles.buttonDisabled]}
                disabled={submitting}
                onPress={handleSubmit(onSubmit)}
            >
                {submitting ? (
                    <ActivityIndicator color="white"/>
                ) : (
                    <Text style={styles.buttonText}>Login</Text>
                )}
            </Pressable>

            {/* GOOGLE BUTTON */}
            <Pressable
                style={[
                    styles.googleButton,
                    (!request || googleLoading) && styles.buttonDisabled,
                ]}
                disabled={!request || googleLoading}
                onPress={() => promptAsync()}
            >
                {googleLoading ? (
                    <ActivityIndicator color="white"/>
                ) : (
                    <Text style={styles.buttonText}>Continue with Google</Text>
                )}
            </Pressable>

            {/* REGISTER NAVIGATION */}
            <Pressable onPress={() => navigation.navigate("Register")}>
                <Text style={styles.link}>
                    No account? Create one
                </Text>
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 20,
        justifyContent: "center",
    },
    title: {
        fontSize: 28,
        fontWeight: "700",
        marginBottom: 24,
    },
    label: {
        fontSize: 14,
        fontWeight: "600",
        marginTop: 10,
    },
    input: {
        borderWidth: 1,
        borderColor: "#ddd",
        borderRadius: 12,
        padding: 12,
        marginTop: 6,
    },
    error: {
        color: "crimson",
        marginTop: 6,
    },
    button: {
        backgroundColor: "#111",
        padding: 14,
        borderRadius: 12,
        alignItems: "center",
        marginTop: 18,
    },
    googleButton: {
        backgroundColor: "#4285F4",
        padding: 14,
        borderRadius: 12,
        alignItems: "center",
        marginTop: 12,
    },
    buttonDisabled: {
        opacity: 0.6,
    },
    buttonText: {
        color: "white",
        fontWeight: "700",
    },
    link: {
        marginTop: 16,
        textAlign: "center",
        fontWeight: "600",
    },
});
