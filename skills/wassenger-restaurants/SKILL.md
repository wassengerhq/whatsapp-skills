---
name: wassenger-restaurants
description: Automate WhatsApp for restaurants, cafés, and food businesses using Wassenger — take reservations, send confirmations and reminders, share menus and daily specials, manage waiting lists, take takeaway / delivery orders, run loyalty promotions, and handle no-shows. Use when the user runs a restaurant, café, bar, ghost kitchen, or food delivery business and wants WhatsApp to replace phone-call chaos.
license: MIT
metadata:
  author: Wassenger
  version: "1.0.0"
  category: industry
  vertical: restaurants
  requires-mcp: "mcp-wassenger"
---

# Wassenger for Restaurants

Replace the phone queue with WhatsApp. The recipes below assume the user runs a venue with a fixed daily/weekly capacity and wants WhatsApp to handle reservations, menus, and basic ordering without hiring a dedicated phone host.

## When to use

- The user mentions **restaurant**, **café**, **bar**, **diner**, **ghost kitchen**, **food truck**, **bakery**, **catering**.
- They ask about **reservations**, **bookings**, **table management**, **walk-ins**, **waiting list**.
- They want to **share the menu** automatically, send **daily specials**, or take **takeaway / delivery orders** on WhatsApp.
- They mention high **no-show rates** and want to fix them with reminders.

For broader e-commerce / order fulfillment, route to `wassenger-ecommerce`. For pure broadcast promos to past customers, use `wassenger-campaigns`.

## Prerequisites

- `wassenger-setup` complete.
- A reservation system or Google Sheet acting as one (capacity per slot, current bookings).
- (Optional) A POS or delivery platform if taking orders (Glovo, Uber Eats, Deliveroo, or your own).
- For WABA: templates for `reservation_confirmation`, `reservation_reminder`, `waitlist_notify`, `order_ready`.

## Recipes

### Recipe 1 — Take a reservation

> "Quiero reservar para 4 personas el viernes a las 21h"

```
on message:in:new (with bot enabled):
  intent = classify(message.body)   # reservation | order | menu | other
  if intent == reservation:
    extracted = parse_reservation(message.body)  # date, time, party_size
    if missing fields: ask the missing one
    else:
      slot_available = check_availability(date, time, party_size)
      if slot_available:
        confirm to customer + create booking in your system
        label chat "reservation:{{date}}"
        save booking_id on the chat
      else:
        offer 3 nearest available slots OR add to waiting list (Recipe 4)
```

Always confirm with a **template** (WABA Utility) so the customer sees the booking details in a structured layout. Variables: name, date, time, party size, venue address, reservation ID.

### Recipe 2 — Reminder (no-show prevention)

The single highest-ROI restaurant recipe. No-show rates drop from 15-20% to <5% with a WhatsApp reminder.

```
on booking.created:
  schedule send_whatsapp_message at booking.start - 24h:
    template "reservation_reminder_24h"
    variables: [name, time, party_size]
    buttons:
      - "✅ Confirmar"   → on reply, mark booking confirmed
      - "❌ Cancelar"    → on reply, free the slot + waitlist notification
      - "✏️ Cambiar"    → start re-booking flow

  schedule send_whatsapp_message at booking.start - 2h:
    template "reservation_reminder_2h"
    variables: [name, time, address, googleMapsLink]
```

The 24h reminder catches forgetfulness; the 2h one catches lost intent (raining, plans changed).

### Recipe 3 — Share menu

> "¿Tienes la carta?"

```
on intent == menu:
  send_whatsapp_message
    - media: { file: menuPdfFileId }
    - caption: "Aquí nuestra carta 📋"
  # Optional: daily specials
  send_whatsapp_message
    - message: |
        Hoy también:
        🍝 Pasta del día: {{daily_special}}
        🍷 Vino sugerido: {{daily_wine}} (5€/copa)
```

Maintain `menuPdfFileId` (upload once a week, re-use). Refresh daily specials from a Google Sheet or your POS.

### Recipe 4 — Waiting list (when full)

> Date requested is sold out.

```
on booking_request when slot_full:
  send_whatsapp_message:
    "Lo siento, {{date}} a las {{time}} está completo.
     ¿Quieres que te avise si se libera una mesa?"
  if user replies yes:
    add to waiting list (chat.wid + party_size + date + time)
    label chat "waitlist:{{date}}"

on booking.cancelled:
  waitlist_match = find_waitlist_entry(date, time, party_size_compatible)
  if waitlist_match:
    send_whatsapp_message to waitlist_match.chat:
      template "waitlist_notify"
      "🎉 ¡Se liberó una mesa para {{party_size}} el {{date}} a las {{time}}!
       Responde SÍ en 15min para confirmar."
    if no reply in 15 min: move to next waitlist entry
```

### Recipe 5 — Takeaway / delivery order

> "Quiero pedir 2 pizzas margarita y 1 caesar para recoger a las 21h"

```
on intent == order:
  items = parse_items(message.body, menu)  # LLM or rule-based
  show summary + total + pickup_time
  ask: "¿Confirmas el pedido? Pago en local o por aquí con link de pago."
  if confirm:
    create order in POS / kitchen ticket printer
    send template "order_confirmed" with [orderNumber, total, pickupTime]
    if payment_link_requested:
      generate Stripe/Bizum/Paypal link, send

on order.ready:
  send template "order_ready" with [orderNumber, pickupCounter or address]
```

Don't try to be a full POS over chat. For >5-item complex orders, send a link to your online ordering page.

### Recipe 6 — Loyalty & re-engagement

> "Customer hasn't visited in 90 days."

```
weekly:
  dormant = customers where last_visit > 90d AND last_visit < 180d
  for customer in dormant:
    if customer.optedOut: skip
    send_whatsapp_message:
      template "we_miss_you"
      variables: [firstName, voucher_code]
      "Hola {{firstName}}, ¡te echamos de menos!
       Aquí va un postre gratis con tu próxima reserva.
       Código: {{voucher_code}} (válido 30 días)"
    label chat "campaign:dormant-90d"
```

Stamp loyalty card via WhatsApp:

```
on booking.completed (customer ate at venue):
  customer.stamps += 1
  if customer.stamps == 10:
    send "🎉 ¡Has acumulado 10 sellos! Tu próxima visita: aperitivo gratis."
    reset stamps
  else:
    send "Sello {{stamps}}/10 ⭐ — {{remaining}} más para tu premio."
```

## Anti-patterns

- **Slow first response.** A 30-minute wait to confirm a reservation = customer goes to a competitor. The bot should answer in <60 seconds, then the human host can refine.
- **Asking for party size in 5 separate messages.** Parse the whole reservation request at once. If the customer said "viernes 21h para 4", don't ask "¿qué día?" again.
- **No cancellation flow.** If you don't make canceling easy, customers ghost. Buttons in the reminder template = much lower no-show rate.
- **Loyalty without expiration.** Stamps that never expire have no urgency. Set a 60-day expiration on stamp progress.
- **Sending the same menu PDF every day.** If the menu doesn't change, ok. If it does, refresh the file (re-upload + update `menuPdfFileId`) — outdated menus erode trust.
- **No-show penalties without warning.** If you charge for no-shows, say so in the confirmation. Surprise charges = chargebacks + bad reviews.

## See also

- `wassenger-messaging` — templates with buttons, media, scheduled sends.
- `wassenger-webhooks` — for POS / booking system event ingestion.
- `wassenger-campaigns` — dormant-customer re-engagement at scale.
- `wassenger-contacts` — managing the customer database + segmentation.
- Reference implementation (full bot): https://github.com/wassengerhq/whatsapp-chatgpt-bot-restaurant
