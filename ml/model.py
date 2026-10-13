import numpy as np
import torch
import torch.nn as nn

THRESHOLD = 0.6846   # fold2_L30, from results/thresholds.csv (val-set rule, 0.2 FA/h budget)
WIN_S = 5            # seconds per window
REFRACTORY_S = 1800  # 30 min
NEED = 3             # consecutive windows >= threshold


class Net(nn.Module):
    def __init__(self, drop=0.3):
        super().__init__()

        def blk(i, o, k):
            return nn.Sequential(nn.Conv1d(i, o, k, padding=k // 2),
                                 nn.BatchNorm1d(o), nn.ReLU(), nn.MaxPool1d(2))

        self.cnn = nn.Sequential(blk(18, 32, 7), blk(32, 64, 5), blk(64, 64, 3))
        self.lstm = nn.LSTM(64, 64, batch_first=True, bidirectional=True)
        self.drop = nn.Dropout(drop)
        self.fc = nn.Linear(128, 1)

    def forward(self, x):
        h = self.cnn(x).transpose(1, 2)
        h, _ = self.lstm(h)
        return self.fc(self.drop(h.mean(1))).squeeze(1)


def load_model(path="fold2_L30.pt"):
    m = Net()
    m.load_state_dict(torch.load(path, map_location="cpu"))
    return m.eval()


@torch.no_grad()
def predict_windows(model, X):
    """X: float array (n, 18, 640), each window already z-scored per channel.
    Returns probabilities (n,)."""
    X = torch.from_numpy(np.asarray(X, dtype=np.float32))
    out = []
    for i in range(0, len(X), 256):
        out.append(torch.sigmoid(model(X[i:i + 256])).numpy())
    return np.concatenate(out)


def find_alarms(times_s, probs, thr=THRESHOLD):
    """times_s: window start times in seconds, sorted. Windows must be exactly
    5 s apart to chain. Alarm = 3 consecutive windows >= thr, then 30 min refractory.
    Returns list of alarm times (end of 3rd window)."""
    alarms, run, last_t, blocked_until = [], 0, None, -1e18
    for t, p in zip(times_s, probs):
        if last_t is None or t - last_t != WIN_S:
            run = 0
        run = run + 1 if p >= thr else 0
        last_t = t
        if run >= NEED and t + WIN_S > blocked_until:
            alarms.append(t + WIN_S)
            blocked_until = t + WIN_S + REFRACTORY_S
            run = 0
    return alarms
