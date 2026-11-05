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
The architecture was revised and approved with these corrections. Stage 1 directory structure and documentation files initialized.
