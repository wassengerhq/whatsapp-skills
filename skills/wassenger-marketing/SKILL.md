---
name: wassenger-marketing
description: Run WhatsApp marketing campaigns with Wassenger — segmented broadcasts, re-engagement of dormant customers, referral programs, loyalty rewards, growth loops, A/B testing of templates, opt-in collection, and opt-out handling. Use when the user wants to drive revenue or retention with WhatsApp as a marketing channel — newsletters, promos, lifecycle nudges, win-back, referral — and needs to stay compliant with WhatsApp Business policy.
license: MIT
metadata:
  author: Wassenger
  version: "1.0.0"
  category: industry
  vertical: marketing
  requires-mcp: "mcp-wassenger"
---

# Wassenger for Marketing

WhatsApp is the highest-engagement channel most marketers have access to — open rates above 90%, click-through rates 2-5× email. The recipes below keep those rates **without** triggering Meta's policy enforcement (template suspension, WABA blocks, customer reports).

## When to use

- The user mentions **marketing**, **growth**, **acquisition**, **retention**, **lifecycle**, **CRM**, **newsletters**, **promos**, **referral**, **loyalty**.
- They want to **broadcast** to a segmented audience or run a **campaign**.
- They need **opt-in collection** for WABA Marketing.
- They ask about **A/B testing**, **template variants**, **performance metrics**.
- They want a **referral program** or **viral loop** over WhatsApp.

For purely transactional sends (order updates, alerts), use `wassenger-messaging` or the relevant industry skill. For inbound qualification, see `wassenger-sales-bot`.

## Prerequisites

- `wassenger-setup` complete.
- A **CRM or contact database** with at least: phone, name, opt-in status + timestamp + source, segmentation attributes (last purchase, language, tier, …).
- For WABA: **APPROVED Marketing templates** in each target language. Marketing templates are stricter than Utility — Meta rejects vague or pushy copy.
- A documented **opt-in source** (checkbox at checkout, web form, in-store sign-up, manual import with provenance).

## The compliance baseline (read this first)

WhatsApp marketing is permissioned. If you skip the rules below, Meta will suspend your templates or your WABA.

1. **Explicit opt-in.** Pre-checked boxes don't count. The user must actively check.
2. **Provenance trail.** Store `optInAt`, `optInSource` (URL, page, IP), and the exact wording shown.
3. **Easy opt-out.** STOP / UNSUBSCRIBE / BAJA in any reply must immediately suppress that contact globally.
4. **Frequency cap.** No more than 1 Marketing template per contact per 24h, ideally 1 per week.
5. **Template-only Marketing.** Marketing content cannot be free-form outside the 24h window. Build templates and send templates.
6. **Honesty.** Don't disguise Marketing as Utility. Templates are categorized at approval time — misuse triggers rejection.

## Recipes

### Recipe 1 — Opt-in collection

> "Add a WhatsApp opt-in checkbox to checkout and store everything we'll need for compliance."

At checkout (or any signup form):

```html
<label>
  <input type="checkbox" name="wa_optin" required>
  I want to receive offers and updates from {{brand}} on WhatsApp.
  I can opt out anytime by replying STOP.
</label>
```

Backend:

```
on checkout.completed:
  if form.wa_optin == true:
    save_optin(
      phone=customer.phone,
      optInAt=now,
      optInSource=form.url,
      optInIP=request.ip,
      optInLanguage=request.language,
      optInWording="..."  # store the exact text shown
    )
```

Audit-ready: if Meta or a regulator asks, you can produce the trail per contact.

### Recipe 2 — Segmented broadcast

```
1. Segment: customers WHERE
   optInValid AND
   country='ES' AND
   last_purchase_at > 30d ago AND
   total_spend_lifetime > €100
2. Pick template: "summer_sale_es" (APPROVED, Marketing, es)
3. manage_whatsapp_campaigns create + start
4. Cap to ≤1 marketing template per contact per 7 days
```

Send during **local 11am-12pm** weekdays (best response window for B2C in EU/LATAM). Avoid early morning, lunchtime in some markets, late evening.

### Recipe 3 — Re-engagement (dormant)

```
weekly_job:
  dormant = contacts where last_purchase_at between 90 and 365 days ago
            AND optInValid
            AND no_marketing_sent_in_last_30d
  for c in dormant:
    pick template by language + tier
    send with personalized voucher: VOUCHER_{{c.id}}_{{now}}
    label chat "campaign:winback-2026q2"
```

Measure **incremental revenue** vs control group (10% holdout, no winback message). If lift < 5%, the segment isn't worth re-engaging.

### Recipe 4 — Referral program

> "Customers who refer a friend get €10 credit. The friend gets €10 off first purchase."

```
1. Generate a unique referral code per customer (deterministic from customer.id).
2. send template "referral_invite":
   "Hi {{name}}, share {{brand}} with friends! Your code: {{REFCODE}}
    Each friend gets €10 off. You earn €10 when they buy."
   button: "Share on WhatsApp" → opens wa.me with prefilled message
   # NOTE: a wa.me link is a client-side share (the customer's own WhatsApp opens
   # with text pre-filled) — it is NOT an API send and does not go through Wassenger.

3. on new_order with referral code:
   credit_referrer(REFCODE.owner, €10)
   send_whatsapp_message to referrer:
     "🎉 Tu amigo {{friendName}} acaba de comprar. €10 a tu cuenta."
```

The friend-to-friend share via WhatsApp is the highest-converting growth loop most B2C brands have. Make the share message **default-good** (image + brand-aligned copy).

### Recipe 5 — A/B test a template

Build two template variants (same name + suffix, both APPROVED):

- `promo_summer_v1_es` — value-first headline
- `promo_summer_v2_es` — urgency-first headline

```
1. Split audience 50/50 by hash(contact.id) mod 2.
2. Create two campaigns, one template each, same schedule, same segment.
3. After 48h, compare:
   - read rate
   - reply rate
   - click-through (via shortened links with per-variant UTM)
   - conversion (via your e-commerce backend)
4. Keep the winner, archive the loser, iterate.
```

Document each test in a "growth log" spreadsheet: hypothesis, variants, metric, result, ship-or-kill decision.

### Recipe 6 — Opt-out enforcement

```
on message:in:new where body matches /^(STOP|UNSUBSCRIBE|BAJA|CANCELAR)$/i:
  CRM.markOptedOut(chat.contact.phone)
  exclude from all future Marketing campaigns
  send_whatsapp_message:
    "✅ Has cancelado las comunicaciones de marketing.
     Solo recibirás mensajes transaccionales (pedidos, soporte).
     Para reactivar, responde RESUME."
  label chat "opted-out"
  ack 200
```

Mirror the opt-out flag to every system (CRM, e-commerce platform, email tool). Re-opt-in requires the same explicit consent.

### Recipe 7 — Loyalty tier nudges

Use lifecycle triggers to push the customer up the tier ladder:

```
weekly_job:
  for c in customers:
    if c.spend_this_year between (c.tier.threshold * 0.8) and c.tier.threshold:
      send_whatsapp_message:
        template "tier_nudge"
        variables: [firstName, currentTier, nextTier, spendNeeded, perksOfNextTier]
```

Loyalty pushes work because they're personally relevant — not a blanket promo. Don't run them on contacts with no realistic shot at the next tier (would erode trust).

### Recipe 8 — Growth-loop measurement

Every campaign should answer:

| Metric | Target (B2C, EU) | How to measure |
|---|---|---|
| Delivery rate | > 95% | `manage_whatsapp_campaigns stats.delivered / total` |
| Read rate | > 80% | `stats.read / stats.delivered` |
| Reply rate | 3-10% | `stats.replied / stats.delivered` |
| Click-through | 5-15% | UTM'd short links in template |
| Conversion | 1-5% | E-commerce attribution window 7d |
| Opt-out rate | < 0.5% | Newly opted-out / campaign size |

Anything below half of target = template / segment / timing problem. Stop and iterate, don't scale.

## Anti-patterns

- **Buying or scraping phone lists.** Fastest way to a WABA ban. Build opt-in from day one.
- **Same template every week.** Customers tune out. Rotate variants, test new angles.
- **No frequency cap.** Even with opt-in, >2 messages/week per contact kills engagement.
- **Treating WhatsApp like email.** Email tolerates more frequency and longer copy. WhatsApp wants short, punchy, personal.
- **Marketing template that looks like Utility.** Meta categorizes templates at approval. Trying to slip Marketing under a Utility template gets the template rejected on review.
- **No segmentation.** A blanket promo to everyone has lower lift than a small, targeted one to the right segment. Cohort everything.
- **Ignoring time zone.** Sending at "1pm" globally = 3am for some recipients. Use contact's locale.
- **No control group.** Without a holdout, you can't tell if a campaign moved the needle or if it would have happened anyway.

## See also

- `wassenger-campaigns` — the capability under all these recipes (audience build, scheduling, stats, opt-out flow).
- `wassenger-messaging` — template / media construction details.
- `wassenger-webhooks` — driving opt-out enforcement and reply-based loops.
- `wassenger-contacts` — managing the audience database.
- Wassenger marketing playbook: https://wassenger.com/blog/maximize-your-marketing-with-wassenger-campaigns-no-coding-required
- n8n marketing automation: https://github.com/wassengerhq/n8n-wassenger
