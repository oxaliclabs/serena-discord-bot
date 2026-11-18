const {
    ContainerBuilder,
    MessageFlags,
    SeparatorBuilder,
    SeparatorSpacingSize,
    SlashCommandBuilder,
    TextDisplayBuilder,
} = require('discord.js');
const config = require('../config');
const emoji = require('../emoji');

function buildRulesComponents() {
    const rules = [
        ['Be respectful', 'Treat every member with respect. Harassment, hate speech, and personal attacks are not allowed.'],
        ['Keep language appropriate', 'Avoid excessive profanity, slurs, and content intended to offend other members.'],
        ['Do not spam', 'Do not flood chats, repeat messages, mass mention members, or misuse reactions.'],
        ['No NSFW content', 'Pornographic, graphic, or otherwise inappropriate material is prohibited.'],
        ['No unauthorized advertising', 'Do not promote other servers, products, or services without staff permission.'],
        ['Use the correct channels', 'Keep conversations and media relevant to the purpose of each channel.'],
        ['Protect the community', 'Do not impersonate others, evade moderation, scam members, or share harmful links.'],
        ['Follow staff and Discord rules', 'Follow reasonable staff instructions and comply with Discord’s Terms of Service.'],
    ];

    const container = new ContainerBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent([
                `## ${emoji.RULES} Server Rules`,
                `Please follow these simple rules to keep the ${config.COMMUNITY_NAME} community safe and welcoming.`,
            ].join('\n')),
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
        );

    rules.forEach(([title, description], index) => {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`### ${index + 1}. ${title}\n${description}`),
        );
    });

    return [container];
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rules')
        .setDescription('Post the server rules panel'),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const message = await interaction.channel.send({
            components: buildRulesComponents(),
            flags: MessageFlags.IsComponentsV2,
        });

        await interaction.editReply({
            content: `${emoji.TICK} Rules posted: ${message.url}`,
        });
    },
    buildRulesComponents,
};
