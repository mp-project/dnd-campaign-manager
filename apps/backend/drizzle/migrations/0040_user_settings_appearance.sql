ALTER TABLE "user_settings" DROP COLUMN "theme";--> statement-breakpoint
ALTER TABLE "user_settings" DROP COLUMN "ui_preferences";--> statement-breakpoint
DROP TYPE "public"."user_theme";--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "font_scale" smallint DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "sidebar_collapsed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_font_scale_check" CHECK ("user_settings"."font_scale" between 90 and 125 and "user_settings"."font_scale" % 5 = 0);