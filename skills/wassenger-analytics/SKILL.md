---
name: wassenger-analytics
description: Report on your Wassenger WhatsApp inbox by composing live chat and message queries into metrics — chats by status, agent workload, response and resolution times, message volume by type, unread backlog, label/topic distribution, and language/country breakdowns. Use when the user asks for analytics, reports, KPIs, a dashboard, agent productivity, "how many chats…", "what's our average response time", "which agent handled the most", or any question that aggregates inbox data over a period. Works without a stats endpoint by pulling filtered lists and aggregating client-side.
license: MIT
metadata:
  author: Wassenger
  version: "1.0.0"
  category: capability
  requires-mcp: "mcp-wassenger"
---

# Wassenger Analytics

Turn the live inbox into numbers. Wassenger does expose dedicated statistics tools (`get_whatsapp_chat_statistics` and `analyze_whatsapp_chats` action=`statistics`) and they work — but they aggregate over fixed groupings. When you need a **custom window or a metric they don't group by** (true first-response time, label distribution, language split), prefer pulling **filtered lists of chats and messages** and aggregating them client-side. Most recipes below take the list-and-aggregate route for exactly that reason.

The pattern is always the same: **(1) resolve the device(s) → (2) pull a filtered slice → (3) paginate until complete → (4) group / count / time-delta in code → (5) render the answer.**

## When to use

- The user asks for a **report, dashboard, KPI, or metric** over the inbox.
- "**How many** chats are open / were resolved this week / are unassigned?"
- "**What's our** average first-response time / resolution time?"
- "**Which agent** handled the most chats?" / "How is workload distributed?"
- "**How many messages** did we send yesterday?" / "breakdown by type."
- "What **languages / countries** are our customers writing from?"
- "What are the **most common labels** on new chats?"

Route elsewhere when the request is an action, not a measurement:

| If the user wants to… | Go to |
|---|---|
| Assign / resolve / archive a specific chat | `wassenger-inbox` |
| Set up auto-assignment or escalation | `wassenger-routing` |
| Create / apply labels | `wassenger-labels` |
| Send or broadcast a message | `wassenger-messaging` / `wassenger-campaigns` |
| SLA tracking + support-team reporting playbook | `wassenger-customer-support` (builds on this skill) |

## Prerequisites

- `wassenger-setup` complete; at least one device. **Every tool here takes `device`** — resolve it first with `get_whatsapp_devices` (use `device.id`). For multi-device accounts, run per device and sum.
- To turn agent IDs into names, fetch the roster once with `manage_whatsapp_team` (action `search`, empty query) and build an `id → name` map (use `m.name`).

## How metrics are derived

| Metric | Source tool(s) | Aggregation |
|---|---|---|
| Chats by status | `get_whatsapp_chats` action=`by_status` | use the `statusDistribution` summary, or count `chat.status` |
| Volume over a period | `get_whatsapp_chats` action=`by_date_range` | count by `firstMessageAt` (new) or `lastMessageAt` (active) |
| Agent workload | `get_whatsapp_chats` action=`assigned` (per `agentId`) | count per agent; sort |
| Department split | `get_whatsapp_chats` action=`assigned` (per `departmentId`) | count per department |
| Unread / backlog | `get_whatsapp_unread_chats` | count + sort by `unreadCount` |
| First-response time | per chat: `owner.assignedAt`, `firstMessageAt`, `lastInboundMessageAt`, `lastOutboundMessageAt` | time delta, then average |
| Resolution time | per chat: `firstMessageAt` → `statusUpdatedAt` where `status=resolved` | time delta, then average |
| Message volume by type | `get_whatsapp_chat_messages` action=`by_type` / `date_range` | count per `messageType` |
| Delivery / read rate | `analyze_whatsapp_chat_messages` action=`delivery_status` (≤30-day messages) | ratio delivered/read vs sent |
| Language / country | per chat: `contact.locationInfo.alpha2` + `languages` | count per code |
| Label distribution | per chat: `labels[]` | count per label name |

Useful fields each chat object already carries (no extra call): `status`, `prevStatus`, `statusUpdatedAt`, `firstMessageAt`, `lastInboundMessageAt`, `lastOutboundMessageAt`, `expiresAt` (the 24-hour window), `owner.{agent,department,assignedAt}`, `labels[]`, `contact.locationInfo`, `meta.unreadCount`.

## Recipes

### Recipe 1 — Chats by status (this week)

> "How many chats are active, pending, and resolved this week?"

```
1. device = get_whatsapp_devices → pick id
2. get_whatsapp_chats
     device: <id>
     action: by_status
     status: ["active","pending","resolved"]
     limit: 100
3. Read statusDistribution from the response, OR count chat.status yourself.
   Paginate (sortBy lastMessageAt) until the window is covered.
```

Statuses are `active · pending · resolved · archived` (plus `muted · banned · removed`). There is no `open`/`closed` — map "open" → `active`+`pending`, "closed" → `resolved`.

### Recipe 2 — Agent workload

> "Which agent is handling the most chats right now?"

```
1. team = manage_whatsapp_team(action=search, query="")  → id→name map (m.name)
2. For each member.id:
     get_whatsapp_chats(device, action=assigned, agentId=<id>, limit=100)
     → count
3. Sort desc, render table (name · active chats). Flag anyone with 0 (idle)
   or a big outlier (broken routing → see wassenger-routing).
```

### Recipe 3 — Average first-response time

> "What's our average first-response time on Sales this week?"

```
1. get_whatsapp_chats(device, action=by_date_range, fromDate, toDate, limit=100)
2. For each chat with an agent reply:
     responseMs = lastOutboundMessageAt − lastInboundMessageAt   (rough proxy)
     # for true first-response, pull the chat's messages (Recipe 6) and use
     # the first outbound after the first inbound.
3. Average across chats; report median too (averages hide outliers).
```

Filter to a department by combining with Recipe 2's `departmentId`. See `references/agent-performance.md` for the exact message-level computation.

### Recipe 4 — Resolution rate & volume over time

> "How many chats did we resolve per day last week?"

```
1. get_whatsapp_chats(device, action=by_date_range, fromDate=<7d>, toDate=now,
     activityType=lastMessage, limit=100) — paginate
2. Bucket by day using statusUpdatedAt where status==resolved.
3. resolutionRate = resolved / (resolved + still-active opened in window).
```

### Recipe 5 — Unread backlog snapshot

> "How big is our unanswered backlog?"

```
get_whatsapp_unread_chats(device, minUnreadCount=1, sortBy=lastMessageAt, sortOrder=asc)
→ total count, oldest-waiting at the top, sum of unreadCount.
```

### Recipe 6 — Message volume by type

> "How many messages did we send yesterday, by type?"

```
For each chat active in the window (from get_whatsapp_chats by_date_range):
  get_whatsapp_chat_messages(chat=<chat.wid>, action=by_type,
     messageTypes:["text","image","video","audio","document"],
     fromDate=<yesterday 00:00>, toDate=<today 00:00>, limit=50) — paginate
→ sum per messageType across chats, split inbound vs outbound by message direction.
```

`by_type` / `by_sender` are **per-chat** — they require a `chat`. There's no single device-wide call, so loop over the chats active in the window (or use `analyze_whatsapp_chats` action=`export` and tally the export).

### Recipe 7 — Language / country & label distribution

> "What languages do our customers write in? Top labels on new chats?"

```
1. get_whatsapp_chats(device, action=by_date_range, fromDate=<30d>, limit=100) — paginate
2. countBy contact.locationInfo.alpha2 (country) and .languages (language)
3. countBy labels[*].name → top tags
```

Great for deciding which languages need an agent (`wassenger-routing` language routing) and spotting label rot (`wassenger-labels`).

## Common pitfalls

- **Prefer list-and-aggregate for custom windows.** `get_whatsapp_chat_statistics` (params: `device` + `groupBy` ∈ status/agent/department/contactType/day/week/month + `fromDate`/`toDate`) and `analyze_whatsapp_chats` action=`statistics` both work, but they only group the way they group. For an arbitrary date window or a metric they don't expose (true first-response time, label/language distribution), the list-and-aggregate recipes above are more flexible — that's why most recipes use them.
- **`device` is mandatory.** No metric is account-wide automatically — loop per device and sum for multi-number accounts.
- **Pagination is on you.** `get_whatsapp_chats` defaults to `limit=20` (max 100). For weekly/monthly windows, loop with date slices or `offset` until the page is short — never report from a single un-paginated page.
- **Per-chat `stats.{inbound,outbound}Messages` can read 0.** Don't trust them for volume; count from `get_whatsapp_chat_messages` instead.
- **Response time is a proxy unless you go message-level.** `lastOutbound − lastInbound` is a quick estimate; the true first-response needs the message timeline (Recipe 6 + `references/agent-performance.md`).
- **Delivery/read receipts expire at 30 days.** `analyze_whatsapp_chat_messages` action=`delivery_status` only covers recent messages.
- **Report median alongside average.** One 3-day-old unanswered chat wrecks the mean response time; the median tells the real story.

## See also

- `wassenger-inbox` — the chat operations these metrics measure.
- `wassenger-routing` — fix imbalances this skill surfaces (workload, language).
- `wassenger-customer-support` — SLA targets + escalation built on these numbers.
- `wassenger-labels` — the tags Recipe 7 counts.
- `references/filter-cookbook.md` — question → exact tool call, copy-paste ready.
- `references/chat-metrics.md` · `references/agent-performance.md` · `references/department-rollups.md` — detailed computations.
- `wassenger-mcp` — exact tool names and parameter shapes.
