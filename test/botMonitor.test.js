const test = require('node:test');
const assert = require('node:assert/strict');
const { BotMonitor } = require('../src/utils/botMonitor');

function makeMonitor(presences = new Map()) {
    const bot = { name: 'Hydrogen', id: '1516109847358079050' };
    const guild = { presences: { cache: presences } };
    const client = { guilds: { cache: new Map([['guild-id', guild]]) } };
    const monitor = new BotMonitor(client, {
        GUILD_ID: 'guild-id',
        MONITORED_BOTS: [bot],
    });
    monitor.data = {
        version: 1,
        panel: null,
        bots: {
            [bot.id]: {
                status: 'online',
                available: true,
                changedAt: 100,
                statusChangedAt: 100,
                trackedSince: 100,
                events: [{ at: 100, available: true }],
            },
        },
    };
    return { monitor, bot };
}

test('online, idle and DND are all available; only offline is unavailable', async () => {
    const { monitor, bot } = makeMonitor();
    const transitions = [];
    monitor.on('transition', (event) => transitions.push(event));

    await monitor.recordStatus(bot.id, 'idle');
    await monitor.recordStatus(bot.id, 'dnd');
    assert.equal(transitions.length, 0);
    assert.equal(monitor.getSnapshot(bot.id).available, true);

    await monitor.recordStatus(bot.id, 'offline');
    assert.equal(transitions.length, 1);
    assert.equal(transitions[0].available, false);
});

test('reconcile ignores missing presence cache entries instead of falsely marking offline', async () => {
    const { monitor, bot } = makeMonitor(new Map());
    const transitions = [];
    monitor.on('transition', (event) => transitions.push(event));

    await monitor.reconcile();

    assert.equal(monitor.getSnapshot(bot.id).status, 'online');
    assert.equal(monitor.getSnapshot(bot.id).available, true);
    assert.equal(transitions.length, 0);
});
