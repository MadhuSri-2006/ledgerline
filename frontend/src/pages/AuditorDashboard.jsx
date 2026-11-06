import React, { useState, useEffect, useCallback } from 'react';
import { listAccounts, reconcileAccount } from '../services/api';
import {
  Alert,
  Badge,
  Spinner,
  LoadingCenter,
  EmptyState,
  Modal,
  formatAmount,
  formatDate
} from '../components/ui';

export default function AuditorDashboard() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Reconciliation audit state
  const [reconcilingId, setReconcilingId] = useState(null);
  const [reconciliationModalOpen, setReconciliationModalOpen] = useState(false);
  const [reconciliationResult, setReconciliationResult] = useState(null);
  const [allReconciledStatus, setAllReconciledStatus] = useState(null);
  const [auditingAll, setAuditingAll] = useState(false);

  const fetchAccounts = useCallback(async () => {
    try {
      setError(null);
      const res = await listAccounts();
      setAccounts(res.accounts || []);
    } catch (err) {
      setError(err.message || 'Failed to retrieve accounts for audit.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  // Run reconciliation for a single account
  const handleReconcileSingle = async (accountId) => {
    setReconcilingId(accountId);
    setError(null);
    try {
      const res = await reconcileAccount(accountId);
      setReconciliationResult(res.reconciliation);
      setReconciliationModalOpen(true);
    } catch (err) {
      setError(err.message || 'Balance reconciliation query failed.');
    } finally {
      setReconcilingId(null);
    }
  };

  // Run comprehensive audit reconciliation across ALL accounts in the system
  const handleAuditAll = async () => {
    setAuditingAll(true);
    setError(null);
    setAllReconciledStatus(null);

    try {
      const results = await Promise.all(
        accounts.map((acc) => reconcileAccount(acc.id).catch((e) => ({ error: e.message, accountId: acc.id })))
      );

      const allBalanced = results.every((r) => r.reconciliation && r.reconciliation.isBalanced);
      const count = results.filter((r) => r.reconciliation && r.reconciliation.isBalanced).length;

      setAllReconciledStatus({
        allBalanced,
        totalChecked: accounts.length,
        balancedCount: count,
        results: results.map((r) => r.reconciliation).filter(Boolean),
      });
    } catch (err) {
      setError(err.message || 'Failed to complete comprehensive system audit.');
    } finally {
      setAuditingAll(false);
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: '1200px', margin: '40px auto', padding: '0 20px' }}>
        <LoadingCenter />
      </div>
    );
  }

  // Calculate system-wide totals
  const totalCustomerBalance = accounts
    .filter((a) => a.type === 'STANDARD')
    .reduce((sum, a) => sum + (parseFloat(a.balance) || 0), 0);

  const clearingAccount = accounts.find((a) => a.type === 'SYSTEM_CLEARING');

  return (
    <div style={{ maxWidth: '1200px', margin: '32px auto', padding: '0 20px' }}>
      {/* Compliance Notice Banner */}
      <div style={{
        backgroundColor: '#fffbeb',
        border: '1px solid #fde68a',
        borderRadius: 'var(--radius)',
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        marginBottom: '28px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '24px' }}>🛡️</span>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#92400e' }}>
              Compliance & Independent Auditor Portal
            </h3>
            <p style={{ fontSize: '13px', color: '#b45309', marginTop: '2px' }}>
              Read-Only Governance Mode: Mutation controls are strictly disabled. All accounts and historical ledger entries are cryptographically and mathematically auditable.
            </p>
          </div>
        </div>

        <button
          className="btn btn-secondary btn-sm"
          onClick={handleAuditAll}
          disabled={auditingAll || accounts.length === 0}
          style={{ backgroundColor: '#ffffff', borderColor: '#fcd34d', color: '#92400e' }}
        >
          {auditingAll ? (
            <>
              <Spinner />
              <span>Verifying All Ledgers...</span>
            </>
          ) : (
            '🔬 Run System-Wide Audit'
          )}
        </button>
      </div>

      {/* Error alert */}
      {error && (
        <div style={{ marginBottom: '20px' }}>
          <Alert type="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        </div>
      )}

      {/* System-wide audit result banner */}
      {allReconciledStatus && (
        <div style={{ marginBottom: '24px' }}>
          <Alert
            type={allReconciledStatus.allBalanced ? 'success' : 'error'}
            onClose={() => setAllReconciledStatus(null)}
          >
            <strong>
              {allReconciledStatus.allBalanced
                ? `System-Wide Verification Passed: 100% of accounts (${allReconciledStatus.balancedCount}/${allReconciledStatus.totalChecked}) reconcile with zero discrepancy!`
                : `Audit Discrepancy Found: Only ${allReconciledStatus.balancedCount} of ${allReconciledStatus.totalChecked} accounts reconciled!`}
            </strong>
          </Alert>
        </div>
      )}

      {/* Stat Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '16px',
        marginBottom: '28px'
      }}>
        <div className="stat-card">
          <div className="stat-card-label">Audited Accounts</div>
          <div className="stat-card-value">{accounts.length}</div>
          <div className="stat-card-sub">Total ledgers in system</div>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--primary)' }}>
          <div className="stat-card-label">Total Customer Holdings</div>
          <div className="stat-card-value">{formatAmount(totalCustomerBalance.toFixed(2), 'INR')}</div>
          <div className="stat-card-sub">Sum of all customer balances</div>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--warning)' }}>
          <div className="stat-card-label">Settlement Clearing Asset</div>
          <div className="stat-card-value" style={{ color: 'var(--danger)' }}>
            {clearingAccount ? formatAmount(clearingAccount.balance, clearingAccount.currency) : 'N/A'}
          </div>
          <div className="stat-card-sub">Counterpart double-entry reserve</div>
        </div>
      </div>

      {/* Accounts Audit Table */}
      <div className="card">
        <div className="card-header">
          <h2>All Accounts Ledger Registry</h2>
          <Badge type="yellow">Read-Only</Badge>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {accounts.length === 0 ? (
            <div style={{ padding: '32px' }}>
              <EmptyState icon="📂" text="No accounts found in system." />
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Account Number</th>
                    <th>Type</th>
                    <th>Owner / Entity</th>
                    <th>Currency</th>
                    <th>Cached Balance</th>
                    <th>Status</th>
                    <th>Audit Verification</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((acc) => (
                    <tr key={acc.id}>
                      <td>
                        <strong className="text-mono">{acc.accountNumber}</strong>
                        <div style={{ fontSize: '11px', color: 'var(--gray-400)' }}>{acc.id}</div>
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
                          <span style={{ color: 'var(--gray-400)', fontStyle: 'italic' }}>System Clearing</span>
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
                          onClick={() => handleReconcileSingle(acc.id)}
                          disabled={reconcilingId === acc.id}
                        >
                          {reconcilingId === acc.id ? (
                            <>
                              <Spinner />
                              <span>Reconciling...</span>
                            </>
                          ) : (
                            '⚖ Audit & Reconcile'
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal: Single Account Reconciliation Breakdown */}
      {reconciliationModalOpen && reconciliationResult && (
        <Modal
          title={`Audit Reconciliation: ${reconciliationResult.accountNumber}`}
          onClose={() => setReconciliationModalOpen(false)}
        >
          <div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '16px',
              borderRadius: 'var(--radius)',
              backgroundColor: reconciliationResult.isBalanced ? 'var(--success-light)' : 'var(--danger-light)',
              marginBottom: '20px'
            }}>
              <span style={{ fontSize: '32px' }}>
                {reconciliationResult.isBalanced ? '✅' : '❌'}
              </span>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: reconciliationResult.isBalanced ? '#14532d' : '#7f1d1d' }}>
                  {reconciliationResult.isBalanced
                    ? 'Mathematical Verification: BALANCED'
                    : 'AUDIT ALERT: Balance Discrepancy!'}
                </h3>
                <p style={{ fontSize: '13px', color: reconciliationResult.isBalanced ? '#166534' : '#991b1b', marginTop: '2px' }}>
                  {reconciliationResult.isBalanced
                    ? 'Cached Account.balance strictly matches historical sum of LedgerEntry debits and credits.'
                    : `Discrepancy: ${reconciliationResult.discrepancy} ${reconciliationResult.currency}`}
                </p>
              </div>
            </div>

            <table className="table" style={{ marginBottom: '16px' }}>
              <tbody>
                <tr>
                  <td><strong>Account Number</strong></td>
                  <td className="text-mono">{reconciliationResult.accountNumber}</td>
                </tr>
                <tr>
                  <td><strong>Account Type</strong></td>
                  <td>{reconciliationResult.accountType}</td>
                </tr>
                <tr>
                  <td><strong>Stored Balance (Account.balance)</strong></td>
                  <td className="text-mono" style={{ fontWeight: 'bold' }}>
                    {formatAmount(reconciliationResult.storedBalance, reconciliationResult.currency)}
                  </td>
                </tr>
                <tr>
                  <td><strong>Historical Ledger Sum (Credits - Debits)</strong></td>
                  <td className="text-mono" style={{ fontWeight: 'bold' }}>
                    {formatAmount(reconciliationResult.reconciledBalance, reconciliationResult.currency)}
                  </td>
                </tr>
                <tr>
                  <td><strong>Total Credits (+ Inflow)</strong></td>
                  <td className="text-mono" style={{ color: 'var(--success)' }}>
                    +{formatAmount(reconciliationResult.totalCredits, reconciliationResult.currency)}
                  </td>
                </tr>
                <tr>
                  <td><strong>Total Debits (- Outflow)</strong></td>
                  <td className="text-mono" style={{ color: 'var(--danger)' }}>
                    -{formatAmount(reconciliationResult.totalDebits, reconciliationResult.currency)}
                  </td>
                </tr>
                <tr>
                  <td><strong>Discrepancy (Stored - Calculated)</strong></td>
                  <td className="text-mono" style={{ color: reconciliationResult.discrepancy === '0.00' ? 'inherit' : 'var(--danger)', fontWeight: 'bold' }}>
                    {reconciliationResult.discrepancy} {reconciliationResult.currency}
                  </td>
                </tr>
              </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-primary"
                onClick={() => setReconciliationModalOpen(false)}
              >
                Close Audit Report
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
