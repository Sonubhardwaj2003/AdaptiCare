import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, describeAlarm, minutes, useApi, useAuth } from "./api.jsx";
import Chart from "./Chart.jsx";
import { Avatar, Button, Card, cx, DemoNote, ErrorBox, Field, H2, Head, Input, Muted, Note, OkBox, Pill, Select, Status, Table, Tabs } from "./ui.jsx";

const pct = (v) => (v == null ? "n/a" : `${(v * 100).toFixed(0)}%`);
const num = (v, d = 1) => (v == null ? "n/a" : v.toFixed(d));
const link = "font-medium text-brand hover:underline";
const Actions = ({ children }) => <div className="flex flex-wrap gap-1.5">{children}</div>;

export function Dashboard() {
  const p = useApi("/patients"), a = useApi("/alarms?status=new");
  const stat = (label, value, alert) => (
    <Card className="!p-3 sm:!p-5"><span className="block text-sm text-muted">{label}</span><strong className={cx("text-2xl sm:text-3xl", alert && "text-coral")}>{value}</strong></Card>
  );
  return (
    <>
      <Head title="Dashboard" sub="Overview of your patients and open alarms." />
      <Status loading={p.loading || a.loading} error={p.error || a.error}>
        {p.data && a.data && (
          <>
            <div className="grid grid-cols-3 gap-2.5 sm:gap-3.5">
              {stat("Patients", p.data.length)}
              {stat("Recordings", p.data.reduce((n, x) => n + x.recordings, 0))}
              {stat("Open alarms", a.data.length, a.data.length > 0)}
            </div>
            <H2>Latest open alarms</H2>
            {a.data.length === 0 ? <Muted>No open alarms.</Muted> : (
              <Table>
                <thead><tr><th>Patient</th><th>Recording</th><th>Model</th><th>Result</th></tr></thead>
                <tbody>{a.data.slice(0, 6).map((x) => {
                  const d = describeAlarm(x.time_s, x.recording.seizures[0]?.start, x.lead_s, x.recording.annotated);
                  return (
                    <tr key={x._id}><td><Link className={link} to={`/patients/${x.patient._id}`}>{x.patient.code}</Link></td>
                      <td><Link className={link} to={`/recordings/${x.recording._id}`}>{x.recording.edf}</Link></td><td>{x.duration} min</td>
                      <td><Pill tone={d.tone}>{d.text}</Pill></td></tr>
                  );
                })}</tbody>
              </Table>
            )}
          </>
        )}
      </Status>
    </>
  );
}

export function Patients() {
  const { data, loading, error } = useApi("/patients");
  return (
    <>
      <Head title="Patients" sub="Anonymised study subjects assigned to you." />
      <Status loading={loading} error={error}>
        {data && (data.length === 0 ? <Muted>No patients are assigned to you yet. An admin can assign patients from the patient page.</Muted> : (
          <Table>
            <thead><tr><th>Patient</th><th>Recordings</th><th>Open alarms</th></tr></thead>
            <tbody>{data.map((p) => <tr key={p._id}><td><Link className={link} to={`/patients/${p._id}`}>{p.code}</Link></td><td>{p.recordings}</td><td>{p.newAlarms}</td></tr>)}</tbody>
          </Table>
        ))}
      </Status>
    </>
  );
}

function Assign({ patient, reload }) {
  const { data } = useApi("/users");
  const [uid, setUid] = useState(""), [msg, setMsg] = useState("");
  const options = (data || []).filter((u) => u.role === "clinician" && u.active !== false && !patient.assignedTo.some((a) => a._id === u._id));
  const call = async (path, userId) => {
    try { await api(`/patients/${patient._id}/${path}`, { method: "POST", body: { userId } }); setUid(""); setMsg(""); reload(); }
    catch (e) { setMsg(e.message); }
  };
  return (
    <Card className="mb-4 flex flex-wrap items-end gap-3">
      <div className="flex w-full flex-wrap items-center gap-2" aria-label="Assigned clinicians">
        {patient.assignedTo.length === 0 && <span className="text-muted">No clinician assigned yet.</span>}
        {patient.assignedTo.map((u) => (
          <span key={u._id} className="inline-flex items-center gap-1.5 rounded-full bg-slate-200/70 py-0.5 pl-3 pr-1 text-sm">
            {u.name}
            <button type="button" aria-label={`Remove ${u.name}`} onClick={() => call("unassign", u._id)} className="grid h-6 w-6 place-items-center rounded-full bg-slate-300 leading-none hover:bg-slate-400/60">✕</button>
          </span>
        ))}
      </div>
      <Field label="Assign a clinician" className="min-w-[220px] flex-1 sm:max-w-sm">
        <Select value={uid} onChange={(e) => setUid(e.target.value)}>
          <option value="">Choose a clinician</option>
          {options.map((u) => <option key={u._id} value={u._id}>{u.name} ({u.email})</option>)}
        </Select>
      </Field>
      <Button variant="primary" disabled={!uid} onClick={() => call("assign", uid)}>Assign</Button>
      {msg && <div className="w-full"><ErrorBox>{msg}</ErrorBox></div>}
    </Card>
  );
}

export function PatientDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data, loading, error, reload } = useApi(`/patients/${id}`);
  return (
    <Status loading={loading} error={error}>
      {data && (
        <>
          <Head title={data.patient.code} sub={`Assigned to: ${data.patient.assignedTo.map((u) => u.name).join(", ") || "nobody yet"}`} />
          {user.role === "admin" && <Assign patient={data.patient} reload={reload} />}
          <Link to={`/upload?patient=${data.patient._id}`} className="mb-4 inline-flex min-h-[42px] items-center rounded-md border border-brand bg-brand px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-dark">Upload EDF files</Link>
          <Table>
            <thead><tr><th>Recording</th><th>Length</th><th>Seizures</th></tr></thead>
            <tbody>{data.recordings.map((r) => (
              <tr key={r._id}><td><Link className={link} to={`/recordings/${r._id}`}>{r.edf}</Link></td><td>{minutes(r.duration_s)}</td><td>{r.seizures.length}</td></tr>
            ))}</tbody>
          </Table>
        </>
      )}
    </Status>
  );
}

const swatches = {
  line: "h-[3px] bg-brand", dash: "h-0 border-t-2 border-dashed border-muted", bar: "w-[3px] bg-ink",
  sz: "bg-coral", sph: "bg-[#f5d9d2]", sop: "bg-[#cfe8ea]", uns: "border border-line bg-[#e6ebef]",
};
const Sw = ({ k, children }) => <li><i className={cx("mr-1.5 inline-block h-2.5 w-3.5 rounded-sm align-middle", swatches[k])} />{children}</li>;

export function Viewer() {
  const { id } = useParams();
  const { data: rec, loading, error } = useApi(`/recordings/${id}`);
  const [view, setView] = useState("30"), [pos, setPos] = useState(null), [play, setPlay] = useState(false), [speed, setSpeed] = useState(60);
  useEffect(() => {
    if (!play || !rec) return;
    const t = setInterval(() => setPos((p) => {
      const n = (p ?? 0) + speed / 10;
      if (n >= rec.duration_s) { setPlay(false); return null; }
      return n;
    }), 100);
    return () => clearInterval(t);
  }, [play, speed, rec]);
  // Real data may contain only some of the 15/30/60 min models, so only offer the ones that exist.
  const avail = rec ? ["15", "30", "60"].filter((m) => rec.predictions[m]) : [];
  const shown = view === "compare" ? (avail.length > 1 ? "compare" : avail[0]) : avail.includes(view) ? view : avail[0];
  const models = shown === "compare" ? avail : [shown];
  const onset = rec?.seizures[0]?.start;
  return (
    <Status loading={loading} error={error}>
      {rec && (
        <>
          <Head title={rec.edf} sub={`Patient ${rec.patient.code}. Predicted risk per 5 s window from the 15, 30 and 60 min models.`} />
          {rec.annotated === false && <p className="mb-3 inline-block rounded border border-[#e6cf7a] bg-[#fff3cd] px-2.5 py-1 text-sm">Uploaded recording without seizure annotation. Alarms are shown without an outcome.</p>}
          <div className="flex flex-wrap items-center justify-between gap-x-4">
            <Tabs>{[...avail, ...(avail.length > 1 ? ["compare"] : [])].map((v) => (
              <Button key={v} role="tab" aria-selected={shown === v} variant={shown === v ? "dark" : "default"} onClick={() => setView(v)}>{v === "compare" ? "Compare all" : `${v} min model`}</Button>
            ))}</Tabs>
            <div className="mb-3.5 flex items-center gap-2">
              <Button variant="primary" onClick={() => { if (play) setPlay(false); else { if (pos == null) setPos(0); setPlay(true); } }}>{play ? "Pause" : pos == null ? "Replay" : "Resume"}</Button>
              <Button onClick={() => { setPlay(false); setPos(null); }}>Reset</Button>
              <Select className="!w-auto" value={speed} onChange={(e) => setSpeed(+e.target.value)} aria-label="Replay speed">
                {[30, 60, 120, 300].map((s) => <option key={s} value={s}>{s}x</option>)}
              </Select>
              {pos != null && <span className="text-muted">{minutes(pos)}</span>}
            </div>
          </div>
          <div className={shown === "compare" ? "grid gap-3" : ""}>
            {models.map((m) => <Chart key={m} model={rec.predictions[m]} rec={rec} upTo={pos ?? Infinity} title={`${m} min model`} />)}
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-[18px] gap-y-1.5 text-[13.5px] text-muted">
            <Sw k="line">Risk</Sw><Sw k="dash">Threshold</Sw><Sw k="bar">Alarm</Sw><Sw k="sz">Seizure</Sw>
            <Sw k="sph">5 min warning delay</Sw><Sw k="sop">Scored window</Sw><Sw k="uns">Unscored zone</Sw>
          </ul>
          <Note>A single recording only illustrates the display. It says little about overall performance. See Statistics for the pooled results.</Note>
          <H2>Alarms in this recording</H2>
          <Table>
            <thead><tr><th>Model</th><th>Time</th><th>Result</th></tr></thead>
            <tbody>{models.flatMap((m) => rec.predictions[m].alarms_sec.map((t, i) => {
              const d = describeAlarm(t, onset, rec.predictions[m].alarm_leads_s?.[i], rec.annotated);
              return <tr key={m + t}><td>{m} min</td><td>{minutes(t)} into file</td><td><Pill tone={d.tone}>{d.text}</Pill></td></tr>;
            }))}</tbody>
          </Table>
        </>
      )}
    </Status>
  );
}

export function Alarms() {
  const [filter, setFilter] = useState("new");
  const { data, loading, error, reload } = useApi(`/alarms${filter === "all" ? "" : `?status=${filter}`}`);
  const [msg, setMsg] = useState("");
  const act = async (id, status) => {
    try { await api(`/alarms/${id}`, { method: "PATCH", body: { status } }); setMsg(""); reload(); } catch (e) { setMsg(e.message); }
  };
  return (
    <>
      <Head title="Alarms" sub="Review each alarm, then acknowledge or dismiss it." />
      <Tabs>{["new", "acknowledged", "dismissed", "all"].map((f) => <Button key={f} variant={filter === f ? "dark" : "default"} onClick={() => setFilter(f)}>{f[0].toUpperCase() + f.slice(1)}</Button>)}</Tabs>
      {msg && <ErrorBox>{msg}</ErrorBox>}
      <Status loading={loading} error={error}>
        {data && (data.length === 0 ? <Muted>No alarms here.</Muted> : (
          <>
            <div className="hidden sm:block">
              <Table>
                <thead><tr><th>Patient</th><th>Recording</th><th>Model</th><th>Result</th><th>Status</th><th></th></tr></thead>
                <tbody>{data.map((x) => {
                  const d = describeAlarm(x.time_s, x.recording.seizures[0]?.start, x.lead_s, x.recording.annotated);
                  return (
                    <tr key={x._id}>
                      <td>{x.patient.code}</td><td><Link className={link} to={`/recordings/${x.recording._id}`}>{x.recording.edf}</Link></td><td>{x.duration} min</td>
                      <td><Pill tone={d.tone}>{d.text}</Pill></td><td>{x.status}</td>
                      <td>{x.status === "new" && <Actions><Button small onClick={() => act(x._id, "acknowledged")}>Acknowledge</Button><Button small onClick={() => act(x._id, "dismissed")}>Dismiss</Button></Actions>}</td>
                    </tr>
                  );
                })}</tbody>
              </Table>
            </div>
            <div className="grid gap-3 sm:hidden">{data.map((x) => {
              const d = describeAlarm(x.time_s, x.recording.seizures[0]?.start, x.lead_s, x.recording.annotated);
              return (
                <Card key={x._id} className="grid gap-2 !p-4">
                  <div className="flex items-center justify-between gap-2"><strong>{x.patient.code}</strong><span className="text-sm text-muted">{x.duration} min model, {x.status}</span></div>
                  <Link className={link} to={`/recordings/${x.recording._id}`}>{x.recording.edf}</Link>
                  <div><Pill tone={d.tone} className="!whitespace-normal">{d.text}</Pill></div>
                  {x.status === "new" && <Actions><Button small onClick={() => act(x._id, "acknowledged")}>Acknowledge</Button><Button small onClick={() => act(x._id, "dismissed")}>Dismiss</Button></Actions>}
                </Card>
              );
            })}</div>
          </>
        ))}
      </Status>
    </>
  );
}

export function Results() {
  const { data, loading, error } = useApi("/results");
  return (
    <>
      <Head title="Results" sub="How the three label durations compare on the recordings you can access." />
      <Status loading={loading} error={error}>
        {data && (
          <>
            {/* <DemoNote demo={data.demo} /> */}
            <Muted>{data.recordings} recordings, {data.hours.toFixed(1)} hours.</Muted>
            <div className="mt-2.5" />
            <Table>
              <thead><tr><th>Label duration</th><th>Seizures</th><th>Detected</th><th>Sensitivity</th><th>Mean lead time</th><th>Interictal hours</th><th>False alarms / hour</th><th>Early alarms</th></tr></thead>
              <tbody>{Object.entries(data.perModel).map(([d, m]) => (
                <tr key={d}><td>{d} min</td><td>{m.seizures}</td><td>{m.detected}</td><td>{pct(m.sensitivity)}</td><td>{m.meanLeadMin == null ? "n/a" : `${num(m.meanLeadMin)} min`}</td><td>{num(m.interictalHours, 1)}</td><td>{num(m.falseAlarmsPerHour, 2)}</td><td>{m.earlyAlarms}</td></tr>
              ))}</tbody>
            </Table>
            <Note>A detected seizure has an alarm 5 to 35 min before onset. Alarms 35 to 65 min before onset are early and unscored. Any other alarm is a false alarm, and false alarms per hour use interictal hours only. These numbers are computed from the recordings imported into this app. The reference results from the ML team are on the Statistics page.</Note>
          </>
        )}
      </Status>
    </>
  );
}

function useUserActions(u, me, reload, setMsg) {
  const [pw, setPw] = useState(null);
  const self = u._id === me.id, off = u.active === false;
  const run = async (fn, ok) => { try { await fn(); setMsg(ok || ""); reload(); } catch (e) { setMsg(e.message); } };
  const patch = (body) => run(() => api(`/users/${u._id}`, { method: "PATCH", body }));
  const setPassword = () => run(() => api(`/users/${u._id}/password`, { method: "POST", body: { password: pw } }).then(() => setPw(null)), `Password updated for ${u.name}.`);
  return { pw, setPw, self, off, patch, setPassword };
}

const PasswordForm = ({ u, a }) => (
  <div className="flex flex-wrap items-center gap-2">
    <Input className="min-w-[220px] flex-1" type="password" placeholder="New password (8+ characters)" value={a.pw} onChange={(e) => a.setPw(e.target.value)} autoFocus aria-label={`New password for ${u.name}`} />
    <Button variant="primary" disabled={a.pw.length < 8} onClick={a.setPassword}>Set password</Button>
    <Button onClick={() => a.setPw(null)}>Cancel</Button>
  </div>
);

function UserRow({ u, me, reload, setMsg }) {
  const a = useUserActions(u, me, reload, setMsg);
  return (
    <>
      <tr>
        <td><div className="flex items-center gap-2.5"><Avatar user={u} size={30} /><span>{u.name}{a.self && <span className="text-muted"> (you)</span>}</span></div></td>
        <td>{u.email}</td>
        <td><Select className="!w-auto" aria-label={`Role for ${u.name}`} value={u.role} disabled={a.self} onChange={(e) => a.patch({ role: e.target.value })}><option value="clinician">Clinician</option><option value="admin">Admin</option></Select></td>
        <td><Pill tone={a.off ? "bad" : "good"}>{a.off ? "Disabled" : "Active"}</Pill></td>
        <td>
          <Actions>
            <Button small onClick={() => a.setPw(a.pw === null ? "" : null)}>Reset password</Button>
            {!a.self && <Button small onClick={() => a.patch({ active: a.off })}>{a.off ? "Enable" : "Disable"}</Button>}
          </Actions>
        </td>
      </tr>
      {a.pw !== null && <tr><td colSpan={5}><PasswordForm u={u} a={a} /></td></tr>}
    </>
  );
}

function UserCard({ u, me, reload, setMsg }) {
  const a = useUserActions(u, me, reload, setMsg);
  return (
    <Card className="grid gap-3 !p-4">
      <div className="flex items-center gap-3">
        <Avatar user={u} size={40} />
        <div className="min-w-0 flex-1"><p className="font-semibold">{u.name}{a.self && <span className="font-normal text-muted"> (you)</span>}</p><p className="truncate text-sm text-muted">{u.email}</p></div>
        <Pill tone={a.off ? "bad" : "good"}>{a.off ? "Disabled" : "Active"}</Pill>
      </div>
      <Field label="Role"><Select aria-label={`Role for ${u.name}`} value={u.role} disabled={a.self} onChange={(e) => a.patch({ role: e.target.value })}><option value="clinician">Clinician</option><option value="admin">Admin</option></Select></Field>
      <Actions>
        <Button small onClick={() => a.setPw(a.pw === null ? "" : null)}>Reset password</Button>
        {!a.self && <Button small onClick={() => a.patch({ active: a.off })}>{a.off ? "Enable" : "Disable"}</Button>}
      </Actions>
      {a.pw !== null && <PasswordForm u={u} a={a} />}
    </Card>
  );
}

export function Users() {
  const { user: me } = useAuth();
  const { data, loading, error, reload } = useApi("/users");
  const [f, setF] = useState({ name: "", email: "", password: "", role: "clinician" }), [msg, setMsg] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const create = async (e) => {
    e.preventDefault();
    try { await api("/users", { method: "POST", body: f }); setF({ name: "", email: "", password: "", role: "clinician" }); setMsg("User created."); reload(); } catch (x) { setMsg(x.message); }
  };
  return (
    <>
      <Head title="Users" sub="Only admins can create and manage accounts. Share the email and password with the user, then assign patients from the patient page." />
      <Card className="mb-4">
        <form onSubmit={create} className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Field label="Name"><Input value={f.name} onChange={set("name")} required /></Field>
          <Field label="Email"><Input type="email" value={f.email} onChange={set("email")} required /></Field>
          <Field label="Password (8+ characters)"><Input type="password" value={f.password} onChange={set("password")} minLength={8} required /></Field>
          <Field label="Role"><Select value={f.role} onChange={set("role")}><option value="clinician">Clinician</option><option value="admin">Admin</option></Select></Field>
          <Button type="submit" variant="primary">Create user</Button>
        </form>
      </Card>
      {msg && <p role="status" className="mb-3 text-sm text-muted">{msg}</p>}
      <Status loading={loading} error={error}>
        {data && (
          <>
            <div className="hidden sm:block">
              <Table>
                <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead>
                <tbody>{data.map((u) => <UserRow key={u._id} u={u} me={me} reload={reload} setMsg={setMsg} />)}</tbody>
              </Table>
            </div>
            <div className="grid gap-3 sm:hidden">{data.map((u) => <UserCard key={u._id} u={u} me={me} reload={reload} setMsg={setMsg} />)}</div>
          </>
        )}
      </Status>
    </>
  );
}

function Frozen() {
  const { data, loading, error } = useApi("/frozen");
  const D = ["15", "30", "60"], f4 = (v) => (v == null ? "n/a" : v.toFixed(4));
  return (
    <Status loading={loading} error={error}>
      {data && (() => {
        const subs = data.testSubjects;
        const hours = subs.reduce((a, c) => a + data.interictalHours[c], 0);
        const pooled = (m) => {
          const e = subs.map((c) => data.events[m][c]);
          return { hits: e.reduce((a, x) => a + x.hits, 0), seizures: e.reduce((a, x) => a + x.seizures, 0), fa: e.reduce((a, x) => a + x.falseAlarms, 0) };
        };
        return (
          <>
            <H2>{data.title} (seed {data.seed})</H2>
            <Note>Reference results from the ML team on the test subjects of this fold: {subs.join(", ")}. Test target: {data.target}. Thresholds were {data.thresholdRule}.</Note>

            <h3 className="mb-2 mt-4 font-semibold">Seizure detection (events)</h3>
            <Table>
              <thead><tr><th>Model</th>{subs.map((c) => <th key={c}>{c}</th>)}<th>All test subjects</th></tr></thead>
              <tbody>{D.map((m) => {
                const t = pooled(m);
                return (
                  <tr key={m}><td>{m} min</td>
                    {subs.map((c) => { const e = data.events[m][c]; return <td key={c}>{e.hits}/{e.seizures} detected, {e.falseAlarms} false alarms</td>; })}
                    <td className="font-semibold">{t.hits}/{t.seizures} detected, {(t.fa / hours).toFixed(2)} false alarms per hour</td></tr>
                );
              })}</tbody>
            </Table>
            <Note>Interictal hours: {subs.map((c) => `${c} ${data.interictalHours[c].toFixed(1)} h`).join(", ")}.</Note>

            <h3 className="mb-2 mt-4 font-semibold">Window PR-AUC</h3>
            <Table>
              <thead><tr><th>Subject</th><th>Prevalence</th>{D.map((m) => <th key={m}>{m} min model</th>)}</tr></thead>
              <tbody>{subs.map((c) => (
                <tr key={c}><td>{c}</td><td>{f4(data.prevalence[c])}</td>
                  {D.map((m) => { const v = data.windowPrAuc[m][c]; return <td key={m} className={cx("tabular-nums", v < data.prevalence[c] && "text-coral")}>{f4(v)}{v < data.prevalence[c] && " (below prevalence)"}</td>; })}</tr>
              ))}</tbody>
            </Table>

            <ul className="mt-3 max-w-[90ch] list-disc space-y-1.5 pl-5 text-sm text-muted">
              {data.notes.map((n) => <li key={n}>{n}</li>)}
            </ul>
          </>
        );
      })()}
    </Status>
  );
}

export function Stats() {
  const { data, loading, error } = useApi("/stats");
  const D = ["15", "30", "60"], f2 = (v) => (v == null ? "n/a" : v.toFixed(2));
  const shade = (v) => (v == null ? undefined : { background: `rgba(11,122,132,${Math.max(0.05, v) * 0.45})` });
  return (
    <>
      <Head title="Statistics" sub="Reference results from the ML team, and the same analysis computed from the recordings imported into this app." />
      <Frozen />
      <H2>Computed from the recordings in this app</H2>
      <Status loading={loading} error={error}>
        {data && (
          <>
            <DemoNote demo={data.demo} />
            {data.subjects.length === 0 ? <Muted>No subjects with seizures are available to you yet.</Muted> : (
              <>
                <H2>Which label length works best?</H2>
                <Note>PR-AUC per subject on the fixed test target (30 min window, 5 min before onset). Higher is better. The random baseline equals the share of positive windows.</Note>
                <Table>
                  <thead><tr><th>Subject</th><th>Seizures</th><th>Random baseline</th><th>15 min model</th><th>30 min model</th><th>60 min model</th></tr></thead>
                  <tbody>{data.subjects.map((s) => (
                    <tr key={s.code}><td>{s.code}</td><td>{s.seizures}</td><td>{f2(s.baseline)}</td>{D.map((m) => <td key={m} className="tabular-nums" style={shade(s.pr[m])}>{f2(s.pr[m])}</td>)}</tr>
                  ))}</tbody>
                </Table>

                <H2>Statistical test</H2>
                {data.friedman ? (
                  <Note>Friedman test across the three models on {data.friedman.n} subjects with 2 or more seizures: Q = {data.friedman.Q.toFixed(2)}, p = {data.friedman.p.toFixed(3)}. Mean ranks: 15 min {data.friedman.meanRanks[0].toFixed(2)}, 30 min {data.friedman.meanRanks[1].toFixed(2)}, 60 min {data.friedman.meanRanks[2].toFixed(2)}. With few subjects this is exploratory, and the p-value is approximate.</Note>
                ) : <Note>Not enough subjects with 2 or more seizures for a formal test (needs at least 2 such subjects).</Note>}

                <H2>Trained on vs scored against</H2>
                <Note>Mean PR-AUC over subjects. Each row is a model, each column a test target length. The diagonal is a model scored on its own label length.</Note>
                <Table>
                  <thead><tr><th>Model trained on</th>{D.map((L) => <th key={L}>Scored on {L} min target</th>)}</tr></thead>
                  <tbody>{D.map((m) => <tr key={m}><td>{m} min</td>{D.map((L) => <td key={L} className="tabular-nums" style={shade(data.matrix[m][L])}>{f2(data.matrix[m][L])}</td>)}</tr>)}
                    <tr><td>Random baseline</td>{D.map((L) => <td key={L}>{f2(data.baseline[L])}</td>)}</tr></tbody>
                </Table>
                <Note>Windows from 65 minutes before onset until 2 hours after the seizure are unscored, except the positives of the chosen target. Subjects are listed even with one seizure, but only subjects with 2 or more enter the test.</Note>
              </>
            )}
          </>
        )}
      </Status>
    </>
  );
}

export function About() {
  return (
    <>
      <Head title="About AdaptiCare" />
      <Card className="max-w-[70ch] space-y-3.5">
        <p>AdaptiCare is a dashboard for studying how the length of the "pre-seizure" training label (15, 30 or 60 minutes) changes EEG seizure prediction that works on patients the model has never seen. It uses the public CHB-MIT dataset.</p>
        <p>Clinicians review recordings, replay model output over time, and handle alarms. The Results page compares the three label durations side by side.</p>
        <p className="text-muted">AdaptiCare is a research prototype built for a final-year project. It is not a clinical or diagnostic tool.</p>
      </Card>
    </>
  );
}
