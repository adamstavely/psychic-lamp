/** A stable id for a seeded artifact, from its name: "Rollout note — Fraud Sentinel v3.2" → "rollout-note-fraud-sentinel-v3-2". */
export function artifactId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
