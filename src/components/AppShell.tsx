import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { useState } from "react";
import {
  Calendar,
  LayoutDashboard,
  GitCompare,
  Activity,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { useTheme, type Theme } from "@/lib/theme";

const NAV = [
  { to: "/", label: "Timeline", icon: LayoutDashboard },
  { to: "/compare", label: "Compare", icon: GitCompare },
  { to: "/sources", label: "Sources", icon: Activity },
] as const;

export function AppShell() {
  const loc = useLocation();
  const { theme, resolved, setTheme } = useTheme();

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex items-center gap-2 px-4 py-4">
          <Calendar className="h-5 w-5 text-primary" />
          <span className="text-sm tracking-tight font-mono font-bold">PM Radar</span>
        </div>
        <nav className="flex-1 space-y-0.5 px-2">
          {NAV.map((n) => {
            const Icon = n.icon;
            const active = loc.pathname === n.to;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-2 border-t border-sidebar-border p-3 text-xs">
          <div className="flex items-center gap-1 rounded-md border border-sidebar-border p-0.5">
            {(
              [
                { v: "light", Icon: Sun, label: "Light" },
                { v: "dark", Icon: Moon, label: "Dark" },
                { v: "system", Icon: Monitor, label: "System" },
              ] as { v: Theme; Icon: typeof Sun; label: string }[]
            ).map(({ v, Icon, label }) => (
              <button
                key={v}
                onClick={() => setTheme(v)}
                title={label}
                className={`flex flex-1 items-center justify-center rounded py-1 transition-colors ${
                  theme === v
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/60 hover:text-sidebar-accent-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden">
        <Outlet />
      </main>
      <Toaster theme={resolved} position="bottom-right" />
    </div>
  );
}