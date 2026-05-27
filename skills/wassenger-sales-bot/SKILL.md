---
name: wassenger-sales-bot
description: Build WhatsApp sales workflows with Wassenger — qualify inbound leads, schedule sales meetings (Calendly / Cal.com / Google Calendar), run follow-up sequences with cadence, sync to a CRM (HubSpot, Pipedrive, Salesforce), and hand off to a human salesperson at the right moment. Use when the user runs a sales team or is a solo founder closing deals via WhatsApp and wants to automate qualification, scheduling, and nurture without losing the human touch on warm leads.
license: MIT
metadata:
  author: Wassenger
  version: "1.0.0"
  category: industry
  vertical: sales
  requires-mcp: "@wassengerhq/mcp-wassenger"
---

# Wassenger for Sales

Use WhatsApp as the top of the sales funnel without burning out the team. The recipes below assume the user has a defined ICP, a CRM (or wants one), and at least one human closer who handles warm leads.

## When to use

Activate when the user:

- Mentions **sales**, **leads**, **prospects**, **outbound**, **pipeline**, **closing**, **demo bookings**.
- Asks about **lead qualification**, **BANT**, **MEDDIC**, **discovery questions** on WhatsApp.
- Wants to schedule meetings via WhatsApp (Calendly, Cal.com, Google Meet).
- Runs an SDR / AE team and needs **handoff rules** between bot and humans.
- Asks about CRM integration (HubSpot, Pipedrive, Salesforce, Attio, Close).

For pure customer support (existing customers with issues), route to `wassenger-customer-support`. For marketing / nurture campaigns over many leads at once, use `wassenger-campaigns`.

## Prerequisites

- `wassenger-setup` complete.
- A scheduling tool the customer uses (Calendly, Cal.com, Google Calendar, HubSpot Meetings).
- A CRM (or a spreadsheet acting as one).
- For WABA devices: pre-approved **Utility templates** for confirmations + reminders.

## The qualification → handoff loop

```
1. Lead lands (form fill, ad click, referral)
2. Bot greets + qualifies (3-5 questions)
3. If qualified:
   - schedule meeting → human takes it from there
   - sync to CRM with notes
   - tag chat for the closer
4. If not qualified:
   - polite no, optional nurture sequence
   - tag for re-qualification in 90 days
```

Keep the bot short. Long bot conversations kill warmth. After **3 messages max**, the bot should either book a meeting, hand off to a human, or close the loop politely.

## Recipes

### Recipe 1 — First-touch from a web form

> "Lead fills our form at example.com/demo with name, phone, company. Welcome them on WhatsApp."

```
on form submission:
  verifyWhatsAppNumberExists(lead.phone) → if false, fall back to email
  send_whatsapp_message
    - device: $DEVICE_ID
    - phone: lead.phone
    - message: |
        Hola {{firstName}}, gracias por tu interés en {{product}}.
        Soy {{salesAgent}} de Wassenger. Para preparar tu demo,
        ¿podría saber el tamaño de tu equipo (1-10, 11-50, 50+)?
  CRM.createDeal(stage: "new", source: "whatsapp", chat: $chatWid)
```

Personalize with the data the form already captured. Don't ask the customer to repeat themselves.

### Recipe 2 — Lead qualification (3 questions max)

A simple state machine driven by a webhook handler + LLM (or rule-based dialog if you prefer determinism):

```
state: NEW → ASKED_TEAM_SIZE → ASKED_USE_CASE → ASKED_TIMELINE → QUALIFIED | DISQUALIFIED

on message:in:new (with bot tag on chat):
  load chat.state from your DB
  switch chat.state:
    case NEW:
      ask "¿Cuál es el tamaño de tu equipo?"; advance to ASKED_TEAM_SIZE
    case ASKED_TEAM_SIZE:
      parse answer; save in CRM; ask "¿Cuál es tu caso de uso principal?"
      advance to ASKED_USE_CASE
    case ASKED_USE_CASE:
      parse + save; ask "¿Cuándo necesitarías esto en marcha?"
      advance to ASKED_TIMELINE
    case ASKED_TIMELINE:
      compute score (team_size + use_case_match + timeline_urgency)
      if score >= threshold:
        send Calendly link; advance to QUALIFIED
        assign chat to human closer
      else:
        polite no; tag "nurture-q4"; advance to DISQUALIFIED
```

Persist state in your DB keyed by `chat.wid` — don't try to derive it from message history alone.

### Recipe 3 — Schedule a meeting

> "Send the Calendly link and confirm the booking."

```
1. send template "demo_link" with parameters: [firstName, calendlyUrl]
2. Subscribe to Calendly webhook event.created
3. on event.created:
     send_whatsapp_message
       - phone: lead.phone
       - message: |
           ✅ Confirmado: {{eventName}} con {{closer.name}}
           📅 {{date}} a las {{time}} ({{timezone}})
           Únete aquí: {{event.location}}
4. Schedule a reminder 1 hour before:
     send_whatsapp_message with deliverAt: event.startTime - 1h
       - template "meeting_reminder" with [firstName, calendlyUrl]
```

For no-shows, fire a "did you forget?" message 10 min after the start time, then auto-reschedule offer 1 day later.

### Recipe 4 — Follow-up cadence (after demo, no decision)

A typical post-demo cadence:

| Day | Touch | Channel |
|---|---|---|
| 0 | Demo completed | Live |
| +1 | Recap + next-steps WhatsApp message | WA, free-form (within 24h) |
| +3 | Case study / social proof | WA template if outside 24h |
| +7 | "Any blockers?" check-in | WA |
| +14 | "Last chance for current pricing" | WA template |
| +30 | "Closing the file unless you reach out" | Email + WA |

Wire each step as a scheduled job (`deliverAt` or your own cron):

```
on demo completed:
  for step in cadence:
    if step.condition(lead): // e.g., not_replied_yet, no_decision
      schedule send_whatsapp_message at demo.endedAt + step.delay
```

Skip the cadence as soon as the lead replies — switch to live human conversation.

### Recipe 5 — Handoff to a human

When the lead is qualified or asks something the bot can't answer:

```
1. tag chat with label "handoff" or "qualified"
2. assign chat to the next available closer:
     - simple: round-robin from team list
     - smarter: pick closer by language, territory, lead size, current load
3. notify the closer:
     - in-app (Wassenger console pings)
     - Slack DM via webhook handler
4. bot stops responding to this chat — flag in your DB so future webhook
   events don't trigger bot logic
```

Don't dump a fully-resolved bot conversation on a human without a one-line summary. Generate a summary with `analyze_whatsapp_chat_messages` and post it to the closer's Slack DM along with the chat link.

### Recipe 6 — CRM sync

Every meaningful event should mirror to the CRM:

| WhatsApp event | CRM action |
|---|---|
| First message from new lead | Create contact + deal (stage: new) |
| Qualification answers | Update deal custom fields |
| Meeting booked | Move deal to "meeting scheduled" |
| Meeting completed | Move to "demo done" + log meeting note |
| No reply 14 days | Move to "stalled" + create task |
| `STOP` keyword | Mark unsubscribed + close deal as lost |

For HubSpot / Pipedrive / Salesforce / Attio, the easiest path is an n8n workflow with `wassengerhq/n8n-wassenger` + the CRM's official nodes. For lighter setups, a small Cloudflare Worker / Vercel Function works too.

## Anti-patterns

- **Letting the bot ramble.** Anything past 3 bot messages without value pushes the lead away. Hand off early.
- **Asking what the form already captured.** If `lead.companySize` came from the form, don't ask the customer for it again.
- **Calendly link with no context.** Always preface with what the meeting is about and who they'll meet. Naked URLs convert worse.
- **Cadence that ignores replies.** If the lead replies anywhere in the cadence, **cancel** the remaining touches. Hammering a replying lead with templates is the fastest way to lose them.
- **No closer for warm leads.** A qualified lead handed off to a busy human who replies 4 days later loses 60%+ conversion. Capacity-plan before scaling outbound.
- **Bot tries to negotiate pricing.** Always escalate pricing / contract questions to a human. Bots make commitments they can't keep.

## See also

- `wassenger-messaging` — message + template details.
- `wassenger-inbox` — assignment, labels, team workload.
- `wassenger-webhooks` — the event listener under all the cadence logic.
- `wassenger-campaigns` — for outbound list-based outreach (vs. inbound qualification handled here).
- Reference implementation: https://github.com/wassengerhq/whatsapp-chatgpt-bot
- Sales bot article: https://wassenger.com/blog/create-a-whatsapp-sales-bot
