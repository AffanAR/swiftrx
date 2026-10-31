CREATE TABLE "brands" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"drug_id" text NOT NULL,
	"form" text NOT NULL,
	"manufacturer" text NOT NULL,
	"strength" text,
	"price" text,
	"herbal" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drugs" ALTER COLUMN "default_dose_value" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "drugs" ALTER COLUMN "default_dose_unit" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "drugs" ALTER COLUMN "default_frequency" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "drugs" ALTER COLUMN "default_duration_days" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "drugs" ADD COLUMN "safety_reviewed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "prescription_items" ADD COLUMN "form" text;--> statement-breakpoint
ALTER TABLE "prescription_items" ADD COLUMN "strength" text;--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_drug_id_drugs_id_fk" FOREIGN KEY ("drug_id") REFERENCES "public"."drugs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brands_drug_idx" ON "brands" USING btree ("drug_id");--> statement-breakpoint
ALTER TABLE "drugs" ADD CONSTRAINT "drugs_reviewed_has_defaults" CHECK (not "drugs"."safety_reviewed" or ("drugs"."default_dose_value" is not null and "drugs"."default_dose_unit" is not null and "drugs"."default_frequency" is not null and "drugs"."default_duration_days" is not null));