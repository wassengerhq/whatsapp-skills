# Python — Wati → Wassenger before/after

## Free-form (session) message

Before (Wati — form-data, recipient in URL):
```python
import os, requests

requests.post(
    "https://live-server-12345.wati.io/api/v1/sendSessionMessage/34600111222",
    headers={"Authorization": f"Bearer {os.environ['WATI_TOKEN']}"},
    data={"messageText": "Your order #1234 is ready"},   # form-encoded
)
```

After (Wassenger — JSON, device + phone in body):
```python
import os, requests

requests.post(
    "https://api.wassenger.com/v1/messages",
    headers={"Token": os.environ["WASSENGER_API_KEY"]},
    json={
        "device": os.environ["WASSENGER_DEVICE_ID"],
        "phone": "+34600111222",          # E.164, was in the URL
        "message": "Your order #1234 is ready",
    },
)
```

## Template message (named → positional)

Before (Wati):
```python
requests.post(
    "https://live-server-12345.wati.io/api/v1/sendTemplateMessage",
    params={"whatsappNumber": "34600111222"},
    headers={"Authorization": f"Bearer {os.environ['WATI_TOKEN']}"},
    json={
        "template_name": "order_update",
        "broadcast_name": "order_update",
        "parameters": [
            {"name": "name", "value": "John"},
            {"name": "ordernumber", "value": "12345"},
        ],
    },
)
```

After (Wassenger):
```python
requests.post(
    "https://api.wassenger.com/v1/messages",
    headers={"Token": os.environ["WASSENGER_API_KEY"]},
    json={
        "device": os.environ["WASSENGER_DEVICE_ID"],
        "phone": "+34600111222",
        "template": {
            "name": "order_update",
            "language": "en",            # required (Wati inferred it)
            "components": [{
                "type": "body",
                "parameters": [          # ORDER matches {{1}},{{2}} in the template
                    {"type": "text", "text": "John"},     # was "name"
                    {"type": "text", "text": "12345"},    # was "ordernumber"
                ],
            }],
        },
    },
)
```

## Helper: named → positional

```python
def wati_to_wassenger_params(wati_params, ordered_names):
    by_name = {p["name"]: p["value"] for p in wati_params}
    return [{"type": "text", "text": str(by_name.get(n, ""))} for n in ordered_names]
# components=[{"type":"body","parameters": wati_to_wassenger_params(p, ["name","ordernumber"])}]
```

## Drop-in wrapper

```python
import os, requests

def send_template(phone, name, language, params):
    r = requests.post(
        "https://api.wassenger.com/v1/messages",
        headers={"Token": os.environ["WASSENGER_API_KEY"]},
        json={
            "device": os.environ["WASSENGER_DEVICE_ID"],
            "phone": phone if phone.startswith("+") else f"+{phone}",
            "template": {"name": name, "language": language,
                         "components": [{"type": "body", "parameters": params}]},
        },
        timeout=15,
    )
    r.raise_for_status()
    return r.json()
```
