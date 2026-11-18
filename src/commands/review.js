const fs = require('fs');
const path = require('path');
const {
    ContainerBuilder,
    EmbedBuilder,
    MessageFlags,
    SlashCommandBuilder,
    TextDisplayBuilder,
} = require('discord.js');
const emoji = require('../emoji');
const config = require('../config');

const REVIEW_DATA_FILE = path.join(__dirname, '..', '..', 'data', 'review.json');
const STICKY_HEARTBEAT_INTERVAL_MS = 10 * 60 * 1000;
const STICKY_CONTENT = 'Use **\`/review\`** to write a review for us.';

function loadReviewState() {
    try {
        const parsed = JSON.parse(fs.readFileSync(REVIEW_DATA_FILE, 'utf8'));
        return {
            stickyMessageId: typeof parsed.stickyMessageId === 'string'
                ? parsed.stickyMessageId
                : null,
        };
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error(`[Review] Could not read sticky state: ${error.message}`);
        }
        return { stickyMessageId: null };
    }
}

const reviewState = loadReviewState();
let stateSaveQueue = Promise.resolve();
let stickyMoveQueue = Promise.resolve();
let stickyMoveTimer = null;
let stickyOperationActive = false;
let reviewSystemAttached = false;

function queueStateSave() {
    stateSaveQueue = stateSaveQueue
        .then(async () => {
            await fs.promises.mkdir(path.dirname(REVIEW_DATA_FILE), { recursive: true });
            const temporaryFile = `${REVIEW_DATA_FILE}.tmp`;
            await fs.promises.writeFile(temporaryFile, JSON.stringify(reviewState, null, 2), 'utf8');
            await fs.promises.rename(temporaryFile, REVIEW_DATA_FILE);
        })
        .catch((error) => {
            console.error(`[Review] Could not save sticky state: ${error.message}`);
        });
}

function getReviewerAvatarURL(user) {
    return user.displayAvatarURL({ extension: 'png', size: 256 });
}

function getRatingText(rating) {
    return `${emoji.STAR.repeat(rating)}${emoji.EMPTY_STAR.repeat(5 - rating)}`;
}

function quoteReview(review) {
    return review
        .trim()
        .split(/\r?\n/)
        .map((line) => `> ${line || '\u200b'}`)
        .join('\n');
}

function buildReviewEmbed(user, review, rating, submittedAt = Date.now()) {
    return new EmbedBuilder()
        .setColor(0x000000)
        .setDescription([
            `${getRatingText(rating)} **${rating}/5**`,
            `**Reviewer:** <@${user.id}>`,
            '',
            quoteReview(review),
            '',
            `-# Submitted <t:${Math.floor(submittedAt / 1000)}:R>`,
        ].join('\n'))
        .setThumbnail(getReviewerAvatarURL(user));
}

function buildConfirmationComponents(reviewMessage) {
    return [
        new ContainerBuilder().addTextDisplayComponents(
            new TextDisplayBuilder().setContent([
                `## ${emoji.TICK} Review Submitted`,
                `Your review was posted in <#${reviewMessage.channelId}>.`,
                `[Open your review](${reviewMessage.url})`,
            ].join('\n')),
        ),
    ];
}

async function resolveReviewChannel(client, config) {
    try {
        const channel = await client.channels.fetch(config.REVIEW_CHANNEL_ID);
        if (
            !channel?.isTextBased()
            || !channel.messages
            || channel.guildId !== config.GUILD_ID
        ) {
            return null;
        }
        return channel;
    } catch {
        return null;
    }
}

async function fetchStickyMessage(channel) {
    if (!reviewState.stickyMessageId) return null;

    try {
        return await channel.messages.fetch(reviewState.stickyMessageId);
    } catch {
        return null;
    }
}

async function editStickyMessage(message) {
    return message.edit({
        content: STICKY_CONTENT,
        embeds: [],
        components: [],
        allowedMentions: { parse: [] },
    });
}

async function performStickyUpdate(client, config, moveToBottom) {
    const channel = await resolveReviewChannel(client, config);
    if (!channel) {
        throw new Error('The configured review channel is missing or is not a text channel.');
    }

    stickyOperationActive = true;

    try {
        let existingMessage = await fetchStickyMessage(channel);

        if (existingMessage && existingMessage.author?.id !== client.user.id) {
            existingMessage = null;
            reviewState.stickyMessageId = null;
            queueStateSave();
        }

        const existingUsesComponentsV2 = existingMessage?.flags?.has?.(MessageFlags.IsComponentsV2) ?? false;

        if (existingMessage && !moveToBottom && !existingUsesComponentsV2) {
            try {
                return await editStickyMessage(existingMessage);
            } catch (error) {
                console.warn(`[Review] Existing sticky could not be updated: ${error.message}`);
            }
        }

        if (existingMessage) {
            await existingMessage.delete().catch((error) => {
                console.warn(`[Review] Could not remove the old sticky: ${error.message}`);
            });
        }

        const stickyMessage = await channel.send({
            content: STICKY_CONTENT,
            allowedMentions: { parse: [] },
        });

        reviewState.stickyMessageId = stickyMessage.id;
        queueStateSave();
        return stickyMessage;
    } finally {
        stickyOperationActive = false;
    }
}

function ensureReviewSticky(client, config, moveToBottom = false) {
    if (stickyMoveTimer) {
        clearTimeout(stickyMoveTimer);
        stickyMoveTimer = null;
    }

    stickyMoveQueue = stickyMoveQueue
        .then(() => performStickyUpdate(client, config, moveToBottom))
        .catch((error) => {
            console.error(`[Review] Sticky update failed: ${error.message}`);
            return null;
        });

    return stickyMoveQueue;
}

function scheduleStickyMove(client, config) {
    if (stickyOperationActive || stickyMoveTimer) return;

    stickyMoveTimer = setTimeout(() => {
        stickyMoveTimer = null;
        void ensureReviewSticky(client, config, true);
    }, 1_000);
    stickyMoveTimer.unref();
}

async function setupReviewSystem(client, config) {
    if (!reviewSystemAttached) {
        reviewSystemAttached = true;

        client.on('messageCreate', (message) => {
            if (message.guildId !== config.GUILD_ID) return;
            if (message.channelId !== config.REVIEW_CHANNEL_ID) return;
            if (message.id === reviewState.stickyMessageId || stickyOperationActive) return;
            scheduleStickyMove(client, config);
        });

        client.on('messageDelete', (message) => {
            if (message.id !== reviewState.stickyMessageId) return;
            if (stickyOperationActive) return;
            reviewState.stickyMessageId = null;
            queueStateSave();
            scheduleStickyMove(client, config);
        });

        const heartbeat = setInterval(
            () => void ensureReviewSticky(client, config, false),
            STICKY_HEARTBEAT_INTERVAL_MS,
        );
        heartbeat.unref();
    }

    return ensureReviewSticky(client, config, true);
}

const ratingChoices = [1, 2, 3, 4, 5].map((rating) => ({
    name: emoji.STAR.repeat(rating),
    value: rating,
}));

module.exports = {
    data: new SlashCommandBuilder()
        .setName('review')
        .setDescription('Write a community review')
        .addStringOption((option) => option
            .setName('review')
            .setDescription('Your review')
            .setRequired(true)
            .setMinLength(3)
            .setMaxLength(1_000))
        .addIntegerOption((option) => option
            .setName('rating')
            .setDescription('Select rating')
            .setRequired(true)
            .addChoices(...ratingChoices)),

    async execute(interaction, client) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const channel = await resolveReviewChannel(client, config);
        if (!channel) {
            await interaction.editReply({
                content: `${emoji.CROSS} The configured review channel is unavailable.`,
            });
            return;
        }

        const review = interaction.options.getString('review', true);
        const rating = interaction.options.getInteger('rating', true);
        const reviewMessage = await channel.send({
            embeds: [buildReviewEmbed(interaction.user, review, rating)],
            allowedMentions: { parse: [] },
        });

        await ensureReviewSticky(client, config, true);

        await interaction.editReply({
            content: null,
            components: buildConfirmationComponents(reviewMessage),
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: { parse: [] },
        });
    },
    buildConfirmationComponents,
    buildReviewEmbed,
    ensureReviewSticky,
    resolveReviewChannel,
    setupReviewSystem,
};
