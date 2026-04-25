import {Profanity} from '@2toad/profanity';
import {
    ReflectionQualityIssue,
    ReflectionQualityResult,
    ReflectionQualityStatus,
} from '../types/reflectionQuality';

const MIN_WORD_COUNT = 12;
const STRONG_WORD_COUNT = 45;

const LOW_EFFORT_RESPONSES = new Set<string>([
    'good',
    'nice',
    'ok',
    'okay',
    'nothing',
    'none',
    'no',
    'yes',
    'done',
    'fine',
    'great',
    'cool',
    'bad',
    'idk',
    'i dont know',
    "i don't know",
]);

const profanityFilter = new Profanity({
    languages: ['en'],
    wholeWord: true,
});

const normalizeText = (text: string): string =>
    text
        .toLowerCase()
        .replace(/[^\w\s']/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

const getWords = (text: string): string[] => {
    const normalized = normalizeText(text);

    if (normalized.length === 0) {
        return [];
    }

    return normalized.split(' ').filter(Boolean);
};

const hasRepeatedCharacters = (text: string): boolean => {
    const normalized = normalizeText(text);
    return /(.)\1{5,}/i.test(normalized);
};

const hasRepeatedWords = (words: string[]): boolean => {
    if (words.length < 6) {
        return false;
    }

    let repeatCount = 1;

    for (let index = 1; index < words.length; index += 1) {
        if (words[index] === words[index - 1]) {
            repeatCount += 1;

            if (repeatCount >= 3) {
                return true;
            }
        } else {
            repeatCount = 1;
        }
    }

    return false;
};

const buildResult = (
    status: ReflectionQualityStatus,
    wordCount: number,
    characterCount: number,
    issues: ReflectionQualityIssue[],
    suggestions: string[],
): ReflectionQualityResult => {
    const isSubmissionBlocked = issues.some(
        (issue) => issue.severity === 'blocking',
    );

    return {
        status,
        wordCount,
        characterCount,
        isSubmissionBlocked,
        issues,
        suggestions,
    };
};

export const checkReflectionQuality = (
    reflectionText: string,
): ReflectionQualityResult => {
    const trimmedText = reflectionText.trim();
    const normalizedText = normalizeText(trimmedText);
    const words = getWords(trimmedText);

    const issues: ReflectionQualityIssue[] = [];
    const suggestions: string[] = [];

    if (trimmedText.length === 0) {
        issues.push({
            code: 'empty',
            severity: 'blocking',
            message: 'Reflection is required before submission.',
        });

        suggestions.push(
            'Write a few sentences about what you observed, what changed, and what you learned.',
        );

        return buildResult('needs_improvement', 0, 0, issues, suggestions);
    }

    if (words.length < MIN_WORD_COUNT) {
        issues.push({
            code: 'too_short',
            severity: 'blocking',
            message: `Reflection is too short. Please write at least ${MIN_WORD_COUNT} words.`,
        });

        suggestions.push(
            'Add more detail about your result, your prediction, and what you would improve next time.',
        );
    }

    if (LOW_EFFORT_RESPONSES.has(normalizedText)) {
        issues.push({
            code: 'low_effort',
            severity: 'warning',
            message: 'This reflection looks too general or low-effort.',
        });

        suggestions.push(
            'Try explaining what happened during the activity instead of using one-word feedback.',
        );
    }

    if (hasRepeatedCharacters(trimmedText)) {
        issues.push({
            code: 'repeated_characters',
            severity: 'warning',
            message: 'Repeated characters were detected.',
        });

        suggestions.push('Remove repeated characters and write a clearer sentence.');
    }

    if (hasRepeatedWords(words)) {
        issues.push({
            code: 'repeated_words',
            severity: 'warning',
            message: 'Repeated words were detected.',
        });

        suggestions.push('Avoid repeating the same word several times in a row.');
    }

    if (profanityFilter.exists(trimmedText)) {
        issues.push({
            code: 'inappropriate_language',
            severity: 'blocking',
            message: 'Please remove inappropriate language before submitting.',
        });

        suggestions.push(
            'Use respectful scientific language to describe your observations.',
        );
    }

    if (words.length >= MIN_WORD_COUNT && words.length < STRONG_WORD_COUNT) {
        issues.push({
            code: 'needs_more_detail',
            severity: 'suggestion',
            message: 'This is acceptable, but it could be more detailed.',
        });

        suggestions.push(
            'For a stronger reflection, mention your prediction, result, evidence, and one improvement.',
        );
    }

    let status: ReflectionQualityStatus = 'acceptable';

    const hasBlockingIssue = issues.some((issue) => issue.severity === 'blocking');
    const hasWarningIssue = issues.some((issue) => issue.severity === 'warning');

    if (hasBlockingIssue || hasWarningIssue) {
        status = 'needs_improvement';
    } else if (words.length >= STRONG_WORD_COUNT) {
        status = 'strong';

        issues.push({
            code: 'strong_reflection',
            severity: 'suggestion',
            message: 'Strong reflection. Good level of detail.',
        });
    }

    return buildResult(
        status,
        words.length,
        trimmedText.length,
        issues,
        suggestions,
    );
};