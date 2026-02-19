import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import HomeScreen from "../screens/Home/HomeScreen";
import ProfileScreen from "../screens/Profile/ProfileScreen";
import TeamUpScreen from "../screens/Teams/TeamUpScreen";
import TeamDetailScreen from "../screens/Teams/TeamDetailScreen";
import ExploreTeamsScreen from "../screens/Teams/ExploreTeamsScreen";

export type AppStackParamList = {
    Home: undefined;
    Profile: undefined;
    TeamUp: undefined;
    TeamDetail: undefined;
    ExploreTeams: undefined;
};

const Stack = createNativeStackNavigator<AppStackParamList>();

export default function AppStack() {
    return (
        <Stack.Navigator screenOptions={{ headerTitleAlign: "center" }}>
            <Stack.Screen name="Home" component={HomeScreen} options={{ title: "STEMM Lab" }} />
            <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: "Profile" }} />
            <Stack.Screen name="TeamUp" component={TeamUpScreen} options={{ title: "Team Up" }} />
            <Stack.Screen name="TeamDetail" component={TeamDetailScreen} options={{ title: "My Team" }} />
            <Stack.Screen name="ExploreTeams" component={ExploreTeamsScreen}  options={{ title: "Explore Teams" }}
            />
        </Stack.Navigator>
    );
}
