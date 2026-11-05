# LedgerLine — AI Development Prompts & Interaction Log

This document records genuine development prompts, AI assistant responses, architectural critiques, rejected approaches, and student-driven corrections for the **Snovasys Fresher Hiring Challenge 2026**.

---

## Log Entry 1: Project Initialization & Architectural Review

- **Date**: 2026-11-05
- **Tool**: Antigravity (Google DeepMind) / Claude
- **Stage**: Stage 1 — Architecture & Project Structure

### Initial Prompt Summary
Requested an architectural proposal, folder structure, database schema, and concurrency/idempotency design for LedgerLine, a secure, auditable money-movement ledger.

### Initial AI Proposal & Flaws Identified by Student
The AI proposed a standard layered Express + PostgreSQL architecture. However, the student conducted an in-depth review and identified several critical issues and ambiguities:

1. **Incomplete Double-Entry Accounting**:
   - *AI Flaw*: The initial proposal treated internal transfers with paired entries, but did not formally balance external deposits and withdrawals against a clearing entity.
   - *Student Correction*: Required a designated `SYSTEM_CLEARING` account so that every single operation in the system (deposits, withdrawals, transfers) strictly satisfies $\sum \text{Debits} = \sum \text{Credits}$.

2. **Vulnerable Idempotency Race Condition**:
   - *AI Flaw*: The initial idempotency explanation relied on standard "check if key exists, then insert", which is vulnerable to simultaneous concurrent duplicate requests.
   - *Student Correction*: Mandated a database-enforced unique constraint on `(userId, idempotencyKey)` with atomic insertion so race conditions are caught by the database engine.

3. **Inaccurate JWT Security Description**:
   - *AI Flaw*: The AI loosely described JWTs as "encrypted Bearer tokens".
   - *Student Correction*: Clarified that standard JWTs (`JWS`) are cryptographically signed, not encrypted. Payloads are readable by anyone who decodes base64url, so no sensitive data (passwords, hashes, secrets) should ever be in the token, and signature verification must happen strictly server-side.

4. **Declined Attempt Persistence Across Rollbacks**:
   - *AI Flaw*: The AI did not explain how declined or unauthorized attempts would be preserved if a database transaction rolled back.
   - *Student Correction*: Clarified that declined/unauthorized attempts must be written outside the rolled-back ledger transaction (via independent database writes) so the audit trail survives.

5. **Balance Storage vs Derivation**:
   - *Clarification*: Clarified that `Account.balance` will be an authoritative stored column updated atomically in lockstep with `LedgerEntry` creation (with row-level locking for concurrency), while preserving full reconciliation capability against $\sum \text{Credits} - \sum \text{Debits}$.

6. **Role Permissions Clarification**:
   - *Clarification*: Admin creates demo accounts and users; Account Holders operate only on their own accounts; Auditors possess system-wide read-only access.

### Status & Verification
The architecture was revised and approved with these corrections. Stage 1 directory structure and documentation files initialized and committed in Git (`commit 75a723b`, `commit 129eb26`).

---

## Log Entry 2: Database Schema Design (Prisma)

- **Date**: 2026-11-05
- **Tool**: Antigravity (Google DeepMind) / Claude
- **Stage**: Stage 2 — Prisma Schema & Double-Entry Modeling

### Prompt Summary
Designed the Prisma database schema for LedgerLine covering Users, Accounts, TransactionRecords, LedgerEntries, IdempotencyKeys, and AuditLogs with PostgreSQL `Decimal(14,2)` precision, double-entry system clearing, and role segregation.

### Schema Decisions & Integrity Design
1. **Precision Types**: Configured `Decimal(14,2)` on all monetary fields (`balance`, `amount`, `balanceAfter`, `runningBalance`) to prevent JavaScript floating-point rounding errors.
2. **Double-Entry Enforcement**:
   - `AccountType` includes `STANDARD` (customer accounts) and `SYSTEM_CLEARING` (system treasury clearing account).
   - `LedgerEntry` maps `DEBIT` and `CREDIT` entries linked to parent `TransactionRecord`.
   - Every transaction balances: external deposits debit `SYSTEM_CLEARING` and credit the customer; withdrawals debit the customer and credit `SYSTEM_CLEARING`; internal transfers debit sender and credit receiver.
3. **Idempotency Composite Constraint**: `IdempotencyKey` includes `@@unique([userId, key])` so concurrent duplicate requests fail at the database level.
4. **Audit Trail Survival**: `AuditLog` is decoupled from transactions via nullable foreign keys so declined and unauthorized attempts persist even if financial transactions roll back.
5. **Reconciliation Formula**: The live balance in `Account.balance` can be reconciled against historical ledger entries: $\text{Balance} = \sum \text{Credits} - \sum \text{Debits}$.

### Validation Status
- Schema file created at `backend/prisma/schema.prisma`.
- Installed backend dependencies (`prisma`, `@prisma/client`, etc.).
- Initial validation with `npx prisma validate` caught error `P1012: Environment variable not found: DATABASE_URL`, confirming strict syntax & configuration enforcement.
- Created `backend/.env` with placeholder `DATABASE_URL`.
- Re-executed `npx prisma validate`: Output: `The schema at prisma\schema.prisma is valid 🚀`.
- Formatted schema with `npx prisma format`.
- *Refinement based on student review*: Removed redundant indexes that duplicated unique constraints (`email`, `accountNumber`, `reference`, `(userId, key)`). Clarified that syntactic schema validation is not a substitute for live PostgreSQL connection testing (scheduled for Stage 3).

---

## Log Entry 3: Live Database Connection & Non-Destructive Verification

- **Date**: 2026-11-05
- **Tool**: Antigravity (Google DeepMind) / Claude
- **Stage**: Stage 3 — Neon PostgreSQL Setup, Migrations & Seed Verification

### Actions & Security Verification
1. **Git Protection Verified**: Confirmed via `git check-ignore -v backend/.env` that `.env` is ignored by rule `.gitignore:7`. `git status` confirmed zero credentials tracked.
2. **Smoke Test Executed**: Tested connectivity using Prisma `$queryRaw` without modifying schema or data:
   - Output: `SUCCESS: Connected to PostgreSQL database!`
   - Server: `PostgreSQL 18.6 on aarch64-unknown-linux-gnu` (Neon Hosted PostgreSQL)
3. **Prisma Migration Applied**:
   - Command: `npx prisma migrate dev --name init`
   - Generated migration SQL: `backend/prisma/migrations/20261105143315_init/migration.sql`
   - Created PostgreSQL tables: `User`, `Account`, `TransactionRecord`, `LedgerEntry`, `IdempotencyKey`, `AuditLog`.
4. **Demo Data Seeded**:
   - Command: `npm run seed`
   - Seeded demo users with 10-round bcrypt password hashing:
     - Admin: `admin@ledgerline.internal` (`ADMIN`)
     - Auditor: `auditor@ledgerline.internal` (`AUDITOR`)
     - Alice: `alice@ledgerline.internal` (`ACCOUNT_HOLDER`)
     - Bob: `bob@ledgerline.internal` (`ACCOUNT_HOLDER`)
   - Seeded system accounts:
     - `SYS-CLEARING-001` (`SYSTEM_CLEARING`, balance: `-1500.00 INR`, `userId: null`)
     - Alice (`ACC-ALICE-001`, balance: `1000.00 INR`)
     - Bob (`ACC-BOB-001`, balance: `500.00 INR`)
   - Double-entry initial funding: 2 `DEPOSIT` transactions creating 4 balanced `LedgerEntry` rows.
5. **Live Seed Verification Results**:
   - Command: `npm run verify:seed`
   - Result: All 4 bcrypt passwords matched.
   - Result: Stored balance vs. ledger derivation:
     - `ACC-ALICE-001`: Stored = 1000.00, Reconciled = 1000.00 (`MATCH`)
     - `ACC-BOB-001`: Stored = 500.00, Reconciled = 500.00 (`MATCH`)
     - `SYS-CLEARING-001`: Stored = -1500.00, Reconciled = -1500.00 (`MATCH`)
   - System conservation: Total Debits (1500.00 INR) == Total Credits (1500.00 INR).
   - Audit trail: Initial deposit and seed events logged.

---

## Log Entry 4: Authentication & Role-Based Authorization Implementation

- **Date**: 2026-11-05
- **Tool**: Antigravity (Google DeepMind) / Claude
- **Stage**: Stage 4 — Authentication & Role-Based Authorization

### Prompt Summary
Implement login endpoint with bcrypt verification, signed JWT issuance, auth middleware, role-based access control (`ADMIN`, `ACCOUNT_HOLDER`, `AUDITOR`), account ownership restrictions (BOLA/IDOR prevention), and automated tests.

### Implementation Details
1. **Cryptographically Signed JWTs**: Created `src/utils/jwt.js` using `jsonwebtoken` with `HS256` and minimal non-sensitive public claims (`userId`, `email`, `role`).
2. **Auth Middleware**: Created `src/middleware/authMiddleware.js` verifying Bearer tokens, token expiration, and database user presence.
3. **Role Middleware (RBAC)**: Created `src/middleware/roleMiddleware.js` enforcing server-side role permissions.
4. **Account Ownership (BOLA Prevention)**: Created `src/middleware/ownershipMiddleware.js`. Blocks cross-user account access with `403 Forbidden` and logs security refusal to `AuditLog`. Restricts `AUDITOR` to read-only methods (`GET`).
5. **Controllers & Routes**: Implemented `authController.js`, `adminController.js`, `authRoutes.js`, `adminRoutes.js`, and `accountRoutes.js`.
6. **API Documentation**: Documented auth endpoints in `docs/API.md`.

### Actual Issue Encountered & Solution
- **Issue 1 (Test Timeout)**: Initial test run failed with `Exceeded timeout of 5000 ms for a hook` in `beforeAll`.
  - *Root Cause*: Neon PostgreSQL is an AWS cloud database; 4 sequential logins requiring bcrypt password hashing (10 salt rounds) and network roundtrips took ~9 seconds, exceeding Jest's default 5-second timeout.
  - *Resolution*: Created `jest.config.js` with `testTimeout: 30000` and explicit `jest.setTimeout(30000)` in `tests/auth.test.js`.
- **Issue 2 (CWE-532 Sensitive Log Leak)**: Security review identified that `authController.js` logged raw `trimmedEmail` in `AuditLog.reason` on non-existent account logins (`Failed login attempt for non-existent email: ${trimmedEmail}`).
  - *Risk*: Users who accidentally type their password into the username field would have plaintext passwords persisted in the immutable audit log.
  - *Resolution*: Replaced raw input interpolation with a constant generic reason: `'Failed login attempt: Account does not exist.'`.
  - *Regression Test*: Added test asserting that submitting a password string into the email field does not leak into `AuditLog.reason` or `metadata`.
- **Verification**: Re-executed test suite. All 18 automated tests passed cleanly.

---

## Log Entry 5: Account Management & Balance Viewing

- **Date**: 2026-11-05
- **Tool**: Antigravity (Google DeepMind) / Claude
- **Stage**: Stage 5 — Account Management & Balance Viewing

### Prompt Summary
Implement Admin-only customer account creation, role-scoped account listing (Admin/Auditor see all; Account Holder sees only own), individual account detail retrieval, BOLA/IDOR protection via ownership middleware, SYSTEM_CLEARING account protection, and a mathematical balance reconciliation service comparing the cached `Account.balance` against the sum of historical `LedgerEntry` rows using `Prisma.Decimal`.

### Implementation Details
1. **`accountService.js`**: Three pure service functions using `Prisma.Decimal` exclusively:
   - `createCustomerAccount`: Validates userId UUID format, verifies target user exists and is `ACCOUNT_HOLDER`, generates or validates account number, creates account with `balance = 0.00`.
   - `getAccountsForUser`: Returns all accounts for `ADMIN`/`AUDITOR`; filters to `userId = req.user.id` for `ACCOUNT_HOLDER`.
   - `reconcileAccountBalance`: Computes `SUM(CREDITS) - SUM(DEBITS)` via `Prisma.Decimal.minus()` and compares against stored `Account.balance` using `Decimal.equals()`.
2. **`accountController.js`**: Thin HTTP layer translating service results to `201`/`200`/`403`/`404` responses. `console.error` is used for expected business errors (e.g., User not found) — intentional; does not cause test failures.
3. **`accountRoutes.js`**: Added `GET /`, `POST /`, `GET /:id`, `GET /:id/reconcile` with appropriate middleware chains (`authMiddleware`, `roleMiddleware`, `ownershipMiddleware`).
4. **`ownershipMiddleware.js`**: Updated with:
   - Explicit `SYSTEM_CLEARING` guard for `ACCOUNT_HOLDER` (returns `403` with message `"Direct access to a clearing account is prohibited."`).
   - Relaxed UUID regex (`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`) that accepts all valid UUIDs including nil UUID (`00000000-0000-0000-0000-000000000000`).
   - Row-level ownership check: looks up account by ID and returns `403` if `account.userId !== req.user.id`.
5. **API documentation**: Added Sections 3.1–3.4 in `docs/API.md` covering all four account endpoints.

### Actual Issue Encountered & Solution
- **Issue (UUID Regex Too Strict)**: Initial UUID validation regex (`/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`) encoded RFC 4122 version (`[1-5]`) and variant (`[89ab]`) constraints. This caused the nil UUID (`00000000-0000-0000-0000-000000000000`) used in tests to be rejected with `400 Bad Request` before the database lookup, producing `400` where the test expected `404`.
  - *Affected tests*: `should reject creating account for non-existent userId with 404` and `should return 404 Not Found for non-existent valid UUID`.
  - *Resolution*: Relaxed the regex to `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i` in both `ownershipMiddleware.js` and `accountService.js`. The regex still rejects clearly malformed strings; version/variant validation is deferred to the database.

### Test Results
- **Test file**: `backend/tests/accounts.test.js` — 17 tests across 4 describe blocks.
- **Stage 5 isolated run**: `npm --prefix backend test -- tests/accounts.test.js` → **17 passed, 0 failed** (39.4 s).
- **Full suite regression**: `npm --prefix backend test` → **35 passed, 0 failed** (auth.test.js: 18 + accounts.test.js: 17, 61.8 s).

### Business Rules Enforced by Implementation
- Only `ADMIN` can call `POST /api/accounts`; `ACCOUNT_HOLDER` and `AUDITOR` receive `403`.
- Accounts can only be assigned to users with role `ACCOUNT_HOLDER` (not ADMIN or AUDITOR).
- Initial balance is strictly `0.00`; no balance can be set via account creation API.
- `ACCOUNT_HOLDER` can never view `SYSTEM_CLEARING` accounts (explicit middleware guard, separate from ownership check).
- `ACCOUNT_HOLDER` can never view another user's account (ownership check using server-side DB query, not client-supplied data).
- Reconciliation endpoint (`GET /:id/reconcile`) is restricted to `ADMIN` and `AUDITOR` only.
- All monetary arithmetic uses `Prisma.Decimal`; no `parseFloat` or JavaScript floating-point.


