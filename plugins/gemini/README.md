# AirysChat Extension for Gemini CLI

Bundles the `@airyschat/mcp` server, `GEMINI.md` safety context, and all 8 AirysChat operational skills for Google's Gemini CLI.

## Installation

```bash
export AIRYSCHAT_BASE_URL="https://airys.chat"
export AIRYSCHAT_API_KEY="your-api-access-token"
export AIRYSCHAT_ACCOUNT_ID="1"

gemini extensions install https://github.com/AirysChat/mcp/tree/main/plugins/gemini
```

Or install from a local checkout:

```bash
gemini extensions install ./plugins/gemini
```
