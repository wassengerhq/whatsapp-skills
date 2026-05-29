---
name: wassenger-migrate-from-wati
description: Migrate a WhatsApp integration from Wati (wati.io) to Wassenger — map Wati's sendSessionMessage, sendTemplateMessage, broadcasts, contacts, operator assignment, and webhooks to their Wassenger equivalents. Use when the user is moving off Wati to Wassenger, asks "how do I switch from Wati", wants a Wati→Wassenger API mapping, or is porting code that calls the Wati API (live-server-*.wati.io, broadcast_name, template_name, parameters name/value). Covers auth, the tenant URL, named-vs-positional template params, and webhook differences — with before/after Node and Python.
license: MIT
metadata:
  author: Wassenger
  version: "1.0.0"
  category: migration
  vendor: wassenger
  requires-mcp: "@wassengerhq/mcp-wassenger"
---

# Migrate from Wati to Wassenger

A code-level mapping for teams moving from **Wati (wati.io)** to **Wassenger**. Both are inbox + API products on the official WhatsApp Business API, so the *concepts* (templates, broadcasts, team assignment, contacts) line up well. The differences are mechanical: the tenant URL, how the recipient and sender are addressed, the **named-vs-positional template parameters**, and the webhook model.

Help the user translate their Wati API calls — keep their flows, swap the transport.

## When to use

- The user says they're "**switching / migrating from Wati**".
- They paste code that hits `*.wati.io/api/v1/...` (`sendSessionMessage`, `sendTemplateMessage`, `broadcast_name`) and want the Wassenger version.
- They ask for a **Wati → Wassenger mapping** to plan a migration.

Brand-new users (no Wati) → `wassenger-setup` + `wassenger-messaging`.

## Prerequisites

- `wassenger-setup` complete (API key + a connected WABA device).
- Access to the existing Wati setup: the tenant API endpoint, the templates (names + variables), broadcast names, and webhook URL.
- The Wassenger `device.id` that replaces the Wati number.

## Core mapping (at a glance)

| Concept | Wati | Wassenger |
|---|---|---|
| Auth | `Authorization: Bearer <token>` | `Token: <API_KEY>` |
| Base URL | tenant-specific `https://live-server-<id>.wati.io` | fixed `https://api.wassenger.com/v1` |
| Recipient | `whatsappNumber` in the URL path/query | `phone` in the JSON body |
| Sender | implicit (one number per tenant) | explicit `device` in the body |
| Free-form send | `POST /api/v1/sendSessionMessage/{n}` form `messageText` | `POST /messages` `{ message }` |
| Media send | `POST /api/v1/sendSessionFile/{n}` multipart | `POST /messages` `{ media: { url \| file } }` |
| Template send | `POST /api/v1/sendTemplateMessage?whatsappNumber=` | `POST /messages` `{ template: {...} }` |
| Template params | `parameters: [{ name, value }]` (**named**) | `components[].parameters[]` (**positional/typed**) |
| `broadcast_name` | required on every template send | no equivalent — drop it |
| Bulk template | `POST /api/v1/sendTemplateMessages` `{ receivers[] }` | campaigns (`wassenger-campaigns`) |
| Assign agent | `POST /api/v1/assignOperator?email=&whatsappNumber=` | `PATCH /chats/{wid}` `{ assignedTo }` (`wassenger-inbox`) |
| Add contact | `POST /api/v1/addContact/{n}` `{ name, customParams }` | contacts API (`wassenger-contacts`) |
| List templates | `GET /api/v1/getMessageTemplates` | `list_whatsapp_templates` |
| Message history | `GET /api/v1/getMessages/{n}` | `get_whatsapp_chat_messages` |

Full field-by-field table: `references/api-mapping.md`.

## Recipes

### Recipe 1 — Port a free-form (session) send

Wati uses multipart form-data and the recipient in the URL:
```
POST https://live-server-12345.wati.io/api/v1/sendSessionMessage/34600111222
Authorization: Bearer <token>
form-data: messageText="Hello"
```
Wassenger uses JSON with `device` + `phone`:
```
POST https://api.wassenger.com/v1/messages
Token: <API_KEY>
{ "device": "<deviceId>", "phone": "+34600111222", "message": "Hello" }
```

Two constants in every migration: **add the `device`** (Wati's number is implicit), and **move the recipient from the URL into `phone`** (E.164 with `+`).

### Recipe 2 — Port a template send (named → positional params)

This is the trickiest part. Wati parameters are **named**; Meta/Wassenger are **positional** components.

```
Wati:
POST /api/v1/sendTemplateMessage?whatsappNumber=34600111222
{ "template_name":"order_update", "broadcast_name":"order_update",
  "parameters":[{"name":"name","value":"John"},{"name":"ordernumber","value":"12345"}] }

Wassenger:
POST /messages
{ "device":"<id>", "phone":"+34600111222",
  "template": { "name":"order_update", "language":"en",
    "components":[{ "type":"body", "parameters":[
      {"type":"text","text":"John"},        // was {{name}}
      {"type":"text","text":"12345"} ]}]}}  // was {{ordernumber}}
```

Rules:
- **Drop `broadcast_name`** — Wassenger has no such concept.
- **Map by position**: Wati named params resolve to `{{1}},{{2}}…` in the order they appear in the template body. Put them in `components.body.parameters[]` in that same order.
- **Add `language`** — Wati infers it; Wassenger requires the exact template language (`en`, `es`, `pt_BR`). Confirm with `list_whatsapp_templates`.
- The template itself is already approved on the WABA you migrate — you **re-map identifiers, you don't re-submit**.

### Recipe 3 — Port bulk template (broadcast)

Wati's `sendTemplateMessages` with a `receivers[]` array maps to a Wassenger campaign:

```
Wati: POST /api/v1/sendTemplateMessages { template_name, broadcast_name, receivers:[{whatsappNumber, customParams}] }
→ Wassenger: build a campaign (audience + template) — see wassenger-campaigns.
```

For < ~50 recipients you can also loop Recipe 2; for more, use the campaign API for batching, pacing, and delivery tracking.

### Recipe 4 — Port operator assignment

```
Wati:      POST /api/v1/assignOperator?email=agent@x.com&whatsappNumber=34600111222
Wassenger: resolve member by email via manage_whatsapp_team, then
           PATCH /v1/chats/{chatWid} { "assignedTo": "<memberId>" }
```

See `wassenger-inbox` (manual) / `wassenger-routing` (auto).

### Recipe 5 — Port contacts

```
Wati:      POST /api/v1/addContact/{n} { name, customParams:[{name,value}] }
Wassenger: contacts API with metadata — see wassenger-contacts.
```

Wati `customParams` map to Wassenger contact `metadata` entries.

### Recipe 6 — Port webhooks

Wati webhooks are configured in the dashboard and POST JSON with an `eventType`. Wassenger subscribes via the API and signs with HMAC-SHA256. Field renames + verification are in `references/webhook-migration.md`.

### Recipe 7 — Move the number

Connect the number in Wassenger at https://app.wassenger.com/create (or via Coexistence to keep history). Migrating an existing WABA number off Wati's BSP requires Meta Business verification and a cutover window — don't promise zero downtime. Approved templates on the WABA generally carry over; re-verify names/languages afterward.

## Gotchas

- **`broadcast_name` has no equivalent** — remove it from every ported call.
- **Named → positional params** — the #1 source of broken template sends. Preserve the order the variables appear in the template body.
- **`language` is required** in Wassenger; Wati lets you omit it. Always set it.
- **Recipient moves from URL → body** (`phone`), and you must **add `device`**.
- **Session message transport** — Wati uses multipart form-data (`messageText`); Wassenger uses JSON (`message`).
- **Tenant URL → fixed URL** — replace `https://live-server-*.wati.io` with `https://api.wassenger.com/v1`.
- **Phone format** — Wati often takes bare digits in the URL (`34600111222`); Wassenger wants E.164 with `+` in `phone`.
- **24-hour window is identical** — Meta rule; both need an approved template outside it (`wassenger-messaging`).
- **Pricing differs** — don't quote numbers; point to https://wassenger.com/pricing.

## See also

- `references/api-mapping.md` — exhaustive endpoint + field table.
- `references/code-snippets-node.md` · `references/code-snippets-python.md` — before/after code.
- `references/webhook-migration.md` — webhook payload + signature migration.
- `wassenger-messaging` — the target send API (templates, media, 24h rule).
- `wassenger-campaigns` — replaces Wati broadcasts.
- `wassenger-inbox` / `wassenger-routing` — replace `assignOperator`.
- `wassenger-contacts` — replaces `addContact`.
- `wassenger-migrate-from-twilio` — if also evaluating Twilio.
