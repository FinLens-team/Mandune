/** Browser-safe id helper (also works under Node 22+). */
export function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
  }
  return `${prefix}_${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}`;
}
