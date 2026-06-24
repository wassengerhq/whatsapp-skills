---
name: wassenger-quick-replies
description: Manage the library of canned reply templates Wassenger agents use in the inbox — create reusable response snippets with keyboard shortcuts (`/shipping`, `/returns`, `/hours`), organize them by category, share them across the team or keep them private, attach images and documents, and bulk-import from a CSV. Use when the user wants to speed up the inbox by giving agents a keystroke-triggered library of pre-written replies they can drop into any conversation in one click.
license: MIT
metadata:
  author: Wassenger
  version: "1.0.0"
  category: capability
  requires-mcp: "mcp-wassenger"
---

# Wassenger Quick Replies

The canned-response library every support / sales team needs. Agents type a shortcut (`/shipping`) and the saved reply drops into the chat — same text, same media, same wording every time. Less typing, more consistency.

## When to use

- *"Create a quick reply for 'shipping address' questions."*
- *"What quick replies do we have? I can't find the one for returns."*
- *"Make this shipping reply available to the whole team — right now it's only mine."*
- *"Import these 30 canned responses from our old helpdesk."*
- *"Add a PDF (our terms of service) to the 'terms' quick reply."*

This skill is about **managing the library** (CRUD). For *sending* a quick reply inside a conversation — that's the agent typing the shortcut in the Wassenger console — no API call needed.

For **rule-based automatic** responses (welcome, out-of-office), see `wassenger-auto-replies`. For **WABA approved templates** used to message a customer outside the 24h window, see `wassenger-messaging` Recipe 3.

## Prerequisites

- `wassenger-setup` complete.
- A device with `status: ready`.
- The user is an admin (or has manage-replies permission).

## The visibility model

| Visibility | Who sees it | When to use |
|---|---|---|
| **`public`** | Whole team | Standard responses (shipping policy, business hours, return process) |
| **`readonly`** | Whole team can use, only admins can edit | Brand-sensitive copy (legal disclaimers, terms) |
| **`private`** | Only the creator | Personal shortcuts (`/me` for a personal greeting) |

The endpoint accepts `scope: wa` (used by any device on the account) or `scope: chat` (device-scoped, only the specific WhatsApp number where the agent is logged in).

> Quick replies are a **Wassenger platform feature** — the saved text/media lives on the Wassenger side, then gets sent via the connected device (WABA-compatible). They are **not** the same as Meta WABA templates.

## Recipes

### Recipe 1 — Create a basic quick reply

> "Create a quick reply called 'shipping' with the text: 'Hi! Standard shipping takes 3-5 days; express 1-2. Tracking arrives once dispatched.'"

The Wassenger MCP does not currently expose quick-reply management as a tool — call the REST endpoint directly:

```
POST /v1/devices/{deviceId}/quickReplies
  -H "Token: $WASSENGER_API_KEY"
  body: {
    "shortcut": "/shipping",
    "message": "Hi! Standard shipping takes 3-5 days; express 1-2. Tracking arrives once dispatched.",
    "scope": "wa",          # account-wide
    "visibility": "public"
  }
→ { id, shortcut, message, ... }
```

The `shortcut` is what agents type. Use a leading `/` (`/shipping`, `/returns`) for muscle memory — the Wassenger console autocompletes them.

### Recipe 2 — With a media attachment

> "Add our terms of service PDF as a quick reply called 'terms'."

```
1. upload_whatsapp_file_from_url with the PDF URL  → file.id

2. POST /v1/devices/{deviceId}/quickReplies
   body: {
     "shortcut": "/terms",
     "message": "Aquí los términos y condiciones — cláusula 7 cubre tu pregunta.",
     "media": { "file": "<file.id>" },
     "visibility": "public"
   }
```

Quick replies can include any media type the device supports: PDF, image, video, audio. Caption goes in `message`.

### Recipe 3 — List + search

> "What quick replies do we have for shipping?"

```
GET /v1/devices/{deviceId}/quickReplies?search=shipping&limit=50
```

Filters:

- `search=<text>` — substring match on shortcut or message
- `scope=wa|chat`
- `visibility=public|readonly|private`
- `mine=true` — only those owned by the requester
- `limit`, `offset` — pagination

### Recipe 4 — Organize by category

The API doesn't have a `category` field — use the `shortcut` namespace convention to organize:

```
/shipping-standard
/shipping-express
/shipping-international
/returns-policy
/returns-refund-status
/hours-weekday
/hours-weekend
```

Agents see a flat list, but the prefix lets them autocomplete efficiently (`/shi…` shows all shipping replies; `/hou…` shows hours).

### Recipe 5 — Share or scope a reply

> "I created this for myself but the whole sales team should see it."

```
PATCH /v1/devices/{deviceId}/quickReplies/{id}
  body: { "visibility": "public" }
```

To restrict to admins-only:

```
PATCH ... body: { "visibility": "readonly" }
```

To move from one device to all devices:

```
PATCH ... body: { "scope": "wa" }
```

### Recipe 6 — Bulk import from CSV

> "Import these 30 canned responses from our old Zendesk macros."

```
CSV format:
  shortcut,message,visibility,media_url
  /shipping-std,"Standard shipping takes 3-5 days.",public,
  /shipping-exp,"Express shipping takes 1-2 days.",public,
  /returns,"Our return window is 30 days from purchase.",public,
  /terms,"Here are our terms — see clause 7.",public,https://example.com/terms.pdf
```

For each row:

```
1. If media_url is set:
     upload_whatsapp_file_from_url(media_url) → file.id
2. POST /v1/devices/{deviceId}/quickReplies
     body: { shortcut, message, visibility, media: file.id ? { file: file.id } : undefined }
```

Idempotency: search by shortcut first; PATCH if found, POST if new. Don't create duplicates.

### Recipe 7 — Update / rename

> "Change the shipping message — we changed carriers."

```
PATCH /v1/devices/{deviceId}/quickReplies/{id}
  body: { "message": "Hi! Standard shipping (Correos): 3-5 days; express (SEUR): 1-2." }
```

To rename the shortcut:

```
PATCH ... body: { "shortcut": "/shipping" }   # any chat using the old shortcut starts using the new wording
```

### Recipe 8 — Delete

```
DELETE /v1/devices/{deviceId}/quickReplies/{id}
```

Soft-delete first if you can: rename the shortcut to `/zz-shipping-old` for 30 days, watch usage, then hard-delete if nobody complains.

## Anti-patterns

- **One huge reply library, no namespaces.** A team with 80 quick replies and no naming convention can't find anything. Use prefixes (`/shipping-`, `/returns-`, `/hours-`).
- **Tone drift.** A reply written 2 years ago in our old brand voice gets used today — sounds off. Quarterly review of the top-20 used replies.
- **No ownership.** Quick replies are a shared vocabulary. Have one person (or a small committee) own the library. Otherwise everyone makes their own version of `/shipping` and they fight.
- **Quick replies for personalized answers.** Anything that needs the customer's name, order number, or specific data shouldn't be a canned reply — the agent will paste it as-is and look robotic. Save those as starter templates the agent edits.
- **Forgetting the media re-upload.** When a PDF changes, replacing the underlying file is not enough — `update_whatsapp_file_metadata` is for metadata only. To swap content, upload a new file and PATCH the quick reply to point at the new file.id.
- **Mixing with WABA templates.** Quick replies are **internal helpers for human agents**, NOT WABA templates. Don't try to use them to send messages outside the 24h customer service window — that requires an approved Meta template.

## See also

- `wassenger-messaging` — for sending messages and using WABA templates.
- `wassenger-auto-replies` — for *automatic* responses (welcome, out-of-office).
- `wassenger-inbox` — where agents actually use these in conversations.
- `wassenger-team` — control who can edit shared replies (admin role).
