// Authentication Middleware
// Validates cryptographic signature and expiration of Bearer JWT

const { verifyToken } = require('../utils/jwt');
const prisma = require('../config/db');

async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Authentication failed: Missing or malformed Authorization header. Expected Bearer <token>.',
      });
    }

    const token = authHeader.split(' ')[1];
    let decoded;

    try {
      decoded = verifyToken(token);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Authentication failed: Token has expired. Please log in again.' });
      }
      return res.status(401).json({ error: 'Authentication failed: Invalid token signature or format.' });
    }

    // Verify user still exists in database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
      },
    });

    if (!user) {
      return res.status(401).json({ error: 'Authentication failed: User no longer exists.' });
    }

    // Attach verified user claims to request object
    req.user = user;
    next();
  } catch (err) {
    console.error('Auth Middleware Error:', err);
    return res.status(500).json({ error: 'Internal server error during authentication.' });
  }
}

module.exports = authenticate;
