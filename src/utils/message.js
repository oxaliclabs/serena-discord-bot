const ORIGINAL_WELCOME_MESSAGES = [
    'Welcome to {community}, {member}! Glad to have you here.',
    'Hey {member}, welcome to {community}! Make yourself at home.',
    '{member} just joined us — welcome to {community}!',
    'Welcome, {member}! Hope you have a great time at {community}.',
    'Good to see you, {member}. Welcome to {community}!',
    "A warm welcome to {member}! We're happy you're here.",
];

const WELCOME_OPENERS = [
    'Welcome to {community}, {member}!',
    'Hey {member}, welcome to {community}!',
    "Look who just arrived — {member}!",
    "Everyone say hello to {member}!",
    'A warm {community} welcome to {member}!',
    "Great to see you here, {member}!",
    "The server just got better — welcome, {member}!",
    "Glad you found us, {member}!",
    "New member alert: {member} is here!",
    "Welcome aboard, {member}!",
    "Make some room for {member}!",
    '{community} has a new face — {member}!',
    "Hey everyone, {member} just joined us!",
    "Step right in, {member}!",
    "Big welcome to {member}!",
    "The doors are open for {member}!",
    "Nice to meet you, {member}!",
    "Happy to have you with us, {member}!",
    "Our newest member is {member}!",
    "Welcome to the community, {member}!",
    "Good vibes for our new arrival, {member}!",
    "Say hey to {member}, everyone!",
    "A fresh hello to {member}!",
    "You made it, {member}!",
    "Welcome in, {member}!",
];

const WELCOME_CLOSERS = [
    "Glad to have you here.",
    "Make yourself at home.",
    "Hope you have a great time with us.",
    "Jump into the conversation whenever you like.",
    "We're happy you're here.",
    "Take a look around and enjoy the server.",
    "We hope you enjoy your stay.",
    "Settle in and have fun.",
    "The community is better with you in it.",
    "Feel free to say hello.",
    "There's always room for one more here.",
    "We can't wait to get to know you.",
    "Have fun exploring the server.",
    "You're among friends here.",
    "Hope your day is going wonderfully.",
    "Come hang out whenever you want.",
    "We're excited to have you around.",
    "Enjoy the chats and good company.",
    "Your seat is ready.",
    "Let the good times begin.",
];

const generatedWelcomeMessages = WELCOME_OPENERS.flatMap((opener) => (
    WELCOME_CLOSERS.map((closer) => `${opener} ${closer}`)
));

const WELCOME_MESSAGES = Object.freeze([
    ...new Set([...ORIGINAL_WELCOME_MESSAGES, ...generatedWelcomeMessages]),
].slice(0, 500));

function buildWelcomeMessage(memberId, random = Math.random, communityName = 'the community') {
    const index = Math.floor(random() * WELCOME_MESSAGES.length);
    const template = WELCOME_MESSAGES[Math.min(Math.max(index, 0), WELCOME_MESSAGES.length - 1)];
    return template
        .replaceAll('{member}', `<@${memberId}>`)
        .replaceAll('{community}', communityName);
}

module.exports = {
    WELCOME_MESSAGES,
    buildWelcomeMessage,
};
