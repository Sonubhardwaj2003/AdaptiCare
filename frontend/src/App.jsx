import { useEffect, useState } from "react";
import { Link, NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./api.jsx";
import { Alarms, About, Dashboard, PatientDetail, Patients, Results, Stats, Users, Viewer } from "./pages.jsx";
import Profile from "./Profile.jsx";
import Upload from "./Upload.jsx";
import { Avatar, Button, cx, ErrorBox, Field, Input, Logo, wrap } from "./ui.jsx";

// Decorative EEG-style traces for the sign-in side panel.
const Waves = () => (
  <svg className="w-full max-w-[460px]" viewBox="0 0 460 170" fill="none" aria-hidden="true">
    {[0, 1, 2].map((i) => (
      <path key={i} transform={`translate(0 ${i * 52})`} stroke={["#3cc4cf", "#7fd8df", "#2a8f98"][i]} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        d="M0 25c18 0 18-12 36-12s18 20 36 20 18-26 36-26 18 30 36 30 18-10 36-10 14 6 26 6 14-22 28-22 18 16 36 16 22-10 54-10" />
    ))}
  </svg>
);

function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr("");
    try { await login(email, password); } catch (x) { setErr(x.message); setBusy(false); }
  };
  return (
    <div className="grid min-h-screen nav:grid-cols-2">
      <section className="hidden flex-col justify-center gap-5 bg-navy p-12 text-white nav:flex">
        <Logo size={44} />
        <h2 className="max-w-[18ch] text-[1.9rem] font-semibold leading-tight tracking-tight">Review seizure-prediction results with confidence.</h2>
        <p className="max-w-[42ch] text-slate-300">Replay recordings, compare 15, 30 and 60 minute models, and handle alarms for your assigned patients.</p>
        <Waves />
      </section>
      <section className="grid place-items-center px-4 py-7">
        <div className="w-full max-w-[400px]">
          <div className="flex items-center gap-2.5 text-[1.15rem] font-bold"><Logo /> AdaptiCare</div>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1 text-muted">Welcome back. Enter your details to continue.</p>
          <form onSubmit={submit} className="mt-4 grid gap-3.5">
            <Field label="Email"><Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></Field>
            <Field label="Password"><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
            {err && <ErrorBox>{err}</ErrorBox>}
            <Button type="submit" variant="primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
            <p className="text-center text-sm text-muted">Accounts are created by an admin. Ask your admin if you need access.</p>
          </form>
        </div>
      </section>
    </div>
  );
}

const navLink = ({ isActive }) => cx(
  "relative flex h-11 items-center rounded-md px-3.5 font-medium transition-colors nav:h-[60px] nav:rounded-none",
  isActive
    ? "bg-navy-2 text-white nav:bg-transparent nav:after:absolute nav:after:inset-x-2.5 nav:after:bottom-0 nav:after:h-[3px] nav:after:rounded-t-[3px] nav:after:bg-brand-light nav:after:content-['']"
    : "text-slate-300 hover:bg-navy-2 hover:text-white",
);

function Navbar({ user }) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  const links = [["/", "Dashboard"], ["/patients", "Patients"], ["/upload", "Upload"], ["/alarms", "Alarms"], ["/results", "Results"], ["/stats", "Statistics"], ...(user.role === "admin" ? [["/users", "Users"]] : [])];
  return (
    <header className="sticky top-0 z-20 bg-navy text-white">
      {/* Desktop: 3 columns (logo | links in the middle | profile). Mobile: logo + menu button. */}
      <div className={cx(wrap, "relative flex h-[60px] items-center gap-5 nav:grid nav:grid-cols-[1fr_auto_1fr]")}>
        <Link to="/" className="flex items-center gap-2.5 whitespace-nowrap text-[1.15rem] font-bold nav:justify-self-start"><Logo /> AdaptiCare</Link>
        <button type="button" aria-label="Toggle menu" aria-expanded={open} aria-controls="main-menu" onClick={() => setOpen(!open)}
          className="ml-auto grid h-[42px] w-[42px] place-items-center rounded-md border border-navy-3 bg-navy-2 text-xl leading-none nav:hidden">{open ? "✕" : "☰"}</button>
        <div id="main-menu" className={cx(
          "absolute inset-x-0 top-[60px] flex-col gap-2 border-t border-navy-2 bg-navy px-4 pb-4 pt-2 shadow-xl sm:px-6",
          "nav:contents",
          open ? "flex" : "hidden")}>
          <nav aria-label="Main" className="flex flex-col nav:flex-row nav:justify-self-center">
            {links.map(([to, label]) => <NavLink key={to} to={to} end={to === "/"} className={navLink}>{label}</NavLink>)}
          </nav>
          <NavLink to="/profile" aria-label="My profile" className={({ isActive }) => cx("flex items-center gap-2.5 rounded-md border-t border-navy-2 px-2 py-2 pt-3 hover:bg-navy-2 nav:justify-self-end nav:border-0 nav:py-1.5", isActive && "bg-navy-2")}>
            <Avatar user={user} size={34} />
            <span className="grid text-[14px] leading-tight"><strong className="font-semibold">{user.name}</strong><span className="text-xs capitalize text-slate-400">{user.role}</span></span>
          </NavLink>
        </div>
      </div>
    </header>
  );
}

function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-auto bg-navy text-slate-300">
      {/* <div className={cx(wrap, "py-10")}>
        <div className="flex items-center gap-2.5 text-lg font-bold text-white"><Logo size={28} /> AdaptiCare</div>
        <div className="mt-4 max-w-4xl space-y-3 text-sm leading-relaxed text-slate-400">
          <p>
            AdaptiCare is a research dashboard for studying how the length of the preictal training label (15, 30 or 60 minutes) affects patient-independent EEG seizure prediction. It is built on the public CHB-MIT Scalp EEG database and evaluates every model on patients it has never seen during training.
          </p>
          <p>
            Clinicians can review EEG recordings, replay the predicted seizure risk over time, and acknowledge or dismiss alarms for their assigned patients. The Results and Statistics pages compare the three label durations side by side, using sensitivity, false alarms per hour, lead time, PR-AUC and a Friedman test.
          </p>
          <p>
            AdaptiCare was developed as a final-year B.Tech major project. It is a research prototype and is not intended for clinical or diagnostic use.
          </p>
        </div>
      </div> */}
      <div className="border-t border-navy-3/60 text-center py-3 text-[16px] text-slate-400 sm:m-0 sm:py-3">
        {/* <div className={cx(wrap, "flex flex-col gap-1 py-4 text-[13px] text-slate-400 sm:flex-row sm:items-center sm:justify-between")}> */}
          <span>© {year} AdaptiCare. All rights reserved.</span>
          {/* <span>Research prototype. Not a clinical or diagnostic tool.</span> */}
        {/* </div> */}
      </div>
    </footer>
  );
}

export default function App() {
  const { user, ready } = useAuth();
  if (!ready) return <p className="p-10 text-center text-muted">Loading…</p>;
  if (!user) return <Login />;
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar user={user} />
      <main className={cx(wrap, "flex-1 pb-12 pt-6 sm:pt-7")}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/patients" element={<Patients />} />
          <Route path="/patients/:id" element={<PatientDetail />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/recordings/:id" element={<Viewer />} />
          <Route path="/alarms" element={<Alarms />} />
          <Route path="/results" element={<Results />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/users" element={user.role === "admin" ? <Users /> : <Navigate to="/" />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/about" element={<About />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}
