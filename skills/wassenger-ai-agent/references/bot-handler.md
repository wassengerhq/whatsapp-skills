# AI agent — reference webhook handler (Node)

A minimal, production-shaped handler: **verify → dedupe → gate → LLM → reply or hand off.** It calls the Wassenger REST API directly (this runs as a deployed service, not through the MCP). Adapt it — don't ship it verbatim. To fork a fuller starting point, use [`wassengerhq/whatsapp-chatgpt-bot`](https://github.com/wassengerhq/whatsapp-chatgpt-bot).

Env: `WASSENGER_API_KEY`, `WASSENGER_WEBHOOK_SECRET`, plus your LLM key.

```js
import express from 'express'
import crypto from 'node:crypto'

const API = 'https://api.wassenger.com/v1'
const KEY = process.env.WASSENGER_API_KEY
const SECRET = process.env.WASSENGER_WEBHOOK_SECRET
const seen = new Set() // replace with Redis/DB in production

const app = express()
app.use('/webhook', express.raw({ type: '*/*' })) // raw body needed for the signature

app.post('/webhook', async (req, res) => {
  // 1. Verify signature: HMAC-SHA256 over the RAW body, compared in constant time
  const sig = Buffer.from(req.get('X-Wassenger-Signature') || '')
  const expected = Buffer.from('sha256=' + crypto.createHmac('sha256', SECRET).update(req.body).digest('hex'))
  if (sig.length !== expected.length || !crypto.timingSafeEqual(sig, expected)) {
    return res.sendStatus(401)
  }

  const evt = JSON.parse(req.body.toString('utf8'))
  res.sendStatus(200) // ack fast; do the work asynchronously
  if (evt.event !== 'message:in:new') return

  const msg = evt.data.message // canonical inbound shape: { from, body, id, ... }

  // 2. Idempotency — webhooks retry, so never answer the same message twice
  if (!msg?.id || seen.has(msg.id)) return
  seen.add(msg.id)

  // 3. Gates (adapt field names to your webhook payload — see wassenger-webhooks)
  const chat = evt.data.chat || {}
  const isGroup = /@g\.us$/.test(msg.from || '') // 1:1 only
  const labels = chat.labels || [] // kill switch / already-with-a-human
  if (isGroup) return
  if (labels.includes('bot:off') || labels.includes('human')) return
  const body = (msg.body || '').trim()
  if (/^(stop|baja|unsubscribe)$/i.test(body)) return handleOptOut(msg.from)

  try {
    // 4. Ask the LLM with a SCOPED system prompt + recent context
    const reply = await askLLM(chat, body)
    if (!reply || reply.trim() === 'ESCALATE') return handoff(msg.from)
    // 5. Reply — the inbound just arrived, so we're inside the 24h window
    await send({ phone: msg.from, message: reply })
  } catch (err) {
    console.error('LLM/send failed:', err)
    await handoff(msg.from) // fallback: never leave the customer hanging
  }
})

async function send (body) {
  return fetch(`${API}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Token: KEY },
    body: JSON.stringify(body) // REST send uses `phone` (E.164 or WID)
  })
}

async function handoff (phone) {
  await send({ phone, message: 'One moment — connecting you with a teammate.' })
  // Then assign + tag the chat so this gate skips it next time. Assignment to the
  // right agent/department: see wassenger-routing; tag via the agent action / chat API.
}

async function handleOptOut (phone) {
  // Add to a suppression list and stop messaging this contact. See wassenger-marketing.
}

async function askLLM (chat, body) {
  // Call OpenAI/Claude with your scoped system prompt (SKILL Recipe 4) and the
  // last ~10 turns (fetch via GET /chat/{wid}/messages or get_whatsapp_chat_messages).
  // Return the reply text, or the literal "ESCALATE" to hand off.
}

app.listen(3000)
```

## Go-live checklist

Don't put a bot in front of real customers until every box is ticked:

- [ ] **Signature** verified on every request (reject `401` otherwise)
- [ ] **Dedupe** on `data.message.id` (persistent store, not in-memory, in production)
- [ ] Only `message:in:new`, **1:1 chats**, not your own outbound
- [ ] **Kill switch** (`bot:off` / `human` label, or a global flag) honoured
- [ ] **Opt-out** handled (STOP/BAJA/UNSUBSCRIBE) + suppression list
- [ ] System prompt **scoped**; `ESCALATE` → human handoff (prices, refunds, legal, medical, complaints, "talk to a human")
- [ ] Replies only **inside the 24h window** (replying to an inbound = OK; anything proactive = approved template)
- [ ] LLM error/timeout → **handoff fallback** (never silent)
- [ ] `2xx` returned within a few seconds (work done async)
- [ ] **Monitoring**: escalation rate, error rate, and the number's quality tier (`get_whatsapp_device_details`)

> Field-name caveat: `data.message.{from,body,id}` and `data.chat.contact.phone` are the canonical inbound fields used across this pack. Other fields (`chat.labels`, group detection) vary — confirm them against your actual webhook payload (`wassenger-webhooks`) before relying on them for gating.
