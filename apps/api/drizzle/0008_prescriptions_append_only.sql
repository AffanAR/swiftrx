-- A signed prescription is append-only, like the audit log (0001): its row,
-- its medicines and its tests can be inserted, never changed or removed. This
-- holds for every database role, including the one the API connects as, so a
-- bug or a stolen API credential can't alter what a doctor signed. A mistake
-- is put right by signing a new prescription, not by editing the old one.
--
-- DROP still works, which is how `npm run db:reset` starts over on a dev
-- database.
CREATE FUNCTION "prescriptions_reject_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "prescriptions_no_update_or_delete"
  BEFORE UPDATE OR DELETE ON "prescriptions"
  FOR EACH ROW EXECUTE FUNCTION "prescriptions_reject_change"();
--> statement-breakpoint
CREATE TRIGGER "prescriptions_no_truncate"
  BEFORE TRUNCATE ON "prescriptions"
  FOR EACH STATEMENT EXECUTE FUNCTION "prescriptions_reject_change"();
--> statement-breakpoint
CREATE TRIGGER "prescription_items_no_update_or_delete"
  BEFORE UPDATE OR DELETE ON "prescription_items"
  FOR EACH ROW EXECUTE FUNCTION "prescriptions_reject_change"();
--> statement-breakpoint
CREATE TRIGGER "prescription_items_no_truncate"
  BEFORE TRUNCATE ON "prescription_items"
  FOR EACH STATEMENT EXECUTE FUNCTION "prescriptions_reject_change"();
--> statement-breakpoint
CREATE TRIGGER "prescription_investigations_no_update_or_delete"
  BEFORE UPDATE OR DELETE ON "prescription_investigations"
  FOR EACH ROW EXECUTE FUNCTION "prescriptions_reject_change"();
--> statement-breakpoint
CREATE TRIGGER "prescription_investigations_no_truncate"
  BEFORE TRUNCATE ON "prescription_investigations"
  FOR EACH STATEMENT EXECUTE FUNCTION "prescriptions_reject_change"();
