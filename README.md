# LLM Based Women Safety Prediction App 🛡️

**Women Safety App** is a real-time safety intelligence platform designed to empower women with data-driven environmental awareness. It combines historical safety aggregates with live environmental data (like ambient light levels) and a cutting-edge **Hybrid AI Assistant** to provide actionable safety advice.

![Project Banner](https://img.shields.io/badge/AI-Groq%20%7C%20Ollama-blueviolet?style=for-the-badge)
![Tech Stack](https://img.shields.io/badge/Stack-React%20Native%20%7C%20FastAPI-blue?style=for-the-badge)

## ✨ Key Features

### 🧠 Hybrid AI Intelligence
The app features a sophisticated **Safety Assistant** with an automatic failover system:
- **Cloud (Groq)**: Uses Llama 3.1 via Groq for near-instant, high-intelligence safety summaries.
- **Local (Ollama)**: Automatically falls back to a local Gemma 3 (1B) model if the cloud is unavailable, ensuring the app works even in "offline" or high-privacy modes.

### 💡 Live Environmental Sensing (Lux)
The first safety app to implement **Dynamic Safety Indexing**:
- Integrates with the phone's **Ambient Light Sensor**.
- Automatically applies safety penalties to areas at night if they are poorly lit.
- **Sensor Smoothing**: Uses a moving average algorithm to prevent safety score flickering.

### 🍱 Bento Grid Area Intelligence
Get a professional, at-a-glance safety report using our custom Bento UI:
- **Vibe Check**: High-level feeling of the location.
- **Crowd Density**: Real-time/historical occupancy data.
- **Recent Incidents**: Direct insights from the crime dataset.

### 🗺️ Interactive Safety Map
- Visualizes safety scores across the city using custom map tiles.
- High-confidence safety clusters mapped via historical data.

---

## 🛠️ Tech Stack

### Frontend
- **Framework**: React Native (Expo)
- **Language**: TypeScript
- **Styling**: Vanilla CSS-in-JS with custom Design Tokens
- **Sensors**: `expo-sensors` (LightSensor)
- **Animations**: Pulse & Typing indicators for a premium feel

### Backend
- **Framework**: FastAPI (Python)
- **Database**: JSON/CSV based Safety Aggregates
- **Streaming**: Server-Sent Events (SSE) for real-time AI typing
- **ML Integration**: Lux-aware penalty logic and proximity indexing

---

## 🚀 Getting Started

### 1. Backend Setup
```bash
cd backend
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
```

**Environment Variables (.env):**
```env
GROQ_API_KEY=your_key_here  # For high-speed AI
GEMINI_API_KEY=your_key_here # Optional fallback
```

**Run Backend:**
```bash
python -m uvicorn backend.main:app --reload
```

### 2. Frontend Setup
```bash
cd wsi-app
npm install
npx expo start
```

### 3. AI Setup (Optional)
To use the local fallback, install [Ollama](https://ollama.com) and run:
```bash
ollama run gemma3:1b
```

---

## 📈 The Safety Logic
The **Safety Index** (0-100) is calculated as:
`Base Score (Dataset) × Lux Penalty (Live Sensor) = Final Safety Score`

- **Daytime**: The sensor is ignored (assumed to be in a pocket/bag).
- **Nighttime**: If Lux < 10, a **30% penalty** is applied.
- **Shadow Detection**: In commercial/campus zones, extremely low light triggers a **Shadow Penalty**.

---

## 🤝 Contributing
This project is dedicated to making cities safer for everyone. Feel free to fork, submit PRs, or suggest new data layers!

---

