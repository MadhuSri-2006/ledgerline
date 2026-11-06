// Shared UI component styles (injected as a style tag)
// All component CSS is co-located here to avoid multiple CSS files

const styles = `
/* ============================================================
   Button
   ============================================================ */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 18px;
  border-radius: var(--radius);
  border: none;
  font-size: 14px;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
  transition: background 0.15s, box-shadow 0.15s, opacity 0.15s;
  white-space: nowrap;
  text-decoration: none;
}
.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.btn-primary {
  background: var(--primary);
  color: var(--white);
}
.btn-primary:hover:not(:disabled) {
  background: var(--primary-hover);
  box-shadow: var(--shadow-md);
}
.btn-secondary {
  background: var(--gray-100);
  color: var(--gray-700);
  border: 1px solid var(--gray-200);
}
.btn-secondary:hover:not(:disabled) {
  background: var(--gray-200);
}
.btn-danger {
  background: var(--danger);
  color: var(--white);
}
.btn-danger:hover:not(:disabled) {
  background: #b91c1c;
}
.btn-ghost {
  background: transparent;
  color: var(--gray-600);
  border: 1px solid var(--gray-200);
}
.btn-ghost:hover:not(:disabled) {
  background: var(--gray-100);
}
.btn-sm {
  padding: 6px 12px;
  font-size: 13px;
}
.btn-lg {
  padding: 12px 24px;
  font-size: 15px;
}
.btn-full {
  width: 100%;
  justify-content: center;
}

/* ============================================================
   Card
   ============================================================ */
.card {
  background: var(--white);
  border: 1px solid var(--gray-200);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}
.card-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--gray-200);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.card-header h2, .card-header h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--gray-800);
}
.card-body {
  padding: 20px;
}
.card-footer {
  padding: 12px 20px;
  border-top: 1px solid var(--gray-200);
  background: var(--gray-50);
  border-radius: 0 0 var(--radius-md) var(--radius-md);
}

/* ============================================================
   Form
   ============================================================ */
.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
}
.form-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--gray-700);
}
.form-label .required {
  color: var(--danger);
  margin-left: 2px;
}
.form-input {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid var(--gray-300);
  border-radius: var(--radius);
  font-size: 14px;
  color: var(--gray-800);
  background: var(--white);
  transition: border-color 0.15s, box-shadow 0.15s;
  outline: none;
}
.form-input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-light);
}
.form-input.error {
  border-color: var(--danger);
  box-shadow: 0 0 0 3px var(--danger-light);
}
.form-input:disabled {
  background: var(--gray-100);
  color: var(--gray-500);
  cursor: not-allowed;
}
.form-select {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b7280' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 36px;
}
.form-error {
  font-size: 12px;
  color: var(--danger);
}
.form-hint {
  font-size: 12px;
  color: var(--gray-500);
}

/* ============================================================
   Alert / Toast
   ============================================================ */
.alert {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border-radius: var(--radius);
  font-size: 14px;
  line-height: 1.4;
}
.alert-success {
  background: var(--success-light);
  color: #14532d;
  border: 1px solid #bbf7d0;
}
.alert-error {
  background: var(--danger-light);
  color: #7f1d1d;
  border: 1px solid #fecaca;
}
.alert-warning {
  background: var(--warning-light);
  color: #78350f;
  border: 1px solid #fde68a;
}
.alert-info {
  background: var(--primary-light);
  color: #1e3a8a;
  border: 1px solid #bfdbfe;
}

/* ============================================================
   Badge
   ============================================================ */
.badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}
.badge-green  { background: var(--success-light); color: #14532d; }
.badge-red    { background: var(--danger-light);  color: #7f1d1d; }
.badge-blue   { background: var(--primary-light); color: #1e3a8a; }
.badge-teal   { background: var(--secondary-light); color: #134e4a; }
.badge-yellow { background: var(--warning-light); color: #78350f; }
.badge-gray   { background: var(--gray-100); color: var(--gray-600); }

/* ============================================================
   Table
   ============================================================ */
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
.table th {
  text-align: left;
  padding: 10px 14px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--gray-500);
  background: var(--gray-50);
  border-bottom: 1px solid var(--gray-200);
}
.table td {
  padding: 12px 14px;
  border-bottom: 1px solid var(--gray-100);
  color: var(--gray-700);
  vertical-align: middle;
}
.table tr:last-child td {
  border-bottom: none;
}
.table tr:hover td {
  background: var(--gray-50);
}

/* ============================================================
   Modal / Dialog
   ============================================================ */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
  animation: fadeIn 0.15s ease-out;
}
.modal {
  background: var(--white);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  width: 100%;
  max-width: 480px;
  max-height: 90vh;
  overflow-y: auto;
  animation: fadeIn 0.15s ease-out;
}
.modal-header {
  padding: 18px 20px;
  border-bottom: 1px solid var(--gray-200);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.modal-header h3 {
  font-size: 17px;
  font-weight: 600;
}
.modal-close {
  background: none;
  border: none;
  font-size: 20px;
  color: var(--gray-400);
  cursor: pointer;
  padding: 4px;
  line-height: 1;
  border-radius: var(--radius-sm);
}
.modal-close:hover { color: var(--gray-700); background: var(--gray-100); }
.modal-body { padding: 20px; }
.modal-footer {
  padding: 14px 20px;
  border-top: 1px solid var(--gray-200);
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

/* ============================================================
   Stat card
   ============================================================ */
.stat-card {
  background: var(--white);
  border: 1px solid var(--gray-200);
  border-radius: var(--radius-md);
  padding: 20px;
  box-shadow: var(--shadow-sm);
}
.stat-card-label {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--gray-500);
  margin-bottom: 6px;
}
.stat-card-value {
  font-size: 26px;
  font-weight: 700;
  color: var(--gray-900);
  font-family: var(--font-mono);
}
.stat-card-sub {
  font-size: 12px;
  color: var(--gray-500);
  margin-top: 4px;
}

/* ============================================================
   Empty state
   ============================================================ */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  color: var(--gray-400);
  text-align: center;
}
.empty-state-icon {
  font-size: 48px;
  margin-bottom: 12px;
}
.empty-state-text {
  font-size: 15px;
  color: var(--gray-500);
}

/* ============================================================
   Loading state
   ============================================================ */
.loading-center {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px;
}

/* ============================================================
   Tabs
   ============================================================ */
.tabs {
  display: flex;
  gap: 2px;
  border-bottom: 1px solid var(--gray-200);
  margin-bottom: 20px;
  overflow-x: auto;
}
.tab-btn {
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 500;
  color: var(--gray-500);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.15s, border-color 0.15s;
  margin-bottom: -1px;
}
.tab-btn:hover { color: var(--gray-800); }
.tab-btn.active {
  color: var(--primary);
  border-bottom-color: var(--primary);
}
`;

let injected = false;
export function injectStyles() {
  if (injected) return;
  injected = true;
  const el = document.createElement('style');
  el.textContent = styles;
  document.head.appendChild(el);
}

injectStyles();
export default styles;
