"""Extract the cut cue from the supplied 63.1-second reference recording.

The recording repeats its music every 16.128 seconds. Align three later music
copies, match their gain before the cut cue, and subtract their sample median.
Only the cropped cue is stored in the game, not the recording or its music.
Requires ffmpeg and numpy; this is an offline asset-authoring tool.
"""

import argparse
from pathlib import Path
import subprocess
import wave

import numpy as np


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("video", type=Path)
    parser.add_argument("--output", type=Path, default=Path("assets/res/airdropRescueFeed/rope-cut.wav"))
    args = parser.parse_args()
    pcm = subprocess.check_output([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(args.video),
        "-vn", "-ac", "1", "-ar", "24000", "-f", "s16le", "pipe:1",
    ])
    rate = 24000
    samples = np.frombuffer(pcm, np.int16).astype(np.float64) / 32768
    start = int(9.94 * rate)
    length = int(1.1 * rate)
    target = samples[start:start + length]
    calibration = int(.075 * rate)
    donors = []
    for nominal in [16.128, 32.256, 48.384]:
        center = int(nominal * rate)
        best_score, best_offset = -1, None
        for offset in range(center - 35, center + 36):
            candidate = samples[start + offset:start + offset + length]
            if len(candidate) != length:
                continue
            donor = candidate[:calibration]
            reference = target[:calibration]
            score = float(np.dot(donor, reference) / max(1e-12, np.linalg.norm(donor) * np.linalg.norm(reference)))
            if score > best_score:
                best_score, best_offset = score, offset
        if best_offset is None or best_score < .95:
            raise ValueError("This recording does not match the reference music/cut timing.")
        candidate = samples[start + best_offset:start + best_offset + length]
        gain = np.dot(candidate[:calibration], target[:calibration]) / np.dot(candidate[:calibration], candidate[:calibration])
        donors.append(candidate * gain)
    isolated = target - np.median(donors, axis=0)
    # The recording's first cut cue begins after the visible gesture (capture latency).
    cue = isolated[int(.09 * rate):int(.94 * rate)].copy()
    cue -= np.mean(cue)
    fade_in, fade_out = int(.005 * rate), int(.06 * rate)
    cue[:fade_in] *= np.linspace(0, 1, fade_in)
    cue[-fade_out:] *= np.linspace(1, 0, fade_out)
    cue *= .8 / max(1e-9, np.max(np.abs(cue)))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(args.output), "wb") as output:
        output.setparams((1, 2, rate, 0, "NONE", "not compressed"))
        output.writeframes(np.round(cue * 32767).astype("<i2").tobytes())
    print(f"Authored {args.output}: {len(cue) / rate:.2f} s, {args.output.stat().st_size} bytes")


if __name__ == "__main__":
    main()
