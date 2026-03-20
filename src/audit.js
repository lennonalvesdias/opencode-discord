/**
 * @fileoverview Módulo de auditoria — registra eventos em arquivo NDJSON.
 * Cada linha do arquivo é um objeto JSON independente (newline-delimited JSON).
 * Nunca lança exceções para fora — falhas de I/O são absorvidas para não derrubar o bot.
 */

import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { debug } from './utils.js';
import { AUDIT_LOG_PATH } from './config.js';

// ─── Estado interno ───────────────────────────────────────────────────────────

/** Flag para evitar chamadas redundantes de mkdir após a primeira inicialização. */
let _initialized = false;

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Inicializa o módulo de auditoria (cria diretório se necessário).
 * Idempotente — chamadas subsequentes retornam imediatamente.
 * @returns {Promise<void>}
 */
export async function initAudit() {
  if (_initialized) return;
  try {
    await mkdir(dirname(AUDIT_LOG_PATH), { recursive: true });
    _initialized = true;
    console.log(`[Audit] ✅ Auditoria inicializada em: ${AUDIT_LOG_PATH}`);
  } catch (err) {
    console.error('[Audit] ❌ Erro ao inicializar diretório de auditoria:', err.message);
  }
}

/**
 * Registra um evento de auditoria no arquivo NDJSON.
 * Nunca lança exceção — erros são capturados internamente para não quebrar o bot.
 * @param {string} action - Ação realizada (ex: 'session.create', 'command.run', 'permission.approve')
 * @param {object} [data] - Dados adicionais do evento
 * @param {string|null} [userId] - ID do usuário Discord que gerou o evento
 * @param {string|null} [sessionId] - ID da sessão relacionada
 * @returns {Promise<void>}
 */
export async function audit(action, data = {}, userId = null, sessionId = null) {
  const entry = {
    ts: new Date().toISOString(),
    action,
    userId,
    sessionId,
    data,
  };

  const line = JSON.stringify(entry) + '\n';

  try {
    await appendFile(AUDIT_LOG_PATH, line, 'utf-8');
    debug('Audit', '📝 %s | userId=%s | sessionId=%s', action, userId, sessionId);
  } catch (err) {
    console.error('[Audit] ❌ Erro ao escrever evento de auditoria:', err.message);
  }
}
