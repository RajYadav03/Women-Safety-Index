import json
import asyncio
import httpx
from datetime import datetime
from typing import AsyncGenerator
from models.schemas import PredictResponse
from config import GROQ_API_KEY

# Configuration
OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "gemma3:1b"
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "llama-3.1-8b-instant"

SYSTEM_INSTRUCTION = """
You are the WSI Safety Assistant, a data-driven companion for women's safety.
Your goal is to provide specific, local safety advice using the REAL DATA provided to you.

Context for {locality}:
- Current Time: {current_time}
- Safety Index: {adj_score}/100
- Risk Level: {risk}
- Environmental Light: {lux} lux ({lux_msg})
- Dataset: {stats}

Guidelines:
1. **Use the Data**: Never give generic advice. Always mention the Safety Index or the lighting level if it's relevant to your tip.
2. **Be Time-Aware**: It is currently {current_time}. Adjust your advice based on whether it is late at night or during the day.
3. **Identity**: You are the "WSI Safety Assistant."
4. **Bento Rule**: ONLY if the user asks for a "summary," "read the area," or "area intelligence," start with a <bento>...</bento> block.
5. **Must Speak**: Even when providing a bento block, you MUST follow it with a friendly, conversational summary of the area. Never send just the data block alone.
6. **No Fluff**: Keep it practical. If it's night and the lux is low, warn them about specific lighting.
"""

async def generate_chat_stream(
    message: str,
    context_res: PredictResponse,
    history: list[dict] = None,
) -> AsyncGenerator[str, None]:
    """
    Hybrid streaming: Tries Groq first (Cloud/Ultra-fast), falls back to Ollama (Local).
    """
    # Debug: Which engine?
    engine = "GROQ" if GROQ_API_KEY else "OLLAMA"
    print(f"DEBUG: Using {engine} engine")
    # 1. Prepare data
    lux = context_res.lux_adjustment.lux_used
    current_time = datetime.now().strftime("%I:%M %p")
    
    if lux is None: lux_msg = "Unknown lighting"
    elif lux < 5: lux_msg = "Pitch black / Dangerous"
    elif lux < 20: lux_msg = "Poorly lit / Dim"
    elif lux < 60: lux_msg = "Well-lit for nighttime"
    elif lux < 200: lux_msg = "Brightly lit indoor/outdoor"
    else: lux_msg = "Daylight / Very bright"
    
    formatted_instruction = SYSTEM_INSTRUCTION.format(
        locality=context_res.locality or "Current Location",
        current_time=current_time,
        adj_score=int(context_res.adjusted_safety_index * 100),
        risk=context_res.lux_adjustment.risk_level or "normal",
        lux=lux if lux is not None else "N/A",
        lux_msg=lux_msg,
        stats=f"{context_res.stats.n_incidents} recent incidents in this specific area"
    )

    # 2. Try Groq if key exists
    if GROQ_API_KEY:
        try:
            messages = [{"role": "system", "content": formatted_instruction}]
            if history:
                for turn in history[-6:]:
                    messages.append({"role": turn.get("role"), "content": turn.get("text")})
            messages.append({"role": "user", "content": message})

            async with httpx.AsyncClient(timeout=10.0) as client:
                async with client.stream(
                    "POST",
                    GROQ_URL,
                    headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
                    json={
                        "model": GROQ_MODEL,
                        "messages": messages,
                        "stream": True,
                        "temperature": 0.6,
                        "max_tokens": 512
                    }
                ) as response:
                    if response.status_code == 200:
                        async for line in response.aiter_lines():
                            if not line or not line.startswith("data: "): continue
                            if line == "data: [DONE]": break
                            try:
                                data = json.loads(line[6:])
                                chunk = data["choices"][0]["delta"].get("content", "")
                                if chunk:
                                    yield f"data: {json.dumps({'chunk': chunk, 'confidence': 99})}\n\n"
                            except: continue
                        yield "data: [DONE]\n\n"
                        return
                    else:
                        print(f"DEBUG: Groq API Error {response.status_code}, falling back...")
        except Exception as e:
            print(f"DEBUG: Groq Exception: {str(e)}, falling back...")

    # 3. Fallback to Ollama
    full_prompt = f"{formatted_instruction}\n\n"
    if history:
        for turn in history[-4:]:
            full_prompt += f"{'User' if turn.get('role') == 'user' else 'Assistant'}: {turn.get('text', '')}\n"
    full_prompt += f"User: {message}\nAssistant:"

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream(
                "POST", 
                OLLAMA_URL, 
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": full_prompt,
                    "stream": True,
                    "options": {"temperature": 0.6, "num_predict": 100}
                }
            ) as response:
                async for line in response.aiter_lines():
                    if not line: continue
                    try:
                        data = json.loads(line)
                        chunk = data.get("response", "")
                        if chunk:
                            yield f"data: {json.dumps({'chunk': chunk, 'confidence': 95})}\n\n"
                        if data.get("done"): break
                    except: continue
        yield "data: [DONE]\n\n"
    except Exception as e:
        yield f"data: {json.dumps({'chunk': 'Offline mode active. Make sure Ollama is running!'})}\n\n"
        yield "data: [DONE]\n\n"
