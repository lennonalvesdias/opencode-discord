// src/rate-limiter.js
// Rate limiter simples por usuário baseado em janela deslizante

/**
 * @typedef {Object} UserBucket
 * @property {number[]} timestamps - Timestamps das ações recentes
 */

export class RateLimiter {
  /**
   * @param {object} opts
   * @param {number} opts.maxActions - Número máximo de ações por janela
   * @param {number} opts.windowMs - Tamanho da janela em milissegundos
   */
  constructor({ maxActions = 5, windowMs = 60_000 } = {}) {
    this.maxActions = maxActions;
    this.windowMs = windowMs;
    /** @type {Map<string, UserBucket>} */
    this._buckets = new Map();
  }

  /**
   * Verifica se a ação deve ser permitida e registra se sim.
   * @param {string} userId
   * @returns {{ allowed: boolean, retryAfterMs?: number }}
   */
  check(userId) {
    const now = Date.now();
    const cutoff = now - this.windowMs;

    let bucket = this._buckets.get(userId);
    if (!bucket) {
      bucket = { timestamps: [] };
      this._buckets.set(userId, bucket);
    }

    // Remove timestamps expirados
    bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);

    if (bucket.timestamps.length >= this.maxActions) {
      const oldestInWindow = bucket.timestamps[0];
      const retryAfterMs = oldestInWindow + this.windowMs - now;
      return { allowed: false, retryAfterMs };
    }

    bucket.timestamps.push(now);
    return { allowed: true };
  }
}
