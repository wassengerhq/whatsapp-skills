---
name: wassenger-auto-replies
description: Configure rule-based automatic replies on Wassenger so WhatsApp never leaves a customer waiting — welcome new contacts on first message, send out-of-office responses outside business hours, acknowledge when all agents are busy, and follow up if a chat goes silent. Use when the user wants WhatsApp to respond automatically based on time, status, or message content — even at 3am, on weekends, or while the team is in meetings. Manages the rule library, trigger conditions, business-hours definitions, and per-device differences.
license: MIT
metadata:
  author: Wassenger
  version: "1.0.0"
  category: capability
  requires-mcp: "mcp-wassenger"
---

# Wassenger Auto-Replies

The "we got your message" reflex of a healthy support operation. Customer writes at 11pm → 5 seconds later they have an acknowledgement + an expectation. By the time a human picks it up the next morning, the customer hasn't already moved on.

## When to use

- *"Set up a welcome message when someone writes us for the first time."*
- *"Configure an out-of-office reply for weekends."*
- *"What auto-replies are active right now?"*
- *"If a chat goes silent for 24 hours, send a follow-up."*
- *"Disable all auto-replies tomorrow — we have an offsite."*

For *human-triggered* canned responses (`/shipping`, `/returns`), see `wassenger-quick-replies`. For WABA templates sent outside the 24h customer service window, see `wassenger-messaging` Recipe 3.

## Prerequisites

- `wassenger-setup` complete.
- A device with `status: ready`.
- Admin permissions on the account.
- A clear policy: when does the team respond? What's the SLA? What do you tell people who write at 2am?

## The trigger types

Wassenger auto-replies are rule-based. Each rule has a **trigger**, a **filter**, and an **action**:

| Trigger | When it fires |
|---|---|
| `welcome` | First-ever inbound message from a new contact |
| `outOfHours` | Inbound arrives outside configured business hours |
| `busy` | All agents at capacity (or none online) |
| `inactive` | Chat has had no agent reply for N hours |
| `keyword` | Inbound message matches a regex / keyword list |
| `awayMessage` | Inbound arrives while a vacation / away mode is active |

| Action | What it does |
|---|---|
| `reply` | Send a configured text/media response |
| `reply + label` | Reply + apply a label (e.g., `out-of-hours`) |
| `reply + assign` | Reply + auto-assign to a fallback agent |
| `reply + template` | Send a WABA template (when outside the 24h window) |

## The 24h window matters here

Most auto-reply triggers fire on **inbound messages**, which means the 24-hour customer service window has **just opened** — free-form text is allowed. Safe by default.

The exception is `inactive` (follow-up after silence). If the gap crosses 24h, the auto-reply must use a **WABA template**, not free-form. Wassenger detects this and either:

- Switches to a template you configure as the fallback, or
- Skips the send and labels the chat for human attention.

Always configure a template fallback for `inactive` rules.

## Recipes

### Recipe 1 — Welcome on first contact

> "When a new customer writes for the first time, greet them and tell them what to expect."

The Wassenger MCP doesn't expose auto-reply management as a tool yet — call REST directly:

```
POST /v1/devices/{deviceId}/autoreplies
  -H "Token: $WASSENGER_API_KEY"
  body: {
    "name": "Welcome — new contact",
    "trigger": "welcome",
    "message": "¡Hola! Gracias por escribirnos. Un agente te responderá en menos de una hora durante horario comercial (L-V 9:00-19:00 CET).",
    "media": null,
    "enabled": true,
    "labels": ["new-contact"]
  }
```

Set expectations honestly: if your SLA is 4 hours, say 4 hours, not 1. Broken promises hurt more than a slightly slower one.

### Recipe 2 — Business hours / out-of-office

> "On weekends and weekday nights, send: 'We're back tomorrow at 9am.'"

```
POST /v1/devices/{deviceId}/autoreplies
  body: {
    "name": "Out of hours",
    "trigger": "outOfHours",
    "businessHours": {
      "timezone": "Europe/Madrid",
      "mon": [{"start": "09:00", "end": "19:00"}],
      "tue": [{"start": "09:00", "end": "19:00"}],
      "wed": [{"start": "09:00", "end": "19:00"}],
      "thu": [{"start": "09:00", "end": "19:00"}],
      "fri": [{"start": "09:00", "end": "19:00"}],
      "sat": [],
      "sun": []
    },
    "holidays": ["2026-01-01", "2026-12-25"],
    "message": "Hola, gracias por escribirnos. Nuestro horario es L-V 9:00-19:00 CET. Volveremos a contestarte mañana a primera hora.",
    "enabled": true,
    "labels": ["out-of-hours"]
  }
```

Multiple time blocks per day are supported (e.g., siesta: `[{start: "09:00", end: "14:00"}, {start: "16:00", end: "19:00"}]`). Always set `timezone` — server time is UTC and that's almost never what you want.

### Recipe 3 — "Agents are busy"

> "When all our agents are at capacity, tell the customer we'll get to them soon."

```
POST /v1/devices/{deviceId}/autoreplies
  body: {
    "name": "Busy acknowledgement",
    "trigger": "busy",
    "busyThreshold": {
      "openChatsPerAgent": 25      # consider "busy" when each agent has 25+ open chats
    },
    "message": "¡Estamos con muchos mensajes ahora mismo! Un agente te contestará en cuanto se libere — máximo 30 minutos.",
    "enabled": true,
    "labels": ["queued"]
  }
```

Don't lie about the wait. If you say 30 min and it's 4 hours, the customer churns. Either tune the threshold realistically, or shift the message to be honest about the queue.

### Recipe 4 — Silent follow-up

> "If a chat has had no agent reply for 24 hours, send a follow-up checking in."

```
POST /v1/devices/{deviceId}/autoreplies
  body: {
    "name": "Follow-up — inactive 24h",
    "trigger": "inactive",
    "inactiveAfter": 1440,       # minutes (24h)
    "message": "Hola, queríamos confirmar si has resuelto tu consulta o si necesitas algo más.",
    "templateFallback": {        # used if the 24h window has expired
      "name": "follow_up_24h",
      "language": "es",
      "components": [{ "type": "body", "parameters": [] }]
    },
    "maxFollowUps": 1,           # never more than 1 follow-up per chat
    "enabled": true
  }
```

Use `maxFollowUps: 1`. Multiple follow-ups feel like nagging and hurt CSAT more than they help recover.

### Recipe 5 — Keyword auto-reply

> "When someone writes 'precio' or 'pricing', send the pricing one-pager."

```
POST /v1/devices/{deviceId}/autoreplies
  body: {
    "name": "Pricing auto-reply",
    "trigger": "keyword",
    "keywords": ["precio", "pricing", "cuánto cuesta", "tarifa"],
    "matchMode": "any",          # any | all | exact
    "caseSensitive": false,
    "message": "Aquí tienes nuestras tarifas actualizadas:",
    "media": { "file": "<pricing-pdf-file-id>" },
    "enabled": true,
    "labels": ["intent:pricing"]
  }
```

Keep keyword lists **tight**. A keyword that matches "pricing" but also fires on "appreciation" because both contain "preci" is worse than no auto-reply at all.

### Recipe 6 — Different replies per language

```
For each language in [es, en, pt_BR]:
  POST /v1/devices/{deviceId}/autoreplies
    body: {
      "name": f"Welcome — {lang}",
      "trigger": "welcome",
      "filter": { "contactLanguage": lang },
      "message": LANG_TO_MESSAGE[lang],
      "enabled": true
    }
```

Rules are evaluated in order — if you have multiple matching rules, the first enabled match wins. Order matters: put more-specific rules **before** catch-alls.

### Recipe 7 — Disable for a specific chat (human takes over)

> "Disable the welcome auto-reply for this chat — I'm handling it personally now."

```
PATCH /v1/chats/{chatWid}
  body: { "autoRepliesDisabled": true }
```

Once you set this, no auto-reply (of any trigger type) fires for this chat until you reverse it. The same flag is auto-set by Wassenger when an agent sends a manual reply — once a human is in, auto-replies back off automatically (avoid double-messaging).

### Recipe 8 — List + audit current rules

> "What auto-replies are active right now? Are any duplicating?"

```
GET /v1/devices/{deviceId}/autoreplies
  → array of rules
```

Render with priority order, trigger, enabled state. Look for:

- Two rules with the same trigger and overlapping filters → conflict.
- Disabled rules from 6 months ago → either delete or re-enable.
- Rules with no labels → cannot be reported on later.

Audit quarterly.

### Recipe 9 — Disable all auto-replies temporarily

> "We have a launch tomorrow — disable all auto-replies so customers get only human replies."

```
GET /v1/devices/{deviceId}/autoreplies  → rules
For each rule:
  PATCH /v1/devices/{deviceId}/autoreplies/{id}  body: { enabled: false }
```

Re-enable the day after via the same PATCH with `enabled: true`. Track which rules were enabled originally — easy way is to set a `tag: "temporarily-disabled-{date}"` on each as you go.

## Anti-patterns

- **Promise an SLA you can't keep.** If the welcome message says "agent will reply in 5 minutes" and the actual response is 4 hours, every customer feels lied to. Set honest expectations.
- **Auto-replies in the middle of a thread.** Once a human is replying, auto-replies should be silent. Wassenger handles this with `autoRepliesDisabled` once an agent sends — don't disable that safeguard.
- **Out-of-office without holidays.** If your country has 14 public holidays a year and your config has none, customers writing on 1 January get a "back in 5 minutes" message that's wrong. Maintain a holiday calendar.
- **Follow-ups that don't stop.** `maxFollowUps: 1`. Always. Multiple bot follow-ups feel like spam.
- **Keyword matches that overfit.** `["pay", "payment", "paying"]` will trigger on "I'm not paying for that" — opposite intent. Test with real-world examples before deploying.
- **No control group.** Want to know if auto-replies actually help retention? Disable them on a small % of new contacts for a month and measure. If your CSAT and resolution rate don't move, the auto-reply isn't adding value.
- **Out-of-hours auto-reply that ignores opt-out.** A customer who replied STOP shouldn't receive an automated out-of-office. Always check the opt-out flag before any auto-reply send.

## See also

- `wassenger-quick-replies` — human-triggered library (vs auto-replies which are condition-triggered).
- `wassenger-messaging` — the underlying send mechanics, including templates for the inactive-follow-up case.
- `wassenger-routing` — auto-assignment after the auto-reply fires (so the chat lands on a human).
- `wassenger-customer-support` — the opinionated playbook that combines auto-replies + SLA tracking + escalation.
