// tests/model-loader.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock node:child_process
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('node:util', () => ({
  promisify: (fn) => fn,
}));

vi.mock('../src/config.js', () => ({
  OPENCODE_BIN: 'opencode',
}));

import { execFile } from 'node:child_process';

describe('model-loader', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    // Reset the module to clear _models state between tests
    vi.resetModules();
    delete process.env.AVAILABLE_MODELS;
  });

  it('retorna array vazio antes de loadModels ser chamado', async () => {
    const { getAvailableModels } = await import('../src/model-loader.js');
    expect(getAvailableModels()).toEqual([]);
  });

  it('carrega modelos do output do comando opencode models', async () => {
    const { execFile: mockExecFile } = await import('node:child_process');
    mockExecFile.mockResolvedValue({ stdout: 'anthropic/claude-3-5-haiku-20241022\ngoogle/gemini-2.0-flash\nopenai/gpt-4o\n' });

    const { loadModels, getAvailableModels } = await import('../src/model-loader.js');
    await loadModels();
    const models = getAvailableModels();

    expect(models).toEqual(['anthropic/claude-3-5-haiku-20241022', 'google/gemini-2.0-flash', 'openai/gpt-4o']);
    expect(models.length).toBe(3);
  });

  it('usa fallback quando o comando falha', async () => {
    const { execFile: mockExecFile } = await import('node:child_process');
    mockExecFile.mockRejectedValue(new Error('command not found'));

    const { loadModels, getAvailableModels } = await import('../src/model-loader.js');
    await loadModels();
    const models = getAvailableModels();

    expect(models.length).toBeGreaterThan(0);
    expect(models).toContain('anthropic/claude-sonnet-4-5');
  });

  it('usa AVAILABLE_MODELS do env como fallback quando o comando falha', async () => {
    process.env.AVAILABLE_MODELS = 'custom/model-a,custom/model-b';
    const { execFile: mockExecFile } = await import('node:child_process');
    mockExecFile.mockRejectedValue(new Error('command not found'));

    const { loadModels, getAvailableModels } = await import('../src/model-loader.js');
    await loadModels();
    const models = getAvailableModels();

    expect(models).toEqual(['custom/model-a', 'custom/model-b']);
  });

  it('usa fallback quando o output é vazio', async () => {
    const { execFile: mockExecFile } = await import('node:child_process');
    mockExecFile.mockResolvedValue({ stdout: '   \n\n  ' });

    const { loadModels, getAvailableModels } = await import('../src/model-loader.js');
    await loadModels();
    const models = getAvailableModels();

    expect(models.length).toBeGreaterThan(0);
  });

  it('filtra linhas vazias do output', async () => {
    const { execFile: mockExecFile } = await import('node:child_process');
    mockExecFile.mockResolvedValue({ stdout: '\nanthropic/claude-3-5-haiku-20241022\n\ngoogle/gemini-2.0-flash\n' });

    const { loadModels, getAvailableModels } = await import('../src/model-loader.js');
    await loadModels();
    const models = getAvailableModels();

    expect(models).toEqual(['anthropic/claude-3-5-haiku-20241022', 'google/gemini-2.0-flash']);
  });
});
