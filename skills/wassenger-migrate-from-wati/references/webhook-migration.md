# Webhook migration — Wati → Wassenger

Two model differences:

1. **Subscription**: Wati webhooks are configured in the dashboard (Settings → Webhooks) per event. Wassenger subscribes via the API to an `events[]` array.
2. **Verification**: Wati does not sign with a standard HMAC — auth is typically a token you embed in your webhook URL or a header you configure. Wassenger signs every delivery with **HMAC-SHA256** (`X-Wassenger-Signature: sha256=<hex>`) over the raw body — implement the verifier (this is a security upgrade, not a like-for-like).

> ⚠️ Wati's exact inbound JSON field names vary by account/version and aren't in the public Postman collection. Confirm the fields against a real payload from your Wati webhook logs before relying on the renames below.

## Subscribe (replaces dashboard config)

```bash
curl -X POST https://api.wassenger.com/v1/webhooks \
  -H "Token: $WASSENGER_API_KEY" -H "Content-Type: application/json" \
  -d '{
    "name": "Inbound + status",
    "url": "https://hooks.example.com/wassenger",
    "events": ["message:in:new","message:out:delivered","message:out:read","message:out:failed"],
    "active": true,
    "device": "DEVICE_ID_OR_OMIT_FOR_ACCOUNT_WIDE"
  }'
```
Store the returned `secret` for signature verification.

## Event mapping

| Wati `eventType` (typical) | Wassenger event |
|---|---|
| `message` (inbound, `owner=false`) | `message:in:new` |
| `sessionMessageSent` / `templateMessageSent` | `message:out:sent` |
| delivered status | `message:out:delivered` |
| read status | `message:out:read` |
| `templateMessageFailed` | `message:out:failed` |
| ticket assigned / status changed | `chat:assigned` / `chat:status:changed` |

## Field renames (inbound message — verify against your logs)

| Wati (typical) | Wassenger |
|---|---|
| `waId` | `data.message.from` |
| `text` | `data.message.body` |
| `senderName` | `data.chat.contact.name` |
| `owner` (bool: true=outbound) | use the `event` name (`message:in:*` vs `message:out:*`) |
| `whatsappMessageId` / `id` | `data.message.id` |
| `eventType` | `event` |

## Node — handler (Wassenger, with signature)

```js
import crypto from 'node:crypto'

app.post('/wassenger', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = (req.headers['x-wassenger-signature'] || '').replace(/^sha256=/, '')
  const actual = crypto.createHmac('sha256', process.env.WASSENGER_WEBHOOK_SECRET)
    .update(req.body).digest('hex')
  // Decode both to buffers; timingSafeEqual needs equal-length BUFFERS,
  // so compare byte lengths (not hex-string lengths) before comparing.
  const sigBuf = Buffer.from(sig, 'hex')
  const actualBuf = Buffer.from(actual, 'hex')
  const ok = sigBuf.length === actualBuf.length &&
    crypto.timingSafeEqual(sigBuf, actualBuf)
  if (!ok) return res.sendStatus(403)

  const evt = JSON.parse(req.body.toString())
  if (evt.event === 'message:in:new') {
    handleInbound(evt.data.message.from, evt.data.message.body)   // was waId / text
  }
  res.sendStatus(200)
})
```

## Python — handler (FastAPI)

```python
import hmac, hashlib, os, json

@app.post("/wassenger")
async def hook(request: Request):
    raw = await request.body()
    sig = request.headers.get("X-Wassenger-Signature", "").removeprefix("sha256=")
    expected = hmac.new(os.environ["WASSENGER_WEBHOOK_SECRET"].encode(), raw, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        raise HTTPException(403)
    evt = json.loads(raw)
    if evt.get("event") == "message:in:new":
        msg = evt["data"]["message"]
        handle_inbound(msg["from"], msg.get("body", ""))
    return ""
```

## Gotchas

- Use the **raw body** for the HMAC (don't re-serialize parsed JSON — bytes change, signature fails).
- One Wassenger subscription covers inbound + status; Wati often used separate dashboard toggles per event.
- Make handlers idempotent on `data.message.id` (or the top-level `event.id`) — Wassenger retries.
- Full event catalog + payload shapes: `wassenger-webhooks`.
