import React, {useState} from "react";
import {View, Text, Pressable, StyleSheet, Alert, DevMenu} from "react-native";
import {NativeStackScreenProps} from "@react-navigation/native-stack";
import {AppStackParamList} from "../../navigation/AppStack";
import {auth} from "../../services/firebase";
import {backfillTeamStats} from "../../services/teamMigrationService";
import {seedActivities} from "../../services/activityAdminService";
import {activityCatalog} from "../../features/activities/activityCatalog";
import {BatteryStatusCard} from "../../components/battery/BatteryStatusCard";


type Props = NativeStackScreenProps<AppStackParamList, "Home">;


export default function HomeScreen({navigation}: Props) {
    const user = auth.currentUser;
    console.log("UID:", user?.uid, "EMAIL:", user?.email, "DISPLAY:", user?.displayName);
    const [migrating, setMigrating] = useState(false);
    const ADMIN_UIDS = ["U9Uicg91tbVUTBQvyFpmB3rXtI92"];
    const isAdmin = !!user?.uid && ADMIN_UIDS.includes(user.uid);

    const handleBackfill = async () => {
        try {
            setMigrating(true);
            const result = await backfillTeamStats();
            Alert.alert(
                "Backfill Complete ✅",
                `Scanned: ${result.scanned}\nUpdated: ${result.updated}`
            );
        } catch (error: any) {
            Alert.alert("Error ❌", error?.message ?? "Unknown error");
        } finally {
            setMigrating(false);
        }
    };
    const handleSeedActivities = async () => {
        try {
            setMigrating(true);
            const res = await seedActivities(activityCatalog);
            Alert.alert("Seed Complete ✅", `Upserted: ${res.upserted}`);
        } catch (error: any) {
            Alert.alert("Error ❌", error?.message ?? "Unknown error");
        } finally {
            setMigrating(false);
        }
    };


    return (
        <View style={styles.container}>
            <Text style={styles.title}>Logged in ✅</Text>
            <Text style={styles.subtitle}>{user?.displayName ?? user?.email}</Text>
            <BatteryStatusCard compact/>

            <Pressable style={styles.button} onPress={() => navigation.navigate("Profile")}>
                <Text style={styles.buttonText}>Go to Profile</Text>
            </Pressable>
            <Pressable style={styles.button} onPress={() => navigation.navigate("TeamUp")}>
                <Text style={styles.buttonText}>Team Up</Text>
            </Pressable>
            <Pressable style={styles.button} onPress={() => navigation.navigate("TeamDetail")}>
                <Text style={styles.buttonText}>My Team</Text>
            </Pressable>
            <Pressable style={styles.button} onPress={() => navigation.navigate("Leaderboard")}>
                <Text style={styles.buttonText}>Leaderboard</Text>
            </Pressable>
            {__DEV__ && isAdmin ? (
                <Pressable
                    style={[styles.button, migrating && {opacity: 0.6}]}
                    onPress={handleBackfill}
                    disabled={migrating}
                >
                    <Text style={styles.buttonText}>
                        {migrating ? "DEV: Migrating..." : "DEV: Backfill team stats"}
                    </Text>
                </Pressable>
            ) : null}
            {__DEV__ && isAdmin ? (
                <Pressable
                    style={[styles.button, migrating && {opacity: 0.6}]}
                    onPress={handleSeedActivities}
                    disabled={migrating}
                >
                    <Text style={styles.buttonText}>
                        {migrating ? "DEV: Seeding..." : "DEV: Seed activities"}
                    </Text>
                </Pressable>
            ) : null}
            <Pressable style={styles.button} onPress={() => navigation.navigate("Activities")}>
                <Text style={styles.buttonText}>Activities</Text>
            </Pressable>
        </View>

    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: "center",
        alignItems: "stretch",
        padding: 20,
    },
    title: {fontSize: 22, fontWeight: "800"},
    subtitle: {marginTop: 8, fontSize: 14, opacity: 0.8},
    button: {
        marginTop: 18,
        backgroundColor: "#111",
        padding: 12,
        borderRadius: 12,
        alignItems: "center",
    },
    buttonText: {color: "white", fontWeight: "700"},
});
