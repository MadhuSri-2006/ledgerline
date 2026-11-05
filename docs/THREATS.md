# LedgerLine — Security Threat Model & Mitigations (THREATS.md)

This document identifies potential security threats, financial integrity vulnerabilities, and concurrency race conditions in **LedgerLine**, along with corresponding mitigations and automated verification strategies.

---

## Threat Matrix

| Threat ID | Threat Category | Description | Severity | Mitigation Strategy |
| :--- | :--- | :--- | :--- | :--- |
| **THREAT-01** | **Race Condition / Concurrency** | Simultaneous withdrawal/transfer requests causing an account balance to go negative (Double-Spend). | **Critical** | Pessimistic row-level locking (`SELECT ... FOR UPDATE`) in PostgreSQL inside an interactive database transaction. Consistent lock ordering to prevent deadlocks. |
| **THREAT-02** | **Duplicate Requests** | Network retry or impatient double-clicks causing funds to be transferred multiple times. | **High** | Client-supplied `Idempotency-Key` stored with a database unique constraint on `(userId, idempotencyKey)`. Atomic insert catches simultaneous duplicates; completed requests return cached response. |
| **THREAT-03** | **Broken Authorization (BOLA/IDOR)** | An authenticated user specifies another user's account ID in the transfer/withdraw request to steal money. | **Critical** | Strict server-side ownership validation in Express middleware (`account.userId === req.user.id`). Never trust client-supplied ownership. |
| **THREAT-04** | **Privilege Escalation** | An Account Holder attempts to access Auditor views or Admin management endpoints; or Auditor attempts money movement. | **High** | Role-Based Access Control (RBAC) middleware verifying cryptographically signed JWT claims (`role`). Transaction routes strictly reject non-holder / non-permitted roles. |
| **THREAT-05** | **Money Creation / Destruction** | Transfers, deposits, or withdrawals that result in an unbalance ledger or artificial money inflation. | **Critical** | Strict double-entry accounting with a designated `SYSTEM_CLEARING` account. Every transaction requires balanced Debits and Credits ($\sum \text{Debits} = \sum \text{Credits}$). |
| **THREAT-06** | **Audit Trail Evasion** | A failed or unauthorized transaction attempt is lost because the enclosing database transaction was rolled back. | **Medium** | Independent audit recording outside the money-movement transaction. Even when a ledger transaction aborts, the declined attempt is persistently committed to `AuditLog`. |
| **THREAT-07** | **Token Tampering** | An attacker modifies their JWT payload to change their `role` to `ADMIN` or `userId` to a target account holder. | **Critical** | HMAC-SHA256 signature verification using a strong secret (`JWT_SECRET`). If the payload is tampered with, signature verification fails and request is rejected (`401 Unauthorized`). |
| **THREAT-08** | **Floating-Point Drift** | Standard IEEE 754 floating-point math (`0.1 + 0.2 = 0.30000000000000004`) introducing fractional penny errors over time. | **High** | PostgreSQL `DECIMAL(14, 2)` mapped through Prisma's `Decimal` type, guaranteeing exact two-decimal precision. |

---

## Detailed Threat Mitigations

### THREAT-01: Race Conditions & Negative Balances
- **Attack Scenario**: Alice has \$100. She writes a script to send two simultaneous requests to transfer \$100 to Bob.
- **Defense**:
  1. The transfer route executes within `prisma.$transaction`.
  2. The query explicitly locks Alice's row: `SELECT * FROM "Account" WHERE id = $1 FOR UPDATE`.
  3. The second request is blocked at the database engine until the first transaction commits.
  4. When the second transaction acquires the lock, it reads the updated balance (\$0) and throws an "Insufficient funds" error.
  5. Lock ordering: When locking both Alice and Bob's rows, they are locked in alphabetical order of their UUIDs (`min(id1, id2)`, then `max(id1, id2)`) to eliminate database deadlocks.

### THREAT-02: Idempotency Duplication
- **Attack Scenario**: A network timeout occurs after money moves, causing the client application to automatically retry the POST request with the same `Idempotency-Key`.
- **Defense**:
  1. PostgreSQL enforces `UNIQUE(user_id, idempotency_key)`.
  2. If the request is still running, the unique constraint causes an error caught by the API, returning `409 Conflict`.
  3. If the request has already completed, the API retrieves the saved HTTP response body and status code directly, returning it without touching balances or ledger entries.

### THREAT-03: Broken Object-Level Authorization (BOLA)
- **Attack Scenario**: Attacker Eve logs in as herself, gets a valid JWT, and posts `{ "fromAccountId": "alice-account-id", "amount": 100 }`.
- **Defense**:
  1. Server retrieves `req.user.id` from the cryptographically verified JWT.
  2. Server queries `Account` where `id = fromAccountId`.
  3. If `account.userId !== req.user.id`, the server logs a `DECLINED` attempt to `AuditLog` ("Unauthorized debit attempt") and immediately responds with `403 Forbidden`.

---

## Automated Verification Plan
Each of these threats will be verified with dedicated automated tests in Stage 10:
- `concurrency.test.js`: Fires simultaneous requests using `Promise.all` to verify zero overdrafts.
- `idempotency.test.js`: Retries identical requests with the same key and asserts money is deducted only once.
- `auth.test.js`: Simulates BOLA and role tampering attacks and verifies 401/403 responses and persistent audit entries.
- `ledger.test.js`: Asserts double-entry conservation ($\sum \text{Debit} - \sum \text{Credit} = 0$).
