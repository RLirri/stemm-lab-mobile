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
import ActivityHistoryScreen from '../screens/Activities/ActivityHistoryScreen';
import ActivityHistoryDetailScreen from '../screens/Activities/ActivityHistoryDetailScreen';
import type {ActivityHistoryItem} from '../services/activityHistoryService';
import AdminDashboardScreen from '../screens/Admin/AdminDashboardScreen';
import AdminSubmissionListScreen from '../screens/Admin/AdminSubmissionListScreen';
import AdminTeamListScreen from '../screens/Admin/AdminTeamListScreen';
import AdminTeamDetailScreen from '../screens/Admin/AdminTeamDetailScreen';
import AdminSubmissionDetailScreen from '../screens/Admin/AdminSubmissionDetailScreen';

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

/* ============================
   Activity 5 (Human Performance)
============================ */
import A5OverviewScreen from "../screens/Activities/Activity5/A5OverviewScreen";
import A5SessionSetupScreen from "../screens/Activities/Activity5/A5SessionSetupScreen";
import A5PredictionScreen from "../screens/Activities/Activity5/A5PredictionScreen";
import A5GuidedTrialsScreen from "../screens/Activities/Activity5/A5GuidedTrialsScreen";
import A5ResultsScreen from "../screens/Activities/Activity5/A5ResultsScreen";
import A5ComparisonScreen from "../screens/Activities/Activity5/A5ComparisonScreen";
import A5ReflectionSubmitScreen from "../screens/Activities/Activity5/A5ReflectionSubmitScreen";

/* ============================
   Activity 6 (Reaction Board)
============================ */
import A6OverviewScreen from "../screens/Activities/Activity6/A6OverviewScreen";
import A6SessionSetupScreen from "../screens/Activities/Activity6/A6SessionSetupScreen";
import A6PredictionScreen from "../screens/Activities/Activity6/A6PredictionScreen";
import A6ReactionTrialScreen from "../screens/Activities/Activity6/A6ReactionTrialScreen";
import A6TracingChallengeScreen from "../screens/Activities/Activity6/A6TracingChallengeScreen";
import A6ResultsScreen from "../screens/Activities/Activity6/A6ResultsScreen";
import A6ReflectionSubmitScreen from "../screens/Activities/Activity6/A6ReflectionSubmitScreen";

/* ============================
   Activity 7 (Breathing Pace Trainer)
============================ */
import A7OverviewScreen from "../screens/Activities/Activity7/A7OverviewScreen";
import A7SessionSetupScreen from "../screens/Activities/Activity7/A7SessionSetupScreen";
import A7PredictionScreen from "../screens/Activities/Activity7/A7PredictionScreen";
import A7MeasurementsScreen from "../screens/Activities/Activity7/A7MeasurementsScreen";
import A7ResultsScreen from "../screens/Activities/Activity7/A7ResultsScreen";
import A7ReflectionSubmitScreen from "../screens/Activities/Activity7/A7ReflectionSubmitScreen";

export type AppStackParamList = {
    Home: undefined;
    Profile: undefined;

    TeamUp: undefined;
    TeamDetail: { teamId?: string; mode?: "my" | "view" } | undefined;
    ExploreTeams: undefined;

    Leaderboard: undefined;

    Activities: undefined;
    ActivityDetail: { activityId: string };
    ActivityHistory: undefined;
    ActivityHistoryDetail: {
        historyItem: ActivityHistoryItem;
    };
    AdminDashboard: undefined;
    AdminSubmissionList: undefined;

    AdminSubmissionDetail: {
        submissionId: string;
        submissionItem: unknown;
    };
    AdminTeamList: undefined;

    AdminTeamDetail: {
        teamId: string;
        teamItem: unknown;
    };

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

    /* ============================
   Activity 5 Flow
============================ */
    A5Overview: { activityId: string; runId?: string };
    A5SessionSetup: { activityId: string; runId?: string };
    A5Prediction: { activityId: string; runId: string };
    A5GuidedTrials: { activityId: string; runId: string };
    A5Results: { activityId: string; runId: string };
    A5Comparison: { activityId: string; runId: string };
    A5ReflectionSubmit: { activityId: string; runId: string };

    /* ============================
   Activity 6 Flow
============================ */
    A6Overview: { activityId: string; runId?: string };
    A6SessionSetup: { activityId: string; runId?: string };
    A6Prediction: { activityId: string; runId: string };
    A6ReactionTrial: { activityId: string; runId: string };
    A6TracingChallenge: { activityId: string; runId: string };
    A6Results: { activityId: string; runId: string };
    A6ReflectionSubmit: { activityId: string; runId: string };

    /* ============================
Activity 7 Flow
============================ */
    A7Overview: { activityId: string; runId?: string };
    A7SessionSetup: { activityId: string; runId?: string };
    A7Prediction: { activityId: string; runId: string };
    A7Measurements: { activityId: string; runId: string };
    A7Results: { activityId: string; runId: string };
    A7ReflectionSubmit: { activityId: string; runId: string };
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
            <Stack.Screen
                name="ActivityHistory"
                component={ActivityHistoryScreen}
            />
            <Stack.Screen
                name="ActivityHistoryDetail"
                component={ActivityHistoryDetailScreen}
                options={{title: 'Submission Details'}}
            />
            <Stack.Screen
                name="AdminDashboard"
                component={AdminDashboardScreen}
                options={{title: 'Admin Dashboard'}}
            />
            <Stack.Screen
                name="AdminSubmissionList"
                component={AdminSubmissionListScreen}
                options={{title: 'Recent Submissions'}}
            />
            <Stack.Screen
                name="AdminTeamList"
                component={AdminTeamListScreen}
                options={{title: 'Team Records'}}
            />

            <Stack.Screen
                name="AdminTeamDetail"
                component={AdminTeamDetailScreen}
                options={{title: 'Team Detail'}}
            />
            <Stack.Screen
                name="AdminSubmissionDetail"
                component={AdminSubmissionDetailScreen}
            />


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

            {/* Activity 5 */}
            <Stack.Screen name="A5Overview" component={A5OverviewScreen} options={{title: "Activity 5"}}/>
            <Stack.Screen name="A5SessionSetup" component={A5SessionSetupScreen} options={{title: "Setup"}}/>
            <Stack.Screen name="A5Prediction" component={A5PredictionScreen} options={{title: "Prediction"}}/>
            <Stack.Screen name="A5GuidedTrials" component={A5GuidedTrialsScreen} options={{title: "Guided Trials"}}/>
            <Stack.Screen name="A5Comparison" component={A5ComparisonScreen} options={{title: "Compare"}}/>
            <Stack.Screen name="A5Results" component={A5ResultsScreen} options={{title: "Results"}}/>
            <Stack.Screen name="A5ReflectionSubmit" component={A5ReflectionSubmitScreen}
                          options={{title: "Reflection & Submit"}}/>

            {/* Activity 6 */}
            <Stack.Screen name="A6Overview" component={A6OverviewScreen} options={{title: "Activity 6"}}/>
            <Stack.Screen name="A6SessionSetup" component={A6SessionSetupScreen} options={{title: "Setup"}}/>
            <Stack.Screen name="A6Prediction" component={A6PredictionScreen} options={{title: "Prediction"}}/>
            <Stack.Screen name="A6ReactionTrial" component={A6ReactionTrialScreen} options={{title: "Reaction Trial"}}/>
            <Stack.Screen name="A6TracingChallenge" component={A6TracingChallengeScreen}
                          options={{title: "Tracing Challenge"}}/>
            <Stack.Screen name="A6Results" component={A6ResultsScreen} options={{title: "Results"}}/>
            <Stack.Screen name="A6ReflectionSubmit" component={A6ReflectionSubmitScreen}
                          options={{title: "Reflection & Submit"}}/>

            {/* Activity 7 */}
            <Stack.Screen name="A7Overview" component={A7OverviewScreen} options={{title: "Activity 7"}}/>
            <Stack.Screen name="A7SessionSetup" component={A7SessionSetupScreen} options={{title: "Setup"}}/>
            <Stack.Screen name="A7Prediction" component={A7PredictionScreen} options={{title: "Prediction"}}/>
            <Stack.Screen name="A7Measurements" component={A7MeasurementsScreen} options={{title: "Measurements"}}/>
            <Stack.Screen name="A7Results" component={A7ResultsScreen} options={{title: "Results"}}/>
            <Stack.Screen name="A7ReflectionSubmit" component={A7ReflectionSubmitScreen}
                          options={{title: "Reflection & Submit"}}/>
        </Stack.Navigator>

    );
}