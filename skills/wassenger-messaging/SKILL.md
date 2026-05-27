---
name: wassenger-messaging
description: Send WhatsApp messages with Wassenger on the official WhatsApp Business API — text, images, video, audio, documents, locations, contact cards, polls, scheduled, and agent-attributed messages. Use when the user wants to send any kind of message via WhatsApp through their connected WABA device. Bakes in the 24-hour customer service window and the pre-approved template flow so the agent picks free-form vs template automatically.
license: MIT
metadata:
  author: Wassenger
  version: "1.0.0"
  category: capability
  requires-mcp: "@wassengerhq/mcp-wassenger"
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
| **Free-form** | The recipient sent a message to this device in the last 24 hours. | `send_whatsapp_message` with `message` / `media` / `poll` / etc. |
| **Template** | The last inbound message is older than 24 hours, **or** no prior conversation exists. | `send_whatsapp_message` with `template: { name, language, components }`. |

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
2. (optional) verifyWhatsAppNumberExists with the phone
3. send_whatsapp_message
   - device: <device.id>
   - phone: "+34600111222"
   - message: "Tu pedido #1234 está listo para recoger"
```

Report back the returned `message.id` so the user can track delivery.

### Recipe 2 — Send a media message (PDF receipt)

> "Send this PDF receipt to my client +1 555 0100."

If the user has a public URL:

```
send_whatsapp_message
  - device: <id>
  - phone: "+15550100"
  - media: { url: "https://example.com/receipt.pdf" }
  - caption: "Here is your receipt"  # optional
```

If they have a local file, upload it first:

```
1. upload_whatsapp_file_from_url with the public URL
   → returns file.id
2. send_whatsapp_message with media: { file: <file.id> }
```

Supported media: images (jpg/png/webp), audio (ogg/mp3), video (mp4), documents (pdf, docx, xlsx, txt, …). WhatsApp limits: 16 MB images/audio, 100 MB documents, ~16 MB video.

### Recipe 3 — Send a WABA template (outside the 24h window)

> "Remind everyone who has a reservation tomorrow at 8pm."

Assuming a `reservation_reminder` template approved in Spanish with variables `{{1}}=customer_name`, `{{2}}=time`:

```
1. list_whatsapp_templates with device + status=APPROVED + language=es
   → confirm "reservation_reminder" exists
2. For each contact:
   send_whatsapp_message
     - device: <id>
     - phone: <contact.phone>
     - template:
         name: "reservation_reminder"
         language: "es"
         components:
           - type: body
             parameters: [{ type: text, text: contact.name }, { type: text, text: "20:00" }]
```

If the template has a header image or button, populate the matching `components` block. The exact shape mirrors Meta's template-message schema — `list_whatsapp_templates` returns the expected variables per template.

### Recipe 4 — Schedule for later

> "Schedule a Good Morning message to my list at 8am tomorrow."

Add `deliverAt` (ISO 8601):

```
send_whatsapp_message
  - device: <id>
  - phone: "+34600111222"
  - message: "Good morning! ☀️"
  - deliverAt: "2026-05-28T08:00:00+02:00"
```

Wassenger queues the message and dispatches it at the requested time. Use `manage_whatsapp_queue` with operation `status` to verify it landed in the queue.

### Recipe 5 — Send a poll

> "Ask my customer Marta which day works better — Friday, Saturday or Sunday."

```
send_whatsapp_message
  - device: <id>
  - phone: "+34600111222"
  - poll:
      name: "Which day works for you?"
      options: ["Friday", "Saturday", "Sunday"]
      selectableCount: 1
```

Polls are supported on the WABA Cloud API. Read poll results later with `get_whatsapp_chat_messages` filtered by `messageType=poll`. Confirm your device is on a Cloud-API-compatible plan if polls don't appear — older WABA on-premise hosting may not support them.

### Recipe 6 — Reply / react / forward

> "React with 👍 to the last message from +34 600 111 222."

```
1. get_whatsapp_chat_messages with chat=<chat.wid>, filter=recent, limit=1
2. manage_whatsapp_message_interactions
   - operation: react
   - messageId: <last.id>
   - emoji: "👍"
```

Other operations: `reply` (threaded reply with `replyTo`), `forward` (to another chat), `delete-for-me`, `delete-for-all`.

## Common pitfalls

- **Sending free-form outside 24 h.** Returns `131047` from Meta. Switch to a template or wait for the customer to reply first.
- **Template variables out of order.** `{{1}}` in the template == `parameters[0]` in the call. Off-by-one will deliver gibberish.
- **Forgetting `device`.** Defaults to nothing — the API rejects with `400`. Always pass.
- **Wrong number format.** Use E.164 (`+34600111222`), no spaces. The MCP also accepts chat WIDs (`34600111222@c.us`) but E.164 is safer.
- **Media URL not reachable.** Wassenger fetches the URL server-side. If it returns 403/404 or requires auth, upload via `upload_whatsapp_file_from_url` after first making it public, or proxy through your own server.
- **Marketing copy in a Utility template.** Meta categorizes templates at approval time. Sending marketing through a Utility template gets the template (and potentially the WABA) suspended on review. Use the right category from the start.

## See also

- `wassenger-mcp` — tool catalog if you need exact parameter shapes (`references/tools-reference.md`).
- `wassenger-campaigns` — for sends to many contacts.
- `wassenger-inbox` — once messages arrive, manage the resulting chats.
- `wassenger-webhooks` — receive `message:delivered`, `message:read`, `message:reply` events in real time.
