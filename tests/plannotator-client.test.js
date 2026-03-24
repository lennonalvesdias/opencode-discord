// tests/plannotator-client.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PlannotatorClient } from '../src/plannotator-client.js';

// ─── Mock fetch ──────────────────────────────────────────────────────────────

function makeFetchMock(status = 200, body = null) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    text: () => Promise.resolve(body !== null ? JSON.stringify(body) : ''),
  });
}

// ─── Testes ──────────────────────────────────────────────────────────────────

describe('PlannotatorClient', () => {
  let client;
  let originalFetch;

  beforeEach(() => {
    client = new PlannotatorClient('http://localhost:5100');
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('getPlan()', () => {
    it('retorna dados do plano quando o servidor responde com sucesso', async () => {
      globalThis.fetch = makeFetchMock(200, { content: 'Plano de teste', version: 1 });
      const result = await client.getPlan();
      expect(result).toEqual({ content: 'Plano de teste', version: 1 });
    });

    it('retorna null quando o servidor não está no ar (ECONNREFUSED)', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' }));
      const result = await client.getPlan();
      expect(result).toBeNull();
    });

    it('retorna null quando o servidor retorna erro HTTP', async () => {
      globalThis.fetch = makeFetchMock(404, null);
      const result = await client.getPlan();
      expect(result).toBeNull();
    });
  });

  describe('approve()', () => {
    it('envia POST /api/approve com agentSwitch=build por padrão', async () => {
      globalThis.fetch = makeFetchMock(200, {});
      await client.approve();
      const [url, opts] = globalThis.fetch.mock.calls[0];
      expect(url).toBe('http://localhost:5100/api/approve');
      expect(opts.method).toBe('POST');
      const body = JSON.parse(opts.body);
      expect(body.agentSwitch).toBe('build');
      expect(body.approved).toBe(true);
    });

    it('permite sobrescrever agentSwitch', async () => {
      globalThis.fetch = makeFetchMock(200, {});
      await client.approve({ agentSwitch: 'coder' });
      const [, opts] = globalThis.fetch.mock.calls[0];
      expect(JSON.parse(opts.body).agentSwitch).toBe('coder');
    });

    it('lança erro quando o servidor retorna status de erro', async () => {
      globalThis.fetch = makeFetchMock(500, null);
      await expect(client.approve()).rejects.toThrow();
    });
  });

  describe('deny()', () => {
    it('envia POST /api/deny com feedback e approved=false', async () => {
      globalThis.fetch = makeFetchMock(200, {});
      await client.deny({ feedback: 'Precisa de mais detalhes' });
      const [url, opts] = globalThis.fetch.mock.calls[0];
      expect(url).toBe('http://localhost:5100/api/deny');
      const body = JSON.parse(opts.body);
      expect(body.feedback).toBe('Precisa de mais detalhes');
      expect(body.approved).toBe(false);
    });

    it('lança erro quando o servidor retorna status de erro', async () => {
      globalThis.fetch = makeFetchMock(500, null);
      await expect(client.deny({ feedback: 'x' })).rejects.toThrow();
    });
  });
});
