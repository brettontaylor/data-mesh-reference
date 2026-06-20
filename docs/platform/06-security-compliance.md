# 06 — Security & Compliance

Security posture: **deny-by-default, least privilege, defense in depth, auditable
everything**. Compliance bar (D7): immutable audit + segregation of duties, with
GDPR / BCBS 239 / retention designed as drop-in extensions.

## 1. Authentication (D4)

- **Humans:** OIDC Authorization Code + PKCE against the corporate IdP (Entra ID /
  Okta / Ping). SAML 2.0 supported via adapter for IdPs that require it. Sessions
  are short-lived JWTs with refresh; httpOnly + SameSite cookies for the web app.
- **Machines:** API keys bound to a **service principal** with explicit role+domain
  scopes and expiry; keys are hashed at rest, shown once, rot, and revocable.
  mTLS optional for high-trust service-to-service.
- **Databricks:** the app authenticates to Databricks via OAuth (workspace service
  principal) or PAT (adapter), least-privilege scoped to the catalogs/jobs it manages.
- **No local password store.** Identity is always the IdP (no shadow accounts),
  except a sealed bootstrap admin used only for first-run, auto-disabled after IdP
  is configured.

## 2. Authorization

Layered (precedence top-to-bottom):

1. **Deny by default.** No grant → no access.
2. **Domain scope.** Principals act within domains they belong to (RBAC role can be
   domain-scoped: steward of `trading`).
3. **Role capability (RBAC).** Coarse actions (read/propose/approve/deploy/admin) —
   see [03 §6.1](03-governance-workflows.md#61-roles-coarse-grained-rbac).
4. **Attribute mask (ABAC).** Field-level visibility via the PII/MNPI + tier engine;
   the caller's clearance is derived from IdP groups → policy.
5. **Row-Level Security (defense in depth).** Postgres RLS on `model`, `model_field`,
   read views enforces domain + clearance even if the app layer is bypassed.

All authorization decisions on sensitive data emit audit events with the rule that
fired (auditable "why was this masked/allowed").

## 3. Secrets management

- **Never in code or Git.** `.env.example` only; real values from the org secret
  manager via a **SecretsProvider** adapter (Vault / AWS Secrets Manager / Azure Key
  Vault / Databricks secrets / k8s secrets).
- Secrets needed: DB creds, Redis, IdP client secret, Git provider token (a bot
  identity), Databricks OAuth creds, webhook signing keys, audit-chain pepper.
- **Rotation:** all secrets rotatable without redeploy (read at use, short cache);
  Git bot token and Databricks creds rotate on a schedule.
- **Bot identity:** the platform commits the lockfile + generated docs as a dedicated
  machine user with narrowly-scoped repo rights; its actions are audited and
  distinguishable from humans.

## 4. Network & data protection

- **In transit:** TLS everywhere; corporate CA; HSTS; modern cipher suites.
- **At rest:** Postgres + object store encryption (cloud-managed KMS); audit WORM
  bucket with Object Lock optional.
- **Egress control:** the app's only outbound dependencies are the Git provider,
  Databricks, the IdP, the secret manager, and notification channels — all
  allow-listed; supports PrivateLink/VNet/peering inside the corporate perimeter.
- **No raw business data at rest in the platform.** Harbormaster stores *metadata*;
  data-product "data" endpoints proxy governed reads from Databricks/warehouse and
  are not persisted (beyond short caches honoring classification).

## 5. Immutable audit (D7) — recap + verification

- Append-only, hash-chained `audit_event` (see [02](02-domain-model.md) /
  [03 §7](03-governance-workflows.md#7-immutable-audit-log-d7)).
- A scheduled **chain verifier** recomputes hashes and alarms on any break.
- Events mirrored to SIEM (CloudEvents) and optionally WORM storage.
- Audit is **read-restricted** (governance/admin) and itself access-audited.

## 6. Segregation of duties (D7) — enforcement points

| Control | Enforced at |
|---------|-------------|
| No self-approval | governance service + Git branch protection (required reviews, no self-approve) |
| Quorum by risk/sensitivity | governance policy matrix (server-side) + required Git checks |
| Author ≠ deployer for prod | orchestration service + deploy ChangeSet |
| Separate control approval for PII/MNPI/policy changes | governance quorum rule |
| Break-glass dual-control + time-box | admin service, high-sev audit + alert |

Defense in depth: even a compromised app session cannot bypass Git branch
protection, and even a Git-side bypass cannot bypass the server-side merge gate.

## 7. Threat model (STRIDE summary)

| Threat | Example | Mitigation |
|--------|---------|------------|
| **Spoofing** | Forged identity/token | OIDC/PKCE, short JWTs, mTLS option, signed webhooks |
| **Tampering** | Edit a model out-of-band; alter audit | Git SoR + signed commits; append-only hash-chained audit; reconcile drift alerts |
| **Repudiation** | "I didn't approve that" | Immutable audit, IdP-bound identity, PR + approval records |
| **Information disclosure** | PII/MNPI leak via API | ABAC masking everywhere, RLS, deny-by-default, no data at rest, audited access |
| **Denial of service** | API/job flooding | Rate limits per principal, job concurrency caps, circuit breakers, autoscale |
| **Elevation of privilege** | Self-grant a role | Roles only via IdP groups; admin actions dual-controlled + audited |
| **Supply chain** | Malicious dep | Pinned lockfiles, SCA scan, SBOM, signed images, provenance (SLSA) |
| **Secret leakage** | Key in repo/logs | Secret scanning in CI, secrets adapter, log redaction, banned-term scan |

## 8. Application hardening

- Input validation at the edge (JSON Schema); output encoding; CSRF tokens; strict
  CORS; CSP; security headers; no eval; safe YAML loading (no arbitrary tags).
- Dependency hygiene: lockfiles, `npm audit`/SCA in CI, Dependabot/Renovate, SBOM
  (CycloneDX), container image signing (cosign), minimal distroless base image.
- Tenant isolation: domain scoping + RLS; per-tenant rate limits.
- Least-privilege Databricks + Git tokens; rotate; scope to needed catalogs/paths.
- Backups encrypted; restore tested; audit chain part of backup.

## 9. Privacy & data residency (GDPR/CCPA — extension hooks)

Designed in even though it's a later add-on:
- Fields already carry PII; the model can carry **purpose** and **lawful-basis**
  tags (additive). RTBF propagation = a job that, given a subject key, traces
  lineage to find affected gold/serving locations and issues delete tasks downstream
  (the platform records the *map*; deletion executes in the warehouse).
- **Residency:** domains/products can declare a region; orchestration deploys only to
  matching Databricks targets; the projection can be sharded per region.

## 10. Regulatory mapping (how the design satisfies controls)

| Control area | How Harbormaster addresses it |
|--------------|-------------------------------|
| Change management / SoX | Maker/checker, quorum, immutable audit, Git history, no self-approval |
| BCBS 239 (lineage/quality) | Column-level lineage (static + OpenLineage), DQ contracts + run evidence, ownership |
| Access governance | Classification-driven ABAC, RLS, audited grants, deny-by-default |
| Auditability | Hash-chained append-only log, SIEM stream, exportable signed bundles |
| Data privacy (extension) | PII/purpose tags, RTBF lineage map, residency targets |
| Retention/legal hold (extension) | WORM audit option; retention config; export/e-discovery API |

## 11. Compliance evidence & reporting

Built-in governance dashboards + exportable reports: classification coverage,
unapproved/over-due changes, models without owners, SLA breaches, lineage
completeness, audit-chain integrity, and a per-change "evidence bundle" (PR,
approvals, gates, diff, merge SHA) auditors can pull on demand.
