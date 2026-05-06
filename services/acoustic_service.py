"""
WSI Backend — YAMNet Acoustic Threat Detection Service
Downloads and runs YAMNet TFLite model using tflite-runtime or tensorflow.
"""
import io
import os
import urllib.request
import wave
import numpy as np
from pathlib import Path

# Paths
SERVICE_DIR = Path(__file__).resolve().parent
BACKEND_ROOT = SERVICE_DIR.parent
MODELS_DIR = BACKEND_ROOT / "models"
MODEL_PATH = MODELS_DIR / "yamnet.tflite"
LABELS_PATH = MODELS_DIR / "yamnet_classes.txt"

# Model URLs (Official TensorFlow examples assets)
MODEL_URL = "https://github.com/tensorflow/examples/raw/master/lite/examples/sound_classification/android/app/src/main/assets/yamnet.tflite"
LABELS_URL = "https://github.com/tensorflow/examples/raw/master/lite/examples/sound_classification/android/app/src/main/assets/yamnet_label_list.txt"

# Threat profiles
THREAT_CATEGORIES = {
    "Scream": ["Scream", "Screaming", "Yell", "Yelling", "Shout", "Shouting"],
    "Glass Breaking": ["Glass", "Shattered glass", "Shatter", "Breaking"],
    "Explosion/Gunfire": ["Gunshot, gunfire", "Explosion", "Gunfire", "Explosive sound", "Boom"]
}

# Interpreter and label state
_interpreter = None
_labels = []
_threat_indices = {}

def ensure_model_installed():
    """Ensure YAMNet TFLite model and labels are downloaded."""
    if not MODELS_DIR.exists():
        MODELS_DIR.mkdir(parents=True, exist_ok=True)

    if not MODEL_PATH.exists():
        print(f"[Acoustic] Downloading YAMNet TFLite model (15MB) from {MODEL_URL}...")
        try:
            urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
            print("[Acoustic] YAMNet model downloaded successfully!")
        except Exception as e:
            print(f"[Acoustic] Error downloading model: {e}")
            raise

    if not LABELS_PATH.exists():
        print(f"[Acoustic] Downloading YAMNet class labels from {LABELS_URL}...")
        try:
            urllib.request.urlretrieve(LABELS_URL, LABELS_PATH)
            print("[Acoustic] Labels downloaded successfully!")
        except Exception as e:
            print(f"[Acoustic] Error downloading labels: {e}")
            raise

def load_yamnet():
    """Load the YAMNet interpreter and map threat indices."""
    global _interpreter, _labels, _threat_indices
    if _interpreter is not None:
        return

    ensure_model_installed()

    # Load labels
    with open(LABELS_PATH, "r") as f:
        _labels = [line.strip() for line in f.readlines() if line.strip()]

    # Map threat categories to actual indices
    _threat_indices = {}
    for cat_name, keywords in THREAT_CATEGORIES.items():
        indices = []
        for kw in keywords:
            for idx, label in enumerate(_labels):
                if kw.lower() in label.lower():
                    indices.append(idx)
        _threat_indices[cat_name] = list(set(indices))

    # Try loading TFLite interpreter
    try:
        import tflite_runtime.interpreter as tflite
        _interpreter = tflite.Interpreter(model_path=str(MODEL_PATH))
    except ImportError:
        try:
            import tensorflow.lite as tflite
            _interpreter = tflite.Interpreter(model_path=str(MODEL_PATH))
        except ImportError:
            raise ImportError(
                "Could not import tflite_runtime or tensorflow. "
                "Please run: pip install tflite-runtime"
            )

    # Allocate tensors
    _interpreter.allocate_tensors()
    print("[Acoustic] YAMNet TFLite Model loaded and threat categories compiled successfully!")

def read_wav_16k_mono(file_bytes: bytes) -> np.ndarray:
    """
    Decodes raw WAV bytes, normalizes samples to Float32 [-1.0, 1.0],
    and resamples to exactly 16kHz mono using linear interpolation.
    """
    try:
        f = wave.open(io.BytesIO(file_bytes), 'rb')
    except Exception as e:
        raise ValueError(f"Failed to parse WAV audio bytes: {e}")

    try:
        n_channels, sampwidth, framerate, n_frames = f.getparams()[:4]
        raw_data = f.readframes(n_frames)
    finally:
        f.close()

    # Convert binary frames to numpy int16 (or uint8)
    if sampwidth == 2:
        data = np.frombuffer(raw_data, dtype=np.int16)
    elif sampwidth == 1:
        data = np.frombuffer(raw_data, dtype=np.uint8).astype(np.int16) - 128
    else:
        raise ValueError(f"Unsupported sample bit-depth width: {sampwidth}")

    # Convert to mono if stereo
    if n_channels > 1:
        data = data.reshape(-1, n_channels)
        data = data.mean(axis=1).astype(np.int16)

    # Normalize to Float32 [-1.0, 1.0]
    data = data.astype(np.float32) / 32768.0

    # Resample to 16,000 Hz if recorded at another frequency
    if framerate != 16000:
        num_samples = int(len(data) * 16000 / framerate)
        data = np.interp(
            np.linspace(0, len(data), num_samples, endpoint=False),
            np.arange(len(data)),
            data
        ).astype(np.float32)

    return data

def classify_audio(file_bytes: bytes) -> dict:
    """
    Downsamples the incoming WAV bytes to 16kHz Float32 mono,
    runs YAMNet sliding-window inference, and returns target probabilities.
    """
    load_yamnet()

    # Read and normalize audio waveform
    waveform = read_wav_16k_mono(file_bytes)

    input_details = _interpreter.get_input_details()
    output_details = _interpreter.get_output_details()

    # YAMNet input shape is exactly [15600] samples (0.975s)
    window_size = 15600
    step_size = 7800  # 50% overlap

    if len(waveform) < window_size:
        # Pad with zeros if recording is too short
        padded = np.zeros(window_size, dtype=np.float32)
        padded[:len(waveform)] = waveform
        waveform = padded

    window_scores = []

    for start in range(0, len(waveform) - window_size + 1, step_size):
        chunk = waveform[start : start + window_size]

        # Run inference
        _interpreter.set_tensor(input_details[0]['index'], chunk)
        _interpreter.invoke()
        output_data = _interpreter.get_tensor(output_details[0]['index'])

        # output_data is shape [1, 521]
        window_scores.append(output_data[0])

    # Aggregate probabilities across all frames (using max pool to catch burst anomalies like screams)
    if not window_scores:
        return {"anomaly_detected": False, "threats": {}, "class": None, "confidence": 0.0}

    window_scores = np.array(window_scores)
    max_scores = window_scores.max(axis=0)

    # Compile threat scores
    detected_threats = {}
    highest_category = None
    highest_score = 0.0

    for cat_name, indices in _threat_indices.items():
        if not indices:
            continue
        # Get highest score among mapped class indices
        cat_score = float(max_scores[indices].max())
        detected_threats[cat_name] = round(cat_score, 4)

        if cat_score > highest_score:
            highest_score = cat_score
            highest_category = cat_name

    # Check threshold (>0.65)
    is_anomaly = highest_score >= 0.65

    return {
        "anomaly_detected": is_anomaly,
        "threats": detected_threats,
        "class": highest_category if is_anomaly else None,
        "confidence": round(highest_score, 4)
    }
