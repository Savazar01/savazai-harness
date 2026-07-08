CREATE TABLE "skill_embeddings" (
	"id" serial PRIMARY KEY NOT NULL,
	"skill_name" text NOT NULL,
	"description" text NOT NULL,
	"embedding" vector(1536),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "skill_embeddings_skill_name_unique" UNIQUE("skill_name")
);
