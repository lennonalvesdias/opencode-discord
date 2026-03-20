// tests/opencode-commands.test.js
// Testes para listOpenCodeCommands e getCommandsDir

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { homedir } from 'node:os';

// vi.mock é içado para o topo pelo Vitest — deve estar antes dos imports do módulo
vi.mock('fs/promises', () => ({
  default: {},
  readdir: vi.fn(),
  readFile: vi.fn(),
}));

import * as fsp from 'fs/promises';
import { listOpenCodeCommands, getCommandsDir } from '../src/opencode-commands.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Cria um mock de Dirent (entrada de diretório) compatível com { withFileTypes: true }.
 * @param {string} name - Nome do arquivo
 * @param {boolean} [isFile=true] - Se é arquivo (vs diretório)
 * @returns {object}
 */
function mockDirent(name, isFile = true) {
  return { name, isFile: () => isFile };
}

// ─── getCommandsDir ───────────────────────────────────────────────────────────

describe('getCommandsDir()', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    delete process.env.OPENCODE_COMMANDS_PATH;
  });

  it('retorna o valor de OPENCODE_COMMANDS_PATH quando a variável está definida', () => {
    vi.stubEnv('OPENCODE_COMMANDS_PATH', '/custom/commands/path');

    expect(getCommandsDir()).toBe('/custom/commands/path');
  });

  it('retorna o path padrão ~/.config/opencode/command quando env não está definida', () => {
    delete process.env.OPENCODE_COMMANDS_PATH;

    const expected = join(homedir(), '.config', 'opencode', 'command');
    expect(getCommandsDir()).toBe(expected);
  });

  it('usa path padrão quando OPENCODE_COMMANDS_PATH está vazia (string vazia é falsy)', () => {
    vi.stubEnv('OPENCODE_COMMANDS_PATH', '');

    const expected = join(homedir(), '.config', 'opencode', 'command');
    expect(getCommandsDir()).toBe(expected);
  });
});

// ─── listOpenCodeCommands ─────────────────────────────────────────────────────

describe('listOpenCodeCommands()', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env.OPENCODE_COMMANDS_PATH;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('retorna [] quando diretório não existe (ENOENT)', async () => {
    const err = Object.assign(new Error('ENOENT: no such file or directory'), {
      code: 'ENOENT',
    });
    fsp.readdir.mockRejectedValue(err);

    const result = await listOpenCodeCommands();

    expect(result).toEqual([]);
  });

  it('retorna [] quando diretório está vazio', async () => {
    fsp.readdir.mockResolvedValue([]);

    const result = await listOpenCodeCommands();

    expect(result).toEqual([]);
  });

  it('retorna [] quando diretório não contém arquivos .md', async () => {
    fsp.readdir.mockResolvedValue([
      mockDirent('readme.txt'),
      mockDirent('config.json'),
      mockDirent('script.sh'),
    ]);

    const result = await listOpenCodeCommands();

    expect(result).toEqual([]);
  });

  it('retorna comando com description extraída do frontmatter YAML', async () => {
    fsp.readdir.mockResolvedValue([mockDirent('meu-comando.md')]);
    fsp.readFile.mockResolvedValue(
      '---\ndescription: Meu Comando Especial\n---\nConteúdo do comando aqui',
    );

    const result = await listOpenCodeCommands();

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('meu-comando');
    expect(result[0].description).toBe('Meu Comando Especial');
  });

  it('usa nome do arquivo como description quando frontmatter está ausente', async () => {
    fsp.readdir.mockResolvedValue([mockDirent('analyze-code.md')]);
    fsp.readFile.mockResolvedValue('# Título\nConteúdo sem bloco frontmatter YAML');

    const result = await listOpenCodeCommands();

    expect(result[0].description).toBe('analyze-code');
    expect(result[0].name).toBe('analyze-code');
  });

  it('usa nome do arquivo como description quando frontmatter não possui campo description', async () => {
    fsp.readdir.mockResolvedValue([mockDirent('my-tool.md')]);
    fsp.readFile.mockResolvedValue('---\ntitle: Meu Tool\nauthor: dev\n---\nConteúdo');

    const result = await listOpenCodeCommands();

    expect(result[0].description).toBe('my-tool');
  });

  it('filtra arquivos que não terminam em .md', async () => {
    fsp.readdir.mockResolvedValue([
      mockDirent('comando-valido.md'),
      mockDirent('readme.txt'),
      mockDirent('config.json'),
      mockDirent('script.ps1'),
    ]);
    fsp.readFile.mockResolvedValue('');

    const result = await listOpenCodeCommands();

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('comando-valido');
  });

  it('filtra entradas que não são arquivos (ex: subdiretórios)', async () => {
    fsp.readdir.mockResolvedValue([
      mockDirent('comando.md', true),
      mockDirent('subdir', false),
    ]);
    fsp.readFile.mockResolvedValue('');

    const result = await listOpenCodeCommands();

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('comando');
  });

  it('retorna lista ordenada alfabeticamente pelo nome do comando', async () => {
    fsp.readdir.mockResolvedValue([
      mockDirent('zebra.md'),
      mockDirent('alpha.md'),
      mockDirent('gamma.md'),
      mockDirent('beta.md'),
    ]);
    fsp.readFile.mockResolvedValue('');

    const result = await listOpenCodeCommands();

    expect(result.map((c) => c.name)).toEqual(['alpha', 'beta', 'gamma', 'zebra']);
  });

  it('inclui o filePath absoluto correto em cada resultado', async () => {
    const customDir = '/meu/diretorio/comandos';
    vi.stubEnv('OPENCODE_COMMANDS_PATH', customDir);
    fsp.readdir.mockResolvedValue([mockDirent('meu-cmd.md')]);
    fsp.readFile.mockResolvedValue('');

    const result = await listOpenCodeCommands();

    expect(result[0].filePath).toBe(join(customDir, 'meu-cmd.md'));
  });

  it('retorna múltiplos comandos corretamente', async () => {
    fsp.readdir.mockResolvedValue([
      mockDirent('cmd-a.md'),
      mockDirent('cmd-b.md'),
    ]);
    fsp.readFile
      .mockResolvedValueOnce('---\ndescription: Comando A\n---')
      .mockResolvedValueOnce('---\ndescription: Comando B\n---');

    const result = await listOpenCodeCommands();

    expect(result).toHaveLength(2);
    expect(result[0].description).toBe('Comando A');
    expect(result[1].description).toBe('Comando B');
  });

  it('retorna [] silenciosamente quando ocorre erro diferente de ENOENT', async () => {
    const err = Object.assign(new Error('Permission denied'), { code: 'EACCES' });
    fsp.readdir.mockRejectedValue(err);

    // Deve suprimir o erro (apenas console.warn) e retornar array vazio
    const result = await listOpenCodeCommands();

    expect(result).toEqual([]);
  });
});
