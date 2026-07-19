CREATE TABLE "telemetry_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" uuid,
	"provider" text,
	"model_name" text,
	"input_tokens" integer DEFAULT 0,
	"output_tokens" integer DEFAULT 0,
	"reasoning_tokens" integer DEFAULT 0,
	"execution_latency_ms" integer DEFAULT 0,
	"executed_mcp_tools" jsonb DEFAULT '[]'::jsonb,
	"transaction_cost" double precision DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
