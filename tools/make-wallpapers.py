"""Makes Scrim's built-in wallpapers. Everything here is drawn by this script (no photos, no one else's artwork),
so the images belong to the Scrim project and are safe to ship and sell.

    python tools/make-wallpapers.py            (needs: pip install numpy pillow)

Writes wp-<id>.jpg (2560x1440) and thumb-wp-<id>.jpg (320x180) into src/renderer/src/assets/wallpapers/.
"""
import os
import sys
import numpy as np
from PIL import Image

W, H = 2560, 1440
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'renderer', 'src', 'assets', 'wallpapers')


def hexc(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32) / 255.0


def smooth_noise(rng, cells, octaves=3):
    """Soft value noise in 0..1, same size as the picture."""
    out = np.zeros((H, W), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        n = cells * 2 ** o
        g = rng.random((max(2, int(n * H / W)) + 2, n + 2)).astype(np.float32)
        im = Image.fromarray(g, mode='F').resize((W, H), Image.BICUBIC)
        out += np.asarray(im, np.float32) * amp
        tot += amp
        amp *= 0.5
    return out / tot


def grid():
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    return x / H, y / H  # x runs 0..16/9, y runs 0..1


def mesh(rng, base, blobs, warp=0.18, base_w=0.35):
    """Soft mesh gradient: coloured blobs blended smoothly, with the space gently bent so it never looks geometric."""
    x, y = grid()
    nx = (smooth_noise(rng, 3) - 0.5) * 2
    ny = (smooth_noise(rng, 3) - 0.5) * 2
    x = x + warp * nx
    y = y + warp * ny
    acc = np.zeros((H, W, 3), np.float32)
    wsum = np.full((H, W), base_w, np.float32)
    acc += hexc(base) * base_w
    for cx, cy, r, col, s in blobs:
        d2 = (x - cx * (W / H)) ** 2 + (y - cy) ** 2
        w = s * np.exp(-d2 / (2 * r * r))
        acc += w[..., None] * hexc(col)
        wsum += w
    return acc / wsum[..., None]


def smoothstep(a, b, v):
    t = np.clip((v - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def waves(rng, img, layers, soft=0.012):
    """Layered silky waves: each layer is a coloured band that fades from its colour into the next."""
    x, y = grid()
    for y0, amp, freq, phase, c1, c2, alpha in layers:
        n = (smooth_noise(rng, 4, 2) - 0.5) * 0.25
        edge = y0 + amp * np.sin(freq * x * 2 * np.pi / (W / H) + phase) + 0.5 * amp * np.sin(freq * 2.3 * x + phase * 1.7) + n
        m = smoothstep(-soft, soft, y - edge) * alpha  # 1 below the edge
        t = np.clip((y - edge) / 0.45, 0, 1)[..., None]
        col = hexc(c1) * (1 - t) + hexc(c2) * t
        img = img * (1 - m[..., None]) + col * m[..., None]
    return img


def glow(img, cx, cy, r, col, s):
    x, y = grid()
    d2 = (x - cx * (W / H)) ** 2 + (y - cy) ** 2
    g = (s * np.exp(-d2 / (2 * r * r)))[..., None]
    return 1 - (1 - img) * (1 - hexc(col) * g)  # screen blend: lights without washing out


def finish(img, rng, vignette=0.12, grain=1.4):
    x, y = grid()
    d = np.sqrt(((x - 0.5 * W / H) / (0.5 * W / H)) ** 2 + ((y - 0.5) / 0.5) ** 2)
    img = img * (1 - vignette * smoothstep(0.5, 1.5, d))[..., None]
    img = img + rng.normal(0, grain / 255.0, (H, W, 1)).astype(np.float32)  # fine grain hides gradient banding in JPEG
    return np.clip(img, 0, 1)


def save(name, img):
    big = Image.fromarray((img * 255 + 0.5).astype(np.uint8))
    big.save(os.path.join(OUT, f'wp-{name}.jpg'), quality=90, subsampling=0, optimize=True)
    big.resize((320, 180), Image.LANCZOS).save(os.path.join(OUT, f'thumb-wp-{name}.jpg'), quality=86)
    print('made', name)


def make(name, seed):
    rng = np.random.default_rng(seed)
    if name == 'midnight-aurora':
        img = mesh(rng, '#060a1c', [(0.15, 0.2, 0.34, '#1d4ed8', 1.0), (0.85, 0.25, 0.30, '#7c3aed', 0.9), (0.5, 0.95, 0.36, '#0ea5e9', 0.55), (0.9, 0.9, 0.22, '#c026d3', 0.35)])
        img = glow(img, 0.3, 0.1, 0.25, '#60a5fa', 0.18)
    elif name == 'obsidian-flow':
        img = mesh(rng, '#05050b', [(0.1, 0.9, 0.3, '#4c1d95', 0.9), (0.9, 0.15, 0.28, '#be185d', 0.75), (0.55, 0.55, 0.2, '#1e1b4b', 0.8)], base_w=0.6)
        img = waves(rng, img, [(0.62, 0.09, 1.1, 0.4, '#1b1033', '#05050b', 0.55), (0.72, 0.07, 1.4, 1.9, '#3b0764', '#0a0614', 0.55), (0.84, 0.05, 1.8, 3.1, '#701a75', '#12051c', 0.5)])
        img = glow(img, 0.78, 0.62, 0.12, '#f472b6', 0.22)
    elif name == 'nebula':
        img = mesh(rng, '#070312', [(0.2, 0.3, 0.3, '#9d174d', 0.85), (0.8, 0.7, 0.34, '#1d4ed8', 0.95), (0.55, 0.15, 0.22, '#6d28d9', 0.7), (0.3, 0.95, 0.25, '#0e7490', 0.5)], warp=0.26)
        n = smooth_noise(rng, 6, 4)
        img = np.clip(img * (0.8 + 0.4 * n[..., None]), 0, 1)
    elif name == 'deep-ocean':
        img = mesh(rng, '#03121f', [(0.5, 0.0, 0.5, '#0e7490', 0.7), (0.1, 0.4, 0.3, '#0c4a6e', 0.8)], base_w=0.5)
        img = waves(rng, img, [(0.50, 0.07, 1.0, 0.2, '#0e7490', '#04202e', 0.42), (0.62, 0.06, 1.3, 1.4, '#0891b2', '#05283a', 0.5), (0.74, 0.05, 1.7, 2.6, '#0369a1', '#031a2c', 0.6), (0.87, 0.04, 2.1, 4.0, '#075985', '#021320', 0.75)])
        img = glow(img, 0.5, 0.3, 0.3, '#67e8f9', 0.14)
    elif name == 'cloud-pastel':
        img = mesh(rng, '#f7f0ff', [(0.1, 0.15, 0.32, '#f9a8d4', 0.95), (0.9, 0.2, 0.3, '#c4b5fd', 0.95), (0.5, 0.95, 0.36, '#bae6fd', 0.9), (0.95, 0.9, 0.22, '#fde68a', 0.5)], base_w=0.5)
        img = finish(img, rng, vignette=0.03)
        return img
    elif name == 'morning-mist':
        img = mesh(rng, '#f1f7ff', [(0.1, 0.9, 0.35, '#93c5fd', 0.9), (0.9, 0.1, 0.32, '#bfdbfe', 0.9), (0.55, 0.45, 0.25, '#e0e7ff', 0.8), (0.2, 0.1, 0.2, '#a5f3fc', 0.5)], base_w=0.55)
        img = finish(img, rng, vignette=0.02)
        return img
    elif name == 'peach-glow':
        img = mesh(rng, '#fff3e8', [(0.12, 0.2, 0.32, '#fdba74', 0.95), (0.88, 0.3, 0.3, '#fb7185', 0.8), (0.5, 0.95, 0.36, '#fcd34d', 0.7), (0.9, 0.95, 0.2, '#f9a8d4', 0.6)], base_w=0.45)
        img = finish(img, rng, vignette=0.03)
        return img
    elif name == 'mint-fresh':
        img = mesh(rng, '#effcf6', [(0.1, 0.2, 0.3, '#6ee7b7', 0.95), (0.9, 0.3, 0.3, '#5eead4', 0.85), (0.5, 0.95, 0.35, '#a7f3d0', 0.9), (0.92, 0.95, 0.2, '#bae6fd', 0.6)], base_w=0.5)
        img = finish(img, rng, vignette=0.03)
        return img
    elif name == 'sunset-waves':
        img = mesh(rng, '#2a0a2e', [(0.5, 0.05, 0.5, '#f97316', 0.8), (0.1, 0.3, 0.3, '#be185d', 0.7)], base_w=0.5)
        img = waves(rng, img, [(0.48, 0.07, 1.0, 0.3, '#fb923c', '#be123c', 0.9), (0.60, 0.06, 1.3, 1.6, '#e11d48', '#7e22ce', 0.9), (0.73, 0.05, 1.7, 2.9, '#a21caf', '#3b0764', 0.92), (0.87, 0.04, 2.1, 4.2, '#6d28d9', '#1e1b4b', 0.95)])
        img = glow(img, 0.5, 0.36, 0.28, '#fde68a', 0.25)
    elif name == 'electric-blue':
        img = mesh(rng, '#0b1470', [(0.12, 0.2, 0.34, '#2563eb', 1.0), (0.88, 0.3, 0.3, '#06b6d4', 0.9), (0.5, 0.95, 0.4, '#4f46e5', 0.95), (0.95, 0.95, 0.2, '#a78bfa', 0.6)], base_w=0.3, warp=0.22)
        img = glow(img, 0.25, 0.15, 0.22, '#93c5fd', 0.2)
    elif name == 'ultraviolet':
        img = mesh(rng, '#1a0536', [(0.15, 0.25, 0.32, '#a21caf', 1.0), (0.85, 0.2, 0.3, '#7c3aed', 0.95), (0.5, 0.95, 0.38, '#ec4899', 0.85), (0.9, 0.9, 0.2, '#38bdf8', 0.4)], base_w=0.3, warp=0.22)
        img = glow(img, 0.8, 0.12, 0.22, '#f0abfc', 0.2)
    elif name == 'emerald-night':
        img = mesh(rng, '#03120e', [(0.15, 0.85, 0.34, '#047857', 0.95), (0.85, 0.2, 0.3, '#0f766e', 0.8), (0.5, 0.5, 0.2, '#064e3b', 0.7), (0.9, 0.9, 0.2, '#65a30d', 0.3)], base_w=0.5)
        img = glow(img, 0.2, 0.9, 0.25, '#34d399', 0.16)
    elif name == 'graphite':
        img = mesh(rng, '#0b0c10', [(0.1, 0.1, 0.35, '#2a2e3a', 0.9), (0.9, 0.9, 0.35, '#1c1f28', 0.9), (0.7, 0.2, 0.2, '#3a3f4f', 0.5)], base_w=0.6, warp=0.12)
        img = glow(img, 0.3, 0.2, 0.3, '#94a3b8', 0.07)
    else:
        raise SystemExit('unknown wallpaper ' + name)
    return finish(img, rng)


NAMES = ['midnight-aurora', 'obsidian-flow', 'nebula', 'deep-ocean', 'sunset-waves', 'electric-blue', 'ultraviolet', 'emerald-night', 'graphite',
         'cloud-pastel', 'morning-mist', 'peach-glow', 'mint-fresh']

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    only = sys.argv[1:] or NAMES
    for i, n in enumerate(NAMES):
        if n in only:
            save(n, make(n, 1000 + i))
