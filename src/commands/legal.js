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

function buildLegalComponents() {
    return [
        new ContainerBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent([
                    'Review our Terms of Service and Privacy Policy using the links below.',
                ].join('\n')),
            )
            .addActionRowComponents(
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setLabel('Terms of Service')
                        .setStyle(ButtonStyle.Link)
                        .setURL(config.TERMS_URL),
                    new ButtonBuilder()
                        .setLabel('Privacy Policy')
                        .setStyle(ButtonStyle.Link)
                        .setURL(config.PRIVACY_URL),
                ),
            ),
    ];
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('legal')
        .setDescription('View the community legal documents'),

    async execute(interaction) {
        await interaction.reply({
            components: buildLegalComponents(),
            flags: MessageFlags.IsComponentsV2,
        });
    },
    buildLegalComponents,
};
