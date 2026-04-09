const activities = {
    listTitle: "活动",
    listLoadFailed: "加载活动失败",
    couldntLoad: "无法加载",
    emptyHint: "请让管理员初始化 Activity Catalog 或在 Firestore 中创建活动文档。",

    detail: {
        notFound: "未找到活动",
        notFoundMessage: "该活动不存在，或者你没有查看权限。",
        overview: "概览",
        instructions: "说明",
        equipment: "器材",
        startRoute: "起始路由",
        flowMissing:
            "该活动的流程路由尚未配置（activityCatalog 中缺少 startRoute）。",
        startFailed: "启动失败",
        unknownRoute: "未知路由",
        flowMisconfigured: "流程配置错误",
        continueActivity: "继续活动",
    },

    common: {
        sessionExpiredTitle: "会话已过期",
        sessionExpiredMessage: "你的草稿会话已重置，请重新开始。",
        runMissingTitle: "会话缺失",
        runMissingMessage: "此会话无法恢复。",
        loadingDraft: "正在加载草稿...",
        loadingSession: "正在加载会话...",
        checkFieldsTitle: "请检查输入",
        saveSuccessTitle: "已保存",
        saveSuccessMessage: "你的进度已保存。",
        removeTitle: "移除",
        optional: "可选",
        required: "必填",
        yes: "是",
        no: "否",
        on: "开启",
        off: "关闭",
        enabled: "已启用",
        disabled: "已禁用",
        baseline: "基线",
        prototype: "原型",
        participant: "参与者",
        participants: "参与者",
        trial: "试验",
        trials: "试验",
        notes: "备注",
        hint: "提示",
        warning: "警告",
        recommended: "推荐",
        status: "状态",
        noVideoYet: "暂无视频",
        videoAttached: "视频已附加 ✅",
        preparingVideo: "正在准备视频...",
        gpsDisabledTitle: "GPS 已关闭",
        gpsDisabledMessage:
            "你仍然可以继续，但基于地图的洞察或提交要求可能会受影响。",
        evidenceVideoTitle: "证据 — 视频",
        evidenceVideoHelp:
            "如有要求，请附加视频证据。录制功能在真实设备上效果最佳。",
        recordVideo: "录制视频",
        pickFromLibrary: "从相册选择",
        removeVideo: "移除视频",
        videoAttachedTitle: "视频已附加 ✅",
        videoAttachedMessage: "提交时会上传此视频。",
        videoErrorTitle: "视频错误",
        videoErrorMessage: "附加视频失败。",
        ratingLabel: "评分（1–5）",
        ratingPlaceholder: "例如 5",
        sessionLabel: "会话标签",
        sessionLabelPlaceholder: "例如 第4周 — A 教室",
        sessionLabelTooLong: "会话标签过长，请控制在 60 个字符以内。",
        gpsTitle: "GPS",
        gpsEnableLabel: "启用 GPS 标记",
        gpsEnableHelp: "推荐用于地图、比较和提交功能。",
        reflectionTitle: "反思",
        reflectionHelp: "请根据结果和科学原理写一段简短说明。",
        submitTitle: "反思与提交",
        resultsTitle: "结果",
        predictionTitle: "预测",
        measurementsTitle: "测量",
        setupTitle: "会话设置",
        compareTitle: "比较",
        nextHintPrefix: "下一步：",
    },

    a1: {
        meta: {
            title: "降落伞下落实验",
            shortDescription:
                "使用日常材料设计降落伞，以减缓下落物体的速度。",
        },

        common: {
            baselineLabel: "基线（无降落伞）",
            prototypeLabel: "原型 {{index}}",
            attemptMissingTitle: "试验缺失",
            attemptMissingMessage: "该试验槽不存在。",
            compareFairlyHint: "请保持高度和载荷一致，以便公平比较。",
        },

        sessionSetup: {
            title: "会话设置",
            subtitle:
                "请先配置本次会话。你可以随时开始 20 分钟挑战计时。",

            timedChallengeTitle: "计时挑战",
            timerNotStarted: "尚未开始",
            timerRunning: "进行中",
            timerEnded: "已结束",
            startChallenge: "开始 20 分钟挑战",

            requiredInputsTitle: "必填输入",
            dropHeightLabel: "下落高度（米）",
            dropHeightPlaceholder: "例如 1.5",
            dropHeightHelp:
                "你可以稍后测量，但在保存试验前必须填写。",

            landingTargetZoneLabel: "着陆目标区",
            landingTargetZoneHelp: "如果你希望进行准确度评分，请启用。",
            targetPresetLabel: "目标预设",
            targetPreset50cm: "落在 50 厘米圆内",
            targetPreset1m: "落在 1 米圆内",

            environmentLabel: "环境",
            environmentIndoor: "室内",
            environmentOutdoor: "室外",

            payloadTypeLabel: "载荷（玩具类型）",
            payloadTypePlaceholder: "例如 玩具士兵",

            payloadMassLabel: "载荷质量（克）",
            payloadMassHelp: "如果未知，计算结果将受到限制。",
            payloadMassPlaceholder: "例如 20",
            unknownToggleLabel: "未知",

            safetyChecklistTitle: "安全检查清单",
            safetyStableSurface: "从稳定表面下落",
            safetyKeepAreaClear: "保持区域清空",
            safetyDoNotThrow: "不要把物体扔出去",

            footerHint:
                "下一步：基线试验计划 → 录制视频 → 测量 → 结果。你可以在计时内完成最多 3 个原型。",

            validationDropHeight: "请输入下落高度（米），且数值必须大于 0。",
            validationTargetPreset:
                "目标区已启用。请选择目标预设（50 厘米或 1 米）。",
            validationPayloadMass:
                "请输入载荷质量（克），或切换为未知。",
            validationSafety: "请确认所有安全检查项。",
        },

        attemptPlan: {
            subtitle:
                "请在录制前先规划本次试验。保持高度和载荷一致，以便公平比较。",

            confirmationNeededTitle: "需要确认",
            confirmationUnderstand: "我明白了",

            predictionTitle: "预测",
            predictionHelp: "估计第一次接触地面需要多少秒。",
            predictionLabel: "预测（秒）",
            predictionPlaceholder: "例如 1.2",

            prototypeDesignTitle: "原型设计",
            prototypeDesignHelp:
                "选择一些标签或填写备注。这将帮助你后续进行比较分析。",

            canopyMaterialLabel: "伞面材料",
            canopyMaterialPaper: "纸",
            canopyMaterialPlastic: "塑料",
            canopyMaterialFabric: "布料",
            canopyMaterialOther: "其他",

            canopyShapeLabel: "伞面形状",
            canopyShapeCircle: "圆形",
            canopyShapeSquare: "方形",
            canopyShapeOther: "其他",

            stringsCountLabel: "绳子数量",
            stringsCountPlaceholder: "例如 4",
            stringLengthLabel: "绳长（厘米）",
            stringLengthPlaceholder: "例如 20",

            canopySizeLabel: "伞面直径 / 边长（厘米）",
            canopySizePlaceholder: "例如 25",

            notesLabel: "备注",
            notesPlaceholder: "改了什么？为什么？",

            sketchUploadTitle: "草图上传（照片）",
            sketchUploadHelp:
                "v1：之后可以加入相机/相册选择功能。现在请先准备好草图照片。",

            attemptTypeTitle: "试验类型",
            attemptTypeHelp:
                "基线始终为无降落伞。之后你将继续制作原型。",
            attemptTypeBaselinePill: "基线（无降落伞）",

            comparisonParametersTitle: "比较参数",
            dropHeightLabel: "下落高度（米）",
            dropHeightPlaceholder: "例如 1.5",
            baselineReferenceHeight: "基线参考高度：{{value}} 米",

            payloadMassLabel: "载荷质量（克）",
            payloadMassHelp: "如果未知，则无法计算阻力 / g-force 等数据。",
            payloadMassPlaceholder: "例如 20",
            massUnknown: "未知",
            massKnown: "已知",
            baselineReferenceMass: "基线参考质量：{{value}} 克",

            recordDropVideo: "录制下落视频",
            footerHint:
                "下一步：视频录制 → 测量 → 结果。你最多可以再添加 3 个原型。",

            validationDropHeight: "下落高度（米）为必填项，且必须大于 0。",
            validationPayloadMass:
                "除非选择未知，否则载荷质量（克）为必填项。",
            validationPrototypeDesign:
                "请至少添加一个原型设计细节（材料 / 形状 / 尺寸 / 备注）。",

            confirmHeightChanged:
                "高度发生变化；比较结果可能不公平。请确认你仍要继续。",
            confirmMassChanged:
                "载荷发生变化；速度 / 受力比较也会改变。请确认你仍要继续。",
        },

        measurements: {
            title: "测量",

            part1Title: "第 1 部分 — 飞行时间",
            part1Help: "第一次接触地面的时间（t_hit），单位为秒。",
            tHitLabel: "t_hit（秒）",
            tHitPlaceholder: "例如 1.2",

            part2Title: "第 2 部分 — 停止时间",
            part2Help:
                "从第一次接触到完全停止移动的时间（t_stop），单位为秒（推荐使用慢动作）。",
            tStopLabel: "t_stop（秒）",
            tStopPlaceholder: "例如 0.05",

            part3Title: "第 3 部分 — 着陆准确度（目标区）",
            part3Help: "因为会话设置中启用了目标区，所以此项为必填。",
            distanceLabel: "距中心距离（厘米）（可选）",
            distancePlaceholder: "例如 35",

            landingAccuracyTitle: "着陆准确度",
            landingAccuracyHelp:
                "目标区未启用。你可以跳过本次会话的准确度评分。",

            bounceTitle: "弹跳（可选）",
            bounceHelp:
                "如果发生弹跳，可用弹跳后到达最高点的时间来估算额外冲击。",
            bounceOccurredLabel: "是否发生弹跳？",
            tUpLabel: "t_up（秒）— 弹跳后到达最高点的时间",
            tUpPlaceholder: "例如 0.15",

            computeResults: "计算结果",
            footerHint:
                "下一步：结果（计算值 + 解释）。然后保存本次试验并继续。",

            validationTHit: "第一次接触地面的时间（t_hit）必须大于 0。",
            validationTStop: "停止时间（t_stop）必须大于或等于 0。",
            validationTargetZone:
                "目标区已启用。请回答它是否落在目标区内。",
            validationDistance:
                "距中心距离必须是非负数。",
            validationBounce:
                "已启用弹跳。请输入弹跳后到达最高点时间（t_up）且必须大于 0。",
        },

        results: {
            title: "结果",
            summaryTitle: "总结",
            flightTime: "飞行时间",
            stopTime: "停止时间",
            landingAccuracy: "着陆准确度",
            bounceEstimate: "弹跳估算",
            interpretationTitle: "解释",
            continuePrototype: "继续下一个原型",
            compareAttempts: "比较试验",
            saveAndContinue: "保存并继续",
        },

        comparison: {
            title: "比较试验",
            bestAttempt: "最佳试验",
            slowestDescent: "下降最慢",
            mostStable: "最稳定",
            mostAccurate: "最准确",
            summaryTitle: "比较总结",
            continueReflection: "继续反思",
        },

        reflection: {
            title: "反思与提交",
            wereYouRightLabel: "你的预测正确吗？",
            surprisesLabel: "有没有意外结果？",
            improveNextLabel: "下一次你会改进什么？",
            scientificReasoningLabel: "请用阻力、质量和稳定性来解释。",
            submitButton: "提交活动",
        },
    },

    a2: {
        meta: {
            title: "噪音污染观察员",
            shortDescription:
                "测量并比较教室中的声音等级（dB），记录位置，并绘制嘈杂与安静区域。",
        },

        fallbackTitle: "噪音污染观察员",
        fallbackShortDescription:
            "测量并比较教室中的声音等级（dB），记录位置，并绘制嘈杂与安静区域。",
        fallbackOverview:
            "学生测量不同动作产生的噪音（如掉落物体、说话、走路、跺脚），结合 GPS 记录声音强度，并绘制嘈杂与安静区域。他们先预测最响的动作，再反思是否需要佩戴护耳设备。",
        equipmentFallback1: "安装 STEMM Lab 应用的手机",
        equipmentFallback2: "日常物品（笔/书）",
        hearingRiskTitle: "听力损伤风险（dB）",
        hearingRiskHelp:
            "使用此表为每次测量分配风险等级，然后回答：我们在教室里是否应该佩戴护耳器？",
        submissionPolicy:
            "提交要求：至少 3 次有效测量 + 1 段活动视频证据。",
        promptsTitle: "书面问题",
        prompt1: "预测哪一种动作会产生最响的声音。",
        prompt2: "记录至少 3 种动作的结果（dB）。",
        prompt3: "你的预测正确吗？为什么？",
        prompt4: "有没有意外结果？请结合表面/材料/能量解释。",
        prompt5: "我们在教室里是否应该佩戴护耳器？请使用风险表作为证据。",

        sessionSetup: {
            subtitle:
                "设置会话标签，并选择是否启用 GPS。GPS 有助于绘制嘈杂与安静区域。",
            sessionLabelTitle: "会话标签",
            sessionLabelHelp:
                "可选但推荐（例如：A 教室前排、图书馆角落、第 3 周实验）。",
            label: "标签",
            labelPlaceholder: "例如 第3周 — 210 教室",
            labelTip: "提示：使用标签可以比较不同地点或时间。",

            gpsTitle: "GPS",
            gpsHelp:
                "启用后，每次测量都可以保存坐标并显示在地图上。即使不使用 GPS 也可继续。",
            gpsEnableLabel: "启用 GPS 标记",
            gpsEnableHelp: "推荐用于嘈杂与安静区域映射。",
            gpsDisabledTitle: "GPS 已关闭",
            gpsDisabledText:
                "地图仍可使用，但图钉会显示无位置，按位置筛选也将失去意义。",

            footerHint:
                "下一步：预测 → 测量循环（至少 3 个动作）→ 地图 → 结果 → 反思与提交。",

            validationLabelTooLong:
                "会话标签过长，请控制在 60 个字符以内。",
        },

        prediction: {
            title: "预测",
            subtitle: "在开始测量前先预测最响的动作。",
            predictedActionLabel: "预测最响的动作",
            predictedActionPlaceholder: "例如 掉书",
            continueToMeasurement: "继续到测量",
        },

        measurement: {
            title: "测量",
            soundSourceLabel: "声音来源 / 动作",
            soundSourcePlaceholder: "例如 说话、跺脚、掉书",
            locationLabel: "位置备注",
            locationPlaceholder: "例如 前排、门口附近",
            decibelLabel: "测得声音等级（dB）",
            decibelPlaceholder: "例如 72",
            addMeasurement: "添加测量",
            minimumMeasurements: "继续之前至少需要 3 次有效测量。",
        },

        map: {
            title: "地图",
            loudZones: "嘈杂区域",
            quietZones: "安静区域",
            noLocation: "无位置",
            continueToResults: "继续到结果",
        },

        results: {
            title: "结果",
            averageDb: "平均声音等级",
            loudestAction: "最响动作",
            quietestAction: "最安静动作",
            hearingRisk: "听力风险",
            interpretationTitle: "解释",
            continueToReflection: "继续到反思",
        },

        reflection: {
            title: "反思与提交",
            wereYouRightLabel: "你的预测正确吗？",
            surprisesLabel: "有没有意外结果？",
            earmuffsLabel: "我们在教室里是否应该佩戴护耳器？",
            evidenceReasoningLabel: "请使用风险表作为证据。",
            submitButton: "提交活动",
        },
    },

    a3: {
        meta: {
            title: "手扇挑战",
            shortDescription:
                "通过测量不同距离下的弯曲角度来比较扇子设计。",
        },

        overview: {
            title: "概览",
            summary:
                "通过在不同距离测量弯曲角度来比较扇子设计和材料。",
        },

        sessionSetup: {
            title: "会话设置",
            subtitle:
                "在测试前选择设计数量以及是否启用高级模式。",
            designCountLabel: "扇子设计数量",
            designCountPlaceholder: "例如 3",
            advancedModeLabel: "启用高级模式",
            advancedModeHelp:
                "高级模式可加入刚度与力近似等额外解释。",
        },

        prediction: {
            title: "预测",
            predictedBestDesignLabel: "预测最佳设计",
            predictedBestDesignPlaceholder: "例如 手风琴折叠",
            continueToMeasurements: "继续到测量",
        },

        measurements: {
            title: "测量",
            designLabel: "设计",
            materialLabel: "材料",
            distanceLabel: "距离（厘米）",
            bendAngleLabel: "弯曲角（°）",
            recordMeasurement: "记录测量",
            materialPaper: "纸",
            materialCardboard: "硬纸板",
        },

        results: {
            title: "结果",
            averageAngle: "平均角度",
            bestDesign: "最佳设计",
            strongestEffectDistance: "距离影响最大",
            interpretationTitle: "解释",
        },

        comparison: {
            title: "比较设计",
            compareMaterials: "比较材料",
            compareDistances: "比较距离",
            summaryTitle: "比较总结",
        },

        reflection: {
            title: "反思与提交",
            wereYouRightLabel: "你的预测正确吗？",
            surprisesLabel: "有没有意外结果？",
            materialEffectLabel: "材料刚度如何影响弯曲？",
            distanceEffectLabel: "距离如何影响弯曲？",
            submitButton: "提交活动",
        },
    },

    a4: {
        meta: {
            title: "抗震结构挑战",
            shortDescription:
                "通过 10 秒振动测试构建并比较减振结构。",
        },

        overview: {
            title: "概览",
            summary:
                "设计能够在模拟地震中减少手机运动的结构。",
        },

        sessionSetup: {
            title: "会话设置",
            subtitle:
                "在开始 10 秒振动测试前先配置测试参数。",
            sessionLabelLabel: "会话标签",
            gpsRequiredHelp:
                "GPS 是提交所必需的，但你仍可以先进行测试。",
            designCountLabel: "设计数量",
            designCountPlaceholder: "例如 3",
        },

        prediction: {
            title: "预测",
            predictedBestDesignLabel: "预测最佳设计",
            predictedBestDesignPlaceholder: "例如 10 个折叠 + 4 根柱子",
            continueToMeasurements: "继续到测量",
        },

        measurements: {
            title: "测量",
            startVibrationTest: "开始 10 秒振动测试",
            movementScoreLabel: "运动幅度分数",
            attachEvidenceLabel: "附加会话视频证据",
            designNotesLabel: "设计备注",
            designNotesPlaceholder: "例如 折叠、层数、柱子、对称性",
        },

        results: {
            title: "结果",
            lowestMovementDesign: "运动最小的设计",
            averageMovement: "平均运动",
            interpretationTitle: "解释",
        },

        comparison: {
            title: "比较设计",
            bestDesign: "最佳设计",
            designRanking: "设计排名",
            continueToReflection: "继续到反思",
        },

        reflection: {
            title: "反思与提交",
            wereYouRightLabel: "你的预测正确吗？",
            surprisesLabel: "有没有意外结果？",
            improveNextLabel: "下一次你会如何改进？",
            submitButton: "提交活动",
        },
    },

    a5: {
        meta: {
            title: "人体表现实验——拉伸速度与优雅度",
            shortDescription:
                "在引导拉伸过程中测量动作持续时间、平滑度与活动范围。",
        },

        overview: {
            title: "概览",
            summary:
                "使用加速度计动作数据比较基线模式与反馈模式的表现。",
        },

        sessionSetup: {
            title: "会话设置",
            subtitle:
                "在开始引导试验前，配置参与者、时长与反馈模式。",
            participantCountLabel: "参与者数量",
            participantCountPlaceholder: "例如 3",
            samplingHzLabel: "采样率（Hz）",
            samplingHzPlaceholder: "例如 50",
            durationLabel: "引导动作时长（秒）",
            durationPlaceholder: "例如 20",
            feedbackEnabledLabel: "启用反馈模式",
        },

        prediction: {
            title: "预测",
            predictedVibrationLabel: "预测振动 / 动作水平",
            predictedVibrationPlaceholder: "例如 低 / 中 / 高",
            predictedHardestMovementLabel: "预测最难动作",
            continueToTrials: "继续到引导试验",
        },

        guidedTrials: {
            title: "引导试验",
            baselineMode: "基线模式",
            feedbackMode: "反馈模式",
            startTrial: "开始试验",
            completeTrial: "完成试验",
            movement1: "动作 1",
            movement2: "动作 2",
            movement3: "动作 3",
        },

        results: {
            title: "结果",
            smoothnessIndex: "平滑度指数",
            rangeOfMotion: "活动范围",
            duration: "持续时间",
            improvementScore: "改进分数",
            interpretationTitle: "解释",
        },

        comparison: {
            title: "比较基线与反馈",
            bestImprovement: "最佳改进",
            hardestMovement: "最难动作",
            consistencyTitle: "一致性",
        },

        reflection: {
            title: "反思与提交",
            hardestMovementLabel: "哪个动作最难保持低振动？",
            wereYouRightLabel: "你的预测正确吗？",
            surprisesLabel: "有没有意外结果？",
            submitButton: "提交活动",
        },
    },

    a6: {
        meta: {
            title: "反应板挑战——速度、协调与一致性",
            shortDescription:
                "测量反应时间和描线准确度，并比较一致性。",
        },

        overview: {
            title: "概览",
            summary:
                "比较惯用手与非惯用手的反应时间，并评估描线准确度。",
        },

        sessionSetup: {
            title: "会话设置",
            subtitle:
                "开始前先配置参与者数量、试验次数、目标时间和描线路径。",
            participantCountLabel: "参与者数量",
            trialsPerHandLabel: "每只手的试验次数",
            delayMinLabel: "最小随机延迟（秒）",
            delayMaxLabel: "最大随机延迟（秒）",
            targetSizeLabel: "目标大小（像素）",
            tracingPathTypeLabel: "描线路径类型",
            accuracyThresholdLabel: "准确度阈值（%）",
        },

        prediction: {
            title: "预测",
            predictedReactionTimeLabel: "预测反应时间（毫秒）",
            predictedReactionTimePlaceholder: "例如 350",
            predictedHandLabel: "你认为哪只手会更快？",
            continueToReaction: "继续到反应试验",
        },

        reactionTrial: {
            title: "反应试验",
            instruction: "目标出现后请立即点击。",
            dominantHand: "惯用手",
            nonDominantHand: "非惯用手",
            reactionTimeLabel: "反应时间",
            nextTrial: "下一次试验",
        },

        tracingChallenge: {
            title: "描线挑战",
            instruction: "尽可能准确地沿路径描线。",
            accuracyLabel: "准确度",
            deviationLabel: "平均偏差",
            durationLabel: "描线时长",
            continueToResults: "继续到结果",
        },

        results: {
            title: "结果",
            meanReactionTime: "平均反应时间",
            reactionStdDev: "反应时间标准差",
            tracingAccuracy: "描线准确度",
            interpretationTitle: "解释",
        },

        reflection: {
            title: "反思与提交",
            wereYouRightLabel: "你的预测正确吗？",
            surprisesLabel: "有没有意外结果？",
            submitButton: "提交活动",
        },
    },

    a7: {
        meta: {
            title: "呼吸节奏训练——胸部运动、呼吸频率与恢复",
            shortDescription:
                "记录胸部运动，估算呼吸频率，并比较恢复一致性。",
        },

        overview: {
            title: "概览",
            summary:
                "使用手机记录胸部运动，测量静息和运动后的呼吸频率。",
        },

        sessionSetup: {
            title: "会话设置",
            subtitle:
                "开始前先配置参与者数量、测量时长和记录参数。",
            participantCountLabel: "参与者数量",
            participantCountPlaceholder: "例如 3",
            durationLabel: "测量时长（秒）",
            durationPlaceholder: "例如 30",
            samplingHzLabel: "目标采样率（Hz）",
            smoothingWindowLabel: "平滑窗口（秒）",
            minPeakGapLabel: "峰值最小间隔（毫秒）",
        },

        prediction: {
            title: "预测",
            predictedRestBpmLabel: "预测静息呼吸频率（次/分钟）",
            predictedAfterExerciseBpmLabel:
                "预测运动后呼吸频率（次/分钟）",
            expectedHighestPhaseLabel:
                "你认为哪个阶段的呼吸频率最高？",
            continueToMeasurements: "继续到测量",
        },

        measurements: {
            title: "测量",
            restPhase: "静息测量",
            postJogPhase: "运动后测量 1",
            postStarJumpPhase: "运动后测量 2",
            startMeasurement: "开始测量",
            bpmLabel: "每分钟呼吸次数",
            continueToResults: "继续到结果",
        },

        results: {
            title: "结果",
            restBpm: "静息呼吸频率",
            postJogBpm: "慢跑后呼吸频率",
            postStarJumpBpm: "开合跳后呼吸频率",
            recoveryConsistency: "恢复一致性",
            interpretationTitle: "解释",
        },

        reflection: {
            title: "反思与提交",
            wereYouRightLabel: "你的预测正确吗？",
            highestPhaseLabel: "哪个阶段的呼吸频率最高？",
            surprisesLabel: "有没有意外结果？",
            exerciseEffectLabel: "运动如何影响呼吸？",
            submitButton: "提交活动",
        },
    },
} as const;

export default activities;