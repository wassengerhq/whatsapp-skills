# Wassenger Skills

> Agent Skills for [Wassenger](https://wassenger.com) — automate WhatsApp Business for your business by chatting with Claude, Cursor, Codex, Copilot, or any agent that supports the open [Agent Skills](https://agentskills.io) format.

[![npm version](https://img.shields.io/npm/v/@wassengerhq/skills.svg)](https://www.npmjs.com/package/@wassengerhq/skills)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Agent Skills](https://img.shields.io/badge/format-agentskills.io-blue.svg)](https://agentskills.io)

---

## What is this?

A pack of **14 ready-to-install Agent Skills** that teach your AI agent how to automate WhatsApp Business workflows with Wassenger — order confirmations, lead qualification, support tickets, appointment reminders, broadcast campaigns, and more. You describe the outcome in plain English. The agent picks the right Wassenger tools, respects the WhatsApp rules (24-hour window, templates, rate limits), and runs the workflow end-to-end.

Built on top of [`wassengerhq/mcp-wassenger`](https://github.com/wassengerhq/mcp-wassenger), the official Wassenger Model Context Protocol server.

## Install

```bash
npx @wassengerhq/skills init
```

The CLI will:

1. Ask for your Wassenger API key (get one at [app.wassenger.com/developers](https://app.wassenger.com/developers/api-keys)).
2. Validate it against the Wassenger API.
3. Auto-detect your agent (Claude Code, Cursor, Codex, …) and install the 14 skills into the right directory.
4. Register the Wassenger MCP server so your agent can call WhatsApp tools immediately.

Alternative installs:

```bash
# Via the skills.sh marketplace
npx skills add wassengerhq/wassenger-skills

# As a Claude Code plugin
# inside Claude Code: /plugin install wassengerhq/wassenger-skills
```

## The skills

### Setup (2)

| Skill | What it does |
|---|---|
| `wassenger-setup` | Walks the user through getting an API key, connecting a WhatsApp number, and validating the install. |
| `wassenger-mcp` | Reference for the Wassenger MCP server — every tool, every parameter, every transport option. |

### Capabilities (5) — reusable building blocks

| Skill | What it does |
|---|---|
| `wassenger-messaging` | Send text, media, templates, polls, scheduled messages — with WABA template rules baked in. |
| `wassenger-inbox` | Multi-agent inbox: statuses, assignment, labels, departments. |
| `wassenger-campaigns` | Bulk broadcasts: segmentation, scheduling, delivery tracking. |
| `wassenger-webhooks` | Subscribe to real-time events with HMAC signature verification and retries. |
| `wassenger-contacts-groups` | Contacts, groups, channels — sync, filter, manage. |

### Industries (7) — outcome-focused recipes

| Skill | For businesses that … |
|---|---|
| `wassenger-ecommerce` | Run an online store (Shopify, WooCommerce, …) and want WhatsApp for order updates, abandoned cart, post-purchase. |
| `wassenger-sales-bot` | Need lead qualification, meeting scheduling, follow-up sequences with human handoff. |
| `wassenger-customer-support` | Operate a multi-agent support inbox with SLAs, escalations, and auto-replies. |
| `wassenger-real-estate` | Handle property inquiries, viewings, and client nurturing. |
| `wassenger-restaurants` | Take reservations, send menus, push reminders. |
| `wassenger-logistics` | Send delivery notifications, tracking updates, proof of delivery. |
| `wassenger-marketing` | Run segmented broadcasts, growth loops, retention sequences. |

## How it works

Agent Skills follow a **progressive disclosure** model. At startup, the agent only loads each skill's `name` and `description` (~100 tokens each). When your prompt matches a skill's description, the agent loads the full `SKILL.md` into context and executes the recipe — calling the Wassenger MCP tools in the documented order.

Example:

> 👤 *"Send a booking reminder to everyone who has a reservation tomorrow at La Tagliatella."*

→ Agent activates `wassenger-restaurants` → reads the reservation-reminder recipe → calls the MCP to fetch tomorrow's reservations from your contacts → sends a pre-approved WABA template to each → reports back with delivery status.

## Requirements

- Node.js ≥ 18
- A Wassenger account with at least one connected WhatsApp number
- An agent that supports the Agent Skills format (Claude Code, Cursor, Codex, Copilot, Gemini CLI, Goose, OpenCode, and 30+ others — see [agentskills.io/clients](https://agentskills.io))

## Documentation

- [Wassenger API docs](https://app.wassenger.com/docs)
- [Wassenger MCP server](https://github.com/wassengerhq/mcp-wassenger)
- [Agent Skills specification](https://agentskills.io/specification)

## Contributing

PRs welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) (coming soon).

## License

[MIT](LICENSE) © Wassenger
