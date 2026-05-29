# Agent performance — workload & response time

Turn `owner.agent` IDs into names once:

```
roster = manage_whatsapp_team(operation=search, query="")
name = { m.id: m.displayName for m in roster }
```

## Workload (current)

```
for agentId in name:
  chats = get_whatsapp_chats(device, action=assigned, agentId=agentId, limit=100)  # paginate
  workload[agentId] = count(chats where status in ["active","pending"])
render sorted desc → "Marta 42 · Pedro 38 · …"
```

Idle agents (0) and outliers (one agent with most of the inbox) both signal broken routing → `wassenger-routing`.

## First-response time (accurate, message-level)

The quick proxy `lastOutboundMessageAt − lastInboundMessageAt` (in the chat object) is fine for a rough average. For the **true first response**, use the message timeline:

```
for c in chats:
  msgs = get_whatsapp_chat_messages(device, chat=c.id, action=date_range,
           fromDate=c.firstMessageAt, sortOrder=asc, limit=50)   # paginate
  firstInbound  = first msg where direction inbound
  firstOutbound = first msg after firstInbound where direction outbound
                  and author is an agent (not an auto-reply — skip lastAutoReply ids)
  if both: frt[c.id] = firstOutbound.date − firstInbound.date
report mean AND median of frt; break down per owner.agent
```

Exclude auto-replies: a chat with `lastAutoReply` set whose only "response" is the auto-reply is **not** a human first response — don't count it as a win.

## Resolution time per agent

```
group resolvedChats by owner.agent
per agent: mean(statusUpdatedAt − firstMessageAt)   # see chat-metrics.md
```

## Throughput (resolved per agent per period)

```
for agentId in name:
  resolved = get_whatsapp_chats(device, action=assigned, agentId=agentId)
             filtered to status==resolved and statusUpdatedAt in [from,to]
  throughput[agentId] = resolved.length
```

## Caveats

- Reassigned chats attribute to the **current** `owner.agent`, not whoever first replied. For strict attribution, walk `owner.previousAgent` / assignment history.
- `assignedAt` is when the chat was assigned, not when work started — first-response from messages is the honest metric.
- Always pair averages with medians and counts; small samples mislead.
