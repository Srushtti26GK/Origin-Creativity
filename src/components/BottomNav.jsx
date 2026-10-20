import {
  Home,
  Compass,
  PlusSquare,
  Bell,
  UserRound,
} from "lucide-react";

const navItems = [
  { label: "Home", icon: Home, href: "/" },
  { label: "Explore", icon: Compass, href: "/explore" },
  { label: "Create", icon: PlusSquare, href: "/create" },
  { label: "Notifications", icon: Bell, href: "/notifications" },
  { label: "My Profile", icon: UserRound, href: "/profile" },
];

export default function BottomNav() {
  const currentPath = window.location.pathname;

  return (
    <nav className="bottom-nav">
      {navItems.map(({ label, icon: Icon, href }) => {
        const isActive = currentPath === href;

        return (
          <a
            key={label}
            href={href}
            className={`bottom-nav-item ${
              isActive ? "active" : ""
            }`}
            aria-label={label}
            aria-current={isActive ? "page" : undefined}
          >
            <Icon size={22} strokeWidth={1.8} />

            <span>{label}</span>
          </a>
        );
      })}
    </nav>
  );
}