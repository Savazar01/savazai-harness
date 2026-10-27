/**
 * Internal backend client helper providing authentication headers (x-internal-secret)
 * for secure service-to-service communication between savazai-console and savazai-backend.
 */
export function getInternalBackendHeaders(
  extraHeaders: Record<string, string> = {}
): Record<string, string> {
  const secret =
    process.env.MASTER_VAULT_SECRET ||
    "sz_dev_master_secret_key_2026_change_in_production_!!";

  return {
    "x-internal-secret": secret,
    ...extraHeaders,
  };
}
