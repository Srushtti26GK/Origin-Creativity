import { Link, NavLink } from 'react-router-dom';
import { Home, Compass, PlusSquare, Bell, User, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';

const ITEMS = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/explore', label: 'Explore', icon: Compass },
  { to: '/create', label: 'Create', icon: PlusSquare },
  { to: '/notifications', label: 'Notifications', icon: Bell },
];

function NavItems() {
  const { user, logout } = useAuth();
  return (
    <>
      {ITEMS.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}>
          <Icon size={22} aria-hidden="true" />
          <span>{label}</span>
        </NavLink>
      ))}
      {user ? (
        <div className="nav-account">
          <NavLink
            to={`/profile/${user.username}`}
            className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}
          >
            <User size={22} aria-hidden="true" />
            <span>My Profile</span>
          </NavLink>
          <button type="button" className="nav-account__logout" aria-label="Sign out" onClick={() => { void logout(); }}>
            <LogOut size={19} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <NavLink
          to="/login"
          className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}
        >
          <User size={22} aria-hidden="true" />
          <span>Sign in</span>
        </NavLink>
      )}
    </>
  );
}

export function Sidebar() {
  return (
    <aside className="sidebar">
      <Link to="/" className="brand">Origin<span>Creativity</span></Link>
      <nav aria-label="Primary" className="sidebar__nav"><NavItems /></nav>
    </aside>
  );
}

export function MobileNavigation() {
  return <nav className="mobile-nav" aria-label="Primary"><NavItems /></nav>;
}
