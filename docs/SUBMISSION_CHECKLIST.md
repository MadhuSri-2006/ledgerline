# LedgerLine — Submission Checklist

**Project:** LedgerLine — Snovasys Fresher Hiring Challenge 2026
**Candidate:** Madhu
**Branch:** master

---

## Backend

- [x] Express + Prisma ORM with Neon PostgreSQL
- [x] Prisma schema: User, Account, Transaction, LedgerEntry, AuditLog, IdempotencyRecord
- [x] Database migrations committed (`prisma/migrations/`)
- [x] Seed data: 4 users, 3 accounts, clearing account
- [x] `npm run verify:seed` passes — read-only conservation check verifies 4 users, 3 accounts, and balanced double-entry
- [x] Unit test suite (`tests/unit/validation.test.js`): 10 passed, 0 failed (offline financial validation & utility logic)
- [x] Database test protection: All 80 database-dependent tests automatically guarded from running against live data; execute against isolated `TEST_DATABASE_URL` when provided

## Authentication & Authorization

- [x] JWT-based authentication (`/api/auth/login`, `/api/auth/logout`, `/api/auth/me`)
- [x] Passwords hashed with bcrypt (cost factor 12)
- [x] Role-based access control: `ADMIN`, `ACCOUNT_HOLDER`, `AUDITOR`
- [x] Route-level RBAC middleware
- [x] Token validation on every protected request

## Transaction Engine (Stage 6)

- [x] Deposit endpoint — funds added via clearing account counterpart
- [x] Withdrawal endpoint — overdraft prevention enforced
- [x] Internal transfer endpoint — conserves total system value
- [x] Double-entry accounting — every transaction has balanced debit + credit entries
- [x] `Decimal` type used throughout — no floating-point arithmetic
- [x] PostgreSQL `SELECT ... FOR UPDATE` serialized concurrency for race-condition safety
- [x] Idempotency keys — repeated requests return the original result, no double-processing
- [x] Audit log — every operation recorded with actor, before/after values, timestamp

## Account Management (Stage 5)

- [x] List accounts (admin sees all; account holders see own)
- [x] Get account by ID with balance
- [x] Create account (admin only)
- [x] Balance reconciliation endpoint — detects ledger vs stored balance discrepancies

## Security (Stage 8 Review)

- [x] Overdraft prevention verified with concurrent-request tests
- [x] CORS restricted to `http://localhost:5173`
- [x] No SQL injection — all queries via Prisma parameterized
- [x] Input validation on all endpoints
- [x] `THREATS.md` documents all identified threats and mitigations
- [x] `.env` excluded from Git via `.gitignore`
- [x] `backend/.env.example` contains only placeholder values

## Frontend (Stage 9)

- [x] React 18 + Vite 5 frontend
- [x] Production build passes (`npm run build`)
- [x] Login page with JWT authentication
- [x] Account Holder Dashboard — balance, deposit, withdraw, transfer, session statement
- [x] Admin Dashboard — user management, account management, reconciliation, operational transactions
- [x] Auditor Portal — read-only, per-account and system-wide reconciliation
- [x] Role-based routing — unauthorized roles redirected
- [x] Idempotency keys sent on every financial request
- [x] Confirmation dialogs before all financial operations
- [x] No fake or mocked data — all data fetched from live backend API
- [x] CORS-compatible via Vite dev proxy (`/api → http://localhost:5000`)
- [x] Loading, error, empty, and unauthorized states handled

## Documentation

- [x] `docs/API.md` — complete API reference with request/response examples
- [x] `docs/THREATS.md` — threat model and mitigations
- [x] `docs/PROMPTS.md` — full AI prompt log for all stages
- [x] `docs/DEMO_SCRIPT.md` — step-by-step reviewer walkthrough
- [x] `README.md` — project overview, setup, run instructions, test instructions

## Code Quality

- [x] No `console.log` left in production paths
- [x] Error messages are user-friendly and do not leak stack traces
- [x] Consistent code style (ESLint configured)
- [x] All files in version control (excluding `.env`, `node_modules/`, `dist/`)

---

## Deployment Notes

The application is designed for local development and can be deployed to cloud platforms:

| Component | Recommended Platform | Notes |
|---|---|---|
| Backend (Express) | Railway / Render / Fly.io | Set `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN` |
| Frontend (Vite/React) | Vercel / Netlify | Run `npm run build`; serve `dist/`; set `VITE_API_URL` if backend is on different origin |
| Database | Neon PostgreSQL | Already cloud-hosted; no additional setup needed |

> **Status:** Database is live on Neon. Backend and frontend are running locally. Full cloud deployment not performed as part of this submission.
