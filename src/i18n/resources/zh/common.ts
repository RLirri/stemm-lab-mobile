const common = {
    appName: "STEMM Lab",
    actions: {
        back: "返回",
        cancel: "取消",
        close: "关闭",
        continue: "继续",
        done: "完成",
        logout: "退出登录",
        ok: "确定",
        retry: "重试",
        save: "保存",
        start: "开始",
        startActivity: "开始活动",
        submit: "提交",
    },
    states: {
        loading: "加载中...",
        loadingActivities: "正在加载活动...",
        loadingActivity: "正在加载活动...",
        loadingProfile: "正在加载个人资料...",
        starting: "正在开始...",
        saving: "正在保存...",
    },
    feedback: {
        error: "错误",
        notImplemented: "尚未实现",
        signInRequired: "请先登录",
        updateFailed: "更新失败",
        saved: "已保存",
    },
    empty: {
        noActivitiesYet: "暂无活动",
    },
} as const;

export default common;