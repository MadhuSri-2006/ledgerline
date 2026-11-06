import React from 'react';

export function Alert({ type = 'info', children, onClose }) {
  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ',
  };
  return (
    <div className={`alert alert-${type}`} role="alert">
      <span style={{ flexShrink: 0, fontWeight: 700 }}>{icons[type]}</span>
      <span style={{ flex: 1 }}>{children}</span>
      {onClose && (
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.6, fontSize: 16, padding: '0 2px' }}
          aria-label="Dismiss"
        >
          ×
        </button>
      )}
    </div>
  );
}

export function Badge({ type = 'gray', children }) {
  return <span className={`badge badge-${type}`}>{children}</span>;
}

export function Spinner({ large }) {
  return <div className={`spinner${large ? ' spinner-lg' : ''}`} role="status" aria-label="Loading" />;
}

export function LoadingCenter() {
  return (
    <div className="loading-center">
      <Spinner large />
    </div>
  );
}

export function EmptyState({ icon = '📭', text = 'Nothing here yet.' }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">{icon}</div>
      <p className="empty-state-text">{text}</p>
    </div>
  );
}

export function Modal({ title, onClose, children, footer }) {
  // Close on overlay click
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose?.();
  };
  return (
    <div className="modal-overlay" onClick={handleOverlayClick} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal">
        <div className="modal-header">
          <h3 id="modal-title">{title}</h3>
          {onClose && (
            <button className="modal-close" onClick={onClose} aria-label="Close dialog">×</button>
          )}
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, message, onConfirm, onCancel, confirmLabel = 'Confirm', danger = false }) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'} btn-sm`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <p style={{ color: 'var(--gray-700)', lineHeight: 1.6 }}>{message}</p>
    </Modal>
  );
}

export function FormGroup({ label, required, error, hint, children, htmlFor }) {
  return (
    <div className="form-group">
      {label && (
        <label className="form-label" htmlFor={htmlFor}>
          {label}
          {required && <span className="required">*</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="form-hint">{hint}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}

export function Input({ id, error, ...props }) {
  return (
    <input
      id={id}
      className={`form-input${error ? ' error' : ''}`}
      {...props}
    />
  );
}

export function Select({ id, error, children, ...props }) {
  return (
    <select
      id={id}
      className={`form-input form-select${error ? ' error' : ''}`}
      {...props}
    >
      {children}
    </select>
  );
}

export function StatCard({ label, value, sub, accent }) {
  return (
    <div className="stat-card" style={accent ? { borderTop: `3px solid ${accent}` } : {}}>
      <div className="stat-card-label">{label}</div>
      <div className="stat-card-value">{value}</div>
      {sub && <div className="stat-card-sub">{sub}</div>}
    </div>
  );
}

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={active === tab.id}
          className={`tab-btn${active === tab.id ? ' active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Format a decimal amount string as currency.
 * Uses fixed-point string from API — no float arithmetic.
 */
export function formatAmount(amount, currency = 'INR') {
  if (amount === undefined || amount === null) return '—';
  const num = parseFloat(amount);
  if (isNaN(num)) return amount;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}
