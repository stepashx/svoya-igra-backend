CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"team_id" uuid,
	"name" text NOT NULL,
	"avatar" text,
	"reconnect_token" text NOT NULL,
	"connection_status" text DEFAULT 'connected' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "players_reconnect_token_unique" UNIQUE("reconnect_token"),
	CONSTRAINT "players_room_id_name_unique" UNIQUE("room_id","name")
);
--> statement-breakpoint
CREATE TABLE "presentation_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"status" text DEFAULT 'lobby' NOT NULL,
	"current_stage" text DEFAULT 'lobby' NOT NULL,
	"host_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"host_reconnect_token" text NOT NULL,
	"current_team_id" uuid,
	"total_questions_count" integer DEFAULT 30 NOT NULL,
	"blocked_questions_count" integer DEFAULT 0 NOT NULL,
	"current_shop_round" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rooms_code_unique" UNIQUE("code"),
	CONSTRAINT "rooms_host_reconnect_token_unique" UNIQUE("host_reconnect_token")
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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teams_room_id_selected_topic_id_unique" UNIQUE("room_id","selected_topic_id"),
	CONSTRAINT "teams_room_id_name_unique" UNIQUE("room_id","name")
);
--> statement-breakpoint
CREATE TABLE "board_cells" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"points" integer NOT NULL,
	"position" integer NOT NULL,
	"state" text DEFAULT 'available' NOT NULL,
	"opened_by_team_id" uuid,
	"answered_by_team_id" uuid,
	"blocked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "board_cells_room_id_question_id_unique" UNIQUE("room_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "categories_position_unique" UNIQUE("position")
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"text" text NOT NULL,
	"correct_answer" text NOT NULL,
	"points" integer NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "questions_category_id_points_unique" UNIQUE("category_id","points")
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"shop_item_id" uuid NOT NULL,
	"qr_tool_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_items_room_id_team_id_shop_item_id_unique" UNIQUE("room_id","team_id","shop_item_id")
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"shop_item_id" uuid NOT NULL,
	"price" integer NOT NULL,
	"purchased_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchases_room_id_shop_item_id_unique" UNIQUE("room_id","shop_item_id")
);
--> statement-breakpoint
CREATE TABLE "qr_tools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"payload" text,
	"file_format" text DEFAULT 'svg' NOT NULL,
	"storage_provider" text NOT NULL,
	"bucket" text NOT NULL,
	"storage_key" text NOT NULL,
	"public_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "qr_tools_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "shop_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"price" integer NOT NULL,
	"qr_tool_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "presentation_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"order" integer NOT NULL,
	"is_required" boolean DEFAULT true NOT NULL,
	CONSTRAINT "presentation_requirements_order_unique" UNIQUE("order")
);
--> statement-breakpoint
CREATE TABLE "presentation_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"uploaded_by_player_id" uuid,
	"original_file_name" text,
	"file_format" text,
	"mime_type" text,
	"file_size" integer,
	"storage_provider" text,
	"bucket" text,
	"storage_key" text,
	"public_url" text,
	"uploaded_at" timestamp with time zone,
	"deadline_at" timestamp with time zone,
	"is_late" boolean DEFAULT false NOT NULL,
	"late_penalty" numeric(10, 2),
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "presentation_submissions_room_id_team_id_unique" UNIQUE("room_id","team_id")
);
--> statement-breakpoint
CREATE TABLE "evaluation_criteria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"min_score" integer DEFAULT 0 NOT NULL,
	"max_score" integer DEFAULT 10 NOT NULL,
	"order" integer NOT NULL,
	CONSTRAINT "evaluation_criteria_order_unique" UNIQUE("order")
);
--> statement-breakpoint
CREATE TABLE "evaluation_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"target_team_id" uuid NOT NULL,
	"evaluator_type" text NOT NULL,
	"evaluator_id" uuid NOT NULL,
	"topic_score" integer NOT NULL,
	"design_score" integer NOT NULL,
	"total_score" integer NOT NULL,
	"weight" integer NOT NULL,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evaluation_scores_evaluator_target_unique" UNIQUE("room_id","target_team_id","evaluator_type","evaluator_id")
);
--> statement-breakpoint
CREATE TABLE "final_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"earned_score" integer NOT NULL,
	"presentation_score_raw" numeric(10, 2) NOT NULL,
	"late_penalty" numeric(10, 2) DEFAULT '0' NOT NULL,
	"presentation_score_final" numeric(10, 2) NOT NULL,
	"final_score" numeric(10, 2) NOT NULL,
	"place" integer,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "final_results_room_id_team_id_unique" UNIQUE("room_id","team_id")
);
--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_current_team_id_teams_id_fk" FOREIGN KEY ("current_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_captain_player_id_players_id_fk" FOREIGN KEY ("captain_player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_selected_topic_id_presentation_topics_id_fk" FOREIGN KEY ("selected_topic_id") REFERENCES "public"."presentation_topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_cells" ADD CONSTRAINT "board_cells_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_cells" ADD CONSTRAINT "board_cells_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_cells" ADD CONSTRAINT "board_cells_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_cells" ADD CONSTRAINT "board_cells_opened_by_team_id_teams_id_fk" FOREIGN KEY ("opened_by_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_cells" ADD CONSTRAINT "board_cells_answered_by_team_id_teams_id_fk" FOREIGN KEY ("answered_by_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_shop_item_id_shop_items_id_fk" FOREIGN KEY ("shop_item_id") REFERENCES "public"."shop_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_qr_tool_id_qr_tools_id_fk" FOREIGN KEY ("qr_tool_id") REFERENCES "public"."qr_tools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_shop_item_id_shop_items_id_fk" FOREIGN KEY ("shop_item_id") REFERENCES "public"."shop_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_items" ADD CONSTRAINT "shop_items_qr_tool_id_qr_tools_id_fk" FOREIGN KEY ("qr_tool_id") REFERENCES "public"."qr_tools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presentation_submissions" ADD CONSTRAINT "presentation_submissions_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presentation_submissions" ADD CONSTRAINT "presentation_submissions_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presentation_submissions" ADD CONSTRAINT "presentation_submissions_uploaded_by_player_id_players_id_fk" FOREIGN KEY ("uploaded_by_player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_scores" ADD CONSTRAINT "evaluation_scores_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_scores" ADD CONSTRAINT "evaluation_scores_target_team_id_teams_id_fk" FOREIGN KEY ("target_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "final_results" ADD CONSTRAINT "final_results_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "final_results" ADD CONSTRAINT "final_results_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "players_room_id_idx" ON "players" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "teams_room_id_idx" ON "teams" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "board_cells_room_id_idx" ON "board_cells" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "questions_category_id_idx" ON "questions" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "inventory_items_room_id_team_id_idx" ON "inventory_items" USING btree ("room_id","team_id");--> statement-breakpoint
CREATE INDEX "purchases_room_id_team_id_idx" ON "purchases" USING btree ("room_id","team_id");--> statement-breakpoint
CREATE INDEX "presentation_submissions_room_id_idx" ON "presentation_submissions" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "evaluation_scores_room_id_target_team_id_idx" ON "evaluation_scores" USING btree ("room_id","target_team_id");--> statement-breakpoint
CREATE INDEX "final_results_room_id_idx" ON "final_results" USING btree ("room_id");