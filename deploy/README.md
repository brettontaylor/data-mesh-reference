# Deploying Mapping and Metadata Platform

Three ways to stand it up, smallest → production. All share one image
(`deploy/docker/Dockerfile`); `ROLE` selects `api | web | worker | all`.

## 1. Local / minimal (one command)

```bash
docker compose -f deploy/docker/docker-compose.yml up
# API → http://localhost:4400   UI → http://localhost:4500
```

Brings up API + web + Postgres + Redis. The API seeds the projection from the
bundled models on first boot (no manual DB/schema steps). Without Docker:

```bash
corepack pnpm install
pnpm --filter @dct/api start        # API :4400 (in-memory store, dev-auth)
DCT_API_URL=http://localhost:4400 pnpm --filter @dct/web start   # UI :4500
```

## 2. Kubernetes (production, HA)

```bash
# create the secret first (DB URL, GitLab token, OIDC, Databricks creds)
kubectl create secret generic dct-secrets \
  --from-literal=DATABASE_URL=... --from-literal=GITLAB_TOKEN=... \
  --from-literal=OIDC_ISSUER=... --from-literal=DATABRICKS_HOST=... --from-literal=DATABRICKS_TOKEN=...

helm install dct deploy/helm \
  --set image.repository=<registry>/mapping-metadata-platform --set ingress.host=dct.internal.example.com
```

API/web scale independently (HPA-ready); managed Postgres/Redis; ingress with
corporate TLS + OIDC. Set `config.DEV_AUTH=false` and `OIDC_ISSUER` for SSO.

## 3. Databricks App (inside the workspace perimeter)

```bash
databricks apps deploy mapping-metadata-platform --source-code-path deploy/databricks-app
```

See [databricks-app/app.yaml](databricks-app/app.yaml). Inherits Databricks auth +
networking; Postgres is a managed instance.

## Configuration

All via env (see [`.env.example`](../.env.example)); secrets from your secret
manager. Key switches:

| Var | Effect |
|-----|--------|
| `GIT_PROVIDER` | `local` (filesystem) or `gitlab` (models SoR) |
| `DATABASE_URL` | unset → in-memory projection; set → Postgres |
| `DEV_AUTH` | `true` local only; `false` + `OIDC_ISSUER` for SSO |
| `DATABRICKS_HOST/TOKEN` | enable the Databricks orchestrator + Unity Catalog sync |

## Models repo CI

Add [`gitlab-ci.models.yml`](gitlab-ci.models.yml) as `.gitlab-ci.yml` in your
models repo so direct-to-Git changes pass the same governance gates, and enable
branch protection (required approvals, no self-approve, required checks).

## Data-plane IaC (optional)

[`terraform/`](terraform/main.tf) provisions the Unity Catalog namespaces and the
service principal the control plane uses.
