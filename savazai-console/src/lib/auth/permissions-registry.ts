export interface PermissionDefinition {
  resource: string;
  action: string;
  label: string;
  category:
    | "Capability Studio"
    | "Business Center"
    | "Command Center"
    | "System Admin"
    | "Agent Workspace"
    | "Documentation"
    | "Demo Requests"
    | "User Admin";
  subCategory?: string;
  description: string;
}

export const CATEGORY_LABELS: Record<string, string> = {
  "Capability Studio": "Capability Studio",
  "Business Center": "Business Center",
  "Command Center": "Command Center",
  "System Admin": "System Administration",
  "Agent Workspace": "Agent Workspace",
  Documentation: "Documentation",
  "Demo Requests": "Demo Requests",
  "User Admin": "User Admin",
};

export const PERMISSION_REGISTRY: PermissionDefinition[] = [
  // Capability Studio
  { resource: "capability_studio", action: "view", label: "View Studio Canvas", category: "Capability Studio", description: "View agentflow canvas and node structures" },
  { resource: "capability_studio", action: "create_flow", label: "Create Agentflows", category: "Capability Studio", description: "Create new agentflow graphs" },
  { resource: "capability_studio", action: "edit_flow", label: "Edit Canvas & Teams", category: "Capability Studio", description: "Modify nodes, collapsible teams, and routing" },
  { resource: "capability_studio", action: "save_draft", label: "Save Drafts", category: "Capability Studio", description: "Save draft agentflow definitions" },
  { resource: "capability_studio", action: "publish", label: "Publish Agentflows", category: "Capability Studio", description: "Publish compiled flows to production" },
  { resource: "capability_studio", action: "test_run", label: "Run Test Playground", category: "Capability Studio", description: "Execute test queries in playground" },
  { resource: "capability_studio", action: "export_json", label: "Export JSON", category: "Capability Studio", description: "Export canvas definitions as JSON" },
  { resource: "capability_studio", action: "import_json", label: "Import JSON", category: "Capability Studio", description: "Import canvas definitions from JSON" },
  { resource: "capability_studio", action: "delete_flow", label: "Delete Agentflows", category: "Capability Studio", description: "Delete agentflows from workspace" },

  // Business Center - Universal Skills
  { resource: "business_center", action: "skills_view", label: "View Universal Skills", category: "Business Center", subCategory: "Skills Registry", description: "View skills registry table" },
  { resource: "business_center", action: "skills_create", label: "Author Skills", category: "Business Center", subCategory: "Skills Registry", description: "Create new custom skills" },
  { resource: "business_center", action: "skills_edit", label: "Edit Skills", category: "Business Center", subCategory: "Skills Registry", description: "Edit skill code and tool bindings" },
  { resource: "business_center", action: "skills_delete", label: "Delete Skills", category: "Business Center", subCategory: "Skills Registry", description: "Delete or unbind skills" },
  { resource: "business_center", action: "skills_export", label: "Export Skills CSV", category: "Business Center", subCategory: "Skills Registry", description: "Export skills list to CSV" },
  { resource: "business_center", action: "skills_import", label: "Import Skills", category: "Business Center", subCategory: "Skills Registry", description: "Ingest skills definitions" },

  // Business Center - OKF Concepts
  { resource: "business_center", action: "okf_view", label: "View OKF Guidelines", category: "Business Center", subCategory: "OKF Concepts", description: "View OKF knowledge concepts" },
  { resource: "business_center", action: "okf_create", label: "Create OKF Concepts", category: "Business Center", subCategory: "OKF Concepts", description: "Author new OKF guidelines" },
  { resource: "business_center", action: "okf_edit", label: "Edit OKF Concepts", category: "Business Center", subCategory: "OKF Concepts", description: "Edit existing OKF rules" },
  { resource: "business_center", action: "okf_delete", label: "Delete OKF Concepts", category: "Business Center", subCategory: "OKF Concepts", description: "Delete OKF rules" },
  { resource: "business_center", action: "okf_export", label: "Export OKF CSV", category: "Business Center", subCategory: "OKF Concepts", description: "Export OKF rules to CSV" },
  { resource: "business_center", action: "okf_ingest", label: "Ingest OKF Bundle", category: "Business Center", subCategory: "OKF Concepts", description: "Ingest OKF concept bundles" },

  // Business Center - Compliance & PII Rules
  { resource: "business_center", action: "compliance_view", label: "View Compliance Rules", category: "Business Center", subCategory: "Compliance & PII", description: "Inspect PII and DLP filters" },
  { resource: "business_center", action: "compliance_manage", label: "Manage Compliance Rules", category: "Business Center", subCategory: "Compliance & PII", description: "Modify compliance and masking rules" },
  { resource: "business_center", action: "compliance_import_framework", label: "Import Compliance Framework", category: "Business Center", subCategory: "Compliance & PII", description: "Import custom compliance framework" },
  { resource: "business_center", action: "compliance_custom_entities", label: "Manage Custom Entities", category: "Business Center", subCategory: "Compliance & PII", description: "Add/edit custom sensitive keywords" },
  { resource: "business_center", action: "compliance_audit_stream", label: "View Masking Audit Stream", category: "Business Center", subCategory: "Compliance & PII", description: "Inspect live gateway masking stream" },

  // Command Center
  { resource: "command_center", action: "appearance_view", label: "View Appearance", category: "Command Center", subCategory: "Appearance", description: "View appearance settings" },
  { resource: "command_center", action: "appearance_manage", label: "Manage Appearance", category: "Command Center", subCategory: "Appearance", description: "Modify branding, fonts, and colors" },
  { resource: "command_center", action: "branding_view", label: "View Branding", category: "Command Center", subCategory: "Branding", description: "View platform branding" },
  { resource: "command_center", action: "branding_manage", label: "Manage Branding", category: "Command Center", subCategory: "Branding", description: "Update logo and branding assets" },
  { resource: "command_center", action: "llm_view", label: "View LLM Providers", category: "Command Center", subCategory: "LLM Providers", description: "View LLM providers and models" },
  { resource: "command_center", action: "llm_manage", label: "Manage LLM Providers", category: "Command Center", subCategory: "LLM Providers", description: "Configure API keys and model parameters" },
  { resource: "command_center", action: "mcp_view", label: "View MCP Servers", category: "Command Center", subCategory: "MCP Integration", description: "View configured MCP servers" },
  { resource: "command_center", action: "mcp_manage", label: "Manage MCP Servers", category: "Command Center", subCategory: "MCP Integration", description: "Configure external and internal MCP servers" },
  { resource: "command_center", action: "db_view", label: "View Database Hub", category: "Command Center", subCategory: "Database Hub", description: "View database connections" },
  { resource: "command_center", action: "db_manage", label: "Manage Databases", category: "Command Center", subCategory: "Database Hub", description: "Manage database connection strings" },
  { resource: "command_center", action: "api_services_view", label: "View API Services", category: "Command Center", subCategory: "API Services", description: "View external API credentials" },
  { resource: "command_center", action: "api_services_manage", label: "Manage API Services", category: "Command Center", subCategory: "API Services", description: "Configure third-party API credentials" },
  { resource: "command_center", action: "spend_view", label: "View Spend & Usage", category: "Command Center", subCategory: "Usage & Spend", description: "View token metrics and billing" },
  { resource: "command_center", action: "spend_export", label: "Export Spend CSV", category: "Command Center", subCategory: "Usage & Spend", description: "Export usage logs to CSV" },
  { resource: "command_center", action: "social_view", label: "View Social Channels", category: "Command Center", subCategory: "Social Media Hub", description: "View connected social channels" },
  { resource: "command_center", action: "social_manage", label: "Manage Social Channels", category: "Command Center", subCategory: "Social Media Hub", description: "Configure social platform webhooks" },
  { resource: "command_center", action: "system_admin_view", label: "View System Admin", category: "Command Center", subCategory: "System Admin", description: "View bot defense, SMTP settings, and email audit logs" },
  { resource: "command_center", action: "system_admin_manage", label: "Manage System Admin", category: "Command Center", subCategory: "System Admin", description: "Configure bot defense, SMTP credentials, and send test emails" },

  // System Administration (Dedicated Top-Level Category)
  { resource: "system_admin", action: "view", label: "View System Administration", category: "System Admin", description: "Access System Administration module" },
  { resource: "system_admin", action: "update", label: "Manage System Core", category: "System Admin", subCategory: "System Core", description: "Configure SMTP, Turnstile CAPTCHA, and security policies" },
  { resource: "appearance", action: "update", label: "Manage Theme & Appearance", category: "System Admin", subCategory: "Appearance", description: "Configure dual-mode theme palettes, typography, and density" },
  { resource: "branding", action: "update", label: "Manage Platform Branding", category: "System Admin", subCategory: "Branding", description: "Update platform logo, favicon, and title" },

  // Agent Workspace
  { resource: "agent_workspace", action: "view", label: "Access Workspace", category: "Agent Workspace", description: "Access Agent Workspace UI" },
  { resource: "agent_workspace", action: "run_published_flow", label: "Run Published Flows", category: "Agent Workspace", description: "Execute compiled agentflows" },
  { resource: "agent_workspace", action: "hitl_approve", label: "Approve HITL Plans", category: "Agent Workspace", description: "Approve or reject plan cards" },
  { resource: "agent_workspace", action: "direct_mcp_chat", label: "Direct MCP Chat", category: "Agent Workspace", description: "Chat directly with MCP tools" },
  { resource: "agent_workspace", action: "export_chat", label: "Export Chat/CSV", category: "Agent Workspace", description: "Export chat transcripts and tables" },

  // Documentation, Demo Requests, User Admin
  { resource: "documentation", action: "view", label: "View Documentation", category: "Documentation", description: "Access platform guides" },
  { resource: "demo_requests", action: "view", label: "View Inbound Leads", category: "Demo Requests", description: "View demo inquiries" },
  { resource: "demo_requests", action: "manage", label: "Manage Inbound Leads", category: "Demo Requests", description: "Update lead statuses and coordinate demos" },
  { resource: "user_admin", action: "view", label: "View User Admin", category: "User Admin", description: "View user directory and roles" },
  { resource: "user_admin", action: "approve_users", label: "Approve / Reject Users", category: "User Admin", description: "Approve pending users and assign roles" },
  { resource: "user_admin", action: "manage_roles", label: "Manage Roles & Matrix", category: "User Admin", description: "Create roles and assign granular permissions" },
  { resource: "user_admin", action: "force_password_reset", label: "Force Password Reset", category: "User Admin", description: "Force user password changes" }
];

export interface PredefinedRoleSeed {
  id: string;
  name: string;
  description: string;
  isSystem: boolean;
  permissions: { resource: string; action: string }[];
}

export const SYSTEM_ROLES: PredefinedRoleSeed[] = [
  {
    id: "role_super_admin",
    name: "Super Administrator",
    description: "Unrestricted administrative control and all permissions enabled across all platform categories.",
    isSystem: true,
    permissions: PERMISSION_REGISTRY.map((p) => ({ resource: p.resource, action: p.action })),
  },
  {
    id: "role_studio_architect",
    name: "Studio Flow Architect",
    description: "Full access to Capability Studio (view, create, edit, test, export/import, publish) and view access to Documentation.",
    isSystem: true,
    permissions: [
      ...PERMISSION_REGISTRY.filter((p) => p.resource === "capability_studio").map((p) => ({
        resource: p.resource,
        action: p.action,
      })),
      { resource: "documentation", action: "view" },
    ],
  },
  {
    id: "role_workspace_operator",
    name: "Workspace Operator",
    description: "Access to Agent Workspace (run flows, HITL approval, direct MCP chat, export) and view access to Documentation.",
    isSystem: true,
    permissions: [
      ...PERMISSION_REGISTRY.filter((p) => p.resource === "agent_workspace").map((p) => ({
        resource: p.resource,
        action: p.action,
      })),
      { resource: "documentation", action: "view" },
    ],
  },
  {
    id: "role_business_policy_manager",
    name: "Business Policy Manager",
    description: "Full access to Business Center (Universal Skills, OKF Concepts, Compliance Rules) and Documentation.",
    isSystem: true,
    permissions: [
      ...PERMISSION_REGISTRY.filter((p) => p.resource === "business_center").map((p) => ({
        resource: p.resource,
        action: p.action,
      })),
      { resource: "documentation", action: "view" },
    ],
  },
  {
    id: "role_infrastructure_lead",
    name: "Infrastructure Lead",
    description: "Full access to Command Center (LLM Providers, MCPs, Databases, API Services, Social Media, Spend) and System Admin (System Core, Appearance, Branding) and Documentation.",
    isSystem: true,
    permissions: [
      ...PERMISSION_REGISTRY.filter((p) => p.category === "Command Center" || p.category === "System Admin").map((p) => ({
        resource: p.resource,
        action: p.action,
      })),
      { resource: "documentation", action: "view" },
    ],
  },
  {
    id: "role_auditor",
    name: "Auditor",
    description: "Read-only (view) access to Documentation, Spend/Usage, Compliance Audit Stream, and system logs.",
    isSystem: true,
    permissions: [
      { resource: "documentation", action: "view" },
      { resource: "command_center", action: "spend_view" },
      { resource: "command_center", action: "spend_export" },
      { resource: "business_center", action: "compliance_view" },
      { resource: "business_center", action: "compliance_audit_stream" },
      { resource: "business_center", action: "skills_view" },
      { resource: "business_center", action: "okf_view" },
      { resource: "capability_studio", action: "view" },
    ],
  },
  {
    id: "role_user_admin",
    name: "User Administrator",
    description: "Dedicated administration of console accounts, quarantined onboarding review, and role access profile assignments.",
    isSystem: true,
    permissions: [
      { resource: "user_admin", action: "view" },
      { resource: "user_admin", action: "approve_users" },
      { resource: "user_admin", action: "manage_roles" },
      { resource: "user_admin", action: "force_password_reset" },
      { resource: "documentation", action: "view" },
    ],
  },
];

/**
 * Dynamically registers a new component/action permission at runtime if not already present.
 * Ensures future-proof extensibility for new modules added to the platform.
 */
export function registerDynamicPermission(def: PermissionDefinition): void {
  const exists = PERMISSION_REGISTRY.some(
    (p) => p.resource === def.resource && p.action === def.action
  );
  if (!exists) {
    PERMISSION_REGISTRY.push(def);
  }
}

export function formatPermissionKey(resource: string, action: string): string {
  return `${resource}:${action}`;
}
