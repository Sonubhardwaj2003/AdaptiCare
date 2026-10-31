import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, uploadFiles, useApi } from "./api.jsx";
import { Button, Card, cx, ErrorBox, Field, H2, Head, Input, Note, OkBox, Pill, Select, Table } from "./ui.jsx";

const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
const tone = { queued: "default", processing: "warn", done: "good", failed: "bad" };
const label = { queued: "Waiting", processing: "Processing", done: "Done", failed: "Failed" };
const busy = (u) => u.status === "queued" || u.status === "processing";

export default function Upload() {
  const [params] = useSearchParams();
  const patients = useApi("/patients");
  const service = useApi("/uploads/status");
  const [mode, setMode] = useState("existing");
  const [patientId, setPatientId] = useState(params.get("patient") || "");
  const [code, setCode] = useState("");
  const [files, setFiles] = useState([]);
  const [progress, setProgress] = useState(null);
  const [msg, setMsg] = useState(null);
  const [target, setTarget] = useState(null); // patient whose uploads are listed: { _id, code }
  const [list, setList] = useState([]);
  const [drag, setDrag] = useState(false);
  const input = useRef(null);

  const mine = patients.data || [];
  const offline = service.data?.mlService === "offline";
  const maxMb = service.data?.maxMb || 500;

  // With no assigned patient, the only choice is a new one.
  useEffect(() => { if (patients.data && patients.data.length === 0) setMode("new"); }, [patients.data]);

  // Showing the history of the chosen patient.
  useEffect(() => {
    if (mode !== "existing" || !patientId) return;
    const p = mine.find((x) => x._id === patientId);
    if (p) setTarget({ _id: p._id, code: p.code });
  }, [mode, patientId, patients.data]);

  const load = async (id) => { try { setList(await api(`/uploads?patient=${id}`)); } catch (e) { setMsg({ text: e.message }); } };
  useEffect(() => { if (target) load(target._id); }, [target?._id]);
  // While something is processing, check again every 3 seconds.
  useEffect(() => {
    if (!target || !list.some(busy)) return;
    const t = setInterval(() => load(target._id), 3000);
    return () => clearInterval(t);
  }, [target?._id, list]);

  const addFiles = (picked) => {
    const edf = [...picked].filter((f) => /\.edf$/i.test(f.name));
    if (edf.length < picked.length) setMsg({ text: "Only .edf files can be added. Other files were skipped." });
    setFiles((cur) => [...cur, ...edf.filter((f) => !cur.some((c) => c.name === f.name && c.size === f.size))].slice(0, 20));
  };

  const ready = files.length > 0 && !offline && progress === null && (mode === "existing" ? !!patientId : code.trim().length >= 2);

  const submit = async () => {
    setMsg(null); setProgress(0);
    try {
      const qs = mode === "existing" ? `patientId=${patientId}` : `newPatientCode=${encodeURIComponent(code.trim())}`;
      const res = await uploadFiles(`/uploads?${qs}`, files, setProgress);
      setFiles([]);
      setTarget(res.patient);
      setList(res.uploads);
      if (mode === "new") { setMode("existing"); setPatientId(res.patient._id); setCode(""); patients.reload(); }
      setMsg({ ok: true, text: `${res.uploads.length} file(s) received. They are processed one after the other.` });
    } catch (e) { setMsg({ text: e.message }); }
    setProgress(null);
  };

  return (
    <>
      <Head title="Upload EEG recordings" sub="Upload EDF files for one of your patients, or for a new patient. Each file is scored by the three models and appears under the patient." />

      {offline && <div className="mb-4"><ErrorBox>The model service is offline, so files cannot be processed right now. Start it (see ml/README.md, section "Upload service") and reload this page.</ErrorBox></div>}

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card className="grid gap-4">
          <h2 className="text-[1.05rem] font-semibold">1. Patient</h2>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Patient">
            <Button variant={mode === "existing" ? "dark" : "default"} disabled={mine.length === 0} onClick={() => setMode("existing")}>Existing patient</Button>
            <Button variant={mode === "new" ? "dark" : "default"} onClick={() => setMode("new")}>New patient</Button>
          </div>
          {mode === "existing" ? (
            <Field label="Patient">
              <Select value={patientId} onChange={(e) => setPatientId(e.target.value)}>
                <option value="">Choose a patient</option>
                {mine.map((p) => <option key={p._id} value={p._id}>{p.code}</option>)}
              </Select>
            </Field>
          ) : (
            <Field label="New patient code">
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="for example PT-0001" maxLength={30} />
              <span className="text-xs font-normal text-muted">2 to 30 letters, digits, - or _. Use an anonymous code, never a name. You are assigned to the new patient automatically.</span>
            </Field>
          )}
          <Note>You can only upload for patients assigned to you.</Note>
        </Card>

        <Card className="grid gap-4">
          <h2 className="text-[1.05rem] font-semibold">2. EDF files</h2>
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
            className={cx("grid place-items-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center", drag ? "border-brand bg-[#e6f4f5]" : "border-line bg-slate-50")}
          >
            <p className="text-sm text-muted">Drop .edf files here</p>
            <Button onClick={() => input.current.click()}>Choose files</Button>
            <input ref={input} type="file" accept=".edf" multiple className="sr-only" aria-label="Choose EDF files" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          </div>
          {files.length > 0 && (
            <ul className="grid gap-1.5 text-sm">
              {files.map((f) => (
                <li key={f.name + f.size} className="flex items-center justify-between gap-2 rounded-md border border-line px-3 py-1.5">
                  <span className="min-w-0 flex-1 truncate">{f.name} <span className="text-muted">({mb(f.size)})</span></span>
                  <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((x) => x !== f))} className="grid h-6 w-6 place-items-center rounded-full bg-slate-200 leading-none hover:bg-slate-300">✕</button>
                </li>
              ))}
            </ul>
          )}
          {progress !== null && (
            <div aria-live="polite">
              <div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-brand transition-all" style={{ width: `${progress}%` }} /></div>
              <p className="mt-1 text-sm text-muted">Uploading… {progress}%</p>
            </div>
          )}
          <div><Button variant="primary" disabled={!ready} onClick={submit}>{progress === null ? `Upload ${files.length || ""} file${files.length === 1 ? "" : "s"}`.replace("  ", " ") : "Uploading…"}</Button></div>
          {msg && (msg.ok ? <OkBox>{msg.text}</OkBox> : <ErrorBox>{msg.text}</ErrorBox>)}
          <Note>Requirements: 256 Hz EDF with the 18 standard bipolar channels (FP1-F7 ... CZ-PZ). Up to 20 files and {maxMb} MB per file. The EDF is deleted after processing. Only the model output is stored.</Note>
        </Card>
      </div>

      {target && (
        <>
          <H2>Uploads for {target.code}</H2>
          {list.length === 0 ? <Note>No uploads yet.</Note> : (
            <Table>
              <thead><tr><th>File</th><th>Size</th><th>Status</th><th>Details</th></tr></thead>
              <tbody>{list.map((u) => (
                <tr key={u._id}>
                  <td>{u.filename}</td><td>{mb(u.size || 0)}</td>
                  <td><Pill tone={tone[u.status]}>{label[u.status]}</Pill></td>
                  <td className={u.status === "failed" ? "max-sm:!whitespace-normal" : ""}>
                    {u.status === "done" && u.recording && <Link className="font-medium text-brand hover:underline" to={`/recordings/${u.recording}`}>Open recording</Link>}
                    {u.status === "failed" && <span className="text-coral">{u.error}</span>}
                    {busy(u) && <span className="text-muted">Reading and scoring the file…</span>}
                  </td>
                </tr>
              ))}</tbody>
            </Table>
          )}
          <p className="mt-3"><Link className="font-medium text-brand hover:underline" to={`/patients/${target._id}`}>Open patient {target.code}</Link></p>
          <Note>Uploaded recordings have no seizure annotation. Their alarms are shown without an outcome and they are not part of Results or Statistics. This is a research prototype and not a clinical tool.</Note>
        </>
      )}
    </>
  );
}