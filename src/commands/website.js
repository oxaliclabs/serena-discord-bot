const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    MessageFlags,
    SlashCommandBuilder,
    TextDisplayBuilder,
} = require('discord.js');
const config = require('../config');
const emoji = require('../emoji');

function buildWebsiteComponents() {
    return [
        new ContainerBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent([
                    'Visit the community website using the button below.',
                ].join('\n')),
            )
            .addActionRowComponents(
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setLabel('Visit website')
                        .setStyle(ButtonStyle.Link)
                        .setURL(config.WEBSITE_URL),
                ),
            ),
    ];
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('website')
        .setDescription('Get a link to the community website'),

    async execute(interaction) {
        await interaction.reply({
            components: buildWebsiteComponents(),
            flags: MessageFlags.IsComponentsV2,
        });
    },
    buildWebsiteComponents,
};
