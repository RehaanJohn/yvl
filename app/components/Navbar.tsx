"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";

export default function Navbar() {
  const pathname = usePathname();
  return (
    <header className="navbar glass">
      <Link href="/" className="brand" aria-label="YVL home">
        <span className="brand-mark">y</span>
        <span>
          yvl<span className="brand-dot">.</span>
        </span>
      </Link>
      <nav className="nav-links" aria-label="Main navigation">
        <Link
          href="/dashboard"
          className={pathname === "/dashboard" ? "active" : ""}
        >
          Markets
        </Link>
        <Link href="/#how-it-works">How it works</Link>
      </nav>
      <div className="navbar-actions">
        <span className="network-pill">
          <span className="status-dot" />
          Arbitrum Sepolia
        </span>
        <ConnectButton
          showBalance={false}
          chainStatus="none"
          accountStatus="address"
        />
      </div>
    </header>
  );
}
