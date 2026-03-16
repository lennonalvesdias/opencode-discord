import { describe, it, expect } from 'vitest';
import { RateLimiter } from '../src/rate-limiter.js';

describe('RateLimiter', () => {
  it('permite ações dentro do limite', () => {
    const limiter = new RateLimiter({ maxActions: 3, windowMs: 60_000 });

    expect(limiter.check('user1').allowed).toBe(true);
    expect(limiter.check('user1').allowed).toBe(true);
    expect(limiter.check('user1').allowed).toBe(true);
  });

  it('bloqueia após atingir o limite', () => {
    const limiter = new RateLimiter({ maxActions: 2, windowMs: 60_000 });

    limiter.check('user1');
    limiter.check('user1');

    const result = limiter.check('user1');
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it('isola limites entre usuários diferentes', () => {
    const limiter = new RateLimiter({ maxActions: 1, windowMs: 60_000 });

    expect(limiter.check('user1').allowed).toBe(true);
    expect(limiter.check('user2').allowed).toBe(true);
    expect(limiter.check('user1').allowed).toBe(false);
  });

  it('permite novamente após a janela expirar', () => {
    const limiter = new RateLimiter({ maxActions: 1, windowMs: 10 });

    limiter.check('user1');

    // Simula passagem do tempo manipulando timestamps
    limiter._buckets.get('user1').timestamps[0] = Date.now() - 20;

    expect(limiter.check('user1').allowed).toBe(true);
  });
});
