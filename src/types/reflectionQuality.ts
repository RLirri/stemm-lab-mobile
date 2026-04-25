export type ReflectionQualityStatus =
    | 'needs_improvement'
    | 'acceptable'
    | 'strong';

export type ReflectionIssueSeverity = 'blocking' | 'warning' | 'suggestion';

export type ReflectionIssueCode =
    | 'empty'
    | 'too_short'
    | 'low_effort'
    | 'repeated_characters'
    | 'repeated_words'
    | 'inappropriate_language'
    | 'needs_more_detail'
    | 'strong_reflection';

export interface ReflectionQualityIssue {
    code: ReflectionIssueCode;
    severity: ReflectionIssueSeverity;
    message: string;
}

export interface ReflectionQualityResult {
    status: ReflectionQualityStatus;
    wordCount: number;
    characterCount: number;
    isSubmissionBlocked: boolean;
    issues: ReflectionQualityIssue[];
    suggestions: string[];
}