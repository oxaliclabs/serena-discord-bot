const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const DATA_FILE = path.join(__dirname, '..', '..', 'data', 'bot-monitor.json');
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const RECONCILE_INTERVAL_MS = 60 * 1000;

const STATUS_LABELS = {
    online: 'Online',
    idle: 'Idle',
    dnd: 'Do Not Disturb',
    offline: 'Offline',
};

function normalizeStatus(status) {
    return Object.hasOwn(STATUS_LABELS, status) ? status : 'offline';
}

function isAvailable(status) {
    return status !== 'offline';
}

function formatDuration(milliseconds) {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) return '0m';

    let minutes = Math.floor(milliseconds / 60_000);
    if (minutes === 0) return '<1m';

    const days = Math.floor(minutes / 1_440);
    minutes -= days * 1_440;
    const hours = Math.floor(minutes / 60);
    minutes -= hours * 60;

    const parts = [];
    if (days) parts.push(`${days}d`);
    if (hours) parts.push(`${hours}h`);
    if (minutes || parts.length === 0) parts.push(`${minutes}m`);
    return parts.join(' ');
}

function createEmptyData() {
    return {
        version: 1,
        panel: null,
        bots: {},
    };
}

function loadData() {
    try {
        const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        return {
            ...createEmptyData(),
            ...parsed,
            bots: parsed.bots && typeof parsed.bots === 'object' ? parsed.bots : {},
        };
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error(`[Monitor] Could not read saved history: ${error.message}`);
        }
        return createEmptyData();
    }
}

class BotMonitor extends EventEmitter {
    constructor(client, config) {
        super();
        this.client = client;
        this.config = config;
        this.botById = new Map(config.MONITORED_BOTS.map((bot) => [bot.id, bot]));
        this.data = loadData();
        this.started = false;
        this.saveQueue = Promise.resolve();
    }

    async start() {
        if (this.started) return this;

        const guild = this.client.guilds.cache.get(this.config.GUILD_ID);
        if (!guild) {
            throw new Error(`Configured guild ${this.config.GUILD_ID} is not available.`);
        }

        this.started = true;

        this.client.on('presenceUpdate', (_oldPresence, newPresence) => {
            if (newPresence.guild.id !== this.config.GUILD_ID) return;
            if (!this.botById.has(newPresence.userId)) return;
            void this.recordStatus(newPresence.userId, newPresence.status);
        });

        this.client.on('guildMemberRemove', (member) => {
            if (member.guild.id !== this.config.GUILD_ID) return;
            if (!this.botById.has(member.id)) return;
            void this.recordStatus(member.id, 'offline');
        });

        try {
            await guild.members.fetch({
                user: [...this.botById.keys()],
                withPresences: true,
                time: 15_000,
            });
        } catch (error) {
            console.warn(`[Monitor] Presence fetch did not complete: ${error.message}`);
        }

        await this.reconcile();

        const reconcileTimer = setInterval(() => void this.reconcile(), RECONCILE_INTERVAL_MS);
        reconcileTimer.unref();

        console.log(`[Monitor] Tracking ${this.botById.size} bot(s).`);
        return this;
    }

    async reconcile() {
        const guild = this.client.guilds.cache.get(this.config.GUILD_ID);
        if (!guild) return;

        for (const bot of this.botById.values()) {
            // Discord may omit offline or not-yet-cached presences. A cache miss
            // is unknown, not proof that the bot is offline. Only process a
            // status when Discord has an explicit presence entry.
            const presence = guild.presences.cache.get(bot.id);
            if (!presence || !presence.status) continue;
            await this.recordStatus(bot.id, presence.status);
        }
    }

    async recordStatus(botId, rawStatus) {
        const bot = this.botById.get(botId);
        if (!bot) return;

        const now = Date.now();
        const status = normalizeStatus(rawStatus);
        const available = isAvailable(status);
        let record = this.data.bots[botId];
        let shouldSave = false;
        let shouldAlert = false;
        let shouldRefreshPanel = false;

        if (!record) {
            record = {
                status,
                available,
                changedAt: now,
                statusChangedAt: now,
                trackedSince: now,
                events: [{ at: now, available }],
            };
            this.data.bots[botId] = record;
            shouldSave = true;
            shouldRefreshPanel = true;
        } else {
            record.events = Array.isArray(record.events) ? record.events : [];
            record.trackedSince = Number.isFinite(record.trackedSince)
                ? record.trackedSince
                : (record.events[0]?.at ?? now);

            if (typeof record.available !== 'boolean') {
                record.available = isAvailable(normalizeStatus(record.status));
            }

            if (record.events.length === 0) {
                record.events.push({ at: record.trackedSince, available: record.available });
                shouldSave = true;
            }

            if (record.available !== available) {
                record.available = available;
                record.changedAt = now;
                record.events.push({ at: now, available });
                shouldAlert = true;
                shouldSave = true;
                shouldRefreshPanel = true;
            }

            if (record.status !== status) {
                record.status = status;
                record.statusChangedAt = now;
                shouldSave = true;
                shouldRefreshPanel = true;
            }
        }

        this.pruneEvents(record, now);

        if (shouldSave) this.queueSave();

        if (shouldRefreshPanel) {
            this.emit('statusChange', {
                bot,
                status,
                available,
                changedAt: record.changedAt,
                statusChangedAt: record.statusChangedAt,
            });
        }

        if (shouldAlert) {
            this.emit('transition', {
                bot,
                status,
                available,
                changedAt: record.changedAt,
            });
        }
    }

    pruneEvents(record, now = Date.now()) {
        const cutoff = now - WEEK_MS;
        const events = record.events
            .filter((event) => Number.isFinite(event.at) && typeof event.available === 'boolean')
            .sort((left, right) => left.at - right.at);

        const firstInsideWindow = events.findIndex((event) => event.at >= cutoff);
        if (firstInsideWindow === -1) {
            record.events = events.length ? [events.at(-1)] : [];
        } else if (firstInsideWindow > 0) {
            record.events = events.slice(firstInsideWindow - 1);
        } else {
            record.events = events;
        }
    }

    queueSave() {
        this.saveQueue = this.saveQueue
            .then(async () => {
                await fs.promises.mkdir(path.dirname(DATA_FILE), { recursive: true });
                const temporaryFile = `${DATA_FILE}.tmp`;
                await fs.promises.writeFile(temporaryFile, JSON.stringify(this.data, null, 2), 'utf8');
                await fs.promises.rename(temporaryFile, DATA_FILE);
            })
            .catch((error) => {
                console.error(`[Monitor] Could not save history: ${error.message}`);
            });
    }

    getBot(botId) {
        return this.botById.get(botId) ?? null;
    }

    getSnapshot(botId) {
        const bot = this.getBot(botId);
        if (!bot) return null;

        const record = this.data.bots[botId];
        const status = normalizeStatus(record?.status);
        return {
            bot,
            status,
            available: isAvailable(status),
            changedAt: record?.changedAt ?? Date.now(),
            statusChangedAt: record?.statusChangedAt ?? record?.changedAt ?? Date.now(),
        };
    }

    getAllSnapshots() {
        return [...this.botById.keys()].map((botId) => this.getSnapshot(botId));
    }

    getWeeklyMetrics(botId, now = Date.now()) {
        const record = this.data.bots[botId];
        if (!record || !Array.isArray(record.events) || record.events.length === 0) {
            return {
                uptimeMs: 0,
                downtimeMs: 0,
                trackedMs: 0,
                uptimePercentage: 0,
                downtimePercentage: 0,
                fullWeek: false,
            };
        }

        const events = record.events
            .filter((event) => Number.isFinite(event.at) && typeof event.available === 'boolean')
            .sort((left, right) => left.at - right.at);

        if (events.length === 0) {
            return {
                uptimeMs: 0,
                downtimeMs: 0,
                trackedMs: 0,
                uptimePercentage: 0,
                downtimePercentage: 0,
                fullWeek: false,
            };
        }

        const requestedStart = now - WEEK_MS;
        const trackedSince = Number.isFinite(record.trackedSince) ? record.trackedSince : events[0].at;
        let windowStart = Math.max(requestedStart, trackedSince, events[0].at);
        let currentAvailability = events[0].available;

        for (const event of events) {
            if (event.at > windowStart) break;
            currentAvailability = event.available;
        }

        let cursor = windowStart;
        let uptimeMs = 0;
        let downtimeMs = 0;

        for (const event of events) {
            if (event.at <= windowStart || event.at > now) continue;
            const duration = event.at - cursor;
            if (currentAvailability) uptimeMs += duration;
            else downtimeMs += duration;
            currentAvailability = event.available;
            cursor = event.at;
        }

        const finalDuration = Math.max(0, now - cursor);
        if (currentAvailability) uptimeMs += finalDuration;
        else downtimeMs += finalDuration;

        const trackedMs = Math.max(0, now - windowStart);
        return {
            uptimeMs,
            downtimeMs,
            trackedMs,
            uptimePercentage: trackedMs ? (uptimeMs / trackedMs) * 100 : 0,
            downtimePercentage: trackedMs ? (downtimeMs / trackedMs) * 100 : 0,
            fullWeek: trackedSince <= requestedStart,
        };
    }

    async resolveTextChannel(channelId) {
        if (!channelId) return null;

        try {
            const channel = await this.client.channels.fetch(channelId);
            if (!channel?.isTextBased() || channel.guildId !== this.config.GUILD_ID) return null;
            return channel;
        } catch {
            return null;
        }
    }

    async resolveStatusChannel(fallbackChannel = null) {
        const configuredChannel = await this.resolveTextChannel(this.config.STATUS_CHANNEL_ID);
        if (configuredChannel) return configuredChannel;

        const panelChannel = await this.resolveTextChannel(this.data.panel?.channelId);
        if (panelChannel) return panelChannel;

        if (
            fallbackChannel?.isTextBased()
            && fallbackChannel.guildId === this.config.GUILD_ID
        ) {
            return fallbackChannel;
        }

        return null;
    }

    getPanelReference() {
        if (!this.data.panel) return null;
        return { ...this.data.panel };
    }

    setPanelReference(channelId, messageId) {
        this.data.panel = { channelId, messageId };
        this.queueSave();
    }

    async fetchPanelMessage() {
        if (!this.data.panel?.channelId || !this.data.panel?.messageId) return null;

        const channel = await this.resolveTextChannel(this.data.panel.channelId);
        if (!channel?.messages) return null;

        try {
            return await channel.messages.fetch(this.data.panel.messageId);
        } catch {
            return null;
        }
    }
}

let activeMonitor = null;

async function startBotMonitor(client, config, setup) {
    if (activeMonitor) return activeMonitor;
    activeMonitor = new BotMonitor(client, config);

    try {
        if (typeof setup === 'function') setup(activeMonitor);
        await activeMonitor.start();
        return activeMonitor;
    } catch (error) {
        activeMonitor = null;
        throw error;
    }
}

function getBotMonitor() {
    return activeMonitor;
}

module.exports = {
    BotMonitor,
    formatDuration,
    getStatusLabel: (status) => STATUS_LABELS[normalizeStatus(status)],
    getBotMonitor,
    startBotMonitor,
};
