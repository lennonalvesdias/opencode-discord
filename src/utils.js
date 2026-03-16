// src/utils.js
// Utilitários compartilhados entre módulos

/**
 * Formata uma data como tempo relativo legível
 * @param {Date|string} date
 * @returns {string}
 */
export function formatAge(date) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

/**
 * Remove sequências de escape ANSI e caracteres de controle de uma string.
 * @param {string} str - String com possíveis códigos ANSI
 * @returns {string} String limpa
 */
export function stripAnsi(str) {
  if (!str) return '';
  return str
    // Sequências CSI: ESC [ ... (letra final)
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
    // Sequências OSC: ESC ] ... (ST ou BEL)
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    // Sequências DCS, PM, APC, SOS: ESC [P X ^ _] ... ST
    .replace(/\x1b[PX^_][^\x1b]*(?:\x1b\\|$)/g, '')
    // ESC isolado seguido de letra
    .replace(/\x1b[A-Za-z]/g, '')
    // ESC isolado restante
    .replace(/\x1b/g, '')
    // Caracteres de controle (exceto \n \r \t)
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
}

// ─── Debug logging ────────────────────────────────────────────────────────────

const IS_DEBUG = process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development';

/**
 * Emite log de debug — só ativo quando DEBUG=true ou NODE_ENV=development
 * @param {string} component - Nome do componente (ex: 'Session', 'StreamHandler')
 * @param {string} message - Mensagem de log
 * @param {...any} args - Argumentos adicionais
 */
export function debug(component, message, ...args) {
  if (!IS_DEBUG) return;
  const ts = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
  console.log(`\x1b[90m[${ts}]\x1b[0m \x1b[36m[${component}]\x1b[0m ${message}`, ...args);
}
