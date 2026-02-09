CREATE TABLE "agent_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"personality" text NOT NULL,
	"base_strategy" text NOT NULL,
	"games_played" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"game_id" text NOT NULL,
	"date" timestamp DEFAULT now() NOT NULL,
	"players" jsonb NOT NULL,
	"winner" text NOT NULL,
	"turn_count" integer NOT NULL,
	"key_decisions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"lessons_learned" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"opponent_behaviors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" text PRIMARY KEY NOT NULL,
	"state" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opponent_models" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"opponent_id" text NOT NULL,
	"opponent_name" text NOT NULL,
	"games_against" integer DEFAULT 0 NOT NULL,
	"wins_against" integer DEFAULT 0 NOT NULL,
	"observed_tendencies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"strategic_notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_updated" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategic_insights" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"insight" text NOT NULL,
	"confidence" real DEFAULT 0.5 NOT NULL,
	"times_validated" integer DEFAULT 0 NOT NULL,
	"times_contradicted" integer DEFAULT 0 NOT NULL,
	"context" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_records" ADD CONSTRAINT "game_records_agent_id_agent_profiles_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opponent_models" ADD CONSTRAINT "opponent_models_agent_id_agent_profiles_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategic_insights" ADD CONSTRAINT "strategic_insights_agent_id_agent_profiles_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent_profiles"("id") ON DELETE no action ON UPDATE no action;