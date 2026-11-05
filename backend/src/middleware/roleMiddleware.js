// Role-Based Access Control (RBAC) Middleware
// Enforces server-side permissions for ADMIN, ACCOUNT_HOLDER, and AUDITOR

/**
 * Higher-order middleware that restricts endpoint access to specified roles.
 * Must be mounted after authMiddleware.
 */
function requireRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({ error: 'Unauthorized: User authentication required.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Forbidden: Access denied. Role '${req.user.role}' is not authorized for this resource. Required: [${allowedRoles.join(', ')}]`,
      });
    }

    next();
  };
}

module.exports = {
  requireRoles,
  requireAdmin: requireRoles('ADMIN'),
  requireAuditorOrAdmin: requireRoles('AUDITOR', 'ADMIN'),
  requireAccountHolder: requireRoles('ACCOUNT_HOLDER'),
};
