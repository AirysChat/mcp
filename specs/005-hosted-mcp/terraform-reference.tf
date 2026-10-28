# Reference Terraform for `airys-platform/infra` (REM-07)
#
# Copy the two blocks below into `~/airys-platform/infra/modules/ci-identity/main.tf`
# and `~/airys-platform/infra/modules/platform/mcp.tf` (+ `edge.tf` host rule)
# to provision the Cloud Run `mcp` service, serverless NEG, backend service, and
# GitHub Actions WIF provider for `AirysChat/mcp`.
#
# Immutable GitHub IDs for `AirysChat/mcp` (verified via `gh api repos/AirysChat/mcp`):
#   repository_owner_id = "280315842"   (AirysChat)
#   repository_id       = "1435073798"  (AirysChat/mcp)

# ---------------------------------------------------------------------------
# 1. `infra/modules/ci-identity/main.tf` — WIF provider for AirysChat/mcp
# ---------------------------------------------------------------------------

resource "google_iam_workload_identity_pool_provider" "airyschat_mcp" {
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "airyschat-mcp"
  display_name                       = "AirysChat/mcp repository"

  attribute_mapping = {
    "google.subject"          = "assertion.sub"
    "attribute.repository_id" = "assertion.repository_id"
    "attribute.ref"           = "assertion.ref"
  }

  attribute_condition = join(" && ", [
    "assertion.repository_owner_id == '280315842'",
    "assertion.repository_id == '1435073798'",
    "assertion.event_name != 'pull_request_target'",
  ])

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# ---------------------------------------------------------------------------
# 2. `infra/modules/platform/mcp.tf` — Cloud Run `mcp` service + Edge wiring
# ---------------------------------------------------------------------------

locals {
  mcp_domains = [for domain in var.edge_domains : domain if startswith(domain, "mcp.")]
  mcp_enabled = local.edge_enabled && length(local.mcp_domains) > 0
}

resource "google_service_account" "mcp" {
  project      = var.project_id
  account_id   = "run-mcp"
  display_name = "Cloud Run service mcp"
}

resource "google_service_account_iam_member" "deployer_runs_as_mcp" {
  service_account_id = google_service_account.mcp.name
  role               = "roles/iam.serviceAccountUser"
  member             = var.deployer_member
}

resource "google_cloud_run_v2_service" "mcp" {
  project             = var.project_id
  name                = "mcp"
  location            = var.region
  description         = "AirysChat Hosted MCP Server (Streamable HTTP, stateless)"
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = var.deletion_protection
  invoker_iam_disabled = true

  template {
    service_account                  = google_service_account.mcp.email
    max_instance_request_concurrency = 80
    timeout                          = "60s"

    scaling {
      min_instance_count = 0
      max_instance_count = var.api_max_instances
    }

    containers {
      image = local.placeholder_image

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      env {
        name  = "AIRYSCHAT_DEFAULT_INSTANCE"
        value = var.environment == "prod" ? "airys.chat" : "staging"
      }

      env {
        name  = "AIRYSCHAT_FEATURES"
        value = var.environment == "prod" ? "stable" : "beta"
      }

      startup_probe {
        period_seconds    = 2
        timeout_seconds   = 1
        failure_threshold = 15
        http_get {
          path = "/healthz"
        }
      }

      liveness_probe {
        period_seconds = 30
        http_get {
          path = "/healthz"
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [
      client,
      client_version,
      template[0].containers[0].image,
    ]
  }

  depends_on = [google_project_service.platform]
}

resource "google_compute_region_network_endpoint_group" "mcp" {
  count = local.mcp_enabled ? 1 : 0

  project               = var.project_id
  name                  = "mcp"
  region                = var.region
  network_endpoint_type = "SERVERLESS"

  cloud_run {
    service = google_cloud_run_v2_service.mcp.name
  }
}

resource "google_compute_backend_service" "mcp" {
  count = local.mcp_enabled ? 1 : 0

  project               = var.project_id
  name                  = "mcp"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  protocol              = "HTTPS"
  security_policy       = google_compute_security_policy.edge[0].id

  backend {
    group = google_compute_region_network_endpoint_group.mcp[0].id
  }

  log_config {
    enable      = true
    sample_rate = 1
  }
}

# In `google_compute_url_map.edge` (`edge.tf`), add:
#
#   dynamic "host_rule" {
#     for_each = local.mcp_enabled ? [1] : []
#     content {
#       hosts        = local.mcp_domains
#       path_matcher = "mcp"
#     }
#   }
#
#   dynamic "path_matcher" {
#     for_each = local.mcp_enabled ? [1] : []
#     content {
#       name            = "mcp"
#       default_service = google_compute_backend_service.mcp[0].id
#     }
#   }
