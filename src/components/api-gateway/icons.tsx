import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function IconBase({ children, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="18"
      viewBox="0 0 24 24"
      width="18"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {children}
    </svg>
  );
}

export function GaugeIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 14a8 8 0 1 1 16 0" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="m12 14 4-4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="M7 18h10" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </IconBase>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M16 19c0-2.2-1.8-4-4-4s-4 1.8-4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <circle cx="12" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M19 18c0-1.6-1-3-2.4-3.6M17 5.5a2.4 2.4 0 0 1 0 4.8M5 18c0-1.6 1-3 2.4-3.6M7 5.5a2.4 2.4 0 0 0 0 4.8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </IconBase>
  );
}

export function CreditIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect height="13" rx="3" stroke="currentColor" strokeWidth="1.8" width="18" x="3" y="6" />
      <path d="M3 10h18M8 15h3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </IconBase>
  );
}

export function ModelIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect height="7" rx="2" stroke="currentColor" strokeWidth="1.8" width="7" x="4" y="4" />
      <rect height="7" rx="2" stroke="currentColor" strokeWidth="1.8" width="7" x="13" y="13" />
      <path d="M11 7.5h2.5a3 3 0 0 1 3 3V13M13 16.5h-2.5a3 3 0 0 1-3-3V11" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </IconBase>
  );
}

export function LogIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M7 5h10M7 9h10M7 13h6M7 17h8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <rect height="18" rx="3" stroke="currentColor" strokeWidth="1.8" width="18" x="3" y="3" />
    </IconBase>
  );
}

export function ReportIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M5 19V5M5 19h16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <rect height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" width="4" x="8" y="11" />
      <rect height="11" rx="1.5" stroke="currentColor" strokeWidth="1.8" width="4" x="15" y="7" />
    </IconBase>
  );
}
