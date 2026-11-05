// Account Routes (Stage 4 Ownership & Role Verification)
// Note: Full balance view, statements, and money movement will be implemented in Stages 5 & 6.

const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authMiddleware');
const { requireAccountOwnership } = require('../middleware/ownershipMiddleware');

// Mount authentication on all account routes
router.use(authenticate);

// View account by ID (Enforces ownership: Account Holder can only view own; Auditor has read-only; Admin has full access)
router.get('/:id', requireAccountOwnership('params', 'id'), (req, res) => {
  return res.status(200).json({
    account: {
      id: req.account.id,
      accountNumber: req.account.accountNumber,
      type: req.account.type,
      balance: req.account.balance,
      currency: req.account.currency,
      status: req.account.status,
      owner: req.account.user
        ? {
            id: req.account.user.id,
            email: req.account.user.email,
            fullName: req.account.user.fullName,
          }
        : null,
    },
  });
});

// Guarded test-write endpoint to verify that Auditor cannot perform mutating actions
router.post('/:id/test-write', requireAccountOwnership('params', 'id'), (req, res) => {
  return res.status(200).json({
    message: 'Write permission granted for account.',
    accountId: req.account.id,
  });
});

module.exports = router;
