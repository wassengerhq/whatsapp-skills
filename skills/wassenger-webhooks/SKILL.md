---
name: wassenger-webhooks
description: Subscribe to real-time WhatsApp events from Wassenger — inbound messages, delivery and read receipts, status changes, campaign events, chat assignment changes, device state, and more. Use when the user wants live automation triggered by WhatsApp events (auto-replies, CRM sync, alerting, opt-out handling, multi-agent routing). Covers subscription via the REST API, payload shapes, HMAC signature verification, retries, and how to expose a public endpoint locally for development.
license: MIT
metadata:
  author: Wassenger
  version: "1.0.0"
  category: capability
  requires-mcp: "@wassengerhq/mcp-wassenger"
---

# Wassenger Webhooks

Drive automations from real WhatsApp events instead of polling. Webhooks turn "send when X happens" requests into a couple of API calls plus a small HTTP handler.

## When to use

- The user says "trigger something when a message arrives", "notify me when a campaign finishes", "auto-reply", "sync to my CRM", "ping Slack on every reply".
- Another skill (`wassenger-customer-support`, `wassenger-campaigns` opt-out, `wassenger-ecommerce` order events) needs live event ingestion.
- The user asks how to receive delivery / read receipts.

For ad-hoc polling ("show me the last 10 messages"), use `wassenger-inbox` / `wassenger-messaging` instead — webhooks are for *production* automation.

## Prerequisites

- `wassenger-setup` complete.
- A **publicly reachable HTTPS endpoint** that accepts `POST` requests with a JSON body. For local development, expose it via `ngrok`, `cloudflared`, `bore.pub`, or similar.
- An idempotency strategy on your side — Wassenger retries failed deliveries (up to ~24h), so the same event can land twice.

## Architecture

```
WhatsApp ──► Wassenger Cloud ──► [Webhook POST] ──► Your endpoint ──► Your logic
                                       │
                                       └── HMAC SHA-256 in X-Wassenger-Signature header
```

The MCP server does **not** expose subscribing to webhooks — webhook management is a REST-only flow. Call the REST API directly from a small script or curl.

## Step 1 — Pick the events to receive

Common event types (full list at https://app.wassenger.com/docs#webhooks):

| Event | Fires when |
|---|---|
| `message:in:new` | Inbound message received |
| `message:out:sent` | Outbound message sent successfully |
| `message:out:delivered` | Delivery receipt from WhatsApp |
| `message:out:read` | Read receipt |
| `message:out:failed` | Send failed (number invalid, blocked, quota, …) |
| `chat:assigned` | Chat assigned to a team member |
| `chat:status:changed` | Chat status changed (active/pending/resolved/archived) |
| `device:status:changed` | Device connection state changed |
| `campaign:started` / `campaign:finished` | Campaign lifecycle |
| `contact:created` / `contact:updated` | Contact synced into Wassenger |

Subscribe to the **least** you need — every event you don't filter is bandwidth and a retry-storm risk.

## Step 2 — Subscribe

```bash
curl -X POST https://api.wassenger.com/v1/webhooks \
  -H "Token: $WASSENGER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CRM sync",
    "url": "https://hooks.example.com/wassenger",
    "events": ["message:in:new", "message:out:read"],
    "active": true,
    "device": "DEVICE_ID_OR_OMIT_FOR_ACCOUNT_WIDE"
  }'
```

Response includes the webhook `id` and a `secret`. **Store the secret** — you need it to verify signatures.

To list, update, or delete webhooks: `GET / PATCH / DELETE /v1/webhooks/{id}`.

## Step 3 — Verify the signature

Every delivery includes `X-Wassenger-Signature: sha256=<hex>`. Compute HMAC-SHA-256 over the **raw body** using the webhook's `secret` and compare.

Node.js example:

```js
import crypto from 'node:crypto'

function verifyWassengerWebhook (rawBody, signatureHeader, secret) {
  if (!signatureHeader?.startsWith('sha256=')) return false
  const expected = signatureHeader.slice('sha256='.length)
  const actual = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex')
  // Constant-time compare
  return crypto.timingSafeEqual(
    Buffer.from(expected, 'hex'),
    Buffer.from(actual, 'hex')
  )
}
```

**Always verify.** An unverified endpoint is trivially attackable — anyone with the URL can spoof events.

## Step 4 — Handle the payload

Typical inbound-message payload:

```json
{
  "id": "evt_01HXXX",
  "event": "message:in:new",
  "createdAt": "2026-05-27T14:32:11.218Z",
  "device": "DEVICE_ID",
  "data": {
    "message": {
      "id": "msg_01HXXX",
      "chat": "34600111222@c.us",
      "from": "34600111222",
      "to": "DEVICE_PHONE",
      "fromMe": false,
      "type": "text",
      "body": "Hi, I need help with order #1234",
      "timestamp": "2026-05-27T14:32:10.000Z"
    },
    "chat": {
      "id": "34600111222@c.us",
      "contact": { "name": "Marta L.", "phone": "+34600111222" },
      "status": "active",
      "assignedTo": null
    }
  }
}
```

Respond with **HTTP 2xx within 10 seconds**. Wassenger considers anything else (including timeouts) a failure and will retry with exponential backoff up to ~24h.

## Recipes

### Recipe 1 — Auto-reply to first contact

```
on event: message:in:new
  if chat.messageCount == 1 (first ever message):
    send_whatsapp_message
      - device: event.device
      - phone: data.message.from
      - message: "Hi! Thanks for reaching out. An agent will reply within 1 hour."
  ack 200
```

Use the chat statistics endpoint or check your own DB to avoid double-firing on retries.

### Recipe 2 — Slack alert on every reply

```
on event: message:in:new
  body = data.message.body
  contact = data.chat.contact.name || data.message.from
  POST https://hooks.slack.com/...  body: {
    text: `📩 *${contact}*: ${body}`
  }
  ack 200
```

### Recipe 3 — Opt-out handling (STOP keyword)

```
on event: message:in:new
  if data.message.body matches /^(STOP|UNSUBSCRIBE|BAJA)$/i:
    manage_whatsapp_labels apply "opted-out" to data.chat.id
    send confirmation text
    add to suppression list in your DB
  ack 200
```

### Recipe 4 — Sync delivery receipts to a CRM

```
on event in [message:out:delivered, message:out:read, message:out:failed]:
  PATCH /crm/messages/<message.externalRef> with status=event.type
  ack 200
```

`message.externalRef` is a custom field you set when sending; store it to bridge Wassenger IDs to your CRM IDs.

### Recipe 5 — Local dev with ngrok

```bash
# Terminal 1
node webhook-handler.js   # listens on :3000

# Terminal 2
ngrok http 3000
# → https://abcd-12-34-56-78.ngrok-free.app

# Terminal 3 — subscribe
curl -X POST https://api.wassenger.com/v1/webhooks \
  -H "Token: $WASSENGER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Local dev",
    "url": "https://abcd-12-34-56-78.ngrok-free.app/wassenger",
    "events": ["message:in:new"]
  }'
```

Send yourself a WhatsApp message — the event should arrive in ngrok's inspector. Delete the webhook (`DELETE /v1/webhooks/{id}`) when done; ngrok URLs rotate.

## Common pitfalls

- **Forgetting to verify signatures.** Public URLs leak. Without HMAC verification, anyone can POST fake events and trigger your automations.
- **Returning 4xx/5xx for normal cases.** If the event isn't relevant to you, still return `200` — `4xx` triggers retries for ~24h.
- **Reading the body twice.** If you parse JSON before signature verification, you've already discarded the raw bytes you need. Capture the raw body first (`express.raw()`, `bodyParser.raw()`), verify, then parse.
- **Subscribing to everything.** Each event you receive but don't handle is wasted bandwidth and potential retries. Subscribe narrowly.
- **No idempotency.** Retries deliver the same `event.id` twice. Dedupe on `event.id` in your DB or use idempotent operations.
- **Localhost as the URL.** Wassenger sends from the public internet — `http://localhost:3000` will never reach you. Always tunnel for dev.

## See also

- `wassenger-messaging` — for the actions your handler triggers (sending replies).
- `wassenger-inbox` — for the chat / label / assignment side effects.
- `wassenger-customer-support` — opinionated SLA + auto-reply playbook on top of webhooks.
- `wassenger-campaigns` — opt-out webhook pattern in detail.
- Full event reference: https://app.wassenger.com/docs#webhooks
