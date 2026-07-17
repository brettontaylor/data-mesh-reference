---
name: data-quality
description: |
  Read-only audit of the medallion data layer (Bronze/Silver/Gold): schema/contract
  consistency, PII handling, layer-boundary violations, transformation correctness.
  Invoke with "audit data quality", "check PII handling", "layer boundary check",
  "/data-quality".
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - AskUserQuestion
---

# /data-quality — Medallion Data Quality Audit (DCT)

Read-only audit of data-layer health across Bronze → Silver → Gold.

---

## Step 1: Discover Layer Structure

The medallion runner and its layer logic live at `packages/engine/src/medallion/`; local run
output lands at `packages/engine/generated/medallion/` (per-entity `*_bronze.json`,
`*_silver.json`, `*_gold.json`). Field classification (including PII) is declared in the
contracts at `packages/engine/contracts/` (spec + entities + sources).

```bash
# Medallion layer logic (source of truth for transforms)
ls packages/engine/src/medallion
# Generated per-layer artifacts
ls packages/engine/generated/medallion
# Contracts that classify fields
ls packages/engine/contracts packages/engine/contracts/sources
```

Map the layers:
- **Bronze (raw):** what lands unshaped from each source?
- **Silver (curated):** where are dedup / validation / type-casting / PII masking applied?
- **Gold (serving):** what is app-facing and aggregated?

---

## Step 2: Schema Contract Audit

For each transition (Bronze→Silver, Silver→Gold):

### 2a. Column consistency
- Every expected column present downstream? Types consistent (no silent casts)?
- Nullable columns handled explicitly?

### 2b. Transformation completeness
- Is every Bronze field transformed, explicitly dropped, or passed through?
- Are dedup keys and validation rules defined in the contract, not just implied in code?

### 2c. Contract as source of truth
Compare the contract classification against the generated medallion artifact:
```bash
grep -rn "classification\|pii\|sensitive\|mask" packages/engine/contracts
```
Flag any layer where the generated artifact diverges from the contract — that means
`generated/` is stale and `pnpm check` should be re-run.

---

## Step 3: PII & Sensitivity Audit

```bash
# PII-classified fields declared in contracts
grep -rin "pii\|sensitive\|email\|phone\|ssn\|account_num\|counterparty" packages/engine/contracts -l
```

For each PII-classified field:
- **Bronze:** present (expected — raw).
- **Silver:** masked/tokenized per contract policy.
- **Gold:** removed or fully masked (required — Gold is app-facing).

Flag any PII reaching Gold unmasked. **Never print the field value — cite `file:line` only.**

---

## Step 4: Layer Boundary Violations

```bash
# App code (apps/*) reading Bronze/Silver directly instead of Gold
grep -rn "bronze\|silver\|raw" apps --include="*.ts" --include="*.tsx" -l
```

Violations to flag:
- App code (`apps/api|cli|web|worker`) reading Bronze/Silver directly — apps read **Gold only**.
- App code writing Silver/Gold directly instead of via the medallion runner.
- Cross-layer joins (Bronze joined to Gold in one step).
- Pipeline skipping Silver (Bronze→Gold with no validation/masking step).

---

## Step 5: Freshness & Lineage

Check for per-layer refresh timestamps, lineage from Bronze records to Gold, and any
stale-data thresholds in the medallion logic.

---

## Step 6: Report

```
## Data Quality Audit

### Layer Structure
- Bronze / Silver / Gold: [locations, N entities each]

### Contract Violations
| Transition | Issue | Severity | Location |
|------------|-------|----------|----------|
| Silver→Gold | PII (counterparty) not masked | P0 | src/medallion/run.ts:NN |
| Bronze→Silver | contract classifies field X, generated missing it | P1 | generated/medallion/trade_silver.json |

### Boundary Violations
| File | Violation | Fix |
|------|-----------|-----|
| apps/api/...:NN | Direct Bronze read | Read Gold artifact/view instead |

### PII Status
| Field | Bronze | Silver | Gold | Status |
|-------|--------|--------|------|--------|

### Summary: N issues (X critical, Y informational)
```

---

## Rules (corporate)
- **Read-only.** Never modify contracts, generated artifacts, or medallion code.
- **Never echo actual PII values.** Reference by field name + `file:line` only.
- Respect medallion boundaries: apps read Gold only; no direct Bronze reads; no unmasked PII in Gold.
- If `generated/medallion/` diverges from the contract, note that `pnpm generate` + `pnpm check`
  are needed — the contract is the source of truth.
- **Flag, don't fix.** No network calls, no installs.
- P0 = PII in Gold unmasked or corruption risk · P1 = missing/stale contracts, boundary violations · P2 = lineage/freshness gaps.
