---
name: wassenger-mcp
description: Reference for the Wassenger Model Context Protocol (MCP) server, scoped to the official WhatsApp Business API (WABA). Use when the agent needs to choose which Wassenger tool to call, understand parameter shapes, or troubleshoot tool errors. Covers the WABA-supported tool modules — messaging, templates, chats, chat-messages, labels, contacts, team, departments, queue, campaigns, devices, files, numbers, ping. The detailed per-tool catalog lives in references/tools-reference.md and loads on demand.
license: MIT
metadata:
  author: Wassenger
  version: "1.0.0"
  category: setup
  requires-mcp: "mcp-wassenger"
---

# Wassenger MCP

The Wassenger MCP server (`mcp-wassenger`, repo: https://github.com/wassengerhq/mcp-wassenger) wraps the Wassenger REST API as a Model Context Protocol server so any compatible agent can manage WhatsApp by calling typed tools instead of issuing HTTP requests.

## When to use

This skill is consulted by the agent whenever it has to pick a Wassenger tool. Activate it when:

- The user describes a WhatsApp task and the agent is unsure which MCP tool to call.
- A tool returned an error and the agent needs to confirm parameter shape or required envvars.
- The user asks "what can Wassenger do?" or wants a quick capability map.
- An industry skill (`wassenger-ecommerce`, etc.) refers back to a specific tool category.

If the user has not yet installed the MCP server, route to `wassenger-setup` first.

## Prerequisites

- `WASSENGER_API_KEY` set and validated (see `wassenger-setup`).
- The MCP server registered in the agent's config under the name `wassenger`.
- A device connected (`status: ready`) — many tools take a `device` parameter.

## Tool catalog (14 modules)

Each module groups related tools. Names below are the **canonical category** — the actual tool names within a module follow the pattern `<verb>_whatsapp_<entity>` (`get_whatsapp_chats`, `send_whatsapp_message`, etc.). The exhaustive list with signatures lives in [references/tools-reference.md](references/tools-reference.md).

> The Wassenger MCP also exposes modules that only work on legacy QR-paired devices (WhatsApp Status updates, group management, channel management, live messages). They are **omitted from this catalog** because this pack targets the official WABA only — see `wassenger-setup` for the rationale.

### Messaging

- **messages** — send text, media, location, contact card, poll, scheduled, agent-attributed messages.
- **templates** — list approved WABA templates, send a template, manage variables.

### Conversations

- **chats** — search, filter (status, contact type, archived, assigned, unread), and get chat metadata.
- **chat-messages** — pull message history with filters (recent, date range, sender, type, thread, by id).
- **labels** — create, list, update, delete labels (CRUD). To apply/remove a label on a chat, use the `send_whatsapp_message` `agent` action (`labels:add` / `labels:remove`).

### Audience

- **contacts** — no general contacts tool in the MCP. Reach contact data via `search_whatsapp_chats_by_name`, campaign contacts (`manage_whatsapp_campaign_contacts`), `verifyWhatsAppNumberExists`, the embedded `chat.contact`, or the REST `/contacts` API (see `wassenger-contacts`).

### Multi-agent inbox

- **team** — create, update, delete team members; grant or revoke device access.
- **departments** — list, create, update, delete departments and their agent assignments.
- **queue** — get queue status, update status (pause / active / reject / freeze), delete queued messages.

### Outbound campaigns

- **campaigns** — create, update, start, stop, delete campaigns; manage their contact lists.

### Infrastructure

- **devices** — list devices, get details, filter by status or session.
- **files** — upload from URL, search inbound/outbound files, get details, update metadata, delete.
- **numbers** — verify whether a phone number is on WhatsApp before sending.
- **ping** — health check the MCP / API connection.

## How to choose the right tool

When deciding which tool to call, walk down this short decision tree:

1. **Is the user asking to send something?** → `messages` (text/media inside the 24h window) or `templates` (WABA template outside the window) or `campaigns` (bulk).
2. **Is the user asking to read something?** → `chats` (chat list/metadata) or `chat-messages` (message history) or `contacts` (audience).
3. **Is the user asking to organize things?** → `labels` (tag chats), `team`/`departments` (assignment), `queue` (control delivery).
4. **Is the user asking about the account itself?** → `devices` (numbers connected), `ping` (health), `files` (media storage), `numbers` (validate a phone).

Use the unified `get_whatsapp_chats` with the right `action` (e.g. `action: "unread"` for unread chats, `action: "by_status"` for resolved/active). Thin convenience wrappers like `get_whatsapp_unread_chats` exist and call the same backend, so either form works.

## Common pitfalls

- **24-hour customer service window.** On WABA numbers, free-form messages are only allowed within 24 h of the contact's last inbound message. Outside that window, you must send a pre-approved **template** via the `templates` module. Always check `chat.lastInboundAt` before sending a free-form message — if older than 24 h, switch to a template.
- **Templates are pre-approved per language.** Listing them with `list_whatsapp_templates` shows status `APPROVED` / `PENDING` / `REJECTED`. Only `APPROVED` ones can be sent.
- **No groups / channels / WhatsApp Status on WABA.** Official WABA numbers do not support those features. If a recipe seems to need a "group", redesign it around 1:1 chats, a broadcast campaign, or a different communication channel for internal coordination.
- **Conversation tiers.** WABA paces outbound by the device's daily conversation tier (250 / 1K / 10K / 100K / unlimited unique users per 24 h). Check via `get_whatsapp_device_details` before large sends.
- **Rate limits.** Heavy outbound traffic is paced by the Wassenger queue. Use `queue` tools to monitor and `campaigns` (not loop-sending) for any audience over ~50 contacts.
- **Media must be uploaded first** (or referenced by URL). For local files, call `upload_whatsapp_file_from_url` (or the upload-file flow), grab the returned `file.id`, then attach it to a `send_whatsapp_message` call.
- **Always supply `device`.** Almost every tool needs `device` (the device ID). If the user has only one device, fetch it once via `get_whatsapp_devices` and reuse the ID. If they have multiple, ask.

## Reference

The full catalog with per-tool parameters, return shapes, and example prompts is in [references/tools-reference.md](references/tools-reference.md). Load it when you need exact tool names or argument shapes.

External docs:

- Official MCP repo (source of truth for tool changes): https://github.com/wassengerhq/mcp-wassenger
- Full Wassenger API reference: https://app.wassenger.com/docs
- WhatsApp Business policy windows: https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages/
