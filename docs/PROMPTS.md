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

---

## Log Entry 6: Core Transaction Engine (Deposits, Withdrawals, Transfers)

- **Date**: 2026-11-05
- **Tool**: Antigravity (Google DeepMind) / Claude & Gemini
- **Stage**: Stage 6 — Core Transaction Engine

### Prompt Summary
Implement double-entry transaction engine for Deposits, Withdrawals, and Internal Transfers within PostgreSQL ACID transactions (`prisma.$transaction`). Enforce exact `Prisma.Decimal` math, pessimistic row-level locking (`SELECT ... FOR UPDATE`) in deterministic ascending UUID order to eliminate deadlocks, double-entry conservation ($\sum \text{Debits} = \sum \text{Credits}$), idempotency key tracking via database unique constraints with cached response replay, independent `AuditLog` writes on failure, and complete test suite with guaranteed test teardown.

### Implementation Details
1. **`ledgerService.js`**: Core financial engine:
   - **Row-Level Locking**: Raw SQL query `SELECT ... FROM "Account" WHERE id = $1 FOR UPDATE` locks account rows at the PostgreSQL storage engine level, preventing concurrent double-spends.
   - **Deadlock Prevention**: In `transfer`, accounts are sorted lexicographically by UUID (`[fromId, toId].sort()`) before acquiring locks, guaranteeing consistent lock acquisition order regardless of transfer direction.
   - **Double-Entry Invariants**:
     - *Deposit*: Debits `SYS-CLEARING-001`, credits target customer account.
     - *Withdrawal*: Debits customer account, credits `SYS-CLEARING-001`.
     - *Transfer*: Debits source account, credits destination account (net system change = 0.00).
   - **Idempotency Lifecycle**:
     1. Pre-transaction: Insert `IdempotencyKey` row with status `PENDING`.
     2. Duplicate detection: Concurrent duplicate hits PostgreSQL `@@unique([userId, key])` returning `409 Conflict`.
     3. Completed replay: Completed key returns cached response with `idempotent: true` without ledger modification.
     4. Hash validation: Compares SHA-256 payload hash to reject key reuse with altered amounts (`422 Unprocessable Entity`).
     5. Atomic resolution: In the same `prisma.$transaction`, key is updated to `RESOLVED` with the response body.
     6. Rollback survival: On business failure (e.g. insufficient funds), key is marked `FAILED` and `AuditLog` is created independently outside the rolled-back transaction.
   - **Role & Ownership Enforcement**:
     - `ACCOUNT_HOLDER` can only deposit to or withdraw from accounts matching `account.userId === req.user.id`.
     - `ACCOUNT_HOLDER` can only transfer from an account matching `fromAccount.userId === req.user.id`.
     - Attempted cross-user operations trigger `403 Forbidden` and persist an audit entry with `status: 'DECLINED'`.
     - `SYSTEM_CLEARING` accounts are rejected if passed directly as user-controlled accounts.
2. **`transactionController.js`**: HTTP controller extracting `Idempotency-Key` headers, delegating to `ledgerService`, and returning `201 Created` or `200 OK` (cached).
3. **`transactionRoutes.js`**: Mounts `/deposit`, `/withdraw`, `/transfer` guarded by `authenticate` and `requireRoles('ADMIN', 'ACCOUNT_HOLDER')`. Auditors are blocked with `403 Forbidden`.
4. **`app.js`**: Mounted transaction routes at `/api/transactions`.
5. **Documentation**:
   - `docs/API.md`: Added Section 4 with comprehensive documentation of `/deposit`, `/withdraw`, and `/transfer`.
   - `docs/THREATS.md`: Added THREAT-09 (cross-transfer deadlocks), THREAT-10 (idempotency payload tampering), THREAT-11 (clearing account manipulation), and THREAT-12 (self-transfer recycling).

### Actual Issues Encountered & Solutions
- **Issue 1 (Database Connection in Sandbox Mode)**:
  - *Symptom*: Running `npm run verify:seed` inside sandboxed mode failed with `PrismaClientInitializationError: Can't reach database server at Neon AWS host`.
  - *Root Cause*: Standard Sandbox Mode isolates network access. Connecting to cloud-hosted Neon PostgreSQL requires `BypassSandbox: true`.
  - *Resolution*: Ran database-connected verification and test execution outside sandbox.
- **Issue 2 (Test State Pollution & Ledger Reconciliation Drift)**:
  - *Symptom*: Running the full test suite caused `accounts.test.js` reconciliation tests to fail (`Expected reconciled balance 1000.00, received 1074.00`).
  - *Root Cause*: `transactions.test.js` performed actual deposits and transfers on seeded accounts (`ACC-ALICE-001`, `ACC-BOB-001`). In `afterAll`, it reset the cached `Account.balance` column without deleting the test `LedgerEntry` and `TransactionRecord` rows. The subsequent `reconcile` query correctly computed the sum from all ledger entries, detecting the discrepancy.
  - *Resolution*: Implemented a clean, guaranteed teardown in `transactions.test.js` `afterAll`: queries all non-seed `TransactionRecord` records (`NOT: { reference: { startsWith: 'TXN-SEED-' } }`), cascades deletion across `LedgerEntry`, `AuditLog`, and `TransactionRecord`, cleans test idempotency keys, and resets account balances back to exact seed values.
- **Issue 3 (AuditLog Foreign Key Violation on 404 Tests)**:
  - *Symptom*: Testing failed transactions with a non-existent UUID (`00000000-0000-0000-0000-000000000001`) caused PostgreSQL foreign key error on `AuditLog.accountId`.
  - *Resolution*: Passed `null` for `accountId` when `err.statusCode === 404`, recording the failed action while respecting relational integrity.

### Test Results
- **`tests/transactions.test.js`**: **40 passed, 0 failed** (41.6 s)
- **`tests/accounts.test.js`**: **17 passed, 0 failed** (7.2 s)
- **`tests/auth.test.js`**: **18 passed, 0 failed** (6.0 s)
- **Full Test Suite (`npm test`)**: **75 passed, 0 failed across 3 test suites** (42.1 s)
- **Seed Verification (`npm run verify:seed`)**: **100% Passed (Double-entry satisfied, debits == credits, balances reconciled)**

---

## Log Entry 7: Test Cleanup and Database Verification

- **Date**: 2026-11-05
- **Tool**: Antigravity (Google DeepMind) / Gemini 3.8 Flash
- **Stage**: Stage 7 — Test Cleanup & Database Verification

### Prompt Summary
Isolate and refine automated test suite cleanup so each test suite removes only the exact records it created, without deleting seeded entities (Admin, Alice, Bob, Auditor, SYSTEM_CLEARING, and initial customer accounts). Replace broad non-seed cleanup queries with targeted snapshot-based or tracker-based teardowns in correct foreign-key dependency order. Guarantee that test suites can run repeatedly without accumulating leftover users, accounts, transactions, or audit logs, and maintain strict seed verification (`verify:seed`: exactly 4 users and 3 accounts).

### Implementation Details
1. **`auth.test.js` Cleanup Isolation**:
   - Tracked all test-created users in `createdUserIds` and specific audit logs in `testAuditLogIds`.
   - In `afterAll`: deletes test audit logs, then test users in referential integrity order.
   - Cleans up any prior `testuser-*` records so legacy test runs do not leave unverified rows.
2. **`accounts.test.js` Cleanup Isolation**:
   - Tracked all admin-provisioned test accounts in `createdAccountIds`.
   - In `afterAll`: deletes child `LedgerEntry` records, child `AuditLog` records, and then the test `Account` records.
   - Restores Alice's balance back to 1000.00 INR following the deliberate balance tampering reconciliation test.
3. **`transactions.test.js` Non-Destructive Teardown**:
   - Replaced broad query `NOT: { reference: { startsWith: 'TXN-SEED-' } }` with pre-test ID snapshots (`beforeTxIds`, `beforeAuditLogIds`, `beforeKeyIds`).
   - In `afterAll`: calculates set differences to identify only the records created during the specific suite run.
   - Deletes records in strict foreign-key order: `LedgerEntry` $\rightarrow$ `AuditLog` $\rightarrow$ `TransactionRecord` $\rightarrow$ `IdempotencyKey`.
   - Restores exact seeded balances (`ACC-ALICE-001` = 1000.00, `ACC-BOB-001` = 500.00, `SYS-CLEARING-001` = -1500.00).
4. **Formatting & EOF Hygiene**:
   - Fixed trailing EOF blank lines in `docs/API.md` and `docs/PROMPTS.md` as verified by `git diff --check`.

### Verification Results
- **`git diff --check`**: Clean (exit code 0, no EOF blank line warnings).
- **`npm test`**: **75 passed, 0 failed across all 3 test suites** (46.3 s).
- **`npm run verify:seed`**: **100% Passed** (Users Found: 4/4, Accounts Found: 3/3, Debits == Credits = 1500.00 INR, Balances Reconciled).
- **Repeatability**: Repeated full test execution runs cleanly without any user or account accumulation.

---

## Log Entry 8: Transaction Security and Edge-Case Review

- **Date**: 2026-11-05
- **Tool**: Antigravity (Google DeepMind) / Claude Sonnet 4.6 Thinking
- **Stage**: Stage 8 — Transaction Security and Edge-Case Review

### Prompt Summary
Perform a thorough security and correctness review of the Stage 6 transaction engine without scaffolding a new project. Inspect actual source files (`ledgerService.js`, `transactionController.js`, `transactionRoutes.js`, `authMiddleware.js`, `roleMiddleware.js`, `ownershipMiddleware.js`, `accountService.js`, and all three test suites). Review five domains: (1) double-entry accounting invariants, (2) overdraft prevention and concurrency, (3) idempotency correctness, (4) authorization enforcement, and (5) input validation and failure handling. Add or improve tests only for concrete gaps discovered. Run `git diff --check`, `npm test`, and `npm run verify:seed`.

### Implementation Details

#### Bugs/Gaps Identified and Fixed

1. **Precision validation using string slice (ledgerService.js)**
   - *Issue*: Original code used `d.toFixed(10).split('.')[1]` to count decimal places. This silently truncates values with more than 10 decimal places (e.g., `10.00000000001` would appear as `10.0000000000`), passing validation incorrectly.
   - *Fix*: Replaced with `d.decimalPlaces() > 2` from decimal.js, which counts exact significant decimal places without any truncation ceiling.
   - *Risk*: Without this fix, attackers could submit fractional-satoshi amounts that bypass validation and hit the PostgreSQL `DECIMAL(14,2)` column, causing an unhandled database error.

2. **Missing upper-bound amount guard (ledgerService.js)**
   - *Issue*: No pre-validation against the PostgreSQL `DECIMAL(14,2)` maximum value (`999,999,999,999.99`). Submitting `1000000000000.00` caused a raw, unhandled database constraint error rather than a clean 400 response.
   - *Fix*: Added `MAX_TRANSACTION_AMOUNT = new Prisma.Decimal('999999999999.99')` and a check in `parseAndValidateAmount` before any DB call. Returns `400` with a clear message.

3. **Ambiguous error messages for 404 on transfer (ledgerService.js)**
   - *Issue*: Both missing source and missing destination accounts threw the same generic "account not found" message, making it impossible for clients or audit logs to distinguish which account was missing.
   - *Fix*: Changed to separate `'Source account not found.'` and `'Destination account not found.'` messages with distinct tests verifying each path.

#### New Tests Added (backend/tests/transactions.test.js)

4. **Reject high-precision amounts (`10.00000000001`)** — Section 6, confirms `d.decimalPlaces() > 2` works correctly for depths beyond 10 decimal places.
5. **Reject amounts exceeding DECIMAL(14,2) max** — Section 6, confirms `1000000000000.00` returns 400 with `/maximum allowed limit/i`.
6. **Concurrent duplicate idempotency key** — Section 10, fires two simultaneous requests with the same key via `Promise.all`; asserts exactly one 201 and one 409/200, and balance credited only once (+15.00).
7. **Non-existent destination account returns 404** — Section 13, confirms `Destination account not found` distinguishable from source-not-found 404.
8. **Auto-generated idempotency key** — Section 13, omitting `Idempotency-Key` header still results in 201 COMPLETED, confirming fallback UUID generation in controller.

#### Security Review Findings (all PASS)

| Check | Area | Result |
|---|---|---|
| JWT algorithm pinned to HS256 | Auth | PASS |
| JWT secret required at startup (`FATAL` throw) | Auth | PASS |
| Token re-verified against live DB user on each request | Auth | PASS |
| Login errors generic (no user enumeration) | Auth | PASS |
| Audit logs for failed login never store raw email input | Auth | PASS |
| `requireRoles` reads from verified `req.user`, not request body | RBAC | PASS |
| Auditor blocked from all transaction endpoints at route level | RBAC | PASS |
| Ownership check runs inside ACID transaction with FOR UPDATE lock | BOLA | PASS |
| SYSTEM_CLEARING accounts blocked from customer-facing operations | BOLA | PASS |
| Row-level locking in ascending UUID order prevents deadlocks | Concurrency | PASS |
| Insufficient-funds check runs after FOR UPDATE read (atomic) | Overdraft | PASS |
| All monetary math uses `Prisma.Decimal`; no `parseFloat` or `+` | Decimal | PASS |
| Declined audit written outside rolled-back financial transaction | Audit | PASS |
| No secrets or password data written to any AuditLog field | Audit | PASS |
| Self-transfer (`fromAccountId === toAccountId`) rejected 400 | Validation | PASS |
| Currency mismatch between accounts rejected 400 | Validation | PASS |
| Missing body fields (`accountId`, `amount`) rejected 400 | Validation | PASS |

### Verification Results
- **`git diff --check`**: Clean (exit code 0, only LF-to-CRLF line-ending warnings from Windows Git config — not whitespace errors).
- **`npm test`**: **80 passed, 0 failed across all 3 test suites** (50.3 s).
  - `tests/transactions.test.js`: 45 passed
  - `tests/accounts.test.js`: 17 passed
  - `tests/auth.test.js`: 18 passed
- **`npm run verify:seed`**: **100% Passed** (Users: 4/4, Accounts: 3/3, Debits == Credits = 1500.00 INR, all balances reconciled).


---

## Stage 10 — Project Stabilization, Test Isolation & Data Preservation Audit

**Timestamp:** 2026-11-06
**Objective:** Resolve the 3 test failures in `backend/tests/accounts.test.js`, establish test isolation, prevent persistent data clobbering, support dedicated test databases, and ensure full submission readiness while preserving manual Neon database test data.

### Root Cause Analysis
1. **Hardcoded Test Expectations vs Real Data**: `accounts.test.js` hardcoded expectations that Alice's balance would always be strictly `1000.00` and Bob's `500.00`. Manual website testing included a ₹100 transfer from Alice to Bob, giving Alice a legitimate ledger balance of ₹900.00 and Bob ₹600.00.
2. **Destructive Teardown in Tests**: `afterAll` in `accounts.test.js` and `transactions.test.js` unconditionally executed `data: { balance: '1000.00' }` and `data: { balance: '500.00' }`, which overwrote the stored balance without adjusting ledger entries, causing balance reconciliation failures (`storedBalance !== reconciledBalance`).
3. **Missing Test Database Isolation**: Tests loaded the shared Neon database URL from `backend/.env` without supporting an isolated `TEST_DATABASE_URL`.

### Implementation & Fixes
1. **Configurable Test Database Support**: Updated `backend/src/config/db.js` to prioritize `process.env.TEST_DATABASE_URL` whenever `NODE_ENV === 'test'`. Documented the variable in `backend/.env.example`.
2. **Dynamic Test Assertions in `tests/accounts.test.js`**:
   - Replaced hardcoded `1000.0` balance assertions with dynamic checks against the account's actual pre-test balance.
   - Updated reconciliation assertions to verify mathematical consistency (`storedBalance === reconciledBalance`, `isBalanced === true`, `discrepancy === '0.00'`) rather than fixed amounts.
   - Updated the balance-tampering test to capture the account's genuine pre-test balance, tamper with the stored balance, verify `isBalanced === false`, and restore the exact genuine pre-test balance.
3. **Safe Teardown in `tests/transactions.test.js` & `tests/accounts.test.js`**:
   - Captured initial account balances during `beforeAll`.
   - Restored exact pre-test balances in `afterAll` instead of forcing hardcoded values, preserving persistent manual testing transactions.
4. **Neon Database Synchronization**: Synchronized stored account balances (`ACC-ALICE-001`: 900.00 INR, `ACC-BOB-001`: 600.00 INR, `SYS-CLEARING-001`: -1500.00 INR) with the immutable double-entry ledger history, satisfying mathematical conservation (`Total Debits === Total Credits = 1800.00 INR`).

### Final Verification Results
- **Jest Test Suite**: **80/80 passed** (3 test suites: `auth.test.js` 18/18, `accounts.test.js` 17/17, `transactions.test.js` 45/45).
- **Seed & Balance Verification (`npm run verify:seed`)**: **100% Passed** (Users: 4/4, Accounts: 3/3, Debits == Credits = 1800.00 INR, all balances reconciled).
- **Frontend Production Build (`npm run build`)**: **Clean build in ~2.7s** (`dist/` generated with zero errors).
- **Prisma Schema Validation (`npx prisma validate`)**: **Valid schema**.
- **Backend API Server Probe**: Verified `/api/health` returns `200 OK` (`{ status: 'ok', service: 'LedgerLine API' }`).
- **Data Safety**: All historical transactions and audit logs in Neon PostgreSQL preserved intact.
