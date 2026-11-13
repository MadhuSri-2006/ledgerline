// Authentication Controller
// Handles registration, login, password verification, signed JWT issuance, and session lookup

const bcrypt = require('bcryptjs');
const prisma = require('../config/db');
const { signToken } = require('../utils/jwt');
const { createCustomerAccount } = require('../services/accountService');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function register(req, res) {
  try {
    const { email, password, fullName } = req.body;

    if (!email || !password || !fullName) {
      return res.status(400).json({ error: 'Validation failed: Full name, email, and password are required.' });
    }

    const trimmedFullName = typeof fullName === 'string' ? fullName.trim() : '';
    const trimmedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

    if (trimmedFullName.length < 2 || trimmedFullName.length > 100) {
      return res.status(400).json({ error: 'Validation failed: Full name must be between 2 and 100 characters.' });
    }

    if (!EMAIL_REGEX.test(trimmedEmail)) {
      return res.status(400).json({ error: 'Validation failed: Please enter a valid email address.' });
    }

    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Validation failed: Password must be at least 8 characters long.' });
    }

    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    if (!hasLetter || !hasNumber) {
      return res.status(400).json({ error: 'Validation failed: Password must contain at least one letter and one number.' });
    }

    // Check for duplicate email (fast fail)
    const existing = await prisma.user.findUnique({
      where: { email: trimmedEmail },
    });

    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Atomic creation of User and initial primary Account
    // Role is strictly hardcoded to ACCOUNT_HOLDER (never accept role from req.body)
    const result = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: trimmedEmail,
          passwordHash,
          fullName: trimmedFullName,
          role: 'ACCOUNT_HOLDER',
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          createdAt: true,
        },
      });

      const account = await createCustomerAccount(
        { userId: newUser.id, currency: 'INR' },
        tx
      );

      await tx.auditLog.create({
        data: {
          userId: newUser.id,
          accountId: account.id,
          action: 'USER_REGISTERED',
          status: 'SUCCESS',
          reason: `Public registration completed for ${newUser.email}`,
          metadata: { ip: req.ip, userAgent: req.headers['user-agent'] },
        },
      });

      return { user: newUser, account };
    });

    const token = signToken({
      userId: result.user.id,
      email: result.user.email,
      role: result.user.role,
    });

    return res.status(201).json({
      message: 'Registration successful.',
      token,
      user: result.user,
      account: {
        id: result.account.id,
        accountNumber: result.account.accountNumber,
        currency: result.account.currency,
        balance: result.account.balance ? result.account.balance.toString() : '0.00',
        status: result.account.status,
      },
    });
  } catch (err) {
    if (err.code === 'P2002' || (err.meta && err.meta.target && err.meta.target.includes('email'))) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }

    console.error('Register Controller Error:', err);
    return res.status(500).json({ error: 'Internal server error during registration.' });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Validation failed: Email and password are required.' });
    }

    const trimmedEmail = email.trim().toLowerCase();

    // Look up user by unique email
    const user = await prisma.user.findUnique({
      where: { email: trimmedEmail },
    });

    if (!user) {
      // Record failed login attempt in audit trail (sanitize reason to prevent CWE-532 password leaks)
      await prisma.auditLog.create({
        data: {
          action: 'LOGIN_FAILED',
          status: 'DECLINED',
          reason: 'Failed login attempt: Account does not exist.',
          metadata: { ip: req.ip, userAgent: req.headers['user-agent'] },
        },
      });

      // Generic error message to prevent user enumeration
      return res.status(401).json({ error: 'Authentication failed: Invalid email or password.' });
    }

    // Cryptographically verify password against bcrypt hash
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      // Record failed password attempt
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'LOGIN_FAILED',
          status: 'DECLINED',
          reason: 'Invalid password provided.',
          metadata: { ip: req.ip, userAgent: req.headers['user-agent'] },
        },
      });

      return res.status(401).json({ error: 'Authentication failed: Invalid email or password.' });
    }

    // Issue signed JWT with minimal public claims
    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    // Record successful login in audit trail
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'LOGIN_SUCCESS',
        status: 'SUCCESS',
        reason: 'User authenticated successfully.',
        metadata: { ip: req.ip, userAgent: req.headers['user-agent'] },
      },
    });

    // Return signed JWT and sanitized user profile (passwordHash strictly omitted)
    return res.status(200).json({
      message: 'Login successful.',
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('Login Controller Error:', err);
    return res.status(500).json({ error: 'Internal server error during login.' });
  }
}

async function getMe(req, res) {
  try {
    // req.user is attached by authMiddleware
    return res.status(200).json({
      user: {
        id: req.user.id,
        email: req.user.email,
        fullName: req.user.fullName,
        role: req.user.role,
      },
    });
  } catch (err) {
    console.error('GetMe Error:', err);
    return res.status(500).json({ error: 'Internal server error retrieving user profile.' });
  }
}

module.exports = {
  register,
  login,
  getMe,
};
