"""
WSI Backend — YAMNet Acoustic Threat Detection Service
Downloads and runs YAMNet TFLite model using tflite-runtime or tensorflow.
"""
import io
import os
import urllib.request
import wave
import subprocess
import tempfile
import threading
import numpy as np
from pathlib import Path

# Paths
SERVICE_DIR = Path(__file__).resolve().parent
BACKEND_ROOT = SERVICE_DIR.parent
MODELS_DIR = BACKEND_ROOT / "models"
MODEL_PATH = MODELS_DIR / "yamnet.tflite"
LABELS_PATH = MODELS_DIR / "yamnet_classes.csv"

# Model URLs (Verified high-availability Google/TensorFlow hosts)
MODEL_URL = "https://tfhub.dev/google/lite-model/yamnet/classification/tflite/1?lite-format=tflite"
LABELS_URL = "https://raw.githubusercontent.com/tensorflow/models/master/research/audioset/yamnet/yamnet_class_map.csv"

# Threat profiles
THREAT_CATEGORIES = {
    "Scream": ["Scream", "Screaming", "Yell", "Yelling", "Shout", "Shouting"],
    "Glass Breaking": ["Glass", "Shattered glass", "Shatter", "Breaking"],
    "Explosion/Gunfire": ["Gunshot, gunfire", "Explosion", "Gunfire", "Explosive sound", "Boom"]
}

# Interpreter and label state
_labels = []
_threat_indices = {}

# Thread-local storage for YAMNet interpreter to make it thread-safe under WSGI/Gunicorn
_local_state = threading.local()

def ensure_model_installed():
    """Ensure YAMNet TFLite model and labels are downloaded."""
    if not MODELS_DIR.exists():
        MODELS_DIR.mkdir(parents=True, exist_ok=True)

    # Note: Use a custom User-Agent to bypass standard urllib 403 Forbidden on some Google Storage CDN links
    opener = urllib.request.build_opener()
    opener.addheaders = [('User-Agent', 'Mozilla/5.0')]
    urllib.request.install_opener(opener)

    if not MODEL_PATH.exists():
        print(f"[Acoustic] Downloading YAMNet TFLite model (4.1MB) from TensorFlow Hub...")
        try:
            urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
            print("[Acoustic] YAMNet model downloaded successfully!")
        except Exception as e:
            print(f"[Acoustic] Error downloading model: {e}")
            raise

    if not LABELS_PATH.exists():
        print(f"[Acoustic] Downloading YAMNet class mapping CSV from official repository...")
        try:
            urllib.request.urlretrieve(LABELS_URL, LABELS_PATH)
            print("[Acoustic] Class mapping CSV downloaded successfully!")
        except Exception as e:
            print(f"[Acoustic] Error downloading labels: {e}")
            raise

def load_yamnet():
    """Load the YAMNet interpreter and map threat indices."""
    global _labels, _threat_indices
    ensure_model_installed()

    if not _labels:
        # Load labels from CSV
        import csv
        _labels = [""] * 521
        with open(LABELS_PATH, "r", encoding="utf-8") as f:
            reader = csv.reader(f)
            next(reader)  # Skip header row
            for row in reader:
                if len(row) >= 3:
                    idx = int(row[0])
                    display_name = row[2].strip().replace('"', '')
                    _labels[idx] = display_name

        # Map threat categories to actual indices
        _threat_indices = {}
        for cat_name, keywords in THREAT_CATEGORIES.items():
            indices = []
            for kw in keywords:
                for idx, label in enumerate(_labels):
                    if kw.lower() in label.lower():
                        indices.append(idx)
            _threat_indices[cat_name] = list(set(indices))

    # Allocate interpreter thread-locally if it doesn't exist for this thread
    if not hasattr(_local_state, "interpreter"):
        try:
            import tflite_runtime.interpreter as tflite
            interpreter = tflite.Interpreter(model_path=str(MODEL_PATH))
        except ImportError:
            try:
                import tensorflow.lite as tflite
                interpreter = tflite.Interpreter(model_path=str(MODEL_PATH))
            except ImportError:
                raise ImportError(
                    "Could not import tflite_runtime or tensorflow. "
                    "Please run: pip install tflite-runtime"
                )

        # Allocate tensors
        interpreter.allocate_tensors()
        _local_state.interpreter = interpreter
        print("[Acoustic] Thread-safe YAMNet TFLite Model loaded successfully for this worker thread!")

def transcode_to_wav(file_bytes: bytes) -> bytes:
    """
    Tries to transcode incoming compressed audio bytes (AAC/3GP/M4A)
    to a standard 16kHz mono WAV file using system FFmpeg.
    """
    in_fd, in_path = tempfile.mkstemp(suffix=".raw")
    out_fd, out_path = tempfile.mkstemp(suffix=".wav")

    # Close raw file descriptors immediately to release locks on all platforms
    os.close(in_fd)
    os.close(out_fd)

    try:
        # Write input bytes to temporary file path
        with open(in_path, 'wb') as f_in:
            f_in.write(file_bytes)

        # Run FFmpeg to transcode to 16kHz 16-bit mono PCM WAV
        cmd = [
            "ffmpeg", "-y",
            "-i", in_path,
            "-ar", "16000",
            "-ac", "1",
            "-f", "wav",
            out_path
        ]

        # Run subprocess silently
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if result.returncode != 0:
            raise ValueError(f"FFmpeg transcode failed: {result.stderr.decode('utf-8', errors='ignore')}")

        # Read the transcoded wav file
        with open(out_path, 'rb') as f_out:
            return f_out.read()

    except FileNotFoundError:
        raise RuntimeError(
            "System FFmpeg was not found on the server. To support Android cloud acoustic classification, "
            "please add the Heroku FFmpeg buildpack: "
            "'heroku buildpacks:add --index 1 heroku-community/ffmpeg-common'"
        )
    finally:
        # Clean up files safely
        try:
            os.remove(in_path)
        except OSError:
            pass
        try:
            os.remove(out_path)
        except OSError:
            pass

def read_wav_16k_mono(file_bytes: bytes) -> np.ndarray:
    """
    Decodes raw WAV bytes, normalizes samples to Float32 [-1.0, 1.0],
    and resamples to exactly 16kHz mono. Handles native WAV as well as M4A/3GP.
    """
    try:
        f = wave.open(io.BytesIO(file_bytes), 'rb')
    except Exception as e:
        print(f"[Acoustic] Header check failed ({e}). Attempting FFmpeg transcoding fallback...")
        try:
            transcoded_bytes = transcode_to_wav(file_bytes)
            f = wave.open(io.BytesIO(transcoded_bytes), 'rb')
        except Exception as trans_err:
            raise ValueError(
                f"Failed to parse audio. Not a valid WAV file, and FFmpeg transcoding failed.\n"
                f"Error details: {trans_err}"
            )

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

    # Get thread-local interpreter
    interpreter = _local_state.interpreter

    # Read and normalize audio waveform
    waveform = read_wav_16k_mono(file_bytes)

    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()

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

        # Run inference on thread-local interpreter
        interpreter.set_tensor(input_details[0]['index'], chunk)
        interpreter.invoke()
        output_data = interpreter.get_tensor(output_details[0]['index'])

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

    # Check threshold (>0.05 for extreme responsiveness during live tests/demos)
    is_anomaly = highest_score >= 0.05

    return {
        "anomaly_detected": is_anomaly,
        "threats": detected_threats,
        "class": highest_category if is_anomaly else None,
        "confidence": round(highest_score, 4)
    }
