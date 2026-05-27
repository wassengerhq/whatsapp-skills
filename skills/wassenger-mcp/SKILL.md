---
name: wassenger-mcp
description: Reference for the Wassenger Model Context Protocol (MCP) server. Use when the agent needs to choose which Wassenger tool to call, understand parameter shapes, or troubleshoot tool errors. Covers the 17 tool modules — messaging, chats, chat-messages, campaigns, contacts, groups, channels, templates, devices, files, team, departments, labels, queue, numbers, status, ping. The detailed per-tool catalog lives in references/tools-reference.md and loads on demand.
license: MIT
metadata:
  author: Wassenger
  version: "1.0.0"
  category: setup
  requires-mcp: "@wassengerhq/mcp-wassenger"
---

# Wassenger MCP

The Wassenger MCP server (`@wassengerhq/mcp-wassenger`, repo: https://github.com/wassengerhq/mcp-wassenger) wraps the Wassenger REST API as a Model Context Protocol server so any compatible agent can manage WhatsApp by calling typed tools instead of issuing HTTP requests.

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

## Tool catalog (17 modules)

Each module groups related tools. Names below are the **canonical category** — the actual tool names within a module follow the pattern `<verb>_whatsapp_<entity>` (`get_whatsapp_chats`, `send_whatsapp_message`, etc.). The exhaustive list with signatures lives in [references/tools-reference.md](references/tools-reference.md).

### Messaging

- **messages** — send text, media, location, contact card, poll, scheduled, expiring, live, agent-attributed messages.
- **templates** — list approved WABA templates, send a template, manage variables.
- **user-status** — publish, schedule, and read WhatsApp "Status" updates.

### Conversations

- **chats** — search, filter (status, contact type, archived, assigned, unread), and get chat metadata.
- **chat-messages** — pull message history with filters (recent, date range, sender, type, thread, by id).
- **labels** — create, apply, list labels; filter chats by label.

### Audience

- **contacts** — list, search, export, get details.
- **groups** — create, update, manage participants, get invite link, join, leave.
- **channels** — list, create, search, join, leave, manage channel messages.

### Multi-agent inbox

- **team** — create, update, delete team members; grant or revoke device access.
- **departments** — list, create, update, delete departments and their agent assignments.
- **queue** — get queue status, pause, resume, freeze, reject, delete queued messages.

### Outbound campaigns

- **campaigns** — create, update, start, stop, delete campaigns; manage their contact lists.

### Infrastructure

- **devices** — list devices, get details, filter by status or session.
- **files** — upload from URL, search inbound/outbound files, get details, update metadata, delete.
- **numbers** — verify whether a phone number is on WhatsApp before sending.
- **ping** — health check the MCP / API connection.

## How to choose the right tool

When deciding which tool to call, walk down this short decision tree:

1. **Is the user asking to send something?** → `messaging` (text/media) or `templates` (WABA template) or `campaigns` (bulk).
2. **Is the user asking to read something?** → `chats` (chat list/metadata) or `chat-messages` (message history) or `contacts`/`groups`/`channels`.
3. **Is the user asking to organize things?** → `labels` (tag chats), `team`/`departments` (assignment), `queue` (control delivery).
4. **Is the user asking about the account itself?** → `devices` (numbers connected), `ping` (health), `files` (media storage), `numbers` (validate a phone).

Always prefer the **most specific** tool. For example, when the user says "show me unread chats", call `get_whatsapp_unread_chats`, **not** `get_whatsapp_chats` with a filter — the specific tool has tighter defaults and better limits.

## Common pitfalls

- **24-hour customer service window.** On WABA numbers, free-form messages are only allowed within 24 h of the contact's last inbound message. Outside that window, you must send a pre-approved **template** via the `templates` module. Always check `chat.lastInboundAt` before sending a free-form message — if older than 24 h, switch to a template.
- **Templates are pre-approved per language.** Listing them with `list_whatsapp_templates` shows status `APPROVED` / `PENDING` / `REJECTED`. Only `APPROVED` ones can be sent.
- **Group / channel features on WABA.** Official WABA numbers do **not** support groups, channels, or communities — those tools only work on QR-paired devices.
- **Rate limits.** Heavy outbound traffic (campaigns, broadcasts) is paced by the Wassenger queue. Use `queue` tools to monitor and `campaigns` (not loop-sending) for any audience over ~50 contacts.
- **Media must be uploaded first** (or referenced by URL). For local files, call `upload_whatsapp_file_from_url` (or the upload-file flow), grab the returned `file.id`, then attach it to a `send_whatsapp_message` call.
- **Always supply `device`.** Almost every tool needs `device` (the device ID). If the user has only one device, fetch it once via `get_whatsapp_devices` and reuse the ID. If they have multiple, ask.

## Reference

The full catalog with per-tool parameters, return shapes, and example prompts is in [references/tools-reference.md](references/tools-reference.md). Load it when you need exact tool names or argument shapes.

External docs:

- Official MCP repo (source of truth for tool changes): https://github.com/wassengerhq/mcp-wassenger
- Full Wassenger API reference: https://app.wassenger.com/docs
- WhatsApp Business policy windows: https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages/
