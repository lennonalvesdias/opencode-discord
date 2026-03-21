// src/model-loader.js
// Carrega a lista de modelos disponíveis via `opencode models` na inicialização

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { OPENCODE_BIN } from './config.js';

const execFileAsync = promisify(execFile);

// ─── Estado interno ───────────────────────────────────────────────────────────

/** Lista de modelos carregados na inicialização */
let _models = [];

// ─── Fallback ─────────────────────────────────────────────────────────────────

/**
 * Retorna a lista de fallback a partir da variável de ambiente AVAILABLE_MODELS.
 * Usada quando `opencode models` falha.
 * @returns {string[]}
 */
function getFallbackModels() {
  const envModels = process.env.AVAILABLE_MODELS;
  if (envModels) {
    return envModels.split(',').map((m) => m.trim()).filter(Boolean);
  }
  return ['anthropic/claude-sonnet-4-5', 'openai/gpt-4o', 'google/gemini-2.0-flash'];
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Executa `opencode models` e popula a lista interna de modelos.
 * Em caso de falha, usa AVAILABLE_MODELS do env ou valores padrão.
 * Deve ser chamada uma vez na inicialização do bot.
 * @returns {Promise<void>}
 */
export async function loadModels() {
  const isWindows = process.platform === 'win32';
  const executable = isWindows ? 'cmd.exe' : OPENCODE_BIN;
  const args = isWindows ? ['/c', OPENCODE_BIN, 'models'] : ['models'];

  try {
    const { stdout } = await execFileAsync(executable, args, { timeout: 10_000 });
    const parsed = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (parsed.length === 0) {
      console.warn('[ModelLoader] ⚠️ `opencode models` retornou lista vazia — usando fallback');
      _models = getFallbackModels();
    } else {
      _models = parsed;
      console.log(`[ModelLoader] ✅ ${_models.length} modelos carregados via \`opencode models\``);
    }
  } catch (err) {
    console.warn(`[ModelLoader] ⚠️ Falha ao executar \`opencode models\`: ${err.message}`);
    console.warn('[ModelLoader] ⚠️ Usando lista de fallback (AVAILABLE_MODELS ou padrão)');
    _models = getFallbackModels();
  }
}

/**
 * Retorna a lista de modelos disponíveis carregada na inicialização.
 * @returns {string[]}
 */
export function getAvailableModels() {
  return [..._models];
}
