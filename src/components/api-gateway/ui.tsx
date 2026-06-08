import type { ReactNode } from "react";

import { formatNumber } from "@/server/api-gateway/adminData";

export interface TableColumn<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  action
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="gateway-page-header">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action ? <div className="header-action">{action}</div> : null}
    </header>
  );
}

export function StatCard({
  label,
  value,
  detail,
  tone = "default"
}: {
  label: string;
  value: string | number;
  detail?: string;
  tone?: "default" | "good" | "warning" | "danger";
}) {
  return (
    <article className={`stat-card tone-${tone}`}>
      <span>{label}</span>
      <strong>{typeof value === "number" ? formatNumber(value) : value}</strong>
      {detail ? <small>{detail}</small> : null}
    </article>
  );
}

export function DashboardGrid({
  children,
  columns = "auto"
}: {
  children: ReactNode;
  columns?: "auto" | "two" | "three" | "four";
}) {
  return <div className={`dashboard-grid columns-${columns}`}>{children}</div>;
}

export function SectionCard({
  title,
  description,
  children,
  className = ""
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`section-card ${className}`}>
      <div className="section-title">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

export function DataTable<T>({
  columns,
  rows,
  emptyTitle = "Мэдээлэл алга",
  emptyDescription = "Одоогоор харуулах бичлэг байхгүй байна."
}: {
  columns: TableColumn<T>[];
  rows: T[];
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="table-shell">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th className={column.className} key={column.key}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {columns.map((column) => (
                <td className={column.className} key={column.key}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SearchBar({
  placeholder = "Хайх...",
  name = "q"
}: {
  placeholder?: string;
  name?: string;
}) {
  return (
    <label className="search-bar">
      <span className="sr-only">Хайлт</span>
      <input name={name} placeholder={placeholder} type="search" />
    </label>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <form className="filter-bar">{children}</form>;
}

export function FilterField({
  label,
  children
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="filter-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const label =
    status === "active"
      ? "Идэвхтэй"
      : status === "success"
        ? "Амжилттай"
        : status === "failed"
          ? "Алдаа"
          : status === "inactive"
            ? "Идэвхгүй"
            : status === "suspended"
              ? "Түр зогссон"
              : status;

  return <span className={`status-badge status-${status}`}>{label}</span>;
}

export function EmptyState({
  title,
  description,
  action
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon" />
      <h3>{title}</h3>
      <p>{description}</p>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

export function InlineActions({ children }: { children: ReactNode }) {
  return <div className="inline-actions">{children}</div>;
}

export function ActionButton({
  children,
  variant = "secondary",
  disabled = false,
  onClick
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button className={`action-button ${variant}`} disabled={disabled} onClick={onClick} type="button">
      {children}
    </button>
  );
}
