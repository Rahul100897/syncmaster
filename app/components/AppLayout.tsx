import type { ReactNode } from "react";
import { NavLink } from "@remix-run/react";
import styles from "./AppLayout.module.css";

export type Plan = "free" | "pro";

export interface AppLayoutProps {
  /** Shop domain, e.g. "acme.myshopify.com". */
  shop: string;
  /** Current plan for the primary store. */
  plan: Plan;
  children: ReactNode;
}

interface NavItem {
  label: string;
  to: string;
  /** Simple inline glyph so we avoid an extra icon dependency. */
  icon: ReactNode;
}

function Glyph({ path }: { path: string }) {
  return (
    <svg
      className={styles.navIcon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", to: "/app", icon: <Glyph path="M3 12l9-9 9 9M5 10v10h14V10" /> },
  { label: "Connect Stores", to: "/app/connect", icon: <Glyph path="M8 7h8M8 12h8M8 17h5M4 4h16v16H4z" /> },
  { label: "Sync Rules", to: "/app/rules", icon: <Glyph path="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" /> },
  { label: "Jobs", to: "/app/jobs", icon: <Glyph path="M22 11.5A10 10 0 1 1 12 2M22 4l-10 10-3-3" /> },
  { label: "Snapshots", to: "/app/snapshots", icon: <Glyph path="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /> },
  { label: "Analytics", to: "/app/analytics", icon: <Glyph path="M3 3v18h18M7 14l4-4 3 3 5-6" /> },
  { label: "Activity Log", to: "/app/activity", icon: <Glyph path="M12 8v4l3 3M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0z" /> },
  { label: "Settings", to: "/app/settings", icon: <Glyph path="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /> },
];

function initialsFor(shop: string): string {
  const name = shop.replace(/\.myshopify\.com$/i, "").replace(/[^a-z0-9]+/gi, " ").trim();
  const parts = name.split(" ").filter(Boolean);
  if (parts.length === 0) return "S";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function AppLayout({ shop, plan, children }: AppLayoutProps) {
  const isPro = plan === "pro";
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <div className={styles.brandIcon} aria-label="SyncMaster">
            <span className={styles.monogramS}>S</span>
            <span className={styles.monogramM}>M</span>
          </div>
          <div className={styles.brandText}>
            <span className={styles.brandName}>SyncMaster</span>
            <span
              className={`${styles.planBadge} ${isPro ? styles.planPro : styles.planFree}`}
            >
              {isPro ? "PRO" : "FREE"}
            </span>
          </div>
        </div>

        <nav className={styles.nav}>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              // "/app" must match exactly so it isn't active on every child route.
              end={item.to === "/app"}
              className={({ isActive }) =>
                isActive ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink
              }
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className={styles.footer}>
          <div className={styles.avatar}>{initialsFor(shop)}</div>
          <span className={styles.shopDomain} title={shop}>
            {shop}
          </span>
        </div>
      </aside>

      <main className={styles.content}>{children}</main>
    </div>
  );
}
