---
name: wassenger-routing
description: Configure how incoming WhatsApp chats get routed and assigned in Wassenger — auto-assign new chats round-robin or by least-busy, route by department (Sales, Support, Billing), classify by intent and dispatch to the right team, language-based routing, skills-based routing, escalation rules, and a guaranteed human fallback. Use when the user wants the inbox to organize itself — every new chat lands on the right agent without manual triage.
license: MIT
metadata:
  author: Wassenger
  version: "1.0.0"
  category: capability
  requires-mcp: "mcp-wassenger"
---

# Wassenger Routing

Make the inbox self-organizing. The first agent stops triaging and starts answering — the right chat lands on the right person automatically.

## When to use

- *"Auto-assign new chats to whoever is available."*
- *"Route messages mentioning 'invoice' or 'billing' to the Finance department."*
- *"Spanish-speaking customers go to Marta, Portuguese-speaking go to Pedro."*
- *"If a chat sits unanswered for 30 minutes, escalate to the team lead."*
- *"How do I set up a fallback so no chat is ever left without an owner?"*

For **manual** assignment ("assign this specific chat to Marta"), use `wassenger-inbox`. For the team setup itself (creating agents, granting device access), see `wassenger-team`.

## Prerequisites

- `wassenger-setup` complete.
- Team members configured (`wassenger-team`).
- (Recommended) Departments configured at https://app.wassenger.com/device/departments — Tier 1, Sales, Billing, Tech, etc.
- A small webhook handler if you want **content-based routing** (intent / language / keyword).

## The routing layers

```
┌─────────────────────────────────────────────────────────────┐
│  Incoming chat                                              │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
  ┌──────────────────────────────────────────────────────┐
  │  Layer 1: Auto-assignment                             │
  │  (Wassenger built-in — REST /devices/{id}/autoassign) │
  │  • Round-robin                                        │
  │  • Least-busy                                         │
  │  • Sticky (same agent if previous chat exists)        │
  └──────────────────────────────────────────────────────┘
                          │
                          ▼
  ┌──────────────────────────────────────────────────────┐
  │  Layer 2: Content-based routing (your webhook)        │
  │  • Intent classification (LLM or rules)               │
  │  • Language detection                                 │
  │  • Keyword match                                      │
  │  → assign to department / specific agent              │
  └──────────────────────────────────────────────────────┘
                          │
                          ▼
  ┌──────────────────────────────────────────────────────┐
  │  Layer 3: Escalation                                  │
  │  • SLA timer                                          │
  │  • Reassign if no reply                               │
  │  • Fallback to senior / team lead                     │
  └──────────────────────────────────────────────────────┘
```

Start with Layer 1 only. Add Layer 2 when you have enough volume to justify the classifier. Layer 3 ships when you have SLAs.

## Recipes

### Recipe 1 — Enable round-robin auto-assignment

> "Distribute new chats across the team automatically."

Wassenger's auto-assignment (Layer 1) is **not an MCP tool**. It is a per-device setting:

- **MCP-only users:** configure it in the console at `https://app.wassenger.com/device/{deviceId}/team` → *Auto-assign* (round-robin / least-busy, candidate agents, skip offline/busy, reassign-if-unanswered). This is a one-time setup, not a per-chat call.
- **REST users:** the same config is a direct REST call (not an MCP tool — send the `Token: <API_KEY>` header):

```
# Direct REST call — Token: <API_KEY> header
PUT https://api.wassenger.com/v1/devices/{deviceId}/autoassign
  - enabled: true
  - mode: "round-robin"
  - candidates: [<agent.id>, <agent.id>, ...]   # explicit list
  - skipOffline: true
  - skipBusy: true                              # skip agents at capacity
  - reassignIfUnanswered: 30                    # minutes
```

To list the current config (REST): `GET https://api.wassenger.com/v1/devices/{deviceId}/autoassign`.

Toggle off in seconds if a campaign blows up the inbox (REST): `PUT …/autoassign` with `{ enabled: false }`.

> **Layers 2–3 are not MCP features either.** Content-based routing and escalation below require a webhook handler you host (`wassenger-webhooks`); the chat *assignment* each one performs is then a single `send_whatsapp_message` `action: agent` (`chat:assign`) call.

### Recipe 2 — Route by department

> "Send every chat that mentions invoice or billing to the Finance department."

Two patterns — **A** is offline / batch, **B** is live.

**A) Periodic sweep (low volume, no webhook):**

There's no `assignedTo: null` filter and `manage_whatsapp_departments` has **no assign-chat action** (it's CRUD-only: list/create/update/delete). Pull active chats, keep the unassigned ones client-side (`chat.owner.agent == null`), and assign via the `send_whatsapp_message` `action: agent` (`chat:assign`) side-effect, which takes a `department` (or `agent`) in its params:

```
hourly:
  chats = get_whatsapp_chats(action: by_status, status: ["active"])
  for chat in chats where chat.owner?.agent == null:    # unassigned, client-side
    msgs = get_whatsapp_chat_messages(action: search, chat: chat.wid, query: "invoice")
    if msgs:
      send_whatsapp_message
        - action: agent
        - chat: <chat.wid>
        - agentId: <your-agent-id>
        - actions: [ { action: "chat:assign", params: { department: <finance.id> } } ]
```

**B) Live (via webhook — preferred):**

```
on message:in:new (via wassenger-webhooks):
  intent = classify_intent(data.message.body)   # rule-based or LLM
  if intent == "billing":
    # one send_whatsapp_message action: agent call does both:
    actions: [ { action: "chat:assign", params: { department: <finance.id> } },
               { action: "labels:add",  params: { labels: ["intent:billing"] } } ]
  elif intent == "technical":
    actions: [ { action: "chat:assign", params: { department: <tech.id> } },
               { action: "labels:add",  params: { labels: ["intent:technical"] } } ]
  else:
    leave for Layer 1 (auto-assignment to Tier 1)
```

Cache the classification with a `metadata:set` side-effect (or your own DB) so subsequent inbound messages skip the classifier call.

### Recipe 3 — Language-based routing

> "Spanish-speaking customers go to Marta, English to Pedro, Portuguese to João."

```
on message:in:new:
  if chat.contact.language is set:
    lang = chat.contact.language
  else:
    lang = detect_language(data.message.body)   # LLM or franc / cld3
    # cache for next time — direct REST call, Token: <API_KEY> header:
    PATCH https://api.wassenger.com/v1/contacts/{contactId}  body: { language: lang }

  agent = LANGUAGE_TO_AGENT[lang] || DEFAULT_AGENT
  send_whatsapp_message
    - action: agent
    - chat: <chat.wid>
    - agentId: <agent.id>
    - actions: [ { action: "chat:assign", params: { agent: <agent.id> } } ]
```

Detect on the **first** inbound message and cache. Don't re-detect on every reply (LLM call cost adds up).

### Recipe 4 — Skills-based routing

> "Send accessibility questions to Marta (she's our a11y specialist), even though the customer is in Sales' department."

Pattern: a **labels-driven override** on top of department routing.

```
on message:in:new:
  intent = classify(...)
  skills = extract_skills(intent, content)    # ["accessibility", "german"]

  candidates = team_members where skills CONTAINS any of skills
  if candidates:
    agent = least_busy(candidates)
    assign chat to agent
    label "skill-matched:<skill>"
  else:
    fall through to department routing (Recipe 2)
```

Maintain the `skills` attribute on each team member as a custom field (an array of tags). The agent at the keyboard can self-update it.

### Recipe 5 — Escalation if no reply

> "If an agent hasn't replied in 2 hours, escalate to the team lead."

```
every 5 min:
  chats = get_whatsapp_chats(action: by_status, status: ["active"])
  for chat in chats where chat.owner?.agent != null:   # assigned, client-side
    last_outbound = last outbound message in chat
    if (now - last_outbound) > 2h AND chat.escalated is false:
      # reassign + tag in one send_whatsapp_message action: agent call:
      actions: [ { action: "chat:assign", params: { agent: <team_lead.id> } },
                 { action: "labels:add",  params: { labels: ["escalated"] } } ]
      mark chat.escalated = true   (in your DB)
      Slack/email both the previous owner and the new one
```

**Don't escalate the same chat twice in a row to the same person.** Track who's been escalated to recently and skip them.

### Recipe 6 — Human fallback (the safety net)

The single most important rule of routing: **never leave a chat orphaned**.

```
hourly:
  chats = get_whatsapp_chats(action: by_status, status: ["active"])
  orphans = chats where:
    chat.owner?.agent == null                 # unassigned, client-side
    AND firstInboundAt < (now - 1h)

  for chat in orphans:
    # assign to an always-on operator + tag, one send_whatsapp_message action: agent:
    actions: [ { action: "chat:assign", params: { agent: <DEFAULT_FALLBACK_USER.id> } },
               { action: "labels:add",  params: { labels: ["fallback"] } } ]
    notify in Slack: "Chat with {customer} sat orphaned for >1h"
```

A chat without an owner for hours is a churned customer waiting to happen. Even an imperfect owner is better than none.

### Recipe 7 — Sticky routing (same agent next time)

> "If Pedro answered last time, route the next chat from this customer to Pedro."

```
on message:in:new:
  last_chat = previous chat with same contact (before this one)
  if last_chat and last_chat.owner?.agent != null:
    send_whatsapp_message
      - action: agent
      - chat: <this_chat.wid>
      - agentId: <last_chat.owner.agent.id>
      - actions: [ { action: "chat:assign", params: { agent: <last_chat.owner.agent.id> } },
                   { action: "labels:add",  params: { labels: ["sticky"] } } ]
```

Big CSAT bump for B2B / high-touch sales. Disable for high-volume support where consistency matters less than fast response.

## Anti-patterns

- **Routing without SLAs.** Routing that puts a chat on someone who's offline is the same as no routing. Always check `skipOffline` / `skipBusy`.
- **Over-engineering before there's volume.** A 5-person team doesn't need skills-based routing yet. Start with round-robin; add complexity when the team grows to 15+.
- **Classification without caching.** Re-classifying intent on every webhook = LLM bill explosion. Cache on the chat.
- **No human fallback.** Every routing rule should have an "else → DEFAULT_USER" branch. Without it, edge cases churn customers.
- **Auto-assignment that ignores capacity.** A round-robin that gives a 200-chat backlog to one agent is broken. Use `skipBusy` and reassign-if-unanswered.
- **Re-routing within the same conversation.** Once a chat is assigned, **don't** auto-reassign on subsequent inbound messages from the same contact — that breaks the conversation thread. Reassign only on explicit escalation or staff change.
- **Label-driven routing.** Labels are *outputs* of routing (for reporting), not *inputs*. Routing should be driven by content, time, or rules — not by who already tagged the chat.

## See also

- `wassenger-team` — set up the agents and departments that routing routes *to*.
- `wassenger-inbox` — manual assignment, labels, status (the lifecycle this skill automates).
- `wassenger-webhooks` — the event source for content-based routing.
- `wassenger-labels` — tagging *results* of routing for reporting.
- `wassenger-customer-support` — opinionated playbook combining routing + SLAs + escalation.
