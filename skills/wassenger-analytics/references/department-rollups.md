# Department, label & segment roll-ups

Aggregations that group the inbox by a dimension other than agent.

## By department

```
for deptId in departments:                     # from wassenger-routing setup
  chats = get_whatsapp_chats(device, action=assigned, departmentId=deptId, limit=100)  # paginate
  byDept[deptId] = {
    total:    chats.length,
    open:     count(status in ["active","pending"]),
    resolved: count(status=="resolved"),
    avgFirstResponseMs: mean over chats (see agent-performance.md)
  }
```

Unrouted chats = `action=by_status status=["pending"]` with `owner.department == null`. A large unrouted bucket means routing rules have gaps (`wassenger-routing`).

## By label

```
labelCount = {}
for c in chats:                                # any paginated slice
  for l in c.labels: labelCount[l.name] = (labelCount[l.name] or 0) + 1
sort desc → top tags
```

Cross-tab label × status to see, e.g., how many `intent:billing` chats are still `pending`:

```
for c in chats:
  for l in c.labels:
    grid[l.name][c.status] += 1
```

Watch for label rot (dozens of near-duplicate labels) → `wassenger-labels` naming convention.

## By language / country

`contact.locationInfo` is attached to every chat — no extra call:

```
for c in chats:
  loc = c.contact.locationInfo
  country[loc.alpha2] += 1                      # "ES", "MX", "BR"
  for lang in (loc.languages or []):
    language[lang.iso] += 1                      # "es", "pt", "en"
```

Use this to decide staffing: if 30% of inbound is `pt` and no agent speaks Portuguese, set up language routing (`wassenger-routing`) or hire.

## By contact type

```
get_whatsapp_chats(device, action=by_contact_type, contactTypes=["chat","group"])
→ split 1:1 chats vs groups (WABA is 1:1 only; groups appear on number-pairing devices).
```

## Combining dimensions

For a "Sales team, Spanish customers, last 7 days" report, chain filters:

```
1. chats = by_date_range(fromDate=<7d>, toDate=now)
2. keep owner.department == salesDeptId
3. keep contact.locationInfo.languages includes "es"
4. then apply any metric from chat-metrics.md / agent-performance.md
```

Server-side filters don't combine arbitrarily — pull the broadest cheap slice (usually the date range), then narrow in code.
