---
name: wassenger-logistics
description: Automate WhatsApp for logistics, last-mile delivery, and courier operations using Wassenger — send tracking updates, coordinate with drivers, request proof of delivery (photo, signature, code), handle failed deliveries and reschedules, and notify recipients in real time about ETA changes. Use when the user runs a logistics company, fleet of couriers, dispatch operation, or in-house delivery team and wants WhatsApp to be the communication layer between dispatch, drivers, and recipients.
license: MIT
metadata:
  author: Wassenger
  version: "1.0.0"
  category: industry
  vertical: logistics
  requires-mcp: "mcp-wassenger"
---

# Wassenger for Logistics & Delivery

Coordinate the three parties of every delivery — dispatcher, driver, recipient — on WhatsApp. The recipes below assume the user has a TMS (Transport Management System), a route-planner, or at least a spreadsheet that lists today's deliveries with phone numbers.

## When to use

- The user mentions **logistics**, **delivery**, **courier**, **dispatch**, **fleet**, **last-mile**, **trucking**, **3PL**.
- They want **tracking updates** to recipients without building a customer portal.
- They need **proof of delivery** (POD) on phone with photo + signature + code.
- They handle **failed deliveries** and want to automate the **reschedule** conversation.

For pure customer support after a delivery problem, see `wassenger-customer-support`. For e-commerce order tracking from the merchant side, see `wassenger-ecommerce`.

## Prerequisites

- `wassenger-setup` complete.
- A list of deliveries with: recipient phone, address, time window, driver, tracking number.
- Pre-approved WABA templates for `delivery_dispatched`, `delivery_out_for_delivery`, `delivery_eta_update`, `delivery_arrived`, `delivery_failed`, `reschedule_request`.
- For **internal driver coordination**, use a separate tool (Telegram, Signal, your own driver app). WABA does not support WhatsApp groups, so it is not the right channel for dispatcher↔driver chatter. This skill stays focused on the dispatcher↔recipient leg.

## Recipes

### Recipe 1 — Dispatch notification to recipient

> "When a parcel is dispatched, notify the recipient with the tracking link and ETA window."

```
on shipment.dispatched (from TMS / carrier API):
  send_whatsapp_message
    - action: template
    - template:
        name: "delivery_dispatched"
        body: [ {name:"1", value:recipientName}, {name:"2", value:trackingNumber}, {name:"3", value:etaWindow}, {name:"4", value:carrierName} ]
        button: [ {type:url, position:0, name:"1", value:trackingUrlSuffix} ]
    # "Cambiar dirección" / "Reprogramar" quick-reply buttons are part of the
    # APPROVED template; on reply, branch to the change-address / reschedule flow.
  label chat "shipment:{{trackingNumber}}"
```

Include the **driver's first name** if you know it ("Juan llegará entre las 10:00 y las 12:00") — humanizes the delivery and reduces complaints.

### Recipe 2 — Out-for-delivery + live ETA

When the driver scans the parcel as "loaded on van" or starts the route:

```
on shipment.out_for_delivery:
  eta = computeETA(driver.currentLocation, stop.address, traffic)
  send template "delivery_out_for_delivery"
    variables: [recipientName, eta, driver.firstName]

# Update if ETA slips by >15 minutes:
every 5 min while driver enroute:
  new_eta = recomputeETA(...)
  if abs(new_eta - last_eta) > 15min:
    send template "delivery_eta_update"
      variables: [newEtaWindow]
    last_eta = new_eta
```

Don't spam. **Only notify on material changes** (>15 min slip). Constant updates train recipients to ignore.

### Recipe 3 — At-the-door confirmation

When the driver arrives:

```
on driver.arrived_at_stop:
  send_whatsapp_message to recipient:
    "🛎️ {{driver.firstName}} acaba de llegar con tu pedido.
     ¿Estás disponible? Responde:
     SÍ — abro en un momento
     ESPERA 5 — necesito 5 minutos
     NO ESTOY — no estoy en casa"

  if reply "ESPERA 5": notify the driver via your internal channel
    (Telegram / Signal / driver app): "Stop #{{stopNumber}}: cliente pide 5 min de espera"

  if reply "NO ESTOY": trigger failed-delivery flow (Recipe 5)
```

### Recipe 4 — Proof of delivery (POD)

```
on driver.marks_delivered:
  driver_uploads:
    - photo of parcel at door OR
    - signature image OR
    - 4-digit code recipient gave on door

  # Push POD to recipient as confirmation:
  send_whatsapp_message
    - media: { url: pod.photoUrl }
    - caption: |
        ✅ Entregado a las {{time}}
        Si no eres tú quien lo recibió, responde "NO RECIBIDO".
```

Save POD URL + timestamp + GPS coords against the shipment record for dispute resolution.

### Recipe 5 — Failed delivery + reschedule

```
on shipment.failed (driver couldn't deliver):
  send_whatsapp_message
    - action: template
    - template:
        name: "delivery_failed"
        body: [ {name:"1", value:recipientName}, {name:"2", value:attemptCount}, {name:"3", value:nextAttempt} ]
    # Reprogramar / Punto de recogida / Cambiar dirección buttons are defined in
    # the APPROVED template; on reply, branch:
    #   "📅 Reprogramar"        → ask for new window
    #   "📍 Punto de recogida"  → send nearest pickup location
    #   "🔄 Cambiar dirección"  → start address-change flow

# On reply with new window:
  parse_new_date_time(reply)
  validate (must be > tomorrow, within service area)
  update_shipment(new_time)
  send template "reschedule_confirmed"
```

Cap reschedules at **2 per shipment**. After that, escalate to a human dispatcher.

### Recipe 6 — Recipient instructions (the "buzz code" problem)

A huge % of failed deliveries are missing buzz codes, gate codes, or specific instructions.

```
on shipment.dispatched:
  if !recipient.address_notes:
    ask: "¿Hay algo que el repartidor deba saber? (código portal, piso, instrucciones)"
    save reply on shipment.address_notes
    pass to the driver via your internal channel (Telegram / driver app) when the route is built
```

This one recipe alone reduces failed deliveries by 10-20% in urban areas.

## Anti-patterns

- **Notification flood.** Every 5 minutes ≠ helpful. Notify only on dispatch, out-for-delivery, material ETA changes, arrival, and completion.
- **No bidirectional channel.** Sending tracking but not letting the recipient reply / reschedule = same as a useless email. Always include buttons or instructions to reply.
- **Mixing dispatcher↔driver coordination into the recipient WABA.** Drivers belong on a separate channel (Telegram / Signal / internal driver app). Using the same WABA device for both blurs reporting, eats quota, and produces a confused inbox.
- **POD without timestamp + GPS.** Disputes are won by metadata, not the photo. Save everything.
- **Reusing the same template for dispatch / out-for-delivery / arrived.** Each phase needs a distinct template. Recipients tune out repetitive messages.
- **No human escalation for chronic failures.** After 2 failed attempts, a human must call. Don't loop the bot.

## See also

- `wassenger-messaging` — templates with buttons, media for POD photos.
- `wassenger-webhooks` — ingest TMS / carrier events to trigger these recipes.
- `wassenger-contacts` — managing the recipient database.
- `wassenger-customer-support` — for the post-failed-delivery support cases.
- `wassenger-ecommerce` — the merchant-side counterpart (Recipe 3 in that skill).
- Reference implementation: https://github.com/wassengerhq/whatsapp-chatgpt-bot
