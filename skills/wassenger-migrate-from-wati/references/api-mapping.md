# Wati → Wassenger — field-by-field mapping

Endpoint names below are from the official Wati API (ClareAI Postman collection, `api/v1`). `{{URL}}` is your Wati tenant base, e.g. `https://live-server-12345.wati.io`.

## Authentication

| | Wati | Wassenger |
|---|---|---|
| Header | `Authorization: Bearer <token>` | `Token: <API_KEY>` |
| Base URL | tenant `https://live-server-<id>.wati.io` | fixed `https://api.wassenger.com/v1` |
| Token rotation | `POST /api/v1/rotateToken` | regenerate at https://app.wassenger.com/developers/apikeys |

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
| `parameters: [{ name, value }]` (named) | `template.components: [{ type:"body", parameters:[{type:"text", text:value}] }]` (positional) |

**Positional mapping**: order the Wassenger `parameters[]` to match where each `{{var}}` appears in the template body. Wati's names are just labels; Meta resolves by position.

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
