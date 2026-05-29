# Chat metrics — status, volume, resolution

All computations assume you have paginated the relevant `get_whatsapp_chats` slice into an array `chats`.

## Status distribution

```
dist = {}
for c in chats: dist[c.status] = (dist[c.status] or 0) + 1
# active, pending, resolved, archived, muted, banned, removed
```

The response also includes a `statusDistribution` summary when you filter `by_status` — prefer it, but verify it matches your window (it reflects the returned slice).

Derived buckets:
- **open** = active + pending
- **closed** = resolved
- **backlog** = pending with `meta.unreadCount > 0`

## Volume over time

Two different questions — pick the right timestamp:

| "Volume" meaning | Bucket by |
|---|---|
| New conversations started | `firstMessageAt` |
| Conversations active/touched | `lastMessageAt` |
| Conversations resolved | `statusUpdatedAt` where `status==resolved` |

```
buckets = {}                       # e.g. by day
for c in chats:
  day = c.firstMessageAt[:10]      # YYYY-MM-DD
  buckets[day] = (buckets[day] or 0) + 1
```

Pull with `action=by_date_range` and the matching `activityType` (`firstMessage` | `lastMessage` | `any`).

## Resolution rate

```
openedInWindow   = chats where firstMessageAt in [from,to]
resolvedInWindow = chats where status==resolved and statusUpdatedAt in [from,to]
resolutionRate   = resolvedInWindow.length / max(1, openedInWindow.length)
```

Report both the rate and the raw counts — a 90% rate on 10 chats is noise.

## Resolution time (per chat)

```
resolvedChats = chats where status==resolved and statusUpdatedAt present
for c in resolvedChats:
  resolutionMs = parse(c.statusUpdatedAt) − parse(c.firstMessageAt)
avg    = mean(resolutionMs)
median = median(resolutionMs)      # report this too
```

`prevStatus` + `prevStatusUpdatedAt` let you detect reopened chats (resolved → active again); exclude or flag them.

## 24-hour window health (WABA-specific)

```
expiringSoon = active chats where expiresAt − now < 2h
```

A spike here means the team is about to lose the free-messaging window on many chats — they must reply or switch to a template (`wassenger-messaging`).

## Notes

- Per-chat `stats.{inboundMessages, outboundMessages, notes}` are unreliable (often 0). For real message counts use `get_whatsapp_chat_messages` (see `agent-performance.md`).
- Always paginate; a single page (default 20, max 100) is not a report.
