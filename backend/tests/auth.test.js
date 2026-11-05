const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const prisma = require('../src/config/db');

jest.setTimeout(30000);

describe('Stage 4: Authentication & Role-Based Authorization Tests', () => {
  let adminToken;
  let aliceToken;
  let bobToken;
  let auditorToken;
  let aliceAccountId;
  let bobAccountId;

  beforeAll(async () => {
    // 1. Obtain tokens by logging in with seeded credentials
    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@ledgerline.internal', password: 'AdminPassword123!' });
    expect(adminLogin.status).toBe(200);
    adminToken = adminLogin.body.token;

    const aliceLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@ledgerline.internal', password: 'AlicePassword123!' });
    expect(aliceLogin.status).toBe(200);
    aliceToken = aliceLogin.body.token;

    const bobLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'bob@ledgerline.internal', password: 'BobPassword123!' });
    expect(bobLogin.status).toBe(200);
    bobToken = bobLogin.body.token;

    const auditorLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'auditor@ledgerline.internal', password: 'AuditorPassword123!' });
    expect(auditorLogin.status).toBe(200);
    auditorToken = auditorLogin.body.token;

    // 2. Query seeded account IDs for ownership testing
    const aliceAccount = await prisma.account.findUnique({
      where: { accountNumber: 'ACC-ALICE-001' },
    });
    aliceAccountId = aliceAccount.id;

    const bobAccount = await prisma.account.findUnique({
      where: { accountNumber: 'ACC-BOB-001' },
    });
    bobAccountId = bobAccount.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // -------------------------------------------------------------
  // 1. Login & Password Verification Tests
  // -------------------------------------------------------------
  describe('POST /api/auth/login', () => {
    it('should authenticate valid credentials and return signed JWT without passwordHash', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'alice@ledgerline.internal', password: 'AlicePassword123!' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user).toHaveProperty('email', 'alice@ledgerline.internal');
      expect(res.body.user).toHaveProperty('role', 'ACCOUNT_HOLDER');
      expect(res.body.user.passwordHash).toBeUndefined(); // Security: passwordHash must never be exposed
    });

    it('should reject login with incorrect password with 401 Unauthorized', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'alice@ledgerline.internal', password: 'WrongPassword999!' });

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Invalid email or password/i);
    });

    it('should reject login for non-existent user with 401 Unauthorized', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nonexistent@ledgerline.internal', password: 'SomePassword123!' });

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Invalid email or password/i);
    });

    it('should reject login request missing password with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'alice@ledgerline.internal' });

      expect(res.status).toBe(400);
    });

    it('should sanitize failed login audit logs and never persist raw sensitive email inputs (CWE-532 fix)', async () => {
      const sensitivePasswordLikeInput = 'P@ssw0rdAccidentallyTypedInEmailField!';

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: sensitivePasswordLikeInput, password: 'SomePassword123!' });

      expect(res.status).toBe(401);

      // Verify that the sensitive string was NOT stored anywhere in the AuditLog record
      const auditLog = await prisma.auditLog.findFirst({
        where: { action: 'LOGIN_FAILED' },
        orderBy: { timestamp: 'desc' },
      });

      expect(auditLog).not.toBeNull();
      expect(auditLog.reason).toBe('Failed login attempt: Account does not exist.');
      expect(auditLog.reason).not.toContain(sensitivePasswordLikeInput);
      expect(JSON.stringify(auditLog.metadata || {})).not.toContain(sensitivePasswordLikeInput);
    });
  });

  // -------------------------------------------------------------
  // 2. Token Verification & Middleware Tests
  // -------------------------------------------------------------
  describe('GET /api/auth/me (Token Validation)', () => {
    it('should allow access with a valid signed JWT', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${aliceToken}`);

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe('alice@ledgerline.internal');
      expect(res.body.user.role).toBe('ACCOUNT_HOLDER');
    });

    it('should reject requests with missing Authorization header with 401', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Missing or malformed Authorization header/i);
    });

    it('should reject requests with tampered token signature with 401', async () => {
      const tamperedToken = aliceToken.slice(0, -6) + 'abcdef';
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${tamperedToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Invalid token/i);
    });

    it('should reject an expired token with 401', async () => {
      const expiredToken = jwt.sign(
        { userId: '00000000-0000-0000-0000-000000000000', role: 'ACCOUNT_HOLDER' },
        process.env.JWT_SECRET,
        { expiresIn: '-1s' }
      );

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/expired/i);
    });
  });

  // -------------------------------------------------------------
  // 3. Role-Based Access Control (RBAC) Tests
  // -------------------------------------------------------------
  describe('Role Authorization (/api/admin/users)', () => {
    it('should allow ADMIN to access admin endpoints', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.users)).toBe(true);
      expect(res.body.users.length).toBeGreaterThanOrEqual(4);
    });

    it('should forbid ACCOUNT_HOLDER from accessing admin endpoints with 403', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${aliceToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Forbidden/i);
    });

    it('should forbid AUDITOR from accessing admin management endpoints with 403', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${auditorToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Forbidden/i);
    });

    it('should allow ADMIN to create a new user', async () => {
      const testEmail = `testuser-${Date.now()}@ledgerline.internal`;
      const res = await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: testEmail,
          password: 'TestPassword123!',
          fullName: 'Test User',
          role: 'ACCOUNT_HOLDER',
        });

      expect(res.status).toBe(201);
      expect(res.body.user.email).toBe(testEmail);
      expect(res.body.user.role).toBe('ACCOUNT_HOLDER');
    });
  });

  // -------------------------------------------------------------
  // 4. Account Ownership (BOLA / IDOR Prevention) Tests
  // -------------------------------------------------------------
  describe('Account Ownership Restrictions (/api/accounts/:id)', () => {
    it('should allow an ACCOUNT_HOLDER to view their own account', async () => {
      const res = await request(app)
        .get(`/api/accounts/${aliceAccountId}`)
        .set('Authorization', `Bearer ${aliceToken}`);

      expect(res.status).toBe(200);
      expect(res.body.account.accountNumber).toBe('ACC-ALICE-001');
    });

    it('should forbid an ACCOUNT_HOLDER from viewing another user account with 403 Forbidden', async () => {
      // Alice attempts to access Bob's account
      const res = await request(app)
        .get(`/api/accounts/${bobAccountId}`)
        .set('Authorization', `Bearer ${aliceToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Forbidden/i);

      // Verify that this unauthorized attempt was persistently logged to AuditLog
      const auditEntry = await prisma.auditLog.findFirst({
        where: {
          accountId: bobAccountId,
          action: 'UNAUTHORIZED_ACCOUNT_ACCESS_ATTEMPT',
        },
        orderBy: { timestamp: 'desc' },
      });
      expect(auditEntry).not.toBeNull();
      expect(auditEntry.status).toBe('DECLINED');
    });

    it('should allow ADMIN to view any user account', async () => {
      const res = await request(app)
        .get(`/api/accounts/${aliceAccountId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.account.accountNumber).toBe('ACC-ALICE-001');
    });

    it('should allow AUDITOR to read any user account', async () => {
      const res = await request(app)
        .get(`/api/accounts/${aliceAccountId}`)
        .set('Authorization', `Bearer ${auditorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.account.accountNumber).toBe('ACC-ALICE-001');
    });

    it('should strictly forbid AUDITOR from performing mutating operations on accounts', async () => {
      // Auditor attempts a POST operation on Alice's account
      const res = await request(app)
        .post(`/api/accounts/${aliceAccountId}/test-write`)
        .set('Authorization', `Bearer ${auditorToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Auditors have read-only permissions/i);

      // Verify that the prohibited attempt was logged in AuditLog
      const auditEntry = await prisma.auditLog.findFirst({
        where: {
          accountId: aliceAccountId,
          action: 'AUDITOR_WRITE_PROHIBITED',
        },
        orderBy: { timestamp: 'desc' },
      });
      expect(auditEntry).not.toBeNull();
      expect(auditEntry.status).toBe('DECLINED');
    });
  });
});
