export interface TeapotRateLimitResult {
    allowed: boolean;
    retryAfterSeconds: number;
}

interface TeapotRateLimitWindow {
    count: number;
    resetAt: number;
}

/** Small bounded process-local guard; durable token rules remain the authoritative replay protection. */
export class TeapotRateLimiter {
    private readonly windows = new Map<string, TeapotRateLimitWindow>();

    constructor(
        private readonly maximumAttempts: number,
        private readonly windowMs: number,
        private readonly now: () => number = Date.now,
        private readonly maximumTrackedKeys = 10_000,
    ) {
        if (!Number.isSafeInteger(maximumAttempts) || maximumAttempts < 1) {
            throw new Error("maximumAttempts must be a positive integer");
        }
        if (!Number.isSafeInteger(windowMs) || windowMs < 1) {
            throw new Error("windowMs must be a positive integer");
        }
        if (!Number.isSafeInteger(maximumTrackedKeys) || maximumTrackedKeys < 1) {
            throw new Error("maximumTrackedKeys must be a positive integer");
        }
    }

    consume(key: string): TeapotRateLimitResult {
        const now = this.now();
        const current = this.windows.get(key);
        if (current === undefined || current.resetAt <= now) {
            if (current !== undefined) this.windows.delete(key);
            this.makeRoomForNewKey(now);
            this.windows.set(key, { count: 1, resetAt: now + this.windowMs });
            return { allowed: true, retryAfterSeconds: 0 };
        }
        if (current.count >= this.maximumAttempts) {
            return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1_000)) };
        }
        current.count += 1;
        return { allowed: true, retryAfterSeconds: 0 };
    }

    private makeRoomForNewKey(now: number): void {
        if (this.windows.size < this.maximumTrackedKeys) return;
        for (const [key, window] of this.windows) {
            if (window.resetAt <= now) this.windows.delete(key);
        }
        while (this.windows.size >= this.maximumTrackedKeys) {
            const oldestKey = this.windows.keys().next().value;
            if (oldestKey === undefined) return;
            this.windows.delete(oldestKey);
        }
    }
}
