import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  listAccounts,
  deposit,
  withdraw,
  transfer,
  newIdempotencyKey
} from '../services/api';
import {
  Alert,
  Badge,
  Spinner,
  LoadingCenter,
  EmptyState,
  ConfirmDialog,
  formatAmount,
  formatDate,
  Tabs
} from '../components/ui';

export default function AccountHolderDashboard() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [lastTxResult, setLastTxResult] = useState(null);
  const [recentTransactions, setRecentTransactions] = useState([]);

  // Active transaction tab: 'transfer' | 'deposit' | 'withdraw'
  const [activeTab, setActiveTab] = useState('transfer');

  // Form states
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [targetAccountId, setTargetAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Confirmation dialog state
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    type: null,
    title: '',
    message: '',
    payload: null,
  });

  // Track whether the initial account selection has been done
  const initialised = useRef(false);

  // Fetch accounts — no selectedAccountId dependency to avoid re-fetch loops
  const loadAccounts = useCallback(async () => {
    try {
      setError(null);
      const data = await listAccounts();
      const accList = data.accounts || [];
      setAccounts(accList);
      // Only set default selection on the very first load
      if (!initialised.current && accList.length > 0) {
        setSelectedAccountId(accList[0].id);
        initialised.current = true;
      }
    } catch (err) {
      setError(err.message || 'Failed to load accounts.');
    } finally {
      setLoading(false);
    }
  }, []); // stable — no deps

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  // Selected account object
  const currentAccount = accounts.find((a) => a.id === selectedAccountId) || accounts[0];

  // Total balance calculation (display only — presentational addition of display values)
  const totalBalance = accounts.reduce((sum, a) => {
    return sum + (parseFloat(a.balance) || 0);
  }, 0);

  // Validate amount format
  const validateAmount = (val) => {
    if (!val) return 'Amount is required.';
    const num = parseFloat(val);
    if (isNaN(num) || num <= 0) return 'Amount must be greater than zero.';
    const parts = val.split('.');
    if (parts.length > 1 && parts[1].length > 2) {
      return 'Amount cannot have more than 2 decimal places.';
    }
    return null;
  };

  // Trigger Confirmation Modal for Transfer
  const handleInitiateTransfer = (e) => {
    e.preventDefault();
    const amountErr = validateAmount(amount);
    if (amountErr) { setError(amountErr); return; }
    if (!selectedAccountId) { setError('Please select a source account.'); return; }
    if (!targetAccountId || !targetAccountId.trim()) {
      setError('Please enter the destination account UUID.');
      return;
    }
    if (selectedAccountId === targetAccountId.trim()) {
      setError('Source and destination accounts must be different.');
      return;
    }

    const sourceBal = parseFloat(currentAccount?.balance || '0');
    const reqAmount = parseFloat(amount);
    if (reqAmount > sourceBal) {
      setError(`Insufficient funds. Available balance: ${formatAmount(currentAccount?.balance, currentAccount?.currency)}.`);
      return;
    }

    setError(null);
    setConfirmModal({
      isOpen: true,
      type: 'TRANSFER',
      title: 'Confirm Internal Transfer',
      message: `Transfer ${formatAmount(amount, currentAccount?.currency)} from ${currentAccount?.accountNumber}? This amount will be debited immediately and credited to the destination account.`,
      payload: {
        fromAccountId: selectedAccountId,
        toAccountId: targetAccountId.trim(),
        amount: parseFloat(amount).toFixed(2),
        description: description.trim() || undefined,
      },
    });
  };

  // Trigger Confirmation Modal for Deposit
  const handleInitiateDeposit = (e) => {
    e.preventDefault();
    const amountErr = validateAmount(amount);
    if (amountErr) { setError(amountErr); return; }
    if (!selectedAccountId) { setError('Please select an account.'); return; }

    setError(null);
    setConfirmModal({
      isOpen: true,
      type: 'DEPOSIT',
      title: 'Confirm External Deposit',
      message: `Deposit ${formatAmount(amount, currentAccount?.currency)} into ${currentAccount?.accountNumber}? Funds will be credited immediately through the clearing settlement.`,
      payload: {
        accountId: selectedAccountId,
        amount: parseFloat(amount).toFixed(2),
        description: description.trim() || undefined,
      },
    });
  };

  // Trigger Confirmation Modal for Withdrawal
  const handleInitiateWithdraw = (e) => {
    e.preventDefault();
    const amountErr = validateAmount(amount);
    if (amountErr) { setError(amountErr); return; }
    if (!selectedAccountId) { setError('Please select an account.'); return; }

    const sourceBal = parseFloat(currentAccount?.balance || '0');
    const reqAmount = parseFloat(amount);
    if (reqAmount > sourceBal) {
      setError(`Insufficient funds. Available balance: ${formatAmount(currentAccount?.balance, currentAccount?.currency)}.`);
      return;
    }

    setError(null);
    setConfirmModal({
      isOpen: true,
      type: 'WITHDRAWAL',
      title: 'Confirm Withdrawal',
      message: `Withdraw ${formatAmount(amount, currentAccount?.currency)} from ${currentAccount?.accountNumber}? New balance: ${formatAmount(sourceBal - reqAmount, currentAccount?.currency)}.`,
      payload: {
        accountId: selectedAccountId,
        amount: parseFloat(amount).toFixed(2),
        description: description.trim() || undefined,
      },
    });
  };

  // Execute financial transaction with Idempotency Key
  const handleConfirmTransaction = async () => {
    const { type, payload } = confirmModal;
    setConfirmModal({ isOpen: false, type: null, title: '', message: '', payload: null });
    setSubmitting(true);
    setError(null);
    setSuccessMessage(null);
    setLastTxResult(null);

    const idempotencyKey = newIdempotencyKey();

    try {
      let res;
      if (type === 'TRANSFER') {
        res = await transfer(payload, idempotencyKey);
      } else if (type === 'DEPOSIT') {
        res = await deposit(payload, idempotencyKey);
      } else if (type === 'WITHDRAWAL') {
        res = await withdraw(payload, idempotencyKey);
      }

      const tx = res.transaction;
      setLastTxResult(tx);
      setSuccessMessage(res.message || 'Transaction processed successfully.');

      // Prepend to local session transaction history
      setRecentTransactions((prev) => [
        {
          id: tx.transactionId || idempotencyKey,
          reference: tx.reference,
          type: tx.type,
          amount: tx.amount,
          currency: tx.currency,
          balanceAfter: tx.balanceAfter || tx.fromBalanceAfter,
          date: tx.createdAt || new Date().toISOString(),
          status: tx.status,
        },
        ...prev,
      ]);

      // Clear input fields
      setAmount('');
      setDescription('');
      setTargetAccountId('');

      // Refresh account balances from server
      await loadAccounts();
    } catch (err) {
      setError(err.message || 'Transaction failed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: '1100px', margin: '40px auto', padding: '0 20px' }}>
        <LoadingCenter />
      </div>
    );
  }

  const tabs = [
    { id: 'transfer', label: '⇄ Transfer' },
    { id: 'deposit', label: '↓ Deposit' },
    { id: 'withdraw', label: '↑ Withdraw' },
  ];

  return (
    <div style={{ maxWidth: '1100px', margin: '32px auto', padding: '0 20px' }}>
      {/* Welcome Banner */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        marginBottom: '28px'
      }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--gray-900)' }}>
            Welcome back, {user?.fullName || 'Account Holder'}
          </h1>
          <p style={{ color: 'var(--gray-500)', fontSize: '14px', marginTop: '4px' }}>
            Manage your accounts and execute secure double-entry transfers.
          </p>
        </div>
        <div style={{
          backgroundColor: '#ffffff',
          padding: '12px 20px',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--gray-200)',
          boxShadow: 'var(--shadow-sm)',
          textAlign: 'right'
        }}>
          <span style={{ fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', color: 'var(--gray-500)', letterSpacing: '0.05em' }}>
            Combined Balance
          </span>
          <div style={{ fontSize: '22px', fontWeight: '700', color: 'var(--primary)', fontFamily: 'var(--font-mono)' }}>
            {formatAmount(totalBalance.toFixed(2), accounts[0]?.currency || 'INR')}
          </div>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div style={{ marginBottom: '20px' }}>
          <Alert type="error" onClose={() => setError(null)}>{error}</Alert>
        </div>
      )}

      {successMessage && (
        <div style={{ marginBottom: '20px' }}>
          <Alert type="success" onClose={() => setSuccessMessage(null)}>
            <strong>{successMessage}</strong>
            {lastTxResult && (
              <div style={{ marginTop: '4px', fontSize: '13px' }}>
                Ref: <code style={{ fontFamily: 'var(--font-mono)' }}>{lastTxResult.reference}</code>
                {' · '} Amount: <strong>{formatAmount(lastTxResult.amount, lastTxResult.currency)}</strong>
                {(lastTxResult.balanceAfter || lastTxResult.fromBalanceAfter) && (
                  <>{' · '} New Balance: <strong>{formatAmount(lastTxResult.balanceAfter || lastTxResult.fromBalanceAfter, lastTxResult.currency)}</strong></>
                )}
              </div>
            )}
          </Alert>
        </div>
      )}

      {/* Two-column layout */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '24px',
        alignItems: 'start'
      }}>
        {/* Left: Accounts List */}
        <div>
          <div className="card">
            <div className="card-header">
              <h2>My Accounts</h2>
              <Badge type="teal">{accounts.length} Linked</Badge>
            </div>
            <div className="card-body" style={{ padding: '16px' }}>
              {accounts.length === 0 ? (
                <EmptyState icon="🏦" text="No accounts found. Contact your administrator." />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {accounts.map((acc) => {
                    const isSelected = acc.id === selectedAccountId;
                    return (
                      <div
                        key={acc.id}
                        onClick={() => setSelectedAccountId(acc.id)}
                        style={{
                          padding: '16px',
                          borderRadius: 'var(--radius)',
                          border: `2px solid ${isSelected ? 'var(--primary)' : 'var(--gray-200)'}`,
                          backgroundColor: isSelected ? 'var(--primary-light)' : '#ffffff',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: '700', fontSize: '15px', color: 'var(--gray-900)' }}>
                              {acc.accountNumber}
                            </span>
                            <Badge type={acc.status === 'ACTIVE' ? 'green' : 'gray'}>{acc.status}</Badge>
                          </div>
                          {/* Show Account ID for use in transfers */}
                          <span
                            title="Account UUID — copy this to send transfers to this account"
                            style={{ fontSize: '11px', color: 'var(--gray-400)', fontFamily: 'var(--font-mono)', display: 'block', marginTop: '4px' }}
                          >
                            {acc.id}
                          </span>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '8px' }}>
                          <span style={{ fontSize: '17px', fontWeight: '700', color: 'var(--gray-900)', fontFamily: 'var(--font-mono)' }}>
                            {formatAmount(acc.balance, acc.currency)}
                          </span>
                          <span style={{ display: 'block', fontSize: '11px', color: 'var(--gray-500)' }}>
                            {acc.currency} · {acc.type}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="card-footer" style={{ fontSize: '12px', color: 'var(--gray-500)' }}>
              🔒 Balances enforced by PostgreSQL double-entry with zero overdraft tolerance.
            </div>
          </div>
        </div>

        {/* Right: Transaction Forms */}
        <div>
          <div className="card">
            <div className="card-header">
              <h2>Execute Transaction</h2>
            </div>
            <div className="card-body">
              <Tabs tabs={tabs} active={activeTab} onChange={(t) => { setActiveTab(t); setError(null); setAmount(''); setDescription(''); setTargetAccountId(''); }} />

              {/* TRANSFER FORM */}
              {activeTab === 'transfer' && (
                <form onSubmit={handleInitiateTransfer}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="tx-from-acc">
                      Source Account <span className="required">*</span>
                    </label>
                    <select
                      id="tx-from-acc"
                      className="form-input form-select"
                      value={selectedAccountId}
                      onChange={(e) => setSelectedAccountId(e.target.value)}
                      required
                    >
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.accountNumber} — {formatAmount(acc.balance, acc.currency)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="tx-to-acc">
                      Destination Account UUID <span className="required">*</span>
                    </label>
                    <input
                      id="tx-to-acc"
                      type="text"
                      className="form-input"
                      placeholder="Paste destination account UUID here"
                      value={targetAccountId}
                      onChange={(e) => setTargetAccountId(e.target.value)}
                      required
                      pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
                      title="Must be a valid UUID (e.g. 4eb96075-6828-4673-c40d-3d074077bfb7)"
                    />
                    <p className="form-hint">
                      Copy the destination account's UUID from the account card above. Self-transfers are rejected.
                    </p>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="tx-amount-transfer">
                      Amount ({currentAccount?.currency || 'INR'}) <span className="required">*</span>
                    </label>
                    <input
                      id="tx-amount-transfer"
                      type="number"
                      step="0.01"
                      min="0.01"
                      className="form-input"
                      placeholder="0.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="tx-desc-transfer">Description (Optional)</label>
                    <input
                      id="tx-desc-transfer"
                      type="text"
                      className="form-input"
                      placeholder="e.g. Split bills, rent payment"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary btn-full btn-lg"
                    disabled={submitting || accounts.length === 0}
                    style={{ marginTop: '8px' }}
                  >
                    {submitting ? <Spinner /> : 'Review & Transfer'}
                  </button>
                </form>
              )}

              {/* DEPOSIT FORM */}
              {activeTab === 'deposit' && (
                <form onSubmit={handleInitiateDeposit}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="tx-deposit-acc">
                      Deposit Into Account <span className="required">*</span>
                    </label>
                    <select
                      id="tx-deposit-acc"
                      className="form-input form-select"
                      value={selectedAccountId}
                      onChange={(e) => setSelectedAccountId(e.target.value)}
                      required
                    >
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.accountNumber} — Current: {formatAmount(acc.balance, acc.currency)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="tx-deposit-amount">
                      Deposit Amount ({currentAccount?.currency || 'INR'}) <span className="required">*</span>
                    </label>
                    <input
                      id="tx-deposit-amount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      className="form-input"
                      placeholder="0.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      required
                    />
                    <p className="form-hint">Funds drawn from the banking settlement clearing account.</p>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="tx-deposit-desc">Memo (Optional)</label>
                    <input
                      id="tx-deposit-desc"
                      type="text"
                      className="form-input"
                      placeholder="e.g. Salary credit"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary btn-full btn-lg"
                    disabled={submitting || accounts.length === 0}
                    style={{ marginTop: '8px' }}
                  >
                    {submitting ? <Spinner /> : 'Review & Deposit'}
                  </button>
                </form>
              )}

              {/* WITHDRAWAL FORM */}
              {activeTab === 'withdraw' && (
                <form onSubmit={handleInitiateWithdraw}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="tx-withdraw-acc">
                      Withdraw From Account <span className="required">*</span>
                    </label>
                    <select
                      id="tx-withdraw-acc"
                      className="form-input form-select"
                      value={selectedAccountId}
                      onChange={(e) => setSelectedAccountId(e.target.value)}
                      required
                    >
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.accountNumber} — Available: {formatAmount(acc.balance, acc.currency)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="tx-withdraw-amount">
                      Withdrawal Amount ({currentAccount?.currency || 'INR'}) <span className="required">*</span>
                    </label>
                    <input
                      id="tx-withdraw-amount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      className="form-input"
                      placeholder="0.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      required
                    />
                    <p className="form-hint">Overdrafts are atomically rejected. Max: {formatAmount(currentAccount?.balance, currentAccount?.currency)}.</p>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="tx-withdraw-desc">Memo (Optional)</label>
                    <input
                      id="tx-withdraw-desc"
                      type="text"
                      className="form-input"
                      placeholder="e.g. ATM withdrawal"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary btn-full btn-lg"
                    disabled={submitting || accounts.length === 0}
                    style={{ marginTop: '8px' }}
                  >
                    {submitting ? <Spinner /> : 'Review & Withdraw'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Session Transaction Statement */}
      <div className="card" style={{ marginTop: '32px' }}>
        <div className="card-header">
          <h2>Session Transaction Statement</h2>
          <Badge type="blue">ACID Confirmed</Badge>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {recentTransactions.length === 0 ? (
            <div style={{ padding: '32px' }}>
              <EmptyState icon="🧾" text="No transactions this session. Use the forms above to get started." />
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Balance After</th>
                    <th>Date & Time</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTransactions.map((tx) => (
                    <tr key={tx.id}>
                      <td><code style={{ fontFamily: 'var(--font-mono)', fontSize: '13px' }}>{tx.reference}</code></td>
                      <td>
                        <Badge type={tx.type === 'DEPOSIT' ? 'green' : tx.type === 'WITHDRAWAL' ? 'yellow' : 'blue'}>
                          {tx.type}
                        </Badge>
                      </td>
                      <td style={{ fontWeight: '600', fontFamily: 'var(--font-mono)' }}>
                        {formatAmount(tx.amount, tx.currency)}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>
                        {tx.balanceAfter ? formatAmount(tx.balanceAfter, tx.currency) : '—'}
                      </td>
                      <td style={{ fontSize: '13px', color: 'var(--gray-500)' }}>{formatDate(tx.date)}</td>
                      <td><Badge type="green">{tx.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmModal.isOpen && (
        <ConfirmDialog
          title={confirmModal.title}
          message={confirmModal.message}
          onConfirm={handleConfirmTransaction}
          onCancel={() => setConfirmModal({ isOpen: false, type: null, title: '', message: '', payload: null })}
          confirmLabel="Authorize & Execute"
        />
      )}
    </div>
  );
}
