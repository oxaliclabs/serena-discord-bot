function parseList(value, fallback = []) {
    if (!value || !String(value).trim()) return [...fallback];
    return String(value)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

function parseMonitoredBots(value) {
    if (!value || !String(value).trim()) return [];

    let parsed;
    try {
        parsed = JSON.parse(value);
    } catch (error) {
        throw new Error(`MONITORED_BOTS must be valid JSON: ${error.message}`);
    }

    if (!Array.isArray(parsed)) {
        throw new TypeError('MONITORED_BOTS must be a JSON array.');
    }

    return parsed.map((bot, index) => {
        const name = String(bot?.name || '').trim();
        const id = String(bot?.id || '').trim();
        if (!name || !/^\d{17,20}$/.test(id)) {
            throw new TypeError(`MONITORED_BOTS entry ${index + 1} must contain a name and valid Discord user ID.`);
        }
        return { name, id };
    });
}

module.exports = {
    BOT_TOKEN: process.env.BOT_TOKEN || '',
    BOT_NAME: process.env.BOT_NAME || 'Serena',
    COMMUNITY_NAME: process.env.COMMUNITY_NAME || 'the community',
    OWNER_ID: parseList(process.env.OWNER_IDS || process.env.OWNER_ID),
    GUILD_ID: process.env.GUILD_ID || '',
    VOICE_CHANNEL_ID: process.env.VOICE_CHANNEL_ID || '',
    STATUS_CHANNEL_ID: process.env.STATUS_CHANNEL_ID || '',
    REVIEW_CHANNEL_ID: process.env.REVIEW_CHANNEL_ID || '',
    WELCOME_CHANNEL_ID: process.env.WELCOME_CHANNEL_ID || '',
    CHAT_CHANNEL_ID: process.env.CHAT_CHANNEL_ID || '',
    SUPPORT_URL: process.env.SUPPORT_URL || 'https://discord.com',
    WEBSITE_URL: process.env.WEBSITE_URL || 'https://example.com',
    TERMS_URL: process.env.TERMS_URL || 'https://example.com/terms',
    PRIVACY_URL: process.env.PRIVACY_URL || 'https://example.com/privacy',
    AI_PROVIDER: 'gemini',
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
    CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID || '',
    CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN || '',
    TAVILY_API_KEY: process.env.TAVILY_API_KEY || '',
    GEMINI_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    GEMINI_CHAT_MODEL: process.env.GEMINI_CHAT_MODEL || 'gemini-3.8-flash',
    GEMINI_FALLBACK_MODEL: process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash-lite',
    GEMINI_ROUTER_MODEL: process.env.GEMINI_ROUTER_MODEL || 'gemini-3.5-flash-lite',
    GEMINI_EMERGENCY_MODEL: process.env.GEMINI_EMERGENCY_MODEL || 'gemini-3.5-flash-lite',
    GEMINI_VISION_MODEL: process.env.GEMINI_VISION_MODEL || 'gemini-3.8-flash',
    GEMINI_WEB_MODEL: process.env.GEMINI_WEB_MODEL || 'gemini-3.8-flash',
    CLOUDFLARE_IMAGE_MODEL: process.env.CLOUDFLARE_IMAGE_MODEL || '@cf/black-forest-labs/flux-2-dev',
    CLOUDFLARE_IMAGE_QUALITY: process.env.CLOUDFLARE_IMAGE_QUALITY || 'high',
    ACTIVITIES: parseList(process.env.ACTIVITIES, [
        "Managing Oxalic Lab's",
        "Oxalic Lab's forge the future",
        "Building the future with Oxalic Lab's",
        "Powering projects at Oxalic Lab's",
        'Creating, coding and innovating',
        'Where ideas become reality',
        "Growing together at Oxalic Lab's",
        "Engineering what's next",
        'Driven by code, united by ideas',
        "Oxalic Lab's | Innovate. Build. Grow.",
    ]),
    MONITORED_BOTS: parseMonitoredBots(process.env.MONITORED_BOTS),
};
