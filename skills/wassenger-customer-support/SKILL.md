---
name: wassenger-customer-support
description: Run a WhatsApp customer support operation with Wassenger — multi-agent inbox, auto-replies, business-hours, SLA tracking (first-response, resolution), escalation rules, ticket lifecycle, FAQ deflection, and reporting on team performance. Use when the user runs (or is building) a customer support team that handles tickets over WhatsApp and needs to organize the inbox, hit SLAs, and report on CSAT and workload.
license: MIT
metadata:
  author: Wassenger
  version: "1.0.0"
  category: industry
  vertical: customer-support
  requires-mcp: "mcp-wassenger"
---

# Wassenger for Customer Support

A complete playbook for running customer support on WhatsApp with a team — from the moment a customer messages in, to ticket resolution and reporting.

## When to use

Activate when the user:

- Operates a **support team**, **helpdesk**, **customer service**, or **success** function on WhatsApp.
- Asks about **SLAs**, **first-response time**, **resolution time**, **escalation**, **CSAT**, **tickets**.
- Mentions **auto-reply**, **business hours**, **out-of-office**, **FAQ**, **bot handoff**.
- Wants **routing** by language, product, region, or department.
- Asks "how do I report on what my team is doing?"

For outbound sales / lead qualification, route to `wassenger-sales-bot`. For broadcasts, use `wassenger-campaigns`. For order-related support inside an e-commerce flow, see `wassenger-ecommerce` Recipe 5.

## Prerequisites

- `wassenger-setup` complete.
- Team members configured at https://app.wassenger.com/team.
- (Recommended) Departments configured at https://app.wassenger.com/device/departments (Tier 1, Billing, Tech, …).
- (Optional) A knowledge base / FAQ source for deflection.
- For WABA: pre-approved **Utility templates** for out-of-hours, escalation acknowledgement, ticket-closed-feedback.

## The support lifecycle

```
NEW ─► PENDING ─► IN PROGRESS ─► WAITING ON CUSTOMER ─► RESOLVED ─► CLOSED
            │           │              │
            └──────► escalate ──► assigned to senior agent / dept
```

Map this to Wassenger primitives:

| Lifecycle stage | Wassenger state |
|---|---|
| NEW / PENDING | `chat.status = active`, no `assignedTo` |
| IN PROGRESS | `chat.status = active`, `assignedTo = agent` |
| WAITING ON CUSTOMER | label `waiting-customer`, status still active |
| RESOLVED | `chat.status = resolved` |
| CLOSED | `chat.status = archived` (no further action expected) |
| ESCALATED | label `escalated` + reassign |

## Recipes

### Recipe 1 — Auto-reply on first contact

> "When a brand-new customer messages us, send a greeting and tell them what to expect."

```
on message:in:new where chat.messageCount == 1:
  if within_business_hours():
    reply: "Hi! Thanks for reaching out. An agent will respond within 15 minutes."
    label chat "new-contact"
  else:
    reply: "Hi! Our hours are 9am-7pm CET, Mon-Fri. We'll reply first thing tomorrow."
    label chat "out-of-hours"
  ack 200
```

Use your own DB to track "first message" — Wassenger's `messageCount` may include outbound messages, depending on how the chat was created.

### Recipe 2 — Business hours + holiday calendar

```
function within_business_hours():
  now = utcnow()
  local = now.in_timezone("Europe/Madrid")
  if local.weekday() in [Saturday, Sunday]: return false
  if local.date in holiday_calendar: return false
  return 9 <= local.hour < 19

# On message:in:new outside business hours:
  send template "out_of_hours" with [agentName, next_business_day]
  label chat "out-of-hours"
```

Don't auto-reply twice to the same out-of-hours window for the same chat. Track last-auto-reply timestamp per chat.

### Recipe 3 — Route to the right department

> "Messages mentioning billing → Finance dept. Messages mentioning technical issues → Tech."

```
on message:in:new:
  intent = classify(message.body)   # rule-based or LLM
  if intent == "billing":
    assign chat to Finance dept
    label "intent:billing"
  elif intent == "technical":
    assign chat to Tech dept
    label "intent:technical"
  else:
    assign to Tier 1 round-robin
```

Use the chat's `analyze_whatsapp_chat_messages` tool for LLM-based intent extraction. Cache the classification on the chat so subsequent messages skip the LLM call.

### Recipe 4 — SLA tracking (first response time)

Define SLAs per chat tier:

| Tier | First response | Resolution |
|---|---|---|
| Standard | 30 min | 24h |
| Premium (label `vip`) | 10 min | 4h |
| Enterprise | 5 min | 2h |

Implement via scheduled job:

```
every 1 min:
  pending_chats = get_whatsapp_chats_by_status(active) where assignedTo is null
  for chat in pending_chats:
    sla = sla_for(chat.labels)
    age = now - chat.firstInboundAt
    if age > sla.first_response * 0.8 and not chat.sla_warned:
      ping_team_in_slack("⚠️ Chat with {customer} is {age}min old, SLA breach in {remaining}min")
      mark chat.sla_warned = true
    if age > sla.first_response:
      ping_team_in_slack("🚨 SLA BREACHED on chat with {customer} ({age}min)")
      label chat "sla-breach"
```

### Recipe 5 — FAQ deflection

Before routing to a human, try to answer common questions:

```
on message:in:new (with bot tag enabled):
  faq_match = match_faq(message.body, threshold=0.8)
  if faq_match:
    reply with faq.answer + "Did that help? Reply YES or type AGENT to talk to a person."
    label chat "faq-attempted"
    if next inbound is "AGENT" or negative sentiment:
      remove bot tag, assign to human
  else:
    assign to human directly
```

Deflection reduces team load 30-50% on commodity questions. Track success rate: chats labeled `faq-attempted` AND ending in `resolved` without human assignment.

### Recipe 6 — Escalation

> "If an agent hasn't replied in 2 hours, escalate to senior."

```
every 5 min:
  in_progress = get_whatsapp_chats_by_status(active) where assignedTo not null and labels not include "resolved"
  for chat in in_progress:
    last_outbound = last message from any agent in chat
    if (now - last_outbound) > 2h:
      reassign chat to senior_agent_or_team_lead
      label "escalated"
      notify both original and new owner in Slack
```

Set the escalation threshold by tier. Don't auto-escalate VIPs to the same junior agent twice in a row.

### Recipe 7 — Resolution + CSAT survey

When agent marks chat as resolved:

```
1. set chat.status = resolved
2. wait 5 minutes (let the last message land)
3. send template "csat_survey":
     "How would you rate this support experience?
      Reply 1 (bad) to 5 (excellent)."
4. on next message:in:new where chat.status == resolved:
     parse rating
     save to CSAT DB
     if rating <= 2: alert team lead for follow-up
```

Don't send the CSAT request more than once per chat. Track sent-at timestamp.

### Recipe 8 — Reporting

Daily / weekly digest queries:

```
- Open chats by department:
    for each dept: get_whatsapp_chats_by_status(active) filtered by dept
- Avg first response time today:
    get_whatsapp_chat_statistics with dateRange=today
- Top agents by resolved chats:
    for each agent: count get_whatsapp_chats_by_status(resolved) where assignedTo=agent
- SLA breach count:
    count chats with label "sla-breach" today
```

Render to a Slack message, a Google Sheet, or a Notion database via a scheduled job.

## Anti-patterns

- **Auto-replying after the first message of a thread.** Once the human is in, the bot should be silent. Only the first message (or after `WAITING` for >Xh) should trigger an auto-reply.
- **Closing chats too aggressively.** Mark `resolved` only when the customer confirms (or after a clear "thank you"). Premature close kills CSAT.
- **No labels = no reporting.** If you can't query chats by topic, intent, or status, you have no visibility. Label aggressively, even if just `intent:*`.
- **SLAs without escalation.** SLAs that fire alerts but don't actually reassign are theater. Wire escalation to the same SLA timer.
- **Mixing sales and support in one inbox without labels.** Sales reps optimize for revenue; support optimizes for resolution. Label every inbound so reports can split correctly.

## See also

- `wassenger-inbox` — the lifecycle primitives (status, assignment, labels, departments).
- `wassenger-webhooks` — the event source for all reactive logic.
- `wassenger-messaging` — message + template construction.
- `wassenger-sales-bot` — the sales-side counterpart, with handoff rules.
- Reference implementation: https://github.com/wassengerhq/whatsapp-chatgpt-bot
- Multi-agent support article: https://wassenger.com/blog/multi-agent-whatsapp-support
- Scale support article: https://wassenger.com/blog/how-to-scale-whatsapp-support-without-hiring-more-staff
