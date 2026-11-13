// Unit Tests: Public User Registration & Password Security (In-Memory Controller & Validation)
// Tests input validation, role escalation prevention, password hashing, and P2002 error handling.

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-for-testing-only-123456';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Mock Prisma client singleton
jest.mock('../../src/config/db', () => {
  return {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    account: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };
});

const prisma = require('../../src/config/db');
const { register } = require('../../src/controllers/authController');

function createMockReqRes(body = {}) {
  const req = {
    body,
    ip: '127.0.0.1',
    headers: { 'user-agent': 'Jest-Unit-Test' },
  };
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
  return { req, res };
}

describe('Unit Tests: Public User Registration Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Validation & Input Sanitization', () => {
    it('should reject registration when required fields are missing', async () => {
      const { req, res } = createMockReqRes({ email: 'test@example.com' });
      await register(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/required/i);
    });

    it('should reject registration with full name shorter than 2 characters', async () => {
      const { req, res } = createMockReqRes({
        fullName: 'A',
        email: 'test@example.com',
        password: 'Password123!',
      });
      await register(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/between 2 and 100 characters/i);
    });

    it('should reject registration with invalid email format', async () => {
      const { req, res } = createMockReqRes({
        fullName: 'Valid Name',
        email: 'not-an-email',
        password: 'Password123!',
      });
      await register(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/valid email/i);
    });

    it('should reject password shorter than 8 characters', async () => {
      const { req, res } = createMockReqRes({
        fullName: 'Valid Name',
        email: 'valid@example.com',
        password: 'Pass1',
      });
      await register(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/at least 8 characters/i);
    });

    it('should reject password without numbers', async () => {
      const { req, res } = createMockReqRes({
        fullName: 'Valid Name',
        email: 'valid@example.com',
        password: 'PasswordOnly',
      });
      await register(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/at least one letter and one number/i);
    });
  });

  describe('Duplicate Email & Concurrent Registration Handling', () => {
    it('should return 409 Conflict if user already exists', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'existing-uuid',
        email: 'duplicate@example.com',
      });

      const { req, res } = createMockReqRes({
        fullName: 'Duplicate User',
        email: 'duplicate@example.com',
        password: 'ValidPassword123',
      });
      await register(req, res);

      expect(res.statusCode).toBe(409);
      expect(res.body.error).toMatch(/already exists/i);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should handle concurrent registration race conditions via Prisma P2002 error code', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);

      const p2002Error = new Error('Unique constraint failed on the fields: (`email`)');
      p2002Error.code = 'P2002';
      prisma.$transaction.mockRejectedValueOnce(p2002Error);

      const { req, res } = createMockReqRes({
        fullName: 'Concurrent User',
        email: 'concurrent@example.com',
        password: 'ValidPassword123',
      });
      await register(req, res);

      expect(res.statusCode).toBe(409);
      expect(res.body.error).toMatch(/already exists/i);
    });
  });

  describe('Role Escalation Prevention & Atomic Provisioning', () => {
    it('should strictly assign ACCOUNT_HOLDER role even if request attempts ADMIN role escalation', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);

      const testUserId = 'c3d2f935-30b6-4fee-9869-be36156d98aa';
      let createdUserData = null;
      prisma.$transaction.mockImplementationOnce(async (txCallback) => {
        const mockTx = {
          user: {
            create: jest.fn().mockImplementation(({ data }) => {
              createdUserData = data;
              return Promise.resolve({
                id: testUserId,
                email: data.email,
                fullName: data.fullName,
                role: data.role,
                createdAt: new Date().toISOString(),
              });
            }),
            findUnique: jest.fn().mockResolvedValue({
              id: testUserId,
              email: 'attacker@example.com',
              role: 'ACCOUNT_HOLDER',
            }),
          },
          account: {
            findUnique: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({
              id: 'd4e3f846-41c7-4eff-8970-cf47267e09bb',
              accountNumber: 'ACC-123456-7890',
              currency: 'INR',
              balance: { toString: () => '0.00' },
              status: 'ACTIVE',
            }),
          },
          auditLog: {
            create: jest.fn().mockResolvedValue({ id: 'audit-log-uuid' }),
          },
        };
        return txCallback(mockTx);
      });

      const { req, res } = createMockReqRes({
        fullName: 'Attacker User',
        email: 'attacker@example.com',
        password: 'Password123!',
        role: 'ADMIN', // Hostile role escalation attempt
      });
      await register(req, res);

      expect(res.statusCode).toBe(201);
      expect(createdUserData).not.toBeNull();
      // Crucial security assertion: role must be forced to ACCOUNT_HOLDER
      expect(createdUserData.role).toBe('ACCOUNT_HOLDER');
      expect(res.body.user.role).toBe('ACCOUNT_HOLDER');
      // Password must be hashed with bcrypt, never plaintext
      expect(createdUserData.passwordHash).not.toBe('Password123!');
      const isMatch = await bcrypt.compare('Password123!', createdUserData.passwordHash);
      expect(isMatch).toBe(true);
      // Response must include valid signed JWT
      expect(res.body).toHaveProperty('token');
      const decoded = jwt.decode(res.body.token);
      expect(decoded.role).toBe('ACCOUNT_HOLDER');
      expect(decoded.email).toBe('attacker@example.com');
      // Primary account must be returned
      expect(res.body).toHaveProperty('account');
      expect(res.body.account.status).toBe('ACTIVE');
      expect(res.body.account.balance).toBe('0.00');
    });
  });
});
