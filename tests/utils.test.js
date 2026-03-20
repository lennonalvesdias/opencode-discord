// tests/utils.test.js
// Testes para formatAge, stripAnsi e debug

import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatAge, stripAnsi, debug } from '../src/utils.js';

// ─── formatAge ────────────────────────────────────────────────────────────────

describe('formatAge', () => {
  it('retorna "agora" para datas recentes (< 1 min)', () => {
    expect(formatAge(new Date())).toBe('agora');
  });

  it('retorna minutos para < 60 min', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    expect(formatAge(fiveMinAgo)).toBe('5min');
  });

  it('retorna horas para < 24h', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    expect(formatAge(twoHoursAgo)).toBe('2h');
  });

  it('retorna dias para >= 24h', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    expect(formatAge(threeDaysAgo)).toBe('3d');
  });

  it('aceita string de data ISO', () => {
    const result = formatAge(new Date().toISOString());
    expect(result).toBe('agora');
  });

  it('retorna exatamente "1min" para 1 minuto atrás', () => {
    const oneMinAgo = new Date(Date.now() - 61 * 1000);
    expect(formatAge(oneMinAgo)).toBe('1min');
  });

  it('retorna "1h" para 60 minutos exatos', () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000 - 1000);
    expect(formatAge(oneHourAgo)).toBe('1h');
  });

  it('retorna "1d" para 24 horas exatas', () => {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000 - 1000);
    expect(formatAge(oneDayAgo)).toBe('1d');
  });
});

// ─── stripAnsi ────────────────────────────────────────────────────────────────

describe('stripAnsi', () => {
  it('retorna string vazia para input falsy', () => {
    expect(stripAnsi('')).toBe('');
    expect(stripAnsi(null)).toBe('');
    expect(stripAnsi(undefined)).toBe('');
  });

  it('não altera texto sem ANSI', () => {
    expect(stripAnsi('Hello world')).toBe('Hello world');
  });

  it('remove sequências CSI (cores)', () => {
    expect(stripAnsi('\x1b[31mERRO\x1b[0m')).toBe('ERRO');
    expect(stripAnsi('\x1b[1;32mOK\x1b[0m')).toBe('OK');
  });

  it('remove sequências OSC (títulos de terminal)', () => {
    expect(stripAnsi('\x1b]0;titulo\x07texto')).toBe('texto');
  });

  it('remove caracteres de controle exceto \\n \\r \\t', () => {
    expect(stripAnsi('abc\x00def\x07ghi')).toBe('abcdefghi');
    expect(stripAnsi('line1\nline2\ttab')).toBe('line1\nline2\ttab');
  });

  it('lida com múltiplas sequências ANSI misturadas', () => {
    const input = '\x1b[36m[SessionManager]\x1b[0m \x1b[32m✅\x1b[0m Sessão criada';
    expect(stripAnsi(input)).toBe('[SessionManager] ✅ Sessão criada');
  });

  it('preserva quebras de linha e tabs', () => {
    const input = 'linha1\nlinha2\r\nlinha3\ttab';
    expect(stripAnsi(input)).toBe('linha1\nlinha2\r\nlinha3\ttab');
  });

  it('remove DEL (0x7F) e outros controles', () => {
    expect(stripAnsi('abc\x7Fdef')).toBe('abcdef');
    expect(stripAnsi('abc\x0Bdef')).toBe('abcdef');
  });
});

// ─── debug ────────────────────────────────────────────────────────────────────

describe('debug', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('não chama console.log quando DEBUG não está ativo', () => {
    // No ambiente de teste, IS_DEBUG é false (sem DEBUG=true ou NODE_ENV=development)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    debug('TestComp', 'mensagem silenciosa');
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('não chama console.log para qualquer quantidade de args quando inativo', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    debug('C', 'msg', 1, 2, { a: 3 });
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('chama console.log com componente e mensagem quando DEBUG=true', async () => {
    vi.stubEnv('DEBUG', 'true');
    vi.resetModules();
    const { debug: debugAtivo } = await import('../src/utils.js');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    debugAtivo('MeuComponente', 'teste de debug', 42);

    expect(logSpy).toHaveBeenCalledOnce();
    const [formatStr, ...rest] = logSpy.mock.calls[0];
    // component e message são interpolados no primeiro argumento do console.log
    // os args extras (42) chegam como argumentos adicionais
    expect(formatStr).toContain('[MeuComponente]');
    expect(formatStr).toContain('teste de debug');
    expect(rest[0]).toBe(42);
  });

  it('chama console.log quando NODE_ENV=development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.resetModules();
    const { debug: debugDev } = await import('../src/utils.js');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    debugDev('Componente', 'mensagem dev');

    expect(logSpy).toHaveBeenCalledOnce();
  });

  it('inclui timestamp no formato HH:MM:SS.mmm na mensagem', async () => {
    vi.stubEnv('DEBUG', 'true');
    vi.resetModules();
    const { debug: debugAtivo } = await import('../src/utils.js');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    debugAtivo('X', 'msg');

    const formatStr = logSpy.mock.calls[0][0];
    // Deve conter algo como [12:34:56.789]
    expect(formatStr).toMatch(/\d{2}:\d{2}:\d{2}\.\d{3}/);
  });
});
