// Transaction Controller — Stage 6
// Thin HTTP layer translating ledgerService results to Express responses.
// Never performs financial logic here — all business rules live in ledgerService.js.

const { v4: uuidv4 } = require('uuid');
const ledgerService = require('../services/ledgerService');

// ---------------------------------------------------------------------------
// Idempotency key extraction helper
// ---------------------------------------------------------------------------
// Clients MUST supply an Idempotency-Key header for all money-movement requests.
// If absent, we generate one automatically (treats request as non-idempotent).
function extractIdempotencyKey(req) {
  const headerKey = req.headers['idempotency-key'];
  return (headerKey && headerKey.trim()) || uuidv4();
}

// ---------------------------------------------------------------------------
// POST /api/transactions/deposit
// ---------------------------------------------------------------------------
async function depositFunds(req, res) {
  try {
    const { accountId, amount, description } = req.body;
    const idempotencyKey = extractIdempotencyKey(req);

    const outcome = await ledgerService.deposit({
      accountId,
      amount,
      initiatedById: req.user.id,
      userRole: req.user.role,
      idempotencyKey,
      description,
    });

    if (outcome.idempotent) {
      return res.status(200).json({
        message: 'Duplicate request: returning cached result.',
        idempotent: true,
        transaction: outcome.cached,
      });
    }

    return res.status(201).json({
      message: 'Deposit completed successfully.',
      transaction: outcome.result,
    });
  } catch (err) {
    console.error('DepositFunds Error:', err.message || err);
    return res.status(err.statusCode || 500).json({
      error: err.message || 'Internal server error processing deposit.',
    });
  }
}

// ---------------------------------------------------------------------------
// POST /api/transactions/withdraw
// ---------------------------------------------------------------------------
async function withdrawFunds(req, res) {
  try {
    const { accountId, amount, description } = req.body;
    const idempotencyKey = extractIdempotencyKey(req);

    const outcome = await ledgerService.withdraw({
      accountId,
      amount,
      initiatedById: req.user.id,
      userRole: req.user.role,
      idempotencyKey,
      description,
    });

    if (outcome.idempotent) {
      return res.status(200).json({
        message: 'Duplicate request: returning cached result.',
        idempotent: true,
        transaction: outcome.cached,
      });
    }

    return res.status(201).json({
      message: 'Withdrawal completed successfully.',
      transaction: outcome.result,
    });
  } catch (err) {
    console.error('WithdrawFunds Error:', err.message || err);
    return res.status(err.statusCode || 500).json({
      error: err.message || 'Internal server error processing withdrawal.',
    });
  }
}

// ---------------------------------------------------------------------------
// POST /api/transactions/transfer
// ---------------------------------------------------------------------------
async function transferFunds(req, res) {
  try {
    const { fromAccountId, toAccountId, amount, description } = req.body;
    const idempotencyKey = extractIdempotencyKey(req);

    const outcome = await ledgerService.transfer({
      fromAccountId,
      toAccountId,
      amount,
      initiatedById: req.user.id,
      userRole: req.user.role,
      idempotencyKey,
      description,
    });

    if (outcome.idempotent) {
      return res.status(200).json({
        message: 'Duplicate request: returning cached result.',
        idempotent: true,
        transaction: outcome.cached,
      });
    }

    return res.status(201).json({
      message: 'Transfer completed successfully.',
      transaction: outcome.result,
    });
  } catch (err) {
    console.error('TransferFunds Error:', err.message || err);
    return res.status(err.statusCode || 500).json({
      error: err.message || 'Internal server error processing transfer.',
    });
  }
}

module.exports = { depositFunds, withdrawFunds, transferFunds };
