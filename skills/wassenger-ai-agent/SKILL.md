---
name: wassenger-ai-agent
description: Build a production-grade AI agent that answers your customers on WhatsApp with Wassenger — an LLM (OpenAI/Claude) replies to inbound messages inside the 24-hour window, with a hard human handoff for sensitive or low-confidence cases, idempotent webhook handling, opt-out, and a kill switch. Use when the user wants an "AI chatbot / assistant / auto-responder" that handles FAQs, qualifies leads, and covers after-hours on WhatsApp — and wants it safe enough to put in front of real customers, not a naive autonomous bot.
license: MIT
metadata:
  author: Wassenger
  version: "1.0.0"
  category: capability
---

# Wassenger AI Agent

Stand up an AI agent that replies to customers on WhatsApp — and, crucially, knows when to stop and hand the chat to a human. This skill wires the *safe* pattern, not a bot left unsupervised.

> **What this skill is.** It *sets up* the agent — it is **not** the runtime. The live agent runs either as Wassenger's built-in **AI Assistant** (no-code, configured in the console) or as a small **webhook service you deploy**. This skill helps you pick one, wire it, and bake in the guardrails that make it safe for production.

## When to use

- "I want an AI bot that answers customers on WhatsApp 24/7."
- "Handle FAQs / qualify leads / cover after-hours automatically, but escalate to a human when needed."
- "Add a GPT or Claude assistant to my WhatsApp inbox."

**Not** this skill: deterministic canned responses with no AI → `wassenger-auto-replies` (100% predictable). A lead-qualification flow specifically → `wassenger-sales-bot`. Plain send/receive → `wassenger-messaging` / `wassenger-webhooks`.

## Reality check (read before promising anything)

An LLM agent on WhatsApp is **high-reliability with guardrails, never 100%**. Three hard constraints shape the whole design:

1. **The LLM is probabilistic** — it can hallucinate or over-promise. You must scope it and gate it.
2. **The 24-hour window** — you may reply free-form only within 24h of the customer's last inbound message. Replying *to* an inbound is always in-window; anything proactive or after 24h needs an approved template (`wassenger-messaging`).
3. **Number quality** — robotic/spammy behaviour gets the number throttled by Meta. An agent that answers real inbound conversations is fine; an agent that blasts unsolicited messages is not.

So the goal is **"AI that filters and escalates,"** not "AI that replaces the team." Promise it that way.

## Two ways to run it

**A) Built-in AI Assistant (no-code).** Configure it in the Wassenger console (instructions/knowledge, on/off, handoff). Fastest, fully managed. Use when you want zero infrastructure.

**B) Deployed webhook bot (full control).** A small service receives Wassenger webhooks, calls your LLM, and replies via the API. Start from [`wassengerhq/whatsapp-chatgpt-bot`](https://github.com/wassengerhq/whatsapp-chatgpt-bot). Use when you need custom logic, your own model, or tight CRM integration. The recipes below wire this path; `references/bot-handler.md` has an annotated, guardrailed handler + go-live checklist.

## Recipes (the deployed bot)

### Recipe 1 — Wire the inbound trigger

Subscribe to inbound messages only (see `wassenger-webhooks`):

```
events: ["message:in:new"]
```

Your endpoint receives `data.message.{from, body, id}` and `data.chat`. Verify the `X-Wassenger-Signature` HMAC over the raw body and return `2xx` fast (do the work asynchronously).

### Recipe 2 — Decide: answer, or hand off

Gate **before** calling the LLM:

```
skip   if the message is from you (subscribing to message:in:new already means inbound)
skip   if it's a group chat (1:1 only)
skip   if the chat is labelled "bot:off" or "human"        // kill switch / already with a person
opt-out if body matches /^(stop|baja|unsubscribe)$/i        // see wassenger-marketing
HAND OFF (don't answer) if the customer asks for a human, or the topic is sensitive
        (prices, refunds, legal, medical, complaints)
```

Hand off = reply once, assign to a human, and tag — in a single call:

```
send_whatsapp_message
  action: "agent"
  chat:    <customer wid>
  message: "One sec — connecting you with a teammate."
  actions: [
    { action: "chat:assign",  params: { /* agent or department */ } },
    { action: "labels:add",   params: { labels: ["human"] } }
  ]
```

(or let `wassenger-routing` rules pick the agent/department).

### Recipe 3 — Generate and reply (in-window)

```
1. Context:  get_whatsapp_chat_messages  action: "recent", chat: <wid>, limit: 10
2. Ask the LLM with a SCOPED system prompt (Recipe 4) + the recent turns
3. If the model returns low confidence or the literal token "ESCALATE" → hand off (Recipe 2); do NOT send
4. Otherwise reply:  send_whatsapp_message  action: "text", chat: <wid>, message: <reply>
```

You're replying to an inbound, so you're inside the 24h window — free-form text is allowed.

### Recipe 4 — Scope the agent (the system prompt is a guardrail)

Bake the limits into the prompt, not just the docs:

```
- You are <brand>'s WhatsApp assistant. Answer ONLY about <topics>.
- NEVER quote prices, promise refunds, give legal/medical advice, or confirm orders.
  For any of those, reply with exactly: ESCALATE
- If you are unsure, reply: ESCALATE
- Keep replies under <N> short lines. Never claim to be a human.
```

Treat a reply of `ESCALATE` as the handoff trigger.

### Recipe 5 — Idempotency + fallback (don't double-reply, don't go silent)

```
- Dedupe on data.message.id — webhooks retry; never answer the same message twice.
- On LLM error/timeout: do NOT leave the customer hanging → hand off to a human (Recipe 2) + alert.
```

### Recipe 6 — Kill switch + monitoring

```
- Kill switch: a "bot:off" label per chat, or a global flag your service reads — flip it and the bot stops instantly.
- Monitor: log every decision (answered / escalated / errored); watch the escalation rate and the
  number's quality tier via get_whatsapp_device_details.
```

## Production readiness

Don't go live without the checklist in `references/bot-handler.md` (signature verify, dedupe, window, handoff, opt-out, fallback, kill switch, monitoring). A bot missing any of these will eventually burn a customer or the number.

## Anti-patterns

- **Autonomous bot with no handoff.** The fastest path to an angry customer and a throttled number. Always have a human escape.
- **Free-form replies outside the 24h window.** Blocked by Meta — use a template or wait for the inbound.
- **No dedupe.** Webhook retries make the bot answer twice. Always key on `data.message.id`.
- **An LLM allowed to talk about anything.** Scope the prompt; escalate on price/refund/legal/medical.
- **Marketing blasts dressed up as "AI".** Unsolicited outbound kills number quality. The agent answers; it doesn't spam.
- **Selling it as "replaces your team."** Position as "filters and escalates" — it's true and it survives contact with reality.

## See also

- `wassenger-webhooks` — the inbound trigger and signature verification.
- `wassenger-routing` / `wassenger-team` / `wassenger-inbox` — the human handoff.
- `wassenger-auto-replies` — deterministic, rule-based replies (no LLM) when you want 100% predictable behaviour.
- `wassenger-messaging` — the 24h window and template rules.
- Reference bot to fork: https://github.com/wassengerhq/whatsapp-chatgpt-bot
- `wassenger-mcp` — exact tool shapes (`references/tools-reference.md`).
