const fs = require('fs');
const path = require('path');

const DEFAULT_DATA_FILE = path.join(__dirname, '..', '..', 'data', 'chat-memory.json');
const MAX_HISTORY_MESSAGES = 500;

function createEmptyData() {
    return {
        version: 1,
        channels: {},
    };
}

function cleanValue(value, fallback = '') {
    const cleaned = String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
    return cleaned || fallback;
}

function normalizeImage(image) {
    const url = cleanValue(image?.url);
    if (!url) return null;

    return {
        url,
        name: cleanValue(image?.name, 'image'),
        contentType: cleanValue(image?.contentType, 'image/unknown'),
    };
}

function normalizeUser(user) {
    if (!user || typeof user !== 'object') return null;

    return {
        id: cleanValue(user.id),
        username: cleanValue(user.username),
        globalName: cleanValue(user.globalName),
        displayName: cleanValue(user.displayName, user.globalName || user.username || 'member'),
    };
}

function normalizeRecord(record) {
    if (!record || !['user', 'assistant'].includes(record.role)) return null;

    return {
        id: cleanValue(record.id, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`),
        role: record.role,
        speaker: cleanValue(record.speaker, record.role === 'assistant' ? 'Serena' : 'member'),
        text: cleanValue(record.text),
        user: normalizeUser(record.user),
        replyTo: normalizeUser(record.replyTo),
        recipient: normalizeUser(record.recipient),
        mentions: Array.isArray(record.mentions)
            ? record.mentions.map(normalizeUser).filter(Boolean).slice(0, 25)
            : [],
        images: Array.isArray(record.images)
            ? record.images.map(normalizeImage).filter(Boolean).slice(0, 4)
            : [],
        createdAt: Number.isFinite(record.createdAt) ? record.createdAt : Date.now(),
    };
}

class ChatMemory {
    constructor(options = {}) {
        this.dataFile = options.dataFile || DEFAULT_DATA_FILE;
        this.maxMessages = options.maxMessages || MAX_HISTORY_MESSAGES;
        this.data = createEmptyData();
        this.saveQueue = Promise.resolve();
        this.loaded = false;
    }

    async load() {
        if (this.loaded) return this;

        try {
            const parsed = JSON.parse(await fs.promises.readFile(this.dataFile, 'utf8'));
            const channels = parsed?.channels && typeof parsed.channels === 'object'
                ? parsed.channels
                : {};

            for (const [channelId, records] of Object.entries(channels)) {
                if (!Array.isArray(records)) continue;
                this.data.channels[channelId] = records
                    .map(normalizeRecord)
                    .filter(Boolean)
                    .slice(-this.maxMessages);
            }
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error(`[Chatbot] Could not read saved memory: ${error.message}`);
            }
        }

        this.loaded = true;
        return this;
    }

    getHistory(channelId) {
        const records = this.data.channels[String(channelId)] || [];
        return records.map((record) => ({
            ...record,
            user: record.user ? { ...record.user } : null,
            replyTo: record.replyTo ? { ...record.replyTo } : null,
            recipient: record.recipient ? { ...record.recipient } : null,
            mentions: record.mentions.map((user) => ({ ...user })),
            images: record.images.map((image) => ({ ...image })),
        }));
    }

    async remember(channelId, record) {
        if (!this.loaded) await this.load();

        const normalized = normalizeRecord(record);
        if (!normalized) throw new TypeError('Chat memory record must have a valid role.');

        const key = String(channelId);
        const history = this.data.channels[key] || [];
        history.push(normalized);
        this.data.channels[key] = history.slice(-this.maxMessages);
        await this.queueSave();
        return normalized;
    }

    queueSave() {
        const snapshot = JSON.stringify(this.data, null, 2);
        const save = this.saveQueue
            .catch(() => {})
            .then(async () => {
                await fs.promises.mkdir(path.dirname(this.dataFile), { recursive: true });
                const temporaryFile = `${this.dataFile}.tmp`;
                await fs.promises.writeFile(temporaryFile, snapshot, 'utf8');
                await fs.promises.rename(temporaryFile, this.dataFile);
            });

        this.saveQueue = save;
        return save;
    }
}

module.exports = {
    ChatMemory,
    DEFAULT_DATA_FILE,
    MAX_HISTORY_MESSAGES,
    normalizeRecord,
};
