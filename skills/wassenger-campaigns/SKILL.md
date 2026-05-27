---
name: wassenger-campaigns
description: Run bulk WhatsApp outreach campaigns with Wassenger — build an audience from a CSV or contact filter, choose a free-form message or pre-approved WABA template, schedule delivery, pace it through the queue, and track per-recipient delivery and read receipts. Use when the user wants to send the same (or templated) message to more than ~50 contacts, or wants a scheduled, monitored, pausable send.
license: MIT
metadata:
  author: Wassenger
  version: "1.0.0"
  category: capability
  requires-mcp: "@wassengerhq/mcp-wassenger"
---

# Wassenger Campaigns

Run audited, paced, monitored broadcasts — the right tool the moment the audience crosses the "loop a send_message in a script" threshold (~50 recipients).

## When to use

- The user wants to reach many contacts with one message (newsletter, promo, reminder, announcement).
- They need to schedule a send for a future time.
- They want to track delivery / read / reply rates per recipient.
- They want to **pause** or **stop** an in-flight send.
- They have a CSV of phone numbers to import as the audience.

For one-off messages (under ~50 recipients with different content each), use `wassenger-messaging` in a loop. For an *automated, ongoing* campaign (e.g. "every new Shopify order triggers a thank-you"), use `wassenger-webhooks` to drive `wassenger-messaging` per event.

## Prerequisites

- `wassenger-setup` complete.
- A device active with enough quota for the audience size. WABA numbers have **conversation tiers** (250 / 1000 / 10000 / unlimited unique users per 24 h) — `get_whatsapp_device_details` shows the current tier.
- For WABA: at least one **APPROVED** template that matches the campaign's language and category (Marketing requires opt-in, Utility / Authentication do not).

## Recipes

### Recipe 1 — Create and start a campaign from a list

> "Send 'Black Friday — 30% off, today only' to all customers who bought from us in the last 6 months."

```
1. Build the audience:
   - Either filter contacts: get_contacts with filter <CRM-side query>
   - Or import a CSV: manage_whatsapp_campaign_contacts with operation=import, file=<csv.id>

2. Create the campaign:
   manage_whatsapp_campaigns
     - operation: create
     - name: "Black Friday 2026"
     - device: <device.id>
     - template: "promo_blackfriday_es"   # WABA-only; for QR devices use message
     - message: "🛍️ Black Friday — 30% off, today only: https://shop.example/bf"
     - deliverAt: "2026-11-29T09:00:00+01:00"
     - contacts: <audience>
     → returns campaign.id

3. Start: manage_whatsapp_campaigns with operation=start, campaign=<id>
```

Wassenger paces the send according to the device's queue rate (typically 60-120 messages/minute on QR, faster on WABA). Don't expect instant delivery for 10k recipients.

### Recipe 2 — Segment an audience

> "Only customers in Spain who are tagged 'vip'."

Two ways:

**A) Filter contacts** (when the segment is in Wassenger):

```
get_contacts
  - filter: { country: "ES", labels: ["vip"] }
  → contact list
```

**B) Import a CSV** (when the segment lives in your CRM/database):

```
CSV format:
  phone,first_name,last_name,custom_var1
  +34600111222,Marta,Lopez,VIP
  +34611222333,Juan,Pérez,VIP
```

```
1. upload_whatsapp_file_from_url with the CSV URL  → file.id
2. manage_whatsapp_campaign_contacts
     - operation: import
     - campaign: <id>
     - file: <file.id>
```

Custom columns become available as template variables (`{{1}}=first_name`).

### Recipe 3 — Schedule and pause

> "Schedule for tomorrow 10am, but let me pause it if Black Friday support is overloaded."

```
1. Create campaign with deliverAt: "2026-11-29T10:00:00+01:00"
2. Mid-flight: manage_whatsapp_campaigns with operation=stop, campaign=<id>
3. Resume later: operation=start (continues from where it stopped)
```

For finer control, pause the **queue** instead (affects all outbound, not just this campaign):

```
manage_whatsapp_queue with operation=pause
```

Resume with `operation=resume`.

### Recipe 4 — Track delivery

> "What's the read rate of the Black Friday campaign?"

```
manage_whatsapp_campaigns
  - operation: stats
  - campaign: <id>
  → {
      total: 4823,
      pending: 0,
      sent: 4815,
      delivered: 4780,
      read: 3120,
      failed: 8,
      replied: 412
    }
```

Per-recipient detail:

```
manage_whatsapp_campaigns with operation=results, campaign=<id>, limit=200
  → array of { contact, status, sentAt, deliveredAt, readAt, failureReason }
```

For real-time tracking instead of polling stats, subscribe to `campaign:*` webhooks.

### Recipe 5 — Cap blast radius (template + opt-out)

For WABA Marketing campaigns, Meta requires **opt-in** evidence. Best practice:

```
Template body:
  "{{1}}, you're getting this because you opted in at <site>.
   Reply STOP to unsubscribe.
   [campaign body]"

Webhook handler (see wassenger-webhooks):
  on message:in:new where body ~= /^STOP$/i:
    1. label chat with "opted-out"
    2. add contact to a global suppression list
    3. exclude that label from future campaigns
```

Don't run Marketing templates without a documented opt-in trail. Meta will disable the template (and possibly the WABA) on enough complaints.

### Recipe 6 — A/B test two variants

```
1. Split the audience 50/50 in your CSV (column "variant" = A or B)
2. Create two campaigns, one per variant, pointing at the same template
   with different parameter values (or different templates entirely).
3. Compare stats.read and stats.replied after delivery completes.
```

## Common pitfalls

- **Sending without an approved template on WABA outside 24h.** Returns `131047`. Always confirm with `list_whatsapp_templates` first.
- **Skipping the device check.** A device in `pairing` or `disconnected` will queue messages that never send. `get_whatsapp_device_details` before each campaign.
- **Exceeding the daily conversation tier.** WABA throttles after the tier limit; remaining messages roll to the next 24h window. For urgent sends, upgrade the tier or split across multiple devices.
- **Mixing template languages.** A template approved in `es` won't render for a contact whose template-fallback language is `pt_BR`. Build per-language campaigns rather than one global one.
- **Ignoring failed sends.** `stats.failed` lists reasons — invalid number, blocked by recipient, template rejected, quota exceeded. Always sweep failures into a follow-up list.
- **Hot-replying campaigns.** Don't reply to inbound `STOP` / `UNSUBSCRIBE` with a marketing template — that's a violation. Confirm in plain text and stop the campaign for that contact.

## See also

- `wassenger-messaging` — for 1:1 sends and template details.
- `wassenger-marketing` — opinionated growth-loop playbook on top of this skill.
- `wassenger-webhooks` — drive opt-out handling and per-event automation.
- `wassenger-mcp` — exact tool shapes (`references/tools-reference.md`).
