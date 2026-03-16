// src/config.js
// Configuração centralizada — single source of truth para variáveis de ambiente

import path from 'path';

export const PROJECTS_BASE = process.env.PROJECTS_BASE_PATH || 'C:\\projetos';

export const ALLOWED_USERS = (process.env.ALLOWED_USER_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export const ALLOW_SHARED_SESSIONS = process.env.ALLOW_SHARED_SESSIONS === 'true';

export const MAX_SESSIONS_PER_USER = parseInt(process.env.MAX_SESSIONS_PER_USER || '3', 10);

export const SESSION_TIMEOUT_MS = parseInt(process.env.SESSION_TIMEOUT_MS || String(30 * 60 * 1000), 10);

/**
 * Valida o caminho de um projeto, prevenindo path traversal.
 * @param {string} projectName - Nome da pasta do projeto
 * @returns {{ valid: boolean, projectPath: string, error?: string }}
 */
export function validateProjectPath(projectName) {
  const resolvedBase = path.resolve(PROJECTS_BASE);
  const projectPath = path.resolve(PROJECTS_BASE, projectName);

  if (!projectPath.startsWith(resolvedBase + path.sep) && projectPath !== resolvedBase) {
    return { valid: false, projectPath, error: '❌ Caminho de projeto inválido.' };
  }

  return { valid: true, projectPath };
}
