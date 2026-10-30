-- The audit log is append-only: rows can be inserted, never changed or
-- removed. This holds for every database role, including the one the API
-- connects as, so a bug or a stolen API credential can't rewrite history.
-- (Revoking UPDATE and DELETE from the API's role is a second fence for when
-- the API stops connecting as the table owner.)
--
-- DROP still works, which is how `npm run db:reset` starts over on a dev
-- database.
CREATE FUNCTION "audit_events_reject_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "audit_events_no_update_or_delete"
  BEFORE UPDATE OR DELETE ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION "audit_events_reject_change"();
--> statement-breakpoint
CREATE TRIGGER "audit_events_no_truncate"
  BEFORE TRUNCATE ON "audit_events"
  FOR EACH STATEMENT EXECUTE FUNCTION "audit_events_reject_change"();
