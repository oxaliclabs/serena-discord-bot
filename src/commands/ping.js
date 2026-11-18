const {
    ContainerBuilder,
    MessageFlags,
    SeparatorBuilder,
    SeparatorSpacingSize,
    SlashCommandBuilder,
    TextDisplayBuilder,
} = require('discord.js');
const emoji = require('../emoji');

function buildPingComponents(gatewayLatency, responseLatency) {
    return [
        new ContainerBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent([
                    `## ${emoji.PING} Chiku Ping`,
                ].join('\n')),
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent([
                    `**Discord Gateway:** ${gatewayLatency} ms`,
                    `**Command Response:** ${responseLatency} ms`,
                ].join('\n')),
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
            ),
    ];
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription("Show the manager's Discord and response latency"),

    async execute(interaction, client) {
        const responseLatency = Math.max(0, Date.now() - interaction.createdTimestamp);
        const measuredGatewayLatency = Math.round(client.ws.ping);
        const gatewayLatency = Number.isFinite(measuredGatewayLatency)
            ? Math.max(0, measuredGatewayLatency)
            : 0;

        await interaction.reply({
            components: buildPingComponents(gatewayLatency, responseLatency),
            flags: MessageFlags.IsComponentsV2,
        });
    },
    buildPingComponents,
};
