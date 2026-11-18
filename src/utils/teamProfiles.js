const TEAM_PROFILES = Object.freeze([
    {
        key: 'jasprit',
        name: 'Jasprit',
        aliases: ['jasprit', 'jas', 'python specialist', 'python developer', 'python expert'],
        id: '1410852730427277374',
        role: 'Secondary Developer',
        specialty: 'Python specialist',
        responsibilities: [
            'Finds and fixes bugs',
            'Works across multiple bot projects',
            'Implements development tasks assigned by Baldeep and Jot',
        ],
        contribution: 'Helps move assigned development work forward efficiently.',
    },
    {
        key: 'baldeep',
        name: 'Baldeep',
        aliases: ['baldeep', 'node.js', 'nodejs', 'bun', 'node specialist', 'bun specialist'],
        id: '899248852568272926',
        role: 'Primary Developer / Lead Developer',
        specialty: 'Node.js and Bun specialist',
        responsibilities: [
            'Sets the technical direction and development priorities',
            'Assigns tasks and guides the team',
            'Decides what the team should work on next',
        ],
        contribution: 'Leads the development workflow and provides direction to the team.',
    },
    {
        key: 'prabhjot',
        name: 'Prabhjot (Jot)',
        aliases: ['prabhjot', 'jot', 'ideas', 'idea person'],
        id: '1431213974547857448',
        role: 'Ideas and team contributor',
        specialty: 'New ideas and contributions across multiple areas',
        responsibilities: [
            'Suggests new ideas',
            'Helps in different areas of the team',
        ],
        contribution: 'The user describes Jot as a major contributor to the team’s progress.',
    },
]);

const TEAM_QUERY_TERMS = [
    'team', 'members', 'member', 'developers', 'developer', 'team kon',
    'team kaun', 'kaun kaun', 'who are', 'who is in', 'oxalic',
    'python', 'node', 'bun', 'specialist', 'speciality', 'role',
];

function normalizeTeamText(value) {
    return String(value || '').toLowerCase()
        .replace(/[’']/g, '')
        .replace(/[^a-z0-9\u0900-\u097f]+/g, ' ')
        .trim();
}

function getMentionedTeamProfiles(message) {
    const normalized = normalizeTeamText(message);
    if (!normalized) return [];
    const words = new Set(normalized.split(/\s+/));
    const matched = TEAM_PROFILES.filter((profile) => profile.aliases.some((alias) => {
        const term = normalizeTeamText(alias);
        return term.includes(' ')
            ? normalized.includes(term)
            : words.has(term);
    }));
    if (matched.length) return matched;

    const asksAboutTeam = TEAM_QUERY_TERMS.some((term) => {
        const normalizedTerm = normalizeTeamText(term);
        return normalizedTerm.includes(' ')
            ? normalized.includes(normalizedTerm)
            : words.has(normalizedTerm);
    });
    return asksAboutTeam ? [...TEAM_PROFILES] : [];
}

async function resolveTeamMember(guild, profile) {
    if (!guild?.members?.fetch) return null;
    try {
        const member = await guild.members.fetch(profile.id);
        return member?.user || null;
    } catch {
        return null;
    }
}

async function buildTeamContext(guild, message) {
    const profiles = getMentionedTeamProfiles(message);
    if (!profiles.length) return '';

    const entries = await Promise.all(profiles.map(async (profile) => {
        const user = await resolveTeamMember(guild, profile);
        const currentName = user?.globalName || user?.username || profile.name;
        const currentUsername = user?.username ? `@${user.username}` : 'username currently unavailable';
        return [
            `${profile.name} (current Discord display name: ${currentName}; current username: ${currentUsername}; Discord mention: <@${profile.id}>)`,
            `Role: ${profile.role}.`,
            `Speciality: ${profile.specialty}.`,
            `Responsibilities: ${profile.responsibilities.join('; ')}.`,
            `Contribution: ${profile.contribution}`,
        ].join(' ');
    }));

    return [
        'VERIFIED OXALIC LABS TEAM KNOWLEDGE (use only the relevant member entries):',
        ...entries,
        'When the user asks about one named member, answer about that member only. When they ask for the whole team or team members, cover all returned entries.',
        'Use the Discord mention exactly as provided so it renders as a visible tag. Never expose raw IDs in prose.',
        'Vary natural wording between answers but do not change facts or invent missing details.',
        'The current Discord name/username above was fetched live for this response. If unavailable, use the mention and known profile name; do not guess a username.',
    ].join('\n');
}

module.exports = {
    TEAM_PROFILES,
    getMentionedTeamProfiles,
    buildTeamContext,
};
