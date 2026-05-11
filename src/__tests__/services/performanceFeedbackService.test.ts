import {generatePerformanceFeedback} from '../../services/performanceFeedback/performanceFeedbackService';
import {generateActivity1Feedback} from '../../services/performanceFeedback/rules/activity1Rules';
import {generateActivity2Feedback} from '../../services/performanceFeedback/rules/activity2Rules';
import {generateActivity7Feedback} from '../../services/performanceFeedback/rules/activity7Rules';

jest.mock('../../services/performanceFeedback/rules/activity1Rules', () => ({
    generateActivity1Feedback: jest.fn(() => ({
        activityId: 'activity1',
        overallLevel: 'good',
        summary: 'Activity 1 feedback generated.',
        items: [],
    })),
}));

jest.mock('../../services/performanceFeedback/rules/activity2Rules', () => ({
    generateActivity2Feedback: jest.fn(() => ({
        activityId: 'activity2',
        overallLevel: 'needs_improvement',
        summary: 'Activity 2 feedback generated.',
        items: [],
    })),
}));

jest.mock('../../services/performanceFeedback/rules/activity3Rules', () => ({
    generateActivity3Feedback: jest.fn(),
}));

jest.mock('../../services/performanceFeedback/rules/activity4Rules', () => ({
    generateActivity4Feedback: jest.fn(),
}));

jest.mock('../../services/performanceFeedback/rules/activity5Rules', () => ({
    generateActivity5Feedback: jest.fn(),
}));

jest.mock('../../services/performanceFeedback/rules/activity6Rules', () => ({
    generateActivity6Feedback: jest.fn(),
}));

jest.mock('../../services/performanceFeedback/rules/activity7Rules', () => ({
    generateActivity7Feedback: jest.fn(() => ({
        activityId: 'activity7',
        overallLevel: 'excellent',
        summary: 'Activity 7 feedback generated.',
        items: [],
    })),
}));

describe('Performance Feedback Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('routes Activity 1 run data to the Activity 1 feedback rule', () => {
        const runData = [{label: 'Trial 1', predicted: 10, actual: 12}];

        const result = generatePerformanceFeedback('activity1', runData);

        expect(generateActivity1Feedback).toHaveBeenCalledWith(runData);
        expect(result.activityId).toBe('activity1');
        expect(result.overallLevel).toBe('good');
    });

    it('routes Activity 2 run data to the Activity 2 feedback rule', () => {
        const runData = {
            trials: [{attempt: 1, result: 15}],
        };

        const result = generatePerformanceFeedback('activity2', runData);

        expect(generateActivity2Feedback).toHaveBeenCalledWith(runData);
        expect(result.activityId).toBe('activity2');
        expect(result.overallLevel).toBe('needs_improvement');
    });

    it('routes Activity 7 run data to the Activity 7 feedback rule', () => {
        const runData = {
            breathingSessions: [{durationSeconds: 60, consistencyScore: 85}],
        };

        const result = generatePerformanceFeedback('activity7', runData);

        expect(generateActivity7Feedback).toHaveBeenCalledWith(runData);
        expect(result.activityId).toBe('activity7');
        expect(result.summary).toContain('Activity 7');
    });

    it('returns fallback feedback for an unsupported activity id', () => {
        const result = generatePerformanceFeedback('activity99' as any, {});

        expect(result.activityId).toBe('activity99');
        expect(result.overallLevel).toBe('good');
        expect(result.items[0].type).toBe('suggestion');
    });
});