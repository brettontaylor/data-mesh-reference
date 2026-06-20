# Optional IaC for the data-plane side DEAL Control Tower governs (illustrative).
# Provisions the Unity Catalog namespaces + a service principal the app uses.
# The control plane itself deploys via Helm (deploy/helm) or the Databricks App.

terraform {
  required_providers {
    databricks = { source = "databricks/databricks", version = "~> 1.0" }
  }
}

variable "databricks_host" { type = string }
variable "environments" {
  type    = list(string)
  default = ["dev", "staging", "prod"]
}

provider "databricks" {
  host = var.databricks_host
}

# One UC catalog per environment (dct_dev / dct_staging / dct_prod), each with a
# gold schema the platform pushes models into.
resource "databricks_catalog" "dct" {
  for_each = toset(var.environments)
  name     = "dct_${each.value}"
  comment  = "DEAL Control Tower governed catalog (${each.value})"
}

resource "databricks_schema" "gold" {
  for_each     = databricks_catalog.dct
  catalog_name = each.value.name
  name         = "gold"
  comment      = "Curated, classification-tagged serving layer"
}

# Service principal the control plane authenticates as (least privilege).
resource "databricks_service_principal" "dct" {
  display_name = "deal-control-tower"
}

output "catalogs" {
  value = [for c in databricks_catalog.dct : c.name]
}
