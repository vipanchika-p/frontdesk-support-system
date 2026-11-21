# Frontdesk — Arvo Systems Support Workspace

A full-stack MVP for support agents: ticket queue, ticket creation, assignment, public replies, internal notes, SLA deadlines, resolution/reopen actions and audit history.

## Stack
- React + Vite frontend
- Node.js + Express REST API
- PostgreSQL database

## Requirements
Node.js 20+ and Docker Desktop (or a locally installed PostgreSQL 14+).

## Run locally

1. Start PostgreSQL and initialize the schema:

   ```bash
   docker compose up -d db
   ```

2. Configure the API:

   ```bash
   cp server/.env.example server/.env
   ```

   The default DATABASE_URL works with the included Docker Compose database.

3. Install dependencies and start both apps:

   ```bash
   npm install
   npm run dev
   ```

4. Open http://localhost:5173. API health check: http://localhost:4000/api/health.

## Add demo agents

Run this SQL against the `frontdesk` database:

```sql
INSERT INTO users(name,email,role) VALUES
('Asha Nair','asha@arvo.example','AGENT'),
('Rahul Menon','rahul@arvo.example','AGENT'),
('Meera Thomas','meera@arvo.example','LEAD')
ON CONFLICT(email) DO NOTHING;
```

The dashboard can create and browse tickets without seeded agents. To assign tickets, seed agents and use the assign endpoint with an agent UUID. Retrieve IDs with `GET /api/agents`.

## API overview
- `GET /api/health`
- `GET /api/agents`
- `GET /api/tickets?status=OPEN&priority=CRITICAL&q=login`
- `POST /api/tickets` — `{subject, description, customerName, customerEmail, priority}`
- `GET /api/tickets/:id` — agent detail, including internal notes and audit events
- `POST /api/tickets/:id/assign` — `{agentId}` (atomic; conflicts if already assigned)
- `POST /api/tickets/:id/reply` — `{body}`
- `POST /api/tickets/:id/notes` — `{body}`
- `POST /api/tickets/:id/resolve`
- `POST /api/tickets/:id/reopen`
- `PATCH /api/tickets/:id` — priority/status/assigned_to
- `GET /api/tickets/:id/events`
- `GET /api/tickets/:id/customer-view` — public-only message serializer
- `GET /api/dashboard/stats`

## Business rules implemented
- Working calendar is Monday–Friday, 09:30–18:30; holidays can be entered in `holidays`.
- Critical: 2 working hours to first response and 1 working day to resolution.
- Medium: 4.5 working hours to first response and 3 working days to resolution.
- Low: 1 working day to first response and 5 working days to resolution.
- SLA deadlines are calculated using working time when a ticket is created.
- Assignment uses a conditional database update so only one agent can take an unassigned ticket.
- Internal notes are distinguished from public replies; the customer-view endpoint selects only public replies.
- Ticket events have a database trigger preventing update/delete.
- Reopening is allowed for five working days after resolution.

## Important limitations / assumptions
This is an assessment MVP, not production-ready software. The supplied brief does not specify the exact priority-change policy. The current API records priority changes in the event history, but a complete production implementation should recalculate both deadlines using remaining SLA time and explicitly confirm the policy with the business. The customer-waiting SLA pause/resume and automatic five-working-day no-response closure still need to be completed with a durable pause ledger and scheduled worker. Authentication is represented by an optional `x-agent-id` header for local assessment convenience; replace it with secure sessions/JWT, password hashing, authorization and rate limiting before production. Customer-facing access must use the public serializer, never the agent detail endpoint.

## Deployment
Deploy the API as a Node web service and PostgreSQL as a managed database. Deploy the Vite frontend as a static site with `VITE_API_URL` set to the deployed API URL. Configure `DATABASE_URL`, `CLIENT_ORIGIN` and `DB_SSL` in the API environment. Keep the services active for the requested one-week review period.

## Assessment note
The most important remaining work is a robust SLA pause/resume ledger, scheduled auto-close worker, real authentication/role authorization, and automated tests for concurrency and working-calendar edge cases. These were left as explicit MVP limitations rather than represented as finished functionality.
