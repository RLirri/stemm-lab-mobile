import commonEn from "./resources/en/common";
import navigationEn from "./resources/en/navigation";
import activitiesEn from "./resources/en/activities";
import profileEn from "./resources/en/profile";

import commonId from "./resources/id/common";
import navigationId from "./resources/id/navigation";
import activitiesId from "./resources/id/activities";
import profileId from "./resources/id/profile";

import commonZh from "./resources/zh/common";
import navigationZh from "./resources/zh/navigation";
import activitiesZh from "./resources/zh/activities";
import profileZh from "./resources/zh/profile";

export const resources = {
    en: {
        common: commonEn,
        navigation: navigationEn,
        activities: activitiesEn,
        profile: profileEn,
    },
    id: {
        common: commonId,
        navigation: navigationId,
        activities: activitiesId,
        profile: profileId,
    },
    zh: {
        common: commonZh,
        navigation: navigationZh,
        activities: activitiesZh,
        profile: profileZh,
    },
} as const;