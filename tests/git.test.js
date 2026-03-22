// tests/git.test.js
// Testes unitários para src/git.js — utilitários de operações git

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks hoisted ────────────────────────────────────────────────────────────

/**
 * Mock assíncrono que substitui execFileAsync criado por promisify(execFile).
 * Definido via vi.hoisted para ser referenciável dentro das factories de vi.mock.
 */
const mockExecFileAsync = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('node:util', () => ({
  promisify: vi.fn(() => mockExecFileAsync),
}));

// ─── Imports após configuração dos mocks ─────────────────────────────────────

import {
  git,
  parseGitHubUrl,
  getRepoInfo,
  hasChanges,
  getCurrentBranch,
  createBranchAndCommit,
  pushBranch,
} from '../src/git.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CWD = '/projetos/meu-repo';

/** Configura próxima chamada a mockExecFileAsync para retornar stdout de sucesso. */
function mockGitSuccess(stdout = '') {
  mockExecFileAsync.mockResolvedValueOnce({ stdout, stderr: '' });
}

/** Configura próxima chamada a mockExecFileAsync para rejeitar simulando erro git. */
function mockGitError(message = 'fatal: error', stderr = 'fatal: error') {
  mockExecFileAsync.mockRejectedValueOnce(
    Object.assign(new Error(message), { stderr }),
  );
}

// ─── parseGitHubUrl ───────────────────────────────────────────────────────────

describe('parseGitHubUrl', () => {
  it('analisa URL HTTPS com .git e extrai owner e repo corretamente', () => {
    const result = parseGitHubUrl('https://github.com/owner/repo.git');
    expect(result).toEqual({ owner: 'owner', repo: 'repo' });
  });

  it('analisa URL HTTPS sem .git e extrai owner e repo corretamente', () => {
    const result = parseGitHubUrl('https://github.com/owner/repo');
    expect(result).toEqual({ owner: 'owner', repo: 'repo' });
  });

  it('analisa URL SSH com .git e extrai owner e repo corretamente', () => {
    const result = parseGitHubUrl('git@github.com:owner/repo.git');
    expect(result).toEqual({ owner: 'owner', repo: 'repo' });
  });

  it('analisa URL SSH sem .git e extrai owner e repo corretamente', () => {
    const result = parseGitHubUrl('git@github.com:owner/repo');
    expect(result).toEqual({ owner: 'owner', repo: 'repo' });
  });

  it('analisa URL HTTPS com token embutido e ignora o token na extração', () => {
    const result = parseGitHubUrl('https://ghp_TOKEN123@github.com/owner/repo.git');
    expect(result).toEqual({ owner: 'owner', repo: 'repo' });
  });

  it('lança Error para URL que não é do GitHub', () => {
    expect(() => parseGitHubUrl('https://gitlab.com/owner/repo.git')).toThrow(Error);
  });

  it('lança Error para string vazia', () => {
    expect(() => parseGitHubUrl('')).toThrow(Error);
  });
});

// ─── git ─────────────────────────────────────────────────────────────────────

describe('git', () => {
  beforeEach(() => {
    mockExecFileAsync.mockReset();
  });

  it('retorna stdout com espaços e quebras de linha removidos em caso de sucesso', async () => {
    mockExecFileAsync.mockResolvedValueOnce({ stdout: '  main  \n', stderr: '' });

    const result = await git(['rev-parse', '--abbrev-ref', 'HEAD'], CWD);

    expect(result).toBe('main');
  });

  it('lança Error com prefixo [git] em caso de falha do processo', async () => {
    mockExecFileAsync.mockRejectedValueOnce(
      Object.assign(new Error('not a git repository'), {
        stderr: 'fatal: not a git repository',
      }),
    );

    await expect(git(['status'], CWD)).rejects.toThrow('[git]');
  });

  it('inclui o comando que falhou na mensagem de erro', async () => {
    mockExecFileAsync.mockRejectedValueOnce(
      Object.assign(new Error('error'), { stderr: 'fatal: bad ref' }),
    );

    await expect(git(['checkout', 'main'], CWD)).rejects.toThrow('checkout main');
  });

  it('repassa argumentos corretos para execFileAsync', async () => {
    mockExecFileAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });

    await git(['status', '--porcelain'], CWD);

    expect(mockExecFileAsync).toHaveBeenCalledWith(
      'git',
      ['status', '--porcelain'],
      expect.objectContaining({ cwd: CWD, encoding: 'utf8' }),
    );
  });
});

// ─── getRepoInfo ─────────────────────────────────────────────────────────────

describe('getRepoInfo', () => {
  beforeEach(() => {
    mockExecFileAsync.mockReset();
  });

  it('retorna owner, repo e remoteUrl para URL HTTPS válida', async () => {
    mockExecFileAsync.mockResolvedValueOnce({
      stdout: 'https://github.com/acme/my-app.git',
      stderr: '',
    });

    const result = await getRepoInfo(CWD);

    expect(result).toEqual({
      owner: 'acme',
      repo: 'my-app',
      remoteUrl: 'https://github.com/acme/my-app.git',
    });
  });

  it('retorna owner e repo corretamente para URL SSH', async () => {
    mockExecFileAsync.mockResolvedValueOnce({
      stdout: 'git@github.com:org/projeto.git',
      stderr: '',
    });

    const result = await getRepoInfo(CWD);

    expect(result).toEqual({
      owner: 'org',
      repo: 'projeto',
      remoteUrl: 'git@github.com:org/projeto.git',
    });
  });

  it('usa fallback git config --get quando remote get-url falha', async () => {
    mockGitError('fatal: No such remote origin');
    mockExecFileAsync.mockResolvedValueOnce({
      stdout: 'https://github.com/acme/fallback-repo.git',
      stderr: '',
    });

    const result = await getRepoInfo(CWD);

    expect(result.owner).toBe('acme');
    expect(result.repo).toBe('fallback-repo');
  });

  it('lança Error quando nenhuma URL de remote é encontrada', async () => {
    mockGitError('no such remote');
    mockExecFileAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });

    await expect(getRepoInfo(CWD)).rejects.toThrow('origin');
  });
});

// ─── hasChanges ──────────────────────────────────────────────────────────────

describe('hasChanges', () => {
  beforeEach(() => {
    mockExecFileAsync.mockReset();
  });

  it('retorna true quando git status --porcelain tem saída', async () => {
    mockExecFileAsync.mockResolvedValueOnce({ stdout: 'M src/index.js\n', stderr: '' });

    const result = await hasChanges(CWD);

    expect(result).toBe(true);
  });

  it('retorna false quando git status --porcelain está vazio', async () => {
    mockExecFileAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });

    const result = await hasChanges(CWD);

    expect(result).toBe(false);
  });

  it('retorna false quando stdout contém apenas espaços após trim', async () => {
    mockExecFileAsync.mockResolvedValueOnce({ stdout: '   \n', stderr: '' });

    const result = await hasChanges(CWD);

    expect(result).toBe(false);
  });
});

// ─── getCurrentBranch ────────────────────────────────────────────────────────

describe('getCurrentBranch', () => {
  beforeEach(() => {
    mockExecFileAsync.mockReset();
  });

  it('retorna o nome do branch atual sem espaços', async () => {
    mockExecFileAsync.mockResolvedValueOnce({
      stdout: 'feature/nova-funcionalidade\n',
      stderr: '',
    });

    const result = await getCurrentBranch(CWD);

    expect(result).toBe('feature/nova-funcionalidade');
  });

  it('retorna "main" para branch principal', async () => {
    mockExecFileAsync.mockResolvedValueOnce({ stdout: 'main\n', stderr: '' });

    const result = await getCurrentBranch(CWD);

    expect(result).toBe('main');
  });
});

// ─── createBranchAndCommit ───────────────────────────────────────────────────

describe('createBranchAndCommit', () => {
  beforeEach(() => {
    mockExecFileAsync.mockReset();
  });

  it('lança Error quando não há alterações para commitar', async () => {
    mockExecFileAsync.mockResolvedValueOnce({ stdout: '', stderr: '' }); // hasChanges → false

    await expect(
      createBranchAndCommit({ cwd: CWD, branchName: 'feat/test', commitMsg: 'test' }),
    ).rejects.toThrow('[git]');
  });

  it('chama comandos git na sequência correta (status, checkout -b, add, commit)', async () => {
    mockGitSuccess('M file.js'); // hasChanges → true
    mockGitSuccess();            // checkout -b
    mockGitSuccess();            // add --all
    mockGitSuccess();            // commit

    await createBranchAndCommit({
      cwd: CWD,
      branchName: 'feat/minha-feature',
      commitMsg: 'feat: adiciona nova feature',
    });

    const calls = mockExecFileAsync.mock.calls;
    expect(calls[0][1]).toEqual(['status', '--porcelain']);
    expect(calls[1][1]).toEqual(['checkout', '-b', 'feat/minha-feature']);
    expect(calls[2][1]).toEqual(['add', '--all']);
    expect(calls[3][1]).toEqual(['commit', '-m', 'feat: adiciona nova feature']);
    expect(calls).toHaveLength(4);
  });

  it('configura user.name e user.email quando authorName e authorEmail são fornecidos', async () => {
    mockGitSuccess('M file.js'); // hasChanges
    mockGitSuccess();            // checkout -b
    mockGitSuccess();            // add --all
    mockGitSuccess();            // config user.name
    mockGitSuccess();            // config user.email
    mockGitSuccess();            // commit

    await createBranchAndCommit({
      cwd: CWD,
      branchName: 'feat/com-autor',
      commitMsg: 'feat: com autor configurado',
      authorName: 'Bot RemoteFlow',
      authorEmail: 'bot@remote-flow.local',
    });

    const allArgs = mockExecFileAsync.mock.calls.map((c) => c[1]);
    expect(allArgs).toContainEqual(['config', 'user.name', 'Bot RemoteFlow']);
    expect(allArgs).toContainEqual(['config', 'user.email', 'bot@remote-flow.local']);
  });

  it('não chama config user.name/email quando authorName e authorEmail são omitidos', async () => {
    mockGitSuccess('M file.js'); // hasChanges
    mockGitSuccess();            // checkout -b
    mockGitSuccess();            // add --all
    mockGitSuccess();            // commit

    await createBranchAndCommit({
      cwd: CWD,
      branchName: 'feat/sem-autor',
      commitMsg: 'feat: sem autor',
    });

    const allArgs = mockExecFileAsync.mock.calls.map((c) => c[1]);
    const hasNameConfig = allArgs.some((a) => a[0] === 'config' && a[1] === 'user.name');
    const hasEmailConfig = allArgs.some((a) => a[0] === 'config' && a[1] === 'user.email');
    expect(hasNameConfig).toBe(false);
    expect(hasEmailConfig).toBe(false);
  });

  it('config user.name é chamado antes do commit', async () => {
    mockGitSuccess('M file.js'); // hasChanges
    mockGitSuccess();            // checkout -b
    mockGitSuccess();            // add --all
    mockGitSuccess();            // config user.name
    mockGitSuccess();            // config user.email
    mockGitSuccess();            // commit

    await createBranchAndCommit({
      cwd: CWD,
      branchName: 'feat/ordem',
      commitMsg: 'feat: ordem dos comandos',
      authorName: 'Dev',
      authorEmail: 'dev@test.com',
    });

    const allArgs = mockExecFileAsync.mock.calls.map((c) => c[1]);
    const configIdx = allArgs.findIndex((a) => a[0] === 'config' && a[1] === 'user.name');
    const commitIdx = allArgs.findIndex((a) => a[0] === 'commit');
    expect(configIdx).toBeLessThan(commitIdx);
  });
});

// ─── pushBranch ──────────────────────────────────────────────────────────────

describe('pushBranch', () => {
  beforeEach(() => {
    mockExecFileAsync.mockReset();
  });

  const pushOpts = {
    cwd: CWD,
    branchName: 'feat/minha-feature',
    token: 'ghp_abc123',
    owner: 'acme',
    repo: 'my-app',
  };

  it('configura URL com token embutido antes do push', async () => {
    mockGitSuccess(); // set-url com token
    mockGitSuccess(); // push
    mockGitSuccess(); // set-url limpa (finally)

    await pushBranch(pushOpts);

    const firstCall = mockExecFileAsync.mock.calls[0];
    expect(firstCall[1]).toEqual([
      'remote', 'set-url', 'origin',
      'https://ghp_abc123@github.com/acme/my-app.git',
    ]);
  });

  it('chama push --set-upstream origin com nome do branch correto', async () => {
    mockGitSuccess(); // set-url com token
    mockGitSuccess(); // push
    mockGitSuccess(); // set-url limpa

    await pushBranch(pushOpts);

    const pushCall = mockExecFileAsync.mock.calls[1];
    expect(pushCall[1]).toEqual(['push', '--set-upstream', 'origin', 'feat/minha-feature']);
  });

  it('restaura URL limpa (sem token) no finally mesmo quando push falha', async () => {
    mockGitSuccess();                                      // set-url com token
    mockGitError('push failed', 'error: failed to push'); // push falha
    mockGitSuccess();                                      // set-url limpa (finally)

    await expect(pushBranch(pushOpts)).rejects.toThrow();

    const lastCall = mockExecFileAsync.mock.calls[2];
    expect(lastCall[1]).toEqual([
      'remote', 'set-url', 'origin',
      'https://github.com/acme/my-app.git',
    ]);
  });

  it('restaura URL limpa após push bem-sucedido', async () => {
    mockGitSuccess(); // set-url com token
    mockGitSuccess(); // push
    mockGitSuccess(); // set-url limpa

    await pushBranch(pushOpts);

    const lastCall = mockExecFileAsync.mock.calls[2];
    expect(lastCall[1]).toEqual([
      'remote', 'set-url', 'origin',
      'https://github.com/acme/my-app.git',
    ]);
  });
});
