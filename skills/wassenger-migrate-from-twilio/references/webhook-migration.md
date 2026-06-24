# Webhook migration — Twilio → Wassenger

The inbound path changes the most. Three differences:

1. **Transport**: Twilio sends `application/x-www-form-urlencoded`; Wassenger sends `application/json`.
2. **Subscription**: Twilio webhooks are configured per-number in the Console; Wassenger subscribes via the API to an `events[]` array.
3. **Signature**: Twilio = HMAC-**SHA1** over `URL + sorted params`; Wassenger = HMAC-**SHA256** over the **raw body**.

## Subscribe (replaces Console config)

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

The response includes a `secret` — store it; you need it to verify signatures.

## Field renames (inbound message)

| Twilio form field | Wassenger JSON |
|---|---|
| `MessageSid` | `data.message.id` |
| `From` = `whatsapp:+E164` | `data.message.from` = `E164` |
| `Body` | `data.message.body` |
| `NumMedia` / `MediaUrl0` | `data.media` |
| `ProfileName` | `data.chat.contact.name` |
| `WaId` | `data.chat.contact.phone` |
| (event type implicit per URL) | `event` = `message:in:new` |

## Node — handler before/after

Before (Twilio, Express):
```js
import twilio from 'twilio'

app.post('/twilio', express.urlencoded({ extended: false }), (req, res) => {
  const valid = twilio.validateRequest(
    process.env.TWILIO_TOKEN,
    req.headers['x-twilio-signature'],
    'https://hooks.example.com/twilio',
    req.body
  )
  if (!valid) return res.sendStatus(403)
  const from = req.body.From.replace('whatsapp:', '')
  const text = req.body.Body
  handleInbound(from, text)
  res.sendStatus(200)
})
```

After (Wassenger, Express — note `express.raw` for signature):
```js
import crypto from 'node:crypto'

app.post('/wassenger', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['x-wassenger-signature'] || ''
  const expected = sig.replace(/^sha256=/, '')
  const actual = crypto.createHmac('sha256', process.env.WASSENGER_WEBHOOK_SECRET)
    .update(req.body)                       // raw Buffer
    .digest('hex')
  const ok = expected.length === actual.length &&
    crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(actual, 'hex'))
  if (!ok) return res.sendStatus(403)

  const evt = JSON.parse(req.body.toString())
  if (evt.event === 'message:in:new') {
    handleInbound(evt.data.message.from, evt.data.message.body)
  }
  res.sendStatus(200)
})
```

## Python — handler before/after (FastAPI)

Before (Twilio):
```python
from twilio.request_validator import RequestValidator

@app.post("/twilio")
async def twilio_hook(request: Request):
    form = await request.form()
    validator = RequestValidator(os.environ["TWILIO_TOKEN"])
    if not validator.validate(str(request.url),
                              dict(form),
                              request.headers.get("X-Twilio-Signature", "")):
        raise HTTPException(403)
    handle_inbound(form["From"].replace("whatsapp:", ""), form.get("Body", ""))
    return ""
```

After (Wassenger):
```python
import hmac, hashlib, os, json

@app.post("/wassenger")
async def wassenger_hook(request: Request):
    raw = await request.body()
    sig = request.headers.get("X-Wassenger-Signature", "").removeprefix("sha256=")
    expected = hmac.new(os.environ["WASSENGER_WEBHOOK_SECRET"].encode(),
                        raw, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        raise HTTPException(403)
    evt = json.loads(raw)
    if evt.get("event") == "message:in:new":
        msg = evt["data"]["message"]
        handle_inbound(msg["from"], msg.get("body", ""))
    return ""
```

## Gotchas

- Use the **raw body** for the HMAC — if your framework already parsed JSON, re-serializing changes bytes and the signature fails. Capture the raw buffer (Express `express.raw`, FastAPI `await request.body()`).
- One Wassenger subscription can cover inbound + all status events; you don't need separate URLs like Twilio's per-message `StatusCallback`.
- Wassenger retries failed deliveries — make the handler idempotent on `data.message.id` (the message ID, not the event `id`).
- See `wassenger-webhooks` for the full event catalog and payload shapes.
