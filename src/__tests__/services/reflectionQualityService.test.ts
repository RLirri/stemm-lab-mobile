import {checkReflectionQuality} from '../../services/reflectionQualityService';

describe('Reflection Quality Service', () => {
    it('blocks empty reflections', () => {
        const result = checkReflectionQuality('   ');

        expect(result.status).toBe('needs_improvement');
        expect(result.isSubmissionBlocked).toBe(true);
        expect(result.wordCount).toBe(0);
        expect(result.issues.some((issue) => issue.code === 'empty')).toBe(true);
    });

    it('blocks reflections that are below the minimum word count', () => {
        const result = checkReflectionQuality('It was good');

        expect(result.status).toBe('needs_improvement');
        expect(result.isSubmissionBlocked).toBe(true);
        expect(result.issues.some((issue) => issue.code === 'too_short')).toBe(true);
    });

    it('detects low-effort one-word responses', () => {
        const result = checkReflectionQuality('good');

        expect(result.status).toBe('needs_improvement');
        expect(result.issues.some((issue) => issue.code === 'low_effort')).toBe(true);
    });

    it('detects repeated characters', () => {
        const result = checkReflectionQuality(
            'The result was sooooooo different from what I expected today.',
        );

        expect(result.status).toBe('needs_improvement');
        expect(result.issues.some((issue) => issue.code === 'repeated_characters')).toBe(true);
    });

    it('accepts a valid reflection but suggests more detail', () => {
        const result = checkReflectionQuality(
            'My prediction was different from the result because the measured value changed after each trial.',
        );

        expect(result.status).toBe('acceptable');
        expect(result.isSubmissionBlocked).toBe(false);
        expect(result.issues.some((issue) => issue.code === 'needs_more_detail')).toBe(true);
    });

    it('marks detailed reflections as strong', () => {
        const result = checkReflectionQuality(
            'Before starting the activity, I predicted that the result would remain mostly stable across all trials. ' +
            'However, the measured result changed more than I expected because each attempt was affected by setup differences and user handling. ' +
            'From this activity, I learned that repeated measurements are important because one result alone may not represent the full pattern. ' +
            'Next time, I would control the setup more carefully and compare the trials using clearer evidence.',
        );

        expect(result.status).toBe('strong');
        expect(result.isSubmissionBlocked).toBe(false);
        expect(result.wordCount).toBeGreaterThanOrEqual(45);
        expect(result.issues.some((issue) => issue.code === 'strong_reflection')).toBe(true);
    });
});