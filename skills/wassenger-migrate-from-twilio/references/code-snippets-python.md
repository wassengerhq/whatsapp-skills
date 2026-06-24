# Python — Twilio → Wassenger before/after

## Send text

Before (Twilio SDK):
```python
from twilio.rest import Client
client = Client(TWILIO_SID, TWILIO_TOKEN)

client.messages.create(
    from_="whatsapp:+14155238886",
    to="whatsapp:+34600111222",
    body="Your order #1234 is ready",
)
```

After (Wassenger, `requests`):
```python
import os, requests

requests.post(
    "https://api.wassenger.com/v1/messages",
    headers={"Token": os.environ["WASSENGER_API_KEY"]},
    json={
        "device": os.environ["WASSENGER_DEVICE_ID"],
        "phone": "+34600111222",          # no "whatsapp:" prefix
        "message": "Your order #1234 is ready",
    },
)
```

## Send media

```python
requests.post(
    "https://api.wassenger.com/v1/messages",
    headers={"Token": os.environ["WASSENGER_API_KEY"]},
    json={
        "device": DEVICE_ID,
        "phone": "+34600111222",
        "media": {"url": "https://example.com/receipt.pdf"},
        "caption": "Here is your receipt",
    },
)
```

## Send a template

Before:
```python
client.messages.create(
    from_="whatsapp:+14155238886",
    to="whatsapp:+34600111222",
    content_sid="HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    content_variables='{"1":"Pablo","2":"20:00"}',
)
```

After:
```python
requests.post(
    "https://api.wassenger.com/v1/messages",
    headers={"Token": os.environ["WASSENGER_API_KEY"]},
    json={
        "device": DEVICE_ID,
        "phone": "+34600111222",
        "template": {
            "name": "reservation_reminder",
            "language": "es",
            "body": [
                {"name": "1", "value": "Pablo"},
                {"name": "2", "value": "20:00"},
            ],
        },
    },
)
```

## Drop-in wrapper

```python
import os, requests

def send_message(to, body=None, media_url=None, template=None):
    payload = {
        "device": os.environ["WASSENGER_DEVICE_ID"],
        "phone": to.replace("whatsapp:", ""),
    }
    if body:
        payload["message"] = body
    if media_url:
        payload["media"] = {"url": media_url}
    if template:
        payload["template"] = template
    r = requests.post(
        "https://api.wassenger.com/v1/messages",
        headers={"Token": os.environ["WASSENGER_API_KEY"]},
        json=payload,
        timeout=15,
    )
    r.raise_for_status()
    return r.json()  # {"id": ..., "status": ...}
```

Webhook handler migration (Flask/FastAPI) is in `webhook-migration.md`.
