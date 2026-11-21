CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL, role TEXT NOT NULL DEFAULT 'AGENT', password_hash TEXT
);
CREATE TABLE IF NOT EXISTS holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), holiday_date DATE UNIQUE NOT NULL, name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), ticket_number BIGSERIAL UNIQUE,
  subject TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL DEFAULT '', priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('CRITICAL','MEDIUM','LOW')),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','WAITING_FOR_CUSTOMER','RESOLVED','CLOSED')),
  assigned_to UUID REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  first_response_at TIMESTAMPTZ, resolved_at TIMESTAMPTZ,
  reply_due_at TIMESTAMPTZ, resolution_due_at TIMESTAMPTZ,
  sla_remaining_seconds INTEGER, waiting_since TIMESTAMPTZ,
  priority_changed_at TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_id UUID REFERENCES users(id), body TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('PUBLIC_REPLY','INTERNAL_NOTE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ticket_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), ticket_id UUID NOT NULL REFERENCES tickets(id),
  actor_id UUID REFERENCES users(id), action TEXT NOT NULL,
  old_value JSONB, new_value JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned ON tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_messages_ticket ON messages(ticket_id, created_at);
CREATE INDEX IF NOT EXISTS idx_events_ticket ON ticket_events(ticket_id, created_at);
-- Audit rows are append-only for the application database role.
CREATE OR REPLACE FUNCTION prevent_event_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'ticket_events are append-only'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS ticket_events_no_update ON ticket_events;
CREATE TRIGGER ticket_events_no_update BEFORE UPDATE OR DELETE ON ticket_events FOR EACH ROW EXECUTE FUNCTION prevent_event_mutation();
