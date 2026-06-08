CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"status" text NOT NULL,
	"current_stage" text NOT NULL,
	"host_id" uuid NOT NULL,
	"host_reconnect_token" text NOT NULL,
	"current_team_id" uuid,
	"total_questions_count" integer DEFAULT 30 NOT NULL,
	"blocked_questions_count" integer DEFAULT 0 NOT NULL,
	"current_shop_round" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "presentation_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"name" text NOT NULL,
	"captain_player_id" uuid,
	"selected_topic_id" uuid,
	"is_ready" boolean DEFAULT false NOT NULL,
	"turn_order" integer,
	"earned_score" integer DEFAULT 0 NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"presentation_submission_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"team_id" uuid,
	"name" text NOT NULL,
	"avatar" text,
	"reconnect_token" text NOT NULL,
	"connection_status" text NOT NULL,
	"is_captain" boolean DEFAULT false NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"text" text NOT NULL,
	"correct_answer" text NOT NULL,
	"points" integer NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "board_cells" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"points" integer NOT NULL,
	"position" integer NOT NULL,
	"state" text NOT NULL,
	"opened_by_team_id" uuid,
	"answered_by_team_id" uuid,
	"blocked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "qr_tools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"payload" text,
	"file_format" text NOT NULL,
	"storage_provider" text DEFAULT 'minio' NOT NULL,
	"bucket" text NOT NULL,
	"storage_key" text NOT NULL,
	"public_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"price" integer NOT NULL,
	"qr_tool_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"shop_item_id" uuid NOT NULL,
	"price" integer NOT NULL,
	"purchased_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"shop_item_id" uuid NOT NULL,
	"qr_tool_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "presentation_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"order" integer NOT NULL,
	"is_required" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "presentation_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"uploaded_by_player_id" uuid,
	"original_file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size" integer NOT NULL,
	"storage_provider" text DEFAULT 'minio' NOT NULL,
	"bucket" text NOT NULL,
	"storage_key" text NOT NULL,
	"public_url" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deadline_at" timestamp with time zone NOT NULL,
	"is_late" boolean DEFAULT false NOT NULL,
	"late_penalty" double precision NOT NULL,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluation_criteria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"min_score" integer NOT NULL,
	"max_score" integer NOT NULL,
	"order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluation_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"target_team_id" uuid NOT NULL,
	"evaluator_type" text NOT NULL,
	"evaluator_team_id" uuid,
	"host_id" uuid,
	"topic_score" integer NOT NULL,
	"design_score" integer NOT NULL,
	"total_score" integer NOT NULL,
	"weight" integer NOT NULL,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "final_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"earned_score" integer NOT NULL,
	"presentation_score_raw" double precision NOT NULL,
	"late_penalty" double precision NOT NULL,
	"presentation_score_final" double precision NOT NULL,
	"final_score" double precision NOT NULL,
	"place" integer NOT NULL,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_selected_topic_id_presentation_topics_id_fk" FOREIGN KEY ("selected_topic_id") REFERENCES "public"."presentation_topics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_cells" ADD CONSTRAINT "board_cells_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_cells" ADD CONSTRAINT "board_cells_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_cells" ADD CONSTRAINT "board_cells_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_cells" ADD CONSTRAINT "board_cells_opened_by_team_id_teams_id_fk" FOREIGN KEY ("opened_by_team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_cells" ADD CONSTRAINT "board_cells_answered_by_team_id_teams_id_fk" FOREIGN KEY ("answered_by_team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_items" ADD CONSTRAINT "shop_items_qr_tool_id_qr_tools_id_fk" FOREIGN KEY ("qr_tool_id") REFERENCES "public"."qr_tools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_shop_item_id_shop_items_id_fk" FOREIGN KEY ("shop_item_id") REFERENCES "public"."shop_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_shop_item_id_shop_items_id_fk" FOREIGN KEY ("shop_item_id") REFERENCES "public"."shop_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_qr_tool_id_qr_tools_id_fk" FOREIGN KEY ("qr_tool_id") REFERENCES "public"."qr_tools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presentation_submissions" ADD CONSTRAINT "presentation_submissions_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presentation_submissions" ADD CONSTRAINT "presentation_submissions_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presentation_submissions" ADD CONSTRAINT "presentation_submissions_uploaded_by_player_id_players_id_fk" FOREIGN KEY ("uploaded_by_player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_scores" ADD CONSTRAINT "evaluation_scores_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_scores" ADD CONSTRAINT "evaluation_scores_target_team_id_teams_id_fk" FOREIGN KEY ("target_team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_scores" ADD CONSTRAINT "evaluation_scores_evaluator_team_id_teams_id_fk" FOREIGN KEY ("evaluator_team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "final_results" ADD CONSTRAINT "final_results_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "final_results" ADD CONSTRAINT "final_results_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rooms_code_uq" ON "rooms" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "rooms_host_reconnect_token_uq" ON "rooms" USING btree ("host_reconnect_token");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_room_id_selected_topic_id_uq" ON "teams" USING btree ("room_id","selected_topic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "players_reconnect_token_uq" ON "players" USING btree ("reconnect_token");--> statement-breakpoint
CREATE UNIQUE INDEX "players_room_id_name_uq" ON "players" USING btree ("room_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "players_captain_per_team_uq" ON "players" USING btree ("team_id") WHERE "players"."is_captain";--> statement-breakpoint
CREATE UNIQUE INDEX "shop_items_qr_tool_id_uq" ON "shop_items" USING btree ("qr_tool_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchases_room_id_shop_item_id_uq" ON "purchases" USING btree ("room_id","shop_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "presentation_submissions_room_id_team_id_uq" ON "presentation_submissions" USING btree ("room_id","team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_scores_room_target_evaluator_uq" ON "evaluation_scores" USING btree ("room_id","target_team_id","evaluator_team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_scores_host_per_target_uq" ON "evaluation_scores" USING btree ("room_id","target_team_id") WHERE "evaluation_scores"."evaluator_type" = 'HOST';--> statement-breakpoint
CREATE UNIQUE INDEX "final_results_room_id_team_id_uq" ON "final_results" USING btree ("room_id","team_id");