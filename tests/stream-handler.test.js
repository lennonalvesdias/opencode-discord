import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { StreamHandler } from '../src/stream-handler.js';

// ─── Mock de discord.js para que AttachmentBuilder seja interceptado ──────────
vi.mock('discord.js', () => {
  // Deve ser function regular (não arrow) para suportar "new"
  const AttachmentBuilder = function (buffer, options) {
    this.buffer = buffer;
    this.name = options?.name;
    this.description = options?.description;
  };
  return { AttachmentBuilder };
});

// ─── Re-implementações de funções privadas para testes isolados ───────────────
// (as originais não são exportadas; mantemos a re-implementação fiel)

function splitIntoChunks(text, limit) {
  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= limit) {
      chunks.push(remaining);
      break;
    }

    let splitAt = remaining.lastIndexOf('\n', limit);
    if (splitAt <= 0) splitAt = limit;

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }

  return chunks;
}

function mergeContent(existing, newChunk) {
  if (!existing) return newChunk;
  return existing + '\n' + newChunk;
}

// ─── Helper para drenar a fila de microtasks pendentes ────────────────────────

async function flushPromises(rounds = 6) {
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve();
  }
}

// ─── Helpers de mock para StreamHandler ──────────────────────────────────────

function createMockThread() {
  const mockMessage = {
    id: 'msg-1',
    content: '',
    edit: vi.fn().mockResolvedValue({}),
  };
  return {
    send: vi.fn().mockResolvedValue(mockMessage),
    setArchived: vi.fn().mockResolvedValue({}),
    id: 'thread-123',
    guild: { id: 'guild-123' },
  };
}

function createMockSession() {
  const emitter = new EventEmitter();
  emitter.status = 'idle';
  emitter.userId = 'user-123';
  emitter.sessionId = 'sess-123';
  emitter.projectPath = '/projetos/meu-projeto';
  emitter.agent = 'build';
  emitter.outputBuffer = '';
  return emitter;
}

// ─── Testes de splitIntoChunks ────────────────────────────────────────────────

describe('splitIntoChunks', () => {
  it('retorna texto curto como chunk único', () => {
    const result = splitIntoChunks('Hello', 1900);
    expect(result).toEqual(['Hello']);
  });

  it('divide texto longo respeitando o limite', () => {
    const line = 'a'.repeat(100) + '\n';
    const text = line.repeat(25); // 2525 chars
    const chunks = splitIntoChunks(text, 1900);

    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c) => expect(c.length).toBeLessThanOrEqual(1900));
  });

  it('quebra na última newline antes do limite', () => {
    const text = 'linha1\nlinha2\nlinha3';
    const chunks = splitIntoChunks(text, 13);
    expect(chunks[0]).toBe('linha1\nlinha2');
  });

  it('força quebra no limite quando não há newline', () => {
    const text = 'a'.repeat(3000);
    const chunks = splitIntoChunks(text, 1900);
    expect(chunks[0].length).toBe(1900);
  });

  it('lida com string vazia', () => {
    expect(splitIntoChunks('', 1900)).toEqual([]);
  });
});

// ─── Testes de mergeContent ───────────────────────────────────────────────────

describe('mergeContent', () => {
  it('retorna novo chunk quando existing é vazio', () => {
    expect(mergeContent('', 'novo')).toBe('novo');
  });

  it('concatena com newline', () => {
    expect(mergeContent('existente', 'novo')).toBe('existente\nnovo');
  });
});

// ─── Testes de StreamHandler ──────────────────────────────────────────────────

describe('StreamHandler', () => {
  let thread, session, handler;

  beforeEach(() => {
    vi.useFakeTimers();
    thread = createMockThread();
    session = createMockSession();
    handler = new StreamHandler(thread, session);
  });

  afterEach(() => {
    // Garante limpeza de timers pendentes antes de restaurar
    handler.stop();
    vi.useRealTimers();
  });

  // ─── start() — registro de listeners ───────────────────────────────────────

  describe('start() — registro de listeners', () => {
    it('não lança erro ao registrar listeners na sessão', () => {
      expect(() => handler.start()).not.toThrow();
    });

    it('ao emitir output, currentContent acumula o texto recebido', () => {
      handler.start();
      session.emit('output', 'linha de saída do agente');
      expect(handler.currentContent).toBe('linha de saída do agente');
    });

    it('ao emitir output em sequência, currentContent concatena todos os chunks', () => {
      handler.start();
      session.emit('output', 'parte 1');
      session.emit('output', ' parte 2');
      expect(handler.currentContent).toBe('parte 1 parte 2');
    });

    it('ao emitir output, hasOutput torna-se true', () => {
      handler.start();
      expect(handler.hasOutput).toBe(false);
      session.emit('output', 'algum texto');
      expect(handler.hasOutput).toBe(true);
    });

    it('ao emitir output, scheduleUpdate agenda o updateTimer', () => {
      handler.start();
      // Sem output o timer não existe
      expect(handler.updateTimer).toBeNull();
      session.emit('output', 'texto qualquer');
      // Após output, timer deve estar agendado
      expect(handler.updateTimer).not.toBeNull();
    });

    it('ao emitir timeout na sessão, thread.send recebe mensagem de inatividade', () => {
      handler.start();
      session.emit('timeout');
      expect(thread.send).toHaveBeenCalledWith('⏰ **Sessão encerrada por inatividade.**');
    });
  });

  // ─── stop() ────────────────────────────────────────────────────────────────

  describe('stop()', () => {
    it('stop() sem timers ativos não lança erro', () => {
      expect(() => handler.stop()).not.toThrow();
    });

    it('stop() após emissão de output zera updateTimer', () => {
      handler.start();
      session.emit('output', 'texto'); // dispara scheduleUpdate → define updateTimer
      expect(handler.updateTimer).not.toBeNull();

      handler.stop();

      expect(handler.updateTimer).toBeNull();
    });

    it('stop() chamado duas vezes consecutivas não lança erro', () => {
      handler.start();
      session.emit('output', 'texto');
      handler.stop();
      expect(() => handler.stop()).not.toThrow();
    });
  });

  // ─── sendStatusMessage() ───────────────────────────────────────────────────

  describe('sendStatusMessage()', () => {
    it("'running' chama thread.send quando hasOutput é false", async () => {
      handler.hasOutput = false;
      await handler.sendStatusMessage('running');
      expect(thread.send).toHaveBeenCalledOnce();
      expect(thread.send).toHaveBeenCalledWith('⚙️ **Processando...**');
    });

    it("'running' não chama thread.send quando hasOutput é true", async () => {
      handler.hasOutput = true;
      await handler.sendStatusMessage('running');
      expect(thread.send).not.toHaveBeenCalled();
    });

    it("'waiting_input' sempre chama thread.send independente de hasOutput", async () => {
      handler.hasOutput = true; // mesmo com output prévio, deve enviar
      await handler.sendStatusMessage('waiting_input');
      expect(thread.send).toHaveBeenCalledOnce();
      expect(thread.send).toHaveBeenCalledWith('💬 **Aguardando sua resposta...**');
    });

    it("'finished' chama thread.send com mensagem de conclusão", async () => {
      await handler.sendStatusMessage('finished');
      expect(thread.send).toHaveBeenCalledOnce();
      expect(thread.send).toHaveBeenCalledWith('✅ **Sessão concluída**');
    });

    it("'finished' reseta currentMessage, currentRawContent e currentMessageLength", async () => {
      handler.currentMessage = { id: 'msg-existente', edit: vi.fn() };
      handler.currentRawContent = 'conteúdo anterior';
      handler.currentMessageLength = 42;
      await handler.sendStatusMessage('finished');
      expect(handler.currentMessage).toBeNull();
      expect(handler.currentRawContent).toBe('');
      expect(handler.currentMessageLength).toBe(0);
    });

    it("'error' chama thread.send com mensagem de erro", async () => {
      await handler.sendStatusMessage('error');
      expect(thread.send).toHaveBeenCalledOnce();
      expect(thread.send).toHaveBeenCalledWith('❌ **Sessão encerrada com erro**');
    });

    it("'restart' chama thread.send com aviso de reinicialização do servidor", async () => {
      await handler.sendStatusMessage('restart');
      expect(thread.send).toHaveBeenCalledWith('⚠️ Servidor reiniciando...');
    });

    it('status desconhecido não chama thread.send', async () => {
      await handler.sendStatusMessage('status_que_nao_existe');
      expect(thread.send).not.toHaveBeenCalled();
    });
  });

  // ─── flush() ───────────────────────────────────────────────────────────────

  describe('flush()', () => {
    it('não chama thread.send quando currentContent está vazio', async () => {
      handler.currentContent = '';
      await handler.flush();
      expect(thread.send).not.toHaveBeenCalled();
    });

    it('não chama thread.send quando currentContent tem apenas espaços em branco', async () => {
      handler.currentContent = '   \n   ';
      await handler.flush();
      expect(thread.send).not.toHaveBeenCalled();
    });

    it('chama thread.send quando há conteúdo não-vazio', async () => {
      handler.currentContent = 'resultado do agente';
      await handler.flush();
      expect(thread.send).toHaveBeenCalledOnce();
    });

    it('limpa currentContent após enviar', async () => {
      handler.currentContent = 'algum texto';
      await handler.flush();
      expect(handler.currentContent).toBe('');
    });

    it('edita mensagem existente (em vez de criar nova) quando status é running e há espaço', async () => {
      const mockMsg = { id: 'msg-1', content: 'inicial', edit: vi.fn().mockResolvedValue({}) };
      handler.currentMessage = mockMsg;
      handler.currentRawContent = 'inicial';
      handler.currentMessageLength = 7;
      session.status = 'running';
      handler.currentContent = ' continuação do texto';
      await handler.flush();
      expect(mockMsg.edit).toHaveBeenCalledOnce();
      expect(thread.send).not.toHaveBeenCalled();
    });
  });

  // ─── scheduleUpdate() ──────────────────────────────────────────────────────

  describe('scheduleUpdate()', () => {
    it('cria um timer que executa flush após UPDATE_INTERVAL', async () => {
      handler.currentContent = 'texto para flush';
      handler.scheduleUpdate();

      expect(thread.send).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1500);

      expect(thread.send).toHaveBeenCalled();
    });

    it('não cria novo timer se já existe um pendente', () => {
      handler.scheduleUpdate();
      const firstTimer = handler.updateTimer;
      handler.scheduleUpdate();
      expect(handler.updateTimer).toBe(firstTimer);
    });

    it('zera updateTimer após disparo', async () => {
      handler.currentContent = 'texto';
      handler.scheduleUpdate();

      await vi.advanceTimersByTimeAsync(1500);

      expect(handler.updateTimer).toBeNull();
    });
  });

  // ─── evento 'close' da sessão ──────────────────────────────────────────────

  describe("evento 'close' da sessão", () => {
    it('chama flush e stop quando a sessão fecha', async () => {
      handler.start();
      const flushSpy = vi.spyOn(handler, 'flush').mockResolvedValue();
      const stopSpy = vi.spyOn(handler, 'stop');

      session.emit('close');

      await flushPromises();

      expect(flushSpy).toHaveBeenCalled();
      expect(stopSpy).toHaveBeenCalled();
    });

    it('agenda arquivamento da thread após THREAD_ARCHIVE_DELAY_MS', async () => {
      handler.start();
      vi.spyOn(handler, 'flush').mockResolvedValue();

      session.emit('close');

      await flushPromises();

      // Timer ainda não disparou
      expect(thread.setArchived).not.toHaveBeenCalled();

      // Avança além do delay padrão de 5000ms
      await vi.advanceTimersByTimeAsync(5001);

      expect(thread.setArchived).toHaveBeenCalledWith(true);
    });

    it('trata silenciosamente erro ao arquivar a thread', async () => {
      thread.setArchived = vi.fn().mockRejectedValue(new Error('Acesso negado'));
      handler.start();
      vi.spyOn(handler, 'flush').mockResolvedValue();

      session.emit('close');
      await flushPromises();

      // Não deve lançar exceção ao avançar o timer
      await expect(vi.advanceTimersByTimeAsync(5001)).resolves.not.toThrow();
    });

    it('zera _archiveTimer após disparo', async () => {
      handler.start();
      vi.spyOn(handler, 'flush').mockResolvedValue();

      session.emit('close');
      await flushPromises();

      await vi.advanceTimersByTimeAsync(5001);

      expect(handler._archiveTimer).toBeNull();
    });
  });

  // ─── evento 'permission' da sessão ────────────────────────────────────────

  describe("evento 'permission' da sessão", () => {
    it("status 'approving' envia mensagem de permissão solicitada com descrição", () => {
      handler.start();
      session.emit('permission', {
        status: 'approving',
        toolName: 'bash',
        description: 'Executar comando shell',
        error: null,
      });
      expect(thread.send).toHaveBeenCalledWith(
        '🔐 **Permissão solicitada** para `bash` — Executar comando shell\nAprovando automaticamente...'
      );
    });

    it("status 'approving' sem description não inclui traço na mensagem", () => {
      handler.start();
      session.emit('permission', {
        status: 'approving',
        toolName: 'bash',
        description: '',
        error: null,
      });
      expect(thread.send).toHaveBeenCalledWith(
        '🔐 **Permissão solicitada** para `bash`\nAprovando automaticamente...'
      );
    });

    it("status 'approved' envia mensagem de permissão aprovada", () => {
      handler.start();
      session.emit('permission', {
        status: 'approved',
        toolName: 'write_file',
        description: '',
        error: null,
      });
      expect(thread.send).toHaveBeenCalledWith('✅ **Permissão aprovada** para `write_file`');
    });

    it("status 'failed' envia mensagem de falha com motivo do erro", () => {
      handler.start();
      session.emit('permission', {
        status: 'failed',
        toolName: 'bash',
        description: '',
        error: 'Permissão negada pelo sistema',
      });
      expect(thread.send).toHaveBeenCalledWith(
        '❌ **Falha ao aprovar permissão** para `bash`: Permissão negada pelo sistema'
      );
    });

    it('status desconhecido envia aviso genérico sem error', () => {
      handler.start();
      session.emit('permission', {
        status: 'unknown',
        toolName: '',
        description: '',
        error: null,
      });
      expect(thread.send).toHaveBeenCalledWith(
        '⚠️ **Permissão solicitada** (não foi possível identificar a ferramenta)'
      );
    });

    it('status desconhecido com error inclui o erro na mensagem', () => {
      handler.start();
      session.emit('permission', {
        status: 'unknown',
        toolName: '',
        description: '',
        error: 'Ferramenta bloqueada pela política',
      });
      expect(thread.send).toHaveBeenCalledWith(
        '⚠️ **Permissão solicitada** (não foi possível identificar a ferramenta): Ferramenta bloqueada pela política'
      );
    });
  });

  // ─── evento 'diff' da sessão ──────────────────────────────────────────────

  describe("evento 'diff' da sessão", () => {
    it('chama _sendDiffPreview com caminho e conteúdo do arquivo', () => {
      handler.start();
      const spy = vi.spyOn(handler, '_sendDiffPreview').mockResolvedValue();

      session.emit('diff', { path: 'src/app.js', content: '+ nova linha\n- linha removida' });

      expect(spy).toHaveBeenCalledWith('src/app.js', '+ nova linha\n- linha removida');
    });

    it('não lança erro se _sendDiffPreview rejeitar', async () => {
      handler.start();
      vi.spyOn(handler, '_sendDiffPreview').mockRejectedValue(new Error('Falha no diff'));

      // O evento não deve propagar a exceção
      expect(() => session.emit('diff', { path: 'src/app.js', content: 'dados' })).not.toThrow();
    });
  });

  // ─── evento 'question' da sessão ─────────────────────────────────────────

  describe("evento 'question' da sessão", () => {
    it('envia mensagem com todas as perguntas do agente', () => {
      handler.start();
      session.emit('question', {
        questions: [
          { question: 'Qual o nome do projeto?' },
          { question: 'Qual a branch principal?' },
        ],
      });
      expect(thread.send).toHaveBeenCalledWith(
        '❓ **O agente tem uma pergunta para você:**\n> Qual o nome do projeto?\n> Qual a branch principal?'
      );
    });

    it('envia mensagem com pergunta única', () => {
      handler.start();
      session.emit('question', {
        questions: [{ question: 'Deseja continuar?' }],
      });
      expect(thread.send).toHaveBeenCalledWith(
        '❓ **O agente tem uma pergunta para você:**\n> Deseja continuar?'
      );
    });

    it('não envia mensagem quando array de perguntas está vazio', () => {
      handler.start();
      session.emit('question', { questions: [] });
      expect(thread.send).not.toHaveBeenCalled();
    });
  });

  // ─── _sendDiffPreview() ────────────────────────────────────────────────────

  describe('_sendDiffPreview()', () => {
    it('envia diff inline com syntax highlighting quando conteúdo cabe no limite', async () => {
      const content = 'diff --git a/index.js b/index.js\n+console.log("hello")';
      await handler._sendDiffPreview('src/index.js', content);

      expect(thread.send).toHaveBeenCalledOnce();
      const [msg] = thread.send.mock.calls[0];
      expect(typeof msg).toBe('string');
      expect(msg).toContain('index.js');
      expect(msg).toContain('```diff');
      expect(msg).toContain(content);
    });

    it('inclui o nome do arquivo no cabeçalho da mensagem inline', async () => {
      const content = '+adicionado';
      await handler._sendDiffPreview('projeto/utils/helpers.py', content);

      const [msg] = thread.send.mock.calls[0];
      expect(msg).toContain('**helpers.py**');
    });

    it('envia diff como arquivo quando conteúdo excede DIFF_INLINE_LIMIT (1500 chars)', async () => {
      const content = 'a'.repeat(1600); // > 1500
      await handler._sendDiffPreview('src/app.js', content);

      expect(thread.send).toHaveBeenCalledOnce();
      const [arg] = thread.send.mock.calls[0];
      // Deve ser objeto { content, files } em vez de string simples
      expect(arg).toHaveProperty('files');
      expect(arg.files).toHaveLength(1);
    });

    it('captura erro de thread.send silenciosamente sem lançar exceção', async () => {
      thread.send = vi.fn().mockRejectedValue(new Error('Rate limited pela API'));
      await expect(
        handler._sendDiffPreview('src/app.js', 'conteúdo pequeno')
      ).resolves.not.toThrow();
    });
  });

  // ─── _sendDiffAsFile() ────────────────────────────────────────────────────

  describe('_sendDiffAsFile()', () => {
    it('chama thread.send com objeto { content, files }', async () => {
      await handler._sendDiffAsFile('app.js', 'conteúdo do diff aqui');

      expect(thread.send).toHaveBeenCalledOnce();
      const [arg] = thread.send.mock.calls[0];
      expect(arg).toHaveProperty('content');
      expect(arg).toHaveProperty('files');
    });

    it('a mensagem de conteúdo referencia o nome do arquivo', async () => {
      await handler._sendDiffAsFile('componente.tsx', 'diff data');

      const [arg] = thread.send.mock.calls[0];
      expect(arg.content).toContain('componente.tsx');
    });

    it('o attachment tem extensão .diff no nome', async () => {
      await handler._sendDiffAsFile('script.js', 'diff data');

      const [arg] = thread.send.mock.calls[0];
      const attachment = arg.files[0];
      expect(attachment.name).toBe('script.js.diff');
    });

    it('o attachment contém o conteúdo do diff no buffer', async () => {
      const diffContent = '--- antes\n+++ depois\n+linha nova';
      await handler._sendDiffAsFile('main.py', diffContent);

      const [arg] = thread.send.mock.calls[0];
      const attachment = arg.files[0];
      expect(attachment.buffer.toString('utf-8')).toBe(diffContent);
    });

    it('inclui tamanho em KB na mensagem de conteúdo', async () => {
      const content = 'x'.repeat(2048); // exatamente 2 KB
      await handler._sendDiffAsFile('big.js', content);

      const [arg] = thread.send.mock.calls[0];
      expect(arg.content).toContain('KB');
    });
  });

  // ─── _drainStatusQueue() ──────────────────────────────────────────────────

  describe('_drainStatusQueue()', () => {
    it('processa todos os itens da fila em sequência', async () => {
      const resultados = [];
      handler._statusQueue.push(async () => resultados.push(1));
      handler._statusQueue.push(async () => resultados.push(2));
      handler._statusQueue.push(async () => resultados.push(3));

      await handler._drainStatusQueue();

      expect(resultados).toEqual([1, 2, 3]);
    });

    it('não inicia segundo processamento se _processingStatus já é true', async () => {
      handler._processingStatus = true;
      const spy = vi.fn().mockResolvedValue();
      handler._statusQueue.push(spy);

      await handler._drainStatusQueue();

      expect(spy).not.toHaveBeenCalled();
      // Item permanece na fila pois o processamento foi bloqueado
      expect(handler._statusQueue.length).toBe(1);
    });

    it('reseta _processingStatus para false ao concluir normalmente', async () => {
      handler._statusQueue.push(async () => {});

      await handler._drainStatusQueue();

      expect(handler._processingStatus).toBe(false);
    });

    it('reseta _processingStatus para false mesmo se item lançar erro', async () => {
      handler._statusQueue.push(async () => {
        throw new Error('Erro proposital no item de status');
      });

      await handler._drainStatusQueue();

      expect(handler._processingStatus).toBe(false);
    });

    it('descarta item que ultrapassa STATUS_QUEUE_ITEM_TIMEOUT_MS e continua a fila', async () => {
      const travado = () => new Promise(() => {}); // nunca resolve
      const aposTimeout = vi.fn().mockResolvedValue();

      handler._statusQueue.push(travado);
      handler._statusQueue.push(aposTimeout);

      const drainPromise = handler._drainStatusQueue();

      // Avança além do timeout padrão de 5000ms para disparar a rejeição
      await vi.advanceTimersByTimeAsync(5001);

      await drainPromise;

      expect(handler._processingStatus).toBe(false);
      // O segundo item deve ter sido executado após o timeout do primeiro
      expect(aposTimeout).toHaveBeenCalled();
    });

    it('fila vazia completa sem processar nada', async () => {
      await handler._drainStatusQueue();

      expect(handler._processingStatus).toBe(false);
    });
  });
});
