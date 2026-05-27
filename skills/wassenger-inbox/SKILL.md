---
name: wassenger-inbox
description: Manage the Wassenger multi-agent WhatsApp inbox — chat status (active/resolved/pending/archived), assignment to team members, labels for organization, and departments for routing. Use when the user runs a customer-facing inbox with multiple agents and needs to organize chats, route conversations, tag and search them, or report on workload across the team.
license: MIT
metadata:
  author: Wassenger
  version: "1.0.0"
  category: capability
  requires-mcp: "@wassengerhq/mcp-wassenger"
---

# Wassenger Inbox

Run a shared WhatsApp inbox like a customer-support team would: many chats, many agents, statuses, labels, departments, and SLAs.

## When to use

- The user mentions a **support inbox**, **CRM**, **customer service**, or **multi-agent** setup on WhatsApp.
- They ask to assign / unassign / route chats, or to tag conversations with labels.
- They want to see what's pending, what's resolved, what's been waiting too long.
- They ask "who's handling X right now?" or want to report on team workload.

For sending messages out, route to `wassenger-messaging` or `wassenger-customer-support` (the latter wraps this skill with SLA + auto-reply logic).

## Prerequisites

- `wassenger-setup` complete.
- At least one device active. Most tools take `device`.
- Optional but recommended: at least one team member configured at https://app.wassenger.com/team and one department at https://app.wassenger.com/departments.

## Concepts

Wassenger's inbox model:

| Concept | What it is | Where it lives |
|---|---|---|
| **Chat** | A single conversation thread with one contact (or group). | `chats` module |
| **Chat status** | Lifecycle state: `active`, `pending`, `resolved`, `archived`. | Set via chat operations |
| **Assignment** | Which team member owns the chat. | `team` module |
| **Department** | Routing group (e.g. Sales, Support, Billing) with a list of agents. | `departments` module |
| **Label** | Free-form tag applied to chats. Use for status that doesn't fit the lifecycle (`vip`, `bug`, `lead-qualified`, `follow-up`). | `labels` module |
| **Queue** | Outbound message dispatch queue (not the inbox). | `queue` module — see `wassenger-campaigns` |

Statuses are **mutually exclusive**. Labels are **stackable**.

## Recipes

### Recipe 1 — Show me what needs attention

> "What chats are pending right now?"

```
get_whatsapp_chats_by_status
  - device: <id>
  - status: pending
  - limit: 50
```

Sort by `lastMessageAt:asc` to surface oldest first (typically what an SLA-driven team wants). Combine with `get_whatsapp_unread_chats` for the inbox "0 unread" view.

For a daily standup snapshot:

```
get_whatsapp_chat_statistics with device + dateRange=today
  → totals by status, average response time, oldest pending
```

### Recipe 2 — Assign a chat to an agent

> "Assign +34 600 111 222 to Marta."

```
1. manage_whatsapp_team with operation=search, query="Marta"
   → member.id
2. Patch the chat:
   PATCH /v1/chats/{chatWid}/assignee  body: { assignedTo: <member.id> }
   (exposed by the MCP via the chats module; the exact tool name maps to
   the chats update operation in tools-reference.md)
```

To unassign, set `assignedTo: null`. Bulk-assign by mapping over a chat list filtered with `get_whatsapp_chats_by_status`.

### Recipe 3 — Route by department

> "Send every chat that mentions 'invoice' or 'billing' to the Finance department."

This is a **routing rule**, not a one-shot assignment. Two patterns:

**A) Manual one-time sweep** (after the rule lands):

```
1. search across recent chats:
   for each chat in get_whatsapp_chats_by_status(active):
     msgs = get_whatsapp_chat_messages(chat.wid, filter=search, query="invoice")
     if msgs: tag chat with the Finance department
2. To tag: manage_whatsapp_departments with operation=assign-chat, dept=<finance.id>, chat=<chat.wid>
```

**B) Live routing via webhooks** — subscribe to `message:in:new` (see `wassenger-webhooks`), inspect content, set department. Webhook-driven routing scales; agent-driven sweeps don't.

### Recipe 4 — Label and filter

> "Tag every chat from Premium customers with 'vip'."

```
1. manage_whatsapp_labels with operation=create, name="vip", color="#f1c40f"
   → label.id (idempotent — if it exists, returns the existing one)
2. For each premium contact:
   manage_whatsapp_labels with operation=apply, label=<label.id>, chat=<chat.wid>
3. Later, list only VIPs:
   get_whatsapp_chats with filter labels=<label.id>
```

Labels are flat (no hierarchy). Use a `:` convention if you need nesting (`segment:vip`, `segment:churn-risk`, `bug:android`).

### Recipe 5 — Mark resolved / reopen

> "Mark the chat with +1 555 0100 as resolved."

```
PATCH /v1/chats/{chatWid}  body: { status: resolved }
```

Resolved chats are filtered out of the default "active" view but remain searchable. To reopen, set `status: active`. The `archived` status is for chats the user wants out of search entirely.

### Recipe 6 — Get team workload

> "How many chats does each agent have right now?"

```
1. manage_whatsapp_team with operation=search (all)  → list of members
2. For each member.id:
     get_whatsapp_assigned_chats with device + assignedTo=<member.id> + status=active
     → counts.length
3. Render a table sorted by count desc.
```

Use this for daily standups, capacity planning, or to detect stale assignments (a member with 200+ open chats is probably not actually working them).

### Recipe 7 — Bulk close stale chats

> "Close every chat that's been resolved or untouched for over 30 days."

```
1. get_whatsapp_chats_by_date_range with from=<30d ago>, to=<now>, sort=lastMessageAt:asc
2. Filter status != resolved AND lastMessageAt < now-30d in code
3. For each: set status=resolved (or archived)
```

For automation, wire this to a daily cron via your own scheduler, calling the MCP from a CI job or a serverless function.

## Common pitfalls

- **Statuses vs labels.** Don't use labels to track `pending`/`resolved` — that's what `status` is for. Use labels for *qualitative* tags (`vip`, `bug`, `prospect`) that orthogonally classify chats.
- **Reassigning loses history.** Assignment is metadata; messages stay put. But notifications fire on reassignment — don't bulk-reassign during business hours unless you want everyone pinged.
- **Departments overlap with labels.** A chat can belong to one department but many labels. Use departments for *routing* (who answers), labels for *attributes* (what kind of chat it is).
- **`get_whatsapp_chats` is paginated.** Default `limit=20`, max 200. Loop with `offset` for large inboxes.
- **WABA channels.** Channels don't have assignment or status (they're broadcast). Don't try to apply inbox concepts to channel messages.

## See also

- `wassenger-customer-support` — opinionated SLA + auto-reply playbook on top of this skill.
- `wassenger-messaging` — replies and sends from inside the inbox.
- `wassenger-webhooks` — drive routing rules from inbound events instead of polling.
- `wassenger-mcp` — exact tool names and parameter shapes (`references/tools-reference.md`).
