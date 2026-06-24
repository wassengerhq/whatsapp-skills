---
name: wassenger-labels
description: Manage labels on Wassenger chats and contacts — create, edit, delete, color-code, apply in bulk, query chats by label, and report on label usage. Use when the user wants to tag conversations for organization, segmentation, or reporting — for example, mark VIP customers, flag bugs, classify lead stages, or group chats by topic. Includes the recommended naming convention (`namespace:value`) and anti-patterns to avoid label rot.
license: MIT
metadata:
  author: Wassenger
  version: "1.0.0"
  category: capability
  requires-mcp: "mcp-wassenger"
---

# Wassenger Labels

Tag chats and contacts with the language your business actually uses — VIP, bug, interested-in-pricing, churn-risk, follow-up — then query, segment, and report on them.

## When to use

- *"Tag this chat as VIP."*
- *"Show me every chat tagged 'interested-in-enterprise'."*
- *"Bulk-tag every customer in Spain with 'segment:es'."*
- *"How many chats are labeled 'bug' this month?"*
- *"Rename 'urgent' to 'priority:high'."*

For chat **lifecycle status** (open / pending / resolved / archived), don't use labels — that's `chat.status`, covered in `wassenger-inbox`. Labels are **orthogonal**: a chat can be `active` AND `vip` AND `bug:android` simultaneously.

## Prerequisites

- `wassenger-setup` complete.
- The user has at least one device connected and some chats to label.

## The naming convention that scales

Wassenger labels are flat (no hierarchy in the API), but a **namespace convention** with a colon gives you de-facto hierarchy and prevents the "200-flat-labels-nobody-uses" problem.

| Pattern | Example | When |
|---|---|---|
| `segment:<value>` | `segment:vip`, `segment:churn-risk` | Customer classification |
| `intent:<value>` | `intent:billing`, `intent:demo` | What the customer wants |
| `bug:<platform>` | `bug:android`, `bug:web` | Bug reports |
| `campaign:<id>` | `campaign:blackfriday-2026` | Trace which campaign produced a chat |
| `language:<bcp47>` | `language:es`, `language:pt-BR` | Customer language |
| `priority:<level>` | `priority:high`, `priority:low` | Urgency |
| `team:<name>` | `team:sales`, `team:support` | Which team owns it (use departments for routing — labels here for *reporting*) |
| `lifecycle:<stage>` | `lifecycle:cold`, `lifecycle:qualified` | Sales funnel stage |

Pick a small set of namespaces (5-8) and **document them** somewhere your agents can see. Inconsistent naming kills label reporting more than any other failure.

## Recipes

### Recipe 1 — Create a label

> "Create a VIP label in gold."

```
manage_whatsapp_labels
  - operation: create
  - name: "segment:vip"
  - color: "#f1c40f"        # any hex; Wassenger shows it in the console
  - description: "Lifetime value > €5,000 OR explicitly named premium"
  → label.id
```

`create` is **idempotent** by name — if `segment:vip` already exists, you get the existing one back instead of an error.

### Recipe 2 — Apply a label to a chat

> "Tag the chat with +34 600 111 222 as VIP."

```
1. search_whatsapp_chats_by_name "+34600111222"  → chat.wid
   (or use the chat WID directly if you have it)
2. manage_whatsapp_labels
   - operation: apply
   - label: <label.id> (or by name)
   - chat: <chat.wid>
```

### Recipe 3 — Bulk-apply by criteria

> "Tag every customer in Spain with 'segment:es'."

```
1. Ensure label exists:
   manage_whatsapp_labels create "segment:es"  → label.id

2. Get matching contacts:
   get_contacts with filter { country: "ES" }  → contacts

3. For each contact:
   - find their chat: search_whatsapp_chats_by_name(contact.phone) → chat.wid
   - manage_whatsapp_labels apply (label.id, chat.wid)
```

For >100 contacts, batch in groups of 50 to stay polite with the API. Track progress in your own DB so you can resume on crash.

### Recipe 4 — Query chats by label

> "Show me every chat tagged 'segment:vip'."

```
get_whatsapp_chats with filter { labels: [<label.id>] }
  → array of chats

# Multiple labels (AND semantics):
get_whatsapp_chats with filter { labels: [<vip.id>, <intent:billing.id>] }
```

Useful for views like "all VIP customers waiting on billing" — combine with `status: active` for a daily attention list.

### Recipe 5 — Remove a label

> "This chat isn't actually VIP, remove that tag."

```
manage_whatsapp_labels
  - operation: unapply
  - label: <label.id>
  - chat: <chat.wid>
```

Don't delete the label itself unless nobody is using it. To remove a label from many chats first, then delete:

```
1. For each chat with the label: unapply
2. manage_whatsapp_labels delete <label.id>
```

### Recipe 6 — Rename a label

The API doesn't expose a rename in-place because changing a label's `name` is technically an update. The clean version:

```
manage_whatsapp_labels
  - operation: update
  - label: <label.id>
  - name: "priority:high"   # new name
  - color: "#e74c3c"        # optionally change color
```

All chats keep their tag (label ID is stable). Useful when you decide your taxonomy needs to shift (e.g., from flat `urgent` → namespaced `priority:high`).

### Recipe 7 — Reporting

> "How many chats are tagged with each label this month?"

```
1. List all labels:
   manage_whatsapp_labels list  → labels

2. For each label:
   count = get_whatsapp_chats(
     filter: { labels: [label.id], dateFrom: month_start }
   ).length

3. Render:
   | Label                  | Count | Color |
   |------------------------|-------|-------|
   | segment:vip            |   42  | gold  |
   | intent:billing         |   18  | red   |
   | campaign:blackfriday   |   97  | black |
```

Run weekly. Labels that haven't moved in 90 days are candidates for retirement.

### Recipe 8 — Pruning dead labels

```
For each label:
  count = chats tagged with it
  if count == 0 AND label.createdAt < 6 months ago:
    propose delete (ask the user)
```

Don't auto-delete — labels are a vocabulary the team shares. A label nobody uses today might be the right one tomorrow. But surface the candidates so the team can decide.

## Anti-patterns

- **Using labels for lifecycle status.** Wassenger has `chat.status` (`active` / `pending` / `resolved` / `archived`). Don't reinvent it with labels — querying becomes a mess.
- **Flat labels everywhere.** 50 labels without namespacing turn into a mess in 6 months. Pick 5-8 namespaces upfront.
- **Inconsistent capitalization.** `VIP` vs `Vip` vs `vip` are three labels. Lowercase + hyphens, always.
- **No documentation.** A label called `wf-step-3-pending` makes sense to one person on the team. Document namespaces in a shared doc your agents can reference.
- **Labels as a junk drawer.** If a label has < 5 chats and is older than 60 days, it's probably dead. Prune.
- **Label-driven routing.** Routing belongs in `wassenger-routing` (auto-assignment + departments). Labels are for *reporting* and *filtering*, not for *triggering* downstream actions.

## See also

- `wassenger-inbox` — applying labels in the context of chat lifecycle.
- `wassenger-routing` — when to use departments + auto-assignment vs labels.
- `wassenger-campaigns` — use a `campaign:<id>` label to trace which campaign produced each reply.
- `wassenger-mcp` — exact tool shapes (`references/tools-reference.md`).
