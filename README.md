# Wassenger Skills

> Agent Skills for [Wassenger](https://wassenger.com) — automate WhatsApp Business for your business by chatting with Claude, Cursor, Codex, Copilot, or any agent that supports the open [Agent Skills](https://agentskills.io) format.

[![npm version](https://img.shields.io/npm/v/@wassengerhq/skills.svg)](https://www.npmjs.com/package/@wassengerhq/skills)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Agent Skills](https://img.shields.io/badge/format-agentskills.io-blue.svg)](https://agentskills.io)

---

## What is this?

A pack of **22 ready-to-install Agent Skills** that teach your AI agent how to automate every aspect of WhatsApp Business with Wassenger — onboarding a team, organizing the inbox, sending messages, running campaigns, configuring auto-replies, reporting on inbox analytics, plus seven industry-specific playbooks and migration guides from Twilio and Wati. You describe the outcome in plain English. The agent picks the right Wassenger tools, respects the WhatsApp Business API rules (24-hour window, templates, rate limits), and runs the workflow end-to-end.

Scoped to the **official WhatsApp Business API** — built for production deployments, not legacy QR-paired devices.

Built on top of [`wassengerhq/mcp-wassenger`](https://github.com/wassengerhq/mcp-wassenger), the official Wassenger Model Context Protocol server.

## Install

Pick the method that matches your agent — each installs the 22 skills and registers the Wassenger MCP server.

**Claude Code** (plugin):

```text
/plugin marketplace add wassengerhq/wassenger-skills
/plugin install wassenger-skills@wassengerhq
```

**Any agent** (via the open [Agent Skills](https://agentskills.io) CLI):

```bash
npx skills add wassengerhq/wassenger-skills
```

**Guided setup** — interactive CLI that asks for your API key, validates it, auto-detects your agent, installs the skills, and wires up the MCP server:

```bash
npx @wassengerhq/skills init   # publishing to npm soon
```

You'll need a Wassenger API key — get one at [app.wassenger.com/developers](https://app.wassenger.com/developers/apikeys?ref=skills&utm_source=readme) and set it as `WASSENGER_API_KEY` (the guided setup does this for you).

## The skills

### Setup (2)

| Skill | What it does |
|---|---|
| `wassenger-setup` | Walks the user through getting an API key, connecting a WhatsApp number, and validating the install. |
| `wassenger-mcp` | Reference for the Wassenger MCP server — every tool, every parameter, every transport option. |

### Capabilities (11) — reusable building blocks

| Skill | What it does |
|---|---|
| `wassenger-messaging` | Send text, media, templates, polls, scheduled messages — with WABA template rules baked in. |
| `wassenger-inbox` | Chat triage: statuses, manual assignment, internal notes, archive/restore, bulk housekeeping. |
| `wassenger-campaigns` | Bulk broadcasts: segmentation, scheduling, delivery tracking, opt-out. |
| `wassenger-webhooks` | Subscribe to real-time events with HMAC signature verification and retries. |
| `wassenger-contacts` | CSV import, CRM sync, segmentation, export, phone validation. |
| `wassenger-team` | Invite agents, set roles (admin / agent / readonly), grant per-device access, safe offboarding. |
| `wassenger-labels` | Full label CRUD with the `namespace:value` convention, bulk-apply, query, reporting. |
| `wassenger-routing` | Auto-assignment (round-robin, language-based, skills-based), departments, escalation, fallback. |
| `wassenger-quick-replies` | Canned-response library — shortcuts (`/shipping`), media, visibility, bulk import. |
| `wassenger-auto-replies` | Rule-based automatic responses — welcome, out-of-hours, busy, inactive follow-up. |
| `wassenger-analytics` | Reports & KPIs from live inbox data — status, agent workload, response/resolution time, volume, backlog, language. |

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

### Migration (2) — move from another provider

| Skill | For teams that … |
|---|---|
| `wassenger-migrate-from-twilio` | Are moving a WhatsApp integration off Twilio — API mapping, templates, webhooks, before/after Node & Python. |
| `wassenger-migrate-from-wati` | Are moving off Wati (wati.io) — session/template sends, named→positional params, broadcasts, webhooks. |

## How it works

Agent Skills follow a **progressive disclosure** model. At startup, the agent only loads each skill's `name` and `description` (~100 tokens each). When your prompt matches a skill's description, the agent loads the full `SKILL.md` into context and executes the recipe — calling the Wassenger MCP tools in the documented order.

Example:

> 👤 *"Send a booking reminder to everyone who has a reservation tomorrow at La Tagliatella."*

→ Agent activates `wassenger-restaurants` → reads the reservation-reminder recipe → calls the MCP to fetch tomorrow's reservations from your contacts → sends a pre-approved WABA template to each → reports back with delivery status.

## Requirements

- Node.js ≥ 18
- A Wassenger account with at least one connected WhatsApp number
- An agent that supports the Agent Skills format (Claude Code, Cursor, Codex, Copilot, Gemini CLI, Goose, OpenCode, and 30+ others — see [agentskills.io/clients](https://agentskills.io/clients))

## Documentation

- [Wassenger API docs](https://app.wassenger.com/docs)
- [Wassenger MCP server](https://github.com/wassengerhq/mcp-wassenger)
- [Agent Skills specification](https://agentskills.io/specification)

## Contributing

PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © Wassenger
