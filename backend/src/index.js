import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { deadlines, workingSecondsBetween, slaTargetSeconds, addWorkingSeconds } from './sla.js';
dotenv.config();
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false });
const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN?.split(',') ?? true }));
app.use(express.json());
// Demo identity header keeps this 8-hour assessment easy to run. Replace with real auth before production.
app.use(async (req, _res, next) => {
  try {
    const id = req.header('x-agent-id');
    if (id) { const { rows } = await pool.query('SELECT id,name,email,role FROM users WHERE id=$1',[id]); req.agent = rows[0]; }
    next();
  } catch (e) { next(e); }
});
const holidays = async () => { const { rows } = await pool.query('SELECT holiday_date FROM holidays'); return new Set(rows.map(x => new Date(x.holiday_date).toISOString().slice(0,10))); };
const event = (client, ticketId, actorId, action, oldValue=null, newValue=null) => client.query('INSERT INTO ticket_events(ticket_id,actor_id,action,old_value,new_value) VALUES($1,$2,$3,$4,$5)',[ticketId,actorId ?? null,action,oldValue ? JSON.stringify(oldValue):null,newValue ? JSON.stringify(newValue):null]);
const ticketSelect = `SELECT t.*,u.name AS assignee_name FROM tickets t LEFT JOIN users u ON u.id=t.assigned_to`;
app.get('/api/health', (_req,res)=>res.json({ok:true,service:'Frontdesk API'}));
app.get('/api/agents', async (_req,res,next)=>{try{const {rows}=await pool.query('SELECT id,name,email,role FROM users ORDER BY name');res.json(rows)}catch(e){next(e)}});
app.get('/api/tickets', async (req,res,next)=>{try{
  const values=[]; let where='WHERE 1=1';
  if(req.query.status && req.query.status!=='ALL'){values.push(req.query.status);where+=` AND t.status=$${values.length}`}
  if(req.query.priority && req.query.priority!=='ALL'){values.push(req.query.priority);where+=` AND t.priority=$${values.length}`}
  if(req.query.assigned==='me' && req.agent){values.push(req.agent.id);where+=` AND t.assigned_to=$${values.length}`}
  if(req.query.assigned==='unassigned') where+=' AND t.assigned_to IS NULL';
  if(req.query.q){values.push(`%${req.query.q}%`);where+=` AND (t.subject ILIKE $${values.length} OR t.customer_name ILIKE $${values.length} OR t.ticket_number::text ILIKE $${values.length})`}
  const {rows}=await pool.query(`${ticketSelect} ${where} ORDER BY t.created_at DESC`,values);res.json(rows);
}catch(e){next(e)}});
app.get('/api/dashboard/stats',async(_req,res,next)=>{try{const {rows}=await pool.query(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE status IN ('OPEN','IN_PROGRESS'))::int open,COUNT(*) FILTER(WHERE status='WAITING_FOR_CUSTOMER')::int waiting,COUNT(*) FILTER(WHERE status='RESOLVED')::int resolved,COUNT(*) FILTER(WHERE status NOT IN ('RESOLVED','CLOSED','WAITING_FOR_CUSTOMER') AND ((reply_due_at < now() AND first_response_at IS NULL) OR (resolution_due_at < now())))::int overdue FROM tickets`);res.json(rows[0])}catch(e){next(e)}});
app.post('/api/tickets',async(req,res,next)=>{const c=await pool.connect();try{const {subject,description='',customerName,customerEmail='',priority='MEDIUM'}=req.body;if(!subject||!customerName)return res.status(400).json({error:'subject and customerName are required'});const h=await holidays();const due=deadlines(priority,new Date(),h);await c.query('BEGIN');const {rows}=await c.query(`INSERT INTO tickets(subject,description,customer_name,customer_email,priority,reply_due_at,resolution_due_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[subject,description,customerName,customerEmail,priority,due.replyDueAt,due.resolutionDueAt]);await event(c,rows[0].id,req.agent?.id,'TICKET_CREATED',null,{priority,status:'OPEN'});await c.query('COMMIT');res.status(201).json(rows[0]);}catch(e){await c.query('ROLLBACK');next(e)}finally{c.release()}});
app.get('/api/tickets/:id',async(req,res,next)=>{try{const t=await pool.query(`${ticketSelect} WHERE t.id=$1`,[req.params.id]);if(!t.rowCount)return res.status(404).json({error:'Ticket not found'});const m=await pool.query(`SELECT m.id,m.ticket_id,m.author_id,m.body,m.type,m.created_at,u.name AS author_name FROM messages m LEFT JOIN users u ON u.id=m.author_id WHERE ticket_id=$1 ORDER BY created_at`,[req.params.id]);const ev=await pool.query(`SELECT e.*,u.name AS actor_name FROM ticket_events e LEFT JOIN users u ON u.id=e.actor_id WHERE ticket_id=$1 ORDER BY created_at`,[req.params.id]);res.json({...t.rows[0],messages:m.rows,events:ev.rows});}catch(e){next(e)}});
app.post('/api/tickets/:id/assign',async(req,res,next)=>{const c=await pool.connect();try{const agentId=req.agent?.id ?? req.body.agentId;if(!agentId)return res.status(400).json({error:'Select an agent first'});await c.query('BEGIN');const {rows}=await c.query(`UPDATE tickets SET assigned_to=$1,status=CASE WHEN status='OPEN' THEN 'IN_PROGRESS' ELSE status END,updated_at=now() WHERE id=$2 AND assigned_to IS NULL AND status NOT IN ('CLOSED','RESOLVED') RETURNING *`,[agentId,req.params.id]);if(!rows.length){await c.query('ROLLBACK');return res.status(409).json({error:'Ticket is already assigned or cannot be assigned'});}await event(c,req.params.id,req.agent?.id,'TICKET_ASSIGNED',null,{assignedTo:agentId});await c.query('COMMIT');res.json(rows[0]);}catch(e){await c.query('ROLLBACK');next(e)}finally{c.release()}});

app.patch('/api/tickets/:id', async (req, res, next) => {
  const c = await pool.connect();

  try {
    const allowed = ['priority', 'status'];
    const updates = Object.entries(req.body).filter(([k]) => allowed.includes(k));

    if (!updates.length) {
      return res.status(400).json({ error: 'No supported fields supplied' });
    }

    await c.query('BEGIN');

    const old = (await c.query(
      'SELECT * FROM tickets WHERE id=$1 FOR UPDATE',
      [req.params.id]
    )).rows[0];

    if (!old) {
      await c.query('ROLLBACK');
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const changes = Object.fromEntries(updates);

    if (
      changes.status === 'WAITING_FOR_CUSTOMER' &&
      old.status !== 'WAITING_FOR_CUSTOMER'
    ) {
      const h = await holidays();
      const now = new Date();

      changes.waiting_since = now;

      if (!old.first_response_at && old.reply_due_at) {
        changes.reply_sla_remaining_seconds =
          workingSecondsBetween(now, old.reply_due_at, h);
      }

      if (old.resolution_due_at) {
        changes.resolution_sla_remaining_seconds =
          workingSecondsBetween(now, old.resolution_due_at, h);
      }
    }

    if (
      old.status === 'WAITING_FOR_CUSTOMER' &&
      ['OPEN', 'IN_PROGRESS'].includes(changes.status)
    ) {
      const h = await holidays();
      const now = new Date();

      if (old.reply_sla_remaining_seconds !== null &&
          old.reply_sla_remaining_seconds !== undefined &&
          !old.first_response_at) {
        changes.reply_due_at = addWorkingSeconds(
          now, old.reply_sla_remaining_seconds, h
        );
      }

      if (old.resolution_sla_remaining_seconds !== null &&
          old.resolution_sla_remaining_seconds !== undefined) {
        changes.resolution_due_at = addWorkingSeconds(
          now, old.resolution_sla_remaining_seconds, h
        );
      }

      changes.waiting_since = null;
      changes.reply_sla_remaining_seconds = null;
      changes.resolution_sla_remaining_seconds = null;
    }

    const sets = [];
    const vals = [];

    for (const [k, v] of Object.entries(changes)) {
      vals.push(v);
      sets.push(`${k}=$${vals.length}`);
    }

    vals.push(req.params.id);

    const updated = (await c.query(
      `UPDATE tickets SET ${sets.join(',')}, updated_at=now()
       WHERE id=$${vals.length} RETURNING *`,
      vals
    )).rows[0];

    await event(
      c,
      req.params.id,
      req.agent?.id,
      'TICKET_UPDATED',
      Object.fromEntries(Object.keys(changes).map(k => [k, old[k]])),
      changes
    );

    await c.query('COMMIT');
    res.json(updated);

  } catch (e) {
    await c.query('ROLLBACK');
    next(e);
  } finally {
    c.release();
  }
});

app.post('/api/tickets/:id/reply',(req,res,next)=>addMessage(req,res,next,'PUBLIC_REPLY'));
app.post('/api/tickets/:id/notes',(req,res,next)=>addMessage(req,res,next,'INTERNAL_NOTE'));
app.post('/api/tickets/:id/resolve',async(req,res,next)=>{try{const {rows}=await pool.query(`UPDATE tickets SET status='RESOLVED',resolved_at=now(),updated_at=now() WHERE id=$1 AND status NOT IN ('CLOSED','RESOLVED') RETURNING *`,[req.params.id]);if(!rows.length)return res.status(409).json({error:'Ticket cannot be resolved'});await pool.query(`INSERT INTO ticket_events(ticket_id,actor_id,action,new_value) VALUES($1,$2,'TICKET_RESOLVED','{"status":"RESOLVED"}')`,[req.params.id,req.agent?.id??null]);res.json(rows[0]);}catch(e){next(e)}});
app.post('/api/tickets/:id/reopen',async(req,res,next)=>{const c=await pool.connect();try{await c.query('BEGIN');const t=(await c.query('SELECT * FROM tickets WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];if(!t||t.status!=='RESOLVED'){await c.query('ROLLBACK');return res.status(409).json({error:'Only resolved tickets can be reopened'});}const h=await holidays();const elapsed=workingSecondsBetween(t.resolved_at,new Date(),h);if(elapsed>5*9*3600){await c.query('ROLLBACK');return res.status(409).json({error:'Reopen window has expired; create a new ticket'});}const due=deadlines(t.priority,new Date(),h);const updated=(await c.query(`UPDATE tickets SET status='OPEN',resolved_at=NULL,reply_due_at=$2,resolution_due_at=$3,first_response_at=NULL,updated_at=now() WHERE id=$1 RETURNING *`,[t.id,due.replyDueAt,due.resolutionDueAt])).rows[0];await event(c,t.id,req.agent?.id,'TICKET_REOPENED',{status:'RESOLVED'},{status:'OPEN'});await c.query('COMMIT');res.json(updated);}catch(e){await c.query('ROLLBACK');next(e)}finally{c.release()}});
// Agent-facing ticket detail includes private notes. Customer-facing integrations must use a separate serializer that excludes INTERNAL_NOTE rows.
app.get('/api/tickets/:id/customer-view',async(req,res,next)=>{try{const t=(await pool.query(`${ticketSelect} WHERE t.id=$1`,[req.params.id])).rows[0];if(!t)return res.status(404).json({error:'Ticket not found'});const messages=(await pool.query(`SELECT id,body,created_at FROM messages WHERE ticket_id=$1 AND type='PUBLIC_REPLY' ORDER BY created_at`,[req.params.id])).rows;res.json({ticket:{id:t.id,ticket_number:t.ticket_number,subject:t.subject,status:t.status},messages});}catch(e){next(e)}});
app.get('/api/tickets/:id/events',async(req,res,next)=>{try{const {rows}=await pool.query(`SELECT e.*,u.name actor_name FROM ticket_events e LEFT JOIN users u ON u.id=e.actor_id WHERE ticket_id=$1 ORDER BY created_at`,[req.params.id]);res.json(rows)}catch(e){next(e)}});
app.use((err,_req,res,_next)=>{console.error(err);res.status(500).json({error:'Internal server error'});});
const port=process.env.PORT||4000;app.listen(port,()=>console.log(`Frontdesk API listening on ${port}`));



