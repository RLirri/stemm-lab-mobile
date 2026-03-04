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

/* ============================
   Activity 1 (Parachute Drop)
============================ */
import A1SessionSetupScreen from "../screens/Activities/Activity1/A1SessionSetupScreen";
import A1AttemptPlanScreen from "../screens/Activities/Activity1/A1AttemptPlanScreen";
import A1MeasurementsScreen from "../screens/Activities/Activity1/A1MeasurementsScreen";
import A1ResultScreen from "../screens/Activities/Activity1/A1ResultScreen";
import A1ComparisonScreen from "../screens/Activities/Activity1/A1ComparisonScreen";
import A1ReflectionSubmitScreen from "../screens/Activities/Activity1/A1ReflectionSubmitScreen";

/* ============================
   Activity 2 (Sound Pollution)
============================ */
import A2OverviewScreen from "../screens/Activities/Activity2/A2OverviewScreen";
import A2SessionSetupScreen from "../screens/Activities/Activity2/A2SessionSetupScreen";
import A2PredictionScreen from "../screens/Activities/Activity2/A2PredictionScreen";
import A2MeasurementScreen from "../screens/Activities/Activity2/A2MeasurementScreen";
import A2MapScreen from "../screens/Activities/Activity2/A2MapScreen";
import A2ResultsScreen from "../screens/Activities/Activity2/A2ResultsScreen";
import A2ReflectionSubmitScreen from "../screens/Activities/Activity2/A2ReflectionSubmitScreen";

/* ============================
   Activity 3 (Hand Fan Challenge)
============================ */
import A3OverviewScreen from "../screens/Activities/Activity3/A3OverviewScreen";
import A3PredictionScreen from "../screens/Activities/Activity3/A3PredictionScreen";
import A3MeasurementsScreen from "../screens/Activities/Activity3/A3MeasurementsScreen";
import A3ResultsScreen from "../screens/Activities/Activity3/A3ResultsScreen";
import A3ComparisonScreen from "../screens/Activities/Activity3/A3ComparisonScreen";
import A3ReflectionSubmitScreen from "../screens/Activities/Activity3/A3ReflectionSubmitScreen";
import A3SessionSetupScreen from "../screens/Activities/Activity3/A3SessionSetupScreen";

import A4OverviewScreen from "../screens/Activities/Activity4/A4OverviewScreen";
import A4SessionSetupScreen from "../screens/Activities/Activity4/A4SessionSetupScreen";
import A4PredictionScreen from "../screens/Activities/Activity4/A4PredictionScreen";
import A4MeasurementsScreen from "../screens/Activities/Activity4/A4MeasurementsScreen";
import A4ResultsScreen from "../screens/Activities/Activity4/A4ResultsScreen";
import A4ComparisonScreen from "../screens/Activities/Activity4/A4ComparisonScreen";
import A4ReflectionSubmitScreen from "../screens/Activities/Activity4/A4ReflectionSubmitScreen";


export type AppStackParamList = {
    Home: undefined;
    Profile: undefined;

    TeamUp: undefined;
    TeamDetail: { teamId?: string; mode?: "my" | "view" } | undefined;
    ExploreTeams: undefined;

    Leaderboard: undefined;

    Activities: undefined;
    ActivityDetail: { activityId: string };

    /* ============================
       Activity 1 Flow
    ============================ */
    A1SessionSetup: { activityId: string; runId?: string };
    A1AttemptPlan: { activityId: string; runId: string; attemptIndex: number };
    A1Measurements: { activityId: string; runId: string; attemptIndex: number };
    A1Result: { activityId: string; runId: string; attemptIndex: number };
    A1Comparison: { activityId: string; runId: string };
    A1ReflectionSubmit: { activityId: string; runId: string };

    /* ============================
       Activity 2 Flow
    ============================ */
    A2Overview: { activityId: string };
    A2SessionSetup: { activityId: string; runId?: string };
    A2Prediction: { activityId: string; runId: string };
    A2Measurement: { activityId: string; runId: string };
    A2Map: { activityId: string; runId: string };
    A2Results: { activityId: string; runId: string };
    A2ReflectionSubmit: { activityId: string; runId: string };

    /* ============================
       Activity 3 Flow (HD Structure)
    ============================ */
    A3Overview: { activityId: string };
    A3SessionSetup: { activityId: string; runId?: string };
    A3Prediction: { activityId: string; runId: string };
    A3Measurements: { activityId: string; runId: string };
    A3Results: { activityId: string; runId: string };
    A3Comparison: { activityId: string; runId: string };
    A3ReflectionSubmit: { activityId: string; runId: string };

    A4Overview: { activityId: string; runId?: string };
    A4SessionSetup: { activityId: string; runId?: string };
    A4Prediction: { activityId: string; runId: string };
    A4Measurements: { activityId: string; runId: string };
    A4Results: { activityId: string; runId: string };
    A4Comparison: { activityId: string; runId: string };
    A4ReflectionSubmit: { activityId: string; runId: string };
};

const Stack = createNativeStackNavigator<AppStackParamList>();

export default function AppStack() {
    return (
        <Stack.Navigator screenOptions={{headerTitleAlign: "center"}}>

            {/* Core */}
            <Stack.Screen name="Home" component={HomeScreen} options={{title: "STEMM Lab"}}/>
            <Stack.Screen name="Profile" component={ProfileScreen} options={{title: "Profile"}}/>
            <Stack.Screen name="TeamUp" component={TeamUpScreen} options={{title: "Team Up"}}/>
            <Stack.Screen name="TeamDetail" component={TeamDetailScreen} options={{title: "My Team"}}/>
            <Stack.Screen name="ExploreTeams" component={ExploreTeamsScreen} options={{title: "Explore Teams"}}/>
            <Stack.Screen name="Leaderboard" component={LeaderboardScreen} options={{title: "Leaderboard"}}/>
            <Stack.Screen name="Activities" component={ActivitiesListScreen} options={{title: "Activities"}}/>
            <Stack.Screen name="ActivityDetail" component={ActivityDetailScreen} options={{title: "Activity"}}/>

            {/* Activity 1 */}
            <Stack.Screen name="A1SessionSetup" component={A1SessionSetupScreen} options={{title: "Session Setup"}}/>
            <Stack.Screen name="A1AttemptPlan" component={A1AttemptPlanScreen} options={{title: "Attempt Plan"}}/>
            <Stack.Screen name="A1Measurements" component={A1MeasurementsScreen} options={{title: "Measurements"}}/>
            <Stack.Screen name="A1Result" component={A1ResultScreen} options={{title: "Results"}}/>
            <Stack.Screen name="A1Comparison" component={A1ComparisonScreen} options={{title: "Compare"}}/>
            <Stack.Screen name="A1ReflectionSubmit" component={A1ReflectionSubmitScreen}
                          options={{title: "Reflection & Submit"}}/>

            {/* Activity 2 */}
            <Stack.Screen name="A2Overview" component={A2OverviewScreen} options={{title: "Overview"}}/>
            <Stack.Screen name="A2SessionSetup" component={A2SessionSetupScreen} options={{title: "Session Setup"}}/>
            <Stack.Screen name="A2Prediction" component={A2PredictionScreen} options={{title: "Prediction"}}/>
            <Stack.Screen name="A2Measurement" component={A2MeasurementScreen} options={{title: "Measurements"}}/>
            <Stack.Screen name="A2Map" component={A2MapScreen} options={{title: "Map"}}/>
            <Stack.Screen name="A2Results" component={A2ResultsScreen} options={{title: "Results"}}/>
            <Stack.Screen name="A2ReflectionSubmit" component={A2ReflectionSubmitScreen}
                          options={{title: "Reflection & Submit"}}/>

            {/* Activity 3 */}
            <Stack.Screen name="A3Overview" component={A3OverviewScreen} options={{title: "Overview"}}/>
            <Stack.Screen name="A3SessionSetup" component={A3SessionSetupScreen} options={{title: "Session Setup"}}/>
            <Stack.Screen name="A3Prediction" component={A3PredictionScreen} options={{title: "Prediction"}}/>
            <Stack.Screen name="A3Measurements" component={A3MeasurementsScreen} options={{title: "Measurements"}}/>
            <Stack.Screen name="A3Results" component={A3ResultsScreen} options={{title: "Results"}}/>
            <Stack.Screen name="A3Comparison" component={A3ComparisonScreen} options={{title: "Compare"}}/>
            <Stack.Screen name="A3ReflectionSubmit" component={A3ReflectionSubmitScreen}
                          options={{title: "Reflection & Submit"}}/>

            <Stack.Screen name="A4Overview" component={A4OverviewScreen} options={{title: "Activity 4"}}/>
            <Stack.Screen name="A4SessionSetup" component={A4SessionSetupScreen} options={{title: "Setup"}}/>
            <Stack.Screen name="A4Prediction" component={A4PredictionScreen} options={{title: "Prediction"}}/>
            <Stack.Screen name="A4Measurements" component={A4MeasurementsScreen} options={{title: "Measurements"}}/>
            <Stack.Screen name="A4Comparison" component={A4ComparisonScreen} options={{title: "Compare"}}/>
            <Stack.Screen name="A4Results" component={A4ResultsScreen} options={{title: "Results"}}/>
            <Stack.Screen name="A4ReflectionSubmit" component={A4ReflectionSubmitScreen}
                          options={{title: "Reflection & Submit"}}/>

        </Stack.Navigator>
    );
}