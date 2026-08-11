// @vitest-environment node

import { describe, expect, it } from "vitest";

import { TeapotRateLimiter } from "../../src/pusher/teapot/TeapotRateLimiter";

describe("TeapotRateLimiter", () => {
    it("limits a key until its window resets without affecting another key", () => {
        let now = 1_000;
        const limiter = new TeapotRateLimiter(2, 10_000, () => now);

        expect(limiter.consume("candidate-a").allowed).toBe(true);
        expect(limiter.consume("candidate-a").allowed).toBe(true);
        expect(limiter.consume("candidate-a")).toMatchObject({ allowed: false, retryAfterSeconds: 10 });
        expect(limiter.consume("candidate-b").allowed).toBe(true);

        now += 10_000;
        expect(limiter.consume("candidate-a").allowed).toBe(true);
    });

    it("keeps its tracked-key memory bounded by evicting the oldest live window", () => {
        const limiter = new TeapotRateLimiter(1, 10_000, () => 1_000, 2);

        expect(limiter.consume("candidate-a").allowed).toBe(true);
        expect(limiter.consume("candidate-a").allowed).toBe(false);
        expect(limiter.consume("candidate-b").allowed).toBe(true);
        expect(limiter.consume("candidate-b").allowed).toBe(false);

        expect(limiter.consume("candidate-c").allowed).toBe(true);
        expect(limiter.consume("candidate-b").allowed).toBe(false);
        expect(limiter.consume("candidate-a").allowed).toBe(true);
    });

    it("rejects invalid limits instead of silently disabling throttling", () => {
        expect(() => new TeapotRateLimiter(0, 10_000)).toThrow("maximumAttempts");
        expect(() => new TeapotRateLimiter(1, 0)).toThrow("windowMs");
        expect(() => new TeapotRateLimiter(1, 10_000, Date.now, 0)).toThrow("maximumTrackedKeys");
    });
});
