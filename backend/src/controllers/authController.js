// Authentication Controller
// Handles login, password verification, signed JWT issuance, and session lookup

const bcrypt = require('bcryptjs');
const prisma = require('../config/db');
const { signToken } = require('../utils/jwt');

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
      // Record failed login attempt in audit trail
      await prisma.auditLog.create({
        data: {
          action: 'LOGIN_FAILED',
          status: 'DECLINED',
          reason: `Failed login attempt for non-existent email: ${trimmedEmail}`,
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
  login,
  getMe,
};
