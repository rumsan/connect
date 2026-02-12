## WhatsApp via Twilio – Template & Broadcast Flow

### 1. Prerequisites

- **Twilio**: WhatsApp Business enabled, **Account SID** and **API Secret/Auth Token**.
- **Connect API base URL**: e.g. `http://localhost:3333/api/v1` (referred as `{{url}}`).
- **Environment variables** (examples):
  - `TWILIO_URL` – Twilio Content API URL (e.g. `https://content.twilio.com/v1/Content`)
  - `TWILIO_WHATSAPP_MESSAGE_SID` – Twilio Messaging Service SID
  - `TWILIO_API_SECRET` – Twilio API Secret / Auth Token
  - `TWILIO_ACCOUNT_SID` – Twilio Account SID
  - `TWILIO_WHATSAPP_AUTH` – `Basic <base64(accountSid:apiSecret)>`
  - `TWILIO_WHATSAPP_TEST_TEMPALTE_SID` – Twilio WhatsApp template SID
  - `WHATSAPP_DEV_PHONE` – WhatsApp phone number in E.164 format

**Generate `TWILIO_WHATSAPP_AUTH`:**

```bash
echo -n "accountSid:apiSecret" | base64
# Result: <BASE64_VALUE>
# Use: "Authorization": "Basic <BASE64_VALUE>"
```

---

### 2. Create Transport (Twilio WhatsApp)

Endpoint:

```http
POST {{url}}/transport
```

Body:

```json
{
  "app": "{{app-id}}",
  "name": "Whatsapp Messaging Service",
  "type": "API",
  "config": {
    "url": "{{TWILIO_URL}}",
    "body": {
      "MessagingServiceSid": "{{TWILIO_WHATSAPP_MESSAGE_SID}}",
      "To": "{%address%}",
      "ContentSid": "{%message.content%}"
    },
    "headers": {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": "{{TWILIO_WHATSAPP_AUTH}}"
    },
    "meta": {
      "provider": "twilio",
      "apiSecret": "{{TWILIO_API_SECRET}}",
      "accountSid": "{{TWILIO_ACCOUNT_SID}}",
      "capabilities": ["TEMPLATE_VERIFICATION"]
    }
  }
}
```

- **Relation**: this transport stores all Twilio config/credentials.  
  Templates and broadcasts reference its `cuid` as `transport` / `transport-id-api`.

---

### 3. Create Template (linked to transport)

Endpoint:

```http
POST {{url}}/template
```

Body example:

```json
{
  "name": "welcome_message",
  "body": "Hello {{1}}, welcome!",
  "type": "TEXT",
  "transport": "{{transport-id-api}}",
  "language": "en"
}
```

- **Relation with transport**: `transport` field is the ID of the Twilio transport.  
  Backend uses that transport’s config to call Twilio Content API and create the WhatsApp template.

---

### 4. Sync Templates & Status from Twilio

After creating templates, sync them from Twilio:

```http
POST {{url}}/template/{{transport-id-api}}/sync
```

- This fetches templates and their approval status from Twilio and updates local DB.
- When a template becomes **APPROVED**, it can be used for broadcast.

---

### 5. Send WhatsApp Broadcast

Endpoint:

```http
POST {{url}}/broadcasts
```

Body example:

```json
{
  "transport": "{{transport-id-api}}",
  "message": {
    "content": "{{TWILIO_WHATSAPP_TEST_TEMPALTE_SID}}",
    "meta": {
      "url": "test1"
    }
  },
  "addresses": ["{{WHATSAPP_DEV_PHONE}}"],
  "maxAttempts": 5,
  "trigger": "IMMEDIATE",
  "webhook": "",
  "options": {
    "scheduledTimestamp": "2026-02-09T14:02:00+05:45",
    "attemptIntervalMinutes": "5"
  }
}
```

- **transport**: same Twilio transport ID used for the template.
- **message.content**: Twilio WhatsApp template SID.
- **addresses**: recipient WhatsApp numbers.
- **trigger**:
  - `IMMEDIATE` – send now.
  - `SCHEDULED` – use `options.scheduledTimestamp` and `attemptIntervalMinutes`.
