# Wassenger MCP — Tool Reference

Detailed catalog of the tools exposed by the [`mcp-wassenger`](https://github.com/wassengerhq/mcp-wassenger) server. This file is loaded **on demand** by `wassenger-mcp/SKILL.md` when the agent needs precise tool names, parameter shapes, or per-tool example prompts.

**Scope: official WhatsApp Business API (WABA) only.** The Wassenger MCP also exposes group / channel / WhatsApp Status / live-message capabilities that only work on legacy QR-paired devices — those are intentionally omitted here. This pack does not document or support them.

> **Authoritative source.** Tool names and shapes can change between MCP versions. When in doubt, check the live MCP repo's README at https://github.com/wassengerhq/mcp-wassenger, or the Wassenger API docs at https://app.wassenger.com/docs.

## How these tools are shaped

Most Wassenger tools are **action-based**: a single tool (e.g. `send_whatsapp_message`, `manage_whatsapp_team`) takes a required `action` parameter that selects the operation, plus the parameters that operation needs. Two consequences worth memorising:

- The selector parameter is **`action`** (not `operation`).
- `send_whatsapp_message` addresses the recipient with **`chat`** — a WhatsApp ID / WID such as `34600111222@c.us` — **not** a `phone` field.

Almost every tool also takes an optional **`device`** (the 24-hex device ID). If the account has a single connected number it is auto-selected; with multiple numbers, pass it explicitly. Get device IDs from `get_whatsapp_devices`.

---

## Messaging

### `send_whatsapp_message`

Send any outbound message. One tool, selected by `action`.

**Required:** `action` + `chat`.

| Parameter | Type | Notes |
|---|---|---|
| `action` | enum | `text`, `template`, `media`, `location`, `contact`, `poll`, `event`, `scheduled`, `live`, `expiring`, `agent`. |
| `chat` | string | Recipient WID, e.g. `34600111222@c.us`. **Required.** (No `phone` field.) |
| `device` | string | Device ID. Optional unless you have multiple numbers. |
| `message` | string | Text body (for `text`/`scheduled`/`live`/`expiring`/`agent`; also used as a media caption). |
| `media` | object | `{ file: <fileId> }` or `{ url: <publicUrl> }`, plus optional `filename`, `format` (`gif`/`ptt`/`native`), `viewOnce`. |
| `location` | object | `{ coordinates: [lat, lng], name?, address? }`. |
| `contacts` | array | For `contact` action: up to 10 `{ name, phone, email?, organization?, url? }`. |
| `poll` | object | `{ question, options: [2–12 strings], multipleAnswers?, secret? }`. |
| `template` | object | For `template` action — see shape below. Use outside the 24h window. |
| `deliverAt` / `delay` / `delayTo` | ISO date / sec / `"1h"` | For `scheduled` action. |
| `expiration` | `"1h"`,`"30m"`,`"2d"` | For `expiring` action (message auto-deletes after TTL). |
| `reference` | string | Custom ID for delivery tracking (this is the field webhooks echo back). |
| `previewUrl` | boolean | Toggle link preview (text/template). Default `true`. |
| `actions` | array | For `agent` action — post-delivery side effects, see below. |

**Template payload** (`action: "template"`) — *not* Meta-style `components`:

```jsonc
{
  "action": "template",
  "chat": "34600111222@c.us",
  "template": {
    "name": "reservation_reminder",
    "language": "es",
    "header": { "media": { "url": "https://…/banner.jpg", "type": "image" } },   // or { "text": { "name": "1", "value": "Marta" } } / { "location": {…} }
    "body": [ { "name": "1", "value": "Marta" }, { "name": "2", "value": "20:00" } ],
    "button": [ { "type": "url", "position": 0, "name": "1", "value": "abc123" } ]  // quick_reply | url | copy_code | mpm | flow
  }
}
```

Template buttons are defined and approved at template-creation time; here you only fill their dynamic values (URL suffix, quick-reply payload, coupon code) via `template.button[]`. There is **no** top-level `buttons` parameter.

**`agent` action — send + side effects.** Use `action: "agent"` with `agentId` and an `actions` array to send a message *and* mutate the chat in one call. This is how you apply a label, assign, or resolve while replying:

```jsonc
{
  "action": "agent", "chat": "34600111222@c.us", "agentId": "<24hex>",
  "message": "Thanks! Marking this resolved.",
  "actions": [
    { "action": "labels:add", "params": { "labels": ["vip"] } },
    { "action": "chat:resolve" }
  ]
}
```
Supported `actions[].action`: `chat:assign`, `chat:unassign`, `chat:resolve`, `chat:unresolve`, `chat:read`, `chat:unread`, `labels:add`, `labels:remove`, `labels:set`, `metadata:set`, `metadata:add`, `metadata:remove`.

**Example prompts:**

- "Send 'Your order #1234 is ready for pickup' to 44770090011@c.us from device <id>."
- "Schedule 'Don't forget our meeting tomorrow' to deliver at 9am to 15550100@c.us."
- "Send the `reservation_reminder` template in Spanish to 34600111222@c.us with 1=Marta, 2=20:00."

### `list_whatsapp_templates`

List approved WABA message templates for a device. Required for any template send.

| Parameter | Type | Notes |
|---|---|---|
| `device` | string | Device ID. **Required.** |
| `status` | enum | `APPROVED` (default), `PENDING`, `REJECTED`, `DELETED`. |
| `size` | number | Max results (1–500, default 500). |

**Example prompts:** "Show me all approved templates on device <id>."

### `manage_whatsapp_message_interactions`

Replies, forwards, reactions, and poll votes. **Required:** `action` + `chat`.

| Action | Parameters |
|---|---|
| `reply` | `quote` (message ID to reply to) + `message`; optional `selectId` to pick a button/list option on an interactive message. |
| `forward` | `forward: { chat: <sourceChat>, message: <messageId> }`. |
| `reaction` | `reactionMessage` (message ID) + `reaction` (emoji; use `"-"` to remove). |
| `vote` | `vote: { message: <pollMessageId>, options: [indices] }` (empty array clears votes). |

> There is **no delete-message operation** in the MCP. (`delete-for-me` / `delete-for-all` do not exist.)

---

## Conversations

### `get_whatsapp_chats`

Unified chat retrieval. **Required:** `device`. Pick the view with `action` (default `recent`). Thin convenience wrappers also exist (`get_whatsapp_unread_chats`, `get_whatsapp_archived_chats`, `get_whatsapp_assigned_chats`, `get_whatsapp_chats_by_status`, `get_whatsapp_chats_by_contact_type`, `get_whatsapp_chats_by_date_range`, `get_whatsapp_chat_by_id`, `search_whatsapp_chats_by_name`) — they call the same backend, so the unified tool below is the canonical reference.

| Parameter | Type | Notes |
|---|---|---|
| `device` | string | **Required.** |
| `action` | enum | `recent`, `unread`, `by_status`, `assigned`, `by_contact_type`, `by_id`, `search`, `archived`, `by_date_range`. |
| `limit` | number | Default 20, **max 100**. |
| `sortBy` | enum | `lastMessageAt`, `unreadCount`, `statusUpdatedAt`. |
| `sortOrder` | enum | `asc` / `desc`. |
| `status` | array | For `by_status`: `removed`, `banned`, `archived`, `muted`, `pending`, `active`, `resolved`. |
| `agentId` / `departmentId` | string | For `assigned`. |
| `contactTypes` | array | For `by_contact_type`: `chat`, `group`, `channel`, `broadcast` (WABA uses `chat`). |
| `chatId` | string | For `by_id`. Returns the full record including `lastInboundAt`. |
| `query` / `exactMatch` | string / bool | For `search`. |
| `fromDate` / `toDate` | ISO date | For `by_date_range`. |
| `archivedAfter` / `archivedBefore` | ISO date | For `archived`. |
| `minUnreadCount` | number | For `unread` (default 1). |

> There is no `assignedTo` parameter — assigned filtering uses **`agentId`**. There is no `labels` filter — to report by label, pull chats and filter on each `chat.labels[]` client-side.

### `get_whatsapp_chat_statistics`

Aggregate counts for a device (by status / agent / department / contact type / time bucket).

| Parameter | Type | Notes |
|---|---|---|
| `device` | string | **Required.** |
| `groupBy` | enum | `status` (default), `agent`, `department`, `contactType`, `day`, `week`, `month`. |
| `fromDate` / `toDate` | ISO date | Period bounds. |
| `includeInactive` | boolean | Include removed/banned chats. |

---

## Chat messages

### `get_whatsapp_chat_messages`

Pull message history. **Required:** `action` (and `chat` for every action except `by_id` and `search`). Backed by the device-scoped Chat Messages endpoint (requires a Platform subscription on the device).

| Parameter | Type | Notes |
|---|---|---|
| `action` | enum | `recent`, `search`, `date_range`, `by_sender`, `by_type`, `by_id`, `thread`, `media`. |
| `chat` | string | Chat WID. Required except for `by_id` / device-wide `search`. |
| `device` | string | Device ID, phone, or alias. Optional if single device. |
| `query` | string | For `search`. |
| `fromDate` / `toDate` | ISO date | For `date_range`. |
| `sender` | string | Phone/WID, for `by_sender`. |
| `messageTypes` | array | For `by_type`: `text`,`image`,`video`,`audio`,`document`,`location`,`contact`,`poll`,`event`,`sticker`,`reaction`,`system`. |
| `messageId` | string | For `by_id` / `thread`. |
| `contextBefore` / `contextAfter` | number | For `thread` (0–20). |
| `limit` | number | Default 20, **max 50**. |

> Device-wide aggregation isn't a single call: `by_type` / `by_sender` need a `chat`. To total message types across a device, loop per chat or use `analyze_whatsapp_chats` export.

### `analyze_whatsapp_chats`

Chat-level analytics and export. **Required:** `action` + `device`.

| Action | Notes |
|---|---|
| `statistics` | Activity stats grouped by `hour`/`day`/`week`/`month`. |
| `export` | Export chat list as `json` / `csv` / `txt`. |

### `analyze_whatsapp_chat_messages`

Message-level delivery status and export for a chat. **No sentiment / summary / intent extraction** — for those, read the messages and analyse them in-agent.

---

## Devices & contacts

### `get_whatsapp_devices`

List all connected devices. Use the result to pick a `device` ID.

### `get_whatsapp_device_details`

Single-device record: status, phone, plan, current WABA conversation tier, session metadata.

### Contacts

> **There is no general contacts tool in the MCP** (`get_contacts` / `search_contacts` / `export_contacts` do not exist). Contact data reaches you three ways:
> - `search_whatsapp_chats_by_name` — find a chat (and its embedded `contact`) by name.
> - `manage_whatsapp_campaign_contacts` — manage recipients **inside a campaign** (`search` / `add` / `remove`).
> - `verifyWhatsAppNumberExists` — check a number is on WhatsApp.
>
> For standalone contact CRUD / CSV import / segmentation, call the Wassenger REST API `/contacts` endpoints directly (see `wassenger-contacts`). The chat object also embeds the contact under `chat.contact`.

---

## Multi-agent inbox

### `manage_whatsapp_team`

Team-member lifecycle and device access. **Required:** `action`.

| Action | Key parameters |
|---|---|
| `search` | `query`, `role`, `status`, `department`, `limit`, `offset` |
| `get` | `userId` |
| `create` | `name` + `email` (required); optional `role`, `phoneNumber`, `language`, `timezone`, `permissions`, `sendInvitation` |
| `update` | `userId` + fields to change |
| `delete` | `userId` (or `userIds`); `force`, plus `chatAction` (`reassign`/`resolve`/`unassign`) and `reassignTo` |
| `grant_access` | `device` + `userIds` + `deviceRole` (+ `devicePermissions`) |
| `revoke_access` | `device` + `userIds` (+ `chatAction`, `reassignTo`) |

**Roles:** `admin`, `supervisor`, `agent`. (There is no `readonly` role — restrict an agent via `permissions`/`devicePermissions` instead.) Members are identified by **`userId`/`userIds`**, never a `member` field.

### `manage_whatsapp_departments`

**Required:** `device` + `action` (`list` / `create` / `update` / `delete`).

| Action | Key parameters |
|---|---|
| `create` | `name` + `agents: [agentId…]`; optional `description`, `color` (palette), `icon` (enum) |
| `update` | `departmentId` + fields |
| `delete` | `departmentId` (agents are preserved) |

> Departments have no chat-assignment action. Assigning a chat to a department/agent is done via `send_whatsapp_message` `action:agent` (`chat:assign`) or the REST chat-update endpoint.

### `manage_whatsapp_labels`

**Required:** `device` + `action` (`list` / `create` / `update` / `delete`).

| Action | Key parameters |
|---|---|
| `list` | `filterByScope` (`chat`/`wa`), `activeOnly`, `includeMetadata` |
| `create` | `name` + `color` (palette, required); optional `description` |
| `update` | `name` + `color`/`description` |
| `delete` | `name` + `confirmDeletion: true` |

**Color** is a fixed palette, not hex: `ruby`, `tomato`, `orange`, `sunflower`, `bubble`, `rose`, `poppy`, `rouge`, `raspberry`, `purple`, `lavender`, `violet`, `pool`, `emerald`, `kelly`, `apple`, `turquoise`, `aqua`, `gold`, `latte`, `cocoa`, `iron`.

> This tool is **CRUD only** — there is no `apply`/`unapply`. To attach/detach a label on a chat, use `send_whatsapp_message` `action:agent` with `labels:add` / `labels:remove` / `labels:set` (see the `agent` action above), or the REST chat endpoint.

### `manage_whatsapp_queue`

Outbound-queue control. **Required:** `device` + `action`.

| Action | Notes |
|---|---|
| `get_status` | Queue stats (pending / processing / etc.). |
| `update_status` | `status`: `pause`, `active` (= resume), `reject`, `freeze`; optional `force` to flush with no delay for 30 min. |
| `delete_messages` | `filters` by `messageIds` / `phoneNumbers` / `groupIds` / `dateRange` (max 500); `skipScheduled`, `waitForCompletion`. |

> There is no standalone `pause`/`resume`/`reject` action — they are `status` values passed to `update_status`. Resume = `status: "active"`.

---

## Outbound campaigns

### `manage_whatsapp_campaigns`

Bulk messaging. **Required:** `action` (`search` / `get` / `create` / `update` / `start` / `stop` / `delete`).

| Action | Key parameters |
|---|---|
| `search` | `status[]` (`draft`/`pending`/`processing`/`completed`/`failed`/`stopped`/`paused`/`incomplete`), `after`/`before`, `phone[]`, `owner[]`, `page`, `size` |
| `get` | `campaignId` |
| `create` | `name` + `device` + `message` + `contacts[]`; optional `settings`, `unsubscribe`, `activate` |
| `update` | `campaignId` + fields |
| `start` / `stop` / `delete` | `campaignId` |

- **`contacts[]`**: `{ phone, name?, message?, reference?, variables: [{ key, value }] }` — `variables` personalise the message per recipient.
- **`settings`**: `{ date: <ISO schedule>, speed: "0.2".."5" (messages/min) }`.
- **`unsubscribe`**: `{ active: true, word: "stop", message, actions: [{ action: "message:send" | "metadata:add", params }] }` — built-in opt-out handling.

> There is no `template` / `deliverAt` parameter and no `stats` / `results` action. Track delivery with `get` / `search` (status filter) or webhooks. For per-recipient state use `manage_whatsapp_campaign_contacts` `search` with a `status` filter.

### `manage_whatsapp_campaign_contacts`

Manage a campaign's recipients. **Required:** `campaignId` + `action` (`search` / `add` / `remove`).

- `add` — `contacts: [{ phone, name?, variables? }]`.
- `search` — filter by `status` (`pending`/`processing`/`delivered`/`failed`), `kind`, `target`, paginated.
- `remove` — by `phones` / `groups` / `channels` / `wids`.

---

## Files

| Tool | Purpose |
|---|---|
| `upload_whatsapp_file_from_url` | Upload a remote file into Wassenger storage; returns a `file.id` to attach to a send. |
| `search_whatsapp_chat_files` / `search_whatsapp_outbound_files` | Find files in conversations / outbound messages. |
| `get_whatsapp_file_details` / `get_whatsapp_chat_file_details` | Single-file metadata. |
| `update_whatsapp_file_metadata` | Rename / tag / set expiration. |
| `download_whatsapp_file` / `download_whatsapp_chat_file` | Stream file content back. |
| `delete_whatsapp_file` | Remove a file from storage. |
| `export_whatsapp_chats` | Generate a downloadable archive of a chat / chat list. |

---

## Numbers

### `verifyWhatsAppNumberExists`

Check whether a phone number is registered on WhatsApp without sending. Powers https://app.wassenger.com/whatsapp-number-tester.

| Parameter | Type | Notes |
|---|---|---|
| `phoneNumber` | string | E.164 (e.g. `+34600111222`). **Required.** (This tool takes no `device`.) |

Run it before the first outbound to an unknown contact — saves quota and avoids failed sends.

---

## Health

### `ping` / `health_check`

`ping` returns server status + timestamp (optional `message` echoed back). `health_check` verifies API connectivity. Use either as the first call when troubleshooting.

---

## Patterns

### Pattern: "Send a one-off message"

1. `get_whatsapp_devices` → pick a `ready` device.
2. (Optional) `verifyWhatsAppNumberExists` for an unknown contact.
3. `get_whatsapp_chats` `action:by_id` → check `lastInboundAt` (decides free-form vs template).
4. `send_whatsapp_message` `action:text` with `chat` + `message` — or `action:template` if outside the 24h window.

### Pattern: "Broadcast to a segment"

1. Build the audience: `manage_whatsapp_campaigns` `action:create` with `contacts[]`, or import via `manage_whatsapp_campaign_contacts` `action:add`.
2. `list_whatsapp_templates` → pick an `APPROVED` template (WABA bulk outbound is template-based).
3. `manage_whatsapp_campaigns` `action:start`.
4. Track via `action:get` (status) or webhooks; per-recipient via `manage_whatsapp_campaign_contacts` `action:search`.

### Pattern: "Reply to a customer in a multi-agent inbox"

1. `get_whatsapp_chats` `action:by_status` with `status:["active"]` (or `action:assigned` + `agentId`).
2. `get_whatsapp_chat_messages` `action:recent` to load context.
3. `manage_whatsapp_message_interactions` `action:reply` with `quote` for a threaded reply (or `send_whatsapp_message` `action:text` for a plain reply).
4. Tag + assign in one step with `send_whatsapp_message` `action:agent` (`labels:add`, `chat:assign`).

### Pattern: "Set up a 24h template reminder"

1. `get_whatsapp_chats` `action:by_id` → read `lastInboundAt`.
2. If `> 24h ago`, `list_whatsapp_templates` → pick the right `APPROVED` template.
3. `send_whatsapp_message` `action:template` with the `template` payload populated.
