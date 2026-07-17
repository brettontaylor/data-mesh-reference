# Medallion Architecture — Knowledge Base

Reference document for building on a Bronze → Silver → Gold data architecture.

---

## Layer Definitions

### Bronze (Raw / Landing)
**Purpose:** Faithful copy of source data. No transformations, no business logic.

**Rules:**
- Data arrives as-is from source systems
- Preserve original schema, types, and values (including nulls, duplicates, errors)
- Append-only (never update or delete source records)
- Track ingestion metadata: source, timestamp, batch ID
- Application code should NEVER read from Bronze directly

**Common patterns:**
- File drops (CSV, JSON, Parquet)
- API fetch results
- Message queue consumers
- Database CDC (change data capture) streams

### Silver (Curated / Conformed)
**Purpose:** Cleaned, validated, deduplicated, and conformed data. Single source of truth.

**Rules:**
- Deduplication on defined business keys
- Data type validation and casting
- Null handling (defaults, rejection, flagging)
- Cross-source joining and entity resolution
- PII masking/tokenization happens HERE (before Gold)
- Schema is stable and documented (contracts)
- Referential integrity enforced

**Common transformations:**
- Merge duplicate customer records
- Validate email formats, phone numbers
- Parse dates into consistent format
- Join CRM contacts with order history
- Mask SSN, tokenize email addresses

### Gold (Serving / Business)
**Purpose:** App-ready data optimized for consumption. Business metrics, aggregations, views.

**Rules:**
- No raw or un-validated data
- No PII in clear text (must be masked/removed by Silver)
- Optimized for query patterns (denormalized where appropriate)
- Business logic lives here (calculated fields, segments, scores)
- API endpoints read from Gold only
- Dashboard queries hit Gold only

**Common patterns:**
- Revenue aggregations by time period
- Customer segments and scores
- Pre-computed dashboard metrics
- Search-optimized views
- Report-ready datasets

---

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Fix |
|-------------|-------------|-----|
| App reads Bronze directly | Raw data is dirty, schema may change | Read from Gold; pipeline handles transformations |
| Business logic in Bronze ingestion | Couples ingestion to business rules | Keep Bronze dumb; logic goes to Silver or Gold |
| PII in Gold | Compliance violation, data leak risk | Mask/remove in Silver before Gold promotion |
| Skipping Silver (Bronze→Gold) | No validation, no dedup, no audit trail | Always pass through Silver for data quality |
| Gold with mutable source records | Breaks reproducibility | Gold derived from immutable Silver |
| Cross-layer joins in queries | Bypasses data contracts | Join at Silver, serve from Gold |
| Hardcoded table names in app | Breaks when schema evolves | Use configuration or view abstraction |
| No lineage tracking | Can't debug data issues | Track source→transform→output at each layer |

---

## Data Contracts

A contract between layers is an explicit agreement on:

```
Contract: [Source Layer] → [Target Layer]
- Input schema: fields, types, nullability
- Deduplication key: [field(s)]
- Validation rules: [constraints]
- PII handling: [per-field policy]
- Output schema: fields, types, guarantees
- Freshness SLA: [how often, max staleness]
- Owner: [team/person responsible]
```

**Why contracts matter:**
- Breaking changes are detected at build/test time, not production
- Teams can evolve layers independently as long as contracts hold
- New consumers know exactly what guarantees they get
- Debugging is faster (contract violation = clear signal)

---

## Testing by Layer

| Layer | Test Focus | Example |
|-------|-----------|---------|
| Bronze | Ingestion correctness | "CSV with 10K rows produces 10K Bronze records" |
| Bronze | Schema preservation | "All source columns present, no silent drops" |
| Silver | Deduplication | "3 duplicate records produce 1 Silver record" |
| Silver | Validation | "Invalid email → record flagged, not silently accepted" |
| Silver | PII masking | "SSN field is hashed in Silver output" |
| Gold | Aggregation | "Sum of daily revenue = monthly revenue total" |
| Gold | No PII | "Email field not present in Gold customer table" |
| E2E | Pipeline | "New Bronze record appears in Gold within SLA" |
| Contract | Schema check | "Gold schema matches documented contract" |

---

## Building Apps on Top of Gold

When users build applications on the medallion architecture:

### Access Pattern
```
User App → API Layer → Gold Layer (read-only)
                    → Silver Layer (via pipeline, never direct write)
```

### Self-Service Principles
1. **Users read from Gold only** — never Bronze or Silver
2. **New data sources go through pipeline** — Bronze ingestion, Silver transform, Gold promotion
3. **Schema discovery** — provide a catalog of available Gold tables/views with documentation
4. **Access control** — role-based access to Gold datasets (not all users see all data)
5. **Freshness transparency** — users know when data was last refreshed
6. **Lineage visibility** — users can trace any Gold metric back to its Bronze source

### App Development Guardrails
- Apps must not write to any medallion layer directly
- Apps must handle stale data gracefully (show last-refresh timestamp)
- Apps must respect PII boundaries (Gold should have none, but defense-in-depth)
- Apps should use parameterized queries (never string interpolation)
- Apps should paginate large result sets from Gold
