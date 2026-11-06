// Stage 6: Core Transaction Engine Tests
// Tests deposit, withdrawal, transfer with ACID guarantees, idempotency,
// concurrency, ownership enforcement, and declined-attempt persistence.

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const app = require('../src/app');
const prisma = require('../src/config/db');
const { hasSeparateTestDb } = require('../src/config/db');

jest.setTimeout(60000); // Network + bcrypt + concurrent tests need generous timeout

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loginAs(email, password) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password });
  expect(res.status).toBe(200);
  return res.body.token;
}

// Restore a seeded account balance directly in DB (for test teardown)
async function restoreBalance(accountNumber, balance) {
  await prisma.account.update({
    where: { accountNumber },
    data: { balance },
  });
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

const describeDb = hasSeparateTestDb ? describe : describe.skip;

describeDb('Stage 6: Core Transaction Engine', () => {
  let adminToken;
  let aliceToken;
  let bobToken;
  let auditorToken;

  let aliceUserId;
  let bobUserId;

  let aliceAccountId;
  let bobAccountId;
  let clearingAccountId;

  let beforeAliceBalance;
  let beforeBobBalance;
  let beforeClearingBalance;

  // Track any test-created accounts so we can clean them up
  const createdAccountIds = [];

  // Snapshots of pre-existing record IDs so cleanup touches ONLY records created by this suite
  let beforeTxIds = new Set();
  let beforeAuditLogIds = new Set();
  let beforeKeyIds = new Set();

  beforeAll(async () => {
    // Snapshot existing IDs before tests run
    const existingTxs = await prisma.transactionRecord.findMany({ select: { id: true } });
    beforeTxIds = new Set(existingTxs.map((t) => t.id));

    const existingAudits = await prisma.auditLog.findMany({ select: { id: true } });
    beforeAuditLogIds = new Set(existingAudits.map((a) => a.id));

    const existingKeys = await prisma.idempotencyKey.findMany({ select: { id: true } });
    beforeKeyIds = new Set(existingKeys.map((k) => k.id));

    // Log in as all demo users
    adminToken = await loginAs('admin@ledgerline.internal', 'AdminPassword123!');
    aliceToken = await loginAs('alice@ledgerline.internal', 'AlicePassword123!');
    bobToken = await loginAs('bob@ledgerline.internal', 'BobPassword123!');
    auditorToken = await loginAs('auditor@ledgerline.internal', 'AuditorPassword123!');

    const alice = await prisma.user.findUnique({ where: { email: 'alice@ledgerline.internal' } });
    const bob = await prisma.user.findUnique({ where: { email: 'bob@ledgerline.internal' } });
    aliceUserId = alice.id;
    bobUserId = bob.id;

    const aliceAcc = await prisma.account.findUnique({ where: { accountNumber: 'ACC-ALICE-001' } });
    const bobAcc = await prisma.account.findUnique({ where: { accountNumber: 'ACC-BOB-001' } });
    const clearing = await prisma.account.findUnique({ where: { accountNumber: 'SYS-CLEARING-001' } });

    aliceAccountId = aliceAcc.id;
    bobAccountId = bobAcc.id;
    clearingAccountId = clearing.id;

    beforeAliceBalance = aliceAcc.balance.toFixed(2);
    beforeBobBalance = bobAcc.balance.toFixed(2);
    beforeClearingBalance = clearing.balance.toFixed(2);
  });

  afterAll(async () => {
    // Determine the exact records created during this test suite run
    const currentTxs = await prisma.transactionRecord.findMany({ select: { id: true } });
    const testTxIds = currentTxs.map((t) => t.id).filter((id) => !beforeTxIds.has(id));

    const currentAudits = await prisma.auditLog.findMany({ select: { id: true } });
    const testAuditIds = currentAudits.map((a) => a.id).filter((id) => !beforeAuditLogIds.has(id));

    const currentKeys = await prisma.idempotencyKey.findMany({ select: { id: true } });
    const testKeyIds = currentKeys.map((k) => k.id).filter((id) => !beforeKeyIds.has(id));

    // 1. Delete ledger entries for test transactions in FK order
    if (testTxIds.length > 0) {
      await prisma.ledgerEntry.deleteMany({
        where: { transactionId: { in: testTxIds } },
      });
    }

    // 2. Delete audit logs created during this test suite
    if (testAuditIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { id: { in: testAuditIds } },
      });
    }

    // 3. Delete test transaction records
    if (testTxIds.length > 0) {
      await prisma.transactionRecord.deleteMany({
        where: { id: { in: testTxIds } },
      });
    }

    // 4. Delete test idempotency keys
    if (testKeyIds.length > 0) {
      await prisma.idempotencyKey.deleteMany({
        where: { id: { in: testKeyIds } },
      });
    }

    // 5. Clean up any test-created accounts in FK order
    for (const accId of createdAccountIds) {
      await prisma.ledgerEntry.deleteMany({ where: { accountId: accId } });
      await prisma.auditLog.deleteMany({ where: { accountId: accId } });
      await prisma.account.deleteMany({ where: { id: accId } });
    }

    // 6. Restore original pre-test balances so manual testing data is preserved
    await prisma.account.update({
      where: { id: aliceAccountId },
      data: { balance: beforeAliceBalance },
    });
    await prisma.account.update({
      where: { id: bobAccountId },
      data: { balance: beforeBobBalance },
    });
    await prisma.account.update({
      where: { id: clearingAccountId },
      data: { balance: beforeClearingBalance },
    });

    await prisma.$disconnect();
  });

  // =========================================================================
  // 1. Deposit — Happy Path
  // =========================================================================
  describe('POST /api/transactions/deposit — Deposits', () => {
    it('should allow ADMIN to deposit funds and update balances correctly', async () => {
      const before = await prisma.account.findUnique({ where: { id: aliceAccountId } });
      const depositAmount = '100.00';

      const res = await request(app)
        .post('/api/transactions/deposit')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', uuidv4())
        .send({ accountId: aliceAccountId, amount: depositAmount, description: 'Admin test deposit' });

      expect(res.status).toBe(201);
      expect(res.body.transaction.type).toBe('DEPOSIT');
      expect(res.body.transaction.amount).toBe('100.00');
      expect(res.body.transaction.status).toBe('COMPLETED');

      const expectedBalance = new (require('@prisma/client').Prisma.Decimal)(before.balance.toString())
        .plus('100.00')
        .toFixed(2);
      expect(res.body.transaction.balanceAfter).toBe(expectedBalance);

      // Verify persisted balance in DB
      const after = await prisma.account.findUnique({ where: { id: aliceAccountId } });
      expect(after.balance.toFixed(2)).toBe(expectedBalance);
    });

    it('should allow ACCOUNT_HOLDER to deposit into their own account', async () => {
      const res = await request(app)
        .post('/api/transactions/deposit')
        .set('Authorization', `Bearer ${aliceToken}`)
        .set('Idempotency-Key', uuidv4())
        .send({ accountId: aliceAccountId, amount: '50.00' });

      expect(res.status).toBe(201);
      expect(res.body.transaction.type).toBe('DEPOSIT');
      expect(res.body.transaction.amount).toBe('50.00');
    });

    it('should create exactly 2 balanced ledger entries for a deposit', async () => {
      const idempotencyKey = uuidv4();
      const res = await request(app)
        .post('/api/transactions/deposit')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({ accountId: aliceAccountId, amount: '25.00' });

      expect(res.status).toBe(201);
      const txId = res.body.transaction.transactionId;

      const entries = await prisma.ledgerEntry.findMany({ where: { transactionId: txId } });
      expect(entries).toHaveLength(2);

      const { Prisma } = require('@prisma/client');
      const debit = entries.find((e) => e.entryType === 'DEBIT');
      const credit = entries.find((e) => e.entryType === 'CREDIT');

      expect(debit).toBeTruthy();
      expect(credit).toBeTruthy();

      // Both amounts must be equal (balanced)
      expect(new Prisma.Decimal(debit.amount.toString()).equals(new Prisma.Decimal(credit.amount.toString()))).toBe(true);

      // Debit on clearing, credit on customer
      expect(debit.accountId).toBe(clearingAccountId);
      expect(credit.accountId).toBe(aliceAccountId);
    });
  });

  // =========================================================================
  // 2. Withdrawal — Happy Path
  // =========================================================================
  describe('POST /api/transactions/withdraw — Withdrawals', () => {
    it('should allow ACCOUNT_HOLDER to withdraw from their own account', async () => {
      const before = await prisma.account.findUnique({ where: { id: aliceAccountId } });

      const res = await request(app)
        .post('/api/transactions/withdraw')
        .set('Authorization', `Bearer ${aliceToken}`)
        .set('Idempotency-Key', uuidv4())
        .send({ accountId: aliceAccountId, amount: '50.00' });

      expect(res.status).toBe(201);
      expect(res.body.transaction.type).toBe('WITHDRAWAL');
      expect(res.body.transaction.amount).toBe('50.00');
      expect(res.body.transaction.status).toBe('COMPLETED');

      const after = await prisma.account.findUnique({ where: { id: aliceAccountId } });
      const { Prisma } = require('@prisma/client');
      const expectedBalance = new Prisma.Decimal(before.balance.toString()).minus('50.00').toFixed(2);
      expect(after.balance.toFixed(2)).toBe(expectedBalance);
    });

    it('should create exactly 2 balanced ledger entries for a withdrawal', async () => {
      const res = await request(app)
        .post('/api/transactions/withdraw')
        .set('Authorization', `Bearer ${bobToken}`)
        .set('Idempotency-Key', uuidv4())
        .send({ accountId: bobAccountId, amount: '10.00' });

      expect(res.status).toBe(201);
      const txId = res.body.transaction.transactionId;

      const entries = await prisma.ledgerEntry.findMany({ where: { transactionId: txId } });
      expect(entries).toHaveLength(2);

      const { Prisma } = require('@prisma/client');
      const debit = entries.find((e) => e.entryType === 'DEBIT');
      const credit = entries.find((e) => e.entryType === 'CREDIT');

      // Balanced
      expect(new Prisma.Decimal(debit.amount.toString()).equals(new Prisma.Decimal(credit.amount.toString()))).toBe(true);

      // Debit on customer, credit on clearing
      expect(debit.accountId).toBe(bobAccountId);
      expect(credit.accountId).toBe(clearingAccountId);
    });
  });

  // =========================================================================
  // 3. Transfer — Happy Path
  // =========================================================================
  describe('POST /api/transactions/transfer — Transfers', () => {
    it('should allow ADMIN to transfer between customer accounts', async () => {
      const { Prisma } = require('@prisma/client');
      const aliceBefore = await prisma.account.findUnique({ where: { id: aliceAccountId } });
      const bobBefore = await prisma.account.findUnique({ where: { id: bobAccountId } });

      const res = await request(app)
        .post('/api/transactions/transfer')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', uuidv4())
        .send({ fromAccountId: aliceAccountId, toAccountId: bobAccountId, amount: '100.00' });

      expect(res.status).toBe(201);
      expect(res.body.transaction.type).toBe('TRANSFER');
      expect(res.body.transaction.status).toBe('COMPLETED');
      expect(res.body.transaction.amount).toBe('100.00');

      const aliceAfter = await prisma.account.findUnique({ where: { id: aliceAccountId } });
      const bobAfter = await prisma.account.findUnique({ where: { id: bobAccountId } });

      const aliceExpected = new Prisma.Decimal(aliceBefore.balance.toString()).minus('100.00').toFixed(2);
      const bobExpected = new Prisma.Decimal(bobBefore.balance.toString()).plus('100.00').toFixed(2);

      expect(aliceAfter.balance.toFixed(2)).toBe(aliceExpected);
      expect(bobAfter.balance.toFixed(2)).toBe(bobExpected);
    });

    it('should allow ACCOUNT_HOLDER to transfer from their own account', async () => {
      const res = await request(app)
        .post('/api/transactions/transfer')
        .set('Authorization', `Bearer ${aliceToken}`)
        .set('Idempotency-Key', uuidv4())
        .send({ fromAccountId: aliceAccountId, toAccountId: bobAccountId, amount: '10.00' });

      expect(res.status).toBe(201);
      expect(res.body.transaction.type).toBe('TRANSFER');
    });

    it('should create exactly 2 balanced ledger entries for a transfer', async () => {
      const res = await request(app)
        .post('/api/transactions/transfer')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', uuidv4())
        .send({ fromAccountId: aliceAccountId, toAccountId: bobAccountId, amount: '5.00' });

      expect(res.status).toBe(201);
      const txId = res.body.transaction.transactionId;

      const entries = await prisma.ledgerEntry.findMany({ where: { transactionId: txId } });
      expect(entries).toHaveLength(2);

      const { Prisma } = require('@prisma/client');
      const debit = entries.find((e) => e.entryType === 'DEBIT');
      const credit = entries.find((e) => e.entryType === 'CREDIT');

      expect(new Prisma.Decimal(debit.amount.toString()).equals(new Prisma.Decimal(credit.amount.toString()))).toBe(true);
      expect(debit.accountId).toBe(aliceAccountId);
      expect(credit.accountId).toBe(bobAccountId);
    });

    it('should have zero net system effect: transfer does not change total customer balance sum', async () => {
      const { Prisma } = require('@prisma/client');
      const aliceBefore = await prisma.account.findUnique({ where: { id: aliceAccountId } });
      const bobBefore = await prisma.account.findUnique({ where: { id: bobAccountId } });
      const sumBefore = new Prisma.Decimal(aliceBefore.balance.toString())
        .plus(new Prisma.Decimal(bobBefore.balance.toString()));

      await request(app)
        .post('/api/transactions/transfer')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', uuidv4())
        .send({ fromAccountId: aliceAccountId, toAccountId: bobAccountId, amount: '20.00' });

      const aliceAfter = await prisma.account.findUnique({ where: { id: aliceAccountId } });
      const bobAfter = await prisma.account.findUnique({ where: { id: bobAccountId } });
      const sumAfter = new Prisma.Decimal(aliceAfter.balance.toString())
        .plus(new Prisma.Decimal(bobAfter.balance.toString()));

      // Total money in the system is conserved
      expect(sumAfter.equals(sumBefore)).toBe(true);
    });
  });

  // =========================================================================
  // 4. Balance Reconciliation After Transactions
  // =========================================================================
  describe('Balance Reconciliation — Ledger Consistency', () => {
    it('should confirm Alice account reconciles (storedBalance === ledger sum) after transactions', async () => {
      const res = await request(app)
        .get(`/api/accounts/${aliceAccountId}/reconcile`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.reconciliation.isBalanced).toBe(true);
      expect(res.body.reconciliation.discrepancy).toBe('0.00');
    });

    it('should confirm Bob account reconciles after transactions', async () => {
      const res = await request(app)
        .get(`/api/accounts/${bobAccountId}/reconcile`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.reconciliation.isBalanced).toBe(true);
    });
  });

  // =========================================================================
  // 5. Insufficient Funds
  // =========================================================================
  describe('Insufficient Funds Rejection', () => {
    it('should reject withdrawal exceeding account balance with 400', async () => {
      // Get Alice's current balance and try to withdraw more
      const alice = await prisma.account.findUnique({ where: { id: aliceAccountId } });
      const { Prisma } = require('@prisma/client');
      const overAmount = new Prisma.Decimal(alice.balance.toString()).plus('999999.00').toFixed(2);

      const res = await request(app)
        .post('/api/transactions/withdraw')
        .set('Authorization', `Bearer ${aliceToken}`)
        .set('Idempotency-Key', uuidv4())
        .send({ accountId: aliceAccountId, amount: overAmount });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Insufficient funds/i);
    });

    it('should reject transfer exceeding source account balance with 400', async () => {
      const alice = await prisma.account.findUnique({ where: { id: aliceAccountId } });
      const { Prisma } = require('@prisma/client');
      const overAmount = new Prisma.Decimal(alice.balance.toString()).plus('999999.00').toFixed(2);

      const res = await request(app)
        .post('/api/transactions/transfer')
        .set('Authorization', `Bearer ${aliceToken}`)
        .set('Idempotency-Key', uuidv4())
        .send({ fromAccountId: aliceAccountId, toAccountId: bobAccountId, amount: overAmount });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Insufficient funds/i);
    });

    it('should not modify any balance when insufficient funds rejects', async () => {
      const alice = await prisma.account.findUnique({ where: { id: aliceAccountId } });
      const bob = await prisma.account.findUnique({ where: { id: bobAccountId } });
      const aliceBalanceBefore = alice.balance.toFixed(2);
      const bobBalanceBefore = bob.balance.toFixed(2);
      const { Prisma } = require('@prisma/client');
      const overAmount = new Prisma.Decimal(alice.balance.toString()).plus('999999.00').toFixed(2);

      await request(app)
        .post('/api/transactions/transfer')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', uuidv4())
        .send({ fromAccountId: aliceAccountId, toAccountId: bobAccountId, amount: overAmount });

      const aliceAfter = await prisma.account.findUnique({ where: { id: aliceAccountId } });
      const bobAfter = await prisma.account.findUnique({ where: { id: bobAccountId } });
      expect(aliceAfter.balance.toFixed(2)).toBe(aliceBalanceBefore);
      expect(bobAfter.balance.toFixed(2)).toBe(bobBalanceBefore);
    });
  });

  // =========================================================================
  // 6. Invalid Amount Validation
  // =========================================================================
  describe('Invalid Amount Validation', () => {
    it('should reject zero amount with 400', async () => {
      const res = await request(app)
        .post('/api/transactions/deposit')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', uuidv4())
        .send({ accountId: aliceAccountId, amount: '0' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/greater than zero/i);
    });

    it('should reject negative amount with 400', async () => {
      const res = await request(app)
        .post('/api/transactions/deposit')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', uuidv4())
        .send({ accountId: aliceAccountId, amount: '-50.00' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/greater than zero/i);
    });

    it('should reject non-numeric amount with 400', async () => {
      const res = await request(app)
        .post('/api/transactions/deposit')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', uuidv4())
        .send({ accountId: aliceAccountId, amount: 'one-hundred' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/valid number/i);
    });

    it('should reject missing amount with 400', async () => {
      const res = await request(app)
        .post('/api/transactions/deposit')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', uuidv4())
        .send({ accountId: aliceAccountId });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/amount is required/i);
    });

    it('should reject amount with more than 2 decimal places with 400', async () => {
      const res = await request(app)
        .post('/api/transactions/deposit')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', uuidv4())
        .send({ accountId: aliceAccountId, amount: '10.001' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/at most 2 decimal places/i);
    });

    it('should reject amount with deep decimal places e.g. 10.00000000001 with 400', async () => {
      const res = await request(app)
        .post('/api/transactions/deposit')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', uuidv4())
        .send({ accountId: aliceAccountId, amount: '10.00000000001' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/at most 2 decimal places/i);
    });

    it('should reject amount exceeding maximum DECIMAL(14,2) limit with 400', async () => {
      const res = await request(app)
        .post('/api/transactions/deposit')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', uuidv4())
        .send({ accountId: aliceAccountId, amount: '1000000000000.00' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/maximum allowed limit/i);
    });
  });

  // =========================================================================
  // 7. Self-Transfer Rejection
  // =========================================================================
  describe('Self-Transfer Rejection', () => {
    it('should reject transfer where fromAccountId equals toAccountId with 400', async () => {
      const res = await request(app)
        .post('/api/transactions/transfer')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', uuidv4())
        .send({ fromAccountId: aliceAccountId, toAccountId: aliceAccountId, amount: '10.00' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/source and destination accounts must be different/i);
    });
  });

  // =========================================================================
  // 8. Account Ownership & Role Restrictions
  // =========================================================================
  describe('Ownership & Role Restrictions', () => {
    it('should reject AUDITOR attempting a deposit with 403', async () => {
      const res = await request(app)
        .post('/api/transactions/deposit')
        .set('Authorization', `Bearer ${auditorToken}`)
        .set('Idempotency-Key', uuidv4())
        .send({ accountId: aliceAccountId, amount: '10.00' });

      expect(res.status).toBe(403);
    });

    it('should reject AUDITOR attempting a withdrawal with 403', async () => {
      const res = await request(app)
        .post('/api/transactions/withdraw')
        .set('Authorization', `Bearer ${auditorToken}`)
        .set('Idempotency-Key', uuidv4())
        .send({ accountId: aliceAccountId, amount: '10.00' });

      expect(res.status).toBe(403);
    });

    it('should reject AUDITOR attempting a transfer with 403', async () => {
      const res = await request(app)
        .post('/api/transactions/transfer')
        .set('Authorization', `Bearer ${auditorToken}`)
        .set('Idempotency-Key', uuidv4())
        .send({ fromAccountId: aliceAccountId, toAccountId: bobAccountId, amount: '10.00' });

      expect(res.status).toBe(403);
    });

    it('should reject ACCOUNT_HOLDER depositing into another user account with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/transactions/deposit')
        .set('Authorization', `Bearer ${aliceToken}`)
        .set('Idempotency-Key', uuidv4())
        .send({ accountId: bobAccountId, amount: '10.00' });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Forbidden|permission/i);
    });

    it('should reject ACCOUNT_HOLDER withdrawing from another user account with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/transactions/withdraw')
        .set('Authorization', `Bearer ${aliceToken}`)
        .set('Idempotency-Key', uuidv4())
        .send({ accountId: bobAccountId, amount: '10.00' });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Forbidden|permission/i);
    });

    it('should reject ACCOUNT_HOLDER transferring from another user account with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/transactions/transfer')
        .set('Authorization', `Bearer ${aliceToken}`)
        .set('Idempotency-Key', uuidv4())
        .send({ fromAccountId: bobAccountId, toAccountId: aliceAccountId, amount: '10.00' });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Forbidden|permission/i);
    });

    it('should reject unauthenticated request with 401', async () => {
      const res = await request(app)
        .post('/api/transactions/deposit')
        .set('Idempotency-Key', uuidv4())
        .send({ accountId: aliceAccountId, amount: '10.00' });

      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // 9. SYSTEM_CLEARING Account Access Restrictions
  // =========================================================================
  describe('SYSTEM_CLEARING Access Restrictions', () => {
    it('should reject transfer FROM a SYSTEM_CLEARING account with 400', async () => {
      const res = await request(app)
        .post('/api/transactions/transfer')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', uuidv4())
        .send({ fromAccountId: clearingAccountId, toAccountId: aliceAccountId, amount: '10.00' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/SYSTEM_CLEARING/i);
    });

    it('should reject transfer TO a SYSTEM_CLEARING account with 400', async () => {
      const res = await request(app)
        .post('/api/transactions/transfer')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', uuidv4())
        .send({ fromAccountId: aliceAccountId, toAccountId: clearingAccountId, amount: '10.00' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/SYSTEM_CLEARING/i);
    });

    it('should reject depositing directly to a SYSTEM_CLEARING account with 400', async () => {
      const res = await request(app)
        .post('/api/transactions/deposit')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', uuidv4())
        .send({ accountId: clearingAccountId, amount: '10.00' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/SYSTEM_CLEARING/i);
    });

    it('should reject withdrawing directly from a SYSTEM_CLEARING account with 400', async () => {
      const res = await request(app)
        .post('/api/transactions/withdraw')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', uuidv4())
        .send({ accountId: clearingAccountId, amount: '10.00' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/SYSTEM_CLEARING/i);
    });
  });

  // =========================================================================
  // 10. Idempotency
  // =========================================================================
  describe('Idempotency Key Enforcement', () => {
    it('should return the original result on duplicate deposit and not credit twice', async () => {
      const idempotencyKey = uuidv4();
      const before = await prisma.account.findUnique({ where: { id: aliceAccountId } });

      // First request — creates the deposit
      const res1 = await request(app)
        .post('/api/transactions/deposit')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({ accountId: aliceAccountId, amount: '77.00' });

      expect(res1.status).toBe(201);

      // Second request — same key, same payload
      const res2 = await request(app)
        .post('/api/transactions/deposit')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({ accountId: aliceAccountId, amount: '77.00' });

      expect(res2.status).toBe(200);
      expect(res2.body.idempotent).toBe(true);

      // Verify balance only increased by 77, not 154
      const after = await prisma.account.findUnique({ where: { id: aliceAccountId } });
      const { Prisma } = require('@prisma/client');
      const expectedBalance = new Prisma.Decimal(before.balance.toString()).plus('77.00').toFixed(2);
      expect(after.balance.toFixed(2)).toBe(expectedBalance);
    });

    it('should return idempotent result for duplicate withdrawal', async () => {
      const idempotencyKey = uuidv4();

      const res1 = await request(app)
        .post('/api/transactions/withdraw')
        .set('Authorization', `Bearer ${bobToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({ accountId: bobAccountId, amount: '5.00' });

      expect(res1.status).toBe(201);

      const bobMid = await prisma.account.findUnique({ where: { id: bobAccountId } });

      const res2 = await request(app)
        .post('/api/transactions/withdraw')
        .set('Authorization', `Bearer ${bobToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({ accountId: bobAccountId, amount: '5.00' });

      expect(res2.status).toBe(200);
      expect(res2.body.idempotent).toBe(true);

      // Balance must not have changed on the retry
      const bobAfter = await prisma.account.findUnique({ where: { id: bobAccountId } });
      expect(bobAfter.balance.toFixed(2)).toBe(bobMid.balance.toFixed(2));
    });

    it('should return idempotent result for duplicate transfer', async () => {
      const idempotencyKey = uuidv4();

      const res1 = await request(app)
        .post('/api/transactions/transfer')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({ fromAccountId: aliceAccountId, toAccountId: bobAccountId, amount: '3.00' });

      expect(res1.status).toBe(201);

      const aliceMid = await prisma.account.findUnique({ where: { id: aliceAccountId } });
      const bobMid = await prisma.account.findUnique({ where: { id: bobAccountId } });

      const res2 = await request(app)
        .post('/api/transactions/transfer')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({ fromAccountId: aliceAccountId, toAccountId: bobAccountId, amount: '3.00' });

      expect(res2.status).toBe(200);
      expect(res2.body.idempotent).toBe(true);

      const aliceAfter = await prisma.account.findUnique({ where: { id: aliceAccountId } });
      const bobAfter = await prisma.account.findUnique({ where: { id: bobAccountId } });
      expect(aliceAfter.balance.toFixed(2)).toBe(aliceMid.balance.toFixed(2));
      expect(bobAfter.balance.toFixed(2)).toBe(bobMid.balance.toFixed(2));
    });

    it('should reject reusing an idempotency key with a different payload (422)', async () => {
      const idempotencyKey = uuidv4();

      // First request
      await request(app)
        .post('/api/transactions/deposit')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({ accountId: aliceAccountId, amount: '10.00' });

      // Same key, different amount
      const res2 = await request(app)
        .post('/api/transactions/deposit')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({ accountId: aliceAccountId, amount: '999.00' });

      expect(res2.status).toBe(422);
      expect(res2.body.error).toMatch(/different request payload/i);
    });

    it('should safely handle concurrent duplicate requests with the exact same idempotency key', async () => {
      const sharedKey = uuidv4();
      const beforeAlice = await prisma.account.findUnique({ where: { id: aliceAccountId } });

      // Fire two requests simultaneously with identical key and payload
      const [res1, res2] = await Promise.all([
        request(app)
          .post('/api/transactions/deposit')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('Idempotency-Key', sharedKey)
          .send({ accountId: aliceAccountId, amount: '15.00' }),
        request(app)
          .post('/api/transactions/deposit')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('Idempotency-Key', sharedKey)
          .send({ accountId: aliceAccountId, amount: '15.00' }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      // Exactly one must be 201 Created; the other must be 409 Conflict (in-flight duplicate) or 200 OK (cached replay)
      expect(statuses).not.toEqual([201, 201]);
      expect(statuses.includes(201)).toBe(true);

      // Verify Alice was credited exactly once (+15.00), never twice
      const afterAlice = await prisma.account.findUnique({ where: { id: aliceAccountId } });
      const { Prisma } = require('@prisma/client');
      const expectedBalance = new Prisma.Decimal(beforeAlice.balance.toString()).plus('15.00').toFixed(2);
      expect(afterAlice.balance.toFixed(2)).toBe(expectedBalance);
    });
  });

  // =========================================================================
  // 11. Declined Transaction Audit Persistence
  // =========================================================================
  describe('Declined Transaction Audit Persistence', () => {
    it('should persist a DECLINED audit log entry after insufficient funds rejection', async () => {
      const { Prisma } = require('@prisma/client');
      const alice = await prisma.account.findUnique({ where: { id: aliceAccountId } });
      const overAmount = new Prisma.Decimal(alice.balance.toString()).plus('999999.00').toFixed(2);

      const before = new Date();

      await request(app)
        .post('/api/transactions/withdraw')
        .set('Authorization', `Bearer ${aliceToken}`)
        .set('Idempotency-Key', uuidv4())
        .send({ accountId: aliceAccountId, amount: overAmount });

      const auditEntry = await prisma.auditLog.findFirst({
        where: {
          userId: aliceUserId,
          action: 'WITHDRAWAL_DECLINED',
          status: 'DECLINED',
          timestamp: { gte: before },
        },
        orderBy: { timestamp: 'desc' },
      });

      expect(auditEntry).not.toBeNull();
      expect(auditEntry.reason).toMatch(/Insufficient funds/i);
    });

    it('should persist DECLINED audit for a failed transfer (insufficient funds)', async () => {
      const { Prisma } = require('@prisma/client');
      const alice = await prisma.account.findUnique({ where: { id: aliceAccountId } });
      const overAmount = new Prisma.Decimal(alice.balance.toString()).plus('999999.00').toFixed(2);

      const before = new Date();

      await request(app)
        .post('/api/transactions/transfer')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', uuidv4())
        .send({ fromAccountId: aliceAccountId, toAccountId: bobAccountId, amount: overAmount });

      const auditEntry = await prisma.auditLog.findFirst({
        where: {
          action: 'TRANSFER_DECLINED',
          status: 'DECLINED',
          timestamp: { gte: before },
        },
        orderBy: { timestamp: 'desc' },
      });

      expect(auditEntry).not.toBeNull();
      expect(auditEntry.reason).toMatch(/Insufficient funds/i);
    });

    it('should not create any ledger entries when a transaction fails', async () => {
      const { Prisma } = require('@prisma/client');
      const alice = await prisma.account.findUnique({ where: { id: aliceAccountId } });
      const overAmount = new Prisma.Decimal(alice.balance.toString()).plus('999999.00').toFixed(2);

      const entriesBefore = await prisma.ledgerEntry.count();

      await request(app)
        .post('/api/transactions/withdraw')
        .set('Authorization', `Bearer ${aliceToken}`)
        .set('Idempotency-Key', uuidv4())
        .send({ accountId: aliceAccountId, amount: overAmount });

      const entriesAfter = await prisma.ledgerEntry.count();
      expect(entriesAfter).toBe(entriesBefore);
    });
  });

  // =========================================================================
  // 12. Concurrency — Double-Spend Prevention
  // =========================================================================
  describe('Concurrency — Simultaneous Withdrawal Prevention', () => {
    it('should prevent double-spend: 2 concurrent over-limit withdrawals result in max 1 success', async () => {
      // Reset Bob to a known balance for this test
      await restoreBalance('ACC-BOB-001', '100.00');
      await prisma.account.update({
        where: { id: bobAccountId },
        data: { balance: '100.00' },
      });

      // Send two simultaneous requests each trying to withdraw 100.00
      // Only one should succeed; the other should get insufficient funds or similar error
      const [res1, res2] = await Promise.all([
        request(app)
          .post('/api/transactions/withdraw')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('Idempotency-Key', uuidv4()) // Different keys = different requests
          .send({ accountId: bobAccountId, amount: '100.00' }),
        request(app)
          .post('/api/transactions/withdraw')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('Idempotency-Key', uuidv4())
          .send({ accountId: bobAccountId, amount: '100.00' }),
      ]);

      const statuses = [res1.status, res2.status];
      // At least one must succeed (201) and at least one must fail (400 insufficient funds)
      // OR both could succeed if the first one runs before balance is deducted — but
      // row locking ensures only one succeeds at a time.
      const successCount = statuses.filter((s) => s === 201).length;
      const failCount = statuses.filter((s) => s === 400).length;

      // Exactly one success + one failure (or both fail if balance was already 0)
      expect(successCount + failCount).toBe(2);
      expect(successCount).toBeLessThanOrEqual(1);

      // Final balance must not be negative
      const bobFinal = await prisma.account.findUnique({ where: { id: bobAccountId } });
      const { Prisma } = require('@prisma/client');
      expect(new Prisma.Decimal(bobFinal.balance.toString()).greaterThanOrEqualTo('0')).toBe(true);
    });
  });

  // =========================================================================
  // 13. Rollback Integrity — No Partial Records
  // =========================================================================
  describe('Rollback Integrity', () => {
    it('should leave zero ledger entries and unchanged balance on failed deposit (bad accountId)', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000001';
      const entriesBefore = await prisma.ledgerEntry.count();

      const res = await request(app)
        .post('/api/transactions/deposit')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', uuidv4())
        .send({ accountId: fakeId, amount: '50.00' });

      expect(res.status).toBe(404);

      const entriesAfter = await prisma.ledgerEntry.count();
      expect(entriesAfter).toBe(entriesBefore);
    });

    it('should reject transfer when destination account does not exist with 404', async () => {
      const nonExistentDestinationId = '00000000-0000-0000-0000-000000000001';
      const res = await request(app)
        .post('/api/transactions/transfer')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', uuidv4())
        .send({
          fromAccountId: aliceAccountId,
          toAccountId: nonExistentDestinationId,
          amount: '10.00',
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/Destination account not found/i);
    });

    it('should successfully process transfer when Idempotency-Key header is omitted by generating key automatically', async () => {
      const res = await request(app)
        .post('/api/transactions/transfer')
        .set('Authorization', `Bearer ${adminToken}`)
        // Note: No Idempotency-Key header sent
        .send({
          fromAccountId: aliceAccountId,
          toAccountId: bobAccountId,
          amount: '5.00',
        });

      expect(res.status).toBe(201);
      expect(res.body.transaction.status).toBe('COMPLETED');
    });
  });
});
