"""Generate simple notification chimes for the Android app."""
import math
import os
import struct
import wave

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "android", "app", "src", "main", "res", "raw")
os.makedirs(RAW, exist_ok=True)

RATE = 44100


def tone(freq, dur, amp=0.28, fade=0.04):
    n = int(RATE * dur)
    out = []
    for i in range(n):
        t = i / RATE
        env = 1.0
        if t < fade:
            env = t / fade
        elif t > dur - fade:
            env = max(0.0, (dur - t) / fade)
        # Slight harmonic for a soft bell-ish tone
        sample = (
            math.sin(2 * math.pi * freq * t) * 0.78
            + math.sin(2 * math.pi * freq * 2 * t) * 0.16
            + math.sin(2 * math.pi * freq * 3 * t) * 0.06
        )
        out.append(sample * amp * env)
    return out


def silence(dur):
    return [0.0] * int(RATE * dur)


def write_wav(path, samples):
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        frames = b"".join(struct.pack("<h", max(-32767, min(32767, int(s * 32767)))) for s in samples)
        w.writeframes(frames)
    print("wrote", os.path.relpath(path, ROOT), round(len(samples) / RATE, 2), "s")


# Soft two-note reminder: E5 -> A5
reminder = tone(659.25, 0.22, 0.26) + silence(0.04) + tone(880.0, 0.42, 0.24)
write_wav(os.path.join(RAW, "banban_notify.wav"), reminder)

# More urgent three-pulse tone for overdue reminders
urgent = (
    tone(880.0, 0.13, 0.3)
    + silence(0.07)
    + tone(880.0, 0.13, 0.3)
    + silence(0.07)
    + tone(1174.66, 0.3, 0.28)
)
write_wav(os.path.join(RAW, "banban_urgent.wav"), urgent)
