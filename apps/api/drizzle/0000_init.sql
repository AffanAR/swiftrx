CREATE TABLE "audit_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"hospital_id" uuid,
	"kind" text NOT NULL,
	"actor_id" text NOT NULL,
	"actor_email" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" "inet",
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "audit_events_kind_valid" CHECK ("audit_events"."kind" in ('login', 'sign_rx', 'create_patient', 'create_hospital', 'invite_user'))
);
--> statement-breakpoint
CREATE TABLE "diagnoses" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diagnosis_investigations" (
	"diagnosis_code" text NOT NULL,
	"investigation_code" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "diagnosis_investigations_diagnosis_code_investigation_code_pk" PRIMARY KEY("diagnosis_code","investigation_code"),
	CONSTRAINT "diagnosis_investigations_position_unique" UNIQUE("diagnosis_code","position")
);
--> statement-breakpoint
CREATE TABLE "drugs" (
	"id" text PRIMARY KEY NOT NULL,
	"generic_name" text NOT NULL,
	"brand_names" text[] DEFAULT '{}' NOT NULL,
	"therapeutic_class" text NOT NULL,
	"default_dose_value" numeric(10, 3) NOT NULL,
	"default_dose_unit" text NOT NULL,
	"default_frequency" text NOT NULL,
	"default_duration_days" integer NOT NULL,
	"contraindications" text[] DEFAULT '{}' NOT NULL,
	"interacts_with" text[] DEFAULT '{}' NOT NULL,
	CONSTRAINT "drugs_default_dose_positive" CHECK ("drugs"."default_dose_value" > 0),
	CONSTRAINT "drugs_default_dose_unit_valid" CHECK ("drugs"."default_dose_unit" in ('mg', 'ml', 'g', 'mcg', 'tablets')),
	CONSTRAINT "drugs_default_frequency_valid" CHECK ("drugs"."default_frequency" in ('QD', 'BID', 'TID', 'QID', 'PRN', 'QHS')),
	CONSTRAINT "drugs_default_duration_positive" CHECK ("drugs"."default_duration_days" > 0)
);
--> statement-breakpoint
CREATE TABLE "hospital_settings" (
	"hospital_id" uuid PRIMARY KEY NOT NULL,
	"features" jsonb NOT NULL,
	"rx_design" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hospitals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"country" text NOT NULL,
	"status" text DEFAULT 'trial' NOT NULL,
	"plan" text NOT NULL,
	"contact_email" text NOT NULL,
	"monthly_rx_cap" integer NOT NULL,
	"primary_color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hospitals_slug_unique" UNIQUE("slug"),
	CONSTRAINT "hospitals_slug_format" CHECK ("hospitals"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "hospitals_country_format" CHECK ("hospitals"."country" ~ '^[A-Z]{2}$'),
	CONSTRAINT "hospitals_status_valid" CHECK ("hospitals"."status" in ('active', 'suspended', 'trial')),
	CONSTRAINT "hospitals_plan_valid" CHECK ("hospitals"."plan" in ('starter', 'clinic', 'enterprise')),
	CONSTRAINT "hospitals_monthly_rx_cap_nonnegative" CHECK ("hospitals"."monthly_rx_cap" >= 0),
	CONSTRAINT "hospitals_primary_color_format" CHECK ("hospitals"."primary_color" ~ '^#[0-9a-fA-F]{6}$')
);
--> statement-breakpoint
CREATE TABLE "investigations" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	CONSTRAINT "investigations_type_valid" CHECK ("investigations"."type" in ('lab', 'imaging', 'other'))
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"hospital_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_hospital_id_user_id_role_pk" PRIMARY KEY("hospital_id","user_id","role"),
	CONSTRAINT "memberships_role_valid" CHECK ("memberships"."role" in ('hospital_admin', 'doctor'))
);
--> statement-breakpoint
CREATE TABLE "patient_allergies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" uuid NOT NULL,
	"patient_id" text NOT NULL,
	"substance" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patient_allergies_substance_present" CHECK (length(trim("patient_allergies"."substance")) > 0)
);
--> statement-breakpoint
CREATE TABLE "patients" (
	"id" text PRIMARY KEY NOT NULL,
	"hospital_id" uuid NOT NULL,
	"name" text NOT NULL,
	"age" integer NOT NULL,
	"sex" text NOT NULL,
	"weight_kg" numeric(5, 2) NOT NULL,
	"contact" text DEFAULT '' NOT NULL,
	"allergy_status" text DEFAULT 'not_recorded' NOT NULL,
	"active_problems" text[] DEFAULT '{}' NOT NULL,
	"active_medications" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recent_vitals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patients_id_hospital_unique" UNIQUE("id","hospital_id"),
	CONSTRAINT "patients_age_range" CHECK ("patients"."age" between 0 and 150),
	CONSTRAINT "patients_sex_valid" CHECK ("patients"."sex" in ('M', 'F')),
	CONSTRAINT "patients_weight_positive" CHECK ("patients"."weight_kg" > 0),
	CONSTRAINT "patients_allergy_status_valid" CHECK ("patients"."allergy_status" in ('not_recorded', 'none_known', 'recorded'))
);
--> statement-breakpoint
CREATE TABLE "prescription_investigations" (
	"hospital_id" uuid NOT NULL,
	"prescription_id" text NOT NULL,
	"position" integer NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	CONSTRAINT "prescription_investigations_prescription_id_position_pk" PRIMARY KEY("prescription_id","position"),
	CONSTRAINT "prescription_investigations_type_valid" CHECK ("prescription_investigations"."type" in ('lab', 'imaging', 'other'))
);
--> statement-breakpoint
CREATE TABLE "prescription_items" (
	"hospital_id" uuid NOT NULL,
	"prescription_id" text NOT NULL,
	"position" integer NOT NULL,
	"row_id" text NOT NULL,
	"drug_id" text NOT NULL,
	"generic_name" text NOT NULL,
	"brand_name" text,
	"dose_value" numeric(10, 3) NOT NULL,
	"dose_unit" text NOT NULL,
	"frequency" text NOT NULL,
	"duration_days" integer NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	CONSTRAINT "prescription_items_prescription_id_position_pk" PRIMARY KEY("prescription_id","position"),
	CONSTRAINT "prescription_items_dose_positive" CHECK ("prescription_items"."dose_value" > 0),
	CONSTRAINT "prescription_items_dose_unit_valid" CHECK ("prescription_items"."dose_unit" in ('mg', 'ml', 'g', 'mcg', 'tablets')),
	CONSTRAINT "prescription_items_frequency_valid" CHECK ("prescription_items"."frequency" in ('QD', 'BID', 'TID', 'QID', 'PRN', 'QHS')),
	CONSTRAINT "prescription_items_duration_positive" CHECK ("prescription_items"."duration_days" > 0)
);
--> statement-breakpoint
CREATE TABLE "prescriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"hospital_id" uuid NOT NULL,
	"patient_id" text NOT NULL,
	"doctor_id" text NOT NULL,
	"diagnosis_code" text NOT NULL,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"patient_snapshot" jsonb NOT NULL,
	"diagnosis_snapshot" jsonb NOT NULL,
	"rx_design_snapshot" jsonb NOT NULL,
	"doctor_name" text NOT NULL,
	"doctor_license" text NOT NULL,
	"safety_override" jsonb,
	CONSTRAINT "prescriptions_id_hospital_unique" UNIQUE("id","hospital_id"),
	CONSTRAINT "prescriptions_doctor_license_present" CHECK (length(trim("prescriptions"."doctor_license")) > 0),
	CONSTRAINT "prescriptions_override_has_reason" CHECK ("prescriptions"."safety_override" is null or length(trim("prescriptions"."safety_override"->>'reason')) > 0)
);
--> statement-breakpoint
CREATE TABLE "quick_packs" (
	"id" text PRIMARY KEY NOT NULL,
	"diagnosis_code" text NOT NULL,
	"shortcut_key" text NOT NULL,
	"rank_score" real NOT NULL,
	"recommendation_reason" text DEFAULT '' NOT NULL,
	"medications" jsonb NOT NULL,
	CONSTRAINT "quick_packs_shortcut_unique" UNIQUE("diagnosis_code","shortcut_key"),
	CONSTRAINT "quick_packs_shortcut_valid" CHECK ("quick_packs"."shortcut_key" in ('1', '2', '3')),
	CONSTRAINT "quick_packs_rank_range" CHECK ("quick_packs"."rank_score" between 0 and 1)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"is_platform_admin" boolean DEFAULT false NOT NULL,
	"specialty" text,
	"license_no" text,
	"status" text DEFAULT 'invited' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "users_status_valid" CHECK ("users"."status" in ('active', 'invited', 'disabled'))
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnosis_investigations" ADD CONSTRAINT "diagnosis_investigations_diagnosis_code_diagnoses_code_fk" FOREIGN KEY ("diagnosis_code") REFERENCES "public"."diagnoses"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnosis_investigations" ADD CONSTRAINT "diagnosis_investigations_investigation_code_investigations_code_fk" FOREIGN KEY ("investigation_code") REFERENCES "public"."investigations"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hospital_settings" ADD CONSTRAINT "hospital_settings_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_allergies" ADD CONSTRAINT "patient_allergies_patient_fk" FOREIGN KEY ("patient_id","hospital_id") REFERENCES "public"."patients"("id","hospital_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription_investigations" ADD CONSTRAINT "prescription_investigations_code_investigations_code_fk" FOREIGN KEY ("code") REFERENCES "public"."investigations"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription_investigations" ADD CONSTRAINT "prescription_investigations_prescription_fk" FOREIGN KEY ("prescription_id","hospital_id") REFERENCES "public"."prescriptions"("id","hospital_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription_items" ADD CONSTRAINT "prescription_items_drug_id_drugs_id_fk" FOREIGN KEY ("drug_id") REFERENCES "public"."drugs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription_items" ADD CONSTRAINT "prescription_items_prescription_fk" FOREIGN KEY ("prescription_id","hospital_id") REFERENCES "public"."prescriptions"("id","hospital_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_doctor_id_users_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_diagnosis_code_diagnoses_code_fk" FOREIGN KEY ("diagnosis_code") REFERENCES "public"."diagnoses"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_patient_fk" FOREIGN KEY ("patient_id","hospital_id") REFERENCES "public"."patients"("id","hospital_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quick_packs" ADD CONSTRAINT "quick_packs_diagnosis_code_diagnoses_code_fk" FOREIGN KEY ("diagnosis_code") REFERENCES "public"."diagnoses"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_hospital_at_idx" ON "audit_events" USING btree ("hospital_id","at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "patient_allergies_substance_unique" ON "patient_allergies" USING btree ("patient_id",lower("substance"));--> statement-breakpoint
CREATE INDEX "patients_hospital_name_idx" ON "patients" USING btree ("hospital_id","name");--> statement-breakpoint
CREATE INDEX "prescriptions_hospital_signed_idx" ON "prescriptions" USING btree ("hospital_id","signed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "prescriptions_patient_idx" ON "prescriptions" USING btree ("hospital_id","patient_id");--> statement-breakpoint
CREATE INDEX "prescriptions_doctor_idx" ON "prescriptions" USING btree ("doctor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree (lower("email"));