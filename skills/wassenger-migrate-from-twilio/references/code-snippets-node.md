# Node.js — Twilio → Wassenger before/after

## Send text

Before (Twilio SDK):
```js
import twilio from 'twilio'
const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN)

await client.messages.create({
  from: 'whatsapp:+14155238886',
  to: 'whatsapp:+34600111222',
  body: 'Your order #1234 is ready'
})
```

After (Wassenger, plain fetch — no SDK needed):
```js
await fetch('https://api.wassenger.com/v1/messages', {
  method: 'POST',
  headers: {
    'Token': process.env.WASSENGER_API_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    device: process.env.WASSENGER_DEVICE_ID,
    phone: '+34600111222',          // no "whatsapp:" prefix
    message: 'Your order #1234 is ready'
  })
})
```

## Send media

Before:
```js
await client.messages.create({
  from: 'whatsapp:+14155238886',
  to: 'whatsapp:+34600111222',
  body: 'Here is your receipt',
  mediaUrl: ['https://example.com/receipt.pdf']
})
```

After:
```js
await fetch('https://api.wassenger.com/v1/messages', {
  method: 'POST',
  headers: { 'Token': process.env.WASSENGER_API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    device: DEVICE_ID,
    phone: '+34600111222',
    media: { url: 'https://example.com/receipt.pdf' },
    caption: 'Here is your receipt'
  })
})
```

## Send a template

Before:
```js
await client.messages.create({
  from: 'whatsapp:+14155238886',
  to: 'whatsapp:+34600111222',
  contentSid: 'HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  contentVariables: JSON.stringify({ 1: 'Pablo', 2: '20:00' })
})
```

After:
```js
await fetch('https://api.wassenger.com/v1/messages', {
  method: 'POST',
  headers: { 'Token': process.env.WASSENGER_API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    device: DEVICE_ID,
    phone: '+34600111222',
    template: {
      name: 'reservation_reminder',
      language: 'es',
      components: [{
        type: 'body',
        parameters: [
          { type: 'text', text: 'Pablo' },
          { type: 'text', text: '20:00' }
        ]
      }]
    }
  })
})
```

## Helper: strip the `whatsapp:` prefix

```js
const toWassenger = n => n.replace(/^whatsapp:/, '')
```

## A thin drop-in wrapper (eases incremental migration)

```js
// Mimics client.messages.create() but routes to Wassenger.
export async function sendMessage ({ from, to, body, mediaUrl, template }) {
  const payload = { device: process.env.WASSENGER_DEVICE_ID, phone: to.replace(/^whatsapp:/, '') }
  if (body) payload.message = body
  if (mediaUrl?.[0]) payload.media = { url: mediaUrl[0] }
  if (template) payload.template = template
  const res = await fetch('https://api.wassenger.com/v1/messages', {
    method: 'POST',
    headers: { Token: process.env.WASSENGER_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!res.ok) throw new Error(`Wassenger ${res.status}: ${await res.text()}`)
  return res.json() // { id, status, ... }
}
```

Webhook handler migration is in `webhook-migration.md`.
