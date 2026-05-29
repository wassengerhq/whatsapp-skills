# Twilio → Wassenger — field-by-field mapping

## Authentication

| | Twilio | Wassenger |
|---|---|---|
| Method | HTTP Basic | API key header |
| Credentials | `AccountSid` : `AuthToken` | single API key |
| Header | `Authorization: Basic base64(Sid:Token)` | `Token: <API_KEY>` (or `Authorization: Bearer <key>`) |
| Get it at | Twilio Console | https://app.wassenger.com/developers/apikeys |

## Send a message — `POST /Messages.json` → `POST /v1/messages`

| Twilio param | Wassenger field | Notes |
|---|---|---|
| `From` | `device` | Twilio = `whatsapp:+E164` sender; Wassenger = device ID |
| `To` | `phone` | strip the `whatsapp:` prefix → plain `+E164` |
| `Body` | `message` | plain text |
| `MediaUrl` (repeatable) | `media: { url }` | Wassenger sends one media per message; loop for multiple |
| (upload first) | `media: { file }` | use `upload_whatsapp_file_from_url` → `file.id` |
| `MediaUrl` + caption in `Body` | `media: { url }` + `caption` | Wassenger separates caption |
| `ContentSid` | `template.name` + `template.language` | map opaque SID → Meta template identity |
| `ContentVariables` `{"1":..}` | `template.components[].parameters[]` | positional → typed params |
| `ScheduleType=fixed` + `SendAt` | `deliverAt` | ISO 8601; no Messaging Service needed |
| `MessagingServiceSid` | (n/a) | Wassenger has no messaging-service concept; use `device` |
| `StatusCallback` | webhook `message:out:*` | subscribe once, not per message |
| response `sid` (`SM…`) | response `message.id` | store for tracking |
| response `status` | response `status` / webhook | queued/sent/delivered/read/failed |

## Templates

| Twilio | Wassenger |
|---|---|
| Built in Content Template Builder, referenced by `ContentSid` | Referenced by Meta `name` + `language` |
| `ContentVariables` JSON, positional keys `"1"`,`"2"` | `components: [{type:"body", parameters:[{type:"text",text:…}]}]` |
| Header media via Content config | `components: [{type:"header", parameters:[{type:"image", image:{link}}]}]` |
| Buttons via Content config | `components: [{type:"button", sub_type:"quick_reply", index:"0", parameters:[…]}]` |
| List/approve in Console | `list_whatsapp_templates` (status must be `APPROVED`) |

Templates already approved on the WABA you migrate **carry over** — you map identifiers, you do not re-submit.

## Inbound message (webhook)

| Twilio (form field) | Wassenger (JSON path) |
|---|---|
| `MessageSid` | `data.id` |
| `From` (`whatsapp:+E164`) | `data.fromNumber` (plain `+E164`) |
| `To` | `data.toNumber` / `data.device` |
| `Body` | `data.body` |
| `NumMedia` / `MediaUrl0` | `data.media` (url / file ref) |
| `MediaContentType0` | `data.media.mimetype` |
| `ProfileName` | `data.chat.contact.name` |
| `WaId` | `data.chat.contact.wid` |
| (n/a) | `event` = `message:in:new` |

## Status values

| Twilio `MessageStatus` | Wassenger event |
|---|---|
| `queued` / `sent` | `message:out:sent` |
| `delivered` | `message:out:delivered` |
| `read` | `message:out:read` |
| `failed` / `undelivered` | `message:out:failed` |

## Signature verification

| | Twilio | Wassenger |
|---|---|---|
| Header | `X-Twilio-Signature` | `X-Wassenger-Signature: sha256=<hex>` |
| Algorithm | HMAC-SHA1 | HMAC-SHA256 |
| Signed payload | full URL + sorted POST params | the **raw request body** |
| Secret | `AuthToken` | per-webhook `secret` (returned on create) |

## Phone number format

- Twilio: always `whatsapp:+<E164>` (e.g. `whatsapp:+34600111222`).
- Wassenger: plain `+<E164>` (e.g. `+34600111222`). Strip `whatsapp:` on the way in and out.
