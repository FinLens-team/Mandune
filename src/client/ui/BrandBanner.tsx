import mandongLogo from "../assets/mandong-logo.webp";

export interface BrandBannerProps {
  className?: string;
}

export function BrandBanner({ className }: BrandBannerProps) {
  return (
    <div
      aria-label="满懂，每日持仓复盘"
      className={["brand-banner", className].filter(Boolean).join(" ")}
      role="banner"
    >
      <div className="brand-banner__inner">
        <img alt="满懂 Mandong" decoding="async" height="317" src={mandongLogo} width="1200" />
        <span>每日持仓复盘</span>
      </div>
    </div>
  );
}
