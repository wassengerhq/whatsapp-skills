# Wassenger MCP — Tool Reference

Detailed catalog of every tool category exposed by the [`@wassengerhq/mcp-wassenger`](https://github.com/wassengerhq/mcp-wassenger) server. This file is loaded **on demand** by `wassenger-mcp/SKILL.md` when the agent needs precise tool names, parameter shapes, or per-tool example prompts.

**Scope: official WhatsApp Business API (WABA) only.** The Wassenger MCP also exposes tools for QR-paired (legacy consumer WhatsApp) devices — group / channel / WhatsApp Status / live messages — but those are intentionally omitted here. This pack does not document or support them.

> **Authoritative source.** Tool names and shapes can change between MCP versions. When in doubt, check the live MCP repo's README, or run `ping` to discover the active version.

---

## Messaging

### `send_whatsapp_message`

Send any outbound message (text, media, location, contact card, poll, scheduled, agent-attributed). For WABA outside the 24-hour customer service window, pass a `template` payload instead of `message`.

| Parameter | Type | Notes |
|---|---|---|
| `device` | string | Device ID from `get_whatsapp_devices`. Required. |
| `phone` | string | E.164 (+34600111222) or chat WID. Required. |
| `message` | string | Plain text. Omit for media-only or template messages. |
| `media` | object | `{ file: <fileId> }` or `{ url: <publicUrl> }`. |
| `caption` | string | Caption for media messages. |
| `location` | object | `{ latitude, longitude, name?, address? }`. |
| `contactCard` | object | vCard contact share. |
| `poll` | object | `{ name, options: [...], selectableCount? }`. |
| `template` | object | `{ name, language, components }` — use when outside the 24h window. |
| `deliverAt` | ISO date | Schedule for later delivery. |
| `replyTo` | string | Message ID to reply to (threaded reply). |
| `quoted` | object | Quote another message by id. |

**Example prompts:**

- "Send 'Your order #1234 is ready for pickup' to +44 7700 900111 from device <id>."
- "Reply to message <msgId> with a thumbs-up reaction."
- "Schedule 'Don't forget our meeting tomorrow' to be sent at 9am to +1 555 0100."
- "Send the `reservation_reminder` template in Spanish to +34 600 111 222 with name=Marta, time=20:00."

### `list_whatsapp_templates`

List WABA message templates for a device, filtered by status / language / category.

| Parameter | Type | Notes |
|---|---|---|
| `device` | string | Device ID. WABA-only. |
| `status` | enum | `APPROVED`, `PENDING`, `REJECTED`. Default lists all. |
| `language` | string | BCP-47 (`en_US`, `es`, `pt_BR`, …). |
| `category` | enum | `MARKETING`, `UTILITY`, `AUTHENTICATION`. |

**Example prompts:**

- "Show me all approved English templates on my Wassenger account."
- "List utility templates available for our Brazilian Portuguese number."

### `manage_whatsapp_message_interactions`

Reactions, replies, forwarding, deleting messages. WABA-supported operations only.

**Operations:** `react`, `reply`, `forward`, `delete-for-me`, `delete-for-all`.

---

## Conversations

### `get_whatsapp_chats`

Generic chat list. Prefer the specific variants below when applicable.

| Parameter | Type | Notes |
|---|---|---|
| `device` | string | Required. |
| `limit` | number | Default 20, max 200. |
| `offset` | number | For pagination. |
| `sort` | string | `lastMessageAt:desc` (default), `name:asc`, … |

### `get_whatsapp_unread_chats`

Tighter defaults for unread-only views.

### `get_whatsapp_archived_chats`

Returns archived chats only.

### `get_whatsapp_assigned_chats`

Filter by assigned team member.

| Parameter | Type | Notes |
|---|---|---|
| `assignedTo` | string | Team member ID. |

### `get_whatsapp_chats_by_status`

Filter by chat status.

| Parameter | Type | Notes |
|---|---|---|
| `status` | enum | `active`, `resolved`, `pending`, `archived`. |

### `get_whatsapp_chats_by_contact_type`

Filter by who is on the other side. On WABA the meaningful values are `contact` (an individual customer) and `business` (another WhatsApp Business account).

### `get_whatsapp_chats_by_date_range`

| Parameter | Type | Notes |
|---|---|---|
| `from` | ISO date | Required. |
| `to` | ISO date | Required. |

### `search_whatsapp_chats_by_name`

Substring search over contact name or chat title.

### `get_whatsapp_chat_by_id`

Full chat record by chat WID. Includes `lastInboundAt` — the field you need to check before sending free-form on WABA.

### `get_whatsapp_chat_statistics`

Counts (total chats, by status, average response time) — useful for the `wassenger-customer-support` SLA recipes.

---

## Chat messages

### `get_whatsapp_chat_messages`

Pull message history. Filters: `recent`, `search`, `date_range`, `by_sender`, `by_type`, `by_id`, `thread`.

| Parameter | Type | Notes |
|---|---|---|
| `chat` | string | Chat WID. Required. |
| `filter` | enum | See list above. |
| `query` | string | For `search` filter. |
| `from` / `to` | ISO date | For `date_range`. |
| `senderId` | string | For `by_sender`. |
| `messageType` | enum | `text`, `image`, `audio`, `video`, `document`, `location`, `template`, … |

### `analyze_whatsapp_chat_messages`

Run analysis (sentiment, summary, intent extraction) over the message history of a single chat. Returns structured JSON.

### `analyze_whatsapp_chats`

Bulk analysis across multiple chats. Use sparingly — expensive.

---

## Devices & contacts

### `get_whatsapp_devices`

List all devices. Use the result to pick the `device` ID for other tools.

### `get_whatsapp_device_details`

Single-device full record (status, phone, plan, current WABA conversation tier, session metadata).

### Contacts

Tools: `get_contacts` (list), `search_contacts`, `get_contact_details`, `export_contacts` (CSV), import via the campaign module (`manage_whatsapp_campaign_contacts`). See `wassenger-contacts` for the recipes.

---

## Multi-agent inbox

### `manage_whatsapp_team`

| Operation | Purpose |
|---|---|
| `search` | Find team members by email or name |
| `create` | Invite a new agent |
| `update` | Change role / permissions |
| `delete` | Revoke access |
| `grant-device-access` | Allow this user to operate a device |
| `revoke-device-access` | Remove device access |

### `manage_whatsapp_departments`

Create, update, delete departments. Each department has an associated list of agents.

### `manage_whatsapp_labels`

CRUD on labels. Apply a label to a chat via the same tool with operation `apply` (or `unapply`).

### `manage_whatsapp_queue`

Inspect and control the outbound queue.

| Operation | Purpose |
|---|---|
| `status` | Get current queue stats (pending, sent, failed) |
| `pause` | Pause delivery |
| `resume` | Resume delivery |
| `reject` | Drop queued messages matching a filter |
| `freeze` | Freeze the queue for maintenance |
| `delete` | Remove specific queued messages |

---

## Outbound campaigns

### `manage_whatsapp_campaigns`

| Operation | Purpose |
|---|---|
| `list` | Show campaigns |
| `create` | Create a new campaign (name, template/message, schedule, audience criteria) |
| `update` | Edit a draft campaign |
| `start` | Trigger delivery |
| `stop` | Stop a running campaign |
| `delete` | Remove a campaign |
| `stats` | Delivered / read / replied counts |
| `results` | Per-recipient delivery detail |

### `manage_whatsapp_campaign_contacts`

Add, remove, or import (CSV) contacts inside a campaign's audience.

---

## Files

### `upload_whatsapp_file_from_url`

Upload a remote file into Wassenger's file storage so it can be attached to messages.

### `search_whatsapp_chat_files`

Find files inside conversations (filter by type, chat, date range).

### `search_whatsapp_outbound_files`

Find files attached to outbound campaigns / messages.

### `get_whatsapp_file_details`, `get_whatsapp_chat_file_details`

Single-file metadata.

### `update_whatsapp_file_metadata`

Tag, rename, set expiration.

### `download_whatsapp_file`, `download_whatsapp_chat_file`

Stream the file content back.

### `delete_whatsapp_file`

Remove a file from storage.

### `export_whatsapp_chats`

Generate a downloadable archive (CSV / JSON / PDF) of a chat or chat list.

---

## Numbers

### `verifyWhatsAppNumberExists`

Check whether a phone number is registered on WhatsApp without sending a message. Powers the free tester at https://wassenger.com/whatsapp-number-tester.

| Parameter | Type | Notes |
|---|---|---|
| `phone` | string | E.164. Required. |
| `device` | string | Required. |

**Always run this before sending the first outbound message to a new contact** — saves quota and avoids template-failure penalties on WABA.

---

## Health

### `health_check` / `ping`

Returns MCP version, API connectivity, and active device count. Use as the first call when troubleshooting.

---

## Patterns

### Pattern: "Send a one-off message"

1. `get_whatsapp_devices` → pick a `ready` device.
2. (Optional) `verifyWhatsAppNumberExists` for an unknown contact.
3. `get_whatsapp_chat_by_id` → check `lastInboundAt` (decides free-form vs template).
4. `send_whatsapp_message` with `device`, `phone`, `message` (or `template`).

### Pattern: "Broadcast to a segment"

1. `get_contacts` with filter criteria (or `import` into the campaign).
2. `list_whatsapp_templates` → pick an `APPROVED` template.
3. `manage_whatsapp_campaigns` → `create` → `start`.
4. Poll `stats` until delivery completes.

### Pattern: "Reply to a customer in a multi-agent inbox"

1. `get_whatsapp_chats_by_status` with `status=active` (or filter assigned).
2. `get_whatsapp_chat_messages` to load context.
3. `send_whatsapp_message` with `replyTo` for threaded replies.
4. `manage_whatsapp_labels` to tag the chat.
5. `manage_whatsapp_team` if assignment changes.

### Pattern: "Set up a 24 h template reminder"

1. Check `chat.lastInboundAt` from `get_whatsapp_chat_by_id`.
2. If `> 24 h ago`, `list_whatsapp_templates` → pick the right one.
3. `send_whatsapp_message` with the `template` payload populated.
