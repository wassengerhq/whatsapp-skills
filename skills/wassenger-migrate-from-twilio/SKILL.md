---
name: wassenger-migrate-from-twilio
description: Migrate a WhatsApp integration from Twilio to Wassenger — map Twilio's Messages API, media, content templates, scheduling, status callbacks, and inbound webhooks to their Wassenger equivalents. Use when the user is moving off Twilio WhatsApp (or Twilio Conversations) to Wassenger, asks "how do I switch from Twilio", wants a Twilio→Wassenger API mapping, or is porting code that calls api.twilio.com Messages to Wassenger. Covers auth, phone formats, send/receive, templates, and webhook signature differences — with before/after Node and Python.
license: MIT
metadata:
  author: Wassenger
  version: "1.0.0"
  category: migration
  vendor: wassenger
  requires-mcp: "mcp-wassenger"
---

# Migrate from Twilio to Wassenger

A factual, code-level mapping for teams moving a WhatsApp integration from **Twilio's Programmable Messaging / Conversations API** to **Wassenger** on the official WhatsApp Business API. Both sit on the same Meta WABA underneath, so the concepts line up — the differences are auth, phone formatting, the template model, and webhook shape.

This skill helps the agent translate existing Twilio code, not rewrite the user's business logic. Keep the user's flows intact; swap the transport.

## When to use

- The user says they're "**switching / migrating from Twilio**" for WhatsApp.
- They paste code that hits `api.twilio.com/.../Messages.json` and want the Wassenger version.
- They ask "what's the **Twilio equivalent** in Wassenger?" for sending, templates, media, or webhooks.
- They want a **side-by-side mapping** to plan a migration.

If the user is brand-new (no Twilio), skip this and go to `wassenger-setup` + `wassenger-messaging`.

## Prerequisites

- `wassenger-setup` complete (API key + a connected WABA device).
- Access to the existing Twilio code or account (to read From/To, ContentSid templates, webhook URLs).
- The Wassenger `device.id` that will replace the Twilio sender number.

## Core mapping (at a glance)

| Concept | Twilio | Wassenger |
|---|---|---|
| Auth | HTTP Basic `AccountSid:AuthToken` | header `Token: <API_KEY>` |
| Base URL | `https://api.twilio.com/2010-04-01/Accounts/{Sid}` | `https://api.wassenger.com/v1` |
| Send | `POST /Messages.json` | `POST /messages` |
| Sender | `From: "whatsapp:+14155238886"` | `device: "<deviceId>"` |
| Recipient | `To: "whatsapp:+34600111222"` | `phone: "+34600111222"` (no prefix) |
| Text body | `Body` | `message` |
| Media | `MediaUrl` (1+) | `media: { url }` or `{ file }` |
| Template | `ContentSid` + `ContentVariables` | `template: { name, language, body }` |
| Schedule | `ScheduleType=fixed` + `SendAt` (needs Messaging Service) | `deliverAt` (ISO 8601) |
| Message ID | `MessageSid` (`SMxx␣…`) | `message.id` |
| Status webhook | `StatusCallback` URL | webhook subscription, events `message:out:*` |
| Inbound webhook | form-encoded POST on the number | JSON POST, `POST /v1/webhooks` with `events[]` |
| Signature | `X-Twilio-Signature` — HMAC-SHA1 over URL+sorted params | `X-Wassenger-Signature: sha256=` — HMAC-SHA256 over **raw body** |

Full field-by-field table: `references/api-mapping.md`.

## Recipes

### Recipe 1 — Port a send call

> "Here's my Twilio send code, give me the Wassenger version."

Twilio:
```
POST https://api.twilio.com/2010-04-01/Accounts/{Sid}/Messages.json
Auth: Basic {Sid}:{AuthToken}
From=whatsapp:+14155238886  To=whatsapp:+34600111222  Body=Hello
```
Wassenger:
```
POST https://api.wassenger.com/v1/messages
Header: Token: <API_KEY>
{ "device": "<deviceId>", "phone": "+34600111222", "message": "Hello" }
```

Two mechanical edits dominate every migration: **strip the `whatsapp:` prefix** from numbers, and **replace `From` with `device`**. Full before/after in `references/code-snippets-node.md` and `references/code-snippets-python.md`.

### Recipe 2 — Port templates

Twilio uses an opaque `ContentSid` (created in the Content Builder) plus `ContentVariables`. Wassenger uses Meta's native template identity: `name` + `language` + `components`.

```
Twilio:    ContentSid="HXxxxx…", ContentVariables='{"1":"Pablo","2":"20:00"}'
Wassenger: template: { name: "reservation_reminder", language: "es",
             body: [ { name: "1", value: "Pablo" }, { name: "2", value: "20:00" } ] }
```

Map each Content variable `{{1}},{{2}}` to the matching `template.body[]` slot (positional `name`, the value in `value`). Confirm the template exists and is approved with `list_whatsapp_templates` (same Meta approval carries over — you do **not** re-submit if the template is already approved on the WABA you're moving). See `references/api-mapping.md` for header/button component mapping.

### Recipe 3 — Port the inbound webhook

The biggest code change. Twilio sends **form-encoded** params and signs with **SHA-1 over URL+params**; Wassenger sends **JSON** and signs with **SHA-256 over the raw body**. Field renames + the new verification function are in `references/webhook-migration.md`.

```
Twilio inbound:   From, To, Body, NumMedia, MediaUrl0, ProfileName, WaId, MessageSid
Wassenger inbound: event="message:in:new", data.message.from, data.message.body, data.message.id
Subscribe:        POST /v1/webhooks { url, events:["message:in:new"], device }
```

### Recipe 4 — Port status callbacks

Twilio's per-message `StatusCallback` (`MessageStatus`: queued/sent/delivered/read/failed) becomes a Wassenger webhook subscription to the `message:out:*` events:

```
queued/sent → message:out:sent   delivered → message:out:delivered
read        → message:out:read   failed    → message:out:failed
```

One account/device-wide subscription replaces per-message callback URLs.

### Recipe 5 — Move the number

- **Twilio-hosted WhatsApp sender** → you migrate the number's WABA registration to the Wassenger BSP. This requires Meta Business verification and a number-migration step; don't promise zero-downtime — plan a cutover window.
- Connect the number in Wassenger at https://app.wassenger.com/create (or via Coexistence to keep history). See `wassenger-setup`.
- Approved templates tied to the WABA generally carry over; re-verify names/languages with `list_whatsapp_templates` after migration.

## Gotchas

- **`whatsapp:` prefix** — Twilio requires it on `From`/`To`; Wassenger rejects it. Strip it everywhere.
- **Sender identity** — Twilio routes by `From` number; Wassenger routes by `device` ID. Resolve the device once and reuse it.
- **Template re-mapping** — `ContentSid` is Twilio-specific and does not exist in Wassenger. You must map back to the Meta template `name`/`language`. Keep a `ContentSid → {name,language}` lookup during migration.
- **Webhook signature algorithm differs** — SHA-1(URL+params) vs SHA-256(raw body). A copied Twilio validator will reject every Wassenger event. Replace it (see `wassenger-webhooks`).
- **Form vs JSON** — Twilio inbound is `application/x-www-form-urlencoded`; Wassenger is `application/json`. Update your body parser.
- **Scheduling** — Twilio needs a Messaging Service for `SendAt`; Wassenger takes `deliverAt` directly on the send.
- **24-hour window is identical** — it's a Meta rule, not a vendor one. Both require an approved template outside the window (`wassenger-messaging`).
- **Pricing models differ** — don't quote specific numbers; direct the user to https://wassenger.com/pricing.

## See also

- `references/api-mapping.md` — exhaustive endpoint + field table.
- `references/code-snippets-node.md` · `references/code-snippets-python.md` — before/after code.
- `references/webhook-migration.md` — webhook payload + signature migration.
- `wassenger-messaging` — the target send API in depth.
- `wassenger-webhooks` — the target webhook model + signature verification.
- `wassenger-setup` — connect the device that replaces the Twilio sender.
- `wassenger-migrate-from-wati` — if also evaluating Wati.
