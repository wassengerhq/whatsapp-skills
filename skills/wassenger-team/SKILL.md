---
name: wassenger-team
description: Manage the team of human agents who work in your Wassenger WhatsApp inbox — invite new members, set roles (admin / supervisor / agent), grant or revoke access to specific WhatsApp devices, onboard whole groups at once, offboard a leaver safely (revoke + reassign their open chats), and audit who has access to what. Use when the user is adding staff, removing staff, changing permissions, or worried about who can do what across their Wassenger account.
license: MIT
metadata:
  author: Wassenger
  version: "1.0.0"
  category: capability
  requires-mcp: "mcp-wassenger"
---

# Wassenger Team

Run the human side of the inbox: who's on the team, what they're allowed to do, which WhatsApp numbers they touch.

## When to use

- *"Add Pedro as a sales agent."*
- *"Give Marta access to our support number, but not to the sales one."*
- *"What permissions does the team have? Who can delete chats?"*
- *"Pedro is leaving — revoke his access and move his open chats to me."*
- *"Invite the whole new agency team (10 people) as agents and scope each one to a single device to start."*

For assigning chats *to* agents who already exist, see `wassenger-inbox` (manual) or `wassenger-routing` (auto). For department setup, see `wassenger-routing`. For labels they can apply, see `wassenger-labels`.

## Prerequisites

- `wassenger-setup` complete.
- The user is an **admin** on the Wassenger account (only admins can manage team).
- A list of the people to invite (email + name + role).

## The Wassenger permission model

| Role | Can read chats | Can send / reply | Can manage labels & dept | Can manage team | Can manage account |
|---|:-:|:-:|:-:|:-:|:-:|
| **Admin** | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Supervisor** | ✓ | ✓ | ✓ | ✓ | – |
| **Agent** | ✓ | ✓ | – | – | – |

There is **no `readonly` role**. To take away an agent's ability to send/reply (or otherwise restrict them), narrow their `permissions` / `devicePermissions` rather than reaching for a role.

Roles are **per account**. **Device access** is a second layer on top: even an Agent can be limited to specific WhatsApp numbers (devices). A salesperson can have access to `+34 600 SALES` but not `+34 600 SUPPORT`.

## Recipes

### Recipe 1 — Invite a new agent

> "Invite pedro@example.com as a sales agent with access only to our sales WhatsApp."

```
1. manage_whatsapp_team
   - action: create
   - email: "pedro@example.com"
   - name: "Pedro García"
   - role: agent
   → user.id, invitation email sent

2. manage_whatsapp_team
   - action: grant_access
   - device: <sales-device-id>
   - userIds: [<user.id>]
   - deviceRole: agent
```

Pedro receives an email invitation. Until he accepts and sets a password, his status is `pending`. After acceptance: `active`.

### Recipe 2 — Bulk onboarding (10+ agents)

> "Onboard our new agency team — here's the CSV: name, email, role."

```
For each row in CSV:
  1. manage_whatsapp_team action: create with email + name + role  → user.id
  2. For each device they should access:
       manage_whatsapp_team action: grant_access
         - device: <device.id>
         - userIds: [<user.id>]
         - deviceRole: agent
  3. (Optional) assign to a department — see wassenger-routing
  4. (Optional) tag the resulting chats with a label like "onboarding:2026-q2"
     via send_whatsapp_message action: agent (labels:add) — see wassenger-labels
```

Batch carefully — Wassenger sends an email per invitation. Send no more than ~20 at a time to avoid the recipients' inboxes flagging the burst.

### Recipe 3 — Configure device access (the most common ask)

> "Marta should answer support but not sales."

```
1. manage_whatsapp_team action: search, query: "Marta" → user.id

2. List current device access:
   manage_whatsapp_team
     - action: get
     - userId: <user.id>
     - includeDevices: true

3. Adjust:
   - manage_whatsapp_team action: grant_access
       - device: <support-device-id>
       - userIds: [<user.id>]
       - deviceRole: agent
   - manage_whatsapp_team action: revoke_access
       - device: <sales-device-id>
       - userIds: [<user.id>]   (if currently granted)
```

Device access is **additive**: if a member has no grant for a device, they cannot see chats on it. Don't accidentally grant access to all devices when you mean to scope.

### Recipe 4 — Promote / demote (change role)

> "Make Marta an admin so she can manage the team while I'm on vacation."

```
manage_whatsapp_team
  - action: update
  - userId: <marta.id>
  - role: admin   (or: supervisor | agent)
```

Then to revert:

```
manage_whatsapp_team action: update with userId + role: agent
```

Keep **at least one admin** at all times — Wassenger refuses to demote the last admin.

### Recipe 5 — Offboard a leaver (safe)

> "Pedro left the company yesterday. Revoke his access and move his open chats to Marta."

```
1. List Pedro's open chats:
   get_whatsapp_chats
     - action: assigned
     - agentId: <pedro.id>
     - status: ["active"]
   → array of chats

2. For each chat, reassign to Marta:
   send_whatsapp_message
     - action: agent
     - chat: <chat.wid>
     - agentId: <marta.id>
     - actions: [ { action: "chat:assign", params: { agent: <marta.id> } } ]
   (Optional) post an internal note: "Reassigned from Pedro on 2026-05-27"

3. Revoke device access (one call per device, or batch userIds):
   manage_whatsapp_team
     - action: revoke_access
     - device: <device.id>
     - userIds: [<pedro.id>]

4. Disable the account:
   manage_whatsapp_team action: update with userId: <pedro.id>, status: disabled
   (Or: action: delete — which can reassign/resolve/unassign Pedro's open chats
    in one shot via chatAction + reassignTo — if you don't need their audit trail.)
```

> **Shortcut:** `manage_whatsapp_team action: delete` with `userId` accepts `chatAction` (`reassign` / `resolve` / `unassign`) and `reassignTo`, so it can offload a leaver's open chats during deletion without the manual loop in step 2.

**Don't delete a member immediately** — disable first. If a question comes up later ("who closed this chat?"), the audit trail still works.

### Recipe 6 — Audit access

> "Who has access to our main WhatsApp number?"

```
1. List team:
   manage_whatsapp_team action: search, query: ""  → all members

2. For each member:
   manage_whatsapp_team action: get, userId: <user.id>, includeDevices: true
   → the devices they can access

3. Render a matrix:
   |        | Sales | Support | Marketing |
   |--------|-------|---------|-----------|
   | Marta  |   ✓   |    ✓    |     –     |
   | Pedro  |   ✓   |    –    |     –     |
   | Juan   |   –   |    ✓    |     ✓     |
```

Run this quarterly. Permission creep is real — agents accumulate access over time and rarely give it back.

### Recipe 7 — Activity report

> "Who handled the most chats this week?"

```
For each member:
  count = get_whatsapp_chats(
            action: assigned,
            agentId: member.id,
            status: ["resolved"],
            fromDate: <monday ISO>,
            toDate: <now ISO>
          ).length
Sort desc, render table.
```

Pair with `get_whatsapp_chat_statistics` for averages (response time, resolution time per agent).

## Anti-patterns

- **Everyone is admin.** Default to **agent** role. Promote to admin only for the 1-2 people who actually need to manage the account.
- **Grant access to all devices by default.** Scope from day one. A salesperson with access to the support inbox will eventually reply on the wrong number.
- **No offboarding process.** When someone leaves, revoke access **before** the day ends. WhatsApp numbers connected to ex-employees leak data.
- **Delete instead of disable.** Disabling keeps the audit trail. Delete only for genuinely abandoned accounts (after the legal retention window).
- **Inviting people without context.** The Wassenger invitation email is generic. Send a separate Slack / email first explaining what they'll see — otherwise they assume it's spam and don't accept.
- **Skipping the device-access matrix audit.** Quarterly review is the only way to keep permission creep in check.

## See also

- `wassenger-inbox` — once agents are configured, they handle chats here.
- `wassenger-routing` — auto-assign chats to the right team member or department.
- `wassenger-labels` — let agents tag chats consistently.
- `wassenger-mcp` — exact tool shapes (`references/tools-reference.md`).
