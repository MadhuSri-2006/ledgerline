// Ledger Service — Stage 6: Core Transaction Engine
// Implements double-entry ACID deposits, withdrawals, and transfers.
//
// DESIGN PRINCIPLES:
// 1. Every financial operation runs inside prisma.$transaction with interactive transactions.
// 2. Row-level locking via raw SELECT ... FOR UPDATE prevents concurrent overdraft.
// 3. Lock ordering: always acquire row locks in ascending UUID string order to prevent deadlocks.
// 4. All monetary arithmetic uses Prisma.Decimal — never JavaScript floating-point.
// 5. Every committed transaction has exactly balanced ledger entries (sum debits = sum credits).
// 6. Idempotency: insert PENDING key before any money movement; mark RESOLVED with cached response
//    inside the same atomic transaction; handle duplicate key as 409 Conflict or return cached result.
// 7. Declined / unauthorized attempts are written to AuditLog OUTSIDE the main transaction
//    so they persist even if the financial transaction rolls back.

const { Prisma } = require('@prisma/client');
const crypto = require('crypto');
const prisma = require('../config/db');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generates a human-readable, unique transaction reference.
 * Example: TXN-20261105-A3F2
 */
function generateReference() {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randPart = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `TXN-${datePart}-${randPart}`;
}

/**
 * SHA-256 hash of a canonical JSON payload string.
 * Used to detect payload tampering under a reused idempotency key.
 */
function hashPayload(payload) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex');
}

const MAX_TRANSACTION_AMOUNT = new Prisma.Decimal('999999999999.99');
const TX_OPTIONS = { maxWait: 15000, timeout: 30000 };

/**
 * Validates a monetary amount string:
 * - Must be parseable as a positive Decimal
 * - Must have at most 2 decimal places
 * - Must not be zero or negative
 * - Must not exceed maximum allowed DECIMAL(14,2) limit
 * Returns a Prisma.Decimal on success, throws a structured error on failure.
 */
function parseAndValidateAmount(rawAmount) {
  if (rawAmount === undefined || rawAmount === null || rawAmount === '') {
    throw { statusCode: 400, message: 'Validation failed: amount is required.' };
  }

  let d;
  try {
    d = new Prisma.Decimal(rawAmount);
  } catch {
    throw { statusCode: 400, message: 'Validation failed: amount must be a valid number.' };
  }

  if (d.isNaN() || !d.isFinite()) {
    throw { statusCode: 400, message: 'Validation failed: amount must be a finite number.' };
  }

  if (d.lessThanOrEqualTo(new Prisma.Decimal('0'))) {
    throw { statusCode: 400, message: 'Validation failed: amount must be greater than zero.' };
  }

  // Reject more than 2 decimal places using exact decimal.js precision
  if (d.decimalPlaces() > 2) {
    throw { statusCode: 400, message: 'Validation failed: amount must have at most 2 decimal places.' };
  }

  // Reject amounts exceeding PostgreSQL DECIMAL(14,2) capacity
  if (d.greaterThan(MAX_TRANSACTION_AMOUNT)) {
    throw { statusCode: 400, message: 'Validation failed: amount exceeds maximum allowed limit of 999,999,999,999.99.' };
  }

  return d;
}

/**
 * Validates that a string is a correctly formatted UUID.
 */
function validateUUID(value, label) {
  if (!value) {
    throw { statusCode: 400, message: `Validation failed: ${label} is required.` };
  }
  if (!UUID_REGEX.test(value)) {
    throw { statusCode: 400, message: `Validation failed: ${label} must be a valid UUID.` };
  }
}

/**
 * Fetches and validates an account: must exist, be ACTIVE, and not be SYSTEM_CLEARING
 * when called for a customer-facing operation.
 * Returns the account row.
 */
async function fetchActiveCustomerAccount(tx, accountId, label) {
  const rows = await tx.$queryRaw`
    SELECT id, "accountNumber", type, balance, currency, status, "userId"
    FROM "Account"
    WHERE id = ${accountId}::uuid
    FOR UPDATE
  `;

  const account = rows[0];
  if (!account) {
    throw { statusCode: 404, message: `${label} not found.` };
  }
  if (account.type === 'SYSTEM_CLEARING') {
    throw { statusCode: 400, message: `${label} cannot be a SYSTEM_CLEARING account.` };
  }
  if (account.status !== 'ACTIVE') {
    throw { statusCode: 400, message: `${label} is not active (status: ${account.status}).` };
  }
  return account;
}

/**
 * Fetches the SYSTEM_CLEARING account under FOR UPDATE lock.
 * The clearing account is always required for deposits and withdrawals.
 */
async function fetchClearingAccountForUpdate(tx) {
  const rows = await tx.$queryRaw`
    SELECT id, "accountNumber", type, balance, currency, status
    FROM "Account"
    WHERE type = 'SYSTEM_CLEARING'::"AccountType"
    LIMIT 1
    FOR UPDATE
  `;
  if (!rows[0]) {
    throw { statusCode: 500, message: 'Internal error: SYSTEM_CLEARING account not found.' };
  }
  return rows[0];
}

// ---------------------------------------------------------------------------
// Idempotency helpers
// ---------------------------------------------------------------------------

/**
 * Attempts to insert an IdempotencyKey record with status PENDING.
 * Returns:
 *   { isNew: true }             — first time seeing this key; proceed with operation
 *   { isNew: false, record }    — key already exists; caller must inspect status
 * Both cases run OUTSIDE the financial transaction for independent persistence.
 */
async function acquireIdempotencySlot(userId, idempotencyKey, requestPath, requestHash) {
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours TTL

  try {
    const record = await prisma.idempotencyKey.create({
      data: {
        key: idempotencyKey,
        userId,
        requestPath,
        requestHash,
        status: 'PENDING',
        expiresAt,
      },
    });
    return { isNew: true, record };
  } catch (err) {
    // Unique constraint violation = duplicate key
    if (err.code === 'P2002') {
      const existing = await prisma.idempotencyKey.findUnique({
        where: { userId_key: { userId, key: idempotencyKey } },
      });
      return { isNew: false, record: existing };
    }
    throw err;
  }
}

/**
 * Updates an IdempotencyKey to RESOLVED with the cached response body and status code.
 * Called inside the financial prisma.$transaction after successful commit.
 */
async function resolveIdempotencyKey(tx, userId, idempotencyKey, statusCode, responseBody) {
  await tx.idempotencyKey.update({
    where: { userId_key: { userId, key: idempotencyKey } },
    data: {
      status: 'RESOLVED',
      statusCode,
      responseBody,
    },
  });
}

/**
 * Marks an IdempotencyKey as FAILED (called after a business-rule rejection).
 * Written independently of the financial transaction so it always persists.
 */
async function failIdempotencyKey(userId, idempotencyKey) {
  await prisma.idempotencyKey.update({
    where: { userId_key: { userId, key: idempotencyKey } },
    data: { status: 'FAILED' },
  }).catch(() => {
    // Best-effort: ignore if key was already updated concurrently
  });
}

// ---------------------------------------------------------------------------
// Audit helpers (always written OUTSIDE financial transaction)
// ---------------------------------------------------------------------------

async function logDeclinedAudit(userId, accountId, action, reason, balance = null, metadata = null) {
  await prisma.auditLog.create({
    data: {
      userId: userId || undefined,
      accountId: accountId || undefined,
      action,
      status: 'DECLINED',
      reason,
      runningBalance: balance,
      metadata: metadata || undefined,
    },
  }).catch((auditErr) => {
    // Audit failures must never surface to the caller — log internally only
    console.error('AuditLog write error (declined):', auditErr.message);
  });
}

// ---------------------------------------------------------------------------
// Deposit
// ---------------------------------------------------------------------------
//
// Double-entry bookkeeping for a DEPOSIT:
//   DEBIT  SYSTEM_CLEARING  amount   (clearing account loses asset)
//   CREDIT customerAccount  amount   (customer account gains asset)
//
// Net system effect: clearing balance decreases, customer balance increases by equal amount.

/**
 * @param {object} opts
 * @param {string} opts.accountId       Target customer account UUID
 * @param {string|number} opts.amount   Amount to deposit (string preferred for exact Decimal)
 * @param {string} opts.initiatedById   UUID of acting user
 * @param {string} [opts.userRole]      Role of acting user ('ADMIN', 'ACCOUNT_HOLDER')
 * @param {string} opts.idempotencyKey  Client-supplied idempotency key
 * @param {string} [opts.description]   Optional human-readable description
 * @returns {object} Transaction result with ledger snapshot
 */
async function deposit({ accountId, amount, initiatedById, userRole, idempotencyKey, description }) {
  // --- Input validation (before any DB calls) ---
  validateUUID(accountId, 'accountId');
  const decimalAmount = parseAndValidateAmount(amount);
  const requestPath = '/api/transactions/deposit';
  const requestHash = hashPayload({ accountId, amount: decimalAmount.toFixed(2) });

  // --- Idempotency slot ---
  const { isNew, record } = await acquireIdempotencySlot(
    initiatedById,
    idempotencyKey,
    requestPath,
    requestHash,
  );

  if (!isNew) {
    if (record.status === 'RESOLVED') {
      // Payload hash mismatch = same key, different payload = reject
      if (record.requestHash !== requestHash) {
        throw {
          statusCode: 422,
          message: 'Idempotency key reuse with a different request payload is not allowed.',
        };
      }
      return { idempotent: true, cached: record.responseBody };
    }
    if (record.status === 'PENDING') {
      throw { statusCode: 409, message: 'A request with this idempotency key is already in progress.' };
    }
    if (record.status === 'FAILED') {
      throw { statusCode: 409, message: 'A previous request with this idempotency key failed. Use a new key to retry.' };
    }
  }

  // --- ACID financial transaction ---
  let responseBody;
  try {
    responseBody = await prisma.$transaction(async (tx) => {
      // Lock customer account first
      const customerAccount = await fetchActiveCustomerAccount(tx, accountId, 'Deposit target account');

      // Ownership enforcement: ACCOUNT_HOLDER can only deposit into an account they own
      if (userRole === 'ACCOUNT_HOLDER' && customerAccount.userId !== initiatedById) {
        throw {
          statusCode: 403,
          message: 'Forbidden: You do not have permission to deposit into this account.',
          isBusinessError: true,
          accountId: customerAccount.id,
          action: 'UNAUTHORIZED_DEPOSIT_ATTEMPT',
        };
      }

      // Lock clearing account (always lock customer before clearing to avoid deadlock with withdrawal)
      const clearingAccount = await fetchClearingAccountForUpdate(tx);

      const customerBalance = new Prisma.Decimal(customerAccount.balance.toString());
      const clearingBalance = new Prisma.Decimal(clearingAccount.balance.toString());

      const newCustomerBalance = customerBalance.plus(decimalAmount);
      const newClearingBalance = clearingBalance.minus(decimalAmount);

      const reference = generateReference();

      // Create TransactionRecord
      const txRecord = await tx.transactionRecord.create({
        data: {
          reference,
          type: 'DEPOSIT',
          amount: decimalAmount,
          status: 'COMPLETED',
          description: description || `Deposit to ${customerAccount.accountNumber}`,
          initiatedById,
        },
      });

      // Create balanced LedgerEntries
      await tx.ledgerEntry.createMany({
        data: [
          {
            transactionId: txRecord.id,
            accountId: clearingAccount.id,
            entryType: 'DEBIT',
            amount: decimalAmount,
            balanceAfter: newClearingBalance,
          },
          {
            transactionId: txRecord.id,
            accountId: customerAccount.id,
            entryType: 'CREDIT',
            amount: decimalAmount,
            balanceAfter: newCustomerBalance,
          },
        ],
      });

      // Update cached balances
      await tx.account.update({
        where: { id: customerAccount.id },
        data: { balance: newCustomerBalance },
      });
      await tx.account.update({
        where: { id: clearingAccount.id },
        data: { balance: newClearingBalance },
      });

      // Write success audit log (inside transaction)
      await tx.auditLog.create({
        data: {
          userId: initiatedById,
          accountId: customerAccount.id,
          transactionId: txRecord.id,
          action: 'DEPOSIT_COMPLETED',
          status: 'SUCCESS',
          reason: `Deposited ${decimalAmount.toFixed(2)} ${customerAccount.currency} into ${customerAccount.accountNumber}`,
          runningBalance: newCustomerBalance,
        },
      });

      const result = {
        transactionId: txRecord.id,
        reference: txRecord.reference,
        type: 'DEPOSIT',
        amount: decimalAmount.toFixed(2),
        currency: customerAccount.currency,
        accountId: customerAccount.id,
        accountNumber: customerAccount.accountNumber,
        balanceBefore: customerBalance.toFixed(2),
        balanceAfter: newCustomerBalance.toFixed(2),
        status: 'COMPLETED',
        createdAt: txRecord.createdAt,
      };

      // Store cached response in idempotency key (same transaction = atomic)
      await resolveIdempotencyKey(tx, initiatedById, idempotencyKey, 201, result);

      return result;
    }, TX_OPTIONS);
  } catch (err) {
    // Mark idempotency key as FAILED so the client can retry with a new key
    await failIdempotencyKey(initiatedById, idempotencyKey);

    // Log declined audit independently.
    // Pass null for accountId if the account was not found (avoids FK violation).
    await logDeclinedAudit(
      initiatedById,
      err.statusCode === 404 ? null : (err.accountId || accountId),
      err.action || 'DEPOSIT_FAILED',
      err.message || 'Deposit failed.',
    );
    throw err;
  }

  return { idempotent: false, result: responseBody };
}

// ---------------------------------------------------------------------------
// Withdrawal
// ---------------------------------------------------------------------------
//
// Double-entry bookkeeping for a WITHDRAWAL:
//   DEBIT  customerAccount  amount   (customer account loses asset)
//   CREDIT SYSTEM_CLEARING  amount   (clearing account gains asset)
//
// Insufficient funds check: customerBalance - amount must be >= 0

/**
 * @param {object} opts
 * @param {string} opts.accountId       Source customer account UUID
 * @param {string|number} opts.amount   Amount to withdraw
 * @param {string} opts.initiatedById   UUID of acting user
 * @param {string} [opts.userRole]      Role of acting user ('ADMIN', 'ACCOUNT_HOLDER')
 * @param {string} opts.idempotencyKey  Client-supplied idempotency key
 * @param {string} [opts.description]   Optional human-readable description
 */
async function withdraw({ accountId, amount, initiatedById, userRole, idempotencyKey, description }) {
  // --- Input validation ---
  validateUUID(accountId, 'accountId');
  const decimalAmount = parseAndValidateAmount(amount);
  const requestPath = '/api/transactions/withdraw';
  const requestHash = hashPayload({ accountId, amount: decimalAmount.toFixed(2) });

  // --- Idempotency slot ---
  const { isNew, record } = await acquireIdempotencySlot(
    initiatedById,
    idempotencyKey,
    requestPath,
    requestHash,
  );

  if (!isNew) {
    if (record.status === 'RESOLVED') {
      if (record.requestHash !== requestHash) {
        throw {
          statusCode: 422,
          message: 'Idempotency key reuse with a different request payload is not allowed.',
        };
      }
      return { idempotent: true, cached: record.responseBody };
    }
    if (record.status === 'PENDING') {
      throw { statusCode: 409, message: 'A request with this idempotency key is already in progress.' };
    }
    if (record.status === 'FAILED') {
      throw { statusCode: 409, message: 'A previous request with this idempotency key failed. Use a new key to retry.' };
    }
  }

  // --- ACID financial transaction ---
  let responseBody;
  try {
    responseBody = await prisma.$transaction(async (tx) => {
      // Lock customer account
      const customerAccount = await fetchActiveCustomerAccount(tx, accountId, 'Withdrawal source account');

      // Ownership enforcement: ACCOUNT_HOLDER can only withdraw from an account they own
      if (userRole === 'ACCOUNT_HOLDER' && customerAccount.userId !== initiatedById) {
        throw {
          statusCode: 403,
          message: 'Forbidden: You do not have permission to withdraw from this account.',
          isBusinessError: true,
          accountId: customerAccount.id,
          action: 'UNAUTHORIZED_WITHDRAWAL_ATTEMPT',
        };
      }

      const clearingAccount = await fetchClearingAccountForUpdate(tx);

      const customerBalance = new Prisma.Decimal(customerAccount.balance.toString());
      const clearingBalance = new Prisma.Decimal(clearingAccount.balance.toString());

      // Insufficient funds check (no overdrafts)
      if (customerBalance.lessThan(decimalAmount)) {
        // Throw to trigger catch block which writes declined audit independently
        throw {
          statusCode: 400,
          message: `Insufficient funds. Available balance: ${customerBalance.toFixed(2)} ${customerAccount.currency}.`,
          isBusinessError: true,
          accountId: customerAccount.id,
        };
      }

      const newCustomerBalance = customerBalance.minus(decimalAmount);
      const newClearingBalance = clearingBalance.plus(decimalAmount);

      const reference = generateReference();

      const txRecord = await tx.transactionRecord.create({
        data: {
          reference,
          type: 'WITHDRAWAL',
          amount: decimalAmount,
          status: 'COMPLETED',
          description: description || `Withdrawal from ${customerAccount.accountNumber}`,
          initiatedById,
        },
      });

      await tx.ledgerEntry.createMany({
        data: [
          {
            transactionId: txRecord.id,
            accountId: customerAccount.id,
            entryType: 'DEBIT',
            amount: decimalAmount,
            balanceAfter: newCustomerBalance,
          },
          {
            transactionId: txRecord.id,
            accountId: clearingAccount.id,
            entryType: 'CREDIT',
            amount: decimalAmount,
            balanceAfter: newClearingBalance,
          },
        ],
      });

      await tx.account.update({
        where: { id: customerAccount.id },
        data: { balance: newCustomerBalance },
      });
      await tx.account.update({
        where: { id: clearingAccount.id },
        data: { balance: newClearingBalance },
      });

      await tx.auditLog.create({
        data: {
          userId: initiatedById,
          accountId: customerAccount.id,
          transactionId: txRecord.id,
          action: 'WITHDRAWAL_COMPLETED',
          status: 'SUCCESS',
          reason: `Withdrew ${decimalAmount.toFixed(2)} ${customerAccount.currency} from ${customerAccount.accountNumber}`,
          runningBalance: newCustomerBalance,
        },
      });

      const result = {
        transactionId: txRecord.id,
        reference: txRecord.reference,
        type: 'WITHDRAWAL',
        amount: decimalAmount.toFixed(2),
        currency: customerAccount.currency,
        accountId: customerAccount.id,
        accountNumber: customerAccount.accountNumber,
        balanceBefore: customerBalance.toFixed(2),
        balanceAfter: newCustomerBalance.toFixed(2),
        status: 'COMPLETED',
        createdAt: txRecord.createdAt,
      };

      await resolveIdempotencyKey(tx, initiatedById, idempotencyKey, 201, result);
      return result;
    }, TX_OPTIONS);
  } catch (err) {
    await failIdempotencyKey(initiatedById, idempotencyKey);
    await logDeclinedAudit(
      initiatedById,
      err.statusCode === 404 ? null : (err.accountId || accountId),
      err.action || 'WITHDRAWAL_DECLINED',
      err.message || 'Withdrawal failed.',
    );
    throw err;
  }

  return { idempotent: false, result: responseBody };
}

// ---------------------------------------------------------------------------
// Transfer
// ---------------------------------------------------------------------------
//
// Double-entry bookkeeping for an internal TRANSFER:
//   DEBIT  fromAccount  amount   (sender loses asset)
//   CREDIT toAccount    amount   (receiver gains asset)
//
// Lock ordering: always lock the account whose UUID is lexicographically smaller first.
// This prevents deadlocks when two concurrent transfers cross between the same pair of accounts.

/**
 * @param {object} opts
 * @param {string} opts.fromAccountId   Source customer account UUID
 * @param {string} opts.toAccountId     Destination customer account UUID
 * @param {string|number} opts.amount   Amount to transfer
 * @param {string} opts.initiatedById   UUID of acting user
 * @param {string} [opts.userRole]      Role of acting user ('ADMIN', 'ACCOUNT_HOLDER')
 * @param {string} opts.idempotencyKey  Client-supplied idempotency key
 * @param {string} [opts.description]   Optional human-readable description
 */
async function transfer({ fromAccountId, toAccountId, amount, initiatedById, userRole, idempotencyKey, description }) {
  // --- Input validation ---
  validateUUID(fromAccountId, 'fromAccountId');
  validateUUID(toAccountId, 'toAccountId');
  const decimalAmount = parseAndValidateAmount(amount);

  // Self-transfer rejection
  if (fromAccountId === toAccountId) {
    throw { statusCode: 400, message: 'Validation failed: source and destination accounts must be different.' };
  }

  const requestPath = '/api/transactions/transfer';
  const requestHash = hashPayload({
    fromAccountId,
    toAccountId,
    amount: decimalAmount.toFixed(2),
  });

  // --- Idempotency slot ---
  const { isNew, record } = await acquireIdempotencySlot(
    initiatedById,
    idempotencyKey,
    requestPath,
    requestHash,
  );

  if (!isNew) {
    if (record.status === 'RESOLVED') {
      if (record.requestHash !== requestHash) {
        throw {
          statusCode: 422,
          message: 'Idempotency key reuse with a different request payload is not allowed.',
        };
      }
      return { idempotent: true, cached: record.responseBody };
    }
    if (record.status === 'PENDING') {
      throw { statusCode: 409, message: 'A request with this idempotency key is already in progress.' };
    }
    if (record.status === 'FAILED') {
      throw { statusCode: 409, message: 'A previous request with this idempotency key failed. Use a new key to retry.' };
    }
  }

  // --- ACID financial transaction ---
  let responseBody;
  try {
    responseBody = await prisma.$transaction(async (tx) => {
      // Lock both rows in ascending UUID order to prevent deadlocks
      const [firstId, secondId] = [fromAccountId, toAccountId].sort();

      const firstRows = await tx.$queryRaw`
        SELECT id, "accountNumber", type, balance, currency, status, "userId"
        FROM "Account"
        WHERE id = ${firstId}::uuid
        FOR UPDATE
      `;
      const secondRows = await tx.$queryRaw`
        SELECT id, "accountNumber", type, balance, currency, status, "userId"
        FROM "Account"
        WHERE id = ${secondId}::uuid
        FOR UPDATE
      `;

      // Map back to named variables regardless of lock ordering
      const fromAccount = firstId === fromAccountId ? firstRows[0] : secondRows[0];
      const toAccount = firstId === toAccountId ? firstRows[0] : secondRows[0];

      if (!fromAccount) throw { statusCode: 404, message: 'Source account not found.' };
      if (!toAccount) throw { statusCode: 404, message: 'Destination account not found.' };

      // Ownership enforcement: ACCOUNT_HOLDER can only transfer from an account they own
      if (userRole === 'ACCOUNT_HOLDER' && fromAccount.userId !== initiatedById) {
        throw {
          statusCode: 403,
          message: 'Forbidden: You do not have permission to transfer from this account.',
          isBusinessError: true,
          accountId: fromAccount.id,
          action: 'UNAUTHORIZED_TRANSFER_ATTEMPT',
        };
      }

      // Reject SYSTEM_CLEARING in transfers (use deposit/withdrawal instead)
      if (fromAccount.type === 'SYSTEM_CLEARING') {
        throw { statusCode: 400, message: 'Transfers from SYSTEM_CLEARING accounts are not allowed.' };
      }
      if (toAccount.type === 'SYSTEM_CLEARING') {
        throw { statusCode: 400, message: 'Transfers to SYSTEM_CLEARING accounts are not allowed.' };
      }

      if (fromAccount.status !== 'ACTIVE') {
        throw { statusCode: 400, message: `Source account is not active (status: ${fromAccount.status}).` };
      }
      if (toAccount.status !== 'ACTIVE') {
        throw { statusCode: 400, message: `Destination account is not active (status: ${toAccount.status}).` };
      }

      // Currency compatibility
      if (fromAccount.currency !== toAccount.currency) {
        throw {
          statusCode: 400,
          message: `Currency mismatch: cannot transfer between ${fromAccount.currency} and ${toAccount.currency}.`,
        };
      }

      const fromBalance = new Prisma.Decimal(fromAccount.balance.toString());
      const toBalance = new Prisma.Decimal(toAccount.balance.toString());

      // Insufficient funds check
      if (fromBalance.lessThan(decimalAmount)) {
        throw {
          statusCode: 400,
          message: `Insufficient funds. Available balance: ${fromBalance.toFixed(2)} ${fromAccount.currency}.`,
          isBusinessError: true,
          accountId: fromAccount.id,
        };
      }

      const newFromBalance = fromBalance.minus(decimalAmount);
      const newToBalance = toBalance.plus(decimalAmount);

      const reference = generateReference();

      const txRecord = await tx.transactionRecord.create({
        data: {
          reference,
          type: 'TRANSFER',
          amount: decimalAmount,
          status: 'COMPLETED',
          description: description || `Transfer from ${fromAccount.accountNumber} to ${toAccount.accountNumber}`,
          initiatedById,
        },
      });

      // Balanced double-entry: DEBIT sender, CREDIT receiver
      await tx.ledgerEntry.createMany({
        data: [
          {
            transactionId: txRecord.id,
            accountId: fromAccount.id,
            entryType: 'DEBIT',
            amount: decimalAmount,
            balanceAfter: newFromBalance,
          },
          {
            transactionId: txRecord.id,
            accountId: toAccount.id,
            entryType: 'CREDIT',
            amount: decimalAmount,
            balanceAfter: newToBalance,
          },
        ],
      });

      await tx.account.update({
        where: { id: fromAccount.id },
        data: { balance: newFromBalance },
      });
      await tx.account.update({
        where: { id: toAccount.id },
        data: { balance: newToBalance },
      });

      await tx.auditLog.create({
        data: {
          userId: initiatedById,
          accountId: fromAccount.id,
          transactionId: txRecord.id,
          action: 'TRANSFER_COMPLETED',
          status: 'SUCCESS',
          reason: `Transferred ${decimalAmount.toFixed(2)} ${fromAccount.currency} from ${fromAccount.accountNumber} to ${toAccount.accountNumber}`,
          runningBalance: newFromBalance,
        },
      });

      const result = {
        transactionId: txRecord.id,
        reference: txRecord.reference,
        type: 'TRANSFER',
        amount: decimalAmount.toFixed(2),
        currency: fromAccount.currency,
        fromAccountId: fromAccount.id,
        fromAccountNumber: fromAccount.accountNumber,
        fromBalanceBefore: fromBalance.toFixed(2),
        fromBalanceAfter: newFromBalance.toFixed(2),
        toAccountId: toAccount.id,
        toAccountNumber: toAccount.accountNumber,
        toBalanceBefore: toBalance.toFixed(2),
        toBalanceAfter: newToBalance.toFixed(2),
        status: 'COMPLETED',
        createdAt: txRecord.createdAt,
      };

      await resolveIdempotencyKey(tx, initiatedById, idempotencyKey, 201, result);
      return result;
    }, TX_OPTIONS);
  } catch (err) {
    await failIdempotencyKey(initiatedById, idempotencyKey);
    await logDeclinedAudit(
      initiatedById,
      err.statusCode === 404 ? null : (err.accountId || fromAccountId),
      err.action || 'TRANSFER_DECLINED',
      err.message || 'Transfer failed.',
    );
    throw err;
  }

  return { idempotent: false, result: responseBody };
}

module.exports = {
  deposit,
  withdraw,
  transfer,
  _helpers: {
    generateReference,
    hashPayload,
    parseAndValidateAmount,
    validateUUID,
  },
};
