---
name: wassenger-ecommerce
description: Automate WhatsApp for online stores using Wassenger — order confirmations, abandoned-cart recovery, shipping updates, delivery notifications, review requests, post-purchase upsell, and order-related customer support. Use when the user runs an e-commerce business (Shopify, WooCommerce, Tiendanube, Magento, custom) and wants to turn WhatsApp into a revenue and CSAT channel. Recipes compose wassenger-messaging, wassenger-webhooks, and wassenger-campaigns to wire store events to WhatsApp flows.
license: MIT
metadata:
  author: Wassenger
  version: "1.0.0"
  category: industry
  vertical: ecommerce
  requires-mcp: "@wassengerhq/mcp-wassenger"
---

# Wassenger for E-commerce

Turn WhatsApp into the highest-converting channel of an online store. The recipes below assume a typical store stack: a storefront (Shopify, WooCommerce, Tiendanube, Magento, custom), a fulfillment provider, and a tagging/segmentation source (the store admin or a CRM).

## When to use

Activate this skill when the user:

- Owns or operates an **online store** (mentions Shopify, WooCommerce, Tiendanube, BigCommerce, Magento, Prestashop, or a custom e-commerce stack).
- Asks about **order confirmations**, **abandoned cart**, **shipping updates**, **review requests**, **post-purchase**, **upsell**, **cross-sell**, or **WhatsApp for online sales**.
- Wants to connect a **storefront event** (order placed, payment captured, fulfilled, refunded) to a WhatsApp message.

If the question is purely about "how do I send a message" without a store context, route to `wassenger-messaging`. If it's about a bulk one-shot promo, use `wassenger-campaigns`.

## Prerequisites

- `wassenger-setup` complete.
- The store's **webhook system** exposing the events you want to act on (Shopify webhooks, WooCommerce REST webhooks, etc.). Most platforms have these out of the box.
- A way to deploy a small HTTP handler (a serverless function, a tiny Node/Python server, or n8n / Zapier / Make if the user prefers low-code).
- For WABA devices: pre-approved **transactional templates** in the languages of your customer base (order_confirmation, shipping_update, delivery_complete, review_request).

## Architecture

```
Storefront ──webhook──► Your handler ──MCP──► Wassenger ──WhatsApp──► Customer
                              │
                              └── Logs + dedupe in your DB
```

For low-code users, the handler can be an n8n workflow using `wassengerhq/n8n-wassenger` instead of custom code. Same shape, different runtime.

## Recipes

### Recipe 1 — Order confirmation

> "When a customer places an order, send them a WhatsApp confirmation with the order number and a tracking link."

Wire the store's `order.created` (or `order.paid`) webhook to a handler:

```
on order.created (from Shopify / Woo / …):
  customer = order.customer
  if !customer.phone or !customer.smsConsent: return 200

  # Within 24h of opt-in (checkout consent), free-form is allowed.
  send_whatsapp_message
    - device: $DEVICE_ID
    - phone: customer.phone
    - message: |
        ¡Gracias por tu compra, {{customer.firstName}}!
        Pedido #{{order.number}} — Total {{order.totalPrice}}
        Sigue tu pedido aquí: {{order.statusUrl}}
  ack 200
```

If outside 24h or you prefer a template:

```
send_whatsapp_message
  - template:
      name: "order_confirmation"
      language: "es"
      components:
        - { type: header, parameters: [{ type: text, text: order.number }] }
        - { type: body, parameters: [{ type: text, text: customer.firstName }, { type: currency, ... }] }
        - { type: button, sub_type: url, index: "0", parameters: [{ type: text, text: order.statusUrl }] }
```

### Recipe 2 — Abandoned cart recovery

> "If a customer adds to cart and doesn't check out within 1 hour, send them a reminder."

This requires a **scheduled job** (cron, Inngest, Temporal) since the storefront's "cart abandoned" detection is delayed. Pseudo-flow:

```
every 15 min:
  carts = storefront.getAbandonedCarts(since: 60-90 min ago, not_recovered: true)
  for cart in carts:
    if !cart.customer.phone or !cart.customer.smsConsent: skip
    send_whatsapp_message
      - device: $DEVICE_ID
      - phone: cart.customer.phone
      - message: |
          Hola {{firstName}}, ¿olvidaste algo? 🛒
          {{cart.items[0].title}} sigue esperándote.
          Termina tu compra: {{cart.recoveryUrl}}
          (10% de descuento con código RECOVER10 hasta hoy)
      - media: { url: cart.items[0].imageUrl }   # optional, hero image
    mark cart as "wa_reminder_sent" in your DB to avoid retries
```

A/B test the discount: send 50% with code, 50% without. Compare conversion via `manage_whatsapp_campaigns` stats if you implement as a campaign instead, or via your storefront's coupon-redemption report.

### Recipe 3 — Shipping & delivery updates

> "When the carrier marks a shipment as out for delivery, ping the customer."

Most fulfillment platforms (Shippo, EasyPost, native carriers via API) emit `shipment.in_transit`, `shipment.out_for_delivery`, `shipment.delivered`.

```
on shipment.out_for_delivery:
  send template "shipping_out_for_delivery"
    variables: [customer.firstName, shipment.trackingNumber, shipment.carrierLink]

on shipment.delivered:
  send template "shipping_delivered" + media: { url: order.firstItemPhoto }
  # 30 minutes later → schedule review request
  send_whatsapp_message with deliverAt: now + 30min:
    template "review_request" with order.id as deep link
```

### Recipe 4 — Review / re-purchase request

> "7 days after delivery, ask for a review and offer a re-purchase incentive."

Schedule from the `shipment.delivered` event:

```
on shipment.delivered:
  scheduleAt(now + 7 days) → fire WhatsApp template:
    "Hola {{firstName}}, ¿cómo te fue con {{order.items[0].title}}?
     Cuéntanos con una reseña aquí 👇 {{reviewLink}}
     Y como agradecimiento, 15% de descuento en tu próxima compra: RETURN15"
```

For one-shot re-engagement campaigns ("we miss you" to customers inactive >90 days), use `wassenger-campaigns` with a segment filter.

### Recipe 5 — Order-related support

> "When a customer asks 'where is my order #1234', look it up and answer."

This is an agentic loop, perfect for an LLM behind the inbox:

```
on message:in:new (via wassenger-webhooks):
  if message.body matches /pedido|orden|order/ AND extract order number:
    order = storefront.getOrder(extractedNumber)
    if order belongs to message.from.phone:
      reply with order.status + tracking link
    else:
      label chat "support:order-lookup-failed" + assign to human
```

The full agentic version of this is `wassengerhq/whatsapp-chatgpt-bot` — use it as the reference implementation if the user wants a ready-made monolith.

### Recipe 6 — Upsell & cross-sell

> "Customers who bought running shoes 60 days ago: offer them socks at 20% off."

Pure campaign play:

```
1. Segment: customers WHERE last_order_item.category = "running-shoes"
            AND last_order_at < now - 60 days
            AND last_order_at > now - 120 days
2. Build CSV, import via manage_whatsapp_campaign_contacts
3. Create campaign with template "upsell_socks_20off_es"
4. Send during weekday 11am-12pm local time (highest reply rate)
5. Tag responders with label "interested:socks-upsell" for follow-up
```

## Anti-patterns

- **Sending to customers without opt-in.** WhatsApp marketing without explicit checkbox consent gets reported. Use a checkout opt-in field; store the timestamp + IP in your DB.
- **Loop-sending instead of campaigns.** A `for-loop` over `send_whatsapp_message` for 1000 customers will choke the queue and skew metrics. Always go via `wassenger-campaigns` past ~50 recipients.
- **Promo templates as transactional.** Don't reuse Marketing templates for order confirmations. Build dedicated **Utility** templates — they bypass the 24h marketing-window restrictions and don't count against the Marketing tier.
- **Ignoring STOP/UNSUBSCRIBE.** Implement opt-out (see `wassenger-campaigns` Recipe 5). Failing to honor opt-out leads to template suspension and WABA penalties.
- **Sending shipping updates twice.** Carriers can re-emit the same event. Dedupe on `shipment.id + event` in your DB before sending.

## Integrations

- **Shopify:** Webhooks at `Settings → Notifications → Webhooks`. Subscribe to `orders/create`, `orders/paid`, `fulfillments/create`, `checkouts/create` (for abandoned).
- **WooCommerce:** REST API webhooks at `WooCommerce → Settings → Advanced → Webhooks`.
- **Tiendanube:** Webhooks in app settings; use the OAuth app shape.
- **Magento:** Use Magento 2 Webhooks extension or build an observer.
- **n8n:** Use `wassengerhq/n8n-wassenger` nodes — many e-commerce templates available in the n8n template gallery.
- **Make / Zapier:** Use Wassenger's official Make module / Zapier app; map storefront triggers to "Wassenger > Send message".

## See also

- `wassenger-messaging` — message construction details (templates, media, scheduling).
- `wassenger-campaigns` — bulk sends (upsell, re-engagement).
- `wassenger-webhooks` — receive events from your storefront.
- `wassenger-customer-support` — for the post-purchase support side of e-commerce.
- Reference implementation: https://github.com/wassengerhq/whatsapp-chatgpt-bot
- E-commerce article: https://wassenger.com/blog/e-commerce-hack-automate-orders-sales-like-a-pro
