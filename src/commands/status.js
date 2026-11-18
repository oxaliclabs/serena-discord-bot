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
const { getBotMonitor, getStatusLabel } = require('../utils/botMonitor');

function getStatusEmoji(status) {
    if (status === 'online') return emoji.ONLINE;
    if (status === 'idle') return emoji.IDLE;
    if (status === 'dnd') return emoji.DND;
    return emoji.OFFLINE;
}

function getBotAvatarURL(client, botId) {
    return client.users.cache.get(botId)?.displayAvatarURL({ extension: 'png', size: 256 })
        ?? 'https://cdn.discordapp.com/embed/avatars/0.png';
}

function buildStatusComponents(monitor, client, title = config.COMMUNITY_NAME) {
    const snapshots = monitor.getAllSnapshots();
    const container = new ContainerBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `## ${emoji.STATUS} ${title}\nMonitor every configured bot's live status and latest presence changes.`,
            ),
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
        );

    snapshots.forEach((snapshot, index) => {
        const section = new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent([
                    `### ${getStatusEmoji(snapshot.status)} ${snapshot.bot.name}`,
                    `**Username:** <@${snapshot.bot.id}>`,
                    `**ID:** \`${snapshot.bot.id}\``,
                    `**Status:** ${getStatusLabel(snapshot.status)}`,
                    `**Last change:** <t:${Math.floor(snapshot.statusChangedAt / 1000)}:R>`,
                ].join('\n')),
            )
            .setThumbnailAccessory(
                new ThumbnailBuilder()
                    .setURL(getBotAvatarURL(client, snapshot.bot.id))
                    .setDescription(`${snapshot.bot.name} avatar`),
            );

        container.addSectionComponents(section);
        if (index < snapshots.length - 1) {
            container.addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
            );
        }
    });

    container
        .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `-# Last Updated <t:${Math.floor(Date.now() / 1000)}:R>`,
            ),
        );

    return [container];
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('status')
        .setDescription('Show the current status of every monitored bot'),

    async execute(interaction, client) {
        const monitor = getBotMonitor();
        if (!monitor) throw new Error('The bot monitor has not started.');

        await monitor.reconcile();
        await interaction.reply({
            components: buildStatusComponents(monitor, client),
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: { parse: [] },
        });
    },
    buildStatusComponents,
    getBotAvatarURL,
    getStatusEmoji,
};
