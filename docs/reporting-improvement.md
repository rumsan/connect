# 📘 Connect App: Reporting Improvements – Rationale & Decisions

## 🧩 Problem Statement

The Connect app handles bulk communication (SMS, IVR, Voice, Email, etc.) across multiple organizations. Each organization operates under a unique `appId` and can run **multiple projects**. However, the current data structure doesn't support clear, structured **project-based reporting**, leading to the following challenges:

- All communications are grouped under `appId`, making it hard to **segregate reports by project**.

---

## 🔧 Immediate Solution: Introduce `xref` Field (Flexible Grouping)

We introduced an optional `xref` field in the `Session` table to provide a **quick and non-breaking** way for organizations to group sessions by project or campaign identifiers.

### ✅ Benefits
- Quick and backward-compatible
- Gives organizations **freedom** to assign arbitrary grouping labels (e.g., project names or campaign codes)
- Enables immediate reporting filters such as:
  - Sessions by `xref`
  - Broadcasts by `xref`
  - Recipients & success rate by `xref`

### ❌ Limitations
- No structure or validation — possible misuse
- Poor data integrity (no control over values)
- Not optimized for performance at scale

---

## 🌱 Long-Term Solution: Introduce `Project` Table (Structured Grouping)

To enable **scalable and structured reporting**, we will introduce a dedicated `Project` model, with a foreign key reference in the `Session` table.

### 📐 Schema Design

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
  xref        String?       // Kept for flexibility
  projectId   String?
  Project     Project?      @relation(fields: [projectId], references: [cuid])
}
```

### ✅ Benefits
- Clean, **relational grouping**
- Enables robust **analytics and dashboards**
- Better **data governance**
- Supports:
  - Role-based access per project
  - Aggregated reports at project level
  - Easier joins and filters in queries

### 🔄 Coexistence Plan
We will **retain `xref`** alongside `projectId`:
- `xref` provides **lightweight, flexible grouping**
- `projectId` provides **structured, schema-based grouping**

---

## 📋 Implementation Plan

### ✅ Phase 1 – Quick Improvements
- [x] Add `xref` to `Session` model
- [x] Enable `xref`-based reporting:
  - Comms logs by `xref`
  - No. of sessions by `xref`
  - Success rate by `xref`
  - Recipient counts (per transport/app/xref)

### 🚀 Phase 2 – Structured Project Support
- [ ] Add `Project` model (with `appId`, name, meta)
- [ ] Update `Session` model to support `projectId`
- [ ] Update DTOs/APIs to pass `projectId`
- [ ] Enhance reporting engine:
  - Sessions grouped by `projectId`
  - Recipient breakdown
  - Project-based success/failure rates

---

## 🏷️ Tags vs `xref` vs `projectId`: Final Decision

During the planning of improved reporting, we evaluated whether to introduce **`tags`** for session-level categorization.

### 📌 Rationale:
- **`xref`** already acts as a single-tag-like field for **lightweight grouping**
- **`projectId`** will offer **structured and relational** grouping
- Together, they **cover nearly all use cases** that tags would serve

### ✅ Decision:
- **We will not introduce a `tags` field** for now
- Instead:
  - Keep `xref` as a flexible grouping key
  - Promote `projectId` for structured use cases
- We may revisit tags if **multi-dimensional or multi-label tagging** becomes necessary in the future

---

## 📌 Summary Comparison

| Feature         | `xref` Field                         | `Project` Table                      |
|----------------|---------------------------------------|--------------------------------------|
| **Flexibility**     | ✅ High                               | ❌ Strictly defined                  |
| **Data Integrity**  | ❌ None                              | ✅ Strong                            |
| **Performance**     | ❌ Costly for large datasets         | ✅ Optimized, indexed                |
| **Use Case**        | Ad-hoc groupings, campaigns         | Core project-based segmentation      |
| **Recommended for** | Lightweight usage, flexibility      | Structured teams, advanced reporting|
