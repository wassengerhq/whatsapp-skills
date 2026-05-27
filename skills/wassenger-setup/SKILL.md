---
name: wassenger-setup
description: Set up Wassenger to automate WhatsApp Business with an AI agent. Use when the user is new to Wassenger, has not connected a number yet, needs an API key, or wants to install the Wassenger MCP server. Walks through API key creation, number connection (QR or WhatsApp Business API / Coexistence), MCP install, and a sanity test.
license: MIT
metadata:
  author: Wassenger
  version: "1.0.0"
  category: setup
  requires-mcp: "@wassengerhq/mcp-wassenger"
---

# Wassenger Setup

Onboard a new Wassenger account end-to-end so the user's AI agent can send and manage WhatsApp messages with natural-language prompts.

## When to use

Trigger this skill when the user:

- Says "I want to use Wassenger" / "connect WhatsApp to Claude" / "automate WhatsApp with AI".
- Mentions they have a Wassenger account but the agent does not have access yet (no API key in env, MCP not registered).
- Hits an authentication error from any other `wassenger-*` skill (401, missing API key, MCP server not found).
- Asks "how do I get started?" in the context of Wassenger or the Wassenger MCP.

If the user already has the MCP working and just wants to send a message, route them to `wassenger-messaging` instead.

## What you'll get when this skill finishes

1. A valid Wassenger **API key** stored as an environment variable (`WASSENGER_API_KEY`).
2. At least one **WhatsApp number connected** to the Wassenger account.
3. The **`@wassengerhq/mcp-wassenger`** MCP server installed and registered in the agent's config.
4. A confirmation that the agent can list devices and send a test message.

## Step 1 — Get an API key

Direct the user to https://app.wassenger.com/developers/api-keys.

- If they have no account: create one at https://app.wassenger.com.
- Click "Create API key", copy the value (30-200 characters, starts with random hex).
- Store it as `WASSENGER_API_KEY` in their shell profile (`~/.zshrc`, `~/.bashrc`):

```bash
export WASSENGER_API_KEY="paste-the-key-here"
```

Source the file or open a new shell. Validate the key with one curl:

```bash
curl -s -H "Token: $WASSENGER_API_KEY" https://api.wassenger.com/v1/devices
```

A `200` response with a JSON array (possibly empty) means the key works. A `401` means the key is wrong or the env var is empty — re-check.

> **Auth header note:** Wassenger accepts the key via the `Token` header (recommended) or `Authorization: Bearer <key>`. Stick to `Token` in examples.

## Step 2 — Connect a WhatsApp number

The user has three connection options. Ask them which fits their business:

| Option | Best for | What they need |
|---|---|---|
| **QR-paired number** | Solo operators, small teams, fast start | A phone with WhatsApp installed and the QR scanner |
| **Official WhatsApp Business API (WABA)** | Companies that need official Meta-verified status, templates, higher scale | A verified Meta Business Account and a phone number not yet on WhatsApp |
| **WABA Coexistence** | Existing WhatsApp users who want the official API on the **same** number | A number already on WhatsApp + Meta verification |

> The codebase docs about "number-pairing" features (groups, channels, communities) apply to **QR-paired** numbers only. Official WABA does **not** support groups or channels.

Walk them through the connection wizard at https://app.wassenger.com/devices. After the number shows as "ready", grab its `device.id` — many MCP tools need it.

If the user wants to verify a phone number is on WhatsApp before sending, use the **`verifyWhatsAppNumberExists`** MCP tool — that's the same logic used by https://wassenger.com/whatsapp-number-tester.

## Step 3 — Install the Wassenger MCP server

The MCP server is the official bridge between the user's agent and the Wassenger API. Source: https://github.com/wassengerhq/mcp-wassenger.

### For Claude Code

Add this block to the user's `~/.claude/settings.json` under `mcpServers`:

```json
{
  "mcpServers": {
    "wassenger": {
      "command": "npx",
      "args": ["-y", "@wassengerhq/mcp-wassenger"],
      "env": {
        "WASSENGER_API_KEY": "${WASSENGER_API_KEY}"
      }
    }
  }
}
```

Or use the CLI shortcut:

```bash
claude mcp add wassenger npx -y @wassengerhq/mcp-wassenger
```

### For Cursor

Edit `~/.cursor/mcp.json` with the same block. Restart Cursor.

### For Codex CLI / Gemini CLI / Goose / others

Each agent has its own MCP config path. The block structure is the same — only the file location changes. See https://agentskills.io/clients for per-agent links.

### Transport options

The MCP server supports **STDIO** (default, no port needed) and **HTTP streaming** (`MCP_TRANSPORT=http`). STDIO is right for single-user local agents. Switch to HTTP only if multiple agents on a LAN need to share one MCP instance.

## Step 4 — Confirm it works

In the agent, run:

```
List the WhatsApp devices in my Wassenger account.
```

The agent should call the MCP tool `get_whatsapp_devices` and return a table with each device's `alias`, `phone`, `status`, and `id`. If you get an empty list, Step 2 did not finish — the number is not connected yet.

Then send a test message:

```
Send "Hello from Claude" to my own WhatsApp number (+34...) using device <device-id>.
```

The agent calls `send_whatsapp_message`. Check WhatsApp on the phone — the message should arrive within a few seconds.

If it fails, common causes:

- `WASSENGER_API_KEY` missing in the MCP `env` block → restart the agent after editing config.
- Device status is `disconnected` or `pairing` → re-scan QR or finish WABA verification.
- Recipient number is not WhatsApp-enabled → run `verifyWhatsAppNumberExists` first.
- Hitting the **24-hour customer service window** on WABA → send a pre-approved template instead. See `wassenger-messaging` for templates.

## Where to go next

Once setup works, route the user to the skill that matches their goal:

- Want to send richer messages (media, polls, templates)? → `wassenger-messaging`
- Multi-agent inbox, assignment, labels? → `wassenger-inbox`
- Bulk broadcasts? → `wassenger-campaigns`
- Webhooks for real-time events? → `wassenger-webhooks`
- Industry recipe (e-commerce, sales, support, real estate, restaurants, logistics, marketing)? → the matching `wassenger-<vertical>` skill.

## Reference links

- API keys console: https://app.wassenger.com/developers/api-keys
- Devices console: https://app.wassenger.com/devices
- Full API reference: https://app.wassenger.com/docs
- MCP server source: https://github.com/wassengerhq/mcp-wassenger
- Number tester (free): https://wassenger.com/whatsapp-number-tester
- Agent Skills clients catalog: https://agentskills.io/clients
