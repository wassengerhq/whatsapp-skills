# Node.js — Wati → Wassenger before/after

## Free-form (session) message

Before (Wati — form-data, recipient in URL):
```js
const form = new URLSearchParams({ messageText: 'Your order #1234 is ready' })
await fetch(`https://live-server-12345.wati.io/api/v1/sendSessionMessage/34600111222`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.WATI_TOKEN}`,
    'Content-Type': 'application/x-www-form-urlencoded'
  },
  body: form
})
```

After (Wassenger — JSON, device + phone in body):
```js
await fetch('https://api.wassenger.com/v1/messages', {
  method: 'POST',
  headers: { 'Token': process.env.WASSENGER_API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    device: process.env.WASSENGER_DEVICE_ID,
    phone: '+34600111222',            // E.164, was in the URL
    message: 'Your order #1234 is ready'
  })
})
```

## Template message (named → positional params)

Before (Wati):
```js
await fetch(`https://live-server-12345.wati.io/api/v1/sendTemplateMessage?whatsappNumber=34600111222`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${process.env.WATI_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    template_name: 'order_update',
    broadcast_name: 'order_update',
    parameters: [
      { name: 'name', value: 'John' },
      { name: 'ordernumber', value: '12345' }
    ]
  })
})
```

After (Wassenger — drop broadcast_name, add language, params become positional):
```js
await fetch('https://api.wassenger.com/v1/messages', {
  method: 'POST',
  headers: { 'Token': process.env.WASSENGER_API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    device: process.env.WASSENGER_DEVICE_ID,
    phone: '+34600111222',
    template: {
      name: 'order_update',
      language: 'en',                 // required — Wati inferred it
      components: [{
        type: 'body',
        parameters: [                 // ORDER must match {{1}},{{2}} in the template
          { type: 'text', text: 'John' },     // was {name}
          { type: 'text', text: '12345' }     // was {ordernumber}
        ]
      }]
    }
  })
})
```

## Helper: convert Wati named params → Wassenger positional

```js
// orderedNames must match the template body order of {{1}},{{2}},…
function watiToWassengerParams (watiParams, orderedNames) {
  const byName = Object.fromEntries(watiParams.map(p => [p.name, p.value]))
  return orderedNames.map(n => ({ type: 'text', text: String(byName[n] ?? '') }))
}
// components: [{ type:'body', parameters: watiToWassengerParams(p, ['name','ordernumber']) }]
```

## Drop-in wrapper

```js
export async function sendTemplate ({ phone, name, language, params }) {
  const res = await fetch('https://api.wassenger.com/v1/messages', {
    method: 'POST',
    headers: { Token: process.env.WASSENGER_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      device: process.env.WASSENGER_DEVICE_ID,
      phone: phone.startsWith('+') ? phone : `+${phone}`,
      template: { name, language, components: [{ type: 'body', parameters: params }] }
    })
  })
  if (!res.ok) throw new Error(`Wassenger ${res.status}: ${await res.text()}`)
  return res.json()
}
```
