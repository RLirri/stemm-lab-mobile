import {
    getQueuedSubmissionStatus,
    queueFinalSubmission,
} from '../../services/offlineSubmissionQueueService';

import {
    getOfflineSubmissionByRunId,
    upsertOfflineSubmission,
} from '../../services/localDb/repositories/offlineSubmissionRepository';

jest.mock('../../services/localDb/repositories/offlineSubmissionRepository', () => ({
    getOfflineSubmissionByRunId: jest.fn(),
    upsertOfflineSubmission: jest.fn(),
}));

const mockedGetByRunId = getOfflineSubmissionByRunId as jest.Mock;
const mockedUpsert = upsertOfflineSubmission as jest.Mock;

describe('Offline Submission Queue Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('throws an error when runId is empty', async () => {
        await expect(
            queueFinalSubmission({
                runId: '   ',
                activityId: 'activity1',
                payload: {score: 90},
            }),
        ).rejects.toThrow('Cannot queue offline submission without runId.');
    });

    it('throws an error when activityId is empty', async () => {
        await expect(
            queueFinalSubmission({
                runId: 'run-001',
                activityId: '   ',
                payload: {score: 90},
            }),
        ).rejects.toThrow('Cannot queue offline submission without activityId.');
    });

    it('does not requeue an already synced submission', async () => {
        const existingSubmission = {
            runId: 'run-001',
            activityId: 'activity1',
            userId: 'user-001',
            teamId: 'team-001',
            status: 'synced',
            payload: {score: 95},
            retryCount: 1,
            lastAttemptAt: null,
            lastError: null,
            remoteSubmissionId: 'remote-001',
            createdAt: '2026-05-08T00:00:00.000Z',
            updatedAt: '2026-05-08T00:00:00.000Z',
        };

        mockedGetByRunId.mockResolvedValue(existingSubmission);

        const result = await queueFinalSubmission({
            runId: 'run-001',
            activityId: 'activity1',
            userId: 'user-001',
            teamId: 'team-001',
            payload: {score: 95},
        });

        expect(result.queued).toBe(false);
        expect(result.alreadySynced).toBe(true);
        expect(result.submission).toEqual(existingSubmission);
        expect(mockedUpsert).not.toHaveBeenCalled();
    });

    it('queues a new offline submission when no synced record exists', async () => {
        const savedSubmission = {
            runId: 'run-002',
            activityId: 'activity2',
            userId: 'user-002',
            teamId: null,
            status: 'queued',
            payload: {result: 80},
            retryCount: 0,
            lastAttemptAt: null,
            lastError: null,
            remoteSubmissionId: null,
            createdAt: '2026-05-08T00:00:00.000Z',
            updatedAt: '2026-05-08T00:00:00.000Z',
        };

        mockedGetByRunId.mockResolvedValue(null);
        mockedUpsert.mockResolvedValue(savedSubmission);

        const result = await queueFinalSubmission({
            runId: 'run-002',
            activityId: 'activity2',
            userId: 'user-002',
            payload: {result: 80},
        });

        expect(mockedUpsert).toHaveBeenCalledWith({
            runId: 'run-002',
            activityId: 'activity2',
            userId: 'user-002',
            teamId: null,
            payload: {result: 80},
        });

        expect(result.queued).toBe(true);
        expect(result.alreadySynced).toBe(false);
        expect(result.submission.status).toBe('queued');
    });

    it('returns queued submission status by runId', async () => {
        mockedGetByRunId.mockResolvedValue({
            runId: 'run-003',
            activityId: 'activity3',
            status: 'failed',
            payload: {},
            retryCount: 2,
            createdAt: '2026-05-08T00:00:00.000Z',
            updatedAt: '2026-05-08T00:00:00.000Z',
        });

        const status = await getQueuedSubmissionStatus('run-003');

        expect(status).toBe('failed');
    });

    it('returns null when no queued submission status exists', async () => {
        mockedGetByRunId.mockResolvedValue(null);

        const status = await getQueuedSubmissionStatus('missing-run');

        expect(status).toBeNull();
    });
});