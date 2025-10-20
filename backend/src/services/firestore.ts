import { Firestore } from '@google-cloud/firestore';

export interface UsageRecord {
  userId: string;
  timestamp: Date;
  apiCalls: number;
  tokensUsed: number;
  operation: 'rewrite' | 'schema';
  metadata?: {
    spreadsheetId?: string;
    sheetName?: string;
    cellRange?: string;
    [key: string]: any;
  };
}

export interface DailyUsage {
  userId: string;
  date: string; // YYYY-MM-DD
  totalCalls: number;
  totalTokens: number;
  lastUpdated: Date;
}

export class FirestoreService {
  private db: Firestore;
  private usageCollection: string;
  private logsCollection: string;
  private maxRequestsPerDay: number;

  constructor(options: {
    projectId: string;
    usageCollection?: string;
    logsCollection?: string;
    maxRequestsPerDay?: number;
  }) {
    this.db = new Firestore({ projectId: options.projectId });
    this.usageCollection = options.usageCollection || 'rewriter_usage';
    this.logsCollection = options.logsCollection || 'rewriter_logs';
    this.maxRequestsPerDay = options.maxRequestsPerDay || 100;
  }

  /**
   * Check if user has exceeded daily usage limit
   */
  async checkUsageLimit(userId: string): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const docRef = this.db.collection(this.usageCollection).doc(`${userId}_${today}`);

    try {
      const doc = await docRef.get();

      if (!doc.exists) {
        // First request today
        const resetAt = new Date();
        resetAt.setHours(23, 59, 59, 999); // End of day

        return {
          allowed: true,
          remaining: this.maxRequestsPerDay,
          resetAt,
        };
      }

      const data = doc.data() as DailyUsage;
      const remaining = this.maxRequestsPerDay - data.totalCalls;

      const resetAt = new Date();
      resetAt.setHours(23, 59, 59, 999);

      return {
        allowed: remaining > 0,
        remaining: Math.max(0, remaining),
        resetAt,
      };
    } catch (error: any) {
      console.error('Failed to check usage limit:', error.message);
      // Fail open - allow the request but log the error
      return {
        allowed: true,
        remaining: this.maxRequestsPerDay,
        resetAt: new Date(),
      };
    }
  }

  /**
   * Record API usage
   */
  async recordUsage(record: UsageRecord): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const dailyDocRef = this.db.collection(this.usageCollection).doc(`${record.userId}_${today}`);
    const logDocRef = this.db.collection(this.logsCollection).doc();

    try {
      // Run in transaction to ensure consistency
      await this.db.runTransaction(async (transaction) => {
        const dailyDoc = await transaction.get(dailyDocRef);

        if (dailyDoc.exists) {
          // Update existing daily usage
          const data = dailyDoc.data() as DailyUsage;
          transaction.update(dailyDocRef, {
            totalCalls: data.totalCalls + record.apiCalls,
            totalTokens: data.totalTokens + record.tokensUsed,
            lastUpdated: new Date(),
          });
        } else {
          // Create new daily usage record
          transaction.set(dailyDocRef, {
            userId: record.userId,
            date: today,
            totalCalls: record.apiCalls,
            totalTokens: record.tokensUsed,
            lastUpdated: new Date(),
          });
        }

        // Log individual request
        transaction.set(logDocRef, {
          ...record,
          timestamp: new Date(),
        });
      });

      console.log(`Usage recorded for user ${record.userId}: ${record.apiCalls} calls, ${record.tokensUsed} tokens`);
    } catch (error: any) {
      console.error('Failed to record usage:', error.message);
      // Don't throw - logging failure shouldn't block the request
    }
  }

  /**
   * Get user's daily usage statistics
   */
  async getDailyUsage(userId: string, date?: string): Promise<DailyUsage | null> {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const docRef = this.db.collection(this.usageCollection).doc(`${userId}_${targetDate}`);

    try {
      const doc = await docRef.get();

      if (!doc.exists) {
        return null;
      }

      return doc.data() as DailyUsage;
    } catch (error: any) {
      console.error('Failed to get daily usage:', error.message);
      return null;
    }
  }

  /**
   * Get user's usage logs within a date range
   */
  async getUsageLogs(userId: string, startDate: Date, endDate: Date): Promise<UsageRecord[]> {
    try {
      const snapshot = await this.db
        .collection(this.logsCollection)
        .where('userId', '==', userId)
        .where('timestamp', '>=', startDate)
        .where('timestamp', '<=', endDate)
        .orderBy('timestamp', 'desc')
        .limit(100)
        .get();

      return snapshot.docs.map(doc => doc.data() as UsageRecord);
    } catch (error: any) {
      console.error('Failed to get usage logs:', error.message);
      return [];
    }
  }
}
