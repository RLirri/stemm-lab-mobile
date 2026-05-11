/**
 * Activity 6 – Reaction Board Challenge service
 * Responsibilities:
 * 1) Generate randomized stimulus timing and screen locations (FR-A6-01)
 * 2) Compute reaction time in milliseconds (FR-A6-02)
 * 3) Compute statistics (mean, std dev) for reaction trials (FR-A6-05)
 * 4) Compute tracing deviation + accuracy score (FR-A6-04/05)
 *
 * NOTE:
 * - This service is UI-agnostic.
 * - Screens supply screen bounds (width/height) and receive normalized coordinates 0..1
 *   to remain device-agnostic.
 */

export type A6HandType = "dominant" | "non_dominant";

export type A6Rng = () => number;

export type A6StimulusConfig = {
    delayMinSec: number;
    delayMaxSec: number;
    extraMarginPx?: number;
};

export type A6ScreenRect = {
    width: number;
    height: number;
};

export type A6TargetPlan = {
    delayMs: number;
    location: { x: number; y: number };
};

export type A6TargetPresentation = {
    delayMs: number;
    appearedAt: number;
    location: { x: number; y: number };
};

export type A6ReactionRecord = {
    participantId: string;
    hand: A6HandType;
    trialNumber: number;
    appearedAt: number;
    tapAt: number;
    reactionTimeMs: number;
    timestamp: number;
};

export type A6ReactionStats = {
    n: number;
    meanReactionTimeMs: number;
    stdDevReactionTimeMs: number;
    fastestReactionTimeMs?: number;
};

export type A6TracePoint = {
    tMs: number;
    x: number;
    y: number;
};

export type A6DeviationResult = {
    avgDeviationPx: number;
    maxDeviationPx: number;
    rmsDeviationPx: number;
    durationMs: number;
};

export type A6TracingScore = {
    avgDeviationPx: number;
    maxAllowedDeviationPx: number;
    accuracyScorePct: number;
};

export const A6_DEFAULT_DELAY_MIN_SEC = 1.0;
export const A6_DEFAULT_DELAY_MAX_SEC = 3.0;

export const A6_MIN_DELAY_SEC = 0.5;
export const A6_MAX_DELAY_SEC = 10.0;

export const A6_MIN_TARGET_SIZE_PX = 24;
export const A6_MAX_TARGET_SIZE_PX = 120;

export const A6_MIN_MAX_DEV_PX = 10;
export const A6_MAX_MAX_DEV_PX = 200;

/**
 * More realistic default for human touch tracing on a phone.
 * 40 px was too strict in practice.
 */
export const A6_RECOMMENDED_MAX_DEV_PX = 100;

/* =========================================================
   Helpers
========================================================= */

function clampNum(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

function clampInt(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, Math.round(n)));
}

function safeFinite(x: unknown): number {
    return typeof x === "number" && Number.isFinite(x) ? x : 0;
}

function nowMs(): number {
    return Date.now();
}

function sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function mean(xs: number[]): number {
    if (xs.length === 0) return 0;
    let s = 0;
    for (const x of xs) s += x;
    return s / xs.length;
}

function stdDevPopulation(xs: number[], m: number): number {
    if (xs.length === 0) return 0;
    let s = 0;
    for (const x of xs) {
        const d = x - m;
        s += d * d;
    }
    return Math.sqrt(s / xs.length);
}

function distancePx(ax: number, ay: number, bx: number, by: number): number {
    const dx = ax - bx;
    const dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
}

/* =========================================================
   FR-A6-01: Randomized plan generation
========================================================= */

export function planNextTarget(args: {
    cfg?: Partial<A6StimulusConfig>;
    screen: A6ScreenRect;
    targetSizePx: number;
    rng?: A6Rng;
}): A6TargetPlan {
    const rng = args.rng ?? Math.random;

    const min = clampNum(args.cfg?.delayMinSec ?? A6_DEFAULT_DELAY_MIN_SEC, A6_MIN_DELAY_SEC, A6_MAX_DELAY_SEC);
    const maxRaw = clampNum(args.cfg?.delayMaxSec ?? A6_DEFAULT_DELAY_MAX_SEC, A6_MIN_DELAY_SEC, A6_MAX_DELAY_SEC);
    const max = Math.max(maxRaw, min + 0.1);
    const delayMs = clampInt((min + (max - min) * rng()) * 1000, 0, 60_000);

    const w = safeFinite(args.screen.width);
    const h = safeFinite(args.screen.height);
    if (w <= 0 || h <= 0) {
        return {delayMs, location: {x: 0.5, y: 0.5}};
    }

    const size = clampInt(args.targetSizePx, A6_MIN_TARGET_SIZE_PX, A6_MAX_TARGET_SIZE_PX);
    const extra = clampInt(args.cfg?.extraMarginPx ?? 8, 0, 64);

    const marginX = Math.min(w / 2, size / 2 + extra);
    const marginY = Math.min(h / 2, size / 2 + extra);

    const spanX = Math.max(1, w - 2 * marginX);
    const spanY = Math.max(1, h - 2 * marginY);

    const px = marginX + rng() * spanX;
    const py = marginY + rng() * spanY;

    const nx = clampNum(px / w, 0, 1);
    const ny = clampNum(py / h, 0, 1);

    return {delayMs, location: {x: nx, y: ny}};
}

export async function waitAndActivateTarget(plan: A6TargetPlan): Promise<A6TargetPresentation> {
    await sleep(plan.delayMs);
    return {
        delayMs: plan.delayMs,
        appearedAt: nowMs(),
        location: plan.location,
    };
}

/* =========================================================
   FR-A6-02: Reaction time measurement
========================================================= */

export function computeReactionTimeMs(tapAt: number, appearedAt: number): number {
    return clampInt(Math.max(0, safeFinite(tapAt) - safeFinite(appearedAt)), 0, 120_000);
}

export function buildReactionRecord(args: {
    participantId: string;
    hand: A6HandType;
    trialNumber: number;
    appearedAt: number;
    tapAt: number;
}): A6ReactionRecord {
    const reactionTimeMs = computeReactionTimeMs(args.tapAt, args.appearedAt);
    return {
        participantId: args.participantId,
        hand: args.hand,
        trialNumber: clampInt(args.trialNumber, 1, 999),
        appearedAt: safeFinite(args.appearedAt),
        tapAt: safeFinite(args.tapAt),
        reactionTimeMs,
        timestamp: safeFinite(args.tapAt),
    };
}

/* =========================================================
   FR-A6-05: Stats
========================================================= */

export function computeReactionStats(reactionTimesMs: number[]): A6ReactionStats {
    const xs = (reactionTimesMs ?? []).filter((v) => Number.isFinite(v) && v >= 0);

    if (xs.length === 0) {
        return {n: 0, meanReactionTimeMs: 0, stdDevReactionTimeMs: 0};
    }

    const m = mean(xs);
    const sd = stdDevPopulation(xs, m);
    const fastest = Math.min(...xs);

    return {
        n: xs.length,
        meanReactionTimeMs: m,
        stdDevReactionTimeMs: sd,
        fastestReactionTimeMs: fastest,
    };
}

/* =========================================================
   FR-A6-04/05: Tracing deviation + accuracy
========================================================= */

/**
 * Nearest-point tracing deviation:
 * For each user point, measure distance to the nearest reference point.
 *
 * This is much more robust than index-aligned comparison because it does not
 * punish users heavily for tracing the correct shape at a slightly different speed.
 */
export function computeTracingDeviation(args: {
    userPath: A6TracePoint[];
    referencePath: A6TracePoint[];
    screen: A6ScreenRect;
    startedAt: number;
    endedAt: number;
}): A6DeviationResult {
    const w = Math.max(1, safeFinite(args.screen.width));
    const h = Math.max(1, safeFinite(args.screen.height));

    const user = (args.userPath ?? []).filter(
        (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y)
    );
    const ref = (args.referencePath ?? []).filter(
        (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y)
    );

    const durationMs = clampInt(Math.max(0, args.endedAt - args.startedAt), 0, 10 * 60 * 1000);

    if (user.length < 2 || ref.length < 2) {
        return {
            avgDeviationPx: 0,
            maxDeviationPx: 0,
            rmsDeviationPx: 0,
            durationMs,
        };
    }

    let sum = 0;
    let sum2 = 0;
    let mx = 0;

    for (const up of user) {
        const ux = clampNum(up.x, 0, 1) * w;
        const uy = clampNum(up.y, 0, 1) * h;

        let nearest = Number.POSITIVE_INFINITY;

        for (const rp of ref) {
            const rx = clampNum(rp.x, 0, 1) * w;
            const ry = clampNum(rp.y, 0, 1) * h;
            const d = distancePx(ux, uy, rx, ry);
            if (d < nearest) nearest = d;
        }

        sum += nearest;
        sum2 += nearest * nearest;
        mx = Math.max(mx, nearest);
    }

    const avgDeviationPx = sum / user.length;
    const rmsDeviationPx = Math.sqrt(sum2 / user.length);

    return {
        avgDeviationPx,
        maxDeviationPx: mx,
        rmsDeviationPx,
        durationMs,
    };
}

/**
 * Softer scoring curve:
 * Instead of dropping straight to 0 when avgDeviation > maxAllowed,
 * we decay more gradually to produce usable scores on real touch input.
 */
export function computeTracingAccuracyScore(args: {
    avgDeviationPx: number;
    maxAllowedDeviationPx: number;
}): A6TracingScore {
    const maxAllowed = clampInt(
        args.maxAllowedDeviationPx || A6_RECOMMENDED_MAX_DEV_PX,
        A6_MIN_MAX_DEV_PX,
        A6_MAX_MAX_DEV_PX
    );
    const avgDev = clampNum(args.avgDeviationPx, 0, 1e9);

    const normalized = avgDev / Math.max(1, maxAllowed);

    // gentler decay than strict linear 1 - dev/maxAllowed
    const pct = clampNum(100 - normalized * 45, 0, 100);

    return {
        avgDeviationPx: avgDev,
        maxAllowedDeviationPx: maxAllowed,
        accuracyScorePct: pct,
    };
}