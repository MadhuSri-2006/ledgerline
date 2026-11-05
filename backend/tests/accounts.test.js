const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/db');

jest.setTimeout(30000);

describe('Stage 5: Account Management & Balance Viewing Tests', () => {
  let adminToken;
  let aliceToken;
  let bobToken;
  let auditorToken;

  let aliceUserId;
  let bobUserId;
  let adminUserId;

  let aliceAccountId;
  let bobAccountId;
  let clearingAccountId;

  beforeAll(async () => {
    // 1. Obtain tokens by logging in with demo credentials
    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@ledgerline.internal', password: 'AdminPassword123!' });
    adminToken = adminLogin.body.token;

    const aliceLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@ledgerline.internal', password: 'AlicePassword123!' });
    aliceToken = aliceLogin.body.token;

    const bobLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'bob@ledgerline.internal', password: 'BobPassword123!' });
    bobToken = bobLogin.body.token;

    const auditorLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'auditor@ledgerline.internal', password: 'AuditorPassword123!' });
    auditorToken = auditorLogin.body.token;

    // 2. Fetch User IDs
    const aliceUser = await prisma.user.findUnique({ where: { email: 'alice@ledgerline.internal' } });
    aliceUserId = aliceUser.id;

    const bobUser = await prisma.user.findUnique({ where: { email: 'bob@ledgerline.internal' } });
    bobUserId = bobUser.id;

    const adminUser = await prisma.user.findUnique({ where: { email: 'admin@ledgerline.internal' } });
    adminUserId = adminUser.id;

    // 3. Fetch Seeded Account IDs
    const aliceAcc = await prisma.account.findUnique({ where: { accountNumber: 'ACC-ALICE-001' } });
    aliceAccountId = aliceAcc.id;

    const bobAcc = await prisma.account.findUnique({ where: { accountNumber: 'ACC-BOB-001' } });
    bobAccountId = bobAcc.id;

    const clearingAcc = await prisma.account.findUnique({ where: { accountNumber: 'SYS-CLEARING-001' } });
    clearingAccountId = clearingAcc.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // -------------------------------------------------------------
  // 1. Account Creation (Admin Only)
  // -------------------------------------------------------------
  describe('POST /api/accounts (Admin Account Provisioning)', () => {
    it('should allow ADMIN to create a customer account with strictly 0.00 initial balance', async () => {
      const res = await request(app)
        .post('/api/accounts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: bobUserId,
          currency: 'INR',
        });

      expect(res.status).toBe(201);
      expect(res.body.account).toHaveProperty('id');
      expect(res.body.account.type).toBe('STANDARD');
      expect(res.body.account.balance).toBe('0'); // Exact 0 Decimal
      expect(res.body.account.status).toBe('ACTIVE');
      expect(res.body.account.currency).toBe('INR');
      expect(res.body.account.user.email).toBe('bob@ledgerline.internal');
    });

    it('should forbid ACCOUNT_HOLDER from creating accounts with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/accounts')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ userId: aliceUserId });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Forbidden/i);
    });

    it('should forbid AUDITOR from creating accounts with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/accounts')
        .set('Authorization', `Bearer ${auditorToken}`)
        .send({ userId: bobUserId });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Forbidden/i);
    });

    it('should reject creating account for non-existent userId with 404', async () => {
      const res = await request(app)
        .post('/api/accounts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: '00000000-0000-0000-0000-000000000000' });

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/User not found/i);
    });

    it('should reject creating customer account for non-ACCOUNT_HOLDER users with 400', async () => {
      // Trying to create a customer account assigned to the ADMIN user
      const res = await request(app)
        .post('/api/accounts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: adminUserId });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Customer accounts can only be assigned to ACCOUNT_HOLDER/i);
    });
  });

  // -------------------------------------------------------------
  // 2. Listing Accounts with Role Filtering
  // -------------------------------------------------------------
  describe('GET /api/accounts (Listing & Role Scoping)', () => {
    it('should return ONLY own accounts when called by an ACCOUNT_HOLDER', async () => {
      const res = await request(app)
        .get('/api/accounts')
        .set('Authorization', `Bearer ${aliceToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.accounts)).toBe(true);
      // All accounts in list must belong strictly to Alice
      expect(res.body.accounts.every((a) => a.userId === aliceUserId)).toBe(true);
      // Alice must never see Bob's account or Clearing account in listing
      expect(res.body.accounts.some((a) => a.id === bobAccountId)).toBe(false);
      expect(res.body.accounts.some((a) => a.id === clearingAccountId)).toBe(false);
    });

    it('should return all accounts across the system when called by ADMIN', async () => {
      const res = await request(app)
        .get('/api/accounts')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.accounts.length).toBeGreaterThanOrEqual(3);
      expect(res.body.accounts.some((a) => a.id === aliceAccountId)).toBe(true);
      expect(res.body.accounts.some((a) => a.id === bobAccountId)).toBe(true);
      expect(res.body.accounts.some((a) => a.id === clearingAccountId)).toBe(true);
    });

    it('should return all accounts across the system when called by AUDITOR', async () => {
      const res = await request(app)
        .get('/api/accounts')
        .set('Authorization', `Bearer ${auditorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.accounts.length).toBeGreaterThanOrEqual(3);
      expect(res.body.accounts.some((a) => a.id === aliceAccountId)).toBe(true);
      expect(res.body.accounts.some((a) => a.id === bobAccountId)).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // 3. View Account Details & Ownership Protection
  // -------------------------------------------------------------
  describe('GET /api/accounts/:id (Details & BOLA Protection)', () => {
    it('should return account details for own account (Alice viewing Alice)', async () => {
      const res = await request(app)
        .get(`/api/accounts/${aliceAccountId}`)
        .set('Authorization', `Bearer ${aliceToken}`);

      expect(res.status).toBe(200);
      expect(res.body.account).toHaveProperty('accountNumber', 'ACC-ALICE-001');
      expect(res.body.account).toHaveProperty('type', 'STANDARD');
      expect(res.body.account).toHaveProperty('currency', 'INR');
      expect(res.body.account).toHaveProperty('status', 'ACTIVE');
      expect(res.body.account).toHaveProperty('balance');
      expect(parseFloat(res.body.account.balance)).toBe(1000.0);
    });

    it('should reject Account Holder viewing another user account with 403 Forbidden', async () => {
      // Alice attempts to access Bob's account
      const res = await request(app)
        .get(`/api/accounts/${bobAccountId}`)
        .set('Authorization', `Bearer ${aliceToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Forbidden/i);
    });

    it('should strictly prohibit Account Holder from accessing SYSTEM_CLEARING account with 403', async () => {
      const res = await request(app)
        .get(`/api/accounts/${clearingAccountId}`)
        .set('Authorization', `Bearer ${aliceToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/clearing account is prohibited/i);
    });

    it('should return 400 Bad Request for malformed UUID', async () => {
      const res = await request(app)
        .get('/api/accounts/not-a-valid-uuid')
        .set('Authorization', `Bearer ${aliceToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Invalid account ID format/i);
    });

    it('should return 404 Not Found for non-existent valid UUID', async () => {
      const res = await request(app)
        .get('/api/accounts/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/Account not found/i);
    });
  });

  // -------------------------------------------------------------
  // 4. Mathematical Balance Reconciliation
  // -------------------------------------------------------------
  describe('GET /api/accounts/:id/reconcile (Balance Reconciliation Engine)', () => {
    it('should confirm that seeded account balance matches ledger sum (isBalanced: true)', async () => {
      const res = await request(app)
        .get(`/api/accounts/${aliceAccountId}/reconcile`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.reconciliation).toHaveProperty('storedBalance', '1000.00');
      expect(res.body.reconciliation).toHaveProperty('reconciledBalance', '1000.00');
      expect(res.body.reconciliation).toHaveProperty('isBalanced', true);
      expect(res.body.reconciliation).toHaveProperty('discrepancy', '0.00');
    });

    it('should allow AUDITOR to run balance reconciliation', async () => {
      const res = await request(app)
        .get(`/api/accounts/${bobAccountId}/reconcile`)
        .set('Authorization', `Bearer ${auditorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.reconciliation.isBalanced).toBe(true);
    });

    it('should forbid ACCOUNT_HOLDER from running reconciliation endpoint with 403', async () => {
      const res = await request(app)
        .get(`/api/accounts/${aliceAccountId}/reconcile`)
        .set('Authorization', `Bearer ${aliceToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Forbidden/i);
    });

    it('should detect a deliberately mismatched balance and report isBalanced: false', async () => {
      // 1. Deliberately tamper with Alice's stored balance in database
      await prisma.account.update({
        where: { id: aliceAccountId },
        data: { balance: '9999.00' },
      });

      // 2. Query reconciliation endpoint
      const res = await request(app)
        .get(`/api/accounts/${aliceAccountId}/reconcile`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.reconciliation.storedBalance).toBe('9999.00');
      expect(res.body.reconciliation.reconciledBalance).toBe('1000.00');
      expect(res.body.reconciliation.isBalanced).toBe(false);
      expect(res.body.reconciliation.discrepancy).toBe('8999.00');

      // 3. Restore Alice's genuine balance back to 1000.00
      await prisma.account.update({
        where: { id: aliceAccountId },
        data: { balance: '1000.00' },
      });

      // 4. Verify it returns isBalanced: true again
      const restoredRes = await request(app)
        .get(`/api/accounts/${aliceAccountId}/reconcile`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(restoredRes.status).toBe(200);
      expect(restoredRes.body.reconciliation.isBalanced).toBe(true);
      expect(restoredRes.body.reconciliation.discrepancy).toBe('0.00');
    });
  });
});
