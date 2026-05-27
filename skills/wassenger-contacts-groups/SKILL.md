---
name: wassenger-contacts-groups
description: Manage contacts, groups, and channels in Wassenger — import contacts, sync from a CRM, search and segment, create groups, add or remove participants, manage admin permissions, create and broadcast to channels. Use when the user wants to build or maintain the audience side of their WhatsApp account (the people, the groups, the channels), as opposed to sending messages or managing the inbox.
license: MIT
metadata:
  author: Wassenger
  version: "1.0.0"
  category: capability
  requires-mcp: "@wassengerhq/mcp-wassenger"
---

# Wassenger Contacts, Groups & Channels

Manage who you can reach. Three audience surfaces with different rules:

| Surface | What it is | Available on |
|---|---|---|
| **Contact** | A single phone number, possibly with metadata (name, labels, custom fields). | QR + WABA |
| **Group** | A WhatsApp group with up to 1024 participants and admins. | **QR only** |
| **Channel** | A one-way broadcast feed (WhatsApp Channels). | **QR only** |

> **WABA limitation.** Official WhatsApp Business API numbers cannot send to groups or channels. If the user has a WABA device, only the *contacts* half of this skill applies — for group / channel features they need a QR-paired device.

## When to use

- "Import this CSV of contacts into Wassenger."
- "Search contacts who haven't messaged us in 30 days."
- "Create a WhatsApp group for the launch team."
- "Add Marta and Juan to the support group."
- "Set up a WhatsApp Channel for product announcements."
- "Export every contact tagged 'vip' to a CSV."

For sending messages to these contacts/groups/channels, route to `wassenger-messaging`. For organizing existing chats with these contacts, see `wassenger-inbox`.

## Prerequisites

- `wassenger-setup` complete.
- For groups / channels: a **QR-paired** device (`get_whatsapp_device_details` → check the `session.type`). On WABA devices these operations return `400`.

## Contacts

### Recipe 1 — Import from CSV

```
1. Prepare CSV:
   phone,first_name,last_name,email,labels
   +34600111222,Marta,Lopez,marta@example.com,vip;es
   +34611222333,Juan,Pérez,juan@example.com,es

2. upload_whatsapp_file_from_url → file.id
3. POST /v1/contacts/import  body: { file: <file.id>, device: <id> }
   (Async — returns an import job id.)
4. Poll GET /v1/contacts/import/{jobId} until status=done.
```

Custom columns survive as fields you can use in template variables (`{{first_name}}`).

### Recipe 2 — Sync from a CRM

For each contact in the CRM:

```
1. verifyWhatsAppNumberExists with phone  → skip if not on WhatsApp
2. If exists in Wassenger already: PATCH /v1/contacts/{id}
   Else: POST /v1/contacts with phone + metadata
3. (Optional) manage_whatsapp_labels apply <crm-segment> to the resulting chat
```

Batch in chunks of ~50 to avoid rate limits. Idempotency: search by `phone` first (`search_contacts`) and update if found.

### Recipe 3 — Segment & export

```
get_contacts with filter:
  - labels: ["vip"]
  - country: "ES"
  - lastInboundAfter: "2026-04-01"
  → results
```

Export to CSV:

```
export_contacts with filter + format=csv  → file URL
```

Useful for back-office tasks (mailing lists outside WhatsApp, CRM cleanup, BI dashboards).

### Recipe 4 — Search by name or number

```
search_contacts with query="marta"  → contact list (matches name OR phone substring)
```

For exact phone lookup, prefer `get_contact_by_phone` (if available) — it's faster than search and returns the canonical record.

## Groups

### Recipe 5 — Create a group

```
manage_whatsapp_groups
  - operation: create
  - device: <id>   (QR only)
  - name: "Launch team — Wassenger Skills"
  - participants: ["+34600111222", "+34611222333"]
  - description: "Coordinating the v1 launch"
  → group.wid
```

The device's phone is automatically the creator and an admin.

### Recipe 6 — Add / remove / promote participants

```
manage_whatsapp_group_participants
  - group: <group.wid>
  - operation: add | remove | promote | demote
  - participants: ["+34622333444"]
```

Bulk operations: pass an array. Errors are per-participant — the response lists which ones failed and why (already in group, blocked you, not on WhatsApp, …).

### Recipe 7 — Get & share invite link

```
manage_whatsapp_groups with operation=get-invite-link, group=<wid>
  → "https://chat.whatsapp.com/AbCdEfGhIjKlMnOpQrStUv"
```

Share this in marketing pages, CRM emails, or other chats. To rotate (e.g., after a leak), use `operation=revoke-invite-link` and fetch again.

### Recipe 8 — Send to a group

Groups are addressed by their WID, not a phone number:

```
send_whatsapp_message
  - device: <id>
  - phone: <group.wid>   # e.g. "34600111222-1612345678@g.us"
  - message: "..."
  - mentions: ["34600111222@c.us"]   # mention specific members
```

Mentions push a notification even when the group is muted — use sparingly.

## Channels

WhatsApp Channels are **one-way** broadcasts; subscribers can react and follow but cannot reply.

### Recipe 9 — Create a channel

```
manage_whatsapp_channels
  - operation: create
  - device: <id>   (QR only)
  - name: "Wassenger Product Updates"
  - description: "Announcements, releases, tips"
  - profilePic: { url: "https://example.com/logo.png" }
  → channel.wid + invite link
```

### Recipe 10 — Broadcast to a channel

```
manage_whatsapp_channel_messages
  - operation: send
  - channel: <wid>
  - message: "🚀 v1.2 is live!  ..."
  - media: { url: "..." }   # optional
```

Channels support text, media, polls, and emoji-only messages. Replies arrive as reactions, not chats.

### Recipe 11 — Manage subscribers

You don't directly manage subscribers — they join via the invite link. To grow the channel:

- Publish the link on your site, in onboarding emails, in 1:1 chats.
- Pin it in your linked groups.
- Cross-promote with other channels in your space.

Stats (subscribers, reactions per post) are visible in the Wassenger console; the API exposes them via `manage_whatsapp_channels` with `operation=stats`.

## Common pitfalls

- **Groups / channels on WABA.** Always check `device.session.type` before any group/channel call on WABA — these tools will return `400 Bad Request: feature not available on this device type`. Fall back to a campaign over individual contacts.
- **Adding a participant who has you blocked.** Returns a per-participant error in the bulk response — the rest still succeed. Don't bail the whole operation.
- **Phone format inconsistency.** The API accepts both E.164 (`+34600111222`) and chat WID (`34600111222@c.us`). Pick one in your code and stick with it; mixing causes lookups to miss.
- **Mass-importing contacts on a fresh WABA number.** Sending unsolicited messages to imported contacts is a fast way to get reported and have the WABA suspended. Always require opt-in before adding to outbound flows.
- **Group invite link in marketing.** Anyone with the link joins. For sensitive groups, prefer manual `add participants` flows and rotate the link periodically.

## See also

- `wassenger-messaging` — sending to contacts, groups, and channels.
- `wassenger-campaigns` — broadcasting to many contacts (preferred over groups for outbound marketing).
- `wassenger-inbox` — once contacts message you, manage the resulting chats.
- `wassenger-mcp` — exact tool parameter shapes (`references/tools-reference.md`).
