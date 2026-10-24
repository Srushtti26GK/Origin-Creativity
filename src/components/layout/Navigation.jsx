import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Home, Compass, PlusSquare, Bell, User, LogOut, Sun, Moon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';

const ITEMS = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/explore', label: 'Explore', icon: Compass },
  { to: '/create', label: 'Create', icon: PlusSquare },
  { to: '/notifications', label: 'Notifications', icon: Bell },
];

function ThemeToggle() {
  const [theme, setTheme] = useState(
    () => document.documentElement.dataset.theme || 'dark'
  );

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('theme', next);
    setTheme(next);
  };

  return (
    <button
      type="button"
      className="nav-account__logout"
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={toggle}
    >
      {theme === 'dark' ? <Sun size={19} aria-hidden="true" /> : <Moon size={19} aria-hidden="true" />}
    </button>
  );
}

function NavItems() {
  const { user, logout } = useAuth();
  return (
    <>
      {ITEMS.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} aria-label={label} className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}>
          <Icon size={22} aria-hidden="true" />
          <span className="nav-link__label nav-link__label--desktop">{label}</span>
          <span className="nav-link__label nav-link__label--mobile" aria-hidden="true">{label === 'Notifications' ? 'Alerts' : label}</span>
        </NavLink>
      ))}
      {user ? (
        <div className="nav-account">
          <NavLink
            to={`/profile/${user.username}`}
            aria-label="Profile"
            className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}
          >
            <User size={22} aria-hidden="true" />
            <span>Profile</span>
          </NavLink>
          <ThemeToggle />
          <button type="button" className="nav-account__logout" aria-label="Sign out" onClick={() => { void logout(); }}>
            <LogOut size={19} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div className="nav-account">
          <NavLink
            to="/login"
            aria-label="Profile"
            className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}
          >
            <User size={22} aria-hidden="true" />
            <span>Profile</span>
          </NavLink>
          <ThemeToggle />
        </div>
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