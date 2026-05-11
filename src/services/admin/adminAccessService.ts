const ADMIN_UIDS = ['U9Uicg91tbVUTBQvyFpmB3rXtI92'];

export function isAdminUser(uid?: string | null): boolean {
    return !!uid && ADMIN_UIDS.includes(uid);
}

export function getAdminUidList(): string[] {
    return ADMIN_UIDS;
}