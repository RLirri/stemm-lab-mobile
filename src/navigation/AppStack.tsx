import React from "react";
import {createNativeStackNavigator} from "@react-navigation/native-stack";

import HomeScreen from "../screens/Home/HomeScreen";
import ProfileScreen from "../screens/Profile/ProfileScreen";
import TeamUpScreen from "../screens/Teams/TeamUpScreen";
import TeamDetailScreen from "../screens/Teams/TeamDetailScreen";
import ExploreTeamsScreen from "../screens/Teams/ExploreTeamsScreen";
import LeaderboardScreen from "../screens/Leaderboard/LeaderboardScreen";
import ActivitiesListScreen from "../screens/Activities/ActivitiesListScreen";
import ActivityDetailScreen from "../screens/Activities/ActivityDetailScreen";

// Activity 1 (Parachute Drop) flow screens
import A1SessionSetupScreen from "../screens/Activities/Activity1/A1SessionSetupScreen";
import A1AttemptPlanScreen from "../screens/Activities/Activity1/A1AttemptPlanScreen";
import A1MeasurementsScreen from "../screens/Activities/Activity1/A1MeasurementsScreen";
import A1ResultScreen from "../screens/Activities/Activity1/A1ResultScreen";
import A1ComparisonScreen from "../screens/Activities/Activity1/A1ComparisonScreen";
import A1ReflectionSubmitScreen from "../screens/Activities/Activity1/A1ReflectionSubmitScreen";

export type AppStackParamList = {
    Home: undefined;
    Profile: undefined;

    TeamUp: undefined;
    TeamDetail: { teamId?: string; mode?: "my" | "view" } | undefined;
    ExploreTeams: undefined;

    Leaderboard: undefined;

    Activities: undefined;
    ActivityDetail: { activityId: string };

    // Activity 1 flow (v1)
    A1SessionSetup: { activityId: string; runId?: string };
    A1AttemptPlan: { activityId: string; runId: string; attemptIndex: number };
    A1Measurements: { activityId: string; runId: string; attemptIndex: number };
    A1Result: { activityId: string; runId: string; attemptIndex: number };
    A1Comparison: { activityId: string; runId: string };
    A1ReflectionSubmit: { activityId: string; runId: string };
};

const Stack = createNativeStackNavigator<AppStackParamList>();

export default function AppStack() {
    return (
        <Stack.Navigator screenOptions={{headerTitleAlign: "center"}}>
            <Stack.Screen name="Home" component={HomeScreen} options={{title: "STEMM Lab"}}/>
            <Stack.Screen name="Profile" component={ProfileScreen} options={{title: "Profile"}}/>

            <Stack.Screen name="TeamUp" component={TeamUpScreen} options={{title: "Team Up"}}/>
            <Stack.Screen name="TeamDetail" component={TeamDetailScreen} options={{title: "My Team"}}/>
            <Stack.Screen
                name="ExploreTeams"
                component={ExploreTeamsScreen}
                options={{title: "Explore Teams"}}
            />

            <Stack.Screen name="Leaderboard" component={LeaderboardScreen} options={{title: "Leaderboard"}}/>

            <Stack.Screen name="Activities" component={ActivitiesListScreen} options={{title: "Activities"}}/>
            <Stack.Screen name="ActivityDetail" component={ActivityDetailScreen} options={{title: "Activity"}}/>

            {/* Activity 1: Parachute Drop Challenge */}
            <Stack.Screen name="A1SessionSetup" component={A1SessionSetupScreen} options={{title: "Session Setup"}}/>
            <Stack.Screen name="A1AttemptPlan" component={A1AttemptPlanScreen} options={{title: "Attempt Plan"}}/>
            <Stack.Screen name="A1Measurements" component={A1MeasurementsScreen} options={{title: "Measurements"}}/>
            <Stack.Screen name="A1Result" component={A1ResultScreen} options={{title: "Results"}}/>
            <Stack.Screen name="A1Comparison" component={A1ComparisonScreen} options={{title: "Compare"}}/>
            <Stack.Screen name="A1ReflectionSubmit" component={A1ReflectionSubmitScreen}
                          options={{title: "Reflection & Submit"}}
            />
        </Stack.Navigator>
    );
}