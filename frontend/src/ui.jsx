// Small shared building blocks, styled only with Tailwind utilities.
export const cx = (...a) => a.filter(Boolean).join(" ");

// One container width for navbar, page and footer, so their left and right edges line up.
export const wrap = "mx-auto w-full max-w-[1720px] px-4 sm:px-6 lg:px-8";

export const Logo = ({ size = 30 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
    <rect width="64" height="64" rx="14" fill="#0b7a84" />
    <path d="M6 34h12l5-14 8 28 7-22 4 8h16" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function Avatar({ user, size = 32 }) {
  const box = { width: size, height: size, fontSize: Math.round(size * 0.42) };
  return user.avatar
    ? <img src={user.avatar} alt="" style={box} className="shrink-0 rounded-full object-cover" />
    : <span style={box} aria-hidden="true" className="grid shrink-0 place-items-center rounded-full bg-brand font-bold text-white">{(user.name || "?")[0].toUpperCase()}</span>;
}

const btnBase = "inline-flex min-h-[42px] items-center justify-center gap-2 rounded-md border px-3.5 py-2 text-sm font-medium transition disabled:cursor-default disabled:opacity-60";
const btnVariants = {
  default: "border-line bg-white text-ink hover:bg-slate-50",
  primary: "border-brand bg-brand text-white hover:bg-brand-dark",
  dark: "border-navy bg-navy text-white",
  danger: "border-coral bg-white text-coral hover:bg-red-50",
};
export function Button({ variant = "default", small, className, type = "button", ...p }) {
  return <button type={type} className={cx(btnBase, btnVariants[variant], small && "!min-h-0 !px-2.5 !py-1 text-[13px]", className)} {...p} />;
}

export const inputCls = "min-h-[42px] w-full rounded-md border border-line bg-white px-3 py-2 text-[15px] font-normal text-ink placeholder:text-slate-400 disabled:bg-slate-100 disabled:text-slate-500";
export const Input = ({ className, ...p }) => <input className={cx(inputCls, className)} {...p} />;
export const Select = ({ className, ...p }) => <select className={cx(inputCls, "cursor-pointer", className)} {...p} />;
export const Field = ({ label, children, className }) => <label className={cx("grid gap-1 text-sm font-semibold", className)}>{label}{children}</label>;

export const Card = ({ className, ...p }) => <div className={cx("rounded-lg border border-line bg-white p-4 sm:p-5", className)} {...p} />;

export const Table = ({ children }) => (
  <div className="overflow-x-auto rounded-lg border border-line bg-white">
    <table className="w-full border-collapse text-[15px] max-sm:[&_td]:whitespace-nowrap max-sm:[&_th]:whitespace-nowrap [&_td]:border-b [&_td]:border-line [&_td]:px-3 [&_td]:py-2.5 [&_td]:align-middle [&_th]:border-b [&_th]:border-line [&_th]:bg-slate-100 [&_th]:px-3 [&_th]:py-2.5 [&_th]:text-left [&_th]:font-semibold [&_tr:last-child_td]:border-b-0">
      {children}
    </table>
  </div>
);

const tones = { default: "bg-slate-200/70 text-ink", good: "bg-[#dff1e8] text-good", warn: "bg-[#fbecd2] text-warn", bad: "bg-[#fbe1dc] text-coral" };
export const Pill = ({ tone = "default", className, children }) => <span className={cx("inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13px]", tones[tone] || tones.default, className)}>{children}</span>;

export const Head = ({ title, sub }) => (
  <header className="mb-5">
    <h1 className="text-[1.35rem] font-semibold tracking-tight sm:text-2xl">{title}</h1>
    {sub && <p className="mt-1 max-w-3xl text-muted">{sub}</p>}
  </header>
);
export const H2 = ({ children }) => <h2 className="mb-2.5 mt-7 text-[1.05rem] font-semibold">{children}</h2>;
export const Muted = ({ children }) => <p className="text-muted">{children}</p>;
export const Note = ({ children, ...p }) => <p className="my-2 max-w-[80ch] text-sm text-muted" {...p}>{children}</p>;
export const ErrorBox = ({ children }) => <p role="alert" className="rounded-md border border-coral bg-[#fbe1dc] px-3 py-2.5 text-sm">{children}</p>;
export const OkBox = ({ children }) => <p role="status" className="rounded-md border border-good/40 bg-[#e3f4ea] px-3 py-2.5 text-sm text-good">{children}</p>;
export const DemoNote = ({ demo }) => demo && <p className="mb-2.5 inline-block rounded border border-[#e6cf7a] bg-[#fff3cd] px-2.5 py-1 text-sm">Includes demo data. These numbers are not real model results.</p>;
export const Status = ({ loading, error, children }) => (loading ? <Muted>Loading…</Muted> : error ? <ErrorBox>{error}</ErrorBox> : children);
export const Tabs = ({ children }) => <div className="mb-3.5 flex flex-wrap gap-2">{children}</div>;
