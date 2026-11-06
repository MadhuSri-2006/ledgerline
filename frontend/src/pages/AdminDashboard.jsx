import React, { useState, useEffect, useCallback } from 'react';
import {
  listUsers,
  createUser,
  listAccounts,
  createAccount,
  reconcileAccount,
  deposit,
  transfer,
  newIdempotencyKey
} from '../services/api';
import {
  Alert,
  Badge,
  Spinner,
  LoadingCenter,
  EmptyState,
  Modal,
  ConfirmDialog,
  formatAmount,
  formatDate,
  Tabs
} from '../components/ui';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('accounts');
  const [users, setUsers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Modal states
  const [createUserModalOpen, setCreateUserModalOpen] = useState(false);
  const [createAccountModalOpen, setCreateAccountModalOpen] = useState(false);
  const [reconciliationModalOpen, setReconciliationModalOpen] = useState(false);
  const [reconciliationData, setReconciliationData] = useState(null);
  const [reconcilingAccountId, setReconcilingAccountId] = useState(null);

  // Form states - Create User
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserFullName, setNewUserFullName] = useState('');
  const [newUserRole, setNewUserRole] = useState('ACCOUNT_HOLDER');
  const [submittingUser, setSubmittingUser] = useState(false);

  // Form states - Create Account
  const [newAccUserId, setNewAccUserId] = useState('');
  const [newAccCurrency, setNewAccCurrency] = useState('INR');
  const [newAccNumber, setNewAccNumber] = useState('');
  const [submittingAcc, setSubmittingAcc] = useState(false);

  // Admin Operational Action
  const [opModalOpen, setOpModalOpen] = useState(false);
  const [opType, setOpType] = useState('deposit');
  const [opAccountId, setOpAccountId] = useState('');
  const [opTargetAccountId, setOpTargetAccountId] = useState('');
  const [opAmount, setOpAmount] = useState('');
  const [opDesc, setOpDesc] = useState('');
  const [submittingOp, setSubmittingOp] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [usersRes, accountsRes] = await Promise.all([
        listUsers(),
        listAccounts(),
      ]);
      setUsers(usersRes.users || []);
      setAccounts(accountsRes.accounts || []);
    } catch (err) {
      setError(err.message || 'Failed to load system administrative data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle Create User
  const handleCreateUser = async (e) => {
    e.preventDefault();
    setSubmittingUser(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await createUser({
        email: newUserEmail.trim(),
        password: newUserPassword,
        fullName: newUserFullName.trim(),
        role: newUserRole,
      });

      setSuccess(`User '${res.user.fullName}' (${res.user.role}) created successfully.`);
      setCreateUserModalOpen(false);
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserFullName('');
      setNewUserRole('ACCOUNT_HOLDER');
      await fetchData();
    } catch (err) {
      setError(err.message || 'Failed to create user.');
    } finally {
      setSubmittingUser(false);
    }
  };

  // Handle Create Account
  const handleCreateAccount = async (e) => {
    e.preventDefault();
    if (!newAccUserId) {
      setError('Please select a customer user for this account.');
      return;
    }

    setSubmittingAcc(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await createAccount({
        userId: newAccUserId,
        currency: newAccCurrency,
        accountNumber: newAccNumber.trim() || undefined,
      });

      setSuccess(`Account '${res.account.accountNumber}' created successfully with 0.00 initial balance.`);
      setCreateAccountModalOpen(false);
      setNewAccUserId('');
      setNewAccNumber('');
      setNewAccCurrency('INR');
      await fetchData();
    } catch (err) {
      setError(err.message || 'Failed to create account.');
    } finally {
      setSubmittingAcc(false);
    }
  };

  // Handle Run Reconciliation
  const handleReconcile = async (accountId) => {
    setReconcilingAccountId(accountId);
    setError(null);
    try {
      const res = await reconcileAccount(accountId);
      setReconciliationData(res.reconciliation);
      setReconciliationModalOpen(true);
    } catch (err) {
      setError(err.message || 'Balance reconciliation check failed.');
    } finally {
      setReconcilingAccountId(null);
    }
  };

  // Handle Operational Transaction
  const handleExecuteOp = async (e) => {
    e.preventDefault();
    setSubmittingOp(true);
    setError(null);
    setSuccess(null);

    const idempotencyKey = newIdempotencyKey();

    try {
      let res;
      if (opType === 'deposit') {
        res = await deposit({
          accountId: opAccountId,
          amount: parseFloat(opAmount).toFixed(2),
          description: opDesc || 'Admin operational deposit',
        }, idempotencyKey);
      } else {
        res = await transfer({
          fromAccountId: opAccountId,
          toAccountId: opTargetAccountId,
          amount: parseFloat(opAmount).toFixed(2),
          description: opDesc || 'Admin operational transfer',
        }, idempotencyKey);
      }

      setSuccess(`Operational transaction executed: ${res.transaction.reference}`);
      setOpModalOpen(false);
      setOpAmount('');
      setOpDesc('');
      await fetchData();
    } catch (err) {
      setError(err.message || 'Operational transaction failed.');
    } finally {
      setSubmittingOp(false);
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: '1200px', margin: '40px auto', padding: '0 20px' }}>
        <LoadingCenter />
      </div>
    );
  }

  // Filter only standard accounts for customer stats
  const customerAccounts = accounts.filter((a) => a.type === 'STANDARD');
  const clearingAccount = accounts.find((a) => a.type === 'SYSTEM_CLEARING');
  const accountHolderUsers = users.filter((u) => u.role === 'ACCOUNT_HOLDER');

  const totalCustomerBalance = customerAccounts.reduce((sum, a) => {
    return sum + (parseFloat(a.balance) || 0);
  }, 0);

  const tabs = [
    { id: 'accounts', label: `Accounts (${accounts.length})` },
    { id: 'users', label: `Users (${users.length})` },
  ];

  return (
    <div style={{ maxWidth: '1200px', margin: '32px auto', padding: '0 20px' }}>
      {/* Page Title & Actions */}
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
            System Administration Console
          </h1>
          <p style={{ color: 'var(--gray-500)', fontSize: '14px', marginTop: '4px' }}>
            User provisioning, customer account creation, real-time ledger reconciliation, and system oversight.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setCreateUserModalOpen(true)}
          >
            + New User
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setCreateAccountModalOpen(true)}
          >
            + New Customer Account
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              if (customerAccounts.length > 0) {
                setOpAccountId(customerAccounts[0].id);
                setOpModalOpen(true);
              }
            }}
          >
            ⚙ Operational Transaction
          </button>
        </div>
      </div>

      {/* Notices */}
      {error && (
        <div style={{ marginBottom: '20px' }}>
          <Alert type="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        </div>
      )}

      {success && (
        <div style={{ marginBottom: '20px' }}>
          <Alert type="success" onClose={() => setSuccess(null)}>
            {success}
          </Alert>
        </div>
      )}

      {/* KPI Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '16px',
        marginBottom: '28px'
      }}>
        <div className="stat-card">
          <div className="stat-card-label">Total Users</div>
          <div className="stat-card-value">{users.length}</div>
          <div className="stat-card-sub">{accountHolderUsers.length} Account Holders</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Customer Accounts</div>
          <div className="stat-card-value">{customerAccounts.length}</div>
          <div className="stat-card-sub">Active standard ledgers</div>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--primary)' }}>
          <div className="stat-card-label">Customer Total Balance</div>
          <div className="stat-card-value">{formatAmount(totalCustomerBalance.toFixed(2), 'INR')}</div>
          <div className="stat-card-sub">Aggregated customer deposits</div>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--warning)' }}>
          <div className="stat-card-label">System Clearing Balance</div>
          <div className="stat-card-value" style={{ color: 'var(--danger)' }}>
            {clearingAccount ? formatAmount(clearingAccount.balance, clearingAccount.currency) : 'N/A'}
          </div>
          <div className="stat-card-sub">Counter-balancing clearing asset</div>
        </div>
      </div>

      {/* Main Tabs */}
      <div className="card">
        <div className="card-header" style={{ paddingBottom: 0 }}>
          <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
        </div>

        {/* 1. ACCOUNTS TAB */}
        {activeTab === 'accounts' && (
          <div className="card-body" style={{ padding: 0 }}>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Account Number</th>
                    <th>Account Type</th>
                    <th>Assigned Owner</th>
                    <th>Currency</th>
                    <th>Balance</th>
                    <th>Status</th>
                    <th>Audit & Verification</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((acc) => (
                    <tr key={acc.id}>
                      <td>
                        <strong className="text-mono">{acc.accountNumber}</strong>
                        <div style={{ fontSize: '11px', color: 'var(--gray-400)' }}>
                          {acc.id}
                        </div>
                      </td>
                      <td>
                        <Badge type={acc.type === 'SYSTEM_CLEARING' ? 'yellow' : 'blue'}>
                          {acc.type}
                        </Badge>
                      </td>
                      <td>
                        {acc.user ? (
                          <div>
                            <div style={{ fontWeight: 600 }}>{acc.user.fullName}</div>
                            <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>{acc.user.email}</div>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--gray-400)', fontStyle: 'italic' }}>System Controlled</span>
                        )}
                      </td>
                      <td style={{ fontWeight: 600 }}>{acc.currency}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                        {formatAmount(acc.balance, acc.currency)}
                      </td>
                      <td>
                        <Badge type={acc.status === 'ACTIVE' ? 'green' : 'gray'}>
                          {acc.status}
                        </Badge>
                      </td>
                      <td>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleReconcile(acc.id)}
                          disabled={reconcilingAccountId === acc.id}
                        >
                          {reconcilingAccountId === acc.id ? (
                            <>
                              <Spinner />
                              <span>Checking...</span>
                            </>
                          ) : (
                            '⚖ Reconcile Ledger'
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 2. USERS TAB */}
        {activeTab === 'users' && (
          <div className="card-body" style={{ padding: 0 }}>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Full Name</th>
                    <th>Email Address</th>
                    <th>System Role</th>
                    <th>Linked Accounts</th>
                    <th>Created Date</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td style={{ fontWeight: 600 }}>{u.fullName}</td>
                      <td>{u.email}</td>
                      <td>
                        <Badge type={u.role === 'ADMIN' ? 'blue' : u.role === 'AUDITOR' ? 'yellow' : 'green'}>
                          {u.role}
                        </Badge>
                      </td>
                      <td>
                        {u.accounts && u.accounts.length > 0 ? (
                          <span style={{ fontWeight: 600 }}>{u.accounts.length} account(s)</span>
                        ) : (
                          <span style={{ color: 'var(--gray-400)' }}>0 accounts</span>
                        )}
                      </td>
                      <td style={{ fontSize: '13px', color: 'var(--gray-500)' }}>
                        {formatDate(u.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* MODAL: Create New User */}
      {createUserModalOpen && (
        <Modal
          title="Provision New System User"
          onClose={() => setCreateUserModalOpen(false)}
        >
          <form onSubmit={handleCreateUser}>
            <div className="form-group">
              <label className="form-label" htmlFor="user-fullname">
                Full Legal Name <span className="required">*</span>
              </label>
              <input
                id="user-fullname"
                type="text"
                className="form-input"
                placeholder="e.g. David Compliance"
                value={newUserFullName}
                onChange={(e) => setNewUserFullName(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="user-email">
                Email Address <span className="required">*</span>
              </label>
              <input
                id="user-email"
                type="email"
                className="form-input"
                placeholder="e.g. david@ledgerline.internal"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="user-password">
                Initial Password <span className="required">*</span>
              </label>
              <input
                id="user-password"
                type="password"
                className="form-input"
                placeholder="StrongPassword123!"
                value={newUserPassword}
                onChange={(e) => setNewUserPassword(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="user-role">
                Assigned Role <span className="required">*</span>
              </label>
              <select
                id="user-role"
                className="form-input form-select"
                value={newUserRole}
                onChange={(e) => setNewUserRole(e.target.value)}
              >
                <option value="ACCOUNT_HOLDER">ACCOUNT_HOLDER (Customer)</option>
                <option value="AUDITOR">AUDITOR (Read-Only Compliance)</option>
                <option value="ADMIN">ADMIN (System Administrator)</option>
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setCreateUserModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={submittingUser}
              >
                {submittingUser ? <Spinner /> : 'Create User'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL: Create Customer Account */}
      {createAccountModalOpen && (
        <Modal
          title="Provision New Customer Account"
          onClose={() => setCreateAccountModalOpen(false)}
        >
          <form onSubmit={handleCreateAccount}>
            <div className="form-group">
              <label className="form-label" htmlFor="acc-user-select">
                Assign to Customer (ACCOUNT_HOLDER) <span className="required">*</span>
              </label>
              <select
                id="acc-user-select"
                className="form-input form-select"
                value={newAccUserId}
                onChange={(e) => setNewAccUserId(e.target.value)}
                required
              >
                <option value="">-- Select Account Holder --</option>
                {accountHolderUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} ({u.email})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="acc-number">
                Custom Account Number (Optional)
              </label>
              <input
                id="acc-number"
                type="text"
                className="form-input"
                placeholder="Leave blank for automatic ACC-XXXX generation"
                value={newAccNumber}
                onChange={(e) => setNewAccNumber(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="acc-currency">
                Base Currency <span className="required">*</span>
              </label>
              <select
                id="acc-currency"
                className="form-input form-select"
                value={newAccCurrency}
                onChange={(e) => setNewAccCurrency(e.target.value)}
              >
                <option value="INR">INR — Indian Rupee (₹)</option>
                <option value="USD">USD — US Dollar ($)</option>
                <option value="EUR">EUR — Euro (€)</option>
              </select>
            </div>

            <div className="alert alert-info" style={{ marginTop: '16px' }}>
              🔒 <strong>Invariable Rule:</strong> Customer accounts are always initialized with exactly <code>0.00</code> balance. Balances are credited exclusively through double-entry ledger settlement transactions.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setCreateAccountModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={submittingAcc}
              >
                {submittingAcc ? <Spinner /> : 'Provision Account'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL: Real-time Reconciliation Report */}
      {reconciliationModalOpen && reconciliationData && (
        <Modal
          title={`Ledger Reconciliation: ${reconciliationData.accountNumber}`}
          onClose={() => setReconciliationModalOpen(false)}
        >
          <div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '16px',
              borderRadius: 'var(--radius)',
              backgroundColor: reconciliationData.isBalanced ? 'var(--success-light)' : 'var(--danger-light)',
              marginBottom: '20px'
            }}>
              <span style={{ fontSize: '32px' }}>
                {reconciliationData.isBalanced ? '✅' : '❌'}
              </span>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: reconciliationData.isBalanced ? '#14532d' : '#7f1d1d' }}>
                  {reconciliationData.isBalanced
                    ? 'Double-Entry Invariant Satisfied: Balanced'
                    : 'Discrepancy Detected in Ledger Sum!'}
                </h3>
                <p style={{ fontSize: '13px', color: reconciliationData.isBalanced ? '#166534' : '#991b1b', marginTop: '2px' }}>
                  {reconciliationData.isBalanced
                    ? 'Stored Account.balance strictly equals the historical ledger entries sum.'
                    : `Discrepancy detected: ${reconciliationData.discrepancy} ${reconciliationData.currency}`}
                </p>
              </div>
            </div>

            <table className="table" style={{ marginBottom: '16px' }}>
              <tbody>
                <tr>
                  <td><strong>Account Number</strong></td>
                  <td className="text-mono">{reconciliationData.accountNumber}</td>
                </tr>
                <tr>
                  <td><strong>Account Type</strong></td>
                  <td>{reconciliationData.accountType}</td>
                </tr>
                <tr>
                  <td><strong>Stored Balance (Cached)</strong></td>
                  <td className="text-mono" style={{ fontWeight: 'bold' }}>
                    {formatAmount(reconciliationData.storedBalance, reconciliationData.currency)}
                  </td>
                </tr>
                <tr>
                  <td><strong>Reconciled Balance (Ledger Sum)</strong></td>
                  <td className="text-mono" style={{ fontWeight: 'bold' }}>
                    {formatAmount(reconciliationData.reconciledBalance, reconciliationData.currency)}
                  </td>
                </tr>
                <tr>
                  <td><strong>Total Credits (+ Inflow)</strong></td>
                  <td className="text-mono" style={{ color: 'var(--success)' }}>
                    +{formatAmount(reconciliationData.totalCredits, reconciliationData.currency)}
                  </td>
                </tr>
                <tr>
                  <td><strong>Total Debits (- Outflow)</strong></td>
                  <td className="text-mono" style={{ color: 'var(--danger)' }}>
                    -{formatAmount(reconciliationData.totalDebits, reconciliationData.currency)}
                  </td>
                </tr>
                <tr>
                  <td><strong>Mathematical Discrepancy</strong></td>
                  <td className="text-mono" style={{ color: reconciliationData.discrepancy === '0.00' ? 'inherit' : 'var(--danger)' }}>
                    {reconciliationData.discrepancy} {reconciliationData.currency}
                  </td>
                </tr>
              </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-primary"
                onClick={() => setReconciliationModalOpen(false)}
              >
                Close Report
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL: Admin Operational Transaction */}
      {opModalOpen && (
        <Modal
          title="Execute Operational Transaction"
          onClose={() => setOpModalOpen(false)}
        >
          <form onSubmit={handleExecuteOp}>
            <div className="form-group">
              <label className="form-label" htmlFor="op-type">
                Operation Type
              </label>
              <select
                id="op-type"
                className="form-input form-select"
                value={opType}
                onChange={(e) => setOpType(e.target.value)}
              >
                <option value="deposit">Deposit Funds (via Clearing Settlement)</option>
                <option value="transfer">Internal Transfer Between Customer Accounts</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="op-acc">
                {opType === 'deposit' ? 'Target Account' : 'Source Account'}
              </label>
              <select
                id="op-acc"
                className="form-input form-select"
                value={opAccountId}
                onChange={(e) => setOpAccountId(e.target.value)}
                required
              >
                {customerAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.accountNumber} ({acc.user ? acc.user.fullName : 'System'}) — Bal: {formatAmount(acc.balance, acc.currency)}
                  </option>
                ))}
              </select>
            </div>

            {opType === 'transfer' && (
              <div className="form-group">
                <label className="form-label" htmlFor="op-target-acc">
                  Destination Account
                </label>
                <select
                  id="op-target-acc"
                  className="form-input form-select"
                  value={opTargetAccountId}
                  onChange={(e) => setOpTargetAccountId(e.target.value)}
                  required
                >
                  <option value="">-- Select Destination Account --</option>
                  {customerAccounts
                    .filter((a) => a.id !== opAccountId)
                    .map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.accountNumber} ({acc.user ? acc.user.fullName : 'System'})
                      </option>
                    ))}
                </select>
              </div>
            )}

            <div className="form-group">
              <label className="form-label" htmlFor="op-amount">
                Amount (INR) <span className="required">*</span>
              </label>
              <input
                id="op-amount"
                type="number"
                step="0.01"
                min="0.01"
                className="form-input"
                placeholder="0.00"
                value={opAmount}
                onChange={(e) => setOpAmount(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="op-desc">
                Operational Memo
              </label>
              <input
                id="op-desc"
                type="text"
                className="form-input"
                placeholder="e.g. Administrative fund adjustment"
                value={opDesc}
                onChange={(e) => setOpDesc(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setOpModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={submittingOp}
              >
                {submittingOp ? <Spinner /> : 'Execute Operation'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
