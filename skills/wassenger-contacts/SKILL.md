---
name: wassenger-contacts
description: Manage WhatsApp contacts in Wassenger on the official WhatsApp Business API — import from CSV, sync from a CRM (HubSpot, Pipedrive, Salesforce, Attio, custom), search and segment, export, validate that a phone is actually on WhatsApp before sending. Use when the user wants to build or maintain the audience side of their WhatsApp account (the people they message), as opposed to sending or managing the inbox.
license: MIT
metadata:
  author: Wassenger
  version: "1.0.0"
  category: capability
  requires-mcp: "mcp-wassenger"
---

# Wassenger Contacts

The audience side of WhatsApp: who you can reach, what you know about them, and the opt-in trail behind each one. Scoped to WABA — for the WABA-vs-QR rationale see `wassenger-setup`.

> **The Wassenger MCP has no general contacts tool.** There is no `get_contacts`, `search_contacts`, `get_contact_details`, or `export_contacts`. Standalone contact CRUD, search, segmentation, import, and export are done against the **REST `/contacts` API** (direct HTTPS calls with a `Token: <API_KEY>` header — clearly labelled REST throughout the recipes below). The MCP only touches contact data three indirect ways: `search_whatsapp_chats_by_name` (find a chat and its embedded `chat.contact`), `manage_whatsapp_campaign_contacts` (recipients *inside a campaign*), and `verifyWhatsAppNumberExists` (is this number on WhatsApp).

## When to use

- "Import this CSV of contacts into Wassenger."
- "Sync my HubSpot contacts to Wassenger so I can message them via the campaign module."
- "Find every customer in Spain tagged 'vip'."
- "Export every contact we haven't messaged in 90 days."
- "Check whether +44 7700 900111 is on WhatsApp before I send."

For sending messages to these contacts, route to `wassenger-messaging`. For bulk outbound, `wassenger-campaigns`. For organizing the chats that come back, `wassenger-inbox`.

## Prerequisites

- `wassenger-setup` complete.
- A device with `status: ready` (WABA).
- For CSV import: a column with phone numbers in E.164 (`+34600111222`).
- For CRM sync: API access to the CRM and a strategy for opt-in evidence (see `wassenger-marketing` for the compliance baseline).

## Recipes

### Recipe 1 — Import from CSV

> "I have a spreadsheet of customers from my point-of-sale. Import them."

```
CSV format (UTF-8, comma-separated):
  phone,first_name,last_name,email,labels,language,opt_in_at,opt_in_source
  +34600111222,Marta,Lopez,marta@example.com,vip;es,es,2026-04-10,checkout_form
  +34611222333,Juan,Pérez,juan@example.com,es,es,2026-04-10,checkout_form
```

Flow:

```
1. upload_whatsapp_file_from_url with the CSV URL  → file.id   (MCP tool)
2. Direct REST call — Token: <API_KEY> header:
   POST https://api.wassenger.com/v1/contacts/import
     body: { file: <file.id>, device: <id> }
   (Async — returns an import job id.)
3. Poll (REST): GET https://api.wassenger.com/v1/contacts/import/{jobId} until status=done.
```

Custom columns survive as fields you can later use as template variables (`{{first_name}}`).

**Always import an opt-in trail** (`opt_in_at`, `opt_in_source`). Without it you cannot defensibly send Marketing templates and Meta will eventually catch up.

### Recipe 2 — Sync from a CRM

For each contact in the CRM:

```
1. verifyWhatsAppNumberExists with phoneNumber: <phone>   (MCP tool)
   → if false, skip (don't waste a Wassenger contact slot)
2. Look up the contact by phone — direct REST call, Token: <API_KEY> header:
   GET https://api.wassenger.com/v1/contacts?phone=<phone>
   - if found: PATCH https://api.wassenger.com/v1/contacts/{id} with updated metadata
   - else:     POST https://api.wassenger.com/v1/contacts with phone + name + custom fields
3. (Optional) tag the resulting chat with the CRM segment via the MCP send action:
   search_whatsapp_chats_by_name(<phone>) → chat.wid, then
   send_whatsapp_message action: agent, chat: <chat.wid>, agentId: <id>,
     actions: [ { action: "labels:add", params: { labels: ["<crm-segment-label>"] } } ]
```

Batch in chunks of ~50 to avoid rate limits. Idempotency: always search by phone first; never blindly POST.

Common CRM patterns:

| CRM | Recommended bridge |
|---|---|
| HubSpot | Workflow → Webhook to your function, or use `n8n-wassenger` |
| Pipedrive | App webhooks on contact create/update |
| Salesforce | Outbound Message → middleware → Wassenger REST |
| Attio | Webhook automations |
| Custom (Postgres / Notion / Airtable) | Scheduled job (cron / Inngest) that reads delta and patches |

### Recipe 3 — Segment & export

There is no contacts MCP tool — segment with the REST `/contacts` list endpoint (direct call, `Token: <API_KEY>` header), passing filters as query params:

```
# Direct REST call — Token: <API_KEY> header
GET https://api.wassenger.com/v1/contacts?labels=vip&country=ES&lastInboundAfter=2026-04-01
  → results (paginated)
```

Export to CSV for back-office use (also REST — the list endpoint supports a CSV format):

```
# Direct REST call — Token: <API_KEY> header
GET https://api.wassenger.com/v1/contacts?labels=vip&country=ES&format=csv
  → CSV payload (stream/save it yourself)
```

Useful for mailing lists outside WhatsApp, CRM cleanup, BI dashboards, GDPR data-export requests.

### Recipe 4 — Search

Two ways, depending on what you have:

```
# A) Find a chat (and its embedded chat.contact) by name — MCP tool:
search_whatsapp_chats_by_name with query: "marta"

# B) Search the contact directory itself — direct REST call, Token: <API_KEY> header:
GET https://api.wassenger.com/v1/contacts?search=marta   → name OR phone matches
```

For an exact phone lookup, prefer the `phone=` filter on the REST endpoint (`GET …/v1/contacts?phone=<phone>`) — faster than a text search and returns the canonical record.

### Recipe 5 — Validate a phone before sending

The cheapest sanity check before any outbound message to a new contact:

```
verifyWhatsAppNumberExists
  - phoneNumber: "+34600111222"   # E.164. This tool takes ONLY phoneNumber — no device.
  → whether the number is on WhatsApp (+ the canonical international format)
```

Run this **before** the first message to:

- Skip non-WhatsApp numbers (don't burn a template quota on a useless send).
- Catch typos (Meta returns the canonical international format on success).
- Avoid WABA template-failure penalties (sending to non-existent numbers triggers Meta's quality-rating system).

### Recipe 6 — Per-contact attributes for personalization

Wassenger stores arbitrary custom fields on contacts. Use them as template variables:

```
# Direct REST call — Token: <API_KEY> header
PATCH https://api.wassenger.com/v1/contacts/{id}  body: {
  customFields: {
    plan_tier: "premium",
    lifetime_value: 1240,
    last_purchase: "2026-04-15"
  }
}
```

Then in a campaign template:

```
"Hi {{first_name}}, your {{plan_tier}} plan renews on {{renewal_date}}."
```

Keep custom fields **small and meaningful** — every contact carries them, so excessive metadata bloats the contact record and slows pagination.

## Anti-patterns

- **Mass-importing scraped or purchased phone lists.** Fastest way to a WABA suspension. Build opt-in from day one.
- **No opt-in trail.** If you can't show *when* and *where* each contact opted in, you cannot defensibly run Marketing campaigns. Capture it at the source (form, checkout, store).
- **Verifying every contact on every send.** `verifyWhatsAppNumberExists` is for *first* contact. After that, trust your DB until you see a failure.
- **Mixing phone formats.** Always store E.164 (`+34600111222`). Mixed formats (`0034600111222`, `600111222`, `+34 600 111 222`) cause silent lookup misses.
- **Custom fields as a junk drawer.** If a field is only used by one campaign once, don't persist it as a contact attribute — keep it on the campaign side.
- **Forgetting to mirror opt-out.** When a contact opts out (via STOP keyword — see `wassenger-marketing`), update the contact's `optedOut` field everywhere, not just on Wassenger.

## See also

- `wassenger-messaging` — sending to these contacts.
- `wassenger-campaigns` — bulk outreach to segments.
- `wassenger-inbox` — once contacts message you, manage the resulting chats.
- `wassenger-marketing` — opt-in / opt-out compliance baseline.
- `wassenger-mcp` — exact tool parameter shapes (`references/tools-reference.md`).
