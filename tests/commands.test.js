// tests/commands.test.js
// Testes para as funções exportadas de src/commands.js

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';

// ─── Estado mutável para testes de autorização ───────────────────────────────

/**
 * Objeto compartilhado entre vi.hoisted e os testes.
 * Permite alterar ALLOWED_USERS por teste sem recarregar o módulo.
 */
const mockConfigState = vi.hoisted(() => ({ allowedUsers: [] }));

// ─── Mocks de módulos (hoisted pelo Vitest) ───────────────────────────────────

vi.mock('../src/config.js', () => ({
  // Getter garante que o valor atualizado em beforeEach é lido por commands.js
  get ALLOWED_USERS() { return mockConfigState.allowedUsers; },
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
  MAX_GLOBAL_SESSIONS: 0,
  HEALTH_PORT: 9090,
  SERVER_RESTART_DELAY_MS: 2000,
  LOG_FILE_READ_DELAY_MS: 500,
  THREAD_ARCHIVE_DELAY_MS: 5000,
  STATUS_QUEUE_ITEM_TIMEOUT_MS: 5000,
  SHUTDOWN_TIMEOUT_MS: 10000,
  CHANNEL_FETCH_TIMEOUT_MS: 2000,
  SERVER_CIRCUIT_BREAKER_COOLDOWN_MS: 60000,
  validateProjectPath: vi.fn((name) => ({
    valid: true,
    projectPath: '/projetos/' + name,
    error: null,
  })),
}));

vi.mock('../src/stream-handler.js', () => ({
  StreamHandler: vi.fn().mockImplementation(function MockStreamHandler() {
    this.start = vi.fn();
    this.stop = vi.fn();
    this.flush = vi.fn().mockResolvedValue(undefined);
    this.currentRawContent = '';
  }),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
}));

vi.mock('fs/promises', () => ({
  readdir: vi.fn(),
  readFile: vi.fn().mockResolvedValue(''),
}));

// ─── Imports do módulo sob teste (após os mocks) ──────────────────────────────

import * as fsp from 'fs/promises';
import { validateProjectPath } from '../src/config.js';
import { handleCommand, handleAutocomplete, handleInteraction, commandDefinitions } from '../src/commands.js';

// ─── Factories de mocks ───────────────────────────────────────────────────────

/**
 * Gera um userId único usando UUID.
 * Garante isolamento de estado entre testes e suporta execução paralela.
 * @returns {string}
 */
function nextUserId() {
  return `test-user-${randomUUID().split('-')[0]}`;
}

/**
 * Cria um Dirent mock representando um diretório.
 * @param {string} name
 * @returns {object}
 */
function mockDirentDir(name) {
  return { name, isDirectory: () => true, isFile: () => false };
}

/**
 * Cria um mock completo de ChatInputCommandInteraction.
 * @param {object} opts
 * @param {string} [opts.commandName='projetos']
 * @param {string|null} [opts.userId=null] - null gera userId único automaticamente
 * @param {object} [opts.options={}] - valores de getString por nome
 * @param {string} [opts.channelId='channel-test']
 * @param {boolean} [opts.replied=false]
 * @param {boolean} [opts.deferred=false]
 * @returns {object}
 */
function createInteraction({
  commandName = 'projetos',
  userId = null,
  options = {},
  channelId = 'channel-test',
  replied = false,
  deferred = false,
} = {}) {
  const uid = userId ?? nextUserId();

  const mockOptions = {
    getString: vi.fn((name) => options[name] ?? null),
    getBoolean: vi.fn(() => null),
    getFocused: vi.fn((withObject) =>
      withObject
        ? { name: options._focusedName ?? 'projeto', value: options._focusedValue ?? '' }
        : (options._focusedValue ?? '')
    ),
    getSubcommand: vi.fn(() => null),
  };

  return {
    commandName,
    channelId,
    guildId: 'guild-test',
    replied,
    deferred,
    user: { id: uid, username: 'testuser', send: vi.fn().mockResolvedValue({}) },
    member: { permissions: { has: vi.fn().mockReturnValue(true) } },
    options: mockOptions,
    reply: vi.fn().mockResolvedValue({}),
    editReply: vi.fn().mockResolvedValue({}),
    deferReply: vi.fn().mockResolvedValue({}),
    followUp: vi.fn().mockResolvedValue({}),
    respond: vi.fn().mockResolvedValue({}),
    channel: {
      id: channelId,
      isThread: vi.fn().mockReturnValue(false),
      threads: {
        create: vi.fn().mockResolvedValue({
            id: 'thread-new-1',
            send: vi.fn().mockResolvedValue({ id: 'msg-1' }),
            setArchived: vi.fn().mockResolvedValue({}),
            delete: vi.fn().mockResolvedValue({}),
            messages: { fetch: vi.fn().mockResolvedValue([]) },
          }),
      },
    },
    guild: {
      id: 'guild-test',
      channels: {
        fetch: vi.fn().mockResolvedValue({
          isThread: vi.fn().mockReturnValue(true),
          send: vi.fn().mockResolvedValue({ id: 'msg-1' }),
          setArchived: vi.fn().mockResolvedValue({}),
        }),
      },
    },
  };
}

/**
 * Cria um mock do SessionManager com valores padrão sobrescrevíveis.
 * @param {object} opts
 * @param {object|null} [opts.getByThreadResult=null]
 * @param {object[]} [opts.getAllResult=[]]
 * @param {object[]} [opts.getByUserResult=[]]
 * @param {object|null} [opts.getByIdResult=null]
 * @param {object|null} [opts.getByProjectResult=null]
 * @returns {object}
 */
function createSessionManager({
  getByThreadResult = null,
  getAllResult = [],
  getByUserResult = [],
  getByIdResult = null,
  getByProjectResult = null,
} = {}) {
  return {
    create: vi.fn().mockImplementation(async ({ threadId, userId: uid }) => ({
      sessionId: 'sess-test-abc',
      threadId,
      userId: uid,
      status: 'idle',
      projectPath: '/projetos/teste',
      agent: 'plan',
      outputBuffer: '',
      toSummary: () => ({
        sessionId: 'sess-test-abc',
        status: 'idle',
        projectPath: '/projetos/teste',
        project: 'teste',
        userId: uid,
        createdAt: new Date(),
        lastActivityAt: new Date(),
      }),
      sendMessage: vi.fn().mockResolvedValue({}),
      on: vi.fn(),
      once: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    })),
    getByThread: vi.fn().mockReturnValue(getByThreadResult),
    getByUser: vi.fn().mockReturnValue(getByUserResult),
    getAll: vi.fn().mockReturnValue(getAllResult),
    getById: vi.fn().mockReturnValue(getByIdResult),
    getByProject: vi.fn().mockReturnValue(getByProjectResult),
    destroy: vi.fn().mockResolvedValue({}),
  };
}

/**
 * Cria um mock de StringSelectMenuInteraction ou ButtonInteraction.
 * @param {object} opts
 * @param {boolean} [opts.isSelectMenu=false]
 * @param {boolean} [opts.isButton=false]
 * @param {string} [opts.customId='']
 * @param {string[]} [opts.values=[]]
 * @param {string|null} [opts.userId=null]
 * @returns {object}
 */
function createComponentInteraction({
  isSelectMenu = false,
  isButton = false,
  customId = '',
  values = [],
  userId = null,
} = {}) {
  const uid = userId ?? nextUserId();
  return {
    isStringSelectMenu: vi.fn().mockReturnValue(isSelectMenu),
    isButton: vi.fn().mockReturnValue(isButton),
    customId,
    values,
    user: { id: uid, username: 'testuser' },
    channel: {
      threads: {
        create: vi.fn().mockResolvedValue({
          id: 'thread-comp-1',
          send: vi.fn().mockResolvedValue({ id: 'msg-comp-1' }),
          delete: vi.fn().mockResolvedValue({}),
        }),
      },
    },
    deferUpdate: vi.fn().mockResolvedValue({}),
    editReply: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
  };
}

// ─── Testes ───────────────────────────────────────────────────────────────────

describe('commandDefinitions', () => {
  it('exporta array com definições JSON de todos os comandos', () => {
    expect(Array.isArray(commandDefinitions)).toBe(true);
    expect(commandDefinitions.length).toBeGreaterThan(0);

    for (const cmd of commandDefinitions) {
      expect(cmd).toHaveProperty('name');
      expect(cmd).toHaveProperty('description');
      expect(typeof cmd.name).toBe('string');
    }
  });

  it('contém os comandos: plan, build, sessoes, status, parar, projetos, historico, comando', () => {
    const names = commandDefinitions.map((c) => c.name);
    expect(names).toContain('plan');
    expect(names).toContain('build');
    expect(names).toContain('sessoes');
    expect(names).toContain('status');
    expect(names).toContain('parar');
    expect(names).toContain('projetos');
    expect(names).toContain('historico');
    expect(names).toContain('comando');
  });
});

// ─── handleCommand ────────────────────────────────────────────────────────────

describe('handleCommand()', () => {
  beforeEach(() => {
    // Garante lista limpa antes de cada teste para evitar vazamento de estado
    mockConfigState.allowedUsers = [];
  });

  it('recusa usuário não autorizado quando ALLOWED_USERS está configurado', async () => {
    mockConfigState.allowedUsers = ['usuario-permitido-123'];
    const interaction = createInteraction({
      commandName: 'projetos',
      userId: 'usuario-bloqueado-456',
    });
    const sm = createSessionManager();

    await handleCommand(interaction, sm);

    // replyError chama interaction.reply com mensagem ephemeral de permissão negada
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('permissão'),
      }),
    );
  });

  it('/sessoes — responde com mensagem de lista vazia quando não há sessões ativas', async () => {
    // ALLOWED_USERS vazio = todos permitidos
    const interaction = createInteraction({ commandName: 'sessoes' });
    const sm = createSessionManager(); // getAllResult = [] por padrão

    await handleCommand(interaction, sm);

    expect(sm.getAll).toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: '📭 Nenhuma sessão ativa no momento.',
      }),
    );
  });

  it('/sessoes — consulta sessionManager independentemente de userId', async () => {
    const interaction = createInteraction({ commandName: 'sessoes' });
    const sm = createSessionManager();

    await handleCommand(interaction, sm);

    // Verifica que getAll foi chamado (e não getByUser ou getByThread)
    expect(sm.getAll).toHaveBeenCalledOnce();
    expect(sm.getByUser).not.toHaveBeenCalled();
    expect(sm.getByThread).not.toHaveBeenCalled();
  });
});

// ─── handleInteraction ────────────────────────────────────────────────────────

describe('handleInteraction()', () => {
  it('ignora interação que não é select menu nem botão e não chama nenhum método', async () => {
    // isSelectMenu=false e isButton=false — handler retorna imediatamente
    const interaction = createComponentInteraction();
    const sm = createSessionManager();

    await handleInteraction(interaction, sm);

    expect(interaction.deferUpdate).not.toHaveBeenCalled();
    expect(interaction.update).not.toHaveBeenCalled();
    expect(sm.destroy).not.toHaveBeenCalled();
  });

  it('botão cancel_stop — atualiza interação com mensagem de cancelamento', async () => {
    const interaction = createComponentInteraction({
      isButton: true,
      customId: 'cancel_stop',
    });
    const sm = createSessionManager();

    await handleInteraction(interaction, sm);

    expect(interaction.update).toHaveBeenCalledWith({
      content: '↩️ Cancelado.',
      components: [],
    });
    // Nenhuma sessão deve ter sido destruída
    expect(sm.destroy).not.toHaveBeenCalled();
  });

  it('botão confirm_stop_ — encerra sessão do próprio usuário e confirma', async () => {
    const sessionId = 'sess-teste-xpto-99';
    const userId = 'user-dono-da-sessao';
    // targetSession.userId === interaction.user.id → autorizado
    const targetSession = { sessionId, userId };
    const interaction = createComponentInteraction({
      isButton: true,
      customId: `confirm_stop_${sessionId}`,
      userId,
    });
    const sm = createSessionManager({ getByIdResult: targetSession });

    await handleInteraction(interaction, sm);

    expect(sm.getById).toHaveBeenCalledWith(sessionId);
    expect(sm.destroy).toHaveBeenCalledWith(sessionId);
    expect(interaction.update).toHaveBeenCalledWith({
      content: '✅ Sessão encerrada.',
      components: [],
    });
  });

  it('botão confirm_stop_ — bloqueia usuário diferente do dono quando ALLOW_SHARED_SESSIONS é false', async () => {
    const sessionId = 'sess-alheia-77';
    const targetSession = { sessionId, userId: 'user-dono-original' };
    const interaction = createComponentInteraction({
      isButton: true,
      customId: `confirm_stop_${sessionId}`,
      userId: 'user-intruso-diferente', // não é o dono
    });
    const sm = createSessionManager({ getByIdResult: targetSession });

    await handleInteraction(interaction, sm);

    // Deve avisar que só o criador pode encerrar
    expect(interaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('criador'),
      }),
    );
    // Não deve destruir a sessão
    expect(sm.destroy).not.toHaveBeenCalled();
  });
});
