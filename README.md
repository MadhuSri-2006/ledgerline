# LedgerLine — A Secure, Auditable Money-Movement Ledger

**Snovasys Fresher Hiring Challenge 2026**  
*Built with React (Vite), Node.js (Express), PostgreSQL, and Prisma.*

---

## 1. Project Overview

**LedgerLine** is a financial ledger application built to guarantee financial integrity, concurrency safety, and auditability.

In financial software, a fancy interface is secondary to **correctness**:
- Balances must never be corrupted by concurrent requests.
- Retried requests must never move money twice (idempotency).
- Users must never be able to debit or view another user's account (BOLA prevention).
- Every transaction—including refused attempts—must leave an indelible audit trail.
- Internal transfers must conserve money ($\sum \text{Debits} = \sum \text{Credits}$).

---

## 2. Technology Stack

- **Frontend**: React (Vite), modern responsive CSS.
- **Backend**: Node.js, Express.js.
- **Database**: PostgreSQL with Prisma ORM.
- **Authentication**: Cryptographically signed JWTs (HMAC-SHA256) and bcrypt password hashing.
- **Testing**: Jest and Supertest.

---

## 3. Project Directory Structure

```text
ledgerline/
├── backend/
│   ├── prisma/             # Schema, migrations, and demo seed data
│   ├── src/
│   │   ├── config/         # Database and environment configurations
│   │   ├── controllers/    # Route controllers (Auth, Accounts, Transactions, Audit)
│   │   ├── middleware/     # Auth, RBAC, and Idempotency middleware
│   │   ├── services/       # Double-entry ledger logic & audit logging
│   │   ├── routes/         # Express API route definitions
│   │   ├── app.js          # Express app configuration (testable)
│   │   └── server.js       # HTTP server listener
│   ├── tests/              # Jest and Supertest test suites
│   ├── .env.example        # Backend environment template
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/     # UI widgets (Navbar, AccountCard, TransferModal, etc.)
│   │   ├── context/        # Auth state management
│   │   ├── pages/          # Login, Dashboard, Statements, Auditor Views
│   │   └── services/       # API client with Idempotency-Key support
│   └── package.json
├── docs/
│   ├── PROMPTS.md          # Genuine AI prompts, interactions, critiques & corrections
│   ├── THREATS.md          # Security threat model & mitigation strategies
│   └── API.md              # Planned REST API specification
├── .gitignore
├── .env.example
└── README.md
```

---

## 4. Roles & Permissions

- **Admin**: Responsible for creating and managing users and accounts. Can view system-wide transaction history and system audit logs.
- **Account Holder**: Can view their own accounts and balances, view personal statements, and initiate deposits, withdrawals, and transfers **strictly from their own accounts**.
- **Auditor**: Has system-wide **read-only** access to all accounts, ledger entries, and audit logs (including declined attempts). Cannot execute money movements.

---

## 5. Development Roadmap & Current Stage

- [x] **Stage 1**: Workspace inspection, architecture approval, Git initialization, and folder structure.
- [ ] **Stage 2**: Database schema design (Prisma) and double-entry consistency modeling.
- [ ] **Stage 3**: PostgreSQL configuration, Prisma migrations, and seeded demo accounts.
- [ ] **Stage 4**: Authentication and server-side RBAC implementation.
- [ ] **Stage 5**: Account management and balance viewing.
- [ ] **Stage 6**: Safe deposits, withdrawals, and internal transfers using ACID transactions.
- [ ] **Stage 7**: Idempotency and concurrency safety (row-level locking).
- [ ] **Stage 8**: Audit trail and persistent declined-attempt recording.
- [ ] **Stage 9**: React frontend implementation.
- [ ] **Stage 10**: Automated test suite (concurrency, idempotency, conservation of money).
- [ ] **Stage 11**: Security and threat review (`THREATS.md`).
- [ ] **Stage 12**: Deployment, demo walkthrough, and submission answers.

---

## 6. How to Run Locally (Coming in Stage 3)

*Exact installation and run commands will be detailed here once backend dependencies and Prisma are configured in Stage 3.*

---

## 7. Documentation Links
- [Security Threat Model](file:///c:/Users/madhu/Documents/projects/ledgerline/docs/THREATS.md)
- [Prompt & AI Collaboration Log](file:///c:/Users/madhu/Documents/projects/ledgerline/docs/PROMPTS.md)
