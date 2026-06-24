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
      body: [                         // ORDER must match {{1}},{{2}} in the template body
        { name: '1', value: 'John' },     // was {{name}}  → {{1}}
        { name: '2', value: '12345' }     // was {{ordernumber}} → {{2}}
      ]
    }
  })
})
```

> Wassenger's template payload is **not** Meta-style `components:` — it's `template: { name, language, header?, body: [{ name, value }], button?: [...] }`. The `body[]` entries are positional: `name` is the `{{N}}` index, `value` is the substitution.

## Helper: convert Wati named params → Wassenger positional

⚠️ **Do not trust Wati's `parameters[]` array order — order by the template body.**
Wati params are named; Wassenger/Meta resolve variables by **position** (`{{1}},{{2}}`).
The `orderedNames` argument must list the names in the order they appear in the
**template body's** `{{1}},{{2}}…` — NOT the order they happen to sit in Wati's array.

```js
// orderedNames must match the template body order of {{1}},{{2}},…
function watiToWassengerParams (watiParams, orderedNames) {
  const byName = Object.fromEntries(watiParams.map(p => [p.name, p.value]))
  // Wassenger body param: { name: '<{{N}} index>', value: '<text>' }
  return orderedNames.map((n, i) => ({ name: String(i + 1), value: String(byName[n] ?? '') }))
}
// body: watiToWassengerParams(watiParams, ['name', 'ordernumber'])
```

## Drop-in wrapper

Pass the raw Wati `parameters[]` plus `orderedNames` (the template body's `{{1}},{{2}}…`
order); the wrapper converts them internally with the helper above.

```js
export async function sendTemplate ({ phone, name, language, watiParams, orderedNames }) {
  const res = await fetch('https://api.wassenger.com/v1/messages', {
    method: 'POST',
    headers: { Token: process.env.WASSENGER_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      device: process.env.WASSENGER_DEVICE_ID,
      phone: phone.startsWith('+') ? phone : `+${phone}`,
      // body[] is positional ({{1}},{{2}}…) — orderedNames fixes the order, NOT Wati's array
      template: { name, language, body: watiToWassengerParams(watiParams, orderedNames) }
    })
  })
  if (!res.ok) throw new Error(`Wassenger ${res.status}: ${await res.text()}`)
  return res.json()
}
// sendTemplate({ phone, name: 'order_update', language: 'en',
//   watiParams: [{ name: 'name', value: 'John' }, { name: 'ordernumber', value: '12345' }],
//   orderedNames: ['name', 'ordernumber'] })
```
