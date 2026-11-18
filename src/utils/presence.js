const DEFAULT_ACTIVITIES = [
    "Managing Oxalic Lab's",
    "Oxalic Lab's forge the future",
    "Building the future with Oxalic Lab's",
    "Powering projects at Oxalic Lab's",
    "Creating, coding and innovating",
    "Where ideas become reality",
    "Growing together at Oxalic Lab's",
    "Engineering what's next",
    "Driven by code, united by ideas",
    "Oxalic Lab's | Innovate. Build. Grow.",
];

function toBoldUnicode(value) {
    return Array.from(String(value), (character) => {
        const code = character.codePointAt(0);
        if (code >= 0x41 && code <= 0x5A) return String.fromCodePoint(0x1D5D4 + code - 0x41);
        if (code >= 0x61 && code <= 0x7A) return String.fromCodePoint(0x1D5EE + code - 0x61);
        if (code >= 0x30 && code <= 0x39) return String.fromCodePoint(0x1D7EC + code - 0x30);
        return character;
    }).join('');
}

function getActivityMessages(configuredActivities = []) {
    const messages = configuredActivities.map((item) => String(item).trim()).filter(Boolean);
    return messages.length ? messages : [...DEFAULT_ACTIVITIES];
}

// Discord renders ActivityType.Custom as a status bubble without a 'Playing' label.
function buildCustomStatus(message) {
    return { name: 'Custom Status', state: toBoldUnicode(message), type: 4 };
}

module.exports = { DEFAULT_ACTIVITIES, toBoldUnicode, getActivityMessages, buildCustomStatus };
