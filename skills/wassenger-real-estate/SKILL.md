---
name: wassenger-real-estate
description: Automate WhatsApp for real estate agents and agencies using Wassenger — handle inbound property inquiries, send property packs (photos, video, floor plan), book and confirm viewings, run nurture sequences for cold leads, alert clients about new listings that match their criteria, and hand off warm leads to a closer. Use when the user works in real estate (residential, commercial, rental, holiday) and wants WhatsApp to be the primary funnel for inquiries and showings.
license: MIT
metadata:
  author: Wassenger
  version: "1.0.0"
  category: industry
  vertical: real-estate
  requires-mcp: "mcp-wassenger"
---

# Wassenger for Real Estate

Real estate runs on speed-to-lead and personalized follow-up. The recipes below assume the user works with property listings (their own MLS, a portal like Idealista / Zillow / Rightmove, or a CRM like Real Geeks / kvCORE / Follow Up Boss).

## When to use

- The user mentions **real estate**, **properties**, **listings**, **viewings**, **rentals**, **MLS**, or **buyers / tenants**.
- They ask to **automate property inquiries** or **book viewings** on WhatsApp.
- They want to **notify clients** when new properties match their search criteria.
- They need a **nurture sequence** for leads who aren't ready to commit.

For pure marketing broadcasts to past clients, use `wassenger-campaigns`. For multi-agent inbox management, see `wassenger-customer-support` for the SLA / routing parts.

## Prerequisites

- `wassenger-setup` complete.
- Access to the property data source (CRM, MLS, portal API, or a Google Sheet acting as the listing book).
- A scheduling tool for viewings (Calendly, Cal.com, or a CRM with built-in availability).
- For WABA: pre-approved templates for `viewing_confirmation`, `viewing_reminder`, `new_listing_alert`, `follow_up`.

## Recipes

### Recipe 1 — Inbound inquiry from a portal

> "Lead clicks 'WhatsApp' on a listing at idealista.com/.../property-123. Respond instantly with the property pack."

```
on message:in:new with body matching listing URL or reference (REF-123):
  property = mls.getById(extractReference(message.body))
  if not property: ask "¿Podrías confirmar la referencia o link de la propiedad?"
  else:
    send_whatsapp_message
      - phone: lead.phone
      - message: |
          Hola, gracias por tu interés en {{property.title}}.
          📍 {{property.address}}
          💰 {{property.price}} · {{property.bedrooms}}h / {{property.bathrooms}}b · {{property.sizeSqm}}m²
          {{property.shortDescription}}
      - media: { url: property.heroImage }
    # Follow-up message with floor plan + video
    send_whatsapp_message with deliverAt: now + 30s
      - media: { url: property.floorPlan }
      - caption: "Aquí tienes el plano. Si quieres ver vídeo o agendar una visita, dime."
    label chat "interested:{{property.id}}"
    CRM.createInquiry(property=property.id, lead=lead.phone)
```

Speed matters: leads convert 3-5× higher when answered within 5 minutes. Auto-reply first, then loop in the human agent.

### Recipe 2 — Book a viewing

> "Lead asks 'can I see the property tomorrow afternoon?'"

```
1. parse_date(message.body)  # NLU or LLM
2. if specific time: check_calendar(property.agent, requested_time)
   - if free: confirm + send Calendar invite
   - if busy: offer 3 alternative slots
3. send template "viewing_confirmation"
     variables: [leadName, propertyTitle, dateTime, agent.name, agent.phone, property.address]
4. CRM update: deal stage = "viewing-scheduled"
5. schedule reminder 2h before:
     send_whatsapp_message deliverAt: viewing.startTime - 2h
       template "viewing_reminder"
6. day-after follow-up:
     send_whatsapp_message deliverAt: viewing.startTime + 24h
       "Hola {{name}}, ¿qué te pareció {{propertyTitle}}? ¿Quieres una segunda visita, hacer una oferta, o ver otras opciones?"
```

If the user has no scheduling API, expose a Calendly link as the simplest path. Avoid the "let me check with the agent and get back to you" loop — leads cool down fast.

### Recipe 3 — New listing alert (matching criteria)

> "Notify María when a 2BR rental under €1,500 hits Pacífico district."

```
on new_listing.published:
  matching_leads = CRM.leadsWith(
    propertyType=listing.type,
    minBedrooms=listing.bedrooms,
    maxPriceWithin=20%(listing.price),
    location=listing.district
  )
  for lead in matching_leads:
    if last_alert_to(lead) < 24h_ago: skip   # rate-limit per lead
    send template "new_listing_alert"
      variables: [lead.firstName, listing.title, listing.price, listing.url]
      media: { url: listing.heroImage }
    label chat "alert-sent:{{listing.id}}"
```

Cap alerts to **1-2 per week per lead**. More than that = unsubscribes.

### Recipe 4 — Nurture sequence for cold leads

When a lead inquires but doesn't engage past the initial property pack:

| Day | Touch |
|---|---|
| +2 | "¿Has tenido tiempo de revisar los datos de {{property}}?" |
| +5 | Send 2 similar listings as alternatives |
| +10 | "¿Cambió tu búsqueda? Cuéntame qué priorizas ahora." |
| +21 | Soft re-engagement: market update / area report |
| +45 | Move to dormant; quarterly market emails only |

Implement as scheduled `send_whatsapp_message` with `deliverAt`. **Cancel** the cadence as soon as the lead replies.

### Recipe 5 — Handoff to the agent

When the lead is qualified (budget confirmed, viewing scheduled, paperwork started):

```
1. label chat "qualified" + "agent:{{agent.id}}"
2. assign chat to the property's listing agent (or round-robin if shared)
3. analyze_whatsapp_chat_messages → summary
4. Post summary + chat link to agent in Slack/Telegram
5. Disable bot for this chat
```

The agent should see the **summary first**, not the full transcript. Two paragraphs max: lead profile + what they want next.

### Recipe 6 — Documents & contracts

> "Send the deposit receipt and the rental contract for review."

```
1. upload_whatsapp_file_from_url with the PDF URL → file.id
2. send_whatsapp_message
   - media: { file: file.id }
   - caption: "Aquí el contrato. Por favor, revisa cláusulas 4 y 7 antes de firmar. Cualquier duda, dime."
3. label chat "contract-sent:{{property.id}}"
4. set reminder: if no reply in 48h, follow up
```

For e-signature, link to your provider (DocuSign, Signaturit). Don't try to sign on WhatsApp directly.

## Anti-patterns

- **Generic auto-reply.** "Thanks for your message" with no property data is useless. Always parse the inbound for a property reference and respond with that property's details.
- **Asking for criteria already on the portal.** If the lead clicked a 2BR rental, don't ask "what type are you looking for?". Ask what *else* matters (move-in date, parking, pets).
- **Sending too many listings per message.** Pick the **top 1-2 matches** by criteria. A 10-listing dump is overwhelming and reduces engagement on each.
- **Viewing requests with no calendar integration.** Manually checking the agent's availability every time loses leads. Wire `wassenger-webhooks` to a scheduling API.
- **No nurture for "not now" leads.** A "not ready" lead today is a buyer in 6-18 months. Tag them and let the cadence run.
- **Sharing seller info with buyer (or vice versa).** Real estate is a fiduciary role. Keep separate chats per side of the deal.

## See also

- `wassenger-messaging` — message construction (media, scheduling).
- `wassenger-inbox` — assignment, labels, multi-agent if you have a team.
- `wassenger-webhooks` — driving alerts from new MLS / portal listings.
- `wassenger-campaigns` — for market-update broadcasts.
- `wassenger-sales-bot` — qualification + handoff patterns also apply here.
- Real estate article: https://wassenger.com/blog/how-real-estate-agents-are-conquering-the-market-by-automating-whatsapp
