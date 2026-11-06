// Transaction Routes — Stage 6
// Routes for deposit, withdrawal, and internal transfer operations.
//
// Role rules enforced here:
//   ADMIN          — can initiate any transaction (for operational purposes)
//   ACCOUNT_HOLDER — can transact ONLY on accounts they own (enforced in service via DB ownership check)
//   AUDITOR        — read-only; all transaction creation is blocked with 403

const express = require('express');
const router = express.Router();

const transactionController = require('../controllers/transactionController');
const authenticate = require('../middleware/authMiddleware');
const { requireRoles } = require('../middleware/roleMiddleware');

// All transaction routes require authentication
router.use(authenticate);

// Auditors cannot initiate any financial operations
const requireTransactor = requireRoles('ADMIN', 'ACCOUNT_HOLDER');

// POST /api/transactions/deposit
router.post('/deposit', requireTransactor, transactionController.depositFunds);

// POST /api/transactions/withdraw
router.post('/withdraw', requireTransactor, transactionController.withdrawFunds);

// POST /api/transactions/transfer
router.post('/transfer', requireTransactor, transactionController.transferFunds);

module.exports = router;
