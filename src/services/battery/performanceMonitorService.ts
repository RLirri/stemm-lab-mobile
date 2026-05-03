import type {PerformanceMeasurement} from '../../types/battery';

const now = (): number => {
    if (global.performance?.now) {
        return global.performance.now();
    }

    return Date.now();
};

const createMeasurement = (
    label: string,
    startTime: number,
    startedAt: Date,
    success: boolean,
): PerformanceMeasurement => {
    return {
        label,
        durationMs: Math.round(now() - startTime),
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        success,
    };
};

export const measureAsyncOperation = async <T>(
    label: string,
    operation: () => Promise<T>,
): Promise<T> => {
    const startedAt = new Date();
    const startTime = now();

    try {
        const result = await operation();

        const measurement = createMeasurement(
            label,
            startTime,
            startedAt,
            true,
        );

        if (__DEV__) {
            console.log('[PerformanceMonitor]', measurement);
        }

        return result;
    } catch (error) {
        const measurement = createMeasurement(
            label,
            startTime,
            startedAt,
            false,
        );

        console.log('[PerformanceMonitor]', measurement);

        throw error;
    }
};