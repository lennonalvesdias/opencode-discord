// tests/opencode-client.test.js
// Testes para OpenCodeClient — cliente HTTP da API opencode

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OpenCodeClient } from '../src/opencode-client.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BASE_URL = 'http://localhost:4100';

/**
 * Cria um mock de Response do fetch com status e dados configuráveis.
 * @param {unknown} data - Dados a retornar em json() e text()
 * @param {number} [status=200] - HTTP status code
 * @returns {object}
 */
function mockResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  };
}

// ─── Suite principal ──────────────────────────────────────────────────────────

describe('OpenCodeClient', () => {
  let mockFetch;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ─── createSession ──────────────────────────────────────────────────────────

  describe('createSession()', () => {
    it('chama fetch com POST /session e retorna JSON da resposta', async () => {
      mockFetch.mockResolvedValue(mockResponse({ id: 'sess-123' }));
      const client = new OpenCodeClient(BASE_URL);

      const result = await client.createSession();

      expect(result.id).toBe('sess-123');
      expect(mockFetch).toHaveBeenCalledWith(
        `${BASE_URL}/session`,
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('lança Error descritivo quando servidor retorna 500', async () => {
      mockFetch.mockResolvedValue(mockResponse({ error: 'Internal Server Error' }, 500));
      const client = new OpenCodeClient(BASE_URL);

      await expect(client.createSession()).rejects.toThrow('500');
    });

    it('inclui path /session na mensagem de erro lançada', async () => {
      mockFetch.mockResolvedValue(mockResponse('erro', 503));
      const client = new OpenCodeClient(BASE_URL);

      await expect(client.createSession()).rejects.toThrow('/session');
    });
  });

  // ─── sendMessage ────────────────────────────────────────────────────────────

  describe('sendMessage()', () => {
    it('chama fetch com URL correta contendo sessionId e prompt_async', async () => {
      mockFetch.mockResolvedValue(mockResponse(null));
      const client = new OpenCodeClient(BASE_URL);

      await client.sendMessage('sess-456', 'primary', 'Olá mundo');

      expect(mockFetch).toHaveBeenCalledWith(
        `${BASE_URL}/session/sess-456/prompt_async`,
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('inclui agent e parts no corpo JSON da requisição', async () => {
      mockFetch.mockResolvedValue(mockResponse(null));
      const client = new OpenCodeClient(BASE_URL);

      await client.sendMessage('sess-456', 'primary', 'Olá mundo');

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.agent).toBe('primary');
      expect(body.parts).toEqual([{ type: 'text', text: 'Olá mundo' }]);
    });

    it('lança Error quando servidor retorna 400', async () => {
      mockFetch.mockResolvedValue(mockResponse('Bad Request', 400));
      const client = new OpenCodeClient(BASE_URL);

      await expect(client.sendMessage('sess-456', 'primary', 'msg')).rejects.toThrow('400');
    });
  });

  // ─── abortSession ────────────────────────────────────────────────────────────

  describe('abortSession()', () => {
    it('chama POST em /session/{id}/abort', async () => {
      mockFetch.mockResolvedValue(mockResponse(null));
      const client = new OpenCodeClient(BASE_URL);

      await client.abortSession('sess-789');

      expect(mockFetch).toHaveBeenCalledWith(
        `${BASE_URL}/session/sess-789/abort`,
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('lança Error quando servidor retorna erro ao abortar', async () => {
      mockFetch.mockResolvedValue(mockResponse('falhou', 500));
      const client = new OpenCodeClient(BASE_URL);

      await expect(client.abortSession('sess-789')).rejects.toThrow();
    });
  });

  // ─── deleteSession ───────────────────────────────────────────────────────────

  describe('deleteSession()', () => {
    it('chama DELETE em /session/{id}', async () => {
      mockFetch.mockResolvedValue(mockResponse(null));
      const client = new OpenCodeClient(BASE_URL);

      await client.deleteSession('sess-101');

      expect(mockFetch).toHaveBeenCalledWith(
        `${BASE_URL}/session/sess-101`,
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('lança Error quando sessão não encontrada (404)', async () => {
      mockFetch.mockResolvedValue(mockResponse('Not Found', 404));
      const client = new OpenCodeClient(BASE_URL);

      await expect(client.deleteSession('sess-101')).rejects.toThrow('404');
    });
  });

  // ─── approvePermission ───────────────────────────────────────────────────────

  describe('approvePermission()', () => {
    it('chama POST em /session/{id}/permissions/{permId}', async () => {
      mockFetch.mockResolvedValue(mockResponse(null));
      const client = new OpenCodeClient(BASE_URL);

      await client.approvePermission('sess-202', 'perm-abc');

      expect(mockFetch).toHaveBeenCalledWith(
        `${BASE_URL}/session/sess-202/permissions/perm-abc`,
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('usa permissionId correto na URL', async () => {
      mockFetch.mockResolvedValue(mockResponse(null));
      const client = new OpenCodeClient(BASE_URL);

      await client.approvePermission('sess-202', 'perm-xyz-999');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('perm-xyz-999');
    });

    it('lança Error quando aprovação falha', async () => {
      mockFetch.mockResolvedValue(mockResponse('Forbidden', 403));
      const client = new OpenCodeClient(BASE_URL);

      await expect(client.approvePermission('sess-202', 'perm-abc')).rejects.toThrow('403');
    });
  });

  // ─── _fetch ──────────────────────────────────────────────────────────────────

  describe('_fetch()', () => {
    it('inclui Content-Type: application/json nos headers da requisição', async () => {
      mockFetch.mockResolvedValue(mockResponse({}));
      const client = new OpenCodeClient(BASE_URL);

      await client._fetch('/test', { method: 'GET' });

      expect(mockFetch).toHaveBeenCalledWith(
        `${BASE_URL}/test`,
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        }),
      );
    });

    it('constrói URL completa concatenando baseUrl e path', async () => {
      mockFetch.mockResolvedValue(mockResponse({}));
      const client = new OpenCodeClient('http://127.0.0.1:4200');

      await client._fetch('/minha-rota', { method: 'GET' });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://127.0.0.1:4200/minha-rota',
        expect.any(Object),
      );
    });

    it('retorna a resposta sem lançar quando response.ok é false (erros tratados pelos callers)', async () => {
      mockFetch.mockResolvedValue(mockResponse({}, 404));
      const client = new OpenCodeClient(BASE_URL);

      // _fetch não verifica ok — delega o tratamento de erro ao método chamador
      const response = await client._fetch('/nao-existe', { method: 'GET' });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(404);
    });
  });
});
