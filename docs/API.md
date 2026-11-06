# LedgerLine — REST API Documentation

This document describes the API endpoints for LedgerLine. All endpoints return and accept JSON.

---

## Base URL
```text
http://localhost:5000/api
```

---

## Authentication & Authorization Model

- **Format**: `Authorization: Bearer <token>`
- **Token Type**: Cryptographically signed JSON Web Token (HMAC-SHA256).
- **Security**: Token payload contains only non-sensitive public claims (`userId`, `email`, `role`). Sensitive data (`passwordHash`, bank details) is never stored in JWTs or returned in API responses.
- **Roles**:
  - `ADMIN`: Full user and account management.
  - `ACCOUNT_HOLDER`: Access restricted strictly to own accounts.
  - `AUDITOR`: System-wide read-only access (all mutating actions forbidden with `403 Forbidden`).

---

## 1. Authentication Endpoints

### 1.1 Login
Authenticates an existing user via email and bcrypt password comparison. Issues a signed JWT.

- **Method**: `POST`
- **Path**: `/auth/login`
- **Auth Required**: No (Public)
- **Request Body**:
  ```json
  {
    "email": "alice@ledgerline.internal",
    "password": "AlicePassword123!"
  }
  ```
- **Responses**:
  - `200 OK`:
    ```json
    {
      "message": "Login successful.",
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "user": {
        "id": "c1f7a0b3-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        "email": "alice@ledgerline.internal",
        "fullName": "Alice AccountHolder",
        "role": "ACCOUNT_HOLDER"
      }
    }
    ```
  - `400 Bad Request`:
    ```json
    {
      "error": "Validation failed: Email and password are required."
    }
    ```
  - `401 Unauthorized`:
    ```json
    {
      "error": "Authentication failed: Invalid email or password."
    }
    ```

---

### 1.2 Get Current Authenticated User (`/me`)
Returns the profile of the user currently authenticated by the Bearer token.

- **Method**: `GET`
- **Path**: `/auth/me`
- **Auth Required**: Yes (`Bearer <token>`)
- **Headers**:
  ```text
  Authorization: Bearer <JWT_TOKEN>
  ```
- **Responses**:
  - `200 OK`:
    ```json
    {
      "user": {
        "id": "c1f7a0b3-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        "email": "alice@ledgerline.internal",
        "fullName": "Alice AccountHolder",
        "role": "ACCOUNT_HOLDER"
      }
    }
    ```
  - `401 Unauthorized`:
    ```json
    {
      "error": "Authentication failed: Missing or malformed Authorization header. Expected Bearer <token>."
    }
    ```

---

## 2. Admin User Management Endpoints

### 2.1 List All Users
Retrieves all users and their associated accounts. Restricted exclusively to `ADMIN`.

- **Method**: `GET`
- **Path**: `/admin/users`
- **Auth Required**: Yes (`ADMIN` role)
- **Responses**:
  - `200 OK`:
    ```json
    {
      "users": [
        {
          "id": "admin-uuid",
          "email": "admin@ledgerline.internal",
          "fullName": "System Administrator",
          "role": "ADMIN",
          "createdAt": "2026-11-05T14:33:30.000Z",
          "accounts": []
        },
        {
          "id": "alice-uuid",
          "email": "alice@ledgerline.internal",
          "fullName": "Alice AccountHolder",
          "role": "ACCOUNT_HOLDER",
          "createdAt": "2026-11-05T14:33:30.000Z",
          "accounts": [
            {
              "id": "account-uuid",
              "accountNumber": "ACC-ALICE-001",
              "type": "STANDARD",
              "balance": "1000.00",
              "currency": "INR",
              "status": "ACTIVE"
            }
          ]
        }
      ]
    }
    ```
  - `403 Forbidden` (when called by `ACCOUNT_HOLDER` or `AUDITOR`):
    ```json
    {
      "error": "Forbidden: Access denied. Role 'ACCOUNT_HOLDER' is not authorized for this resource. Required: [ADMIN]"
    }
    ```

---

### 2.2 Create User
Allows an Admin to provision new users with assigned roles.

- **Method**: `POST`
- **Path**: `/admin/users`
- **Auth Required**: Yes (`ADMIN` role)
- **Request Body**:
  ```json
  {
    "email": "carol@ledgerline.internal",
    "password": "CarolPassword123!",
    "fullName": "Carol AccountHolder",
    "role": "ACCOUNT_HOLDER"
  }
  ```
- **Responses**:
  - `201 Created`:
    ```json
    {
      "message": "User created successfully.",
      "user": {
        "id": "new-user-uuid",
        "email": "carol@ledgerline.internal",
        "fullName": "Carol AccountHolder",
        "role": "ACCOUNT_HOLDER",
        "createdAt": "2026-11-05T14:40:00.000Z"
      }
    }
    ```
  - `409 Conflict`:
    ```json
    {
      "error": "User with this email already exists."
    }
    ```

---

## 3. Account Management & Balance Endpoints

### 3.1 List Accounts
Retrieves accounts based on caller role:
- `ADMIN` & `AUDITOR`: View all customer accounts.
- `ACCOUNT_HOLDER`: Strictly views own accounts (BOLA isolated; never sees other users or clearing accounts).

- **Method**: `GET`
- **Path**: `/accounts`
- **Auth Required**: Yes
- **Responses**:
  - `200 OK` (when called by Account Holder):
    ```json
    {
      "accounts": [
        {
          "id": "account-uuid",
          "accountNumber": "ACC-ALICE-001",
          "type": "STANDARD",
          "balance": "1000.00",
          "currency": "INR",
          "status": "ACTIVE",
          "createdAt": "2026-11-05T14:33:30.000Z"
        }
      ]
    }
    ```

---

### 3.2 Create Customer Account
Admin endpoint to provision a new customer account for an existing `ACCOUNT_HOLDER` user. Initial balance is strictly 0.00 Decimal.

- **Method**: `POST`
- **Path**: `/accounts`
- **Auth Required**: Yes (`ADMIN` role only)
- **Request Body**:
  ```json
  {
    "userId": "user-uuid",
    "currency": "INR",
    "accountNumber": "ACC-BOB-002"
  }
  ```
- **Responses**:
  - `201 Created`:
    ```json
    {
      "message": "Account created successfully.",
      "account": {
        "id": "new-account-uuid",
        "accountNumber": "ACC-BOB-002",
        "type": "STANDARD",
        "balance": "0.00",
        "currency": "INR",
        "status": "ACTIVE",
        "user": {
          "id": "user-uuid",
          "email": "bob@ledgerline.internal",
          "fullName": "Bob AccountHolder"
        }
      }
    }
    ```
  - `400 Bad Request` (Attempting to create account for Admin/Auditor):
    ```json
    {
      "error": "Invalid user role 'ADMIN'. Customer accounts can only be assigned to ACCOUNT_HOLDER users."
    }
    ```
  - `403 Forbidden` (Called by non-Admin):
    ```json
    {
      "error": "Forbidden: Access denied. Role 'ACCOUNT_HOLDER' is not authorized for this resource. Required: [ADMIN]"
    }
    ```

---

### 3.3 View Account by ID
Returns details of a specific account. Enforces server-side ownership:
- `ACCOUNT_HOLDER` can only view accounts they own.
- `ADMIN` and `AUDITOR` can view any account.
- `SYSTEM_CLEARING` account is strictly prohibited from being viewed by `ACCOUNT_HOLDER`.

- **Method**: `GET`
- **Path**: `/accounts/:id`
- **Auth Required**: Yes
- **Responses**:
  - `200 OK`:
    ```json
    {
      "account": {
        "id": "account-uuid",
        "accountNumber": "ACC-ALICE-001",
        "type": "STANDARD",
        "balance": "1000.00",
        "currency": "INR",
        "status": "ACTIVE",
        "owner": {
          "id": "user-uuid",
          "email": "alice@ledgerline.internal",
          "fullName": "Alice AccountHolder"
        },
        "createdAt": "2026-11-05T14:33:30.000Z"
      }
    }
    ```
  - `400 Bad Request` (Malformed UUID):
    ```json
    {
      "error": "Bad Request: Invalid account ID format. Expected a valid UUID."
    }
    ```
  - `403 Forbidden` (BOLA Attempt):
    ```json
    {
      "error": "Forbidden: You do not have permission to view or operate on this account."
    }
    ```
  - `404 Not Found`:
    ```json
    {
      "error": "Account not found."
    }
    ```

---

### 3.4 Mathematical Balance Reconciliation
Verifies whether the cached `Account.balance` matches the historical sum of ledger entries ($\sum \text{Credits} - \sum \text{Debits}$).

- **Method**: `GET`
- **Path**: `/accounts/:id/reconcile`
- **Auth Required**: Yes (`ADMIN` or `AUDITOR` role)
- **Responses**:
  - `200 OK`:
    ```json
    {
      "reconciliation": {
        "accountId": "account-uuid",
        "accountNumber": "ACC-ALICE-001",
        "accountType": "STANDARD",
        "currency": "INR",
        "storedBalance": "1000.00",
        "reconciledBalance": "1000.00",
        "totalCredits": "1000.00",
        "totalDebits": "0.00",
        "discrepancy": "0.00",
        "isBalanced": true
      }
    }
    ```
  - `403 Forbidden` (Called by Account Holder):
    ```json
    {
      "error": "Forbidden: Access denied. Role 'ACCOUNT_HOLDER' is not authorized for this resource. Required: [AUDITOR, ADMIN]"
    }
    ```

---

## 4. Transaction Endpoints

All transaction endpoints require authentication and support client-specified idempotency via the `Idempotency-Key` HTTP header.

- **Header**: `Idempotency-Key: <unique-uuid-or-string>`
- **Idempotency Behavior**:
  - **First Request**: Executes the financial transaction inside a PostgreSQL ACID transaction, returns `201 Created`, and caches the response.
  - **Identical Retry (Same Key + Same Payload)**: Returns `200 OK` with `idempotent: true` and the original cached response without re-executing any ledger entries or balance changes.
  - **In-flight Duplicate**: Returns `409 Conflict` (`A request with this idempotency key is already in progress.`).
  - **Key Reuse with Modified Payload**: Returns `422 Unprocessable Entity` (`Idempotency key reuse with a different request payload is not allowed.`).
  - **Failed Prior Request**: Returns `409 Conflict` prompting the client to retry with a new key.

---

### 4.1 Deposit Funds
Deposits funds into a customer account using the system clearing account (`SYSTEM_CLEARING`) as the counterpart.
- Creates 2 balanced ledger entries: `DEBIT` on `SYS-CLEARING-001`, `CREDIT` on customer account.

- **Method**: `POST`
- **Path**: `/transactions/deposit`
- **Auth Required**: Yes (`ADMIN` or `ACCOUNT_HOLDER` for own account)
- **Headers**:
  ```text
  Authorization: Bearer <token>
  Idempotency-Key: 7b56e6d1-4cb7-4a0b-9366-0761a35567b1
  ```
- **Request Body**:
  ```json
  {
    "accountId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "amount": "250.00",
    "description": "Salary deposit"
  }
  ```
- **Responses**:
  - `201 Created`:
    ```json
    {
      "message": "Deposit completed successfully.",
      "transaction": {
        "transactionId": "5c9b740e-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        "reference": "TXN-20261105-A7B9",
        "type": "DEPOSIT",
        "amount": "250.00",
        "currency": "INR",
        "accountId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        "accountNumber": "ACC-ALICE-001",
        "balanceBefore": "1000.00",
        "balanceAfter": "1250.00",
        "status": "COMPLETED",
        "createdAt": "2026-11-05T21:30:00.000Z"
      }
    }
    ```
  - `200 OK` (Idempotent replay):
    ```json
    {
      "message": "Duplicate request: returning cached result.",
      "idempotent": true,
      "transaction": { ... }
    }
    ```
  - `400 Bad Request` (Invalid amount / Zero / Negative / Malformed UUID / Clearing account):
    ```json
    {
      "error": "Validation failed: amount must be greater than zero."
    }
    ```
  - `403 Forbidden` (Account holder attempting to deposit into another user's account, or Auditor):
    ```json
    {
      "error": "Forbidden: You do not have permission to deposit into this account."
    }
    ```

---

### 4.2 Withdraw Funds
Withdraws funds from a customer account using `SYSTEM_CLEARING` as the counterpart.
- Creates 2 balanced ledger entries: `DEBIT` on customer account, `CREDIT` on `SYS-CLEARING-001`.
- Enforces strict no-overdraft invariant (`balance - amount >= 0`).

- **Method**: `POST`
- **Path**: `/transactions/withdraw`
- **Auth Required**: Yes (`ADMIN` or `ACCOUNT_HOLDER` for own account)
- **Headers**:
  ```text
  Authorization: Bearer <token>
  Idempotency-Key: 8a45e2c3-1bf2-4d56-8a7c-3b4e5f6a7b8c
  ```
- **Request Body**:
  ```json
  {
    "accountId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "amount": "100.00",
    "description": "ATM withdrawal"
  }
  ```
- **Responses**:
  - `201 Created`:
    ```json
    {
      "message": "Withdrawal completed successfully.",
      "transaction": {
        "transactionId": "6d8a941f-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        "reference": "TXN-20261105-C3E4",
        "type": "WITHDRAWAL",
        "amount": "100.00",
        "currency": "INR",
        "accountId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        "accountNumber": "ACC-ALICE-001",
        "balanceBefore": "1250.00",
        "balanceAfter": "1150.00",
        "status": "COMPLETED",
        "createdAt": "2026-11-05T21:31:00.000Z"
      }
    }
    ```
  - `400 Bad Request` (Insufficient funds):
    ```json
    {
      "error": "Insufficient funds. Available balance: 50.00 INR."
    }
    ```
  - `403 Forbidden` (Attempting to withdraw from another user's account):
    ```json
    {
      "error": "Forbidden: You do not have permission to withdraw from this account."
    }
    ```

---

### 4.3 Internal Transfer
Transfers funds between two customer accounts atomically.
- Creates 2 balanced ledger entries: `DEBIT` on source account, `CREDIT` on destination account.
- Zero net effect on the system's aggregate balance.
- Locks both account rows in ascending UUID order to eliminate database deadlocks under high concurrency.
- Enforces self-transfer rejection (`fromAccountId !== toAccountId`).

- **Method**: `POST`
- **Path**: `/transactions/transfer`
- **Auth Required**: Yes (`ADMIN` or `ACCOUNT_HOLDER` for own source account)
- **Headers**:
  ```text
  Authorization: Bearer <token>
  Idempotency-Key: 9c34d5e6-2ca3-4e67-9b8d-4c5e6f7a8b9c
  ```
- **Request Body**:
  ```json
  {
    "fromAccountId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "toAccountId": "4eb96075-6828-4673-c40d-3d074077bfb7",
    "amount": "50.00",
    "description": "Lunch split reimbursement"
  }
  ```
- **Responses**:
  - `201 Created`:
    ```json
    {
      "message": "Transfer completed successfully.",
      "transaction": {
        "transactionId": "7e9b0520-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        "reference": "TXN-20261105-D5F6",
        "type": "TRANSFER",
        "amount": "50.00",
        "currency": "INR",
        "fromAccountId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        "fromAccountNumber": "ACC-ALICE-001",
        "fromBalanceBefore": "1150.00",
        "fromBalanceAfter": "1100.00",
        "toAccountId": "4eb96075-6828-4673-c40d-3d074077bfb7",
        "toAccountNumber": "ACC-BOB-001",
        "toBalanceBefore": "500.00",
        "toBalanceAfter": "550.00",
        "status": "COMPLETED",
        "createdAt": "2026-11-05T21:32:00.000Z"
      }
    }
    ```
  - `400 Bad Request` (Self-transfer attempt):
    ```json
    {
      "error": "Validation failed: source and destination accounts must be different."
    }
    ```
  - `400 Bad Request` (Insufficient funds in source account):
    ```json
    {
      "error": "Insufficient funds. Available balance: 20.00 INR."
    }
    ```
  - `403 Forbidden` (Attempting to transfer from an account not owned by user):
    ```json
    {
      "error": "Forbidden: You do not have permission to transfer from this account."
    }
    ```

