import cron from 'node-cron';
import prisma from '../config/prisma.js';

/**
 * Initialize all scheduled tasks for the authentication service.
 */
export const initCronJobs = () => {
    // Run every hour at minute 0
    // Cleans up entries in the PendingUser table that are older than 24 hours.
    cron.schedule('0 * * * *', async () => {
        try {
            console.log('[CRON] Starting cleanup of stale pending users...');
            const twentyFourHoursAgo = new Date();
            twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

            const deleted = await prisma.pendingUser.deleteMany({
                where: {
                    created_at: {
                        lt: twentyFourHoursAgo
                    }
                }
            });

            if (deleted.count > 0) {
                console.log(`[CRON] Cleanup successful: ${deleted.count} stale pending users removed.`);
            } else {
                console.log('[CRON] Cleanup finished: No stale entries found.');
            }
        } catch (error) {
            console.error('[CRON ERROR] Failed to clean up stale pending users:', error);
        }
    });

    console.log('[CRON] Scheduled tasks initialized (Cleanup PendingUsers every hour).');
};
