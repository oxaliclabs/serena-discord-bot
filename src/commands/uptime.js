const {
    ContainerBuilder,
    MessageFlags,
    SectionBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    SlashCommandBuilder,
    TextDisplayBuilder,
    ThumbnailBuilder,
} = require('discord.js');
const config = require('../config');
const emoji = require('../emoji');
const { formatDuration, getBotMonitor, getStatusLabel } = require('../utils/botMonitor');
const { getBotAvatarURL, getStatusEmoji } = require('./status');

const choices = config.MONITORED_BOTS.slice(0, 25).map((bot) => ({
    name: bot.name,
    value: bot.id,
}));

function buildUptimeComponents(monitor, client, botId) {
    const snapshot = monitor.getSnapshot(botId);
    if (!snapshot) throw new Error('That bot is not configured for monitoring.');

    const metrics = monitor.getWeeklyMetrics(botId);
    const details = [
        `## ${emoji.UPTIME} ${snapshot.bot.name} — Weekly Uptime`,
        `**Uptime:** ${formatDuration(metrics.uptimeMs)}`,
        `**Percentage:** ${metrics.uptimePercentage.toFixed(2)}%`,
        `**Current status:** ${getStatusEmoji(snapshot.status)} ${getStatusLabel(snapshot.status)}`,
        `**Tracked window:** ${formatDuration(metrics.trackedMs)}`,
    ];

    if (!metrics.fullWeek) {
        details.push('', `${emoji.LOADING} Tracking has not yet collected a full seven days.`);
    }

    return [
        new ContainerBuilder()
            .addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(details.join('\n')),
                    )
                    .setThumbnailAccessory(
                        new ThumbnailBuilder()
                            .setURL(getBotAvatarURL(client, snapshot.bot.id))
                            .setDescription(`${snapshot.bot.name} avatar`),
                    ),
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `-# Updated <t:${Math.floor(Date.now() / 1000)}:R>`,
                ),
            ),
    ];
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('uptime')
        .setDescription("Show a monitored bot's weekly uptime")
        .addStringOption((option) => option
            .setName('bot')
            .setDescription('Bot whose uptime should be displayed')
            .setRequired(true)
            .addChoices(...choices)),

    async execute(interaction, client) {
        const monitor = getBotMonitor();
        if (!monitor) throw new Error('The bot monitor has not started.');

        await monitor.reconcile();
        const botId = interaction.options.getString('bot', true);
        await interaction.reply({
            components: buildUptimeComponents(monitor, client, botId),
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: { parse: [] },
        });
    },
    buildUptimeComponents,
};
