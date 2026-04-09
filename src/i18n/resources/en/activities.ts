const activities = {
    listTitle: "Activities",
    listLoadFailed: "Failed to load activities",
    couldntLoad: "Couldn’t load",
    emptyHint: "Ask admin to seed the Activity Catalog or create activity docs in Firestore.",

    detail: {
        notFound: "Activity not found",
        notFoundMessage: "This activity doesn’t exist or you don’t have permission to view it.",
        overview: "Overview",
        instructions: "Instructions",
        equipment: "Equipment",
        startRoute: "Start route",
        flowMissing:
            "Flow routing isn’t configured for this activity yet (missing startRoute in activityCatalog).",
        startFailed: "Start failed",
        unknownRoute: "Unknown route",
        flowMisconfigured: "Flow misconfigured",
        continueActivity: "Continue Activity",
    },

    common: {
        sessionExpiredTitle: "Session expired",
        sessionExpiredMessage: "Your draft session was reset. Please start again.",
        runMissingTitle: "Run missing",
        runMissingMessage: "This session could not be restored.",
        loadingDraft: "Loading draft...",
        loadingSession: "Loading session...",
        checkFieldsTitle: "Check fields",
        saveSuccessTitle: "Saved",
        saveSuccessMessage: "Your progress has been saved.",
        removeTitle: "Remove",
        optional: "Optional",
        required: "Required",
        yes: "Yes",
        no: "No",
        on: "On",
        off: "Off",
        enabled: "Enabled",
        disabled: "Disabled",
        baseline: "Baseline",
        prototype: "Prototype",
        participant: "Participant",
        participants: "Participants",
        trial: "Trial",
        trials: "Trials",
        notes: "Notes",
        hint: "Hint",
        warning: "Warning",
        recommended: "Recommended",
        status: "Status",
        noVideoYet: "No video yet",
        videoAttached: "Video attached ✅",
        preparingVideo: "Preparing video...",
        gpsDisabledTitle: "GPS disabled",
        gpsDisabledMessage:
            "You can continue, but map-based insights or submission requirements may be affected.",
        evidenceVideoTitle: "Evidence — Video",
        evidenceVideoHelp:
            "Attach video evidence when required. Recording works best on a real device.",
        recordVideo: "Record Video",
        pickFromLibrary: "Pick From Library",
        removeVideo: "Remove Video",
        videoAttachedTitle: "Video attached ✅",
        videoAttachedMessage: "This video will be uploaded when you submit.",
        videoErrorTitle: "Video error",
        videoErrorMessage: "Failed to attach video.",
        ratingLabel: "Rating (1–5)",
        ratingPlaceholder: "e.g. 5",
        sessionLabel: "Session label",
        sessionLabelPlaceholder: "e.g. Week 4 — Classroom A",
        sessionLabelTooLong:
            "Session label is too long. Please keep it under 60 characters.",
        gpsTitle: "GPS",
        gpsEnableLabel: "Enable GPS tagging",
        gpsEnableHelp: "Recommended for map, comparison, and submission features.",
        reflectionTitle: "Reflection",
        reflectionHelp:
            "Write a short explanation based on your results and scientific reasoning.",
        submitTitle: "Reflection & Submit",
        resultsTitle: "Results",
        predictionTitle: "Prediction",
        measurementsTitle: "Measurements",
        setupTitle: "Session Setup",
        compareTitle: "Compare",
        nextHintPrefix: "Next:",
    },

    a1: {
        meta: {
            title: "Parachute Drop Challenge",
            shortDescription:
                "Design a parachute to slow a falling object using everyday materials.",
        },

        common: {
            baselineLabel: "Baseline (No parachute)",
            prototypeLabel: "Prototype {{index}}",
            attemptMissingTitle: "Attempt missing",
            attemptMissingMessage: "This attempt slot does not exist.",
            compareFairlyHint:
                "Keep height and payload consistent for fair comparison.",
        },

        sessionSetup: {
            title: "Session Setup",
            subtitle:
                "Configure the session first. You can start the 20-minute challenge timer anytime.",

            timedChallengeTitle: "Timed Challenge",
            timerNotStarted: "Not started yet",
            timerRunning: "Running",
            timerEnded: "Ended",
            startChallenge: "Start 20-minute Challenge",

            requiredInputsTitle: "Required Inputs",
            dropHeightLabel: "Drop Height (m)",
            dropHeightPlaceholder: "e.g. 1.5",
            dropHeightHelp:
                "You may measure later, but it must be filled before attempts are saved.",

            landingTargetZoneLabel: "Landing Target Zone",
            landingTargetZoneHelp: "Enable if you want accuracy scoring.",
            targetPresetLabel: "Target preset",
            targetPreset50cm: "Within 50cm circle",
            targetPreset1m: "Within 1m circle",

            environmentLabel: "Environment",
            environmentIndoor: "Indoor",
            environmentOutdoor: "Outdoor",

            payloadTypeLabel: "Payload (toy type)",
            payloadTypePlaceholder: "e.g. toy soldier",

            payloadMassLabel: "Payload Mass (g)",
            payloadMassHelp: "If unknown, calculations will be limited.",
            payloadMassPlaceholder: "e.g. 20",
            unknownToggleLabel: "Unknown",

            safetyChecklistTitle: "Safety Checklist",
            safetyStableSurface: "Drop from stable surface",
            safetyKeepAreaClear: "Keep area clear",
            safetyDoNotThrow: "Do not throw the toy",

            footerHint:
                "Next: Baseline attempt plan → record video → measurements → results. You can run up to 3 prototypes within the timer.",

            validationDropHeight: "Please enter Drop Height (m). It must be > 0.",
            validationTargetPreset:
                "Target zone is enabled. Please choose a target preset (50cm or 1m).",
            validationPayloadMass:
                "Please enter Payload Mass (g), or toggle Unknown.",
            validationSafety:
                "Please confirm all safety checklist items.",
        },

        attemptPlan: {
            subtitle:
                "Plan this attempt before recording. Keep height and payload consistent for fair comparison.",

            confirmationNeededTitle: "Confirmation needed",
            confirmationUnderstand: "I Understand",

            predictionTitle: "Prediction",
            predictionHelp: "Estimate how many seconds until first ground contact.",
            predictionLabel: "Prediction (seconds)",
            predictionPlaceholder: "e.g. 1.2",

            prototypeDesignTitle: "Prototype Design",
            prototypeDesignHelp:
                "Choose a few tags and/or write notes. This helps your comparison dashboard later.",

            canopyMaterialLabel: "Canopy material",
            canopyMaterialPaper: "paper",
            canopyMaterialPlastic: "plastic",
            canopyMaterialFabric: "fabric",
            canopyMaterialOther: "other",

            canopyShapeLabel: "Canopy shape",
            canopyShapeCircle: "circle",
            canopyShapeSquare: "square",
            canopyShapeOther: "other",

            stringsCountLabel: "Strings count",
            stringsCountPlaceholder: "e.g. 4",
            stringLengthLabel: "String length (cm)",
            stringLengthPlaceholder: "e.g. 20",

            canopySizeLabel: "Canopy diameter / side length (cm)",
            canopySizePlaceholder: "e.g. 25",

            notesLabel: "Notes",
            notesPlaceholder: "What changed and why?",

            sketchUploadTitle: "Sketch upload (photo)",
            sketchUploadHelp:
                "v1: camera/gallery picker can be added later. For now, keep your sketch photo ready.",

            attemptTypeTitle: "Attempt Type",
            attemptTypeHelp:
                "Baseline is always No parachute. You’ll build prototypes after this.",
            attemptTypeBaselinePill: "Baseline (No parachute)",

            comparisonParametersTitle: "Comparison Parameters",
            dropHeightLabel: "Drop Height (m)",
            dropHeightPlaceholder: "e.g. 1.5",
            baselineReferenceHeight: "Baseline reference height: {{value}} m",

            payloadMassLabel: "Payload Mass (g)",
            payloadMassHelp: "If unknown, force/drag/g-force may not be computed.",
            payloadMassPlaceholder: "e.g. 20",
            massUnknown: "Unknown",
            massKnown: "Known",
            baselineReferenceMass: "Baseline reference mass: {{value}} g",

            recordDropVideo: "Record Drop Video",
            footerHint:
                "Next: video capture → measurements → results. You can add up to 3 prototypes.",

            validationDropHeight: "Drop Height (m) is required and must be > 0.",
            validationPayloadMass:
                "Payload Mass (g) is required unless you set it as Unknown.",
            validationPrototypeDesign:
                "Please add at least one prototype design detail (material/shape/size/notes).",

            confirmHeightChanged:
                "Height changed; comparisons may be unfair. Please confirm you still want to continue.",
            confirmMassChanged:
                "Payload changed; speed/force comparison changes. Please confirm you still want to continue.",
        },

        measurements: {
            title: "Measurements",

            part1Title: "Part 1 — Flight time",
            part1Help: "Time to First Ground Contact (t_hit), in seconds.",
            tHitLabel: "t_hit (seconds)",
            tHitPlaceholder: "e.g. 1.2",

            part2Title: "Part 2 — Stopping time",
            part2Help:
                "Time from First Contact to Stop Moving (t_stop), in seconds (slow-motion recommended).",
            tStopLabel: "t_stop (seconds)",
            tStopPlaceholder: "e.g. 0.05",

            part3Title: "Part 3 — Landing accuracy (target zone)",
            part3Help: "Required because target zone is enabled in Session Setup.",
            distanceLabel: "Distance from center (cm) (optional)",
            distancePlaceholder: "e.g. 35",

            landingAccuracyTitle: "Landing accuracy",
            landingAccuracyHelp:
                "Target zone is not enabled. You can skip accuracy scoring for this session.",

            bounceTitle: "Bounce (optional)",
            bounceHelp:
                "If a bounce occurred, estimate extra impact using time to peak after bounce.",
            bounceOccurredLabel: "Bounce occurred?",
            tUpLabel: "t_up (seconds) — time to peak after bounce",
            tUpPlaceholder: "e.g. 0.15",

            computeResults: "Compute Results",
            footerHint:
                "Next: Results (computed values + interpretation). Then save attempt and continue.",

            validationTHit:
                "Time to First Ground Contact (t_hit) must be > 0.",
            validationTStop:
                "Stopping time (t_stop) must be ≥ 0.",
            validationTargetZone:
                "Target zone is enabled. Please answer whether it landed in the target zone.",
            validationDistance:
                "Distance from center must be a non-negative number.",
            validationBounce:
                "Bounce is ON. Please enter time to peak after bounce (t_up) > 0.",
        },

        results: {
            title: "Results",
            summaryTitle: "Summary",
            flightTime: "Flight time",
            stopTime: "Stopping time",
            landingAccuracy: "Landing accuracy",
            bounceEstimate: "Bounce estimate",
            interpretationTitle: "Interpretation",
            continuePrototype: "Continue to next prototype",
            compareAttempts: "Compare Attempts",
            saveAndContinue: "Save and Continue",
        },

        comparison: {
            title: "Compare Attempts",
            bestAttempt: "Best attempt",
            slowestDescent: "Slowest descent",
            mostStable: "Most stable",
            mostAccurate: "Most accurate",
            summaryTitle: "Comparison Summary",
            continueReflection: "Continue to Reflection",
        },

        reflection: {
            title: "Reflection & Submit",
            wereYouRightLabel: "Were you right?",
            surprisesLabel: "Any surprises?",
            improveNextLabel: "What would you improve next?",
            scientificReasoningLabel: "Explain using drag, mass, and stability.",
            submitButton: "Submit Activity",
        },
    },

    a2: {
        meta: {
            title: "Sound Pollution Hunter",
            shortDescription:
                "Measure and compare classroom sound levels (dB), record locations, and map loud vs quiet zones.",
        },

        fallbackTitle: "Sound Pollution Hunter",
        fallbackShortDescription:
            "Measure and compare classroom sound levels (dB), record locations, and map loud vs quiet zones.",
        fallbackOverview:
            "Students measure noise from different actions (dropping objects, talking, walking, stamping), record sound levels with GPS, then map loud and quiet zones. They predict the loudest action and reflect on whether earmuffs are needed.",
        equipmentFallback1: "Mobile phone with STEMM Lab app",
        equipmentFallback2: "Everyday objects (pens/books)",
        hearingRiskTitle: "Hearing Damage Risk (dB)",
        hearingRiskHelp:
            "Use this table to assign a risk category for each measurement. Then answer: “Should we wear earmuffs in your classroom?”",
        submissionPolicy:
            "Submission policy: minimum 3 valid measurements + 1 session video evidence.",
        promptsTitle: "Write-up Prompts",
        prompt1: "Predict which action created the loudest sound.",
        prompt2: "Record results (dB) for at least 3 actions.",
        prompt3: "Were you right? Why or why not?",
        prompt4: "Any surprises? Explain using surface/material/energy.",
        prompt5: "Should we wear earmuffs in your classroom? Use the risk table as evidence.",

        sessionSetup: {
            subtitle:
                "Set a session label and choose whether GPS is enabled. GPS helps you map loud vs quiet zones.",
            sessionLabelTitle: "Session Label",
            sessionLabelHelp:
                "Optional but recommended (e.g., Classroom A – front row, Library corner, Week 3 lab).",
            label: "Label",
            labelPlaceholder: "e.g. Week 3 — Classroom 210",
            labelTip: "Tip: use labels to compare different locations or times.",

            gpsTitle: "GPS",
            gpsHelp:
                "If enabled, each measurement can store coordinates and show up on the map. You can still continue without GPS.",
            gpsEnableLabel: "Enable GPS tagging",
            gpsEnableHelp: "Recommended for loud vs quiet zone mapping.",
            gpsDisabledTitle: "GPS disabled",
            gpsDisabledText:
                "Map view will still work, but pins will show No location and filtering by location won’t be meaningful.",

            footerHint:
                "Next: Prediction → Measurement loop (min 3 actions) → Map → Results → Reflection & Submit.",

            validationLabelTooLong:
                "Session label is too long. Please keep it under 60 characters.",
        },

        prediction: {
            title: "Prediction",
            subtitle: "Predict the loudest action before measuring.",
            predictedActionLabel: "Predicted loudest action",
            predictedActionPlaceholder: "e.g. Dropping a book",
            continueToMeasurement: "Continue to Measurement",
        },

        measurement: {
            title: "Measurements",
            soundSourceLabel: "Sound source / action",
            soundSourcePlaceholder: "e.g. Talking, stamping, dropping book",
            locationLabel: "Location note",
            locationPlaceholder: "e.g. Front row, near door",
            decibelLabel: "Measured sound level (dB)",
            decibelPlaceholder: "e.g. 72",
            addMeasurement: "Add Measurement",
            minimumMeasurements:
                "At least 3 valid measurements are required before continuing.",
        },

        map: {
            title: "Map",
            loudZones: "Loud zones",
            quietZones: "Quiet zones",
            noLocation: "No location",
            continueToResults: "Continue to Results",
        },

        results: {
            title: "Results",
            averageDb: "Average sound level",
            loudestAction: "Loudest action",
            quietestAction: "Quietest action",
            hearingRisk: "Hearing risk",
            interpretationTitle: "Interpretation",
            continueToReflection: "Continue to Reflection",
        },

        reflection: {
            title: "Reflection & Submit",
            wereYouRightLabel: "Were you right?",
            surprisesLabel: "Any surprises?",
            earmuffsLabel: "Should we wear earmuffs in your classroom?",
            evidenceReasoningLabel: "Use the risk table as evidence.",
            submitButton: "Submit Activity",
        },
    },

    a3: {
        meta: {
            title: "Hand Fan Challenge",
            shortDescription:
                "Compare fan designs by measuring bend angle (degrees) at different distances.",
        },

        overview: {
            title: "Overview",
            summary:
                "Compare fan designs and materials by measuring bend angle at different distances.",
        },

        sessionSetup: {
            title: "Session Setup",
            subtitle:
                "Choose the number of designs and whether advanced mode is enabled before testing.",
            designCountLabel: "Number of fan designs",
            designCountPlaceholder: "e.g. 3",
            advancedModeLabel: "Enable advanced mode",
            advancedModeHelp:
                "Advanced mode can include extra interpretation such as stiffness and force approximation.",
        },

        prediction: {
            title: "Prediction",
            predictedBestDesignLabel: "Predicted best design",
            predictedBestDesignPlaceholder: "e.g. Accordion fold",
            continueToMeasurements: "Continue to Measurements",
        },

        measurements: {
            title: "Measurements",
            designLabel: "Design",
            materialLabel: "Material",
            distanceLabel: "Distance (cm)",
            bendAngleLabel: "Bend angle (°)",
            recordMeasurement: "Record Measurement",
            materialPaper: "Paper",
            materialCardboard: "Cardboard",
        },

        results: {
            title: "Results",
            averageAngle: "Average bend angle",
            bestDesign: "Best design",
            strongestEffectDistance: "Strongest distance effect",
            interpretationTitle: "Interpretation",
        },

        comparison: {
            title: "Compare Designs",
            compareMaterials: "Compare Materials",
            compareDistances: "Compare Distances",
            summaryTitle: "Comparison Summary",
        },

        reflection: {
            title: "Reflection & Submit",
            wereYouRightLabel: "Were you right?",
            surprisesLabel: "Any surprises?",
            materialEffectLabel: "How did material stiffness affect bending?",
            distanceEffectLabel: "How did distance affect bending?",
            submitButton: "Submit Activity",
        },
    },

    a4: {
        meta: {
            title: "Earthquake-Resistant Structure",
            shortDescription:
                "Build and compare vibration-dampening structures using a 10-second vibration test.",
        },

        overview: {
            title: "Overview",
            summary:
                "Design structures that reduce phone movement during a simulated earthquake.",
        },

        sessionSetup: {
            title: "Session Setup",
            subtitle:
                "Set up the test configuration before running the 10-second vibration trials.",
            sessionLabelLabel: "Session label",
            gpsRequiredHelp:
                "GPS is required for submission, though you can still test before enabling it.",
            designCountLabel: "Number of designs",
            designCountPlaceholder: "e.g. 3",
        },

        prediction: {
            title: "Prediction",
            predictedBestDesignLabel: "Predicted best design",
            predictedBestDesignPlaceholder: "e.g. 10 folds + 4 pillars",
            continueToMeasurements: "Continue to Measurements",
        },

        measurements: {
            title: "Measurements",
            startVibrationTest: "Start 10-second Vibration Test",
            movementScoreLabel: "Movement magnitude score",
            attachEvidenceLabel: "Attach session video evidence",
            designNotesLabel: "Design notes",
            designNotesPlaceholder: "e.g. folds, layers, pillars, symmetry",
        },

        results: {
            title: "Results",
            lowestMovementDesign: "Lowest movement design",
            averageMovement: "Average movement",
            interpretationTitle: "Interpretation",
        },

        comparison: {
            title: "Compare Designs",
            bestDesign: "Best design",
            designRanking: "Design ranking",
            continueToReflection: "Continue to Reflection",
        },

        reflection: {
            title: "Reflection & Submit",
            wereYouRightLabel: "Were you right?",
            surprisesLabel: "Any surprises?",
            improveNextLabel: "What would you improve next?",
            submitButton: "Submit Activity",
        },
    },

    a5: {
        meta: {
            title: "Human Performance Lab – Stretch Speed & Gracefulness",
            shortDescription:
                "Measure movement duration, smoothness, and range during guided stretching.",
        },

        overview: {
            title: "Overview",
            summary:
                "Compare baseline and feedback-guided movement using accelerometer-based motion measures.",
        },

        sessionSetup: {
            title: "Session Setup",
            subtitle:
                "Configure participants, duration, and feedback settings before guided trials.",
            participantCountLabel: "Number of participants",
            participantCountPlaceholder: "e.g. 3",
            samplingHzLabel: "Sampling rate (Hz)",
            samplingHzPlaceholder: "e.g. 50",
            durationLabel: "Guided movement duration (seconds)",
            durationPlaceholder: "e.g. 20",
            feedbackEnabledLabel: "Enable Feedback Mode",
        },

        prediction: {
            title: "Prediction",
            predictedVibrationLabel: "Predicted vibration / motion level",
            predictedVibrationPlaceholder: "e.g. Low / Medium / High",
            predictedHardestMovementLabel: "Predicted most difficult movement",
            continueToTrials: "Continue to Guided Trials",
        },

        guidedTrials: {
            title: "Guided Trials",
            baselineMode: "Baseline Mode",
            feedbackMode: "Feedback Mode",
            startTrial: "Start Trial",
            completeTrial: "Complete Trial",
            movement1: "Movement 1",
            movement2: "Movement 2",
            movement3: "Movement 3",
        },

        results: {
            title: "Results",
            smoothnessIndex: "Smoothness index",
            rangeOfMotion: "Range of motion",
            duration: "Duration",
            improvementScore: "Improvement score",
            interpretationTitle: "Interpretation",
        },

        comparison: {
            title: "Compare Baseline vs Feedback",
            bestImprovement: "Best improvement",
            hardestMovement: "Hardest movement",
            consistencyTitle: "Consistency",
        },

        reflection: {
            title: "Reflection & Submit",
            hardestMovementLabel: "Which movement was hardest to keep the vibration low?",
            wereYouRightLabel: "Were you right?",
            surprisesLabel: "Any surprises?",
            submitButton: "Submit Activity",
        },
    },

    a6: {
        meta: {
            title: "Reaction Board Challenge – Speed, Coordination & Consistency",
            shortDescription:
                "Measure reaction time and tracing accuracy, then compare consistency.",
        },

        overview: {
            title: "Overview",
            summary:
                "Compare dominant and non-dominant hand reaction time, then evaluate tracing accuracy.",
        },

        sessionSetup: {
            title: "Session Setup",
            subtitle:
                "Configure participant count, number of trials, target timing, and tracing settings.",
            participantCountLabel: "Number of participants",
            trialsPerHandLabel: "Trials per hand",
            delayMinLabel: "Minimum random delay (seconds)",
            delayMaxLabel: "Maximum random delay (seconds)",
            targetSizeLabel: "Target size (px)",
            tracingPathTypeLabel: "Tracing path type",
            accuracyThresholdLabel: "Accuracy threshold (%)",
        },

        prediction: {
            title: "Prediction",
            predictedReactionTimeLabel: "Predicted reaction time (ms)",
            predictedReactionTimePlaceholder: "e.g. 350",
            predictedHandLabel: "Which hand do you think will be faster?",
            continueToReaction: "Continue to Reaction Trials",
        },

        reactionTrial: {
            title: "Reaction Trial",
            instruction: "Tap as soon as the target appears.",
            dominantHand: "Dominant hand",
            nonDominantHand: "Non-dominant hand",
            reactionTimeLabel: "Reaction time",
            nextTrial: "Next Trial",
        },

        tracingChallenge: {
            title: "Tracing Challenge",
            instruction: "Trace the path as accurately as possible.",
            accuracyLabel: "Accuracy",
            deviationLabel: "Average deviation",
            durationLabel: "Tracing duration",
            continueToResults: "Continue to Results",
        },

        results: {
            title: "Results",
            meanReactionTime: "Mean reaction time",
            reactionStdDev: "Reaction time standard deviation",
            tracingAccuracy: "Tracing accuracy",
            interpretationTitle: "Interpretation",
        },

        reflection: {
            title: "Reflection & Submit",
            wereYouRightLabel: "Were you right?",
            surprisesLabel: "Any surprises?",
            submitButton: "Submit Activity",
        },
    },

    a7: {
        meta: {
            title: "Breathing Pace Trainer – Chest Motion, Breathing Rate & Recovery",
            shortDescription:
                "Record chest movement, estimate breathing rate, and compare recovery consistency.",
        },

        overview: {
            title: "Overview",
            summary:
                "Measure breathing rate at rest and after exercise using chest motion captured by the phone.",
        },

        sessionSetup: {
            title: "Session Setup",
            subtitle:
                "Configure participant count, measurement duration, and recording parameters before starting.",
            participantCountLabel: "Number of participants",
            participantCountPlaceholder: "e.g. 3",
            durationLabel: "Measurement duration (seconds)",
            durationPlaceholder: "e.g. 30",
            samplingHzLabel: "Target sampling rate (Hz)",
            smoothingWindowLabel: "Smoothing window (seconds)",
            minPeakGapLabel: "Minimum peak gap (ms)",
        },

        prediction: {
            title: "Prediction",
            predictedRestBpmLabel: "Predicted breathing rate at rest (breaths/min)",
            predictedAfterExerciseBpmLabel:
                "Predicted breathing rate after exercise (breaths/min)",
            expectedHighestPhaseLabel:
                "Which phase do you think will have the highest breathing rate?",
            continueToMeasurements: "Continue to Measurements",
        },

        measurements: {
            title: "Measurements",
            restPhase: "Rest Measurement",
            postJogPhase: "Post-Exercise Measurement 1",
            postStarJumpPhase: "Post-Exercise Measurement 2",
            startMeasurement: "Start Measurement",
            bpmLabel: "Breaths per minute",
            continueToResults: "Continue to Results",
        },

        results: {
            title: "Results",
            restBpm: "Rest breathing rate",
            postJogBpm: "Post-jog breathing rate",
            postStarJumpBpm: "Post-star-jumps breathing rate",
            recoveryConsistency: "Recovery consistency",
            interpretationTitle: "Interpretation",
        },

        reflection: {
            title: "Reflection & Submit",
            wereYouRightLabel: "Were you right?",
            highestPhaseLabel: "Which stage had the highest breathing rate?",
            surprisesLabel: "Any surprises?",
            exerciseEffectLabel: "How did exercise affect breathing?",
            submitButton: "Submit Activity",
        },
    },
} as const;

export default activities;