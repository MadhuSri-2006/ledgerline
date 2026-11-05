// Account Ownership & Access Control Middleware
// Prevents Broken Object Level Authorization (BOLA / IDOR)

const prisma = require('../config/db');

/**
 * Middleware ensuring that an Account Holder can only access accounts they own.
 * Admins can access any account.
 * Auditors have read-only access (GET requests only).
 * 
 * @param {string} source - 'params' or 'body'
 * @param {string} fieldName - property name containing the accountId (default 'id' or 'accountId')
 */
function requireAccountOwnership(source = 'params', fieldName = 'id') {
  return async (req, res, next) => {
    try {
      const accountId = source === 'params' ? req.params[fieldName] : req.body[fieldName];

      if (!accountId) {
        return res.status(400).json({ error: `Bad Request: Missing account identifier in ${source}.${fieldName}` });
      }

      const account = await prisma.account.findUnique({
        where: { id: accountId },
        include: { user: true },
      });

      if (!account) {
        return res.status(404).json({ error: 'Account not found.' });
      }

      // 1. ADMIN has full administrative oversight
      if (req.user.role === 'ADMIN') {
        req.account = account;
        return next();
      }

      // 2. AUDITOR has strictly read-only access
      if (req.user.role === 'AUDITOR') {
        if (req.method !== 'GET') {
          // Record refused write attempt by Auditor
          await prisma.auditLog.create({
            data: {
              userId: req.user.id,
              accountId: account.id,
              action: 'AUDITOR_WRITE_PROHIBITED',
              status: 'DECLINED',
              reason: 'Auditors are strictly prohibited from performing write/money-movement operations.',
              runningBalance: account.balance,
            },
          });
          return res.status(403).json({
            error: 'Forbidden: Auditors have read-only permissions and cannot initiate modifications.',
          });
        }
        req.account = account;
        return next();
      }

      // 3. ACCOUNT_HOLDER can only access their own accounts
      if (req.user.role === 'ACCOUNT_HOLDER') {
        if (account.userId !== req.user.id) {
          // Record security refusal in AuditLog independently so it persists
          await prisma.auditLog.create({
            data: {
              userId: req.user.id,
              accountId: account.id,
              action: 'UNAUTHORIZED_ACCOUNT_ACCESS_ATTEMPT',
              status: 'DECLINED',
              reason: `User ${req.user.email} attempted unauthorized access on account owned by another user.`,
              runningBalance: account.balance,
            },
          });

          return res.status(403).json({
            error: 'Forbidden: You do not have permission to view or operate on this account.',
          });
        }

        req.account = account;
        return next();
      }

      return res.status(403).json({ error: 'Forbidden: Unauthorized role.' });
    } catch (err) {
      console.error('Ownership Middleware Error:', err);
      return res.status(500).json({ error: 'Internal server error verifying account ownership.' });
    }
  };
}

module.exports = {
  requireAccountOwnership,
};
