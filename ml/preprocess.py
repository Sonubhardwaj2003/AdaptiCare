
import numpy as np, re, mne, warnings
from scipy.signal import butter, sosfilt
warnings.filterwarnings('ignore')
mne.set_log_level('ERROR')
CANON = ['FP1-F7','F7-T7','T7-P7','P7-O1','FP1-F3','F3-C3','C3-P3','P3-O1','FP2-F4','F4-C4','C4-P4','P4-O2','FP2-F8','F8-T8','T8-P8','P8-O2','FZ-CZ','CZ-PZ']
SOS = butter(4, [1, 30], btype='bandpass', fs=256, output='sos')
T0 = 10.0
FS = 128
def pick_idx(names):
    up = [n.upper() for n in names]
    idx = []
    for c in CANON:
        hit = [i for i, n in enumerate(up) if n == c or re.fullmatch(re.escape(c) + r'-\d+', n)]
        if not hit:
            raise ValueError('missing ' + c)
        idx.append(hit[0])
    return idx
def filter_edf(path, keep_raw0=False):
    raw = mne.io.read_raw_edf(path, preload=False, verbose=False)
    if raw.info['sfreq'] != 256:
        raise ValueError('sfreq ' + str(raw.info['sfreq']))
    idx = pick_idx(raw.ch_names)
    x = raw.get_data(picks=idx) * 1e6
    r0 = x[0].astype(np.float32) if keep_raw0 else None
    y = sosfilt(SOS, x, axis=1)
    y = y[:, ::2][:, int(T0 * FS):].astype(np.float32)
    return y, r0
def cut_windows(sig, starts_s, win_s=5, flat_eps=1e-3):
    n = int(win_s * FS)
    W = np.zeros((len(starts_s), len(CANON), n), dtype=np.float32)
    status = np.zeros(len(starts_s), dtype=np.int8)
    for k, s in enumerate(starts_s):
        a = int(round((s - T0) * FS))
        b = a + n
        if a < 0 or b > sig.shape[1]:
            status[k] = 1
            continue
        w = sig[:, a:b]
        sd = w.std(axis=1)
        if (sd < flat_eps).any():
            status[k] = 2
            continue
        W[k] = (w - w.mean(axis=1, keepdims=True)) / (sd[:, None] + 1e-6)
    return W, status
