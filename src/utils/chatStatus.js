const STATUS_PARTS = Object.freeze({
    thinking: {
        icon: '🧠',
        title: 'Thinking it through',
        activity: 'reasoning pass',
        actions: ['Thinking this through', 'Working through the request', 'Planning the best answer', 'Connecting the details', 'Considering the context', 'Reasoning through it'],
        details: ['carefully', 'with the conversation in mind', 'step by step', 'from a few angles'],
    },
    planning: {
        icon: '🧭',
        title: 'Planning the answer',
        activity: 'answer map',
        actions: ['Mapping out the response', 'Choosing the best approach', 'Breaking the request into steps', 'Planning a useful answer', 'Setting the answer direction', 'Organizing the approach'],
        details: ['around your goal', 'before getting into the details', 'with clarity in mind', 'for the strongest result'],
    },
    memory: {
        icon: '🗂️',
        title: 'Checking memory',
        activity: 'conversation context',
        actions: ['Checking our conversation', 'Looking through recent context', 'Recalling the useful details', 'Reviewing what was said', 'Connecting this to earlier messages', 'Searching my memory'],
        details: ['for relevant details', 'so nothing important is missed', 'before answering', 'for the right context'],
    },
    searching: {
        icon: '🔎',
        title: 'Searching the web',
        activity: 'live web scan',
        actions: ['Searching the web', 'Looking for current sources', 'Running a live search', 'Finding reliable information', 'Checking what is current', 'Scanning online sources'],
        details: ['for the latest information', 'across reliable sources', 'for useful evidence', 'with live web tools'],
    },
    browsing: {
        icon: '🌐',
        title: 'Reading live sources',
        activity: 'source review',
        actions: ['Opening useful results', 'Inspecting the website', 'Reading the strongest sources', 'Checking relevant pages', 'Following the best leads', 'Browsing the available evidence'],
        details: ['for concrete details', 'beyond the headlines', 'to verify the answer', 'for pros and cons'],
    },
    researching: {
        icon: '📚',
        title: 'Researching deeply',
        activity: 'evidence pass',
        actions: ['Researching the topic', 'Comparing the evidence', 'Cross-checking key claims', 'Evaluating the available information', 'Building a sourced answer', 'Digging deeper'],
        details: ['before drawing conclusions', 'across multiple sources', 'for a balanced result', 'with accuracy in mind'],
    },
    verifying: {
        icon: '🛡️',
        title: 'Verifying the details',
        activity: 'accuracy check',
        actions: ['Verifying the important claims', 'Checking the facts', 'Reviewing source agreement', 'Testing the conclusion', 'Looking for missing context', 'Validating the evidence'],
        details: ['before answering', 'against the available sources', 'for possible contradictions', 'with accuracy in mind'],
    },
    analyzing: {
        icon: '📊',
        title: 'Analyzing the findings',
        activity: 'analysis pass',
        actions: ['Analyzing the findings', 'Making sense of the results', 'Weighing the tradeoffs', 'Organizing the important points', 'Checking the reasoning', 'Turning evidence into an answer'],
        details: ['carefully', 'for a clear conclusion', 'without losing the nuance', 'into something useful'],
    },
    synthesizing: {
        icon: '🧩',
        title: 'Building the answer',
        activity: 'synthesis pass',
        actions: ['Combining the useful details', 'Building the final explanation', 'Connecting the strongest points', 'Turning the work into an answer', 'Distilling the important parts', 'Assembling the response'],
        details: ['into one clear result', 'without losing key details', 'around your exact request', 'in the most useful order'],
    },
    coding: {
        icon: '💻',
        title: 'Working on the code',
        activity: 'code workspace',
        actions: ['Working through the code', 'Designing the solution', 'Checking the technical details', 'Tracing the logic', 'Building a robust answer', 'Reviewing the implementation'],
        details: ['for edge cases', 'step by step', 'with correctness in mind', 'before formatting the code'],
    },
    reading_image: {
        icon: '👁️',
        title: 'Understanding the image',
        activity: 'visual inspection',
        actions: ['Inspecting the uploaded image', 'Reading the visual details', 'Understanding the scene', 'Looking closely at the image', 'Identifying the important elements', 'Studying the visual context'],
        details: ['for useful details', 'with your request in mind', 'before responding', 'for composition and meaning'],
    },
    creating_image: {
        icon: '🎨',
        title: 'Designing your image',
        activity: 'visual design',
        actions: ['Designing your image', 'Building the visual concept', 'Composing the scene', 'Preparing the art prompt', 'Turning the idea into a visual', 'Planning the image'],
        details: ['with the requested style', 'around your description', 'with composition in mind', 'for a polished result'],
    },
    refining_image: {
        icon: '🪄',
        title: 'Refining the reference',
        activity: 'reference study',
        actions: ['Studying the reference image', 'Refining the visual direction', 'Matching the reference details', 'Translating the reference into a prompt', 'Preserving the important features', 'Preparing the image transformation'],
        details: ['while applying your changes', 'with the original details in mind', 'for a faithful result', 'before rendering'],
    },
    rendering_image: {
        icon: '✨',
        title: 'Rendering the image',
        activity: 'community render',
        actions: ['Rendering the image', 'Sending the image to the community workers', 'Generating the visual', 'Waiting for an image worker', 'Bringing the image together', 'Processing the final artwork'],
        details: ['this can take a little while', 'through the community generation queue', 'at full available quality', 'with the chosen style'],
    },
    retrying: {
        icon: '🔄',
        title: 'Trying another route',
        activity: 'backup engine',
        actions: ['Trying another model', 'Switching to a backup route', 'Recovering the request', 'Finding another way through', 'Retrying with a different engine', 'Keeping the request moving'],
        details: ['after a busy response', 'without losing your request', 'through the backup route', 'for a reliable result'],
    },
    formatting: {
        icon: '✍️',
        title: 'Polishing the response',
        activity: 'final polish',
        actions: ['Formatting the response', 'Choosing the clearest presentation', 'Preparing the final answer', 'Organizing the response', 'Polishing the wording', 'Packaging the result'],
        details: ['for Discord', 'so it is easy to read', 'with the right level of detail', 'into the best format'],
    },
});

const STATUS_MESSAGES = Object.freeze(Object.fromEntries(
    Object.entries(STATUS_PARTS).map(([mode, group]) => [
        mode,
        Object.freeze(group.actions.flatMap((action) => (
            group.details.map((detail) => `${action} ${detail}…`)
        ))),
    ]),
));

const ALL_STATUS_MESSAGES = Object.freeze([
    ...new Set(Object.values(STATUS_MESSAGES).flat()),
]);

function clampRandomIndex(random, length) {
    const sampled = Number(random());
    const safeSample = Number.isFinite(sampled) ? sampled : 0;
    return Math.min(Math.max(Math.floor(safeSample * length), 0), length - 1);
}

function pickStatusMessage(mode = 'thinking', random = Math.random) {
    const messages = STATUS_MESSAGES[mode] || STATUS_MESSAGES.thinking;
    const index = clampRandomIndex(random, messages.length);
    return messages[index];
}

function getStatusMessage(mode = 'thinking', random = Math.random) {
    return `-# ✦ ${pickStatusMessage(mode, random)}`;
}

module.exports = {
    ALL_STATUS_MESSAGES,
    STATUS_MESSAGES,
    STATUS_PARTS,
    getStatusMessage,
};
