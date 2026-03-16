import { describe, it, expect } from 'vitest';
import { formatAge, stripAnsi } from '../src/utils.js';

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

  it('aceita string de data', () => {
    const result = formatAge(new Date().toISOString());
    expect(result).toBe('agora');
  });
});

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
});
