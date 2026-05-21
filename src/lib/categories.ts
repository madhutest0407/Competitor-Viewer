export const CATEGORIES = [
  "Scheduling",
  "AI / Assist",
  "Rooms & Resources",
  "Mobile",
  "Admin / Security",
  "Integrations",
  "Notifications",
  "Sharing / Permissions",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const STATUSES = [
  "Planned",
  "In development",
  "Rolling out",
  "Generally available",
  "Cancelled",
] as const;

export type Status = (typeof STATUSES)[number];

export function normalizeStatus(raw: string | null | undefined): Status {
  if (!raw) return "Planned";
  const s = raw.toLowerCase();
  if (s.includes("cancel")) return "Cancelled";
  if (s.includes("launch") || s.includes("general") || s.includes("ga") || s.includes("available"))
    return "Generally available";
  if (s.includes("rolling") || s.includes("preview") || s.includes("beta")) return "Rolling out";
  if (s.includes("development") || s.includes("progress")) return "In development";
  return "Planned";
}

export const STATUS_COLORS: Record<Status, string> = {
  Planned: "var(--status-planned)",
  "In development": "var(--status-development)",
  "Rolling out": "var(--status-rolling)",
  "Generally available": "var(--status-ga)",
  Cancelled: "var(--status-cancelled)",
};