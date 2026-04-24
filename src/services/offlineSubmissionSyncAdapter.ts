import {
    submitActivity1,
    submitActivity2,
    submitActivity3,
    submitActivity4,
    submitActivity5,
    submitActivity6,
    submitActivity7,
} from "./activitySubmissionService";
import type {OfflineSubmissionRecord} from "../types/offlineSubmission";

type OfflineSubmissionPayload = {
    activityNumber: 1 | 2 | 3 | 4 | 5 | 6 | 7;
    args: unknown;
};

function isOfflineSubmissionPayload(
    value: unknown
): value is OfflineSubmissionPayload {
    if (!value || typeof value !== "object") {
        return false;
    }

    const payload = value as Partial<OfflineSubmissionPayload>;

    return (
        typeof payload.activityNumber === "number" &&
        payload.activityNumber >= 1 &&
        payload.activityNumber <= 7 &&
        typeof payload.args === "object" &&
        payload.args !== null
    );
}

export async function submitOfflineToFirebase(
    submission: OfflineSubmissionRecord
): Promise<{ remoteSubmissionId: string | null }> {
    const payload = submission.payload;

    if (!isOfflineSubmissionPayload(payload)) {
        throw new Error(
            `Invalid offline submission payload for runId: ${submission.runId}`
        );
    }

    switch (payload.activityNumber) {
        case 1: {
            const result = await submitActivity1(payload.args as Parameters<typeof submitActivity1>[0]);
            return {remoteSubmissionId: result.submissionId};
        }

        case 2: {
            const result = await submitActivity2(payload.args as Parameters<typeof submitActivity2>[0]);
            return {remoteSubmissionId: result.submissionId};
        }

        case 3: {
            const result = await submitActivity3(payload.args as Parameters<typeof submitActivity3>[0]);
            return {remoteSubmissionId: result.submissionId};
        }

        case 4: {
            const result = await submitActivity4(payload.args as Parameters<typeof submitActivity4>[0]);
            return {remoteSubmissionId: result.submissionId};
        }

        case 5: {
            const result = await submitActivity5(payload.args as Parameters<typeof submitActivity5>[0]);
            return {remoteSubmissionId: result.submissionId};
        }

        case 6: {
            const result = await submitActivity6(payload.args as Parameters<typeof submitActivity6>[0]);
            return {remoteSubmissionId: result.submissionId};
        }

        case 7: {
            const result = await submitActivity7(payload.args as Parameters<typeof submitActivity7>[0]);
            return {remoteSubmissionId: result.submissionId};
        }

        default:
            throw new Error(
                `Unsupported activity number: ${payload.activityNumber}`
            );
    }
}