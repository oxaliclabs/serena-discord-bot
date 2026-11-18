const BIO_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

function buildBio(memberCount, commandCount, config) {
    return [
        `**Managing ${config.COMMUNITY_NAME}**`,
        `**Chat with me at** ${config.SUPPORT_URL}`,
        `**Members: __${memberCount}__    ・  Command: __${commandCount}__**`,
    ].join('\n');
}

function startBioUpdater(client, config) {
    let lastBio;
    let updateInProgress = false;
    let updateRequested = false;

    async function updateBio() {
        if (updateInProgress) {
            updateRequested = true;
            return;
        }

        updateInProgress = true;

        try {
            const guild = client.guilds.cache.get(config.GUILD_ID);
            if (!guild) {
                console.warn(`[Bio] Configured guild ${config.GUILD_ID} is not available.`);
                return;
            }

            const bio = buildBio(guild.memberCount, client.commands.size, config);
            if (bio === lastBio) return;

            await client.application.edit({ description: bio });
            lastBio = bio;
            console.log(`[Bio] Updated (${guild.memberCount} members, ${client.commands.size} commands).`);
        } catch (error) {
            console.error(`[Bio] Failed to update: ${error.message}`);
        } finally {
            updateInProgress = false;

            if (updateRequested) {
                updateRequested = false;
                void updateBio();
            }
        }
    }

    const updateForConfiguredGuild = (member) => {
        if (member.guild.id === config.GUILD_ID) void updateBio();
    };

    client.on('guildMemberAdd', updateForConfiguredGuild);
    client.on('guildMemberRemove', updateForConfiguredGuild);

    void updateBio();

    const refreshTimer = setInterval(() => void updateBio(), BIO_REFRESH_INTERVAL_MS);
    refreshTimer.unref();

    return refreshTimer;
}

module.exports = startBioUpdater;
