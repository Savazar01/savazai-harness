CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "agent_session_memory" (
	"session_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" integer NOT NULL,
	"role" text NOT NULL,
	"raw_content" text,
	"masked_content" text,
	"embedding" vector(1536),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "autonomous_agents" (
	"id" serial PRIMARY KEY NOT NULL,
	"app_id" integer NOT NULL,
	"agent_name" text NOT NULL,
	"system_prompt" text,
	"allowed_mcp_tools" jsonb DEFAULT '[]'::jsonb,
	"is_core_agent" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connected_apps" (
	"id" serial PRIMARY KEY NOT NULL,
	"app_name" text NOT NULL,
	"mcp_endpoint_url" text,
	"bearer_token_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "connected_apps_app_name_unique" UNIQUE("app_name")
);
--> statement-breakpoint
ALTER TABLE "agent_session_memory" ADD CONSTRAINT "agent_session_memory_app_id_connected_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."connected_apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autonomous_agents" ADD CONSTRAINT "autonomous_agents_app_id_connected_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."connected_apps"("id") ON DELETE no action ON UPDATE no action;