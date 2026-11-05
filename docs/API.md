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

## 3. Account Access & Ownership Endpoints (Preview)

### 3.1 View Account by ID
Returns account information. Enforces ownership:
- `ACCOUNT_HOLDER` can only view their own accounts.
- `ADMIN` and `AUDITOR` can view all accounts.

- **Method**: `GET`
- **Path**: `/accounts/:id`
- **Auth Required**: Yes
- **Responses**:
  - `200 OK`: Account details.
  - `403 Forbidden` (BOLA prevention when Alice requests Bob's account):
    ```json
    {
      "error": "Forbidden: You do not have permission to view or operate on this account."
    }
    ```
