import type { ChartPoint, HeatmapCell, LeaderRow } from "@/server/api-gateway/adminData";
import { formatNumber } from "@/server/api-gateway/adminData";

function maxValue(points: ChartPoint[]) {
  return Math.max(1, ...points.map((point) => point.value));
}

export function UsageChart({ title, points }: { title: string; points: ChartPoint[] }) {
  const max = maxValue(points);
  const path = points
    .map((point, index) => {
      const x = points.length <= 1 ? 0 : (index / (points.length - 1)) * 100;
      const y = 100 - (point.value / max) * 84 - 8;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <div className="chart-frame" role="img" aria-label={title}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        <path d={`${path || "M 0 92"} L 100 100 L 0 100 Z`} className="chart-area" />
        <path d={path || "M 0 92"} className="chart-line" />
      </svg>
      <div className="chart-axis">
        {points.slice(0, 6).map((point) => (
          <span key={point.label}>{point.label}</span>
        ))}
      </div>
    </div>
  );
}

export function RevenueChart({ points }: { points: ChartPoint[] }) {
  const max = maxValue(points);
  return (
    <div className="bar-chart" role="img" aria-label="Орлогын график">
      {points.map((point) => (
        <div className="bar-item" key={point.label}>
          <span className="bar-fill revenue" style={{ height: `${Math.max(8, (point.value / max) * 100)}%` }} />
          <span className="bar-label">{point.label}</span>
        </div>
      ))}
    </div>
  );
}

export function ModelUsageChart({ points }: { points: ChartPoint[] }) {
  const max = maxValue(points);
  return (
    <div className="horizontal-bars">
      {points.length === 0 ? (
        <p className="empty-text">Мэдээлэл хараахан алга.</p>
      ) : (
        points.map((point) => (
          <div className="hbar-row" key={point.label}>
            <span>{point.label}</span>
            <div className="hbar-track">
              <span style={{ width: `${Math.max(6, (point.value / max) * 100)}%` }} />
            </div>
            <strong>{formatNumber(point.value)}</strong>
          </div>
        ))
      )}
    </div>
  );
}

export function UsageHeatmap({ cells }: { cells: HeatmapCell[] }) {
  const max = Math.max(1, ...cells.map((cell) => cell.value));
  return (
    <div className="heatmap" role="img" aria-label="Хэрэглээний heatmap">
      {cells.map((cell) => (
        <span
          className="heat-cell"
          key={`${cell.day}-${cell.hour}`}
          style={{ opacity: 0.22 + (cell.value / max) * 0.78 }}
          title={`${cell.day} ${cell.hour}:00 - ${cell.value}`}
        >
          <small>{cell.day}</small>
        </span>
      ))}
    </div>
  );
}

function LeaderWidget({ title, rows }: { title: string; rows: LeaderRow[] }) {
  return (
    <div className="leader-widget">
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <p className="empty-text">Одоогоор мэдээлэл алга.</p>
      ) : (
        <ol>
          {rows.map((row) => (
            <li key={row.name}>
              <span>{row.name}</span>
              <strong>{formatNumber(row.value)}</strong>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function TopUsersWidget({ rows }: { rows: LeaderRow[] }) {
  return <LeaderWidget title="Топ хэрэглэгчид" rows={rows} />;
}

export function TopModelsWidget({ rows }: { rows: LeaderRow[] }) {
  return <LeaderWidget title="Топ моделиуд" rows={rows} />;
}
