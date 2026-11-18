const fs = require('fs');
const path = require('path');

try {
    process.loadEnvFile(path.join(__dirname, '.env'));
} catch (error) {
    if (error.code !== 'ENOENT') {
        console.warn(`[Config] Could not load .env: ${error.message}`);
    }
}

const {
    Client,
    Collection,
    GatewayIntentBits,
    MessageFlags,
    Partials,
    REST,
    Routes,
} = require('discord.js');
const { SimpleShardingStrategy } = require('@discordjs/ws');
const config = require('./src/config');

function validateConfiguration() {
    const requiredValues = {
        BOT_TOKEN: config.BOT_TOKEN,
        GEMINI_API_KEY: config.GEMINI_API_KEY,
        CLOUDFLARE_ACCOUNT_ID: config.CLOUDFLARE_ACCOUNT_ID,
        CLOUDFLARE_API_TOKEN: config.CLOUDFLARE_API_TOKEN,
        GUILD_ID: config.GUILD_ID,
        VOICE_CHANNEL_ID: config.VOICE_CHANNEL_ID,
        STATUS_CHANNEL_ID: config.STATUS_CHANNEL_ID,
        REVIEW_CHANNEL_ID: config.REVIEW_CHANNEL_ID,
        WELCOME_CHANNEL_ID: config.WELCOME_CHANNEL_ID,
        CHAT_CHANNEL_ID: config.CHAT_CHANNEL_ID,
    };
    const missing = Object.entries(requiredValues)
        .filter(([, value]) => !String(value || '').trim())
        .map(([name]) => name);

    if (!config.OWNER_ID.length) missing.push('OWNER_IDS');
    if (missing.length) {
        throw new Error(`[Config] Missing required .env setting(s): ${missing.join(', ')}`);
    }

    const discordIds = {
        GUILD_ID: config.GUILD_ID,
        VOICE_CHANNEL_ID: config.VOICE_CHANNEL_ID,
        STATUS_CHANNEL_ID: config.STATUS_CHANNEL_ID,
        REVIEW_CHANNEL_ID: config.REVIEW_CHANNEL_ID,
        WELCOME_CHANNEL_ID: config.WELCOME_CHANNEL_ID,
        CHAT_CHANNEL_ID: config.CHAT_CHANNEL_ID,
    };
    const invalidIds = Object.entries(discordIds)
        .filter(([, value]) => !/^\d{17,20}$/.test(value))
        .map(([name]) => name);

    if (config.OWNER_ID.some((id) => !/^\d{17,20}$/.test(id))) invalidIds.push('OWNER_IDS');
    if (invalidIds.length) {
        throw new Error(`[Config] Invalid Discord ID setting(s): ${invalidIds.join(', ')}`);
    }
}

validateConfiguration();
const emoji = require('./src/emoji');
const startBioUpdater = require('./src/utils/bioUpdater');
const { startBotMonitor } = require('./src/utils/botMonitor');
const connectToVoice = require('./src/utils/voiceConnect');
const { startChatbot } = require('./src/utils/chatbot');
const { attachMonitorUI } = require('./src/commands/statuspanel');
const { setupReviewSystem } = require('./src/commands/review');
const { toBoldUnicode, getActivityMessages, buildCustomStatus } = require('./src/utils/presence');

class MobileShardingStrategy extends SimpleShardingStrategy {
    constructor(manager) {
        manager.options.identifyProperties = {
            os: 'ios',
            device: 'device',
            browser: 'Discord iOS',
        };
        super(manager);
    }
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel],
    ws: {
        buildStrategy: (manager) => new MobileShardingStrategy(manager),
    },
});

client.commands = new Collection();
const publicCommands = new Set(['review', 'website']);

function loadCommands(dir) {
    const fullPath = path.join(__dirname, dir);
    if (!fs.existsSync(fullPath)) return;

    for (const entry of fs.readdirSync(fullPath, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            loadCommands(path.join(dir, entry.name));
            continue;
        }

        if (!entry.name.endsWith('.js')) continue;

        const command = require(path.join(fullPath, entry.name));
        if (!command || !command.data || typeof command.execute !== 'function') {
            console.warn(`[Commands] Skipped ${entry.name} (missing data/execute)`);
            continue;
        }

        client.commands.set(command.data.name, command);
        console.log(`[Commands] Loaded /${command.data.name}`);
    }
}

loadCommands('./src/commands');

async function registerCommands() {
    const rest = new REST({ version: '10' }).setToken(config.BOT_TOKEN);
    const body = client.commands.map((cmd) => cmd.data.toJSON());

    try {
        await rest.put(Routes.applicationGuildCommands(client.user.id, config.GUILD_ID), { body });
        console.log(`[Commands] Registered ${body.length} slash command(s) to guild ${config.GUILD_ID}`);
    } catch (error) {
        console.error(`[Commands] Failed to register commands: ${error.message}`);
    }
}

client.on('interactionCreate', async (interaction) => {
    if (interaction.guildId !== config.GUILD_ID) {
        if (interaction.isRepliable()) {
            return interaction.reply({ content: `${emoji.CROSS} You can't use me.`, flags: MessageFlags.Ephemeral }).catch(() => { });
        }
        return;
    }

    if (!interaction.isChatInputCommand()) return;

    if (
        !publicCommands.has(interaction.commandName)
        && !config.OWNER_ID.includes(interaction.user.id)
    ) {
        return interaction.reply({
            content: `${emoji.CROSS} You can't use me.`,
            flags: MessageFlags.Ephemeral,
        });
    }

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction, client);
    } catch (error) {
        console.error(`[Commands] Error in /${interaction.commandName}: ${error.message}`);
        const errorPayload = { content: `${emoji.CROSS} Something went wrong running that command.`, flags: MessageFlags.Ephemeral };
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorPayload).catch(() => { });
        } else {
            await interaction.reply(errorPayload).catch(() => { });
        }
    }
});

async function leaveUnauthorizedGuild(guild) {
    if (guild.id !== config.GUILD_ID) {
        console.log(`[Guard] Joined unauthorized guild "${guild.name}" (${guild.id}) — leaving.`);
        await guild.leave().catch(() => { });
    }
}

client.on('guildCreate', leaveUnauthorizedGuild);

client.once('clientReady', async () => {
    console.log(`[Ready] Logged in as ${client.user.tag}`);

    await Promise.all(client.guilds.cache.map(leaveUnauthorizedGuild));

    await registerCommands();

    const activities = getActivityMessages(config.ACTIVITIES);
    let activityIndex = 0;

    // Show a Custom Status bubble (no 'Playing' card) while keeping the bot Online.
    // Discord's bot presence payload supports the Custom activity's name/state/type fields.
    client.user.setPresence({
        status: 'online',
        activities: [buildCustomStatus(activities[activityIndex])],
    });

    setInterval(() => {
        activityIndex = (activityIndex + 1) % activities.length;
        client.user.setPresence({
            status: 'online',
            activities: [buildCustomStatus(activities[activityIndex])],
        });
    }, 5000);

    startBioUpdater(client, config);
    await startChatbot(client, config);
    await connectToVoice(client, config);

    try {
        await setupReviewSystem(client, config);
    } catch (error) {
        console.error(`[Review] Failed to start: ${error.message}`);
    }

    try {
        await startBotMonitor(client, config, (monitor) => attachMonitorUI(monitor, client));
    } catch (error) {
        console.error(`[Monitor] Failed to start: ${error.message}`);
    }
});

client.login(config.BOT_TOKEN);
