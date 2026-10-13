// Window-level statistics for the paper view. Pure functions, no database access.
// Test target for label length L (min): positives are windows inside [T-5min-L, T-5min), where T is seizure onset.
// Negatives are clean windows. Windows from 65 min before onset until 2 h after seizure end are unscored (unless positive).
const SPH = 300, POOL = 3900, POST = 7200, DUR = ["15", "30", "60"];

function averagePrecision(scores, labels) {
  const n = scores.length; let P = 0;
  for (const l of labels) P += l;
  if (!P || P === n) return null;
  const idx = scores.map((_, i) => i).sort((a, b) => scores[b] - scores[a]);
  let tp = 0, fp = 0, ap = 0, prev = 0, i = 0;
  while (i < n) {
    let j = i;
    while (j < n && scores[idx[j]] === scores[idx[i]]) j++;
    for (let k = i; k < j; k++) labels[idx[k]] ? tp++ : fp++;
    const rec = tp / P;
    ap += (rec - prev) * (tp / (tp + fp));
    prev = rec; i = j;
  }
  return ap;
}

// 1 = positive, 0 = negative, -1 = unscored
function windowLabels(rec, L) {
  const w = rec.settings?.window_s || 5;
  return rec.predictions["15"].window_start_sec.map((t) => {
    const e = t + w; let pos = false, unclean = false;
    for (const sz of rec.seizures) {
      if (t >= sz.start - SPH - L * 60 && e <= sz.start - SPH) pos = true;
      if (e > sz.start - POOL && t < sz.end + POST) unclean = true;
    }
    return pos ? 1 : unclean ? -1 : 0;
  });
}

// Friedman test across 3 related samples (one row per subject). df = 2, so p = exp(-Q/2).
function friedman(rows) {
  const n = rows.length, k = 3;
  if (n < 2) return null;
  const R = [0, 0, 0];
  for (const r of rows) {
    const order = [0, 1, 2].sort((a, b) => r[a] - r[b]); const ranks = [0, 0, 0]; let i = 0;
    while (i < k) {
      let j = i;
      while (j + 1 < k && r[order[j + 1]] === r[order[i]]) j++;
      for (let x = i; x <= j; x++) ranks[order[x]] = (i + j) / 2 + 1;
      i = j + 1;
    }
    ranks.forEach((v, x) => (R[x] += v));
  }
  const Q = (12 / (n * k * (k + 1))) * R.reduce((a, b) => a + b * b, 0) - 3 * n * (k + 1);
  return { n, Q, p: Math.exp(-Q / 2), meanRanks: R.map((v) => v / n) };
}

exports.averagePrecision = averagePrecision;
exports.friedman = friedman;

exports.subjectStats = (recs) => {
  const bySubject = {};
  for (const rc of recs) (bySubject[rc.patient.code] ||= []).push(rc);
  const subjects = [], mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const accum = {}; for (const m of DUR) { accum[m] = {}; for (const L of DUR) accum[m][L] = []; }
  const base = {}; for (const L of DUR) base[L] = [];

  for (const [code, rs] of Object.entries(bySubject).sort()) {
    const seizures = rs.reduce((n, r) => n + r.seizures.length, 0);
    if (!seizures) continue;
    const ap = {}, baseline = {};
    for (const L of DUR) {
      const labs = rs.flatMap((r) => windowLabels(r, +L));
      const keep = labs.map((l, i) => (l >= 0 ? i : -1)).filter((i) => i >= 0);
      const y = keep.map((i) => labs[i]);
      baseline[L] = y.length ? y.reduce((a, b) => a + b, 0) / y.length : null;
      if (baseline[L] != null) base[L].push(baseline[L]);
      for (const m of DUR) {
        const sc = rs.flatMap((r) => r.predictions[m].probability);
        const v = averagePrecision(keep.map((i) => sc[i]), y.slice());
        (ap[m] ||= {})[L] = v;
        if (v != null) accum[m][L].push(v);
      }
    }
    subjects.push({ code, seizures, recordings: rs.length, baseline: baseline["30"], pr: { 15: ap["15"]["30"], 30: ap["30"]["30"], 60: ap["60"]["30"] } });
  }
  const matrix = {}; for (const m of DUR) { matrix[m] = {}; for (const L of DUR) matrix[m][L] = mean(accum[m][L]); }
  const baseline = {}; for (const L of DUR) baseline[L] = mean(base[L]);
  // Formal test only on subjects with at least 2 seizures and all three scores available.
  const rows = subjects.filter((s) => s.seizures >= 2 && DUR.every((m) => s.pr[m] != null)).map((s) => DUR.map((m) => s.pr[m]));
  return { demo: recs.some((r) => r.source === "demo"), subjects, matrix, baseline, friedman: friedman(rows) };
};
