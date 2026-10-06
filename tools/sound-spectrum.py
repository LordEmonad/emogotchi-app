"""Where a WAV's energy sits: its loudness and its octave bands (relative to its loudest band), and its stereo width,
over the whole file or over stretches of it. Used with tools/sound-studio.mjs to voice sounds by measurement, since
nobody here can listen.
    python3 tools/sound-spectrum.py <file.wav> [start-end ...]      (stretches in seconds, e.g. 0-4 4-9.5)
A rock mix's octave bands fall away gently from 63-125 Hz (63: 0, 125: -1, 250: -3, 500: -5, 1k: -7, 2k: -9, 4k: -12,
8k: -16, 16k: -24); 1-4 kHz well over that reads as harsh, 125-500 Hz well under it as thin."""
import struct, sys
import numpy as np

def wav(p):
    b = open(p, 'rb').read()
    sr = struct.unpack('<I', b[24:28])[0]
    d = np.frombuffer(b[44:], dtype='<i2').astype(np.float32) / 32767
    return sr, d[0::2], d[1::2]

sr, L, R = wav(sys.argv[1])
spans = [tuple(float(x) for x in s.split('-')) for s in sys.argv[2:]] or [(0, len(L) / sr)]
bands = [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
print('stretch       rms   ' + ' '.join(f'{int(b):>6}' for b in bands) + '   width')
for a, b in spans:
    l, r = L[int(a * sr):int(b * sr)], R[int(a * sr):int(b * sr)]
    x, s = (l + r) / 2, (l - r) / 2
    rms = 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-9)
    n = 8192
    spec = np.zeros(n // 2 + 1)
    for i in range(0, max(1, len(x) - n), n // 2):
        seg = x[i:i + n]
        if len(seg) < n: break
        spec += np.abs(np.fft.rfft(seg * np.hanning(n))) ** 2
    f = np.fft.rfftfreq(n, 1 / sr)
    lv = [10 * np.log10(spec[(f >= c / np.sqrt(2)) & (f < c * np.sqrt(2))].sum() + 1e-12) for c in bands]
    ref = max(lv)
    w = 20 * np.log10(np.sqrt(np.mean(s ** 2)) / (np.sqrt(np.mean(x ** 2)) + 1e-9) + 1e-9)
    print(f'{a:5.1f}-{b:5.1f}  {rms:6.1f}  ' + ' '.join(f'{v - ref:6.1f}' for v in lv) + f'   {w:5.1f}')
