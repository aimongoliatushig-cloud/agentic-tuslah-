"use client";

import {
  Activity,
  Bell,
  ChevronDown,
  CircleDollarSign,
  CreditCard,
  Database,
  Grid2X2,
  Headphones,
  Hexagon,
  KeyRound,
  LogOut,
  ReceiptText,
  Settings,
  ShieldCheck,
  WalletCards,
  Zap
} from "lucide-react";
import { useState } from "react";

type TopUpAmount = 10 | 25 | 50 | 100 | 200;

interface ActivityRow {
  id: string;
  title: string;
  time: string;
  amount: string;
  tone: "credit" | "debit";
  icon: "topup" | "claude" | "gpt" | "gemini";
}

const topUpAmounts: TopUpAmount[] = [10, 25, 50, 100, 200];

const activityRows: ActivityRow[] = [
  {
    id: "card-topup",
    title: "Top up via Card",
    time: "May 18, 2025 14:32",
    amount: "+ $25.00",
    tone: "credit",
    icon: "topup"
  },
  {
    id: "claude-sonnet",
    title: "Claude 3.5 Sonnet",
    time: "May 18, 2025 14:21",
    amount: "- $3.42",
    tone: "debit",
    icon: "claude"
  },
  {
    id: "gpt-4o",
    title: "GPT-4o",
    time: "May 18, 2025 13:48",
    amount: "- $6.18",
    tone: "debit",
    icon: "gpt"
  },
  {
    id: "gemini-pro",
    title: "Gemini 1.5 Pro",
    time: "May 18, 2025 12:33",
    amount: "- $2.11",
    tone: "debit",
    icon: "gemini"
  },
  {
    id: "claude-haiku",
    title: "Claude 3 Haiku",
    time: "May 18, 2025 11:02",
    amount: "- $0.74",
    tone: "debit",
    icon: "claude"
  }
];

const navItems = [
  { label: "Overview", icon: Grid2X2, active: true },
  { label: "AI Usage", icon: Activity },
  { label: "Transactions", icon: ReceiptText },
  { label: "Top up", icon: CircleDollarSign },
  { label: "API Keys", icon: KeyRound },
  { label: "Billing", icon: CreditCard },
  { label: "Settings", icon: Settings },
  { label: "Support", icon: Headphones }
];

function ActivityIcon({ kind, tone }: { kind: ActivityRow["icon"]; tone: ActivityRow["tone"] }) {
  const Icon = kind === "topup" ? CircleDollarSign : kind === "gpt" ? Hexagon : kind === "gemini" ? Zap : Activity;

  return (
    <span className={`ref-activity-icon ${tone}`}>
      <Icon size={18} strokeWidth={2} />
    </span>
  );
}

export function CustomerAccount() {
  const [selectedAmount, setSelectedAmount] = useState<TopUpAmount>(25);
  const [signedIn, setSignedIn] = useState(false);

  return (
    <main className="ref-account-page">
      <section className="ref-login-hero" aria-label="Gmail login preview">
        <div className="ref-brand">
          <span className="ref-brand-icon">
            <Hexagon size={42} strokeWidth={3} />
          </span>
          <div>
            <strong>Agentic Tuslah</strong>
            <small>AI Gateway</small>
          </div>
        </div>

        <div className="ref-hero-copy">
          <h1>Таны AI интеграцийн нэгдсэн гарц</h1>
          <p>Нэг аккаунтаар олон AI загварт хандах, ашиглалтаа хянах, төлбөрөө удирдах.</p>
        </div>

        <div className="ref-energy-art" aria-hidden="true">
          <div className="ref-energy-lines" />
          <div className="ref-ai-chip">
            <span>
              <Activity size={46} strokeWidth={2.4} />
            </span>
          </div>
        </div>

        <button className="ref-gmail-button" type="button" onClick={() => setSignedIn(true)}>
          <span className="ref-google-mark">G</span>
          {signedIn ? "Gmail mock нэвтэрсэн" : "Gmail-ээр нэвтрэх"}
        </button>

        <p className="ref-terms">
          Нэвтэрч орсноор та <a>үйлчилгээний нөхцөл</a> болон <a>нууцлалын бодлогыг</a> зөвшөөрч буйд тооцогдоно.
        </p>
      </section>

      <section className="ref-dashboard-shell" aria-label="Customer dashboard preview">
        <aside className="ref-dashboard-sidebar">
          <Hexagon className="ref-sidebar-logo" size={36} strokeWidth={3} />
          <nav aria-label="Customer navigation">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button className={item.active ? "active" : ""} key={item.label} type="button">
                  <Icon size={21} strokeWidth={1.9} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
          <button className="ref-logout" type="button">
            <LogOut size={21} strokeWidth={1.8} />
            <span>Log out</span>
          </button>
        </aside>

        <div className="ref-dashboard-main">
          <header className="ref-topbar">
            <div />
            <div className="ref-user-area">
              <Bell size={22} strokeWidth={1.7} />
              <span className="ref-avatar">U</span>
              <strong>User</strong>
              <ChevronDown size={16} strokeWidth={1.8} />
            </div>
          </header>

          <div className="ref-card-grid">
            <article className="ref-card ref-balance-card">
              <div>
                <h2>Balance</h2>
                <strong>$48.62</strong>
                <p>≈ 174,796.00 ₮</p>
              </div>
              <span className="ref-wallet-badge">
                <WalletCards size={52} strokeWidth={1.8} />
              </span>
            </article>

            <article className="ref-card ref-topup-card">
              <h2>Top up</h2>
              <div className="ref-amount-tabs">
                {topUpAmounts.map((amount) => (
                  <button
                    className={selectedAmount === amount ? "selected" : ""}
                    key={amount}
                    type="button"
                    onClick={() => setSelectedAmount(amount)}
                  >
                    ${amount}
                  </button>
                ))}
              </div>
              <div className="ref-topup-entry">
                <span>{selectedAmount}</span>
                <small>USD</small>
                <button type="button">Top up</button>
              </div>
            </article>

            <article className="ref-card ref-usage-card">
              <div className="ref-card-head">
                <h2>AI Usage</h2>
                <button type="button">
                  This week
                  <ChevronDown size={14} strokeWidth={1.8} />
                </button>
              </div>

              <div className="ref-usage-metrics">
                <span>
                  Requests
                  <strong>24,842</strong>
                  <em>↑ 18.6%</em>
                </span>
                <span>
                  Tokens
                  <strong>12.45M</strong>
                  <em>↑ 21.3%</em>
                </span>
                <span>
                  Models
                  <strong>6</strong>
                </span>
                <span>
                  Success rate
                  <strong>98.7%</strong>
                  <em>↑ 2.1%</em>
                </span>
              </div>

              <div className="ref-line-chart" aria-hidden="true">
                <svg viewBox="0 0 720 230" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="refArea" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#ff7a18" stopOpacity="0.5" />
                      <stop offset="100%" stopColor="#ff7a18" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path className="ref-grid-line" d="M45 30 H700 M45 82 H700 M45 134 H700 M45 186 H700" />
                  <path className="ref-dotted-line" d="M45 166 C110 144 142 146 178 154 C236 168 247 130 310 136 C376 142 420 136 475 158 C536 184 568 142 625 151 C655 154 675 164 700 156" />
                  <path className="ref-area" d="M45 144 C98 98 126 92 177 116 C238 145 258 70 322 94 C384 122 412 14 478 58 C540 98 542 162 604 130 C651 100 654 140 700 118 L700 204 L45 204 Z" />
                  <path className="ref-line" d="M45 144 C98 98 126 92 177 116 C238 145 258 70 322 94 C384 122 412 14 478 58 C540 98 542 162 604 130 C651 100 654 140 700 118" />
                  <circle cx="478" cy="58" r="6" />
                  <circle cx="700" cy="118" r="6" />
                </svg>
                <div className="ref-chart-y">
                  <span>6K</span>
                  <span>4K</span>
                  <span>2K</span>
                  <span>0</span>
                </div>
                <div className="ref-chart-x">
                  <span>May 12</span>
                  <span>May 13</span>
                  <span>May 14</span>
                  <span>May 15</span>
                  <span>May 16</span>
                  <span>May 17</span>
                  <span>May 18</span>
                </div>
                <div className="ref-chart-legend">
                  <span>Requests</span>
                  <span>Tokens (M)</span>
                </div>
              </div>
            </article>

            <article className="ref-card ref-activity-card">
              <h2>Recent activity</h2>
              <div className="ref-activity-list">
                {activityRows.map((row) => (
                  <div className="ref-activity-row" key={row.id}>
                    <ActivityIcon kind={row.icon} tone={row.tone} />
                    <div>
                      <strong>{row.title}</strong>
                      <small>{row.time}</small>
                    </div>
                    <em className={row.tone}>{row.amount}</em>
                  </div>
                ))}
              </div>
              <button className="ref-all-transactions" type="button">
                View all transactions
                <ChevronDown size={16} strokeWidth={2} />
              </button>
            </article>

            <footer className="ref-bottom-stats">
              <span>
                <CircleDollarSign size={28} />
                <small>Active models</small>
                <strong>6 / 12</strong>
              </span>
              <span>
                <Database size={28} />
                <small>Total requests</small>
                <strong>1.24M</strong>
              </span>
              <span>
                <Activity size={28} />
                <small>Avg. response time</small>
                <strong>1.28s</strong>
              </span>
              <span>
                <ShieldCheck size={28} />
                <small>Uptime</small>
                <strong>99.98%</strong>
              </span>
            </footer>
          </div>
        </div>
      </section>
    </main>
  );
}
