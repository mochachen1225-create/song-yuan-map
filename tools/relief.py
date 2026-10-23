"""把山脈、高原的範圍做成柔和的「假地形」陰影圖（JPEG，白色＝不變，用 multiply 疊在陸地上）。
輸入：build-basemap.mjs 輸出的像素座標多邊形。只用 Natural Earth 的範圍，不用高程資料。"""
import json, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

src, out = sys.argv[1], sys.argv[2]
d = json.load(open(src))
W, H = d['w'], d['h']
masks = {'r': Image.new('L', (W, H), 0), 'p': Image.new('L', (W, H), 0)}
for p in d['polys']:
    dr = ImageDraw.Draw(masks[p['k']])
    for i, ring in enumerate(p['rings']):
        dr.polygon([tuple(q) for q in ring], fill=0 if i else 255)

def blur(img, r):
    return np.asarray(img.filter(ImageFilter.GaussianBlur(r)), dtype=np.float32) / 255

rng = np.random.default_rng(7)
def noise(scale):
    n = rng.random((max(2, H // scale), max(2, W // scale))).astype(np.float32)
    return np.asarray(Image.fromarray((n * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC), dtype=np.float32) / 255

# 山脊感：幾層不同大小的雜訊，取「脊」(1-|2n-1|)，越往山脈中間越明顯
ridge = sum(w * (1 - np.abs(2 * noise(s) - 1)) for s, w in ((7, .45), (14, .35), (28, .2)))
R = masks['r']; P = masks['p']
core = blur(R, 6)
h = blur(R, 4) * .35 + blur(R, 10) * .65 + blur(P, 16) * .3
h = h + core ** 1.5 * ridge * 1.1 + blur(P, 10) * noise(12) * .12
h *= 14  # 高度誇張

gy, gx = np.gradient(h)
L = np.array([-1, -1, 1.15], dtype=np.float32); L /= np.linalg.norm(L)   # 光從左上（西北）來；影像 y 往下
lz = L[2]
hs = (-gx * L[0] - gy * L[1] + L[2]) / np.sqrt(gx ** 2 + gy ** 2 + 1)
shadow = np.clip((lz - hs) * 1.5, 0, 1)                 # 背光面
lit = np.clip((hs - lz) * 1.2, 0, 1)                    # 向光面（multiply 只能變暗，所以只減少一點底色）
tint = np.clip(blur(R, 6) * .55 + blur(P, 10) * .25, 0, 1)  # 山區整體偏一點暖褐色
dark = np.clip(shadow * .5 + tint * .14 - lit * .05, 0, .6)
col = np.array([.62, .55, .44], dtype=np.float32)       # 陰影的顏色（褐色）
rgb = 1 - dark[..., None] * (1 - col)
Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8), 'RGB').save(out, quality=72, optimize=True, progressive=True)
