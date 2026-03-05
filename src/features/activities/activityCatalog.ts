import type {ActivityDefinition} from "./definitions/types";
import {activity01_parachuteDrop} from "./definitions/activity01_parachuteDrop";
import {activity02_soundPollution} from "./definitions/activity02_soundPollution";
import activity03_handFan from "./definitions/activity03_handFan";
import {activity04_earthquake} from "./definitions/activity04_earthquake";
import activity05_humanPerformance from "./definitions/activity05_humanPerformance";

export const activityCatalog: ActivityDefinition[] = [
    activity01_parachuteDrop,
    activity02_soundPollution,
    activity03_handFan,
    activity04_earthquake,
    activity05_humanPerformance

];
