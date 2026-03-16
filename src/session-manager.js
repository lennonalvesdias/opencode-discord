// src/session-manager.js
// Gerencia múltiplas sessões OpenCode simultâneas, uma por projeto/thread

import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';

const OPENCODE_BIN = process.env.OPENCODE_BIN || 'opencode';

/**
 * Representa uma sessão OpenCode ativa ligada a uma thread Discord
 */
export class OpenCodeSession extends EventEmitter {
  constructor({ sessionId, projectPath, threadId, userId }) {
    super();
    this.sessionId = sessionId;
    this.projectPath = projectPath;
    this.threadId = threadId;
    this.userId = userId;
    this.process = null;
    this.status = 'idle'; // idle | running | waiting_input | finished | error
    this.createdAt = new Date();
    this.lastActivityAt = new Date();
    this.outputBuffer = '';
    this.pendingOutput = '';
  }

  /**
   * Inicia o processo OpenCode nesta sessão
   */
  start() {
    if (this.process) return;

    this.status = 'running';
    this.emit('status', 'running');

    // Inicia o opencode no diretório do projeto
    this.process = spawn(OPENCODE_BIN, [], {
      cwd: this.projectPath,
      shell: true,
      // Sem PTY — usamos pipes para capturar output limpo
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: false,
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    });

    this.process.stdout.setEncoding('utf8');
    this.process.stderr.setEncoding('utf8');

    // Captura saída padrão
    this.process.stdout.on('data', (data) => {
      this.lastActivityAt = new Date();
      const clean = stripAnsi(data);
      this.outputBuffer += clean;
      this.pendingOutput += clean;
      this.emit('output', clean);

      // Detecta se o agente está esperando input do usuário
      if (this.isWaitingForInput(clean)) {
        this.status = 'waiting_input';
        this.emit('status', 'waiting_input');
      }
    });

    // Captura stderr (erros e warnings do opencode)
    this.process.stderr.on('data', (data) => {
      this.lastActivityAt = new Date();
      const clean = stripAnsi(data);
      this.pendingOutput += `⚠️ ${clean}`;
      this.emit('output', `⚠️ ${clean}`);
    });

    // Processo encerrou
    this.process.on('close', (code) => {
      this.status = code === 0 ? 'finished' : 'error';
      this.process = null;
      this.emit('status', this.status);
      this.emit('close', code);
    });

    this.process.on('error', (err) => {
      this.status = 'error';
      this.emit('error', err);
    });
  }

  /**
   * Envia input do usuário para o processo (stdin)
   */
  sendInput(text) {
    if (!this.process || !this.process.stdin.writable) {
      return false;
    }
    this.lastActivityAt = new Date();
    this.status = 'running';
    this.emit('status', 'running');
    this.process.stdin.write(text + '\n');
    return true;
  }

  /**
   * Encerra a sessão forçadamente
   */
  kill() {
    if (this.process) {
      this.process.kill('SIGTERM');
      setTimeout(() => {
        if (this.process) this.process.kill('SIGKILL');
      }, 3000);
    }
    this.status = 'finished';
    this.emit('status', 'finished');
  }

  /**
   * Consome e limpa o buffer de output pendente
   */
  flushPending() {
    const out = this.pendingOutput;
    this.pendingOutput = '';
    return out;
  }

  /**
   * Heurística para detectar se o agente está aguardando resposta do usuário
   */
  isWaitingForInput(text) {
    const patterns = [
      /\?\s*$/m,               // termina com "?"
      /\(y\/n\)/i,             // pergunta y/n
      /press enter/i,
      /aguard/i,               // aguardando...
      /confirma/i,
      /escolha:/i,
      /selecione:/i,
      /continua/i,
      /> $/m,                  // prompt ">"
    ];
    return patterns.some((p) => p.test(text));
  }

  /**
   * Retorna info resumida da sessão
   */
  toSummary() {
    return {
      sessionId: this.sessionId,
      project: path.basename(this.projectPath),
      projectPath: this.projectPath,
      status: this.status,
      threadId: this.threadId,
      userId: this.userId,
      createdAt: this.createdAt,
      lastActivityAt: this.lastActivityAt,
    };
  }
}

/**
 * Gerencia todas as sessões ativas
 */
export class SessionManager {
  constructor() {
    // Map<sessionId, OpenCodeSession>
    this.sessions = new Map();
    // Map<threadId, sessionId> — para encontrar sessão pelo thread Discord
    this.threadIndex = new Map();
  }

  /**
   * Cria uma nova sessão para um projeto
   */
  create({ projectPath, threadId, userId }) {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const session = new OpenCodeSession({ sessionId, projectPath, threadId, userId });

    this.sessions.set(sessionId, session);
    this.threadIndex.set(threadId, sessionId);

    // Remove da memória quando encerrar
    session.on('close', () => {
      setTimeout(() => {
        // Mantém por 10 min para consulta de histórico
        setTimeout(() => {
          this.sessions.delete(sessionId);
          if (this.threadIndex.get(threadId) === sessionId) {
            this.threadIndex.delete(threadId);
          }
        }, 10 * 60 * 1000);
      }, 0);
    });

    return session;
  }

  /**
   * Busca sessão pelo ID da thread Discord
   */
  getByThread(threadId) {
    const sessionId = this.threadIndex.get(threadId);
    return sessionId ? this.sessions.get(sessionId) : null;
  }

  /**
   * Busca sessão pelo ID da sessão
   */
  getById(sessionId) {
    return this.sessions.get(sessionId);
  }

  /**
   * Lista todas as sessões de um usuário
   */
  getByUser(userId) {
    return [...this.sessions.values()].filter((s) => s.userId === userId);
  }

  /**
   * Retorna todas as sessões ativas
   */
  getAll() {
    return [...this.sessions.values()];
  }

  /**
   * Encerra e remove uma sessão
   */
  destroy(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.kill();
      this.sessions.delete(sessionId);
      this.threadIndex.delete(session.threadId);
    }
  }
}

// ─── Utilitário: remove códigos ANSI/escape do terminal ──────────────────────
function stripAnsi(str) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*[mGKHF]/g, '').replace(/\x1B\][^\x07]*\x07/g, '');
}
