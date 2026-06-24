---
name: wassenger-inbox
description: Manage chats in the Wassenger WhatsApp inbox — chat lifecycle (active/pending/resolved/archived), manual one-off assignment, internal notes for agent collaboration, archive and restore, bulk housekeeping, and workload reports. Use when the user wants to organize and triage chats. For label CRUD see wassenger-labels, for auto-assignment rules see wassenger-routing, for adding or removing agents see wassenger-team, for auto-replies see wassenger-auto-replies, for canned responses see wassenger-quick-replies.
license: MIT
metadata:
  author: Wassenger
  version: "1.0.0"
  category: capability
  requires-mcp: "mcp-wassenger"
---

# Wassenger Inbox

The day-to-day chat triage layer: read what's coming in, decide where it goes, mark what's done, archive what's old. The atomic features that compose with the inbox — labels, routing, team, auto-replies, quick replies — live in their own skills. Use those when the operation is specifically about that domain.

## When to use

- The user mentions a **support inbox** or **multi-agent setup** and wants to see what's pending / resolved.
- They want to **manually assign** a single chat to an agent.
- They want to **report on workload** (who's handling how many chats).
- They want to **leave a note on a chat** for the next agent who picks it up.
- They want to **archive** old chats or **restore** an archived one.
- They want to **search** the inbox or **bulk-close** old chats.

For specific atomic operations, route to the dedicated skill:

| If the user wants to… | Go to |
|---|---|
| Auto-assign / route by department / escalate | `wassenger-routing` |
| Create or apply labels (CRUD) | `wassenger-labels` |
| Add / remove agents, manage roles | `wassenger-team` |
| Set up welcome / out-of-office auto-replies | `wassenger-auto-replies` |
| Build a library of canned responses | `wassenger-quick-replies` |
| Send a message (one-off or template) | `wassenger-messaging` |

## Prerequisites

- `wassenger-setup` complete.
- At least one device active. Most tools take `device`.
- Team configured (`wassenger-team`).

## Concepts

| Concept | What it is |
|---|---|
| **Chat** | A single conversation thread with one contact. |
| **Chat status** | Lifecycle: `active`, `pending`, `resolved`, `archived`. **Mutually exclusive**. |
| **Assignment** | Which team member owns the chat. One owner at a time. |
| **Label** | Free-form tag (`vip`, `intent:billing`). **Stackable**. See `wassenger-labels`. |
| **Note** | Internal-only annotation. Team sees it, the contact never does. |

## Recipes

### Recipe 1 — Show me what needs attention

> "What chats are pending right now?"

```
get_whatsapp_chats_by_status
  - device: <id>
  - status: pending
  - limit: 50
```

Sort by `lastMessageAt:asc` to surface oldest first. Combine with `get_whatsapp_unread_chats` for the "0 unread" view.

Daily standup snapshot:

```
get_whatsapp_chat_statistics with device + groupBy=status + fromDate=<today 00:00> + toDate=now
  → totals by status. (For response-time / oldest-pending, list the chats and
    compute client-side — see wassenger-analytics.)
```

### Recipe 2 — Manually assign a chat

> "Assign +34 600 111 222 to Marta."

```
1. manage_whatsapp_team with action=search, query="Marta"
   → userId
2. send_whatsapp_message
     - action: "agent"
     - chat: <chatWid>
     - agentId: <userId>
     - actions: [{ action: "chat:assign", params: { agent: <userId> } }]
```

This assigns the chat (and can send an accompanying message in the same call). To unassign, use `{ action: "chat:unassign" }`. The equivalent direct REST call is `PATCH /v1/chats/{chatWid}` with `{ "agent": <userId> }` (header `Token: $WASSENGER_API_KEY`) — verify the exact field in app.wassenger.com/docs. For **automatic** assignment (round-robin, by intent, by language), don't loop manual calls — use `wassenger-routing`.

### Recipe 3 — Add an internal note

> "Add a note: customer prefers Spanish, has a Pro plan, last contact in April."

Notes are internal — the team sees them in the chat sidebar; the customer never does. Perfect for context handoff between agents.

Notes are **not in the MCP** — call the Wassenger REST API directly (header `Token: $WASSENGER_API_KEY`). Verify the exact path/body in app.wassenger.com/docs (Chats → notes):

```
# Direct REST call (not an MCP tool)
POST https://api.wassenger.com/v1/io/{deviceId}/chats/{chatWid}/notes
  -H "Token: $WASSENGER_API_KEY"
  body: {
    "body": "Customer prefers Spanish. Pro plan since 2025-03. Last contact 2026-04-15 (billing question)."
  }
```

List existing notes (also a direct REST call):

```
GET https://api.wassenger.com/v1/io/{deviceId}/chats/{chatWid}/notes
  -H "Token: $WASSENGER_API_KEY"
```

Update / delete by note id. Always leave a note when reassigning a chat to another agent (Recipe 2) — the next person needs the context.

### Recipe 4 — Mark resolved / reopen

> "Mark the chat with +1 555 0100 as resolved."

The MCP way — resolve (and optionally reply) in one call:

```
send_whatsapp_message
  - action: "agent"
  - chat: <chatWid>
  - agentId: <userId>
  - actions: [{ action: "chat:resolve" }]      # chat:unresolve to reopen
```

Or the equivalent direct REST call (not an MCP tool — verify in app.wassenger.com/docs):

```
PATCH https://api.wassenger.com/v1/chats/{chatWid}
  -H "Token: $WASSENGER_API_KEY"
  body: { "status": "resolved" }
```

Resolved chats stay searchable. To reopen → `chat:unresolve` (or `status: "active"`). To remove from default search entirely → archive (Recipe 5). Valid chat statuses are `active`, `pending`, `resolved`, `archived` (plus `muted` / `banned` / `removed`).

### Recipe 5 — Archive / restore

> "Archive this chat — we're done with it."

Archive/restore are direct REST calls (not MCP tools — header `Token: $WASSENGER_API_KEY`; verify the exact path in app.wassenger.com/docs):

```
PUT    https://api.wassenger.com/v1/io/{deviceId}/chats/{chatWid}/archive   # archive
DELETE https://api.wassenger.com/v1/io/{deviceId}/chats/{chatWid}/archive   # restore (unarchive)
```

**Archive vs Resolved:**

- **Resolved** = "this was handled" — still appears in reports and search.
- **Archived** = "remove from active view" — only shows when you query `get_whatsapp_archived_chats`.

Use both; they're complementary. A chat is usually `resolved → archived` after the team has moved on.

### Recipe 6 — Bulk close stale chats

> "Resolve every chat untouched for over 30 days."

```
1. get_whatsapp_chats_by_date_range with fromDate=<60d ago>, toDate=<30d ago>,
     sortBy=lastMessageAt, sortOrder=asc
2. Filter status != resolved in code (server-side filter not always available)
3. For each: resolve via send_whatsapp_message action:"agent" actions:[{action:"chat:resolve"}]
     (or the REST PATCH https://api.wassenger.com/v1/chats/{wid} body: { "status": "resolved" })
4. After resolution, archive anything older than 90 days (Recipe 5).
```

Wire to a daily cron. For larger inboxes (>10k stale chats), batch by week to keep individual jobs short.

### Recipe 7 — Team workload report

> "How many chats does each agent have right now?"

```
1. manage_whatsapp_team action=search query=""  → all members
2. For each userId:
     get_whatsapp_assigned_chats with agentId=<userId>, status=["active"]
     → counts.length
3. Render sorted table.
```

Outliers (one agent with 200+ active chats) indicate broken assignment logic, not a hard worker — see `wassenger-routing` to rebalance.

### Recipe 8 — Search the inbox

> "Find every chat where the customer mentioned 'refund'."

```
For each active chat (paginated via get_whatsapp_chats_by_status):
  msgs = get_whatsapp_chat_messages(chat=chat.wid, action=search, query="refund")
  if msgs.length > 0: add to results
```

Heavy operation. For repeated queries, cache the chat→intent classification on `chat.metadata` per webhook (see `wassenger-webhooks`) so subsequent searches are O(1).

## Common pitfalls

- **Statuses vs labels.** Don't use labels to track `pending`/`resolved` — that's what `status` is for. Labels are for *qualitative* tags (`vip`, `bug`, `prospect`). See `wassenger-labels` for the namespace convention.
- **Notes vs messages.** Notes are internal-only. Don't accidentally use the messaging tools to leave team annotations; the recipient receives the text and is confused. Always go through the `/notes` endpoint.
- **Archive vs Resolved confusion.** Resolved = handled. Archived = out of view. Use both, in that order.
- **`get_whatsapp_chats` is paginated.** Default `limit=20`, **max 100**. Loop with `offset` for large inboxes.
- **Looping manual assigns to fake auto-assignment.** If the goal is "every new chat should land on whoever is available", that's `wassenger-routing`, not a script around this skill. Manual assignment is for the one-off case.
- **Reassigning during business hours.** Reassignment notifications ping the new owner instantly. Bulk-reassigning at 10am will distract the whole team — schedule for off-hours.

## See also

- `wassenger-team` — manage agents, roles, device access.
- `wassenger-routing` — auto-assignment, departments, escalation, fallback.
- `wassenger-labels` — full label CRUD + bulk-apply + reporting.
- `wassenger-auto-replies` — welcome / out-of-hours / busy automatic responses.
- `wassenger-quick-replies` — canned-response library for agents.
- `wassenger-messaging` — sending messages from inside the inbox.
- `wassenger-webhooks` — drive inbox automation from inbound events.
- `wassenger-customer-support` — opinionated SLA + escalation playbook on top of this skill.
- `wassenger-mcp` — exact tool names and parameter shapes.
