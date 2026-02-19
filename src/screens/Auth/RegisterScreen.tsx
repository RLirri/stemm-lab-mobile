import React, {useState} from "react";
import {View, Text, TextInput, Pressable, StyleSheet, Alert} from "react-native";
import {useForm} from "react-hook-form";
import {z} from "zod";
import {zodResolver} from "@hookform/resolvers/zod";
import {NativeStackScreenProps} from "@react-navigation/native-stack";
import {AuthStackParamList} from "../../navigation/AuthStack";
import {registerWithEmail} from "../../services/authService";
import {friendlyAuthError} from "../../utils/firebaseErrors";

const schema = z
    .object({
        displayName: z.string().min(2, "Name must be at least 2 characters"),
        email: z.string().email("Enter a valid email"),
        password: z.string().min(6, "Password must be at least 6 characters"),
        confirmPassword: z.string().min(6, "Confirm your password"),
    })
    .refine((d) => d.password === d.confirmPassword, {
        message: "Passwords do not match",
        path: ["confirmPassword"],
    });

type FormData = z.infer<typeof schema>;
type Props = NativeStackScreenProps<AuthStackParamList, "Register">;

export default function RegisterScreen({navigation}: Props) {
    const [submitting, setSubmitting] = useState(false);

    const {
        register,
        setValue,
        handleSubmit,
        formState: {errors},
    } = useForm<FormData>({resolver: zodResolver(schema)});

    React.useEffect(() => {
        register("displayName");
        register("email");
        register("password");
        register("confirmPassword");
    }, [register]);

    const onSubmit = async (data: FormData) => {
        try {
            setSubmitting(true);
            await registerWithEmail(data.email, data.password, data.displayName);
        } catch (e: any) {
            Alert.alert("Registration failed", friendlyAuthError(e?.code));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Create account</Text>

            <Text style={styles.label}>Name</Text>
            <TextInput
                style={styles.input}
                placeholder="Your name"
                onChangeText={(t) => setValue("displayName", t, {shouldValidate: true})}
            />
            {!!errors.displayName && <Text style={styles.error}>{errors.displayName.message}</Text>}

            <Text style={styles.label}>Email</Text>
            <TextInput
                style={styles.input}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="you@example.com"
                onChangeText={(t) => setValue("email", t, {shouldValidate: true})}
            />
            {!!errors.email && <Text style={styles.error}>{errors.email.message}</Text>}

            <Text style={styles.label}>Password</Text>
            <TextInput
                style={styles.input}
                secureTextEntry
                placeholder="At least 6 characters"
                onChangeText={(t) => setValue("password", t, {shouldValidate: true})}
            />
            {!!errors.password && <Text style={styles.error}>{errors.password.message}</Text>}

            <Text style={styles.label}>Confirm password</Text>
            <TextInput
                style={styles.input}
                secureTextEntry
                placeholder="Repeat password"
                onChangeText={(t) => setValue("confirmPassword", t, {shouldValidate: true})}
            />
            {!!errors.confirmPassword && (
                <Text style={styles.error}>{errors.confirmPassword.message}</Text>
            )}

            <Pressable
                style={[styles.button, submitting && styles.buttonDisabled]}
                disabled={submitting}
                onPress={handleSubmit(onSubmit)}
            >
                <Text style={styles.buttonText}>
                    {submitting ? "Creating..." : "Register"}
                </Text>
            </Pressable>

            <Pressable onPress={() => navigation.navigate("Login")}>
                <Text style={styles.link}>Already have an account? Login</Text>
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {flex: 1, padding: 20, justifyContent: "center"},
    title: {fontSize: 28, fontWeight: "700", marginBottom: 24},
    label: {fontSize: 14, fontWeight: "600", marginTop: 10},
    input: {
        borderWidth: 1,
        borderColor: "#ddd",
        borderRadius: 12,
        padding: 12,
        marginTop: 6,
    },
    error: {color: "crimson", marginTop: 6},
    button: {
        backgroundColor: "#111",
        padding: 14,
        borderRadius: 12,
        alignItems: "center",
        marginTop: 18,
    },
    buttonDisabled: {opacity: 0.6},
    buttonText: {color: "white", fontWeight: "700"},
    link: {marginTop: 16, textAlign: "center", fontWeight: "600"},
});
