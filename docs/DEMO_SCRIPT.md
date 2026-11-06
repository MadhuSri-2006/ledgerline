# LedgerLine — Demo Script

This walkthrough guides a reviewer through every major feature of the application.

---

## Prerequisites

```bash
# Terminal 1 — Backend
cd backend
cp .env.example .env     # fill in DATABASE_URL and JWT_SECRET
npm install
npm start                # → http://localhost:5000

# Terminal 2 — Frontend
cd frontend
npm install
npm run dev              # → http://localhost:5173
```

Open **http://localhost:5173** in your browser.

---

## Demo Credentials

| Role             | Email                            | Password             |
|------------------|----------------------------------|----------------------|
| Admin            | admin@ledgerline.internal        | AdminPassword123!    |
| Account Holder   | alice@ledgerline.internal        | AlicePassword123!    |
| Account Holder   | bob@ledgerline.internal          | BobPassword123!      |
| Auditor          | auditor@ledgerline.internal      | AuditorPassword123!  |

---

## Scenario 1 — Account Holder (Alice)

1. Navigate to **http://localhost:5173** — you are redirected to `/login`.
2. Click the **Alice** demo button (or enter her credentials manually). Click **Sign In**.
3. You land on the **Account Holder Dashboard**.
   - The left panel lists Alice's accounts with live balances.
   - Select an account to load its session statement in the right panel.
4. **Deposit funds**
   - Click the **Deposit** tab.
   - Enter `500.00` and click **Deposit Funds**.
   - A confirmation dialog appears. Click **Confirm**.
   - The balance updates immediately.
5. **Internal transfer to Bob**
   - Note Bob's account UUID (login as Bob first, or ask the Admin).
   - Click the **Transfer** tab.
   - Paste Bob's account UUID into *Destination Account UUID*.
   - Enter `150.00`. Click **Transfer Funds** → **Confirm**.
   - Both Alice's and Bob's balances update (verify by logging in as Bob).
6. **Withdraw funds**
   - Click the **Withdraw** tab.
   - Enter `50.00`. Click **Withdraw Funds** → **Confirm**.
7. **Session statement**
   - The table in the right panel shows all ledger entries for this session sorted by time.
   - Each entry shows: type, amount, counterpart account, timestamp.
8. **Idempotency** — repeat any form submission with the same values. The server returns the existing result; no duplicate transaction is created.
9. Click **Sign Out** in the navbar.

---

## Scenario 2 — Admin Console

1. Log in as **admin@ledgerline.internal**.
2. Land on the **Admin Dashboard**.
3. **User management**
   - View the Users table (all accounts and their roles).
   - Click **+ New User** → fill in name, email, password, and role → **Create User**.
   - The new user appears in the table.
4. **Account management**
   - Switch to the **Accounts** tab.
   - Click **+ New Account** → select an owner, enter an optional initial balance → **Create Account**.
5. **Balance reconciliation**
   - Select any account → click **Reconcile**.
   - The panel shows the computed ledger balance vs the stored balance and flags any discrepancy.
6. **Operational transactions**
   - Use the transaction panel to perform a deposit, withdrawal, or transfer on behalf of any account holder.
7. Click **Sign Out**.

---

## Scenario 3 — Auditor Portal

1. Log in as **auditor@ledgerline.internal**.
2. Land on the **Auditor Dashboard** (read-only — no write operations available).
3. View all accounts and their balances.
4. Click **Reconcile** on any account to verify ledger integrity.
5. Click **Reconcile All** to run system-wide reconciliation across every account.
6. All transactions are visible for audit; no data can be modified.
7. Click **Sign Out**.

---

## Scenario 4 — Bob verifies received transfer

1. Log in as **bob@ledgerline.internal**.
2. Alice's transfer of `150.00` appears in Bob's balance.
3. The session statement shows the credit entry.

---

## API Smoke Tests (optional — curl)

```bash
# Health check
curl http://localhost:5000/api/health

# Login
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@ledgerline.internal","password":"AlicePassword123!"}' \
  | python -c "import sys,json; print(json.load(sys.stdin)['token'])")

# List accounts
curl -H "Authorization: Bearer $TOKEN" http://localhost:5000/api/accounts

# Deposit
curl -X POST http://localhost:5000/api/transactions/deposit \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: demo-deposit-001" \
  -d '{"accountId":"<ALICE_ACCOUNT_UUID>","amount":"100.00","description":"Demo deposit"}'
```

---

## Running Tests

```bash
cd backend
npm test          # runs all 80 Jest tests across auth, accounts, and transactions suites
npm run verify:seed   # confirms exactly 4 seed users and 3 seed accounts exist
```

---

## Key Security Guarantees Demonstrated

| Feature | Where to see it |
|---|---|
| JWT authentication | Every API request requires `Authorization: Bearer <token>` |
| Role-based access | Admin endpoints reject Alice; Auditor endpoints reject writes |
| Idempotency | Same `Idempotency-Key` → same result, no duplicate transaction |
| Overdraft prevention | Withdraw more than balance → `400 Insufficient funds` |
| Double-entry accounting | Every transaction creates balanced debit + credit ledger entries |
| Decimal precision | Amounts stored as `Decimal` in PostgreSQL, never `float` |
| Audit trail | Every operation logged with actor, before/after values, timestamp |
