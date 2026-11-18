const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_ACTIVITIES, toBoldUnicode, getActivityMessages, buildCustomStatus } = require('../src/utils/presence');

test('converts Latin letters and digits to bold Unicode while preserving punctuation', () => {
    assert.equal(toBoldUnicode("Oxalic Lab's 2026!"), "𝗢𝘅𝗮𝗹𝗶𝗰 𝗟𝗮𝗯'𝘀 𝟮𝟬𝟮𝟲!");
});

test('uses configured activity messages when provided', () => {
    assert.deepEqual(getActivityMessages(['One', ' Two ']), ['One', 'Two']);
});

test('falls back to branded rotating messages', () => {
    assert.deepEqual(getActivityMessages([]), DEFAULT_ACTIVITIES);
    assert.ok(DEFAULT_ACTIVITIES.some((message) => message.includes("Oxalic Lab's")));
});

test('builds a Discord Custom Status bubble instead of a Playing activity', () => {
    assert.deepEqual(buildCustomStatus('Driven by code'), {
        name: 'Custom Status',
        state: '𝗗𝗿𝗶𝘃𝗲𝗻 𝗯𝘆 𝗰𝗼𝗱𝗲',
        type: 4,
    });
});
