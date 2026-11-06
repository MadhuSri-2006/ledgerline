# LedgerLine — Secure, Auditable Money-Movement Ledger

LedgerLine is a multi-tenant, double-entry financial ledger platform built for the **Snovasys Fresher Hiring Challenge 2026**. It provides immutable transaction recording, structured audit logging, strict overdraft prevention, and balance reconciliation guarantees.

---

## Architecture Overview

```
                      +-----------------------------+
                      |      React 18 + Vite        |
                      |   (Role-Based UI / Port 5173)|
                      +--------------+--------------+
                                     |  HTTP / JWT (Bearer)
                                     v
                      +-----------------------------+
                      |     Express 4 REST API      |
                      |   (Controllers / RBAC / 5000)|
                      +--------------+--------------+
                                     |  ACID Transactions ($transaction)
                                     |  SELECT ... FOR UPDATE (Row Locking)
                                     v
                      +-----------------------------+
                      |   Prisma ORM (Schema/Client)|
                      +--------------+--------------+
                                     |  TLS Pooler
                                     v
                      +-----------------------------+
                      |    Neon Cloud PostgreSQL    |
                      | (Accounts, Ledger, Audits)  |
                      +-----------------------------+
```

### Core Financial & Security Guarantees
1. **Double-Entry Accounting**: Every financial operation creates balanced debit and credit entries (`sum(debits) === sum(credits)`). Money is neither created nor destroyed.
2. **ACID Concurrency & Overdraft Prevention**: Row-level locking (`SELECT ... FOR UPDATE` ordered by UUID) inside PostgreSQL serializes concurrent withdrawals and transfers, preventing double-spend and overdrafts under race conditions.
3. **Exact Decimal Precision**: All monetary values are handled using `Prisma.Decimal` (mapped to PostgreSQL `DECIMAL(14,2)`). JavaScript floating-point arithmetic is never used for balances or money calculations.
4. **End-to-End Idempotency**: All mutating financial endpoints accept an `Idempotency-Key` header. Duplicate or retried requests return the cached original response without reprocessing.
5. **Immutable Audit Trail**: Declines, mutations, and balance checks are committed with user attribution, timestamp, IP, and reason.
6. **Role-Based Access Control (RBAC)**:
   - `ADMIN`: User provisioning, account creation, system-wide transaction operations, and reconciliation.
   - `ACCOUNT_HOLDER`: Deposit, withdraw, and transfer from own accounts; view own account statements.
   - `AUDITOR`: Read-only compliance portal with single-account and system-wide reconciliation engines.

---

## Demo Credentials

The database is pre-seeded with the following demo credentials:

| Role | Email | Password | Account Number | Scope |
| :--- | :--- | :--- | :--- | :--- |
| **Admin** | `admin@ledgerline.internal` | `AdminPassword123!` | N/A | System Operations & User Provisioning |
| **Account Holder (Alice)** | `alice@ledgerline.internal` | `AlicePassword123!` | `ACC-ALICE-001` | Deposits, Withdrawals & Transfers |
| **Account Holder (Bob)** | `bob@ledgerline.internal` | `BobPassword123!` | `ACC-BOB-001` | Deposits, Withdrawals & Transfers |
| **Auditor** | `auditor@ledgerline.internal` | `AuditorPassword123!` | N/A | Read-Only Audit & Balance Reconciliation |

*System clearing account: `SYS-CLEARING-001` serves as the internal counterpart for external deposits and withdrawals.*

---

## Quick Start (Local Setup)

### 1. Prerequisites
- Node.js (v18+ or v20+)
- npm or pnpm

### 2. Backend Setup
```bash
cd backend

# Copy sample environment configuration
cp .env.example .env

# Install backend dependencies
npm install

# Verify seeded database records
npm run verify:seed

# Start the Express API server (starts on http://localhost:5000)
npm start
# (or for development with auto-reload: npm run dev)
```

### 3. Frontend Setup
```bash
cd ../frontend

# Install frontend dependencies
npm install

# Start Vite development server (starts on http://localhost:5173)
npm run dev
```

Open **http://localhost:5173** in your browser. Use the one-click demo login buttons to sign in as any role.

---

## Running Automated Tests

The backend test suite includes offline unit tests and database integration tests covering authentication, authorization, account management, double-entry accounting, concurrency, idempotency, and rollback edge cases.

```bash
cd backend

# Run automated tests
npm test
```

### Database Test Isolation & Safety
To protect the live/demo database from accidental modification:
- By default, `npm test` runs all offline unit tests (`tests/unit/validation.test.js`) and safely skips database-dependent test suites if no separate `TEST_DATABASE_URL` is set.
- To execute the complete 80-test database integration suite, set `TEST_DATABASE_URL` in `backend/.env` pointing to an isolated test database (distinct from `DATABASE_URL`).

### Test Suite Structure
- `tests/unit/validation.test.js`: Pure unit tests for monetary decimal parsing, limit enforcement, 2-decimal validation, UUID format checks, reference generation, and payload hashing (10 tests, offline).
- `tests/auth.test.js`: JWT signing, tampered token rejection, expired tokens, role authorization (ADMIN, ACCOUNT_HOLDER, AUDITOR), and credential sanitization (18 tests).
- `tests/accounts.test.js`: Account provisioning, BOLA/IDOR protection, account listing scoping, and balance reconciliation engine (17 tests).
- `tests/transactions.test.js`: Core ACID transaction engine: deposits, withdrawals, transfers, 2-decimal validation, self-transfer prevention, concurrent double-spend race prevention, idempotency deduplication, and failure rollbacks (45 tests).

---

## Production Build

```bash
cd frontend
npm run build
```
The optimized production bundle is generated in `frontend/dist/`.

---

## API Summary

All endpoints (except `/api/auth/login`) require `Authorization: Bearer <JWT_TOKEN>`. Financial mutation endpoints accept `Idempotency-Key: <UUID_OR_STRING>`.

| Method | Endpoint | Allowed Roles | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Public | Authenticate user & receive signed JWT |
| `GET` | `/api/auth/me` | Authenticated | Validate session and fetch active user profile |
| `GET` | `/api/admin/users` | `ADMIN` | List all users |
| `POST` | `/api/admin/users` | `ADMIN` | Provision a new user |
| `GET` | `/api/accounts` | All Roles | List accounts (scoped to owner for ACCOUNT_HOLDER) |
| `POST` | `/api/accounts` | `ADMIN` | Provision a new account |
| `GET` | `/api/accounts/:id` | `ADMIN`, `AUDITOR`, Owner | Get account details and current balance |
| `GET` | `/api/accounts/:id/reconcile` | `ADMIN`, `AUDITOR` | Reconcile stored balance against ledger sum |
| `POST` | `/api/transactions/deposit` | `ADMIN`, Owner | Deposit funds (counterpart: SYSTEM_CLEARING) |
| `POST` | `/api/transactions/withdraw` | `ADMIN`, Owner | Withdraw funds (checks available balance) |
| `POST` | `/api/transactions/transfer` | `ADMIN`, Owner | Transfer funds between customer accounts |

---

## Documentation Index

- [docs/API.md](docs/API.md): Comprehensive API specification with request/response schemas.
- [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md): Step-by-step reviewer guide for testing all roles and scenarios.
- [docs/SUBMISSION_CHECKLIST.md](docs/SUBMISSION_CHECKLIST.md): Complete requirements compliance matrix.
- [docs/THREATS.md](docs/THREATS.md): Threat modeling, security mitigations, and STRIDE analysis.
- [docs/PROMPTS.md](docs/PROMPTS.md): AI interaction history and engineering prompt log.
