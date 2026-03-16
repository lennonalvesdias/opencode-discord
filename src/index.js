// src/index.js
// Entry point — inicializa o bot Discord e conecta tudo

import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
} from 'discord.js';
import { SessionManager } from './session-manager.js';
import { handleCommand, handleInteraction, commandDefinitions } from './commands.js';

// ─── Validação de configuração ────────────────────────────────────────────────

const required = ['DISCORD_TOKEN', 'DISCORD_GUILD_ID', 'PROJECTS_BASE_PATH'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`❌ Variáveis de ambiente faltando: ${missing.join(', ')}`);
  console.error('   Copie .env.example para .env e preencha os valores.');
  process.exit(1);
}

// ─── Inicialização ─────────────────────────────────────────────────────────────

const sessionManager = new SessionManager();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageTyping,
  ],
  partials: [Partials.Channel, Partials.Message],
});

// ─── Registro de slash commands ───────────────────────────────────────────────

async function registerCommands() {
  const rest = new REST().setToken(process.env.DISCORD_TOKEN);
  try {
    console.log('📡 Registrando slash commands...');
    await rest.put(
      Routes.applicationGuildCommands(
        client.application?.id || process.env.DISCORD_CLIENT_ID,
        process.env.DISCORD_GUILD_ID
      ),
      { body: commandDefinitions }
    );
    console.log('✅ Slash commands registrados.');
  } catch (err) {
    console.error('❌ Erro ao registrar comandos:', err.message);
  }
}

// ─── Eventos do Discord ───────────────────────────────────────────────────────

client.once('ready', async (c) => {
  console.log(`\n🤖 Bot online: ${c.user.tag}`);
  console.log(`📁 Projetos: ${process.env.PROJECTS_BASE_PATH}`);
  console.log(`🔧 OpenCode: ${process.env.OPENCODE_BIN || 'opencode'}\n`);
  await registerCommands();
});

// Slash commands
client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await handleCommand(interaction, sessionManager);
    } else {
      await handleInteraction(interaction, sessionManager);
    }
  } catch (err) {
    console.error('[interactionCreate] Erro:', err);
    const reply = { content: `❌ Erro interno: ${err.message}`, ephemeral: true };
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply);
      } else {
        await interaction.reply(reply);
      }
    } catch {}
  }
});

// Mensagens nas threads — encaminha para stdin da sessão
client.on('messageCreate', async (message) => {
  // Ignora mensagens do próprio bot
  if (message.author.bot) return;

  // Só processa se estiver dentro de uma thread
  if (!message.channel.isThread()) return;

  // Verifica se existe uma sessão associada a essa thread
  const session = sessionManager.getByThread(message.channel.id);
  if (!session) return;

  // Não aceita input enquanto está processando (exceto comandos especiais)
  const text = message.content.trim();

  // Comandos especiais inline
  if (text === '/stop' || text === '/parar') {
    session.kill();
    await message.reply('🛑 Sessão encerrada.');
    return;
  }

  if (text === '/status') {
    const s = session.toSummary();
    await message.reply(
      `**Status:** ${s.status}\n**Projeto:** ${s.project}\n**Última atividade:** ${formatAge(s.lastActivityAt)} atrás`
    );
    return;
  }

  // Envia o input para o processo OpenCode
  const sent = session.sendInput(text);

  if (!sent) {
    // Processo não está mais rodando
    await message.reply(
      '⚠️ O processo OpenCode não está ativo nesta sessão. Use `/plan` ou `/build` para iniciar uma nova.'
    );
    return;
  }

  // Reação visual de "recebido"
  try {
    await message.react('⚙️');
  } catch {}
});

// ─── Graceful shutdown ─────────────────────────────────────────────────────────

function shutdown(signal) {
  console.log(`\n${signal} recebido. Encerrando sessões...`);
  const sessions = sessionManager.getAll();
  sessions.forEach((s) => s.kill());
  client.destroy();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

// ─── Login ────────────────────────────────────────────────────────────────────

client.login(process.env.DISCORD_TOKEN);

// ─── Utilitários ──────────────────────────────────────────────────────────────

function formatAge(date) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}
