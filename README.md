

# Frontdesk — Support Ticket Management System

A full-stack support ticket management application built for Arvo Systems.

## Technology Stack
- Frontend: React and Vite
- Backend: Node.js and Express
- Database: PostgreSQL

## Features
- Ticket creation and management
- Agent assignment
- Priority management
- SLA tracking
- Customer replies
- Private internal notes
- Ticket status management
- Audit history

## Local Setup

### Requirements
- Node.js
- PostgreSQL or Docker
- npm

### Install dependencies
```bash
npm install
```

### Start the database
```bash
docker compose up -d
```

### Start the backend
```bash
npm run dev --prefix backend
```

### Start the frontend
```bash
npm run dev --prefix frontend
```

Open http://localhost:5173/

## Environment Configuration
Create a backend `.env` file using `backend/.env.example` and configure the database connection.

## Project Status
Developed as a full-stack support ticket management system.
