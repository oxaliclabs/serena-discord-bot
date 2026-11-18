const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { ChatMemory, MAX_HISTORY_MESSAGES } = require('../src/utils/chatMemory');
const {
    buildDiscordReplyPayload,
    buildChatMessages,
    compactChatMessages,
    extractResponseSources,
    extractResponseText,
    generateCloudflareImage,
    getMemoryFallbackReply,
    getModelCooldownRemaining,
    isArtifactRequest,
    isImageGenerationRequest,
    requestAdaptiveChatCompletion,
    runWebResearch,
    isWebSearchRequest,
    parseRetryAfterMilliseconds,
    selectContextHistory,
    shouldRespondToMessage,
} = require('../src/utils/chatbot');
const { createArtifactAttachments } = require('../src/utils/artifacts');
const {
    ALL_STATUS_MESSAGES,
    getStatusMessage,
} = require('../src/utils/chatStatus');
const { WELCOME_MESSAGES, buildWelcomeMessage } = require('../src/utils/message');
const { TEAM_PROFILES, getMentionedTeamProfiles, buildTeamContext } = require('../src/utils/teamProfiles');

test('provides 500 unique welcome messages in the dedicated module', () => {
    assert.equal(WELCOME_MESSAGES.length, 500);
    assert.equal(new Set(WELCOME_MESSAGES).size, 500);
    assert.match(buildWelcomeMessage('123', () => 0), /<@123>/);
});

test('chat memory persists and keeps only the configured number of messages', async (context) => {
    const temporaryDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'chiku-memory-'));
    const dataFile = path.join(temporaryDirectory, 'memory.json');
    context.after(() => fs.promises.rm(temporaryDirectory, { recursive: true, force: true }));

    const memory = new ChatMemory({ dataFile, maxMessages: 3 });
    await memory.load();

    for (let index = 0; index < 5; index += 1) {
        await memory.remember('channel', {
            id: String(index),
            role: index % 2 ? 'assistant' : 'user',
            speaker: index % 2 ? 'Chiku' : 'Member',
            text: `message ${index}`,
            recipient: index % 2 ? {
                id: '42',
                username: 'nova',
                displayName: 'Nova',
            } : null,
            createdAt: index,
        });
    }

    const reloaded = new ChatMemory({ dataFile, maxMessages: 3 });
    await reloaded.load();
    assert.deepEqual(reloaded.getHistory('channel').map((record) => record.text), [
        'message 2',
        'message 3',
        'message 4',
    ]);
    assert.equal(reloaded.getHistory('channel')[1].recipient.displayName, 'Nova');
    assert.equal(MAX_HISTORY_MESSAGES, 500);
});

test('Gemini input includes Discord identity and uploaded images', () => {
    const memory = {
        getHistory: () => [{
            role: 'user',
            text: 'Turn this into a painting',
            user: {
                id: '42',
                username: 'nova',
                globalName: 'Nova Ray',
                displayName: 'Nova',
            },
            mentions: [],
            images: [{
                url: 'https://cdn.discordapp.com/reference.png',
                name: 'reference.png',
                contentType: 'image/png',
            }],
        }],
    };

    const input = buildChatMessages('channel', memory);
    assert.match(input[1].content[0].text, /display name "Nova"/);
    assert.deepEqual(input[1].content[1], {
        type: 'image_url',
        image_url: { url: 'https://cdn.discordapp.com/reference.png' },
    });
});

test('extracts text and web citations from an Gemini response', () => {
    const result = {
        output_text: 'Finished.',
        output: [{
            type: 'web_search_call',
            action: {
                sources: [{ url: 'https://example.com/source' }],
            },
        }],
    };

    assert.equal(extractResponseText(result), 'Finished.');
    assert.deepEqual(extractResponseSources(result), ['https://example.com/source']);
});

test('uses Tavily search and the configured AI model to answer with source collection', async (context) => {
    const originalFetch = global.fetch;
    context.after(() => { global.fetch = originalFetch; });
    const requests = [];
    global.fetch = async (url, options) => {
        const body = JSON.parse(options.body);
        requests.push({ url, options, body });
        if (url === 'https://api.tavily.com/search') {
            return {
                ok: true,
                json: async () => ({
                    answer: 'A current summary.',
                    results: [{ title: 'Current source', url: 'https://example.com/current', content: 'Useful current facts.' }],
                }),
            };
        }
        return {
            ok: true,
            json: async () => ({ choices: [{ message: { content: 'Current answer.' } }] }),
        };
    };

    const result = await runWebResearch({
        AI_PROVIDER: 'gemini',
        GEMINI_API_KEY: 'test-key',
        GEMINI_WEB_MODEL: 'web-model',
        TAVILY_API_KEY: 'tavily-test-key',
    }, [
        { role: 'system', content: 'Use reliable sources.' },
        { role: 'user', content: 'What changed today?' },
    ]);

    assert.equal(requests[0].url, 'https://api.tavily.com/search');
    assert.equal(requests[0].body.api_key, 'tavily-test-key');
    assert.equal(requests[0].body.query, 'What changed today?');
    assert.equal(requests[1].url, 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
    assert.equal(requests[1].options.headers.Authorization, 'Bearer test-key');
    assert.equal(requests[1].body.model, 'web-model');
    assert.equal(requests[1].body.max_tokens, 2_500);
    assert.match(requests[1].body.messages.at(-1).content, /https:\/\/example\.com\/current/);
    assert.equal(extractResponseText(result), 'Current answer.');
    assert.deepEqual(extractResponseSources(result), ['https://example.com/current']);
});

test('generates images through the Cloudflare Workers AI endpoint', async (context) => {
    const originalFetch = global.fetch;
    context.after(() => { global.fetch = originalFetch; });
    let request;
    global.fetch = async (url, options) => {
        request = { url, options, body: options.body };
        return {
            ok: true,
            json: async () => ({ result: { image: Buffer.from('cloudflare-image').toString('base64') } }),
        };
    };

    const result = await generateCloudflareImage({
        AI_PROVIDER: 'cloudflare',
        CLOUDFLARE_ACCOUNT_ID: 'account-123',
        CLOUDFLARE_API_TOKEN: 'cloudflare-test-token',
        CLOUDFLARE_IMAGE_MODEL: '@cf/black-forest-labs/flux-2-dev',
    }, 'A soft watercolor landscape');

    assert.equal(request.url, 'https://api.cloudflare.com/client/v4/accounts/account-123/ai/run/@cf/black-forest-labs/flux-2-dev');
    assert.equal(request.options.headers.Authorization, 'Bearer cloudflare-test-token');
    assert.equal(request.body.get('prompt'), 'A soft watercolor landscape');
    assert.equal(request.body.get('width'), '1536');
    assert.equal(request.body.get('height'), '1024');
    assert.equal(request.body.get('steps'), '28');
    assert.equal(result.attachment.toString(), 'cloudflare-image');
    assert.match(result.name, /^serena-generated-\d+\.png$/);
});

test('retrieves a relevant older memory while keeping the latest conversation', () => {
    const history = [{
        id: 'old',
        role: 'user',
        speaker: 'Nova',
        text: 'The private launch codename is mango orbit.',
    }];
    for (let index = 0; index < 40; index += 1) {
        history.push({
            id: `filler-${index}`,
            role: index % 2 ? 'assistant' : 'user',
            speaker: index % 2 ? 'Chiku' : 'Nova',
            text: `Unrelated discussion ${index} ${'filler '.repeat(10)}`,
        });
    }
    history.push({
        id: 'latest',
        role: 'user',
        speaker: 'Nova',
        text: 'What was the mango launch codename?',
    });

    const selected = selectContextHistory(history, 900);
    assert.ok(selected.some((record) => record.id === 'old'));
    assert.equal(selected.at(-1).id, 'latest');
});

test('compacts oversized model input while preserving relevant memory', () => {
    const messages = [
        { role: 'system', content: 'System instructions.' },
        { role: 'user', content: 'The community project codename is Crimson Mango.' },
        ...Array.from({ length: 12 }, (_, index) => ({
            role: index % 2 ? 'assistant' : 'user',
            content: `Unrelated filler ${index} ${'noise '.repeat(80)}`,
        })),
        { role: 'user', content: 'What was the community project codename?' },
    ];

    const compacted = compactChatMessages(messages, 900);
    assert.equal(compacted[0].role, 'system');
    assert.ok(compacted.some((message) => message.content.includes('Crimson Mango')));
    assert.equal(compacted.at(-1).content, 'What was the community project codename?');
    assert.ok(compacted.length < messages.length);
});

test('local resilience can recall saved facts when every model is down', () => {
    const memory = {
        getHistory: () => [
            { role: 'user', text: 'Remember that the community project codename is Crimson Mango.' },
            { role: 'assistant', text: 'Got it.' },
            { role: 'user', text: 'Tell me the community project codename.' },
        ],
    };

    assert.match(
        getMemoryFallbackReply(memory, 'dm-channel', 'Tell me the community project codename.'),
        /Crimson Mango/i,
    );
});

test('routes explicit web and image requests to paid Gemini tools', () => {
    assert.equal(isWebSearchRequest('Search the web for the latest Node release'), true);
    assert.equal(isWebSearchRequest('Can you search a website and rate top.gg?'), true);
    assert.equal(isImageGenerationRequest('Create an image of a neon tiger'), true);
    assert.equal(isImageGenerationRequest('Paint a neon tiger in watercolor'), true);
    assert.equal(isImageGenerationRequest('Turn this into a watercolor', [{ url: 'reference' }]), true);
});

test('provides hundreds of compact rotating progress messages', () => {
    assert.ok(ALL_STATUS_MESSAGES.length > 300);
    assert.equal(new Set(ALL_STATUS_MESSAGES).size, ALL_STATUS_MESSAGES.length);
    const status = getStatusMessage('searching', () => 0);
    assert.match(status, /Searching the web/);
    assert.equal(status.split('\n').length, 1);
    assert.ok(status.startsWith('-# ✦'));
});

test('recognizes general file and project requests without hijacking explanations', () => {
    assert.equal(isArtifactRequest('Make index.html and index.css and give me the ZIP'), true);
    assert.equal(isArtifactRequest('I want an actual zip, not response.txt'), true);
    assert.equal(isArtifactRequest('Build a small website project from this screenshot'), true);
    assert.equal(isArtifactRequest('Send me a config.json file'), true);
    assert.equal(isArtifactRequest('Create a downloadable report.pdf'), true);
    assert.equal(isArtifactRequest('Tell me the community project codename'), false);
    assert.equal(isArtifactRequest('How does ZIP compression work?'), false);
    assert.equal(isArtifactRequest('Generate an image of a tiger'), false);
    assert.equal(isImageGenerationRequest('Build a website from this screenshot', [{}]), false);
});

test('creates real single-file and multi-file ZIP attachments', () => {
    const single = createArtifactAttachments({
        delivery: 'file',
        files: [{ path: 'config.json', content: '{"enabled":true}' }],
    });
    assert.equal(single.bundled, false);
    assert.equal(single.attachments[0].name, 'config.json');
    assert.equal(single.attachments[0].attachment.toString('utf8'), '{"enabled":true}');

    const bundle = createArtifactAttachments({
        delivery: 'zip',
        archiveName: 'HelloWorldProject.zip',
        files: [
            { path: 'index.html', content: '<h1>Hello World</h1>' },
            { path: 'assets/index.css', content: 'h1 { color: gold; }' },
        ],
    });
    assert.equal(bundle.bundled, true);
    assert.equal(bundle.attachments[0].name, 'HelloWorldProject.zip');
    assert.equal(bundle.attachments[0].attachment.subarray(0, 4).toString('hex'), '504b0304');
    assert.match(bundle.attachments[0].attachment.toString('utf8'), /index\.html/);
    assert.match(bundle.attachments[0].attachment.toString('utf8'), /assets\/index\.css/);

    assert.throws(() => createArtifactAttachments({
        delivery: 'file',
        files: [{ path: 'fake.pdf', content: 'This is not really a PDF.' }],
    }), /binary format/i);
});

test('never leaks private response mode directives when the model repeats them mid-reply', () => {
    const delivery = buildDiscordReplyPayload({
        text: 'Here is the answer. [[MODE:chat]] This is the next sentence.',
        images: [],
    });
    assert.equal(delivery.payload.content, 'Here is the answer.  This is the next sentence.');
    assert.doesNotMatch(delivery.payload.content, /\[\[MODE:/i);
});

test('delivers oversized model responses as response.txt without truncating them', () => {
    const longResponse = `[[MODE:detailed]]\n${'Detailed answer. '.repeat(300)}`;
    const delivery = buildDiscordReplyPayload({ text: longResponse, images: [] });

    assert.match(delivery.payload.content, /response\.txt/i);
    assert.equal(delivery.payload.files[0].name, 'response.txt');
    assert.equal(delivery.payload.files[0].attachment.toString('utf8'), delivery.text);
    assert.ok(delivery.text.length > 2_000);
});

test('puts a long readable response into one normal Discord embed', () => {
    const longResponse = `[[MODE:detailed]]\n${'A useful detailed answer. '.repeat(70)}`;
    const delivery = buildDiscordReplyPayload({ text: longResponse, images: [] });

    assert.equal(delivery.payload.content, null);
    assert.equal(delivery.payload.embeds.length, 1);
    assert.equal(delivery.payload.embeds[0].description, delivery.text);
    assert.equal(delivery.payload.files, undefined);
});

test('turns a long single code block into a usable source-code attachment', () => {
    const source = `const value = 42;\n${'console.log(value);\n'.repeat(150)}`.trim();
    const delivery = buildDiscordReplyPayload({
        text: `[[MODE:code]]\n\`\`\`javascript\n${source}\n\`\`\``,
        images: [],
    });

    assert.equal(delivery.payload.files[0].name, 'serena-code.js');
    assert.equal(delivery.payload.files[0].attachment.toString('utf8'), source);
});

test('edits a reply-to status into the final chatbot response', async (context) => {
    const temporaryDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'chiku-reply-'));
    context.after(() => fs.promises.rm(temporaryDirectory, { recursive: true, force: true }));
    const memory = new ChatMemory({ dataFile: path.join(temporaryDirectory, 'memory.json') });
    await memory.load();

    const edits = [];
    const sentMessage = {
        id: 'assistant-message',
        attachments: new Map(),
        createdTimestamp: Date.now(),
    };
    const statusMessage = {
        edit: async (payload) => {
            edits.push(payload);
            return payload.content?.startsWith('-#') ? statusMessage : sentMessage;
        },
        delete: async () => {},
    };
    let replyCount = 0;
    const message = {
        author: { bot: false, id: '42', username: 'nova', globalName: 'Nova' },
        member: { displayName: 'Nova' },
        webhookId: null,
        system: false,
        guildId: 'guild',
        channelId: 'chat',
        content: 'Chiku, hello',
        attachments: new Map(),
        reference: null,
        mentions: { members: new Map() },
        createdTimestamp: Date.now(),
        id: 'user-message',
        channel: { sendTyping: async () => {} },
        reply: async () => {
            replyCount += 1;
            return statusMessage;
        },
    };

    await require('../src/utils/chatbot').handleChatMessage({
        BOT_NAME: 'Chiku',
        GUILD_ID: 'guild',
        CHAT_CHANNEL_ID: 'chat',
        CLOUDFLARE_ACCOUNT_ID: 'account-123',
        CLOUDFLARE_API_TOKEN: '',
    }, message, memory);

    assert.equal(replyCount, 1);
    assert.ok(edits.some((payload) => !payload.content?.startsWith('-#')));
    assert.equal(memory.getHistory('chat').length, 2);
});

test('DMs always receive a response without guild participation routing', async (context) => {
    const temporaryDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'chiku-dm-'));
    context.after(() => fs.promises.rm(temporaryDirectory, { recursive: true, force: true }));
    const memory = new ChatMemory({ dataFile: path.join(temporaryDirectory, 'memory.json') });
    await memory.load();

    const sentMessage = {
        id: 'dm-assistant-message',
        attachments: new Map(),
        createdTimestamp: Date.now(),
    };
    const statusMessage = {
        edit: async (payload) => (payload.content?.startsWith('-#') ? statusMessage : sentMessage),
        delete: async () => {},
    };
    let replyCount = 0;
    const message = {
        author: { bot: false, id: 'dm-user', username: 'nova', globalName: 'Nova' },
        member: null,
        webhookId: null,
        system: false,
        guildId: null,
        guild: null,
        channelId: 'dm-channel',
        content: 'hello from DM',
        attachments: new Map(),
        reference: null,
        mentions: {},
        createdTimestamp: Date.now(),
        id: 'dm-user-message',
        channel: {
            isDMBased: () => true,
            sendTyping: async () => {},
        },
        reply: async () => {
            replyCount += 1;
            return statusMessage;
        },
    };

    await require('../src/utils/chatbot').handleChatMessage({
        BOT_NAME: 'Chiku',
        GUILD_ID: 'guild',
        CHAT_CHANNEL_ID: 'chat',
        CLOUDFLARE_ACCOUNT_ID: 'account-123',
        CLOUDFLARE_API_TOKEN: '',
    }, message, memory);

    assert.equal(replyCount, 1);
    assert.equal(memory.getHistory('dm-channel').length, 2);
});

test('oversized Gemini input is compacted before switching to a backup model', async (context) => {
    const originalFetch = global.fetch;
    context.after(() => { global.fetch = originalFetch; });
    const requests = [];
    global.fetch = async (_url, options) => {
        requests.push(JSON.parse(options.body));
        if (requests.length < 3) {
            return {
                ok: false,
                status: 413,
                json: async () => ({ error: { message: 'Request too large on input tokens' } }),
            };
        }
        return {
            ok: true,
            json: async () => ({ choices: [{ message: { content: 'Recovered.' } }] }),
        };
    };

    const messages = [
        { role: 'system', content: 'System.' },
        ...Array.from({ length: 16 }, (_, index) => ({
            role: index % 2 ? 'assistant' : 'user',
            content: `Long history ${index}: ${'context '.repeat(120)}`,
        })),
        { role: 'user', content: 'What was the project codename?' },
    ];
    const result = await requestAdaptiveChatCompletion({
        CLOUDFLARE_ACCOUNT_ID: 'account-123',
        GEMINI_API_KEY: 'test-key',
        GEMINI_FALLBACK_MODEL: 'fallback-model',
        GEMINI_ROUTER_MODEL: 'router-model',
    }, messages, {
        model: 'primary-model',
        maxTokens: 200,
    });

    assert.equal(result.model, 'fallback-model');
    assert.equal(requests.length, 3);
    assert.equal(requests[0].model, 'primary-model');
    assert.equal(requests[2].model, 'fallback-model');
    assert.equal(requests[2].reasoning_effort, 'low');
    assert.equal(requests[2].max_tokens, 200);
    assert.ok(JSON.stringify(requests[1].messages).length < JSON.stringify(requests[0].messages).length);
});

test('rate-limited models enter cooldown and are skipped on the next request', async (context) => {
    const originalFetch = global.fetch;
    context.after(() => { global.fetch = originalFetch; });
    const requestedModels = [];
    global.fetch = async (_url, options) => {
        const body = JSON.parse(options.body);
        requestedModels.push(body.model);
        if (body.model === 'cooldown-primary') {
            return {
                ok: false,
                status: 429,
                headers: { get: (name) => (name === 'retry-after' ? '30' : null) },
                json: async () => ({ error: { message: 'Rate limit reached' } }),
            };
        }
        return {
            ok: true,
            json: async () => ({ choices: [{ message: { content: 'Backup response.' } }] }),
        };
    };

    const config = {
        CLOUDFLARE_ACCOUNT_ID: 'account-123',
        GEMINI_API_KEY: 'test-key',
        GEMINI_FALLBACK_MODEL: 'cooldown-backup',
        GEMINI_ROUTER_MODEL: 'cooldown-backup',
    };
    const messages = [
        { role: 'system', content: 'System.' },
        { role: 'user', content: 'Hello.' },
    ];

    await requestAdaptiveChatCompletion(config, messages, { model: 'cooldown-primary' });
    await requestAdaptiveChatCompletion(config, messages, { model: 'cooldown-primary' });

    assert.deepEqual(requestedModels, [
        'cooldown-primary',
        'cooldown-backup',
        'cooldown-backup',
    ]);
    assert.ok(getModelCooldownRemaining('cooldown-primary') > 0);
    assert.equal(parseRetryAfterMilliseconds('Please try again in 23m19.2'), 1_399_200);
});

test('participation model can keep Chiku silent during member conversation', async (context) => {
    const originalFetch = global.fetch;
    context.after(() => { global.fetch = originalFetch; });
    let requestCount = 0;
    global.fetch = async () => {
        requestCount += 1;
        return {
            ok: true,
            json: async () => ({
                choices: [{
                    message: {
                        content: '{"respond":false,"confidence":0.96,"addressedTo":"human","intent":"continuation","reason":"member_conversation"}',
                    },
                }],
            }),
        };
    };

    const decision = await shouldRespondToMessage({
        BOT_NAME: 'Chiku',
        CLOUDFLARE_ACCOUNT_ID: 'account-123',
        GEMINI_API_KEY: 'test-key',
        GEMINI_ROUTER_MODEL: 'participation-router',
    }, {
        channelId: 'chat',
        content: 'yeah, that is the person I meant',
        client: { user: { id: 'bot' } },
        attachments: new Map(),
        mentions: { users: new Map() },
    }, {
        getHistory: () => [
            { role: 'user', speaker: 'Nova', text: 'Do you know Dhruv?' },
            { role: 'user', speaker: 'Onyx', text: 'yeah, that is the person I meant' },
        ],
    });

    assert.equal(requestCount, 1);
    assert.equal(decision.respond, false);
    assert.equal(decision.addressedTo, 'human');
    assert.equal(decision.source, 'model');
});

test('direct mentions remain reliable when the participation model is unavailable', async () => {
    const decision = await shouldRespondToMessage({
        BOT_NAME: 'Chiku',
        CLOUDFLARE_ACCOUNT_ID: 'account-123',
        CLOUDFLARE_API_TOKEN: '',
    }, {
        channelId: 'chat',
        content: '<@bot> can you help?',
        client: { user: { id: 'bot' } },
        attachments: new Map(),
        mentions: {
            users: new Map([['bot', { id: 'bot', bot: true }]]),
        },
    }, { getHistory: () => [] });

    assert.equal(decision.respond, true);
    assert.equal(decision.source, 'local_fallback');
});

test('a standalone greeting after a quiet gap invites Chiku', async () => {
    const now = Date.now();
    const decision = await shouldRespondToMessage({
        BOT_NAME: 'Chiku',
        CLOUDFLARE_ACCOUNT_ID: 'account-123',
        CLOUDFLARE_API_TOKEN: '',
    }, {
        author: { id: 'onyx', username: 'onyx' },
        member: { displayName: 'Onyx' },
        createdTimestamp: now,
        channelId: 'chat',
        content: 'hey',
        client: { user: { id: 'bot' } },
        attachments: new Map(),
        mentions: { users: new Map() },
    }, {
        getHistory: () => [
            {
                role: 'user',
                speaker: 'Onyx',
                user: { id: 'onyx', displayName: 'Onyx' },
                text: '@Shadow 💀',
                createdAt: now - (33 * 60_000),
                mentions: [{ id: 'shadow', displayName: 'Shadow' }],
            },
            {
                role: 'user',
                speaker: 'Onyx',
                user: { id: 'onyx', displayName: 'Onyx' },
                text: 'hey',
                createdAt: now,
                mentions: [],
            },
        ],
    });

    assert.equal(decision.respond, true);
    assert.equal(decision.intent, 'greeting');
});

test('the same greeting stays silent during rapid human conversation', async () => {
    const now = Date.now();
    const decision = await shouldRespondToMessage({
        BOT_NAME: 'Chiku',
        CLOUDFLARE_ACCOUNT_ID: 'account-123',
        CLOUDFLARE_API_TOKEN: '',
    }, {
        author: { id: 'onyx', username: 'onyx' },
        member: { displayName: 'Onyx' },
        createdTimestamp: now,
        channelId: 'chat',
        content: 'hey',
        client: { user: { id: 'bot' } },
        attachments: new Map(),
        mentions: { users: new Map() },
    }, {
        getHistory: () => [
            {
                role: 'user',
                speaker: 'Shadow',
                user: { id: 'shadow', displayName: 'Shadow' },
                text: 'are you joining?',
                createdAt: now - 15_000,
                mentions: [],
            },
            {
                role: 'user',
                speaker: 'Onyx',
                user: { id: 'onyx', displayName: 'Onyx' },
                text: 'hey',
                createdAt: now,
                mentions: [],
            },
        ],
    });

    assert.equal(decision.respond, false);
});

test('active-human guard overrides an intrusive model decision', async (context) => {
    const originalFetch = global.fetch;
    context.after(() => { global.fetch = originalFetch; });
    global.fetch = async () => ({
        ok: true,
        json: async () => ({
            choices: [{
                message: {
                    content: '{"respond":true,"confidence":0.9,"addressedTo":"channel","intent":"greeting","reason":"open greeting"}',
                },
            }],
        }),
    });

    const now = Date.now();
    const decision = await shouldRespondToMessage({
        BOT_NAME: 'Chiku',
        CLOUDFLARE_ACCOUNT_ID: 'account-123',
        GEMINI_API_KEY: 'test-key',
        GEMINI_ROUTER_MODEL: 'guard-router',
    }, {
        author: { id: 'onyx', username: 'onyx' },
        member: { displayName: 'Onyx' },
        createdTimestamp: now,
        channelId: 'chat',
        content: 'hey',
        client: { user: { id: 'bot' } },
        attachments: new Map(),
        mentions: { users: new Map() },
    }, {
        getHistory: () => [
            {
                role: 'user',
                speaker: 'Shadow',
                user: { id: 'shadow', displayName: 'Shadow' },
                text: 'are you joining?',
                createdAt: now - 10_000,
                mentions: [],
            },
            {
                role: 'user',
                speaker: 'Onyx',
                user: { id: 'onyx', displayName: 'Onyx' },
                text: 'hey',
                createdAt: now,
                mentions: [],
            },
        ],
    });

    assert.equal(decision.respond, false);
    assert.equal(decision.source, 'hybrid_guard');
});


test('recognizes individual Oxalic Labs team members and full-team questions', () => {
    assert.deepEqual(getMentionedTeamProfiles('Baldeep ke baare mein batao').map((item) => item.key), ['baldeep']);
    assert.deepEqual(getMentionedTeamProfiles('Who is the Python specialist?').map((item) => item.key), ['jasprit']);
    assert.deepEqual(getMentionedTeamProfiles('Jot ka role kya hai?').map((item) => item.key), ['prabhjot']);
    assert.deepEqual(getMentionedTeamProfiles('Oxalic Labs team members kaun hain?').map((item) => item.key), ['jasprit', 'baldeep', 'prabhjot']);
    assert.equal(TEAM_PROFILES.length, 3);
});

test('builds team context with live Discord usernames and non-pinging mention tags', async () => {
    const guild = {
        members: {
            fetch: async (id) => ({
                user: {
                    id,
                    username: `updated_${id}`,
                    globalName: `Updated ${id}`,
                },
            }),
        },
    };
    const context = await buildTeamContext(guild, 'Tell me about Baldeep');
    assert.match(context, /updated_899248852568272926/);
    assert.match(context, /<@899248852568272926>/);
    assert.match(context, /Node.js and Bun specialist/);
    assert.doesNotMatch(context, /<@1410852730427277374>/);
});

test('team context gracefully falls back when live member lookup is unavailable', async () => {
    const context = await buildTeamContext({ members: { fetch: async () => { throw new Error('missing'); } } }, 'Jasprit kaun hai?');
    assert.match(context, /Jasprit/);
    assert.match(context, /<@1410852730427277374>/);
    assert.match(context, /username currently unavailable/);
});
