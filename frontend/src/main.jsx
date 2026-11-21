

import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity, AlertCircle, ArrowUpRight, CheckCircle2, ChevronDown,
  Clock3, Filter, Inbox, LifeBuoy, MessageSquare, MoreHorizontal,
  Plus, RefreshCw, Search, Send, ShieldCheck, StickyNote,
  Ticket as TicketIcon, Users, X
} from 'lucide-react';
import './style.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const agentId = localStorage.getItem('frontdesk-agent-id') || '';

const fmt = d =>
  d
    ? new Date(d).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      })
    : '—';

const initials = n =>
  (n || 'Agent')
    .split(' ')
    .map(x => x[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

function App() {
  const [tickets, setTickets] = useState([]);
  const [stats, setStats] = useState({
    total: 0, open: 0, waiting: 0, resolved: 0, overdue: 0
  });
  const [agents, setAgents] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [filter, setFilter] = useState('ALL');
  const [query, setQuery] = useState('');
  const [priority, setPriority] = useState('ALL');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [tab, setTab] = useState('reply');
  const [message, setMessage] = useState('');

  const [form, setForm] = useState({
    subject: '',
    customerName: '',
    customerEmail: '',
    description: '',
    priority: 'MEDIUM'
  });

  const headers = {
    'Content-Type': 'application/json',
    ...(agentId ? { 'x-agent-id': agentId } : {})
  };

  async function request(path, options = {}) {
    const r = await fetch(API + path, {
      ...options,
      headers: { ...headers, ...options.headers }
    });

    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      throw new Error(data?.error || `Request failed (${r.status})`);
    }

    return data;
  }

  async function load() {
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();

      if (filter !== 'ALL') params.set('status', filter);
      if (priority !== 'ALL') params.set('priority', priority);
      if (query) params.set('q', query);

      const [ts, s, as] = await Promise.all([
        request('/api/tickets?' + params),
        request('/api/dashboard/stats'),
        request('/api/agents')
      ]);

      // APIs can sometimes return null or unexpected data.
      // Keep the UI state in the shape expected by the components.
      setTickets(Array.isArray(ts) ? ts.filter(t => t && typeof t === 'object') : []);
      setStats({
        total: Number(s?.total ?? 0),
        open: Number(s?.open ?? 0),
        waiting: Number(s?.waiting ?? 0),
        resolved: Number(s?.resolved ?? 0),
        overdue: Number(s?.overdue ?? 0)
      });
      setAgents(Array.isArray(as) ? as.filter(a => a && typeof a === 'object') : []);

      if (selected) {
        const d = await request('/api/tickets/' + selected);
        setDetail(d);
      }
    } catch (e) {
      setError(e.message + ' — check that the API and database are running.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();

    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [filter, priority]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [query]);

  async function openTicket(t) {
    setSelected(t.id);
    setTab('reply');
    setMessage('');

    try {
      setDetail(await request('/api/tickets/' + t.id));
    } catch (e) {
      setError(e.message);
    }
  }

  async function createTicket(e) {
    e.preventDefault();

    try {
      await request('/api/tickets', {
        method: 'POST',
        body: JSON.stringify(form)
      });

      setShowCreate(false);

      setForm({
        subject: '',
        customerName: '',
        customerEmail: '',
        description: '',
        priority: 'MEDIUM'
      });

      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function action(path, body = {}) {
    try {
      await request(path, {
        method: 'POST',
        body: JSON.stringify(body)
      });

      await load();

      if (selected) {
        setDetail(await request('/api/tickets/' + selected));
      }
    } catch (e) {
      setError(e.message);
    }
  }

  async function updateStatus(status) {
    try {
      await request('/api/tickets/' + selected, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });

      await load();

      if (selected) {
        setDetail(await request('/api/tickets/' + selected));
      }
    } catch (e) {
      setError(e.message);
    }
  }

  async function sendMessage() {
    if (!message.trim() || !selected) return;

    try {
      await request(
        `/api/tickets/${selected}/${tab === 'reply' ? 'reply' : 'notes'}`,
        {
          method: 'POST',
          body: JSON.stringify({ body: message })
        }
      );

      setMessage('');
      setDetail(await request('/api/tickets/' + selected));
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  const selectedTicket =
    tickets.find(t => t && t.id === selected) || (detail && typeof detail === 'object' ? detail : null);

  const menu = [
    ['ALL', 'All tickets', Inbox],
    ['OPEN', 'Open', TicketIcon],
    ['IN_PROGRESS', 'In progress', Activity],
    ['WAITING_FOR_CUSTOMER', 'Waiting for customer', Clock3],
    ['RESOLVED', 'Resolved', CheckCircle2],
    ['CLOSED', 'Closed', ShieldCheck]
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><LifeBuoy size={21} /></div>
          <div>
            <b>frontdesk</b>
            <small>ARVO SUPPORT</small>
          </div>
        </div>

        <div className="workspace">
          <span className="workspace-dot" /> Arvo Systems
          <ChevronDown size={14} />
        </div>

        <div className="nav-label">WORKSPACE</div>

        <nav>
          {menu.map(([id, label, Icon]) => (
            <button
              key={id}
              className={'nav-item ' + (filter === id ? 'active' : '')}
              onClick={() => {
                setFilter(id);
                setSelected(null);
                setDetail(null);
              }}
            >
              <Icon size={17} />
              <span>{label}</span>
              {id === 'ALL' && <em>{stats.total}</em>}
            </button>
          ))}
        </nav>

        <div className="side-bottom">
          <div className="help-card">
            <div className="help-icon"><ShieldCheck size={17} /></div>
            <b>Stay on top of SLAs</b>
            <p>Track response and resolution targets from one place.</p>
          </div>

          <div className="profile">
            <div className="avatar">{initials('Support Agent')}</div>
            <div>
              <b>Support Agent</b>
              <small>Agent workspace</small>
            </div>
            <MoreHorizontal size={18} />
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="crumb">
            Workspace <span>/</span>
            <b>{menu.find(x => x[0] === filter)?.[1] || 'All tickets'}</b>
          </div>

          <div className="top-actions">
            <div className="status-live"><i /> System operational</div>
            <button className="icon-button" onClick={load} title="Refresh">
              <RefreshCw size={17} />
            </button>
            <div className="avatar small">SA</div>
          </div>
        </header>

        <div className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">SUPPORT OPERATIONS</div>
              <h1>Good day, team <span>✦</span></h1>
              <p>Here’s what’s happening across your support queue.</p>
            </div>

            <button className="primary" onClick={() => setShowCreate(true)}>
              <Plus size={17} /> Create ticket
            </button>
          </div>

          {error && (
            <div className="error-banner">
              <AlertCircle size={17} />
              {error}
              <button onClick={() => setError('')}><X size={15} /></button>
            </div>
          )}

          <section className="stats-grid">
            <Stat label="Total tickets" value={stats.total} icon={TicketIcon} tone="blue" />
            <Stat label="Open tickets" value={stats.open} icon={Inbox} tone="violet" />
            <Stat label="Waiting on customer" value={stats.waiting} icon={Clock3} tone="amber" />
            <Stat label="Overdue" value={stats.overdue} icon={AlertCircle} tone="red" />
            <Stat label="Resolved" value={stats.resolved} icon={CheckCircle2} tone="green" />
          </section>

          <section className="queue-card">
            <div className="queue-head">
              <div>
                <h2>Ticket queue</h2>
                <p>Manage and respond to customer issues.</p>
              </div>

              <div className="queue-tools">
                <div className="search">
                  <Search size={16} />
                  <input
                    placeholder="Search tickets..."
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                  />
                  <kbd>⌘ K</kbd>
                </div>

                <select
                  value={priority}
                  onChange={e => setPriority(e.target.value)}
                >
                  <option value="ALL">All priorities</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>

                <button className="filter-btn">
                  <Filter size={16} /> Filter
                </button>
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>TICKET</th>
                    <th>CUSTOMER</th>
                    <th>PRIORITY</th>
                    <th>ASSIGNED TO</th>
                    <th>STATUS</th>
                    <th>SLA DEADLINE</th>
                    <th />
                  </tr>
                </thead>

                <tbody>
                  {tickets.map(t => (
                    <tr
                      key={t.id}
                      className={selected === t.id ? 'selected-row' : ''}
                      onClick={() => openTicket(t)}
                    >
                      <td>
                        <b className="ticket-id">
                          #{String(t.ticket_number).padStart(4, '0')}
                        </b>
                        <div className="subject">{t.subject}</div>
                      </td>

                      <td>
                        <div className="customer">
                          <span className="avatar tiny">{initials(t.customer_name)}</span>
                          {t.customer_name}
                        </div>
                      </td>

                      <td><Priority value={t.priority} /></td>

                      <td>
                        {t.assignee_name ? (
                          <div className="assignee">
                            <span className="avatar tiny">{initials(t.assignee_name)}</span>
                            {t.assignee_name}
                          </div>
                        ) : (
                          <span className="unassigned">Unassigned</span>
                        )}
                      </td>

                      <td><Status value={t?.status || 'OPEN'} /></td>

                      <td>
                        <span
                          className={
                            'sla ' +
                            (new Date(t.reply_due_at) < new Date() && !t.first_response_at
                              ? 'late'
                              : '')
                          }
                        >
                          {fmt(t.first_response_at ? t.resolution_due_at : t.reply_due_at)}
                        </span>
                      </td>

                      <td><ArrowUpRight size={16} className="row-arrow" /></td>
                    </tr>
                  ))}

                  {!tickets.length && (
                    <tr>
                      <td colSpan="7" className="empty">
                        {loading
                          ? 'Loading tickets…'
                          : 'No tickets found. Create your first ticket to get started.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="table-footer">
              <span>Showing <b>{tickets.length}</b> tickets</span>
              <span>Auto-refreshes every 30 seconds</span>
            </div>
          </section>

          <div className="footer-note">
            <span><ShieldCheck size={14} /> Activity is recorded for accountability</span>
            <span>Frontdesk · Arvo Systems</span>
          </div>
        </div>
      </main>

      {selectedTicket && (
        <div
          className="drawer-backdrop"
          onClick={() => {
            setSelected(null);
            setDetail(null);
          }}
        >
          <aside className="drawer" onClick={e => e.stopPropagation()}>
            <div className="drawer-head">
              <div>
                <div className="eyebrow">TICKET DETAILS</div>
                <h2>#{String(selectedTicket.ticket_number).padStart(4, '0')}</h2>
              </div>

              <button
                className="icon-button"
                onClick={() => {
                  setSelected(null);
                  setDetail(null);
                }}
              >
                <X size={19} />
              </button>
            </div>

            <h3>{selectedTicket.subject}</h3>

            <p className="drawer-customer">
              {selectedTicket.customer_name} · {selectedTicket.customer_email}
            </p>

            <div className="drawer-badges">
              <Priority value={selectedTicket.priority} />
              <Status value={selectedTicket.status} />
            </div>

            <div className="detail-grid">
              <Detail label="Assigned to" value={selectedTicket.assignee_name || 'Unassigned'} />
              <Detail label="Created" value={fmt(selectedTicket.created_at)} />
              <Detail label="First response due" value={fmt(selectedTicket.reply_due_at)} />
              <Detail label="Resolution due" value={fmt(selectedTicket.resolution_due_at)} />
            </div>

            {!selectedTicket.assigned_to && agents.length > 0 && (
              <button
                className="primary full"
                onClick={() =>
                  action(`/api/tickets/${selectedTicket.id}/assign`, {
                    agentId: agents[0].id
                  })
                }
              >
                Take ticket (assign to {agents[0].name})
              </button>
            )}

            <div className="conversation">
              <div className="section-title">Conversation & team notes</div>

              {(detail?.messages || []).map(m => (
                <div
                  key={m.id}
                  className={'message ' + (m.type === 'INTERNAL_NOTE' ? 'internal' : '')}
                >
                  <div className="message-meta">
                    <b>{m.author_name || 'Support agent'}</b>
                    <span>
                      {m.type === 'INTERNAL_NOTE'
                        ? '· Internal note'
                        : '· Customer reply'} · {fmt(m.created_at)}
                    </span>
                  </div>
                  <p>{m.body}</p>
                </div>
              ))}

              {!detail?.messages?.length && (
                <div className="empty small-empty">No messages yet.</div>
              )}
            </div>

            <div className="composer">
              <div className="composer-tabs">
                <button
                  className={tab === 'reply' ? 'chosen' : ''}
                  onClick={() => setTab('reply')}
                >
                  <MessageSquare size={15} /> Reply
                </button>

                <button
                  className={tab === 'note' ? 'chosen note-tab' : ''}
                  onClick={() => setTab('note')}
                >
                  <StickyNote size={15} /> Internal note
                </button>
              </div>

              {tab === 'note' && (
                <div className="private-warning">
                  <ShieldCheck size={14} />
                  Only your support team can see this note.
                </div>
              )}

              <textarea
                placeholder={
                  tab === 'reply'
                    ? 'Write a reply to the customer…'
                    : 'Write a private note for your team…'
                }
                value={message}
                onChange={e => setMessage(e.target.value)}
              />

              <div className="composer-bottom">
                <span>{tab === 'reply' ? 'Visible to customer' : 'Private to team'}</span>

                <button
                  className="primary"
                  onClick={sendMessage}
                  disabled={!message.trim()}
                >
                  <Send size={15} /> Send {tab === 'note' ? 'note' : 'reply'}
                </button>
              </div>
            </div>

            <div className="drawer-actions">
              {selectedTicket?.status === 'WAITING_FOR_CUSTOMER' && (
                <button
                  className="secondary"
                  onClick={() => updateStatus('IN_PROGRESS')}
                >
                  Resume ticket
                </button>
              )}

              {['OPEN', 'IN_PROGRESS'].includes(selectedTicket?.status) && (
                <button
                  className="secondary"
                  onClick={() => updateStatus('WAITING_FOR_CUSTOMER')}
                >
                  Wait for customer
                </button>
              )}

              {selectedTicket?.status === 'RESOLVED' ? (
                <button
                  className="secondary"
                  onClick={() =>
                    action(`/api/tickets/${selectedTicket.id}/reopen`)
                  }
                >
                  Reopen ticket
                </button>
              ) : !['CLOSED', 'WAITING_FOR_CUSTOMER'].includes(selectedTicket?.status) && (
                <button
                  className="secondary"
                  onClick={() =>
                    action(`/api/tickets/${selectedTicket.id}/resolve`)
                  }
                >
                  <CheckCircle2 size={15} /> Mark resolved
                </button>
              )}
            </div>
          </aside>
        </div>
      )}

      {showCreate && (
        <div className="modal-backdrop" onClick={() => setShowCreate(false)}>
          <form
            className="modal"
            onSubmit={createTicket}
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <div className="eyebrow">NEW REQUEST</div>
                <h2>Create ticket</h2>
              </div>

              <button
                type="button"
                className="icon-button"
                onClick={() => setShowCreate(false)}
              >
                <X size={18} />
              </button>
            </div>

            <label>
              Subject
              <input
                required
                value={form.subject}
                onChange={e => setForm({ ...form, subject: e.target.value })}
                placeholder="What does the customer need help with?"
              />
            </label>

            <div className="two-col">
              <label>
                Customer name
                <input
                  required
                  value={form.customerName}
                  onChange={e => setForm({ ...form, customerName: e.target.value })}
                  placeholder="Customer name"
                />
              </label>

              <label>
                Customer email
                <input
                  type="email"
                  value={form.customerEmail}
                  onChange={e => setForm({ ...form, customerEmail: e.target.value })}
                  placeholder="name@example.com"
                />
              </label>
            </div>

            <label>
              Priority
              <select
                value={form.priority}
                onChange={e => setForm({ ...form, priority: e.target.value })}
              >
                <option value="CRITICAL">Critical</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </label>

            <label>
              Description
              <textarea
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="Describe the issue…"
              />
            </label>

            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setShowCreate(false)}
              >
                Cancel
              </button>

              <button className="primary" type="submit">
                <Plus size={16} /> Create ticket
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, icon: Icon, tone }) {
  return (
    <div className="stat-card">
      <div className={'stat-icon ' + tone}><Icon size={18} /></div>
      <div className="stat-copy">
        <span>{label}</span>
        <b>{value ?? 0}</b>
      </div>
      <div className="stat-spark"><Activity size={16} /></div>
    </div>
  );
}

function Priority({ value }) {
  return (
    <span className={'priority ' + (value || 'MEDIUM').toLowerCase()}>
      <i />{value || 'MEDIUM'}
    </span>
  );
}

function Status({ value }) {
  const safeValue = value || 'OPEN';
  const map = {
    OPEN: 'Open',
    IN_PROGRESS: 'In progress',
    WAITING_FOR_CUSTOMER: 'Waiting',
    RESOLVED: 'Resolved',
    CLOSED: 'Closed'
  };

  return (
    <span className={'status ' + safeValue.toLowerCase()}>
      <i />{map[safeValue] || safeValue}
    </span>
  );
}

function Detail({ label, value }) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
