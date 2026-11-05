// Account Routes (Stage 5 Account Management & Balance Viewing)
const express = require('express');
const router = express.Router();

const accountController = require('../controllers/accountController');
const authenticate = require('../middleware/authMiddleware');
const { requireAdmin, requireAuditorOrAdmin } = require('../middleware/roleMiddleware');
const { requireAccountOwnership } = require('../middleware/ownershipMiddleware');

// Mount authentication on all account routes
router.use(authenticate);

// 1. List accounts:
// - ADMIN & AUDITOR see all accounts
// - ACCOUNT_HOLDER sees only their own accounts
router.get('/', accountController.listAccounts);

// 2. Admin creates a new customer account
router.post('/', requireAdmin, accountController.createAccount);

// 3. View a single account by ID (Enforces ownership / BOLA protection)
router.get('/:id', requireAccountOwnership('params', 'id'), accountController.getAccountById);

// 4. Mathematical balance reconciliation against ledger entries (Admin & Auditor)
router.get('/:id/reconcile', requireAuditorOrAdmin, requireAccountOwnership('params', 'id'), accountController.reconcileAccount);

// 5. Test-write endpoint to verify that Auditor cannot perform mutating operations
router.post('/:id/test-write', requireAccountOwnership('params', 'id'), (req, res) => {
  return res.status(200).json({
    message: 'Write permission granted for account.',
    accountId: req.account.id,
  });
});

module.exports = router;
