import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useBadgeCount } from '../context/BadgeContext.jsx';
import ThemeToggle from './ThemeToggle.jsx';

function Badge({ count }) {
  if (!count) return <span className="sidebar__badge sidebar__badge--hidden" />;
  const label = count > 99 ? '99+' : String(count);
  return (
    <span
      className="sidebar__badge"
      aria-label={`${count} ${count === 1 ? 'requisición pendiente' : 'requisiciones pendientes'}`}
    >
      {label}
    </span>
  );
}

function linkClass({ isActive }) {
  return `sidebar__link${isActive ? ' sidebar__link--active' : ''}`;
}

export default function Sidebar({ mobileOpen, onCloseMobile }) {
  const { user } = useAuth();
  const pendingCount = useBadgeCount();

  return (
    <>
      <div className={`overlay${mobileOpen ? ' overlay--visible' : ''}`} onClick={onCloseMobile} />
      <aside className={`sidebar${mobileOpen ? ' sidebar--open' : ''}`} role="navigation" aria-label="Menu principal">
        <div className="sidebar__brand">
          <img src="/assets/logo-LA-CID.svg" alt="CID - Corporación Infancia y Desarrollo" className="sidebar__logo-img" />
        </div>
        <ThemeToggle />
        <nav className="sidebar__nav">
          <NavLink to="/dashboard" end className={linkClass} data-view="dashboard">
            Panel de Control
            <Badge count={pendingCount} />
          </NavLink>
          <NavLink to="/requisitions" className={linkClass} data-view="requisitions">
            Requisiciones
            <Badge count={pendingCount} />
          </NavLink>
          {user && user.role_level === 1 && (
            <NavLink to="/create" end id="nav-create-requisition" className={linkClass} data-view="create-requisition">
              Crear Requisición
            </NavLink>
          )}
          <NavLink to="/profile" end className={linkClass} data-view="profile">
            Perfil
          </NavLink>
          {user && user.role_level === 3 && (
            <NavLink to="/users" end id="nav-users" className={linkClass} data-view="users">
              Gestión de Usuarios
            </NavLink>
          )}
        </nav>
        <a
          className="sidebar__credit"
          href="https://checherearquitectos.vercel.app/"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Desarrollado por Chechere Studio (abre en una pestaña nueva)"
        >
          <span className="sidebar__credit-label">Desarrollado por</span>
          <img src="/assets/logo-chechere.svg" alt="Chechere Studio" className="sidebar__credit-logo" />
        </a>
      </aside>
    </>
  );
}
