import { Link, NavLink, useNavigate } from "react-router-dom";
import { STATUS } from "@/lib/labels";

const TONES = {
  new: "bg-accent-soft text-accent",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  mute: "bg-hatch text-muted",
};

export function Chip({ tone = "mute", children }) {
  return <span className={`chip ${TONES[tone]}`}>{children}</span>;
}

export function StatusChip({ status }) {
  const s = STATUS[status] || { label: status, tone: "mute" };
  return <Chip tone={s.tone}>{s.label}</Chip>;
}

export function Screen({ title, back, action, children, tabs = true }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-full flex flex-col">
      <header className="sticky z-10 bg-bg/95 backdrop-blur px-4 pt-3 pb-2" style={{ top: "env(safe-area-inset-top, 0px)" }}>
        <div className="mx-auto max-w-xl flex items-center justify-between gap-3 min-h-[40px]">
          <div className="flex items-center gap-1 min-w-0">
            {back && (
              <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate(back))} className="btn-quiet -ml-3" aria-label="Back">
                ‹ Back
              </button>
            )}
            {title && <h1 className="text-2xl font-extrabold truncate">{title}</h1>}
          </div>
          {action}
        </div>
      </header>
      <main className={`flex-1 px-4 pb-6 ${tabs ? "pb-28" : ""}`}>
        <div className="mx-auto max-w-xl flex flex-col gap-3">{children}</div>
      </main>
      {tabs && <TabBar />}
    </div>
  );
}

const TABS = [
  ["/", "Today"],
  ["/requests", "Requests"],
  ["/calendar", "Calendar"],
  ["/earnings", "Earnings"],
];

export function TabBar() {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-20 bg-surface border-t border-line" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      <div className="mx-auto max-w-xl grid grid-cols-4">
        {TABS.map(([to, label]) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) => `py-3 text-center text-[13px] font-semibold ${isActive ? "text-accent" : "text-muted"}`}
          >
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="lbl">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <div className="w-8 h-8 border-4 border-line border-t-accent rounded-full animate-spin" />
    </div>
  );
}

export function ErrorNote({ children }) {
  if (!children) return null;
  return <p className="rounded-xl bg-warn-soft text-warn px-3 py-2 text-sm font-medium">{children}</p>;
}

export function Empty({ title, children }) {
  return (
    <div className="card text-center py-8 flex flex-col gap-1 items-center">
      <p className="font-display font-bold text-lg">{title}</p>
      <div className="text-sm text-muted max-w-xs">{children}</div>
    </div>
  );
}

export function RowLink({ to, children }) {
  return (
    <Link to={to} className="card block active:scale-[0.99] transition">
      {children}
    </Link>
  );
}
