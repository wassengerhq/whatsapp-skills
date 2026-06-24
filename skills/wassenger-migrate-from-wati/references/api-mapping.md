# Wati → Wassenger — field-by-field mapping

Endpoint names below are from the official Wati API (ClareAI Postman collection, `api/v1`). `{{URL}}` is your Wati tenant base, e.g. `https://live-server-12345.wati.io`.

## Authentication

| | Wati | Wassenger |
|---|---|---|
| Header | `Authorization: Bearer <token>` | `Token: <API_KEY>` |
| Base URL | tenant `https://live-server-<id>.wati.io` | fixed `https://api.wassenger.com/v1` |
| Token rotation | dashboard only (Wati profile/API settings) | regenerate at https://app.wassenger.com/developers/apikeys |

> The `Token` header value is your Wassenger API key. Read it from an env var and
> fail fast if it's missing — an unset/empty `Token` returns a generic **401** that's
> easy to mistake for a bad key:
> ```js
> if (!process.env.WASSENGER_API_KEY) throw new Error('WASSENGER_API_KEY is not set')
> ```

## Endpoints

| Wati | Wassenger |
|---|---|
| `POST /api/v1/sendSessionMessage/{whatsappNumber}` (form `messageText`) | `POST /messages` `{ device, phone, message }` |
| `POST /api/v1/sendSessionFile/{whatsappNumber}` (multipart file) | `POST /messages` `{ device, phone, media:{url\|file} }` |
| `POST /api/v1/sendTemplateMessage?whatsappNumber=` | `POST /messages` `{ device, phone, template }` |
| `POST /api/v1/sendTemplateMessages` (`receivers[]`) | campaign — see `wassenger-campaigns` |
| `POST /api/v1/sendTemplateMessageCSV` | campaign from CSV — see `wassenger-campaigns` |
| `POST /api/v1/sendInteractiveButtonsMessage` | template with button components / interactive — `wassenger-messaging` |
| `POST /api/v1/sendInteractiveListMessage` | interactive list — `wassenger-messaging` |
| `GET /api/v1/getMessages/{whatsappNumber}` | `get_whatsapp_chat_messages` |
| `GET /api/v1/getMessageTemplates` | `list_whatsapp_templates` |
| `GET /api/v1/getContacts` | contacts list — `wassenger-contacts` |
| `POST /api/v1/addContact/{whatsappNumber}` | create contact — `wassenger-contacts` |
| `POST /api/v1/updateContactAttributes/{whatsappNumber}` | update contact metadata — `wassenger-contacts` |
| `POST /api/v1/assignOperator?email=&whatsappNumber=` | `PATCH /chats/{wid} { assignedTo }` — `wassenger-inbox` |

## Send fields

| Wati | Wassenger | Notes |
|---|---|---|
| `whatsappNumber` (URL path/query, bare digits) | `phone` (body, E.164 `+…`) | move from URL to body, add `+` |
| (implicit number) | `device` | required; resolve once with `get_whatsapp_devices` |
| `messageText` (form-data) | `message` (JSON) | free-form, within 24h |
| (file multipart) | `media: { url }` or `{ file }` | upload via `upload_whatsapp_file_from_url` for `file.id` |

## Template fields

| Wati | Wassenger |
|---|---|
| `template_name` | `template.name` |
| `broadcast_name` | — (no equivalent, drop) |
| (inferred) | `template.language` (**required**: `en`, `es`, `pt_BR`, …) |
| `parameters: [{ name, value }]` (named) | `template.body: [{ name:"1", value }, { name:"2", value }]` (positional — `name` is the `{{N}}` index) |

**Positional mapping**: order the Wassenger `body[]` entries to match where each `{{var}}` appears in the template body, and set `name` to that `{{N}}` index. Wati's param names are just labels; Wassenger/Meta resolve by position — **do not trust Wati's `parameters[]` array order**.

> Wassenger uses its own template shape (`template: { name, language, header?, body: [{ name, value }], button? }`), **not** Meta's `components: [...]`. The `header` and `button` arrays follow the same `{ name, value }` convention.

## Bulk template (`sendTemplateMessages`)

```
Wati: { template_name, broadcast_name, receivers:[{ whatsappNumber, customParams:[{name,value}] }] }
```
→ Wassenger campaign: audience (contacts/CSV) + template + per-recipient variables. See `wassenger-campaigns`.

## Contacts

| Wati `addContact` | Wassenger |
|---|---|
| `name` | contact `name` |
| `customParams: [{ name, value }]` | contact `metadata` entries |
