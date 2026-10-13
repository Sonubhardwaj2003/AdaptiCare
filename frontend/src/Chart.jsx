const W = 900, H = 240, M = { l: 44, r: 12, t: 12, b: 30 };

// Risk-over-time chart. `upTo` (seconds) is used by replay mode: only data up to that time is shown.
export default function Chart({ model, rec, title, upTo = Infinity }) {
  const dur = rec.duration_s;
  const x = (t) => M.l + (t / dur) * (W - M.l - M.r);
  const y = (p) => M.t + (1 - p) * (H - M.t - M.b);
  const ws = model.window_start_sec, pr = model.probability;
  const path = ws.map((t, i) => (t <= upTo ? `${i ? "L" : "M"}${x(t).toFixed(1)},${y(pr[i]).toFixed(1)}` : "")).join("");
  const band = (r, cls) => r && <rect className={cls} x={x(Math.max(0, r[0]))} y={M.t} width={Math.max(0, x(r[1]) - x(Math.max(0, r[0])))} height={H - M.t - M.b} />;
  const ticks = []; for (let t = 0; t <= dur; t += 600) ticks.push(t);
  const axis = "fill-muted text-[11px]";
  return (
    <figure className="m-0 rounded-lg border border-line bg-white px-2.5 pb-1 pt-2.5">
      {title && <figcaption className="mb-1 ml-1.5 font-semibold">{title}</figcaption>}
      <svg className="block h-auto w-full" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Predicted risk over time, ${title || ""}`}>
        {rec.zones && band(rec.zones.unscored_s, "fill-[#e6ebef]")}
        {rec.zones && band(rec.zones.sop_s, "fill-[#cfe8ea]")}
        {rec.zones && band(rec.zones.sph_s, "fill-[#f5d9d2]")}
        {rec.seizures.map((s, i) => <rect key={i} className="fill-coral opacity-[.85]" x={x(s.start)} y={M.t} width={Math.max(2, x(s.end) - x(s.start))} height={H - M.t - M.b} />)}
        {[0, 0.5, 1].map((v) => (
          <g key={v}><line className="stroke-line" x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} /><text className={axis} x={M.l - 8} y={y(v) + 4} textAnchor="end">{v}</text></g>
        ))}
        {ticks.map((t) => <text key={t} className={axis} x={x(t)} y={H - 10} textAnchor="middle">{t / 60}</text>)}
        <text className={axis} x={W - M.r} y={H} textAnchor="end">minutes from file start</text>
        <line className="stroke-muted [stroke-dasharray:5_4]" x1={M.l} x2={W - M.r} y1={y(model.threshold)} y2={y(model.threshold)} />
        <path className="fill-none stroke-brand [stroke-linejoin:round] [stroke-width:1.8]" d={path} />
        {model.alarms_sec.filter((a) => a <= upTo).map((a) => (
          <g key={a}><line className="stroke-ink [stroke-width:1.5]" x1={x(a)} x2={x(a)} y1={M.t} y2={H - M.b} /><polygon className="fill-ink" points={`${x(a) - 6},${M.t} ${x(a) + 6},${M.t} ${x(a)},${M.t + 10}`} /></g>
        ))}
        {upTo < Infinity && <line className="stroke-coral [stroke-width:1.5]" x1={x(upTo)} x2={x(upTo)} y1={M.t} y2={H - M.b} />}
      </svg>
    </figure>
  );
}
