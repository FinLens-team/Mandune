/**
 * Framework-neutral shared contracts placeholder.
 * Business analysis schemas belong to later tickets; keep this free of UI and provider imports.
 */

export const SERVICE_NAME = "mandong" as const;

export interface HealthResponse {
  status: "ok";
  service: typeof SERVICE_NAME;
  version: string;
  uptime_seconds: number;
}
