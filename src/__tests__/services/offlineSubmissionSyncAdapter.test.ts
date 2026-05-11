import {submitOfflineToFirebase} from '../../services/offlineSubmissionSyncAdapter';

import {submitActivity1, submitActivity2, submitActivity7,} from '../../services/activitySubmissionService';

jest.mock('../../services/activitySubmissionService', () => ({
    submitActivity1: jest.fn(),
    submitActivity2: jest.fn(),
    submitActivity3: jest.fn(),
    submitActivity4: jest.fn(),
    submitActivity5: jest.fn(),
    submitActivity6: jest.fn(),
    submitActivity7: jest.fn(),
}));

const mockedSubmitActivity1 = submitActivity1 as jest.Mock;
const mockedSubmitActivity2 = submitActivity2 as jest.Mock;
const mockedSubmitActivity7 = submitActivity7 as jest.Mock;

describe('Offline Submission Sync Adapter', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('routes Activity 1 offline payload to submitActivity1', async () => {
        mockedSubmitActivity1.mockResolvedValue({
            submissionId: 'remote-a1-001',
        });

        const result = await submitOfflineToFirebase({
            runId: 'run-a1-001',
            activityId: 'activity1',
            status: 'queued',
            payload: {
                activityNumber: 1,
                args: {
                    run: {runId: 'run-a1-001'},
                    teamId: 'team-001',
                    createdBy: 'user-001',
                    bestAttemptIndex: 0,
                    reflection: 'Valid reflection',
                    rating: 5,
                },
            },
        } as any);

        expect(mockedSubmitActivity1).toHaveBeenCalledWith({
            run: {runId: 'run-a1-001'},
            teamId: 'team-001',
            createdBy: 'user-001',
            bestAttemptIndex: 0,
            reflection: 'Valid reflection',
            rating: 5,
        });

        expect(result.remoteSubmissionId).toBe('remote-a1-001');
    });

    it('routes Activity 2 offline payload to submitActivity2', async () => {
        mockedSubmitActivity2.mockResolvedValue({
            submissionId: 'remote-a2-001',
        });

        const result = await submitOfflineToFirebase({
            runId: 'run-a2-001',
            activityId: 'activity2',
            status: 'queued',
            payload: {
                activityNumber: 2,
                args: {
                    run: {runId: 'run-a2-001'},
                    teamId: 'team-002',
                    createdBy: 'user-002',
                    bestTrialIndex: 0,
                    reflection: 'Activity 2 reflection',
                    rating: 4,
                },
            },
        } as any);

        expect(mockedSubmitActivity2).toHaveBeenCalled();
        expect(result.remoteSubmissionId).toBe('remote-a2-001');
    });

    it('routes Activity 7 offline payload to submitActivity7', async () => {
        mockedSubmitActivity7.mockResolvedValue({
            submissionId: 'remote-a7-001',
        });

        const result = await submitOfflineToFirebase({
            runId: 'run-a7-001',
            activityId: 'activity7',
            status: 'queued',
            payload: {
                activityNumber: 7,
                args: {
                    run: {runId: 'run-a7-001'},
                    teamId: 'team-007',
                    createdBy: 'user-007',
                    reflection: 'Activity 7 breathing reflection',
                    rating: 5,
                },
            },
        } as any);

        expect(mockedSubmitActivity7).toHaveBeenCalled();
        expect(result.remoteSubmissionId).toBe('remote-a7-001');
    });

    it('throws an error for invalid offline submission payload', async () => {
        await expect(
            submitOfflineToFirebase({
                runId: 'invalid-run',
                activityId: 'activity1',
                status: 'queued',
                payload: {
                    activityNumber: 99,
                    args: {},
                },
            } as any),
        ).rejects.toThrow('Invalid offline submission payload for runId: invalid-run');
    });
});