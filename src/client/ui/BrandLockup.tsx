import mandongLogo from "../assets/mandong-logo.webp";

export interface BrandLockupProps {
  compact?: boolean;
  className?: string;
}

export function BrandLockup({ compact = false, className }: BrandLockupProps) {
  return (
    <span className={["brand-lockup", compact ? "brand-lockup--compact" : "", className].filter(Boolean).join(" ")}>
      <img alt="满懂 Mandong" decoding="async" height="317" src={mandongLogo} width="1200" />
    </span>
  );
}
