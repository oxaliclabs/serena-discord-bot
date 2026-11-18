# Serena

Serena is an open-source Discord community manager and conversational assistant created for Oxalic Lab. It combines community automation, persistent conversation memory, multimodal chat, downloadable file creation, member-aware replies, and live bot monitoring in one Node.js application.

## Features

- Conversational chat in one configured server channel and in direct messages
- Persistent memory for the latest 500 messages in each conversation
- Context-aware server participation that avoids interrupting member-to-member conversations
- Uploaded-image understanding and reference-based image generation
- Live web research for requests that need current information
- Automatic model fallback, input compaction, cooldown handling, and service-status replies
- Normal messages, rich embeds, source-code attachments, text files, and real ZIP archives
- A reply-based progress display with rotating activity messages
- 500 unique welcome messages
- Bot status monitoring with uptime, downtime, fleet, transition, and persistent-panel views
- Review collection, a self-maintaining review prompt, community rules, legal links, and website links
- Automatic application-description updates and voice-channel presence

## Requirements

- Node.js 20.12.0 or newer
- npm
- A Discord application and bot token
- A Discord server where you can invite and configure the bot
- A Cloudflare account with Workers AI enabled and an API token with Workers AI Read permission
- Internet access for Discord and Cloudflare API requests

Serena uses Cloudflare Workers AI exclusively for conversation, participation routing, image understanding, and image generation. Configure <code>CLOUDFLARE_ACCOUNT_ID</code> and <code>CLOUDFLARE_API_TOKEN</code> in your private <code>.env</code> file. Live web research is powered by Tavily. Cloudflare FLUX.2 [dev] handles photorealistic image generation and reference-image edits.

See the dedicated [API and credential setup guide](api.md) for official signup links and step-by-step key configuration.

## Discord application setup

1. Open the [Discord Developer Portal](https://discord.com/developers/applications) and create an application.
2. Open the **Bot** page and create the bot user.
3. Reset the bot token, copy the new value, and save it as <code>BOT_TOKEN</code> in <code>.env</code>.
4. Enable these privileged gateway intents on the **Bot** page:
   - Presence Intent
   - Server Members Intent
   - Message Content Intent
5. Open **OAuth2 → URL Generator**.
6. Select the <code>bot</code> and <code>applications.commands</code> scopes.
7. Grant these bot permissions:
   - View Channels
   - Send Messages
   - Embed Links
   - Attach Files
   - Read Message History
   - Use Application Commands
   - Connect
8. Use the generated URL to add the bot to your server.

The bot is intentionally restricted to the server identified by <code>GUILD_ID</code>. It leaves other servers automatically.

## Installation

Clone or download the repository, open a terminal in its directory, and install the dependencies:

    git clone <repository-url>
    cd Serena
    npm install

Create the local environment file.

Windows PowerShell:

    Copy-Item .env.example .env

Linux or macOS:

    cp .env.example .env

Open <code>.env</code> and replace every placeholder required for your server.

## Finding Discord IDs

1. In Discord, open **User Settings → Advanced** and enable **Developer Mode**.
2. Right-click the server and choose **Copy Server ID**.
3. Right-click each required channel and choose **Copy Channel ID**.
4. Right-click each owner or monitored bot and choose **Copy User ID**.

Discord IDs are long numeric strings. Do not use channel names, mentions, or URLs in ID fields.

## Environment configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| <code>BOT_TOKEN</code> | Yes | Discord bot token from the Developer Portal. Keep it private. |
| <code>BOT_NAME</code> | No | Name the conversation router recognizes. Defaults to Serena. |
| <code>COMMUNITY_NAME</code> | No | Community name shown in welcome messages and panels. |
| <code>OWNER_IDS</code> | Yes | Comma-separated Discord user IDs allowed to run owner commands. |
| <code>GUILD_ID</code> | Yes | Discord server the bot is allowed to manage. |
| <code>VOICE_CHANNEL_ID</code> | Yes | Voice channel the bot joins while online. |
| <code>STATUS_CHANNEL_ID</code> | Yes | Channel used for the persistent status panel and transition alerts. |
| <code>REVIEW_CHANNEL_ID</code> | Yes | Channel where reviews and the review prompt are maintained. |
| <code>WELCOME_CHANNEL_ID</code> | Yes | Channel where new-member greetings are sent. |
| <code>CHAT_CHANNEL_ID</code> | Yes | Server channel where conversational messages are processed. |
| <code>SUPPORT_URL</code> | No | Community or support invitation shown in the bot description. |
| <code>WEBSITE_URL</code> | No | Destination used by /website. |
| <code>TERMS_URL</code> | No | Terms link used by /legal. |
| <code>PRIVACY_URL</code> | No | Privacy link used by /legal. |
| <code>ACTIVITIES</code> | No | Comma-separated Discord presence messages. |
| <code>MONITORED_BOTS</code> | No | JSON array containing the name and user ID of each monitored bot. |
| <code>GEMINI_API_KEY</code> | Yes | Google Gemini API key used for all chat, routing, vision and web-answer synthesis. |
| <code>CLOUDFLARE_ACCOUNT_ID</code> | Yes | Cloudflare account ID used for image generation. |
| <code>CLOUDFLARE_API_TOKEN</code> | Yes | Cloudflare Workers AI API token used for image generation only. |

| <code>GEMINI_CHAT_MODEL</code> | No | Primary Gemini conversation and tool-calling model. |
| <code>GEMINI_FALLBACK_MODEL</code> | No | Gemini backup model. |
| <code>GEMINI_ROUTER_MODEL</code> | No | Gemini model used for shared-channel participation decisions. |
| <code>GEMINI_EMERGENCY_MODEL</code> | No | Final compact-response Gemini fallback. |
| <code>GEMINI_VISION_MODEL</code> | No | Gemini model used to understand uploaded images. |
| <code>TAVILY_API_KEY</code> | Yes for live web search | Tavily Search API key used to retrieve current web results. The configured AI model summarizes and answers from those results. |
| <code>GEMINI_WEB_MODEL</code> | No | Gemini model used to summarize Tavily search results. |
| <code>CLOUDFLARE_IMAGE_MODEL</code> | No | Cloudflare Workers AI image model used to generate and edit images. |

Use this format for multiple owners:

    OWNER_IDS=123456789012345678,234567890123456789

Use one-line JSON for monitored bots:

    MONITORED_BOTS=[{"name":"Example Bot","id":"345678901234567890"},{"name":"Backup Bot","id":"456789012345678901"}]

Use <code>MONITORED_BOTS=[]</code> when monitoring is not needed. Discord supports at most 25 choices on a slash-command option, so only the first 25 configured bots appear in /uptime and /downtime.

## Starting the bot

Start Serena with:

    npm start

The direct equivalent is:

    node index.js

At startup, Serena validates required settings, logs in, registers its guild commands, starts chat memory, joins the configured voice channel, restores review and monitoring state, and activates the server utilities.

Run the automated checks with:

    npm test

## Hosting with Pterodactyl or another Node.js panel

1. Select a Node.js 20.12.0 or newer runtime.
2. Upload the project files, excluding local secrets and runtime data.
3. Run <code>npm install</code> as the dependency-install command.
4. Use <code>node index.js</code> as the startup command.
5. Add every required environment variable in the hosting panel, or upload a private <code>.env</code> file.
6. Keep the server working directory writable so Serena can save files under <code>data/</code>.
7. Restart the instance and confirm the login, command-registration, chat, voice, review, and monitor messages in the console.

## Commands

| Command | Access | Purpose |
| --- | --- | --- |
| /review | Everyone | Submit a one-to-five-star community review. |
| /website | Everyone | Open the configured website. |
| /status | Owners | Show the current state of every monitored bot. |
| /uptime | Owners | Show seven-day uptime for one monitored bot. |
| /downtime | Owners | Show seven-day downtime for one monitored bot. |
| /fleet | Owners | Show fleet-wide health and weekly statistics. |
| /statuspanel | Owners | Deploy or refresh the persistent status panel. |
| /ping | Owners | Show Discord gateway and command-response latency. |
| /rules | Owners | Publish the community rules panel. |
| /legal | Owners | Display the configured terms and privacy links. |

Owner access is controlled by <code>OWNER_IDS</code>. The /review and /website commands are public.

## Conversation behavior

Serena processes ordinary messages only in <code>CHAT_CHANNEL_ID</code>. In that shared channel, it evaluates mentions, replies, names, recent speakers, timing, and conversation state before deciding whether to respond. This allows members to talk to each other without triggering the bot on every message.

Direct messages always receive a response and do not use the shared-channel participation decision.

Each incoming message is saved before a response is attempted. The most relevant stored context is selected for each model request, and oversized requests are compacted before a smaller model is tried. Cloudflare Workers AI account limits can still temporarily prevent model-backed responses when every configured model is unavailable.

## Replies and generated files

Serena chooses a delivery format based on the result:

- Short answers are sent as normal Discord replies.
- Longer readable answers are sent in a single embed.
- Very large answers are attached as <code>response.txt</code>.
- Large single code blocks are attached with an appropriate source extension.
- Requested text or source projects can be delivered as individual files or a real ZIP archive.
- Generated images are uploaded as image attachments.

Binary formats such as PDF, DOCX, executables, and media archives are not synthesized from plain text. Image requests use the dedicated image-generation path.

## Persistent data

Runtime state is created automatically in <code>data/</code>:

| File | Contents |
| --- | --- |
| <code>data/chat-memory.json</code> | Up to 500 recent messages per server channel or DM conversation. |
| <code>data/bot-monitor.json</code> | Monitoring history and status-panel references. |
| <code>data/review.json</code> | Review prompt message state. |

These files and their temporary write files are excluded from Git. Back up <code>data/</code> if conversation or monitoring history must survive migration to another host. The process needs write permission to this directory.

## Project structure

    Serena/
    ├── index.js
    ├── package.json
    ├── .env.example
    ├── api.md
    ├── LICENSE
    ├── src/
    │   ├── config.js
    │   ├── emoji.js
    │   ├── commands/
    │   └── utils/
    ├── test/
    └── data/

- <code>index.js</code> loads configuration, starts Discord, registers commands, and attaches services.
- <code>api.md</code> explains where to obtain and securely configure each credential.
- <code>src/config.js</code> reads and normalizes environment settings.
- <code>src/commands/</code> contains slash-command definitions.
- <code>src/utils/chatbot.js</code> handles conversation routing, tools, model fallback, and response delivery.
- <code>src/utils/chatMemory.js</code> maintains the persistent 500-message history.
- <code>src/utils/chatStatus.js</code> supplies rotating progress states.
- <code>src/utils/artifacts.js</code> creates downloadable text, source, and ZIP attachments.
- <code>src/utils/message.js</code> contains the 500 welcome-message variants.
- <code>src/utils/botMonitor.js</code> stores and calculates availability statistics.
- <code>test/</code> contains the automated behavior checks.

## Troubleshooting

### Configuration error at startup

Read the listed variable names, add them to <code>.env</code>, and verify that every Discord ID contains only 17–20 digits. <code>MONITORED_BOTS</code> must be valid one-line JSON.

### Invalid token or login failure

Reset the token in the Discord Developer Portal, update <code>BOT_TOKEN</code>, and restart the process. Never paste a token into source code or commit it to Git.

### Slash commands do not appear

Confirm that <code>GUILD_ID</code> is correct and that the bot was invited with the <code>applications.commands</code> scope. Guild command registration normally appears quickly after startup.

### Server chat does not respond

Confirm <code>CHAT_CHANNEL_ID</code>, Message Content Intent, channel visibility, Send Messages, Read Message History, Embed Links, and Attach Files. The bot may intentionally remain silent when it detects an active human conversation.

### Direct messages do not respond

Confirm that the user allows direct messages from server members and that the process is running. DM chat does not depend on <code>CHAT_CHANNEL_ID</code>.

### Cloudflare Workers AI requests return 429 or 413

A 429 response means the account's rate limit, usage tier, or configured budget was reached. A 413 response means the request was too large. Serena compacts context and switches models automatically, but it cannot override account-wide limits. Review your Cloudflare Workers AI usage and account limits, wait for the reset window, or select models available to your account.

### Image generation fails

Confirm that Workers AI is enabled on the Cloudflare account, the API token has the required Workers AI permissions, and <code>@cf/black-forest-labs/flux-2-dev</code> is available to the account. FLUX.2 [dev] may take longer than FLUX.1 schnell and consumes more AI resources.

### Voice connection fails

Confirm that <code>VOICE_CHANNEL_ID</code> belongs to <code>GUILD_ID</code> and that the bot has View Channel and Connect permissions.

## Security

- Keep <code>.env</code> private.
- Never publish Discord tokens or provider keys.
- Regenerate any credential that has appeared in source code, logs, screenshots, or a public repository.
- Do not commit files from <code>data/</code>; they may contain member messages and identifiers.
- Review the privacy and retention implications before enabling persistent chat in a public community.
- Set provider usage limits and alerts appropriate for the server's traffic.
- Use provider credentials only in accordance with the provider's terms and quota rules.

## Credits and attribution

Serena was created for **Oxalic Lab**.

- Original creator: **ishowpunjab**
- Contact: [ishowpunjab@proton.me](mailto:ishowpunjab@proton.me)

If you use, modify, fork, or redistribute this project, please preserve the Oxalic Lab and ishowpunjab credit in your documentation and retain the copyright and license notice. Clear attribution helps support the original developer and the continued maintenance of the project.

## License

Serena is released under the [ISC License](LICENSE).


## Gemini chat and Cloudflare image generation

Serena uses Google Gemini exclusively for chat, participation routing, uploaded-image understanding, and web-answer synthesis. Cloudflare Workers AI is used exclusively for image generation and reference-image edits. Add these values to your `.env` file (copy `.env.example` first):

```env
GEMINI_API_KEY=your_gemini_api_key
GEMINI_CHAT_MODEL=gemini-3.8-flash
GEMINI_FALLBACK_MODEL=gemini-3.5-flash-lite
GEMINI_ROUTER_MODEL=gemini-3.5-flash-lite
GEMINI_VISION_MODEL=gemini-3.8-flash

CLOUDFLARE_ACCOUNT_ID=your_account_id
CLOUDFLARE_API_TOKEN=your_cloudflare_api_token
CLOUDFLARE_IMAGE_MODEL=@cf/black-forest-labs/flux-2-dev
```

Create a Gemini API key in Google AI Studio. Create a Cloudflare API token with Workers AI permissions and use your Cloudflare Account ID. Keep both keys private and never commit `.env`.

The bot's system instructions give Serena a feminine conversational persona and explicitly prefer feminine Hindi/Hinglish self-reference (for example, “main kar sakti hoon”).

Tavily live web search requires <code>TAVILY_API_KEY</code>; Gemini summarizes the retrieved results.


## Oxalic Lab's team profiles

Serena includes a built-in profile knowledge module for Jasprit (Python / Secondary Developer), Baldeep (Node.js and Bun / Lead Developer), and Prabhjot (Jot / ideas and cross-team contributions). Their Discord IDs are stable identifiers; current display names and usernames are fetched from the configured guild when a team-profile question is asked. If lookup fails, Serena uses the known profile name and non-pinging mention tag rather than guessing a username.

All AI reply payloads suppress mention notifications (`allowedMentions: { parse: [], repliedUser: false }`), so team tags remain visible without pinging members.
