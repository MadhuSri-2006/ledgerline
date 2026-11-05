// Account Controller
// Route handlers for account creation, balance inspection, and reconciliation

const accountService = require('../services/accountService');

async function listAccounts(req, res) {
  try {
    const accounts = await accountService.getAccountsForUser(req.user);
    return res.status(200).json({ accounts });
  } catch (err) {
    console.error('ListAccounts Error:', err);
    return res.status(err.statusCode || 500).json({ error: err.message || 'Internal server error listing accounts.' });
  }
}

async function getAccountById(req, res) {
  try {
    // req.account is populated and authorized by ownershipMiddleware
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
        createdAt: req.account.createdAt,
      },
    });
  } catch (err) {
    console.error('GetAccountById Error:', err);
    return res.status(500).json({ error: 'Internal server error retrieving account details.' });
  }
}

async function createAccount(req, res) {
  try {
    const { userId, accountNumber, currency } = req.body;

    const account = await accountService.createCustomerAccount({
      userId,
      accountNumber,
      currency,
      adminUserId: req.user.id,
    });

    return res.status(201).json({
      message: 'Account created successfully.',
      account,
    });
  } catch (err) {
    console.error('CreateAccount Error:', err);
    return res.status(err.statusCode || 500).json({ error: err.message || 'Internal server error creating account.' });
  }
}

async function reconcileAccount(req, res) {
  try {
    const report = await accountService.reconcileAccountBalance(req.params.id);
    return res.status(200).json({ reconciliation: report });
  } catch (err) {
    console.error('ReconcileAccount Error:', err);
    return res.status(err.statusCode || 500).json({ error: err.message || 'Internal server error during reconciliation.' });
  }
}

module.exports = {
  listAccounts,
  getAccountById,
  createAccount,
  reconcileAccount,
};
