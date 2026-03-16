// src/stream-handler.js
// Captura o output do OpenCode e atualiza mensagens Discord em tempo real

const UPDATE_INTERVAL = parseInt(process.env.STREAM_UPDATE_INTERVAL || '1500');
const MSG_LIMIT = parseInt(process.env.DISCORD_MSG_LIMIT || '1900');

/**
 * Gerencia o envio de output de uma sessão para uma thread Discord.
 * Usa edição de mensagem + criação de novas mensagens para simular streaming.
 */
export class StreamHandler {
  constructor(thread, session) {
    this.thread = thread;
    this.session = session;
    this.currentMessage = null;
    this.currentContent = '';
    this.updateTimer = null;
    this.isProcessing = false;
    this.messageQueue = [];
  }

  /**
   * Inicia o loop de atualização de mensagens
   */
  start() {
    // Ouve output da sessão
    this.session.on('output', (chunk) => {
      this.currentContent += chunk;
      this.scheduleUpdate();
    });

    // Quando a sessão muda de status
    this.session.on('status', async (status) => {
      // Força flush imediato ao mudar status
      await this.flush();
      await this.sendStatusMessage(status);
    });

    // Quando o processo fecha
    this.session.on('close', async (code) => {
      await this.flush();
    });
  }

  /**
   * Agenda um update de mensagem (debounced para evitar rate limit)
   */
  scheduleUpdate() {
    if (this.updateTimer) return;
    this.updateTimer = setTimeout(async () => {
      this.updateTimer = null;
      await this.flush();
    }, UPDATE_INTERVAL);
  }

  /**
   * Envia/atualiza mensagens com o conteúdo acumulado
   */
  async flush() {
    if (!this.currentContent.trim()) return;

    const content = this.currentContent;
    this.currentContent = '';

    // Divide em chunks se necessário (limite Discord: 2000 chars)
    const chunks = splitIntoChunks(content, MSG_LIMIT);

    for (const chunk of chunks) {
      if (!chunk.trim()) continue;

      const formatted = formatAsCodeBlock(chunk);

      try {
        // Se a mensagem atual ainda tem espaço, edita ela
        if (
          this.currentMessage &&
          this.session.status === 'running' &&
          this.currentMessageLength + formatted.length < MSG_LIMIT
        ) {
          const newContent = mergeContent(this.currentRawContent, chunk);
          const newFormatted = formatAsCodeBlock(newContent);

          if (newFormatted.length <= 2000) {
            await this.currentMessage.edit(newFormatted);
            this.currentRawContent = newContent;
            this.currentMessageLength = newFormatted.length;
            continue;
          }
        }

        // Caso contrário, cria nova mensagem
        this.currentMessage = await this.thread.send(formatted);
        this.currentRawContent = chunk;
        this.currentMessageLength = formatted.length;
      } catch (err) {
        console.error('[StreamHandler] Erro ao enviar mensagem:', err.message);
        // Fallback: tenta enviar como texto simples
        try {
          await this.thread.send(truncate(chunk, 1990));
        } catch {}
      }
    }
  }

  /**
   * Envia mensagem de status visual
   */
  async sendStatusMessage(status) {
    const icons = {
      running:       '⚙️ **Processando...**',
      waiting_input: '💬 **Aguardando sua resposta** — responda nesta thread',
      finished:      '✅ **Sessão concluída**',
      error:         '❌ **Sessão encerrada com erro**',
      idle:          '💤 **Idle**',
    };

    const msg = icons[status];
    if (!msg) return;

    try {
      // Encerra com status visual separado
      if (status === 'waiting_input' || status === 'finished' || status === 'error') {
        await this.thread.send(msg);
        // Reseta current message para próximo bloco começar fresco
        this.currentMessage = null;
        this.currentRawContent = '';
        this.currentMessageLength = 0;
      }
    } catch (err) {
      console.error('[StreamHandler] Erro ao enviar status:', err.message);
    }
  }

  /**
   * Para o handler e limpa timers
   */
  stop() {
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
      this.updateTimer = null;
    }
  }
}

// ─── Utilitários de formatação ────────────────────────────────────────────────

/**
 * Envolve conteúdo em bloco de código para melhor legibilidade no Discord
 */
function formatAsCodeBlock(content) {
  const trimmed = content.trim();
  if (!trimmed) return '';
  // Se já tem muito código, usa bloco; caso contrário, texto simples
  return `\`\`\`\n${trimmed}\n\`\`\``;
}

/**
 * Divide texto longo em pedaços respeitando o limite do Discord
 */
function splitIntoChunks(text, limit) {
  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= limit) {
      chunks.push(remaining);
      break;
    }

    // Tenta quebrar em nova linha
    let splitAt = remaining.lastIndexOf('\n', limit);
    if (splitAt <= 0) splitAt = limit;

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }

  return chunks;
}

/**
 * Mescla conteúdo anterior com novo conteúdo
 */
function mergeContent(existing, newChunk) {
  if (!existing) return newChunk;
  return existing + '\n' + newChunk;
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max - 3) + '...' : str;
}
