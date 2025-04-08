
# 📘 Connect App: Reporting Improvements – Rationale & Decisions

## 🧩 Problem Statement

The Connect app handles bulk communication (SMS, IVR, Voice, Email, etc.) across multiple organizations. Each organization operates under a unique `appId` and can run **multiple projects**. However, the current data structure doesn't support clear, structured **project-based reporting**, leading to key challenges:

- All communications are grouped under `appId`, making it hard to **segregate by project**.
- Organizations use `xref` as an ad-hoc field to associate sessions with projects, which:
  - Provides **flexibility** but lacks **relational integrity**
  - Makes **aggregations and analytics costly and unstructured**

## 🔧 Immediate Solution: Introduce `xref` Field (Flexible Grouping)

We introduced an optional `xref` field in the `Session` table to provide a **quick and non-breaking** way for organizations to group sessions by project or campaign identifiers.

### ✅ Benefits
- Quick and backward-compatible
- Gives organizations **freedom** to assign tags (like project names or codes)
- Enables immediate grouping in reports like:
  - Sessions by `xref`
  - Broadcasts by `xref`
  - Recipients & success rate by `xref`

### ❌ Limitations
- No structure or validation — possible misuse
- Poor data integrity (no control over values)
- Not optimized for performance at scale

---

## 🌱 Long-Term Solution: Introduce `Project` Table (Structured Grouping)

To improve **data integrity and enable advanced reporting**, we decided to create a `Project` model, with a proper foreign key reference in the `Session` table.

### 📐 Schema Change Overview

```prisma
model Project {
  cuid        String   @id @default(cuid())
  appId       String
  name        String
  description String?
  meta        Json?    @db.JsonB()
  Sessions    Session[]

  createdAt DateTime  @default(now())
  updatedAt DateTime? @updatedAt()
  updatedBy String    @default("system")

  @@index([appId])
  @@map("tbl_projects")
}

model Session {
  // Existing fields...
  xref        String?       // Keep for flexible use
  projectId   String?
  Project     Project?      @relation(fields: [projectId], references: [cuid])
}
```

### ✅ Benefits
- Clean and **relational** project management
- Strong validation and consistent structure
- Enables:
  - Project-specific analytics
  - Filtering and grouping in dashboards
  - Role-based access control per project (future)

### 🔄 Coexistence Plan
Both `xref` and `projectId` will **coexist**:
- `xref` gives flexibility for ad-hoc grouping
- `projectId` is encouraged for structured organizations

---

## 📋 Task Overview (Implementation Steps)

### ✅ Phase 1 – Quick Improvements
- [x] Add `xref` to `Session` model
- [x] Enable reporting by `xref`:
  - Comms logs
  - No. of sessions
  - Success rate
  - Recipient counts by transport/app/xref

### 🚀 Phase 2 – Structured Project Support
- [ ] Add `Project` model (with `appId`, name, meta)
- [ ] Update `Session` model to link with `projectId`
- [ ] Update DTOs and APIs to pass `projectId`
- [ ] Update reporting:
  - Sessions per `projectId`
  - Recipient analytics
  - Success rate grouped by `projectId`

---

## 📌 Summary

| Aspect          | xref Field                        | Project Table                      |
|-----------------|------------------------------------|------------------------------------|
| Flexibility     | ✅ High                             | ❌ Strictly defined                |
| Data Integrity  | ❌ None                            | ✅ Strong                          |
| Reporting Ease  | ❌ Costly queries                  | ✅ Optimized, indexed              |
| Use Case        | Ad-hoc tags, quick filters         | Core project-based structure       |
| Recommendation  | Optional, for simple groupings     | Preferred, for structured teams    |

---

Let me know if you'd like this as a downloadable file (Markdown or PDF), or added to your repo’s `/docs` folder as a dev reference.