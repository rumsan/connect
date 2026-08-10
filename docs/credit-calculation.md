# RS Connect — Credit Calculation Guide

## Terminology

### Session
A **session** represents a single broadcast request. When you send a message to a group of recipients, that entire operation is one session. A session is tied to one transport (e.g., Voice, SMS, or Email) and contains one or many broadcasts.

- Status lifecycle: `NEW` → `PENDING` → `COMPLETED` / `FAILED`
- Contains the message payload (body/content) shared by all broadcasts in the session.
- Linked to an `app` (the client application) and optionally an `xref` (external reference for grouping).

### Broadcast
A **broadcast** is a single message delivery to one recipient address. If a session targets 500 phone numbers, there are 500 broadcasts.

- Status lifecycle: `PENDING` → `SUCCESS` / `FAIL`
- Only broadcasts with status `SUCCESS` consume credits.
- A broadcast may be retried; it is marked `isComplete: true` once it reaches a terminal state.

### Message
The **message** is the content payload attached to a session — the SMS text body, voice audio reference, or email body. All broadcasts within a session share the same message.

### Message Segment (SMS)
An SMS **segment** is a fixed-size chunk of text that a carrier treats as one billable unit. A single SMS can span multiple segments depending on character encoding and length:

| Encoding | Characters per Segment | When Used |
|----------|----------------------|-----------|
| **GSM-7** | **160** characters | Standard ASCII text, basic Latin, digits, common punctuation |
| **Unicode (UCS-2)** | **70** characters | Any text containing non-GSM-7 characters (e.g., Devanagari, emoji, CJK) |

**Segment formula:** `segments = ceil(character_count / characters_per_segment)`

**Examples:**
- "Hello, your appointment is confirmed." → 37 chars, GSM-7 → **1 segment**
- "Your OTP is 483920. Do not share this code with anyone. This code expires in 10 minutes." → 89 chars, GSM-7 → **1 segment**
- A 200-character English message → GSM-7 → `ceil(200/160)` = **2 segments**
- "तपाईंको अपोइन्टमेन्ट पुष्टि भयो" → 34 chars, Unicode → **1 segment**
- A 150-character Nepali message → Unicode → `ceil(150/70)` = **3 segments**

**GSM-7 character set includes:** Basic ASCII (0x20–0x7E), extended Latin (0xA0–0xFF), newline/carriage return, and the Euro sign (€).

### Duration (Voice)
**Duration** is the length of a voice call in **seconds**, extracted from the Asterisk CDR (Call Detail Record) after the call ends. Only calls with disposition `ANSWERED` contribute duration.

### Call Disposition (Voice)
The outcome of a voice call attempt:

| Disposition | Meaning |
|-------------|---------|
| `ANSWERED` | Call was picked up — duration is recorded |
| `NO ANSWER` | Rang but nobody answered |
| `BUSY` | Line was busy |
| `REJECTED` | Call was rejected by the callee |
| `NOT FOUND` | Number not reachable or invalid |
| `CONGESTION` | Network congestion |
| `FAILED` | Call failed at the trunk/carrier level |

### Credit
A **credit** is the abstract billing unit in RS Connect. The number of credits consumed depends on the transport's configured **unit type** and **rate** (creditPerUnit).

### Credit Unit Type
Each transport is configured with a unit type that determines what gets counted:

| Unit Type | What It Counts | Typical Transport |
|-----------|---------------|-------------------|
| `MESSAGE` | Number of successful broadcasts | Email, simple SMS |
| `SEGMENT` | Total SMS segments across all successful broadcasts | SMS |
| `API_CALL` | Number of successful API calls | API-based transports |
| `SECOND` | Total call duration in seconds | Voice |
| `MINUTE` | Total call duration rounded up to minutes | Voice |

### Transport Pricing
Each transport has a **pricing configuration** that defines:
- **creditPerUnit** — the rate charged per unit (Decimal with up to 6 decimal places)
- **unitType** — what unit to measure (MESSAGE, SEGMENT, SECOND, MINUTE, API_CALL)
- **currency** — the currency label (e.g., "NPR", "USD")

---

## Credit Calculation by Transport Type

### SMS Credits

**Unit types:** `SEGMENT` or `MESSAGE`

#### When unit type is SEGMENT (recommended for SMS)

```
segments_per_message = ceil(character_count / chars_per_segment)
total_segments       = segments_per_message × successful_broadcast_count
credits              = creditPerUnit × total_segments
```

**Worked example:**
- Message: "तपाईंको अपोइन्टमेन्ट पुष्टि भयो। कृपया समयमा आउनुहोस्।" (62 chars, Unicode)
- Recipients: 100 phone numbers
- Successful deliveries: 95
- Segments per message: `ceil(62 / 70)` = 1
- Total segments: `1 × 95` = 95
- Pricing: 1.0 credit per segment
- **Credits used: 95.0**

**Another example (multi-segment):**
- Message: 250-character English text (GSM-7)
- Successful deliveries: 200
- Segments per message: `ceil(250 / 160)` = 2
- Total segments: `2 × 200` = 400
- Pricing: 0.5 credits per segment
- **Credits used: 200.0**

#### When unit type is MESSAGE

```
credits = creditPerUnit × successful_broadcast_count
```

Segment count is ignored. Each successful delivery costs the same regardless of message length.

---

### Voice Credits

**Unit types:** `SECOND` or `MINUTE`

Voice credit calculation is **deferred** until CDR (Call Detail Record) data arrives from Asterisk, because duration is only known after the call ends.

#### When unit type is SECOND

```
total_duration_sec = sum of duration (seconds) across all successful broadcasts
credits            = creditPerUnit × total_duration_sec
```

#### When unit type is MINUTE

```
total_duration_sec = sum of duration (seconds) across all successful broadcasts
credits            = creditPerUnit × ceil(total_duration_sec / 60)
```

Note: The minute calculation uses `ceil()` on the **total** duration across all calls, not per-call rounding.

**Worked example (per-minute billing):**
- Session: 50 voice broadcasts
- Successful calls: 30 (20 went unanswered/failed — no credits)
- Call durations: vary per call, total = 742 seconds
- Pricing: 1.0 credit per minute
- Minutes: `ceil(742 / 60)` = 13
- **Credits used: 13.0**

**Key behaviors:**
- Only broadcasts with `status = SUCCESS` contribute duration.
- Calls that are not answered (`NO ANSWER`, `BUSY`, `REJECTED`, etc.) have zero duration and consume zero credits.
- Usage recording waits for CDR data: if a session completes but CDR hasn't arrived yet, credit calculation is deferred until the `broadcast.voice.usage_ready` event fires.

---

### Email Credits

**Unit type:** `MESSAGE`

```
credits = creditPerUnit × successful_broadcast_count
```

Each successfully delivered email counts as one message regardless of email size, attachments, or content length.

**Worked example:**
- Session: 1,000 email broadcasts
- Successful deliveries: 980
- Pricing: 1.0 credit per message
- **Credits used: 980.0**

---

## Credit Calculation Summary Table

| Transport | Unit Type | Formula | Only Successful? |
|-----------|-----------|---------|:----------------:|
| SMS | SEGMENT | `rate × (segments_per_msg × success_count)` | Yes |
| SMS | MESSAGE | `rate × success_count` | Yes |
| Voice | SECOND | `rate × total_duration_seconds` | Yes |
| Voice | MINUTE | `rate × ceil(total_duration_seconds / 60)` | Yes |
| Email | MESSAGE | `rate × success_count` | Yes |
| API | API_CALL | `rate × success_count` | Yes |

**Failed broadcasts never consume credits.**

---

## Usage Tracking

Credits are aggregated into daily **UsageSnapshot** records, grouped by:
- **app** — the client application
- **xref** — external reference (optional grouping key)
- **transportCuid** — the specific transport used
- **date** — the calendar day (UTC)

Each snapshot tracks:

| Field | Description |
|-------|-------------|
| `sessionCount` | Number of sessions |
| `broadcastCount` | Total broadcasts (success + fail) |
| `successCount` | Successful broadcasts |
| `failCount` | Failed broadcasts |
| `totalCharacters` | Total characters (SMS only, across all successful broadcasts) |
| `totalSegments` | Total SMS segments (across all successful broadcasts) |
| `totalDurationSec` | Total call duration in seconds (Voice only) |
| `totalCalls` | Number of successful calls (Voice only) |
| `creditsUsed` | Total credits consumed |
| `sessionCuids` | Array of session IDs included in this snapshot |

---

## Event Flow for Credit Calculation

```
Session completes (all broadcasts reach terminal state)
    │
    ├─── SMS / Email / API
    │       │
    │       └─→ Calculate credits immediately
    │           segments = getSmsSegments(message.body) × successCount  [SMS only]
    │           credits  = calculateCredits(pricing, successCount, segments, 0)
    │           └─→ Upsert UsageSnapshot
    │
    └─── Voice
            │
            ├─→ Any successful broadcasts?
            │     ├─ No  → Calculate immediately (0 duration, 0 credits)
            │     └─ Yes → Defer until CDR data arrives
            │
            └─→ CDR arrives for all successful broadcasts
                  │
                  └─→ 'broadcast.voice.usage_ready' event fires
                        duration = sum of all successful broadcast durations
                        credits  = calculateCredits(pricing, successCount, 0, duration)
                        └─→ Upsert UsageSnapshot
```
