CREATE TABLE "hospital_quick_packs" (
	"hospital_id" uuid NOT NULL,
	"diagnosis_code" text NOT NULL,
	"shortcut_key" text NOT NULL,
	"recommendation_reason" text DEFAULT '' NOT NULL,
	"medications" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hospital_quick_packs_hospital_id_diagnosis_code_shortcut_key_pk" PRIMARY KEY("hospital_id","diagnosis_code","shortcut_key"),
	CONSTRAINT "hospital_quick_packs_shortcut_valid" CHECK ("hospital_quick_packs"."shortcut_key" in ('1', '2', '3'))
);
--> statement-breakpoint
ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_kind_valid";--> statement-breakpoint
ALTER TABLE "hospital_quick_packs" ADD CONSTRAINT "hospital_quick_packs_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hospital_quick_packs" ADD CONSTRAINT "hospital_quick_packs_diagnosis_code_diagnoses_code_fk" FOREIGN KEY ("diagnosis_code") REFERENCES "public"."diagnoses"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_kind_valid" CHECK ("audit_events"."kind" in ('login', 'sign_rx', 'create_patient', 'create_hospital', 'invite_user', 'update_hospital', 'change_hospital_status', 'update_patient', 'set_quick_pack'));