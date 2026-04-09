const common = {
    appName: "STEMM Lab",
    actions: {
        back: "Back",
        cancel: "Cancel",
        close: "Close",
        continue: "Continue",
        done: "Done",
        logout: "Logout",
        ok: "OK",
        retry: "Retry",
        save: "Save",
        start: "Start",
        startActivity: "Start Activity",
        submit: "Submit",
    },
    states: {
        loading: "Loading...",
        loadingActivities: "Loading activities...",
        loadingActivity: "Loading activity...",
        loadingProfile: "Loading profile...",
        starting: "Starting...",
        saving: "Saving...",
    },
    feedback: {
        error: "Error",
        notImplemented: "Not implemented",
        signInRequired: "Sign in required",
        updateFailed: "Update failed",
        saved: "Saved",
    },
    empty: {
        noActivitiesYet: "No activities yet",
    },
} as const;

export default common;