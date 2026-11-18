# API and Credential Setup

Serena uses **Google Gemini exclusively for chat** (including participation routing, vision, tool calls and web-answer synthesis). **Cloudflare Workers AI is used exclusively for image generation and reference-image edits.** Tavily provides live web search. No OpenAI API key or service is used.

## Credentials

| Credential | Environment variable | Required | Official source |
| --- | --- | --- | --- |
| Discord bot token | `BOT_TOKEN` | Yes | https://discord.com/developers/applications |
| Gemini API key | `GEMINI_API_KEY` | Yes | https://aistudio.google.com/apikey |
| Cloudflare account ID | `CLOUDFLARE_ACCOUNT_ID` | Yes | https://dash.cloudflare.com/ |
| Cloudflare Workers AI API token | `CLOUDFLARE_API_TOKEN` | Yes, for images | https://dash.cloudflare.com/ |
| Tavily API key | `TAVILY_API_KEY` | For live web search | https://app.tavily.com/ |

## Gemini chat setup

Create an API key in Google AI Studio and set it in `.env`:

```env
GEMINI_API_KEY=your_gemini_api_key
GEMINI_CHAT_MODEL=gemini-3.8-flash
GEMINI_FALLBACK_MODEL=gemini-3.5-flash-lite
GEMINI_ROUTER_MODEL=gemini-3.5-flash-lite
GEMINI_EMERGENCY_MODEL=gemini-3.5-flash-lite
GEMINI_VISION_MODEL=gemini-3.8-flash
GEMINI_WEB_MODEL=gemini-3.8-flash
```

All chat and text reasoning requests are sent directly to Google's Gemini API compatibility endpoint. Model fallback stays within Gemini; there is no Cloudflare chat fallback.

## Cloudflare image generation

Set the Cloudflare account ID and Workers AI API token:

```env
CLOUDFLARE_ACCOUNT_ID=your_cloudflare_account_id
CLOUDFLARE_API_TOKEN=your_cloudflare_workers_ai_token
CLOUDFLARE_IMAGE_MODEL=@cf/black-forest-labs/flux-2-dev
```

Cloudflare is only called for image generation and reference-image edits. It is not used for ordinary chat or chat vision.

## Tavily web search

Create a key in the Tavily dashboard and set `TAVILY_API_KEY`. Tavily retrieves current search results; Gemini writes the answer using those results.

## Discord bot setup

Create the Discord application in the Developer Portal, copy its bot token, and enable Presence Intent, Server Members Intent, and Message Content Intent. Keep all credentials private and never commit `.env` to a public repository.

## Hosting

Copy `.env.example` to `.env`, fill in Discord, Gemini, Cloudflare image, Tavily and channel settings, then deploy the bot. For hosting panels, add the same environment variable names in the private environment/secrets section.
