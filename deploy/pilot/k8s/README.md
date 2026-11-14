# Donovan pilot on Kubernetes (example)

Manifests for a small pilot: one namespace, the API (two replicas) and web front, a migration Job, a TLS ingress, and
network policies. They're an example to adapt, not a tested deployment: nothing here has been applied to a cluster.
See `docs/pilot-runbook.md` for the steps, what each control is for, and what has and hasn't been verified.

Apply in order, after creating the secrets (`kubectl -n donovan create secret generic …`, never committed):

1. `namespace.yaml`
2. `config.yaml` (edit the hosts first)
3. `migrate-job.yaml`, and wait for it to complete
4. `api.yaml`, `web.yaml`
5. `network-policy.yaml`
6. `ingress.yaml`

Postgres, Elasticsearch and the identity provider are managed services outside this namespace, reached privately.
