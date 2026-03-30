// tests/reconnect.test.js
// Testes para o fluxo de reconexão de sessões interrompidas em src/commands.js

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';

// ─── Estado mutável para mocks de persistência ───────────────────────────────

const mockLoadSessions = vi.hoisted(() => vi.fn());
const mockRemoveSession = vi.hoisted(() => vi.fn());
const mockSaveSession   = vi.hoisted(() => vi.fn());

// ─── Mock de spawn para /diff (não usado aqui, mas necessário para commands.js) ──

const mockSpawn = vi.hoisted(() => vi.fn());

// ─── Mocks de módulos (hoisted pelo Vitest) ───────────────────────────────────

vi.mock('../src/persistence.js', () => ({
  loadSessions: mockLoadSessions,
  removeSession: mockRemoveSession,
  saveSession:   mockSaveSession,
  clearSessions: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/config.js', () => ({
  ALLOWED_USERS: [],
  MAX_GLOBAL_SESSIONS: 0,
  ALLOW_SHARED_SESSIONS: false,
  DISCORD_MSG_LIMIT: 1900,
  STREAM_UPDATE_INTERVAL: 1500,
  ENABLE_DM_NOTIFICATIONS: false,
  PROJECTS_BASE: '/projetos',
  OPENCODE_BIN: 'opencode',
  OPENCODE_BASE_PORT: 4100,
  DEFAULT_TIMEOUT_MS: 10000,
  MAX_SESSIONS_PER_USER: 3,
  SESSION_TIMEOUT_MS: 1800000,
  MAX_BUFFER: 512000,
  HEALTH_PORT: 9090,
  SERVER_RESTART_DELAY_MS: 2000,
  LOG_FILE_READ_DELAY_MS: 500,
  THREAD_ARCHIVE_DELAY_MS: 5000,
  STATUS_QUEUE_ITEM_TIMEOUT_MS: 5000,
  SHUTDOWN_TIMEOUT_MS: 10000,
  CHANNEL_FETCH_TIMEOUT_MS: 2000,
  SERVER_CIRCUIT_BREAKER_COOLDOWN_MS: 60000,
  DEFAULT_MODEL: '',
  MAX_SESSIONS_PER_PROJECT: 2,
  PERMISSION_TIMEOUT_MS: 60000,
  GITHUB_TOKEN: 'test-token',
  GITHUB_DEFAULT_OWNER: 'owner',
  GITHUB_DEFAULT_REPO: 'repo',
  GIT_AUTHOR_NAME: 'Test Bot',
  GIT_AUTHOR_EMAIL: 'bot@test.com',
  PERSISTENCE_PATH: null,
  validateProjectPath: vi.fn((name) => ({
    valid: true,
    projectPath: '/projetos/' + name,
    error: null,
  })),
}));

vi.mock('node:child_process', () => ({ spawn: mockSpawn, execFile: vi.fn() }));

vi.mock('../src/model-loader.js', () => ({
  getAvailableModels: () => [],
}));

vi.mock('../src/opencode-commands.js', () => ({
  listOpenCodeCommands: vi.fn().mockResolvedValue([]),
}));

vi.mock('../src/stream-handler.js', () => ({
  StreamHandler: vi.fn().mockImplementation(function MockStreamHandler() {
    this.start = vi.fn();
    this.stop  = vi.fn();
    this.flush = vi.fn().mockResolvedValue(undefined);
  }),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
}));

vi.mock('fs/promises', () => ({
  readdir: vi.fn().mockResolvedValue([]),
  readFile: vi.fn().mockResolvedValue(''),
}));

vi.mock('../src/audit.js', () => ({
  audit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/github.js', () => ({
  getGitHubClient: vi.fn(() => ({})),
}));

vi.mock('../src/reporter.js', () => ({
  analyzeOutput:          vi.fn().mockReturnValue({ errors: [], suggestedActions: [], summary: '' }),
  captureThreadMessages:  vi.fn().mockResolvedValue([]),
  formatReportText:       vi.fn().mockReturnValue(''),
  buildReportEmbed:       vi.fn().mockReturnValue({ data: {}, addFields: vi.fn().mockReturnThis() }),
  readRecentLogs:         vi.fn().mockResolvedValue([]),
}));

vi.mock('../src/git.js', () => ({
  getRepoInfo:            vi.fn().mockResolvedValue({ owner: 'owner', repo: 'repo' }),
  hasChanges:             vi.fn().mockResolvedValue(true),
  createBranchAndCommit:  vi.fn().mockResolvedValue(undefined),
  pushBranch:             vi.fn().mockResolvedValue(undefined),
  getCurrentBranch:       vi.fn().mockResolvedValue('main'),
  getLastCommit:          vi.fn().mockResolvedValue({ hash: 'abc1234', subject: 'init' }),
}));

vi.mock('../src/plannotator-client.js', () => ({
  PlannotatorClient: vi.fn().mockImplementation(function () {
    this.approve = vi.fn().mockResolvedValue({});
    this.deny    = vi.fn().mockResolvedValue({});
  }),
}));

// ─── Imports do módulo sob teste (após os mocks) ──────────────────────────────

import { handleCommand } from '../src/commands.js';
import { StreamHandler } from '../src/stream-handler.js';

// ─── Factories ────────────────────────────────────────────────────────────────

/**
 * Gera um userId único para isolar o rate-limiter entre testes.
 * @returns {string}
 */
function nextUserId() {
  return `user-${randomUUID().split('-')[0]}`;
}

/**
 * Cria um mock de ChatInputCommandInteraction para o comando /reconnect.
 * @param {object} [opts]
 * @param {string} [opts.channelId='thread-reconnect-test']
 * @param {string} [opts.userId=null] - null gera userId único
 * @returns {object}
 */
function createReconnectInteraction({ channelId = 'thread-reconnect-test', userId = null } = {}) {
  const uid = userId ?? nextUserId();
  return {
    commandName:       'reconnect',
    channelId,
    createdTimestamp:  Date.now(),
    replied:           false,
    deferred:          false,
    user:              { id: uid, username: 'testuser', send: vi.fn().mockResolvedValue({}) },
    options: {
      getString:    vi.fn().mockReturnValue(null),
      getBoolean:   vi.fn().mockReturnValue(null),
      getInteger:   vi.fn().mockReturnValue(null),
      getFocused:   vi.fn().mockReturnValue(''),
      getSubcommand: vi.fn().mockReturnValue(null),
    },
    reply:      vi.fn().mockResolvedValue({}),
    editReply:  vi.fn().mockResolvedValue({}),
    deferReply: vi.fn().mockResolvedValue({}),
    followUp:   vi.fn().mockResolvedValue({}),
    channel: {
      id:       channelId,
      isThread: vi.fn().mockReturnValue(true),
    },
    client: {
      channels: {
        fetch: vi.fn().mockResolvedValue({
          id:       channelId,
          isThread: vi.fn().mockReturnValue(true),
          send:     vi.fn().mockResolvedValue({}),
        }),
      },
    },
  };
}

/**
 * Cria um mock do SessionManager.
 * @param {object} [opts]
 * @param {object|null} [opts.getByThreadResult=null] - sessão ativa em memória
 * @returns {object}
 */
function createSessionManager({ getByThreadResult = null } = {}) {
  return {
    create: vi.fn().mockImplementation(async ({ threadId, userId: uid, agent, model }) => ({
      sessionId:   randomUUID(),
      threadId,
      userId:      uid,
      agent:       agent ?? 'plan',
      model:       model ?? '',
      projectPath: '/projetos/test',
      status:      'idle',
      outputBuffer: '',
      loadGitInfo: vi.fn().mockResolvedValue(undefined),
      on:   vi.fn(),
      once: vi.fn(),
      off:  vi.fn(),
      emit: vi.fn(),
    })),
    getByThread:  vi.fn().mockReturnValue(getByThreadResult),
    getByUser:    vi.fn().mockReturnValue([]),
    getAll:       vi.fn().mockReturnValue([]),
    getById:      vi.fn().mockReturnValue(null),
    getByProject: vi.fn().mockReturnValue(null),
    destroy:      vi.fn().mockResolvedValue({}),
  };
}

/**
 * Cria um mock do ServerManager para o caminho SSE.
 * @param {object} [opts]
 * @param {string} [opts.serverStatus='running']
 * @param {Function} [opts.reconnectSSE]
 * @returns {object}
 */
function createServerManager({ serverStatus = 'running', reconnectSSE = vi.fn() } = {}) {
  const server = { status: serverStatus, reconnectSSE };
  return {
    getServer:  vi.fn().mockReturnValue(server),
    getAll:     vi.fn().mockReturnValue([]),
    getOrCreate: vi.fn().mockResolvedValue(server),
  };
}

// ─── Testes ───────────────────────────────────────────────────────────────────

describe('handleReconnect()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Padrão: nenhuma sessão persistida
    mockLoadSessions.mockResolvedValue([]);
    mockRemoveSession.mockResolvedValue(undefined);
    mockSaveSession.mockResolvedValue(undefined);
  });

  // ─── Caso 1: sessão ativa em memória ────────────────────────────────────────

  it('sessão ativa em memória — reconexão SSE bem-sucedida (não chama loadSessions)', async () => {
    const reconnectSSE = vi.fn();
    const activeSession = { sessionId: 'sess-ativa', projectPath: '/projetos/app', status: 'running' };
    const sm  = createSessionManager({ getByThreadResult: activeSession });
    const svr = createServerManager({ serverStatus: 'running', reconnectSSE });
    const interaction = createReconnectInteraction({ channelId: 'thread-ativa' });

    await handleCommand(interaction, sm, svr);

    // Não deve consultar a persistência quando há sessão em memória
    expect(mockLoadSessions).not.toHaveBeenCalled();
    // Deve reconectar via SSE
    expect(reconnectSSE).toHaveBeenCalledOnce();
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.stringContaining('Reconexão SSE iniciada'),
    );
  });

  it('sessão ativa em memória — servidor não encontrado → editReply com erro', async () => {
    const activeSession = { sessionId: 'sess-no-server', projectPath: '/projetos/app', status: 'running' };
    const sm  = createSessionManager({ getByThreadResult: activeSession });
    const svr = { getServer: vi.fn().mockReturnValue(null), getAll: vi.fn().mockReturnValue([]) };
    const interaction = createReconnectInteraction();

    await handleCommand(interaction, sm, svr);

    expect(mockLoadSessions).not.toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.stringContaining('Servidor não encontrado'),
    );
  });

  // ─── Caso 2: sem sessão ativa, sem sessão interrompida ───────────────────────

  it('sem sessão ativa nem interrompida → reply ephemeral com mensagem de erro', async () => {
    mockLoadSessions.mockResolvedValue([]);
    const sm  = createSessionManager({ getByThreadResult: null });
    const svr = createServerManager();
    const interaction = createReconnectInteraction({ channelId: 'thread-vazio' });

    await handleCommand(interaction, sm, svr);

    expect(mockLoadSessions).toHaveBeenCalledOnce();
    expect(interaction.reply).toHaveBeenCalledWith({
      content: '❌ Nenhuma sessão ativa ou interrompida neste thread.',
      ephemeral: true,
    });
    // Não deve ter tentado criar nova sessão
    expect(sm.create).not.toHaveBeenCalled();
  });

  // ─── Caso 3: sessão interrompida encontrada → restauração completa ───────────

  it('sessão interrompida encontrada — restaura sessão e inicia StreamHandler', async () => {
    const interrupted = {
      sessionId:   'sess-interrompida-abc',
      threadId:    'thread-interrompida',
      projectPath: '/projetos/meu-projeto',
      userId:      'user-456',
      agent:       'build',
      model:       null,
      status:      'interrupted',
      createdAt:   new Date().toISOString(),
    };
    mockLoadSessions.mockResolvedValue([interrupted]);

    const sm  = createSessionManager({ getByThreadResult: null });
    const svr = createServerManager();
    const interaction = createReconnectInteraction({ channelId: 'thread-interrompida' });

    await handleCommand(interaction, sm, svr);

    // Deve remover o registro antigo
    expect(mockRemoveSession).toHaveBeenCalledWith('sess-interrompida-abc');
    // Deve criar nova sessão com os dados originais
    expect(sm.create).toHaveBeenCalledWith(expect.objectContaining({
      projectPath: '/projetos/meu-projeto',
      threadId:    'thread-interrompida',
      userId:      'user-456',
      agent:       'build',
    }));
    // Deve iniciar o StreamHandler
    const instance = StreamHandler.mock.instances[0];
    expect(instance).toBeDefined();
    expect(instance.start).toHaveBeenCalledOnce();
    // Deve confirmar ao usuário
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.stringContaining('Sessão restaurada'),
    );
  });

  // ─── Caso 4: sessionManager.create lança exceção → responde com falha ────────

  it('sessionManager.create lança exceção → editReply com mensagem de falha', async () => {
    const interrupted = {
      sessionId:   'sess-falha',
      threadId:    'thread-falha',
      projectPath: '/projetos/falha',
      userId:      'user-falha',
      agent:       'plan',
      model:       null,
      status:      'interrupted',
      createdAt:   new Date().toISOString(),
    };
    mockLoadSessions.mockResolvedValue([interrupted]);
    mockRemoveSession.mockResolvedValue(undefined);

    const sm  = createSessionManager({ getByThreadResult: null });
    sm.create.mockRejectedValue(new Error('Falha ao conectar ao servidor'));
    const svr = createServerManager();
    const interaction = createReconnectInteraction({ channelId: 'thread-falha' });

    await handleCommand(interaction, sm, svr);

    expect(interaction.deferReply).toHaveBeenCalledOnce();
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.stringContaining('Falha ao restaurar'),
    );
    // Não deve ter iniciado StreamHandler
    expect(StreamHandler.mock.instances).toHaveLength(0);
  });

  // ─── Caso 5: model é preservado na restauração ───────────────────────────────

  it('model da sessão interrompida é passado corretamente ao criar nova sessão', async () => {
    const model = 'anthropic/claude-sonnet-4-5';
    const interrupted = {
      sessionId:   'sess-modelo',
      threadId:    'thread-modelo',
      projectPath: '/projetos/modelo',
      userId:      'user-modelo',
      agent:       'plan',
      model,
      status:      'interrupted',
      createdAt:   new Date().toISOString(),
    };
    mockLoadSessions.mockResolvedValue([interrupted]);

    const sm  = createSessionManager({ getByThreadResult: null });
    const svr = createServerManager();
    const interaction = createReconnectInteraction({ channelId: 'thread-modelo' });

    await handleCommand(interaction, sm, svr);

    expect(sm.create).toHaveBeenCalledWith(
      expect.objectContaining({ model }),
    );
  });

  // ─── Caso 6: sessão interrompida de outra thread não é restaurada ────────────

  it('sessão interrompida de thread diferente não é restaurada', async () => {
    const interrupted = {
      sessionId:   'sess-outra-thread',
      threadId:    'thread-outra',       // thread diferente da atual
      projectPath: '/projetos/outro',
      userId:      'user-outro',
      agent:       'build',
      model:       null,
      status:      'interrupted',
      createdAt:   new Date().toISOString(),
    };
    mockLoadSessions.mockResolvedValue([interrupted]);

    const sm  = createSessionManager({ getByThreadResult: null });
    const svr = createServerManager();
    const interaction = createReconnectInteraction({ channelId: 'thread-atual' }); // thread diferente

    await handleCommand(interaction, sm, svr);

    // Não deve ter restaurado — é outra thread
    expect(sm.create).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Nenhuma sessão') }),
    );
  });

  // ─── Caso 7: loadSessions rejeita → responde com erro ephemeral ─────────────

  it('deve retornar erro ephemeral quando loadSessions rejeita', async () => {
    mockLoadSessions.mockRejectedValue(new Error('disk read error'));

    const sm  = createSessionManager({ getByThreadResult: null });
    const svr = createServerManager();
    const interaction = createReconnectInteraction({ channelId: 'thread-ioerror' });

    await handleCommand(interaction, sm, svr);

    // Deve responder com mensagem de erro ephemeral, sem lançar exceção
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Erro ao carregar sessões'),
        ephemeral: true,
      }),
    );
    // Não deve ter tentado criar nova sessão
    expect(sm.create).not.toHaveBeenCalled();
  });
});
