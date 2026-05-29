# Filter Cookbook — question → exact tool call

Copy-paste starting points. Every call needs `device` (from `get_whatsapp_devices`). All list tools paginate — loop until a page returns fewer than `limit` rows. Dates are ISO 8601 (`2026-05-20T00:00:00Z`).

## Status & lifecycle

| Question | Call |
|---|---|
| How many active chats? | `get_whatsapp_chats(device, action=by_status, status=["active"])` → `statusDistribution` |
| Open vs closed | open = `["active","pending"]`, closed = `["resolved"]` (no native open/closed) |
| Anything archived this month? | `get_whatsapp_chats(device, action=archived, archivedAfter=<1st of month>)` |
| Chats about to hit the 24h window | pull active chats, filter `expiresAt` within next N hours |

## Time windows

| Question | Call |
|---|---|
| New chats today | `get_whatsapp_chats(device, action=by_date_range, fromDate=<today 00:00>, toDate=now, activityType=firstMessage)` |
| Active in last 7 days | same, `activityType=lastMessage`, `fromDate=<7d ago>` |
| Resolved last week | pull `by_date_range` over the window, keep `status==resolved`, bucket by `statusUpdatedAt` |

## Assignment & team

| Question | Call |
|---|---|
| Chats for agent X | `get_whatsapp_chats(device, action=assigned, agentId=<id>)` |
| Chats for department Y | `get_whatsapp_chats(device, action=assigned, departmentId=<id>)` |
| Unassigned chats | `get_whatsapp_chats(device, action=by_status, status=["pending"])`, keep `owner.agent == null` |
| Roster (id→name) | `manage_whatsapp_team(operation=search, query="")` |

## Backlog & unread

| Question | Call |
|---|---|
| Unanswered backlog | `get_whatsapp_unread_chats(device, minUnreadCount=1, sortBy=lastMessageAt, sortOrder=asc)` |
| Heaviest unread threads | same, `sortBy=unreadCount, sortOrder=desc` |

## Messages

| Question | Call |
|---|---|
| Volume by type, a given day | `get_whatsapp_chat_messages(device, action=by_type, messageTypes=[...], fromDate, toDate)` |
| Outbound from one number | `get_whatsapp_chat_messages(device, action=by_sender, sender=<wid/phone>)` |
| Delivery / read of recent sends | `analyze_whatsapp_chat_messages(action=delivery_status, messageIds=[...])` (≤30d, ≤20 ids) |

## Contact segments

| Question | Call |
|---|---|
| Country split | pull chats over window, `countBy contact.locationInfo.alpha2` |
| Language split | `countBy contact.locationInfo.languages[].iso` |
| Top labels | `countBy labels[*].name` |

## Do NOT use (broken)

- `get_whatsapp_chat_statistics` → 404 mis-route.
- `analyze_whatsapp_chats` action=`statistics` → 404 mis-route.

Re-test occasionally; if fixed, they collapse Recipes 1–4 into one call.
