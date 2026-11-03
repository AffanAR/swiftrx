-- Patients get a date of birth (an age goes stale), a pregnancy status and
-- kidney function, which the dose and pregnancy checks need. Hand-edited from
-- drizzle-kit's output so it also runs on a database that already has
-- patients: their date of birth is worked out from the stored age and marked
-- estimated, and men are "not applicable" for pregnancy before the rule that
-- says so is added. (0010 then drops the age column.)
ALTER TABLE "patients" ADD COLUMN "date_of_birth" date;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "date_of_birth_estimated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "pregnancy" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "kidney" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "egfr" numeric(5, 1);--> statement-breakpoint
UPDATE "patients"
  SET "date_of_birth" = (current_date - make_interval(years => "age"))::date,
      "date_of_birth_estimated" = true;--> statement-breakpoint
UPDATE "patients" SET "pregnancy" = 'not_applicable' WHERE "sex" = 'M';--> statement-breakpoint
ALTER TABLE "patients" ALTER COLUMN "date_of_birth" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_pregnancy_valid" CHECK ("patients"."pregnancy" in ('not_applicable', 'unknown', 'not_pregnant', 'pregnant', 'breastfeeding'));--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_kidney_valid" CHECK ("patients"."kidney" in ('unknown', 'normal', 'moderate', 'severe', 'failure', 'dialysis'));--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_egfr_positive" CHECK ("patients"."egfr" > 0);--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_man_not_pregnant" CHECK ("patients"."sex" <> 'M' or "patients"."pregnancy" = 'not_applicable');
