---
name: wassenger-campaigns
description: Run bulk WhatsApp outreach campaigns with Wassenger — build an audience from a CSV or CRM export, send a pre-approved WABA template, schedule delivery, pace it through the queue, and track per-recipient delivery and read status. Use when the user wants to send the same (or templated) message to more than ~50 contacts, or wants a scheduled, monitored, pausable send.
license: MIT
metadata:
  author: Wassenger
  version: "1.0.0"
  category: capability
  requires-mcp: "mcp-wassenger"
---

# Wassenger Campaigns

Run audited, paced, monitored broadcasts — the right tool the moment the audience crosses the "loop a send_message in a script" threshold (~50 recipients).

## When to use

- The user wants to reach many contacts with one message (newsletter, promo, reminder, announcement).
- They need to schedule a send for a future time.
- They want to track delivery / read status per recipient.
- They want to **pause** or **stop** an in-flight send.
- They have a CSV of phone numbers to turn into the audience.

For one-off messages (under ~50 recipients with different content each), use `wassenger-messaging` in a loop. For an *automated, ongoing* campaign (e.g. "every new Shopify order triggers a thank-you"), use `wassenger-webhooks` to drive `wassenger-messaging` per event.

## Prerequisites

- `wassenger-setup` complete.
- A device active with enough quota for the audience size. WABA numbers have **conversation tiers** (250 / 1K / 10K / 100K / unlimited unique users per 24 h) — `get_whatsapp_device_details` shows the current tier.
- At least one **APPROVED** template that matches the campaign's language and category (Marketing requires opt-in; Utility / Authentication do not).

> **WABA campaigns are template-based.** The campaign tool has **no `template` parameter** — the campaign `message` must correspond to an APPROVED template, and per-recipient values are filled via each contact's `variables: [{ key, value }]`. Confirm your template-campaign setup against [app.wassenger.com/docs](https://app.wassenger.com/docs).

## Recipes

### Recipe 1 — Create and start a campaign from a list

> "Send 'Black Friday — 30% off, today only' to all customers who bought from us in the last 6 months."

```
1. Build the audience as a contacts array. There is no get_contacts tool —
   you provide the list (from your CRM, a CSV, or the REST /contacts API):
   contacts = [
     { phone: "+34600111222", name: "Marta", variables: [{ key: "1", value: "Marta" }] },
     { phone: "+34611222333", name: "Juan",  variables: [{ key: "1", value: "Juan"  }] }
   ]

2. (WABA) Pick the approved template:
   list_whatsapp_templates with device=<id>, status="APPROVED"

3. Create the campaign:
   manage_whatsapp_campaigns
     - action: create
     - name: "Black Friday 2026"
     - device: <device.id>
     - message: "🛍️ {{1}}, Black Friday — 30% off today: https://shop.example/bf"
     - contacts: <audience>
     - settings: { date: "2026-11-29T09:00:00+01:00", speed: "3" }
                 # date optional (schedule for later); speed paces delivery
     → returns campaign.id

4. Start now (or let the scheduled date fire):
   manage_whatsapp_campaigns with action=start, campaignId=<id>
```

Wassenger paces the send through the device queue (control the rate with `settings.speed`). Don't expect instant delivery for 10k recipients.

### Recipe 2 — Build the audience / segment

There is no contacts-query tool in the MCP, so the segment is built on your side and passed in as `contacts[]`.

**A) From your CRM / the REST API** (when the segment lives in Wassenger): query the REST `/contacts` API directly (`GET https://api.wassenger.com/v1/contacts?...` with a `Token: <API_KEY>` header) or export from your CRM, then map each row to `{ phone, name, variables }`.

**B) From a CSV** (when the segment lives in a spreadsheet/database):

```
CSV:
  phone,first_name,custom_var1
  +34600111222,Marta,VIP
  +34611222333,Juan,VIP
```

```
Parse the CSV and pass each row as a contact:
  contacts: [
    { phone: "+34600111222", name: "Marta", variables: [{ key: "1", value: "Marta" }] },
    …
  ]
Add them at create time, or to an existing campaign:
  manage_whatsapp_campaign_contacts with action=add, campaignId=<id>, contacts=<rows>
```

CSV columns become per-recipient `variables` (`{{1}} = first_name`).

### Recipe 3 — Schedule and pause

> "Schedule for tomorrow 10am, but let me pause it if Black Friday support is overloaded."

```
1. Schedule at create: settings: { date: "2026-11-29T10:00:00+01:00" }
2. Mid-flight stop: manage_whatsapp_campaigns with action=stop, campaignId=<id>
3. Resume later:    manage_whatsapp_campaigns with action=start, campaignId=<id>
```

For finer control, pause the **queue** instead (affects all outbound on the device, not just this campaign):

```
manage_whatsapp_queue with action=update_status, device=<id>, status="pause"
```

Resume with `status="active"` (there is no separate `resume` — `active` is resume).

### Recipe 4 — Track delivery

> "What's the delivery status of the Black Friday campaign?"

```
manage_whatsapp_campaigns with action=get, campaignId=<id>
  → the campaign record with its status and delivery counts
```

Per-recipient detail (filter by delivery status):

```
manage_whatsapp_campaign_contacts
  - action: search
  - campaignId: <id>
  - status: ["failed"]      # pending | processing | delivered | failed
  - size: 200
  → recipients with their delivery status
```

For real-time tracking instead of polling, subscribe to campaign webhooks (see `wassenger-webhooks`; verify the exact event names against the docs).

### Recipe 5 — Cap blast radius (template + opt-out)

For WABA Marketing campaigns, Meta requires **opt-in** evidence. Best practice — use the campaign's built-in unsubscribe handling:

```
manage_whatsapp_campaigns with action=create, …,
  unsubscribe: {
    active: true,
    word: "STOP",
    message: "You've been unsubscribed. Reply START to opt back in.",
    actions: [{ action: "metadata:add", params: { key: "opted_out", value: "true" } }]
  }
```

And keep the opt-in line in the template body:

```
Template body:
  "{{1}}, you're getting this because you opted in at <site>. Reply STOP to unsubscribe."
```

Don't run Marketing templates without a documented opt-in trail. Meta will disable the template (and possibly the WABA) on enough complaints.

### Recipe 6 — A/B test two variants

```
1. Split the audience 50/50 in your data (a "variant" column = A or B).
2. Create two campaigns, one per variant, pointing at the same template
   with different variable values (or different templates entirely).
3. Compare delivery with manage_whatsapp_campaigns action=get on each, and
   per-recipient status via manage_whatsapp_campaign_contacts action=search.
```

## Common pitfalls

- **Sending without an approved template on WABA outside 24h.** Returns `131047`. Always confirm with `list_whatsapp_templates` first.
- **Skipping the device check.** A device in `pairing` or `disconnected` will queue messages that never send. `get_whatsapp_device_details` before each campaign.
- **Exceeding the daily conversation tier.** WABA throttles after the tier limit; remaining messages roll to the next 24h window. For urgent sends, upgrade the tier or split across multiple devices.
- **Mixing template languages.** A template approved in `es` won't render for a contact whose template-fallback language is `pt_BR`. Build per-language campaigns rather than one global one.
- **Ignoring failed sends.** Search campaign contacts with `status: ["failed"]` — reasons include invalid number, blocked by recipient, template rejected, quota exceeded. Always sweep failures into a follow-up list.
- **Hot-replying campaigns.** Don't reply to inbound `STOP` / `UNSUBSCRIBE` with a marketing template — that's a violation. The built-in `unsubscribe` handler (Recipe 5) confirms in plain text.

## See also

- `wassenger-messaging` — for 1:1 sends and template details.
- `wassenger-marketing` — opinionated growth-loop playbook on top of this skill.
- `wassenger-webhooks` — drive opt-out handling and per-event automation.
- `wassenger-mcp` — exact tool shapes (`references/tools-reference.md`).
