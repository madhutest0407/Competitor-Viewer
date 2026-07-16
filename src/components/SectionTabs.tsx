import { SECTIONS, useActiveSection } from "@/lib/products";

export function SectionTabs() {
  const { section, setSection } = useActiveSection();
  return (
    <div className="flex items-center gap-1 border-b border-border bg-background/40 px-6 py-2">
      {SECTIONS.map((s) => {
        const active = s.id === section;
        return (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}