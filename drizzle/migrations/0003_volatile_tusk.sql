CREATE TABLE "system_configurations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_title" varchar(255) NOT NULL,
	"brand_logo_url" text DEFAULT 'https://savazar.com/wp-content/uploads/2023/10/cropped-Transparent_Image_2-300x100.png',
	"design_tokens" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
