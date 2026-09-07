# CID Aprueba — System Architecture

> Hierarchical Requisition Approval Workflow for Corporación Infancia y Desarrollo

---

## 1. System Overview

**CID Aprueba** is a web application that manages sequential, role-based approval of project quotations and proposals. Requisitions uploaded by users must pass through a chain of **7 sequential approval steps** (mapped to **6 role levels**) before reaching full approval status. Each step can only act on a requisition once the previous step has been approved. Note that role level 3 (Representante Legal) participates at two different steps (3 and 5).

### Core Workflow

```mermaid
stateDiagram-v2
    [*] --> Uploaded: User submits requisition
    Uploaded --> Step1_Review: Awaiting Step 1
    Step1_Review --> Step2_Review: Step 1 approves
    Step1_Review --> Rejected: Step 1 rejects
    Step2_Review --> Step3_Review: Step 2 approves
    Step2_Review --> Rejected: Step 2 rejects
    Step3_Review --> Step4_Review: Step 3 approves
    Step3_Review --> Rejected: Step 3 rejects
    Step4_Review --> Step5_Review: Step 4 approves (quotations attached)
    Step4_Review --> Rejected: Step 4 rejects
    Step5_Review --> Step6_Review: Step 5 approves (quotation selected)
    Step5_Review --> Rejected: Step 5 rejects
    Step6_Review --> Step7_Review: Step 6 approves
    Step6_Review --> Rejected: Step 6 rejects
    Step7_Review --> Approved: Step 7 approves
    Step7_Review --> Rejected: Step 7 rejects
    Rejected --> [*]
    Approved --> [*]
```

### Key Principles

- **Sequential gating:** Each level unlocks only after the previous level approves.
- **Visibility rules:** Users see dashboard metrics for all requisitions but can only open/act on requisitions at or below their approval level.
- **Audit trail:** Every approval or rejection is logged with timestamp, user, and optional comments.

---

## 2. Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Runtime** | Node.js 20+ | Fast startup, large ecosystem, single-language stack |
| **Framework** | Express 4.x | Minimal, well-understood, flexible routing and middleware |
| **Database** | SQLite via `sql.js` (persistent) | Pure-JS SQLite (no native build), synchronous API wrapper mimics `better-sqlite3`, persistent storage at `data/cid_aprueba.db` with auto-save and atomic writes |
| **Frontend** | Vanilla HTML / CSS / JS | No build step, instant reload, minimal dependencies, easy to maintain |
| **Auth** | JWT (`jsonwebtoken` + `bcrypt`) | Stateless authentication, simple role claims in token payload |
| **File uploads** | `multer` | Battle-tested multipart handling for Express |
| **Validation** | `express-validator` | Declarative input validation tied to routes |
| **Environment** | `dotenv` | Standard `.env` configuration pattern |

### Why This Stack?

The project prioritizes **speed of development**, **operational simplicity**, and **minimal infrastructure**. SQLite via sql.js eliminates the need for a separate database server and avoids native compilation dependencies. The database file persists across restarts at `data/cid_aprueba.db` with automatic saves and atomic writes. Vanilla frontend avoids build tooling. The entire application can run on a single server with `node server.js`.

---

## 3. Project Directory Structure

```
cid-aprueba/
├── server.js                  # Entry point — starts Express server
├── package.json
├── .env                       # Environment variables (not committed)
├── .env.example               # Template for .env
├── ARCHITECTURE.md            # This file
├── STANDARDS.md               # Coding standards
│
├── src/
│   ├── config/
│   │   ├── database.js        # sql.js persistent wrapper and initialization
│   │   ├── auth.js            # JWT secret, token expiry settings
│   │   └── migrations/        # Database migration files
│   │       ├── index.js       # Migration runner
│   │       ├── 001_initial_schema.js  # Initial 6-table schema
│   │       └── 002_seed_users.js      # Default user seeding
│   │
│   ├── middleware/
│   │   ├── authenticate.js    # JWT verification middleware
│   │   ├── authorize.js       # Role-based access control
│   │   ├── errorHandler.js    # Centralized error handling
│   │   └── validate.js        # Request validation wrapper
│   │
│   ├── models/
│   │   ├── User.js            # User CRUD and queries
│   │   ├── Requisition.js     # Requisition CRUD and queries
│   │   ├── ApprovalStep.js    # Approval step management (STEP_TO_ROLE_MAP)
│   │   ├── ApprovalLog.js     # Audit log queries
│   │   ├── Quotation.js       # Quotation CRUD and queries
│   │   └── QuotationDocument.js # Quotation supporting documents
│   │
│   ├── controllers/
│   │   ├── authController.js      # Login, register, token refresh
│   │   ├── requisitionController.js  # Upload, list, detail, download
│   │   ├── approvalController.js  # Approve, reject, return
│   │   ├── quotationController.js # Quotation CRUD and file management
│   │   ├── dashboardController.js # Metrics and summaries
│   │   └── userController.js      # User management (CRUD)
│   │
│   ├── routes/
│   │   ├── auth.js
│   │   ├── requisitions.js
│   │   ├── approvals.js
│   │   ├── quotations.js
│   │   ├── dashboard.js
│   │   └── users.js               # User management routes
│   │
│   └── utils/
│       ├── AppError.js        # Custom error class
│       └── logger.js          # Logging utility
│
├── public/                    # Static frontend assets
│   ├── index.html             # Single-page app (login + main views)
│   ├── css/
│   │   └── styles.css         # Global styles with CID brand colors
│   ├── js/
│   │   ├── api.js             # Fetch wrapper with JWT handling
│   │   └── app.js             # Main application logic (SPA routing, views)
│   └── assets/
│       └── logo-LA-CID.svg    # CID logo
│
├── uploads/                   # Uploaded document files (gitignored)
│
├── data/                      # Database storage (gitignored)
│   ├── cid_aprueba.db         # SQLite database file
│   └── backups/               # Pre-migration backups
│
└── tests/
    ├── auth.test.js
    ├── documents.test.js
    └── approvals.test.js
```

---

## 4. Database Schema

### Entity Relationship Diagram

```mermaid
erDiagram
    users ||--o{ requisitions : uploads
    users ||--o{ approval_logs : performs
    requisitions ||--o{ approval_steps : has
    approval_steps ||--o{ approval_logs : generates

    users {
        integer id PK
        text username UK
        text email UK
        text password_hash
        integer role_level
        text full_name
        text territory
        text created_at
        text updated_at
    }

    requisitions {
        integer id PK
        text title
        text description
        text file_path
        text original_filename
        integer uploaded_by FK
        text status
        integer current_approval_level
        integer selected_quotation_id FK
        text created_at
        text updated_at
    }

    approval_steps {
        integer id PK
        integer requisition_id FK
        integer step_level
        text status
        integer assigned_role_level
        text created_at
        text updated_at
    }

    approval_logs {
        integer id PK
        integer requisition_id FK
        integer approval_step_id FK
        integer user_id FK
        text action
        text comments
        text created_at
    }
```

### Table Details

#### `users`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PK, AUTOINCREMENT | Unique user ID |
| `username` | TEXT | UNIQUE, NOT NULL | Login username |
| `email` | TEXT | UNIQUE, NOT NULL | User email |
| `password_hash` | TEXT | NOT NULL | bcrypt-hashed password |
| `role_level` | INTEGER | NOT NULL, CHECK 1-6 | 1 = Coordinador/a de Territorio, 2 = Director/a Programática, 3 = Representante Legal, 4 = Encargado/a de Compras, 5 = Área Financiera, 6 = Área de Compras |
| `full_name` | TEXT | NOT NULL | Display name |
| `is_active` | INTEGER | DEFAULT 1 | Soft-delete flag |
| `created_at` | TEXT | DEFAULT CURRENT_TIMESTAMP | |
| `updated_at` | TEXT | DEFAULT CURRENT_TIMESTAMP | |

#### `requisitions`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PK, AUTOINCREMENT | Unique requisition ID |
| `title` | TEXT | NOT NULL | Requisition title |
| `description` | TEXT | | Optional description |
| `file_path` | TEXT | NOT NULL | Server path to uploaded file |
| `original_filename` | TEXT | NOT NULL | Original upload filename |
| `uploaded_by` | INTEGER | FK → users.id | Uploader user ID |
| `status` | TEXT | NOT NULL | `pending`, `in_review`, `approved`, `rejected` |
| `current_approval_level` | INTEGER | DEFAULT 1 | Which step level is currently being reviewed (1–7) |
| `selected_quotation_id` | INTEGER | FK → quotations.id, NULL | The quotation selected by the Representante Legal at step 5 |
| `created_at` | TEXT | DEFAULT CURRENT_TIMESTAMP | |
| `updated_at` | TEXT | DEFAULT CURRENT_TIMESTAMP | |

#### `approval_steps`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PK, AUTOINCREMENT | |
| `requisition_id` | INTEGER | FK → requisitions.id | |
| `step_level` | INTEGER | NOT NULL, 1-7 | Which step this represents in the 7-step workflow |
| `status` | TEXT | DEFAULT `pending` | `pending`, `approved`, `rejected` |
| `assigned_role_level` | INTEGER | NOT NULL | Role level required to act |
| `created_at` | TEXT | DEFAULT CURRENT_TIMESTAMP | |
| `updated_at` | TEXT | DEFAULT CURRENT_TIMESTAMP | |

**Note:** When a requisition is uploaded, 7 `approval_steps` rows are created (one per step), all starting as `pending`. The `assigned_role_level` for each step is determined by the [`STEP_TO_ROLE_MAP`](src/models/ApprovalStep.js:8) constant (see Section 7 below).

#### `approval_logs`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PK, AUTOINCREMENT | |
| `requisition_id` | INTEGER | FK → requisitions.id | |
| `approval_step_id` | INTEGER | FK → approval_steps.id | |
| `user_id` | INTEGER | FK → users.id | Who performed the action |
| `action` | TEXT | NOT NULL | `approved`, `rejected` |
| `comments` | TEXT | | Optional reviewer comments |
| `created_at` | TEXT | DEFAULT CURRENT_TIMESTAMP | |

### Database Initialization Flow

```mermaid
flowchart TD
    B1[Server arranca] --> B2{Existe archivo DB en disco?}
    B2 -->|Sí| B3[Cargar DB desde archivo]
    B2 -->|No| B4[Crear DB vacía en memoria]
    B3 --> B5[Habilitar PRAGMA foreign_keys]
    B4 --> B5
    B5 --> B6[Ejecutar migraciones pendientes]
    B6 --> B7[Guardar a disco]
    B7 --> B8[Iniciar auto-save cada 30s]
    B8 --> B9[Registrar shutdown handlers]
    B9 --> B10[DB lista para consultas]
```

The [`initializeDatabase()`](src/config/database.js:198) function is called once from `server.js` at startup. It:

1. **Loads from disk** if `data/cid_aprueba.db` exists, or creates a fresh in-memory database if not
2. **Runs pending migrations** via the [`runMigrations()`](src/config/migrations/index.js:26) runner — only migrations not yet recorded in `schema_migrations` are applied
3. **Starts auto-save** — an interval persists the database to disk every 30 seconds using atomic writes (temp file + `fs.renameSync`)
4. **Registers shutdown handlers** — `SIGINT`, `SIGTERM`, and `uncaughtException` all trigger a final save before exit

### Schema Migrations

The migration system uses a `schema_migrations` tracking table to record which migrations have been applied:

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT DEFAULT (datetime('now'))
);
```

Migration files live in [`src/config/migrations/`](src/config/migrations/) and are executed in order. Before running any pending migrations, the runner creates a **backup** of the database file in `data/backups/`. Each migration runs inside its own transaction — if it fails, the transaction is rolled back and the process aborts.

| Migration | Version | Description |
|-----------|---------|-------------|
| [`001_initial_schema.js`](src/config/migrations/001_initial_schema.js) | 1 | Creates the 6 core tables (users, requisitions, approval_steps, approval_logs, quotations, quotation_documents) |
| [`002_seed_users.js`](src/config/migrations/002_seed_users.js) | 2 | Seeds 7 default users (only if users table is empty) |

### Data Persistence & Safety

| Mechanism | Description |
|-----------|-------------|
| **Auto-save** | Every 30 seconds, the in-memory database is exported and written to disk |
| **Transaction save** | After each explicit `db.transaction()`, the database is persisted immediately |
| **Atomic writes** | Writes go to a `.tmp` file first, then `fs.renameSync` replaces the original — prevents corruption on interrupted writes |
| **Graceful shutdown** | `SIGINT`/`SIGTERM` handlers save the database before `process.exit(0)` |
| **Pre-migration backup** | Before applying pending migrations, the DB file is copied to `data/backups/database-backup-<timestamp>.sqlite` |

---

## 5. API Endpoints

All endpoints return JSON. Protected routes require `Authorization: Bearer <token>` header.

### Authentication

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/login` | No | Authenticate and receive JWT |
| POST | `/api/auth/register` | Admin | Create new user account |
| GET | `/api/auth/me` | Yes | Get current user profile |

### Requisitions

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/requisitions` | Yes | List requisitions visible to current user |
| GET | `/api/requisitions/:id` | Yes | Get requisition detail with approval history |
| POST | `/api/requisitions` | Yes | Upload new requisition (multipart) |
| GET | `/api/requisitions/:id/download` | Yes | Download the original file |

### Approvals

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/approvals/:requisitionId/approve` | Yes | Approve requisition at current level |
| POST | `/api/approvals/:requisitionId/reject` | Yes | Reject requisition with comments |
| GET | `/api/approvals/:requisitionId/history` | Yes | Get full approval log for a requisition |

### Dashboard

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/dashboard/stats` | Yes | Aggregate metrics: total, pending, approved, rejected |
| GET | `/api/dashboard/pending` | Yes | Requisitions awaiting current user action |
| GET | `/api/dashboard/recent` | Yes | Recently processed requisitions |

### User Management (Representante Legal only — role_level 3)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/users` | Yes (role 3) | List all users (including inactive) |
| POST | `/api/users` | Yes (role 3) | Create a new user |
| PUT | `/api/users/:id` | Yes (role 3) | Update user details (email, name, role, territory, gender) |
| PUT | `/api/users/:id/password` | Yes (role 3) | Reset a user's password |
| PUT | `/api/users/:id/toggle` | Yes (role 3) | Toggle user active/inactive status |

---

## 6. Authentication & Authorization Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server
    participant DB as SQLite

    C->>S: POST /api/auth/login with username + password
    S->>DB: Find user by username
    DB-->>S: User record
    S->>S: bcrypt.compare password
    S->>S: Sign JWT with user id + role_level
    S-->>C: 200 with token + user info

    Note over C: Store token in localStorage

    C->>S: GET /api/requisitions with Bearer token
    S->>S: authenticate middleware verifies JWT
    S->>S: authorize middleware checks role_level
    S->>DB: Query requisitions filtered by role visibility
    DB-->>S: Requisition list
    S-->>C: 200 with filtered requisitions
```

### JWT Payload Structure

```json
{
  "sub": 1,
  "username": "coord.territorio",
  "role_level": 1,
  "iat": 1693000000,
  "exp": 1693086400
}
```

### Authorization Rules

| Rule | Implementation |
|------|---------------|
| **View dashboard metrics** | All authenticated users |
| **View requisition list** | All authenticated users see metadata; detail access restricted by level |
| **Open requisition detail** | User role_level must be ≤ requisition current_approval_level |
| **Approve/Reject** | User role_level must equal requisition current_approval_level |
| **Upload requisition** | Coordinadores de Territorio (role_level = 1) only |
| **Manage users** | Representante Legal (role_level = 3) only — see Section 7.1 |

---

### User Management (role_level 3 — Representante Legal)

Only users with `role_level === 3` (Representante Legal) can access user management features. Every endpoint in [`userController.js`](src/controllers/userController.js) checks `req.user.role_level !== 3` and throws a `403 FORBIDDEN` error if the condition is not met.

| Capability | Details |
|------------|---------|
| **List users** | Retrieves all users including inactive ones (via [`User.findAllIncludingInactive()`](src/models/User.js)) |
| **Create users** | Can create users of any role level (1–6) and any territory. Validates unique username and email. Password is hashed with `bcrypt` (salt rounds = 10) |
| **Edit users** | Can update email, full name, role level, territory, gender, and active status. Cannot change username |
| **Reset passwords** | Can reset any user's password (minimum 6 characters) |
| **Activate/Deactivate** | Toggles `is_active` flag (0/1). Cannot deactivate own account (returns `400 SELF_DEACTIVATION`) |

The frontend shows a **"Gestión de Usuarios"** tab in the navigation only when the logged-in user has `role_level === 3`.


## 7. Approval Workflow State Machine

### Role Levels vs. Workflow Steps

The system uses **6 role levels** but **7 workflow steps**. Role level 3 (Representante Legal) participates at two different steps. The mapping is defined in [`STEP_TO_ROLE_MAP`](src/models/ApprovalStep.js:8):

```javascript
const STEP_TO_ROLE_MAP = {
  1: 1, // Coordinador/a de Territorio
  2: 2, // Director/a Programática
  3: 3, // Representante Legal (primera vez)
  4: 4, // Encargado/a de Compras
  5: 3, // Representante Legal (segunda vez — selecciona cotización)
  6: 5, // Área Financiera
  7: 6, // Área de Compras
};
```

| Role Level | Role Name | Participates at Step(s) |
|------------|-----------|------------------------|
| 1 | Coordinador/a de Territorio | Step 1 |
| 2 | Director/a Programática | Step 2 |
| 3 | Representante Legal | Step 3 AND Step 5 |
| 4 | Encargado/a de Compras | Step 4 |
| 5 | Área Financiera | Step 6 |
| 6 | Área de Compras | Step 7 |

### Requisition Status Transitions

```
UPLOADED → IN_REVIEW → APPROVED
                ↘ REJECTED
```

### 7-Step Approval Flow

| Step | Role | Action |
|------|------|--------|
| 1 | Coordinador/a de Territorio | Upload requisition + approve |
| 2 | Director/a Programática | Review + approve |
| 3 | Representante Legal | Review + approve (first time) |
| 4 | Encargado/a de Compras | Upload 1–3 quotations with supporting docs + approve |
| 5 | Representante Legal | Review quotations, **select one**, approve (second time) |
| 6 | Área Financiera | Review + approve |
| 7 | Área de Compras | Final approval |

### Per-Step Logic

1. Requisition is uploaded → `status = 'pending'`, `current_approval_level = 1`
2. All 7 `approval_steps` are created with `status = 'pending'`, each with `assigned_role_level` from `STEP_TO_ROLE_MAP`
3. When the user with the matching role approves step 1:
   - `approval_steps[step_level=1].status = 'approved'`
   - `requisitions.current_approval_level = 2`
   - `requisitions.status = 'in_review'`
   - An `approval_logs` entry is created
4. Process repeats for steps 2–7, with special behavior at steps 4 and 5:
   - **Step 4 (Encargado/a de Compras):** Must attach at least 1 complete quotation (with all 4 supporting documents) before approving
   - **Step 5 (Representante Legal):** Must select one quotation from those attached at step 4 before approving. The selected quotation ID is stored in `requisitions.selected_quotation_id`
5. When step 7 is approved:
   - `requisitions.status = 'approved'`
   - `requisitions.current_approval_level = 8` (past all steps)
6. If **any** step rejects:
   - `requisitions.status = 'rejected'`
   - The step and all subsequent steps remain `pending`
   - An `approval_logs` entry records the rejection with comments

### Quotation Selection at Step 5

At step 5, the Representante Legal reviews the quotations attached by the Encargado/a de Compras at step 4. Each quotation has a `status` field:

| Quotation Status | Description |
|-----------------|-------------|
| `active` | Default status when created at step 4 |
| `selected` | Chosen by the Representante Legal at step 5 |
| `not_selected` | Not chosen (set automatically when another quotation is selected) |

When the Representante Legal selects a quotation:
- The selected quotation's status becomes `'selected'`
- All other quotations for the same requisition become `'not_selected'`
- `requisitions.selected_quotation_id` is set to the chosen quotation's ID
- The approve button at step 5 is only enabled after a quotation has been selected

### Rejection Handling

Rejected requisitions are terminal — they cannot re-enter the approval flow. If a revised version is needed, the user uploads a new requisition.

### Seed Users

The system seeds 7 default users (via [`002_seed_users.js`](src/config/migrations/002_seed_users.js)) for testing:

| Username | Role Level | Role Name | Territory |
|----------|-----------|-----------|-----------|
| `coord.territorio` | 1 | Coordinador/a de Territorio | Chocó |
| `coord.territorio2` | 1 | Coordinador/a de Territorio | Santander |
| `dir.programatica` | 2 | Director/a Programática | — |
| `rep.legal` | 3 | Representante Legal | — |
| `enc.compras` | 4 | Encargado/a de Compras | — |
| `area.financiera` | 5 | Área Financiera | — |
| `area.compras` | 6 | Área de Compras | — |

All seed users share the default password `cid2024`.

---

## 8. Frontend Architecture

The frontend is a set of static HTML pages served from `/public`. JavaScript modules handle API communication and DOM manipulation.

### Page Structure

| Page | Purpose |
|------|---------|
| `index.html` | Single-page app: login, dashboard, requisition list, detail, create, profile, users (Gestión de Usuarios) |

### Brand Design Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--color-primary` | `#C85A2A` (Orange) | Primary buttons, active states, accents |
| `--color-secondary` | `#6B8E23` (Olive Green) | Success states, approved badges |
| `--color-dark` | `#3D5A1E` (Dark Green) | Headers, navigation, text emphasis |
| `--color-background` | `#F5F0E8` (Cream/Beige) | Page background |
| `--color-surface` | `#FFFFFF` | Cards, modals |
| `--color-error` | `#C0392B` | Rejection states, error messages |

### Client-Side Auth

- JWT stored in `localStorage`
- [`api.js`](public/js/api.js) wraps `fetch()` to auto-attach `Authorization` header
- On 401 response, redirect to login page
- Role level stored client-side to conditionally render approve/reject buttons

---

## 9. Scalability Considerations

| Concern | Approach |
|---------|----------|
| **More approval steps** | Add entries to `STEP_TO_ROLE_MAP` in [`ApprovalStep.js`](src/models/ApprovalStep.js:8) and update `MAX_STEP_LEVEL`; the step→role mapping is configurable, not hardcoded |
| **Multiple approvers per level** | Add `assigned_user_id` to `approval_steps`; current design supports one approver per role level |
| **File storage growth** | Move from local `uploads/` to S3-compatible storage; change only `Requisition` model |
| **Database scaling** | Migrate from SQLite to PostgreSQL; the `sql.js` wrapper API maps cleanly to `pg` with parameterized queries (see Future Migration Path below) |
| **Notifications** | Add email/webhook notifications in approval controller without changing workflow logic |
| **Audit compliance** | `approval_logs` table already captures full history; add export endpoint as needed |
| **Multi-tenancy** | Add `organization_id` to all tables; filter queries by org context |

---

## 10. Future Migration Path

The current database setup is designed for easy evolution:

| Stage | Technology | Use Case |
|-------|-----------|----------|
| **Current** | SQLite via sql.js (local file) | Development, single-server deployment, free |
| **Future** | PostgreSQL on Google Cloud SQL, Supabase, or Neon | Multi-instance, high concurrency, managed backups |

### Strategy

1. Create `src/config/database-pg.js` with the same wrapper API (`prepare`, `get`, `all`, `run`, `exec`, `transaction`)
2. Use a `DB_DRIVER` environment variable (`sqlite` or `postgres`) in [`env.js`](src/config/env.js) to select the backend
3. `require('../config/database')` resolves to the correct driver at startup

### SQL Dialect Differences to Watch

| Feature | SQLite (current) | PostgreSQL (future) |
|---------|-----------------|-------------------|
| Auto-increment | `AUTOINCREMENT` | `SERIAL` / `IDENTITY` |
| Booleans | `INTEGER` (0/1) | `BOOLEAN` nativo |
| Date/time | `TEXT` + `datetime('now')` | `TIMESTAMP` + `NOW()` |
| Upsert | `INSERT OR REPLACE` | `ON CONFLICT DO UPDATE` |
| Case sensitivity | Insensitive | Sensitive |
| Parameters | `?` positional | `$1, $2` numbered |

---

## 11. Deployment

### Minimum Requirements

- Node.js 20+
- Writable filesystem for SQLite DB and uploads
- Single port (default: 3000)

### Startup

```bash
cp .env.example .env    # Configure secrets
npm install             # Install dependencies
node server.js          # Start server
```

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `JWT_SECRET` | Secret for signing tokens | `a-long-random-string` |
| `JWT_EXPIRES_IN` | Token expiry | `24h` |
| `DB_PATH` | Path to SQLite file | `./data/cid_aprueba.db` |
| `UPLOAD_DIR` | Upload directory | `./uploads` |
| `MAX_FILE_SIZE` | Max upload size in bytes | `10485760` |
| `NODE_ENV` | Environment | `development` |
