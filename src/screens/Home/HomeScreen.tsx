import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AppStackParamList } from "../../navigation/AppStack";
import { auth } from "../../services/firebase";

type Props = NativeStackScreenProps<AppStackParamList, "Home">;

export default function HomeScreen({ navigation }: Props) {
    const user = auth.currentUser;

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Logged in ✅</Text>
            <Text style={styles.subtitle}>{user?.displayName ?? user?.email}</Text>

            <Pressable style={styles.button} onPress={() => navigation.navigate("Profile")}>
                <Text style={styles.buttonText}>Go to Profile</Text>
            </Pressable>
            <Pressable style={styles.button} onPress={() => navigation.navigate("TeamUp")}>
                <Text style={styles.buttonText}>Team Up</Text>
            </Pressable>
            <Pressable style={styles.button} onPress={() => navigation.navigate("TeamDetail")}>
                <Text style={styles.buttonText}>My Team</Text>
            </Pressable>

        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20 },
    title: { fontSize: 22, fontWeight: "800" },
    subtitle: { marginTop: 8, fontSize: 14, opacity: 0.8 },
    button: { marginTop: 18, backgroundColor: "#111", padding: 12, borderRadius: 12 },
    buttonText: { color: "white", fontWeight: "700" },
});
