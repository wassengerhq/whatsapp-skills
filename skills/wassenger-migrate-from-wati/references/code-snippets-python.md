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
            "body": [                    # ORDER matches {{1}},{{2}} in the template body
                {"name": "1", "value": "John"},     # was {{name}}  → {{1}}
                {"name": "2", "value": "12345"},    # was {{ordernumber}} → {{2}}
            ],
        },
    },
)
```

> Wassenger's template payload is **not** Meta-style `components:` — it's
> `template: {name, language, header?, body: [{name, value}], button?: [...]}`.
> Each `body[]` entry is positional: `name` is the `{{N}}` index, `value` is the substitution.

## Helper: named → positional

⚠️ **Do not trust Wati's `parameters[]` array order — order by the template body.**
Wati params are named; Wassenger/Meta resolve variables by **position** (`{{1}},{{2}}`).
`ordered_names` must list the names in the order they appear in the **template body's**
`{{1}},{{2}}…` — NOT the order they sit in Wati's array.

```python
def wati_to_wassenger_params(wati_params, ordered_names):
    by_name = {p["name"]: p["value"] for p in wati_params}
    # Wassenger body param: {"name": "<{{N}} index>", "value": "<text>"}
    return [{"name": str(i + 1), "value": str(by_name.get(n, ""))}
            for i, n in enumerate(ordered_names)]
# body=wati_to_wassenger_params(wati_params, ["name", "ordernumber"])
```

## Drop-in wrapper

Pass the raw Wati `parameters[]` plus `ordered_names` (the template body's `{{1}},{{2}}…`
order); the wrapper converts them internally with the helper above.

```python
import os, requests

def send_template(phone, name, language, wati_params, ordered_names):
    r = requests.post(
        "https://api.wassenger.com/v1/messages",
        headers={"Token": os.environ["WASSENGER_API_KEY"]},
        json={
            "device": os.environ["WASSENGER_DEVICE_ID"],
            "phone": phone if phone.startswith("+") else f"+{phone}",
            # body is positional ({{1}},{{2}}…) — ordered_names fixes the order, NOT Wati's array
            "template": {"name": name, "language": language,
                         "body": wati_to_wassenger_params(wati_params, ordered_names)},
        },
        timeout=15,
    )
    r.raise_for_status()
    return r.json()
# send_template("+34600111222", "order_update", "en",
#   [{"name": "name", "value": "John"}, {"name": "ordernumber", "value": "12345"}],
#   ["name", "ordernumber"])
```
