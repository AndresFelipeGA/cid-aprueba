import { useMeta } from '../context/MetaContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { usePageTitleValue } from '../context/PageTitleContext.jsx';

function initials(fullName) {
  if (!fullName) return '';
  const parts = fullName.trim().split(/\s+/);
  const first = parts[0]?.[0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

function roleDisplay(user, roleName) {
  let display = roleName(user.role_level, user.gender);
  if (user.territory) display += ` - ${user.territory}`;
  return display;
}

export default function Header({ onLogout, onToggleMobile }) {
  const { user } = useAuth();
  const { roleName } = useMeta();
  const title = usePageTitleValue();

  return (
    <header className="header">
      <div className="header__left">
        <button className="mobile-toggle" id="mobile-toggle" aria-label="Abrir menu" onClick={onToggleMobile}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <h1 className="header__title" id="header-title">{title}</h1>
      </div>
      <div className="header__user">
        <div className="header__avatar" id="user-avatar" aria-hidden="true">{user ? initials(user.full_name) : ''}</div>
        <div className="header__user-info">
          <div className="header__user-name" id="user-name">{user ? user.full_name : ''}</div>
          <div className="header__user-role" id="user-role">{user ? roleDisplay(user, roleName) : ''}</div>
        </div>
        <button className="header__logout" id="btn-logout" onClick={onLogout}>Salir</button>
      </div>
    </header>
  );
}
