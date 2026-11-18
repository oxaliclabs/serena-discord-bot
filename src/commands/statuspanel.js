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
const { getBotMonitor, getStatusLabel } = require('../utils/botMonitor');
const { buildStatusComponents, getBotAvatarURL, getStatusEmoji } = require('./status');

const PANEL_HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;
const uiStateByMonitor = new WeakMap();

function getUIState(monitor) {
    let state = uiStateByMonitor.get(monitor);
    if (!state) {
        state = {
            attached: false,
            missingChannelWarningShown: false,
            refreshPromise: null,
            refreshTimer: null,
        };
        uiStateByMonitor.set(monitor, state);
    }
    return state;
}

function buildTransitionComponents(client, transition) {
    const label = transition.available ? 'Online' : 'Offline';
    return [
        new ContainerBuilder()
            .addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent([
                            `## ${transition.available ? emoji.ONLINE : emoji.OFFLINE} ${transition.bot.name} is now ${label}`,
                            `<@${transition.bot.id}> changed status to **${getStatusLabel(transition.status)}**.`,
                            `Changed: <t:${Math.floor(transition.changedAt / 1000)}:R>`,
                        ].join('\n')),
                    )
                    .setThumbnailAccessory(
                        new ThumbnailBuilder()
                            .setURL(getBotAvatarURL(client, transition.bot.id))
                            .setDescription(`${transition.bot.name} avatar`),
                    ),
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `-# ${getStatusEmoji(transition.status)} Real-time status notification`,
                ),
            ),
    ];
}

function buildConfirmationComponents(message, reused) {
    return [
        new ContainerBuilder().addTextDisplayComponents(
            new TextDisplayBuilder().setContent([
                `## ${emoji.TICK} Status panel ${reused ? 'refreshed' : 'deployed'}`,
                `Channel: <#${message.channelId}>`,
                `[Open status panel](${message.url})`,
            ].join('\n')),
        ),
    ];
}

async function editPanelMessage(message, monitor, client) {
    return message.edit({
        content: null,
        embeds: [],
        components: buildStatusComponents(monitor, client),
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] },
    });
}

async function sendPanelMessage(channel, monitor, client) {
    return channel.send({
        components: buildStatusComponents(monitor, client),
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] },
    });
}

async function deployPanel(monitor, client, fallbackChannel = null) {
    const existingMessage = await monitor.fetchPanelMessage();
    if (existingMessage) {
        try {
            const message = await editPanelMessage(existingMessage, monitor, client);
            return { message, reused: true };
        } catch (error) {
            console.warn(`[Monitor UI] Existing panel could not be converted to Components V2: ${error.message}`);
        }
    }

    const channel = await monitor.resolveStatusChannel(fallbackChannel);
    if (!channel) {
        throw new Error('The configured status channel is missing or is not a text channel.');
    }

    const message = await sendPanelMessage(channel, monitor, client);
    monitor.setPanelReference(channel.id, message.id);
    return { message, reused: false };
}

async function refreshPanel(monitor, client) {
    const state = getUIState(monitor);
    if (!monitor.getPanelReference() || state.refreshPromise) return state.refreshPromise;

    state.refreshPromise = (async () => {
        const existingMessage = await monitor.fetchPanelMessage();
        if (existingMessage) {
            try {
                return await editPanelMessage(existingMessage, monitor, client);
            } catch (error) {
                console.warn(`[Monitor UI] Status panel edit failed; replacing it: ${error.message}`);
            }
        }

        const reference = monitor.getPanelReference();
        const channel = await monitor.resolveTextChannel(reference?.channelId);
        if (!channel) return null;

        const replacement = await sendPanelMessage(channel, monitor, client);
        monitor.setPanelReference(channel.id, replacement.id);
        return replacement;
    })()
        .catch((error) => {
            console.error(`[Monitor UI] Could not refresh status panel: ${error.message}`);
            return null;
        })
        .finally(() => {
            state.refreshPromise = null;
        });

    return state.refreshPromise;
}

function schedulePanelRefresh(monitor, client) {
    const state = getUIState(monitor);
    if (!monitor.getPanelReference() || state.refreshTimer) return;

    state.refreshTimer = setTimeout(() => {
        state.refreshTimer = null;
        void refreshPanel(monitor, client);
    }, 1_000);
    state.refreshTimer.unref();
}

async function sendTransitionAlert(monitor, client, transition) {
    const state = getUIState(monitor);
    const channel = await monitor.resolveStatusChannel();
    if (!channel) {
        if (!state.missingChannelWarningShown) {
            console.warn('[Monitor UI] No usable status channel was found for transition alerts.');
            state.missingChannelWarningShown = true;
        }
        return;
    }

    state.missingChannelWarningShown = false;

    try {
        await channel.send({
            components: buildTransitionComponents(client, transition),
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: { parse: [] },
        });
    } catch (error) {
        console.error(`[Monitor UI] Could not send ${transition.bot.name} alert: ${error.message}`);
    }
}

function attachMonitorUI(monitor, client) {
    const state = getUIState(monitor);
    if (state.attached) return;
    state.attached = true;

    monitor.on('statusChange', () => schedulePanelRefresh(monitor, client));
    monitor.on('transition', (transition) => {
        void sendTransitionAlert(monitor, client, transition);
    });

    const heartbeat = setInterval(
        () => void refreshPanel(monitor, client),
        PANEL_HEARTBEAT_INTERVAL_MS,
    );
    heartbeat.unref();
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('statuspanel')
        .setDescription('Deploy or refresh the persistent bot status panel'),

    async execute(interaction, client) {
        const monitor = getBotMonitor();
        if (!monitor) throw new Error('The bot monitor has not started.');

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await monitor.reconcile();
        const { message, reused } = await deployPanel(monitor, client, interaction.channel);

        await interaction.editReply({
            content: null,
            components: buildConfirmationComponents(message, reused),
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: { parse: [] },
        });
    },
    attachMonitorUI,
    buildConfirmationComponents,
    buildTransitionComponents,
    deployPanel,
    refreshPanel,
};
