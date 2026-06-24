---
name: wassenger-messaging
description: Send WhatsApp messages with Wassenger on the official WhatsApp Business API — text, images, video, audio, documents, locations, contact cards, polls, scheduled, and agent-attributed messages. Use when the user wants to send any kind of message via WhatsApp through their connected WABA device. Bakes in the 24-hour customer service window and the pre-approved template flow so the agent picks free-form vs template automatically.
license: MIT
metadata:
  author: Wassenger
  version: "1.0.0"
  category: capability
  requires-mcp: "mcp-wassenger"
---

# Wassenger Messaging

Send any kind of WhatsApp message through Wassenger — the agent picks free-form vs template automatically based on the 24-hour rule, and uploads media correctly.

## When to use

- The user asks to send a message, reminder, confirmation, notification, or alert to a WhatsApp number.
- The user wants to schedule a message for later or send a poll.
- The user asks "how do I send a template?" or hits a 24-hour-window error from another skill.
- A higher-level industry skill (`wassenger-ecommerce`, `wassenger-restaurants`, …) calls down here for the actual send.

If the user wants to broadcast to many contacts at once, route to `wassenger-campaigns` — campaigns have batching, scheduling, and quota controls that single-message sends do not.

## Prerequisites

- `wassenger-setup` complete (API key + MCP installed).
- At least one device with `status: ready` — fetch with `get_whatsapp_devices` if you don't have its ID yet.
- For media: either a public URL or a previously-uploaded `file.id` (see Recipe 3).

## The 24-hour rule (read this first)

Every send falls into one of two modes:

| Mode | When it applies | Tool to call |
|---|---|---|
| **Free-form** | The recipient sent a message to this device in the last 24 hours. | `send_whatsapp_message` with `action:"text"` / `"media"` / `"poll"` / etc. |
| **Template** | The last inbound message is older than 24 hours, **or** no prior conversation exists. | `send_whatsapp_message` with `action:"template"` + `template: { name, language, body, … }`. |

**Decision flow:**

1. Get the chat: `get_whatsapp_chat_by_id` (or fall back to `search_whatsapp_chats_by_name`).
2. Inspect `chat.lastInboundAt`. If absent or `> 24 h ago` → use a template.
3. Otherwise → free-form.

List approved templates with `list_whatsapp_templates` before sending — only templates with `status: APPROVED` work, and you must match the `language` of the template (e.g., `es`, `en_US`, `pt_BR`).

## Recipes

### Recipe 1 — Send a plain text message

> "Send 'Tu pedido #1234 está listo para recoger' to +34 600 111 222 from my main device."

```
1. get_whatsapp_devices → pick the ready device, store device.id
2. (optional) verifyWhatsAppNumberExists with the phone (takes E.164, e.g. "+34600111222")
3. send_whatsapp_message
   - device: <device.id>
   - action: "text"
   - chat: "34600111222@c.us"
   - message: "Tu pedido #1234 está listo para recoger"
```

Report back the returned `message.id` so the user can track delivery.

### Recipe 2 — Send a media message (PDF receipt)

> "Send this PDF receipt to my client +1 555 0100."

If the user has a public URL:

```
send_whatsapp_message
  - device: <id>
  - action: "media"
  - chat: "15550100@c.us"
  - media: { url: "https://example.com/receipt.pdf" }
  - message: "Here is your receipt"  # optional caption — there is no `caption` param
```

If they have a local file, upload it first:

```
1. upload_whatsapp_file_from_url with the public URL
   → returns file.id
2. send_whatsapp_message with action: "media", media: { file: <file.id> }
```

Supported media: images (jpg/png/webp), audio (ogg/mp3), video (mp4), documents (pdf, docx, xlsx, txt, …). Approximate WhatsApp limits: images ~5 MB, audio ~16 MB, video and documents up to ~100 MB (uploaded via resumable upload).

### Recipe 3 — Send a WABA template (outside the 24h window)

> "Remind everyone who has a reservation tomorrow at 8pm."

Assuming a `reservation_reminder` template approved in Spanish with variables `{{1}}=customer_name`, `{{2}}=time`:

```
1. list_whatsapp_templates with device + status=APPROVED
   → confirm "reservation_reminder" exists
2. For each contact:
   send_whatsapp_message
     - device: <id>
     - action: "template"
     - chat: <contact.wid>            # e.g. "34600111222@c.us"
     - template:
         name: "reservation_reminder"
         language: "es"
         body: [{ name: "1", value: contact.name }, { name: "2", value: "20:00" }]
```

If the template has a header image or a dynamic button, populate `template.header` and `template.button[]` (not Meta-style `components`). The header takes `{ media: { url, type } }`, `{ text: { name, value } }`, or `{ location: {…} }`; each button is `{ type, position, name, value }`. There is **no** top-level `buttons` parameter. `list_whatsapp_templates` returns the expected variables per template.

### Recipe 4 — Schedule for later

> "Schedule a Good Morning message to my list at 8am tomorrow."

Use `action:"scheduled"` with `deliverAt` (ISO 8601) — or `delay` (seconds) / `delayTo` (`"1h"`). `deliverAt` is only valid with the scheduled action:

```
send_whatsapp_message
  - device: <id>
  - action: "scheduled"
  - chat: "34600111222@c.us"
  - message: "Good morning! ☀️"
  - deliverAt: "2026-05-28T08:00:00+02:00"
```

Wassenger queues the message and dispatches it at the requested time. Use `manage_whatsapp_queue` with `action:"get_status"` to verify it landed in the queue.

### Recipe 5 — Send a poll

> "Ask my customer Marta which day works better — Friday, Saturday or Sunday."

```
send_whatsapp_message
  - device: <id>
  - action: "poll"
  - chat: "34600111222@c.us"
  - poll:
      question: "Which day works for you?"
      options: ["Friday", "Saturday", "Sunday"]
      multipleAnswers: false   # set true to allow more than one selection
```

Polls are supported on the WABA Cloud API. Read poll results later with `get_whatsapp_chat_messages` action=`by_type` and `messageTypes:["poll"]`. Confirm your device is on a Cloud-API-compatible plan if polls don't appear — older WABA on-premise hosting may not support them.

### Recipe 6 — Reply / react / forward

> "React with 👍 to the last message from +34 600 111 222."

```
1. get_whatsapp_chat_messages with chat=<chat.wid>, action=recent, limit=1
2. manage_whatsapp_message_interactions
   - chat: <chat.wid>
   - action: "reaction"
   - reactionMessage: <last.id>
   - reaction: "👍"          # use "-" to remove a reaction
```

Other actions: `reply` (threaded reply — `quote` = the message ID to reply to, plus `message`) and `forward` (to another chat). There is no delete-message operation in the MCP.

## Common pitfalls

- **Sending free-form outside 24 h.** Returns `131047` from Meta. Switch to a template or wait for the customer to reply first.
- **Template variables out of order.** `{{1}}` in the template == the entry with `name: "1"` in `template.body[]`. Mismatched names will deliver gibberish.
- **Forgetting `action` or `device`.** `action` selects what kind of message you send; `device` is needed when the account has more than one number. Missing either commonly trips a `400`.
- **Recipient format.** The recipient field is `chat` — a WhatsApp ID / WID such as `34600111222@c.us` (digits + `@c.us`, no `+` or spaces). There is no `phone` parameter on `send_whatsapp_message`. (`verifyWhatsAppNumberExists` is the exception — it takes an E.164 `phoneNumber`.)
- **Media URL not reachable.** Wassenger fetches the URL server-side. If it returns 403/404 or requires auth, upload via `upload_whatsapp_file_from_url` after first making it public, or proxy through your own server.
- **Marketing copy in a Utility template.** Meta categorizes templates at approval time. Sending marketing through a Utility template gets the template (and potentially the WABA) suspended on review. Use the right category from the start.

## See also

- `wassenger-mcp` — tool catalog if you need exact parameter shapes (`references/tools-reference.md`).
- `wassenger-campaigns` — for sends to many contacts.
- `wassenger-inbox` — once messages arrive, manage the resulting chats.
- `wassenger-webhooks` — receive `message:delivered`, `message:read`, `message:reply` events in real time.
