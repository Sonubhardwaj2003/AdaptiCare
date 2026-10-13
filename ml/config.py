"""Settings for turning CHB-MIT EDF files into AdaptiCare prediction files.

Everything marked CONFIRM must match what your friend used when TRAINING the models.
If the preprocessing here differs from training, the model output is not meaningful.
"""

# Set to True only after your friend has confirmed every CONFIRM item below.
PREPROCESSING_CONFIRMED = False

# ---- Fold (patient-independent evaluation) --------------------------------------------
FOLD = 2
# CONFIRM: the subjects held out as the TEST set of this fold, for example ["chb03", "chb09"].
# Never list a subject the model was trained on, or the results are leaked and look too good.
TEST_SUBJECTS = []

# ---- Windowing (from model.py: 640 samples per 5 s window = 128 Hz) --------------------
WIN_S = 5
FS = 128

# ---- CONFIRM: the 18 channels and their order ------------------------------------------
# This is the common 18-channel bipolar montage used with CHB-MIT. It is a GUESS until confirmed.
CHANNELS = [
    "FP1-F7", "F7-T7", "T7-P7", "P7-O1",
    "FP1-F3", "F3-C3", "C3-P3", "P3-O1",
    "FP2-F4", "F4-C4", "C4-P4", "P4-O2",
    "FP2-F8", "F8-T8", "T8-P8", "P8-O2",
    "FZ-CZ", "CZ-PZ",
]

# ---- CONFIRM: filtering. None = no band-pass. Example: (0.5, 40) for 0.5 to 40 Hz. ------
BANDPASS = None

# ---- Models available for this fold ----------------------------------------------------
# label minutes -> (checkpoint file in this folder, alarm threshold from results/thresholds.csv)
# Add the 15 and 60 minute models here when your friend sends them.
MODELS = {
    "30": ("fold2_L30.pt", 0.6846),
    # "15": ("fold2_L15.pt", 0.0000),   # fill in threshold
    # "60": ("fold2_L60.pt", 0.0000),   # fill in threshold
}
