import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockMkdir = vi.fn();
const mockAppendFile = vi.fn();

vi.mock('node:fs/promises', () => ({ mkdir: mockMkdir, appendFile: mockAppendFile }));
vi.mock('../src/config.js', () => ({ AUDIT_LOG_PATH: '/tmp/test-audit.ndjson' }));
vi.mock('../src/utils.js', () => ({ debug: vi.fn() }));

describe('audit module', () => {
  let initAudit, audit;

  beforeEach(async () => {
    vi.resetModules();
    mockMkdir.mockReset();
    mockAppendFile.mockReset();
    mockMkdir.mockResolvedValue(undefined);
    mockAppendFile.mockResolvedValue(undefined);
    const mod = await import('../src/audit.js');
    initAudit = mod.initAudit;
    audit = mod.audit;
  });

  it('initAudit() chama mkdir com { recursive: true }', async () => {
    await initAudit();
    expect(mockMkdir).toHaveBeenCalledWith(expect.any(String), { recursive: true });
  });

  it('initAudit() não lança quando mkdir rejeita', async () => {
    mockMkdir.mockRejectedValue(new Error('sem permissão'));
    await expect(initAudit()).resolves.toBeUndefined();
  });

  it('initAudit() é idempotente — segunda chamada não chama mkdir', async () => {
    await initAudit();
    await initAudit();
    expect(mockMkdir).toHaveBeenCalledTimes(1);
  });

  it('audit() chama appendFile com linha NDJSON válida', async () => {
    await audit('session.create', { project: 'meu-app' }, 'user-123', 'sess-456');
    expect(mockAppendFile).toHaveBeenCalledTimes(1);
    const [path, line] = mockAppendFile.mock.calls[0];
    expect(path).toBe('/tmp/test-audit.ndjson');
    const record = JSON.parse(line);
    expect(record.action).toBe('session.create');
    expect(record.userId).toBe('user-123');
    expect(record.sessionId).toBe('sess-456');
    expect(typeof record.ts).toBe('string');
  });

  it('audit() linha termina com newline', async () => {
    await audit('test.action');
    const line = mockAppendFile.mock.calls[0][1];
    expect(line.endsWith('\n')).toBe(true);
  });

  it('audit() não lança quando appendFile rejeita', async () => {
    mockAppendFile.mockRejectedValue(new Error('disco cheio'));
    await expect(audit('test.action')).resolves.toBeUndefined();
  });

  it('audit() inclui campo data no registro', async () => {
    await audit('session.create', { project: 'meu-app', model: 'gpt-4o' });
    const line = mockAppendFile.mock.calls[0][1];
    const record = JSON.parse(line);
    expect(record.data).toEqual({ project: 'meu-app', model: 'gpt-4o' });
  });
});
