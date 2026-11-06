import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Badge } from './ui';

export default function Navbar() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (!user) return null;

  const handleLogout = () => {
    signOut();
    navigate('/login');
  };

  const getRoleBadgeType = (role) => {
    switch (role) {
      case 'ADMIN':
        return 'blue';
      case 'AUDITOR':
        return 'yellow';
      case 'ACCOUNT_HOLDER':
      default:
        return 'green';
    }
  };

  const formatRoleLabel = (role) => {
    switch (role) {
      case 'ADMIN':
        return 'Administrator';
      case 'AUDITOR':
        return 'Auditor (Read-Only)';
      case 'ACCOUNT_HOLDER':
        return 'Account Holder';
      default:
        return role;
    }
  };

  const isActive = (path) => location.pathname === path;

  return (
    <header style={{
      backgroundColor: '#ffffff',
      borderBottom: '1px solid var(--gray-200)',
      position: 'sticky',
      top: 0,
      zIndex: 50,
      boxShadow: 'var(--shadow-sm)'
    }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '0 20px',
        height: '64px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <Link to="/" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            textDecoration: 'none',
            color: 'var(--gray-900)'
          }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontWeight: 'bold',
              fontSize: '18px',
              boxShadow: '0 2px 4px rgba(30, 64, 175, 0.25)'
            }}>
              L
            </div>
            <div>
              <span style={{ fontWeight: '700', fontSize: '18px', letterSpacing: '-0.02em', color: 'var(--gray-900)' }}>
                Ledger<span style={{ color: 'var(--primary)' }}>Line</span>
              </span>
              <span style={{
                display: 'block',
                fontSize: '10px',
                fontWeight: '600',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--gray-500)',
                marginTop: '-3px'
              }}>
                Secure Financial Ledger
              </span>
            </div>
          </Link>

          {/* Navigation Links by Role */}
          <nav style={{ display: 'none', gap: '8px', alignItems: 'center' }} className="nav-desktop">
            {user.role === 'ACCOUNT_HOLDER' && (
              <>
                <Link
                  to="/dashboard"
                  style={{
                    padding: '8px 14px',
                    borderRadius: 'var(--radius)',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: isActive('/dashboard') ? 'var(--primary)' : 'var(--gray-600)',
                    backgroundColor: isActive('/dashboard') ? 'var(--primary-light)' : 'transparent',
                    textDecoration: 'none'
                  }}
                >
                  My Accounts
                </Link>
              </>
            )}

            {user.role === 'ADMIN' && (
              <>
                <Link
                  to="/admin"
                  style={{
                    padding: '8px 14px',
                    borderRadius: 'var(--radius)',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: isActive('/admin') ? 'var(--primary)' : 'var(--gray-600)',
                    backgroundColor: isActive('/admin') ? 'var(--primary-light)' : 'transparent',
                    textDecoration: 'none'
                  }}
                >
                  Admin Console
                </Link>
              </>
            )}

            {user.role === 'AUDITOR' && (
              <>
                <Link
                  to="/auditor"
                  style={{
                    padding: '8px 14px',
                    borderRadius: 'var(--radius)',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: isActive('/auditor') ? 'var(--primary)' : 'var(--gray-600)',
                    backgroundColor: isActive('/auditor') ? 'var(--primary-light)' : 'transparent',
                    textDecoration: 'none'
                  }}
                >
                  Compliance & Audit
                </Link>
              </>
            )}
          </nav>
        </div>

        {/* User Info & Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--gray-800)' }}>
                {user.fullName}
              </span>
              <Badge type={getRoleBadgeType(user.role)}>
                {formatRoleLabel(user.role)}
              </Badge>
            </div>
            <span style={{ fontSize: '12px', color: 'var(--gray-500)', marginTop: '2px' }}>
              {user.email}
            </span>
          </div>

          <button
            onClick={handleLogout}
            className="btn btn-ghost btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            title="Sign out of LedgerLine"
          >
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </header>
  );
}
