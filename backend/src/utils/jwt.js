// JWT Sign and Verify Utilities
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is missing.');
}

/**
 * Signs a JWT with minimal, non-sensitive public claims.
 * Never place passwords, password hashes, or bank secrets in payload.
 */
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    algorithm: 'HS256',
  });
}

/**
 * Cryptographically verifies token signature and expiration.
 * Throws an error if invalid, tampered, or expired.
 */
function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET, {
    algorithms: ['HS256'],
  });
}

module.exports = {
  signToken,
  verifyToken,
};
