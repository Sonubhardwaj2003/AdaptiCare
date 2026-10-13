// Generates FAKE prediction payloads in the same format the ML side will provide.
const W = 5, START = 10, THRESH = 0.5, CONSEC = 3, REFRACTORY = 1800;

exports.mockPayload = (edf, seed, onset, falseAt = null, dur = 3600) => {
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const make = (minutes, bias) => {
    const ws = [], pr = [];
    for (let t = START; t + W <= dur; t += W) {
      let p = 0.12 + rand() * 0.12;
      const reach = minutes * 60 + 300;
      if (onset != null) {
        const d = onset - t;
        if (d > 0 && d < reach) p += bias * Math.pow(1 - d / reach, 2) * 0.9;
        if (d <= 0 && t < onset + 40) p = 0.9;
      }
      if (falseAt != null && t >= falseAt && t < falseAt + 20) p = 0.7;
      ws.push(t); pr.push(+Math.min(0.99, p).toFixed(3));
    }
    const alarms = []; let run = 0, last = -Infinity;
    pr.forEach((p, i) => {
      run = p >= THRESH ? run + 1 : 0;
      if (run === CONSEC && ws[i] - last >= REFRACTORY) { alarms.push(ws[i]); last = ws[i]; }
    });
    return { window_start_sec: ws, probability: pr, alarms_sec: alarms, threshold: THRESH };
  };
  return {
    _mock: true,
    recording: { edf, duration_s: dur },
    settings: { window_s: W, fs: 128, alarm_rule: "3 consecutive windows >= threshold, 30 min refractory" },
    seizures_sec: onset != null ? [{ start: onset, end: onset + 40 }] : [],
    zones: onset != null ? { sph_s: [onset - 300, onset], sop_s: [onset - 2100, onset - 300], unscored_s: [onset - 3900, onset - 2100] } : null,
    models: { 15: make(15, 0.5), 30: make(30, 0.8), 60: make(60, 1.1) },
  };
};
