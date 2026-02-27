import type {ActivityDefinition} from "./definitions/types";
import {activity01_parachuteDrop} from "./definitions/activity01_parachuteDrop";
import {activity02_soundPollution} from "./definitions/activity02_soundPollution";
import activity03_handFan from "./definitions/activity03_handFan";

export const activityCatalog: ActivityDefinition[] = [
    activity01_parachuteDrop,
    activity02_soundPollution,
    activity03_handFan,
    
];
