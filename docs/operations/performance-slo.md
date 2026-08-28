# Pre-production performance gate
Local acceptance thresholds are availability p95 <300ms, booking p95 <500ms and normalized+persisted WhatsApp webhook ingestion p95 <150ms under the repository's deterministic UAT dataset. These are release regression gates, not a substitute for production telemetry; production SLOs must be reviewed after real tenant traffic is available.
