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
const emoji = require('../emoji');
const { formatDuration, getBotMonitor, getStatusLabel } = require('../utils/botMonitor');
const { getBotAvatarURL, getStatusEmoji } = require('./status');

function buildFleetComponents(monitor, client) {
    const snapshots = monitor.getAllSnapshots();
    const availableCount = snapshots.filter((snapshot) => snapshot.available).length;
    const offlineCount = snapshots.length - availableCount;
    const container = new ContainerBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent([
                `## ${emoji.FLEET} Bot Fleet Overview`,
                'Monitor every configured bot\'s live status, weekly uptime, and downtime.',
                `**Fleet health:** ${availableCount}/${snapshots.length} available`,
                `${emoji.ONLINE} Online: **${availableCount}**    ${emoji.OFFLINE} Offline: **${offlineCount}**`,
            ].join('\n')),
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
        );

    snapshots.forEach((snapshot, index) => {
        const metrics = monitor.getWeeklyMetrics(snapshot.bot.id);
        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent([
                        `### ${getStatusEmoji(snapshot.status)} ${snapshot.bot.name}`,
                        `**Status:** ${getStatusLabel(snapshot.status)}`,
                        `**7-day uptime:** ${metrics.uptimePercentage.toFixed(2)}%`,
                        `**7-day downtime:** ${formatDuration(metrics.downtimeMs)}`,
                    ].join('\n')),
                )
                .setThumbnailAccessory(
                    new ThumbnailBuilder()
                        .setURL(getBotAvatarURL(client, snapshot.bot.id))
                        .setDescription(`${snapshot.bot.name} avatar`),
                ),
        );

        if (index < snapshots.length - 1) {
            container.addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
            );
        }
    });

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `-# Generated <t:${Math.floor(Date.now() / 1000)}:R>`,
        ),
    );

    return [container];
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('fleet')
        .setDescription('Show health and weekly statistics for the entire bot fleet'),

    async execute(interaction, client) {
        const monitor = getBotMonitor();
        if (!monitor) throw new Error('The bot monitor has not started.');

        await monitor.reconcile();
        await interaction.reply({
            components: buildFleetComponents(monitor, client),
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: { parse: [] },
        });
    },
    buildFleetComponents,
};
