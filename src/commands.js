// src/commands.js
// Define e processa os slash commands do bot Discord

import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { readdirSync, existsSync } from 'fs';
import path from 'path';

const PROJECTS_BASE = process.env.PROJECTS_BASE_PATH || 'C:\\projetos';
const ALLOWED_USERS = (process.env.ALLOWED_USER_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// ─── Definições dos comandos ──────────────────────────────────────────────────

export const commandDefinitions = [
  new SlashCommandBuilder()
    .setName('plan')
    .setDescription('Inicia uma sessão de planejamento (agent plan) em um projeto')
    .addStringOption((o) =>
      o.setName('projeto').setDescription('Nome da pasta do projeto').setRequired(false)
    )
    .addStringOption((o) =>
      o.setName('prompt').setDescription('Descrição inicial da tarefa').setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('build')
    .setDescription('Inicia uma sessão de desenvolvimento (agent build) em um projeto')
    .addStringOption((o) =>
      o.setName('projeto').setDescription('Nome da pasta do projeto').setRequired(false)
    )
    .addStringOption((o) =>
      o.setName('prompt').setDescription('Descrição do que deve ser desenvolvido').setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('sessoes')
    .setDescription('Lista todas as sessões OpenCode ativas'),

  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Mostra o status da sessão na thread atual'),

  new SlashCommandBuilder()
    .setName('parar')
    .setDescription('Encerra a sessão OpenCode na thread atual'),

  new SlashCommandBuilder()
    .setName('projetos')
    .setDescription('Lista os projetos disponíveis em PROJECTS_BASE_PATH'),
].map((c) => c.toJSON());

// ─── Handler de comandos ──────────────────────────────────────────────────────

export async function handleCommand(interaction, sessionManager) {
  // Verificação de acesso
  if (ALLOWED_USERS.length > 0 && !ALLOWED_USERS.includes(interaction.user.id)) {
    return interaction.reply({
      content: '🚫 Você não tem permissão para usar este bot.',
      ephemeral: true,
    });
  }

  const { commandName } = interaction;

  if (commandName === 'plan' || commandName === 'build') {
    await handleStartSession(interaction, sessionManager, commandName);
  } else if (commandName === 'sessoes') {
    await handleListSessions(interaction, sessionManager);
  } else if (commandName === 'status') {
    await handleStatus(interaction, sessionManager);
  } else if (commandName === 'parar') {
    await handleStop(interaction, sessionManager);
  } else if (commandName === 'projetos') {
    await handleListProjects(interaction);
  }
}

// ─── Handlers individuais ─────────────────────────────────────────────────────

async function handleStartSession(interaction, sessionManager, mode) {
  await interaction.deferReply();

  let projectName = interaction.options.getString('projeto');
  const promptText = interaction.options.getString('prompt');

  // Se não passou projeto, mostra selector
  if (!projectName) {
    const projects = getProjects();
    if (projects.length === 0) {
      return interaction.editReply(
        `❌ Nenhum projeto encontrado em \`${PROJECTS_BASE}\`. Configure \`PROJECTS_BASE_PATH\` no .env.`
      );
    }

    // Exibe select menu para escolher projeto
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`select_project_${mode}`)
        .setPlaceholder('Escolha um projeto...')
        .addOptions(
          projects.slice(0, 25).map((p) => ({
            label: p,
            value: p,
            description: path.join(PROJECTS_BASE, p),
          }))
        )
    );

    return interaction.editReply({
      content: `📁 **Qual projeto para o \`/${mode}\`?**`,
      components: [row],
    });
  }

  // Valida o caminho do projeto
  const projectPath = path.join(PROJECTS_BASE, projectName);
  if (!existsSync(projectPath)) {
    return interaction.editReply(`❌ Projeto \`${projectName}\` não encontrado em \`${PROJECTS_BASE}\`.`);
  }

  // Cria thread para a sessão
  const threadName = `${mode === 'plan' ? '📋 Plan' : '🔨 Build'} · ${projectName} · ${formatTime()}`;
  const thread = await interaction.channel.threads.create({
    name: threadName,
    autoArchiveDuration: 1440, // 24h
    reason: `Sessão OpenCode ${mode} para ${projectName}`,
  });

  // Cria e inicia a sessão
  const session = sessionManager.create({
    projectPath,
    threadId: thread.id,
    userId: interaction.user.id,
  });

  const { StreamHandler } = await import('./stream-handler.js');
  const streamHandler = new StreamHandler(thread, session);
  streamHandler.start();
  session.start();

  // Mensagem inicial na thread
  await thread.send(buildSessionEmbed({ mode, projectName, projectPath, session }));

  // Se passou um prompt inicial, envia para o processo
  if (promptText) {
    setTimeout(() => {
      session.sendInput(promptText);
    }, 1500); // aguarda o opencode inicializar
  }

  await interaction.editReply(
    `✅ Sessão **${mode}** iniciada para \`${projectName}\`!\n👉 Acesse a thread: ${thread}`
  );
}

async function handleListSessions(interaction, sessionManager) {
  const sessions = sessionManager.getAll();

  if (sessions.length === 0) {
    return interaction.reply({ content: '📭 Nenhuma sessão ativa no momento.', ephemeral: true });
  }

  const statusEmoji = { running: '⚙️', waiting_input: '💬', finished: '✅', error: '❌', idle: '💤' };

  const lines = sessions.map((s) => {
    const emoji = statusEmoji[s.status] || '❓';
    const age = formatAge(s.createdAt);
    return `${emoji} \`${s.sessionId.slice(-6)}\` · **${path.basename(s.projectPath)}** · ${s.status} · ${age}`;
  });

  const embed = new EmbedBuilder()
    .setTitle('📊 Sessões OpenCode Ativas')
    .setDescription(lines.join('\n'))
    .setColor(0x5865f2)
    .setFooter({ text: `${sessions.length} sessão(ões) ativa(s)` })
    .setTimestamp();

  interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleStatus(interaction, sessionManager) {
  const session = sessionManager.getByThread(interaction.channelId);

  if (!session) {
    return interaction.reply({
      content: '❌ Nenhuma sessão OpenCode associada a esta thread.',
      ephemeral: true,
    });
  }

  const s = session.toSummary();
  const statusEmoji = { running: '⚙️', waiting_input: '💬', finished: '✅', error: '❌', idle: '💤' };

  const embed = new EmbedBuilder()
    .setTitle(`${statusEmoji[s.status] || '❓'} Status da Sessão`)
    .addFields(
      { name: 'Projeto', value: s.project, inline: true },
      { name: 'Status', value: s.status, inline: true },
      { name: 'Usuário', value: `<@${s.userId}>`, inline: true },
      { name: 'Iniciada', value: formatAge(s.createdAt) + ' atrás', inline: true },
      { name: 'Última atividade', value: formatAge(s.lastActivityAt) + ' atrás', inline: true },
      { name: 'Caminho', value: `\`${s.projectPath}\``, inline: false }
    )
    .setColor(s.status === 'error' ? 0xff0000 : s.status === 'finished' ? 0x00ff00 : 0x5865f2)
    .setTimestamp();

  interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleStop(interaction, sessionManager) {
  const session = sessionManager.getByThread(interaction.channelId);

  if (!session) {
    return interaction.reply({
      content: '❌ Nenhuma sessão ativa nesta thread.',
      ephemeral: true,
    });
  }

  // Botão de confirmação
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`confirm_stop_${session.sessionId}`)
      .setLabel('Confirmar encerramento')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('cancel_stop')
      .setLabel('Cancelar')
      .setStyle(ButtonStyle.Secondary)
  );

  interaction.reply({
    content: `⚠️ Deseja encerrar a sessão para **${path.basename(session.projectPath)}**?`,
    components: [row],
    ephemeral: true,
  });
}

async function handleListProjects(interaction) {
  const projects = getProjects();

  if (projects.length === 0) {
    return interaction.reply({
      content: `📭 Nenhum projeto encontrado em \`${PROJECTS_BASE}\`.`,
      ephemeral: true,
    });
  }

  const embed = new EmbedBuilder()
    .setTitle('📁 Projetos Disponíveis')
    .setDescription(projects.map((p) => `• \`${p}\``).join('\n'))
    .setColor(0x57f287)
    .setFooter({ text: `Base: ${PROJECTS_BASE}` });

  interaction.reply({ embeds: [embed], ephemeral: true });
}

// ─── Handler de interações (select menus, botões) ─────────────────────────────

export async function handleInteraction(interaction, sessionManager) {
  if (!interaction.isStringSelectMenu() && !interaction.isButton()) return;

  // Select de projeto
  if (interaction.customId.startsWith('select_project_')) {
    const mode = interaction.customId.replace('select_project_', '');
    const projectName = interaction.values[0];
    const projectPath = path.join(PROJECTS_BASE, projectName);

    await interaction.deferUpdate();

    const threadName = `${mode === 'plan' ? '📋 Plan' : '🔨 Build'} · ${projectName} · ${formatTime()}`;
    const thread = await interaction.channel.threads.create({
      name: threadName,
      autoArchiveDuration: 1440,
    });

    const session = sessionManager.create({
      projectPath,
      threadId: thread.id,
      userId: interaction.user.id,
    });

    const { StreamHandler } = await import('./stream-handler.js');
    const streamHandler = new StreamHandler(thread, session);
    streamHandler.start();
    session.start();

    await thread.send(buildSessionEmbed({ mode, projectName, projectPath, session }));

    await interaction.editReply({
      content: `✅ Sessão **${mode}** iniciada para \`${projectName}\`!\n👉 ${thread}`,
      components: [],
    });
  }

  // Botão confirmar stop
  if (interaction.customId.startsWith('confirm_stop_')) {
    const sessionId = interaction.customId.replace('confirm_stop_', '');
    sessionManager.destroy(sessionId);
    await interaction.update({ content: '✅ Sessão encerrada.', components: [] });
  }

  // Botão cancelar stop
  if (interaction.customId === 'cancel_stop') {
    await interaction.update({ content: '↩️ Cancelado.', components: [] });
  }
}

// ─── Utilitários ──────────────────────────────────────────────────────────────

function getProjects() {
  try {
    return readdirSync(PROJECTS_BASE, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
  } catch {
    return [];
  }
}

function buildSessionEmbed({ mode, projectName, projectPath, session }) {
  const embed = new EmbedBuilder()
    .setTitle(`${mode === 'plan' ? '📋 Sessão Plan' : '🔨 Sessão Build'} — ${projectName}`)
    .setDescription(
      `Sessão OpenCode iniciada!\n\n` +
      `**Como usar:**\n` +
      `• Digite sua mensagem aqui para interagir com o agente\n` +
      `• Use \`/status\` para ver o estado da sessão\n` +
      `• Use \`/parar\` para encerrar\n\n` +
      `⚙️ Inicializando \`opencode\`...`
    )
    .addFields(
      { name: 'Projeto', value: `\`${projectName}\``, inline: true },
      { name: 'Modo', value: mode, inline: true },
      { name: 'Caminho', value: `\`${projectPath}\``, inline: false }
    )
    .setColor(mode === 'plan' ? 0xfee75c : 0x57f287)
    .setTimestamp()
    .setFooter({ text: `Sessão ${session.sessionId.slice(-8)}` });

  return { embeds: [embed] };
}

function formatTime() {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatAge(date) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}
