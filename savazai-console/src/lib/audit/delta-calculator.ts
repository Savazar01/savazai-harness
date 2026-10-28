export interface AuditFieldChange {
  field: string;
  label?: string;
  oldValue: any;
  newValue: any;
  changeType: "added" | "modified" | "removed";
  details?: Record<string, any>;
}

export interface GranularEventPayload {
  category: "COMMAND_CENTER" | "SYSTEM_ADMIN" | "BUSINESS_CENTER" | "CAPABILITY_STUDIO" | "USER_ADMIN" | "GOVERNANCE";
  action: string;
  resource: string;
  targetId: string;
  targetName: string;
  details: {
    changes: AuditFieldChange[];
    [key: string]: any;
  };
}

/**
 * Computes granular delta diffs for LLM providers (active, defaultModel, allowed models, etc.)
 */
export function calculateLlmProviderDiffs(
  oldProviders: Record<string, any> = {},
  newProviders: Record<string, any> = {}
): GranularEventPayload[] {
  const events: GranularEventPayload[] = [];
  const allProviderKeys = Array.from(new Set([...Object.keys(oldProviders), ...Object.keys(newProviders)]));

  for (const pKey of allProviderKeys) {
    const oldP = oldProviders[pKey] || {};
    const newP = newProviders[pKey] || {};
    const changes: AuditFieldChange[] = [];

    // Active status toggle
    if (Boolean(oldP.active) !== Boolean(newP.active)) {
      changes.push({
        field: "status",
        label: "Provider Status",
        oldValue: oldP.active ? "Enabled" : "Disabled",
        newValue: newP.active ? "Enabled" : "Disabled",
        changeType: "modified",
      });
    }

    // Default model change
    if (oldP.defaultModel !== newP.defaultModel && newP.defaultModel) {
      changes.push({
        field: "defaultModel",
        label: "Default Model",
        oldValue: oldP.defaultModel || "(None)",
        newValue: newP.defaultModel,
        changeType: "modified",
      });
    }

    // Endpoint change
    if (oldP.endpoint !== newP.endpoint && (oldP.endpoint || newP.endpoint)) {
      changes.push({
        field: "endpoint",
        label: "API Endpoint",
        oldValue: oldP.endpoint || "(Default)",
        newValue: newP.endpoint || "(Default)",
        changeType: "modified",
      });
    }

    // Allowed models comparison
    const oldModels: string[] = Array.isArray(oldP.models) ? oldP.models : [];
    const newModels: string[] = Array.isArray(newP.models) ? newP.models : [];

    const addedModels = newModels.filter((m) => !oldModels.includes(m));
    const removedModels = oldModels.filter((m) => !newModels.includes(m));

    for (const m of addedModels) {
      changes.push({
        field: "allowedModels",
        label: "Allowed Model Added",
        oldValue: null,
        newValue: m,
        changeType: "added",
      });
    }

    for (const m of removedModels) {
      changes.push({
        field: "allowedModels",
        label: "Allowed Model Removed",
        oldValue: m,
        newValue: null,
        changeType: "removed",
      });
    }

    // Check API key update (never log plain key)
    if (newP.apiKey && newP.apiKey !== oldP.apiKey && !newP.apiKey.includes("••••")) {
      changes.push({
        field: "apiKey",
        label: "API Key",
        oldValue: "••••••••",
        newValue: "•••••••• (Updated)",
        changeType: "modified",
      });
    }

    if (changes.length > 0) {
      const displayName = newP.name || oldP.name || pKey.toUpperCase();
      events.push({
        category: "COMMAND_CENTER",
        action: "LLM_PROVIDER_UPDATED",
        resource: "llm_providers",
        targetId: pKey,
        targetName: displayName,
        details: {
          provider: displayName,
          providerKey: pKey,
          changes,
        },
      });
    }
  }

  return events;
}

/**
 * Computes field-level diffs for general key-value objects
 */
export function computeObjectDiffs(
  oldObj: Record<string, any> = {},
  newObj: Record<string, any> = {},
  ignoredKeys: string[] = ["updatedAt", "createdAt"]
): AuditFieldChange[] {
  const changes: AuditFieldChange[] = [];
  const allKeys = Array.from(new Set([...Object.keys(oldObj), ...Object.keys(newObj)]));

  for (const k of allKeys) {
    if (ignoredKeys.includes(k)) continue;

    const oldVal = oldObj[k];
    const newVal = newObj[k];

    // If both undefined/null
    if (oldVal === undefined && newVal === undefined) continue;
    if (oldVal === null && newVal === null) continue;

    // Compare stringified representations
    const strOld = typeof oldVal === "object" ? JSON.stringify(oldVal) : String(oldVal ?? "");
    const strNew = typeof newVal === "object" ? JSON.stringify(newVal) : String(newVal ?? "");

    if (strOld !== strNew) {
      if (oldVal === undefined || oldVal === null || oldVal === "") {
        changes.push({
          field: k,
          label: formatFieldLabel(k),
          oldValue: null,
          newValue: newVal,
          changeType: "added",
        });
      } else if (newVal === undefined || newVal === null || newVal === "") {
        changes.push({
          field: k,
          label: formatFieldLabel(k),
          oldValue: oldVal,
          newValue: null,
          changeType: "removed",
        });
      } else {
        changes.push({
          field: k,
          label: formatFieldLabel(k),
          oldValue: oldVal,
          newValue: newVal,
          changeType: "modified",
        });
      }
    }
  }

  return changes;
}

function formatFieldLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}
