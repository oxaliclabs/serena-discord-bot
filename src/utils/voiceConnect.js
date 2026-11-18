const {
    entersState,
    joinVoiceChannel,
    VoiceConnectionStatus,
} = require('@discordjs/voice');

async function connectToVoice(client, config) {
    const guild = client.guilds.cache.get(config.GUILD_ID);
    if (!guild) {
        console.warn(`[Voice] Configured guild ${config.GUILD_ID} is not available.`);
        return null;
    }

    let channel;

    try {
        channel = await guild.channels.fetch(config.VOICE_CHANNEL_ID);
    } catch (error) {
        console.error(`[Voice] Could not fetch channel ${config.VOICE_CHANNEL_ID}: ${error.message}`);
        return null;
    }

    if (!channel || !channel.isVoiceBased()) {
        console.error(`[Voice] Channel ${config.VOICE_CHANNEL_ID} is not a voice-based channel.`);
        return null;
    }

    if (channel.guildId !== config.GUILD_ID) {
        console.error('[Voice] The configured voice channel does not belong to the configured guild.');
        return null;
    }

    const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: true,
        selfMute: false,
    });

    connection.on('error', (error) => {
        console.error(`[Voice] Connection error: ${error.message}`);
    });

    connection.on(VoiceConnectionStatus.Ready, () => {
        console.log(`[Voice] Connected to ${channel.name} (${channel.id}).`);
    });

    let reconnecting = false;

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
        if (reconnecting) return;
        reconnecting = true;

        try {
            await Promise.race([
                entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
            ]);
            console.log('[Voice] Reconnecting to the voice channel.');
        } catch {
            if (connection.state.status !== VoiceConnectionStatus.Destroyed) {
                const rejoinStarted = connection.rejoin({
                    channelId: channel.id,
                    selfDeaf: true,
                    selfMute: false,
                });

                if (rejoinStarted) {
                    console.warn('[Voice] Connection was interrupted; rejoining the voice channel.');
                } else {
                    console.error('[Voice] Could not start a voice-channel rejoin.');
                }
            }
        } finally {
            reconnecting = false;
        }
    });

    console.log(`[Voice] Joining ${channel.name} (${channel.id}).`);
    return connection;
}

module.exports = connectToVoice;
