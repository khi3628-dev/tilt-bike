# CrazyGames 표지: 1920x1080 / 800x1200 / 800x800, 영어·한국어 + 글자 없는 판
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os
os.chdir('/home/claude/tiltbike')
src = Image.open('art/title.jpg').convert('RGB')          # 1344x752
INTER = '/usr/share/fonts/opentype/inter/InterDisplay-Bold.otf'
CJK = '/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc'
os.makedirs('store', exist_ok=True)

def fit(img, W, H, cx=0.26, cy=0.0):
    r = max(W / img.width, H / img.height)
    w, h = round(img.width * r), round(img.height * r)
    big = img.resize((w, h), Image.LANCZOS)
    x = min(0, max(W - w, round(W / 2 - cx * w)))
    y = min(0, max(H - h, -round(cy * (h - H))))
    out = Image.new('RGB', (W, H)); out.paste(big, (x, y)); return out

def logo(canvas, text, font_path, size, y_frac, sub=None):
    W, H = canvas.size
    font = ImageFont.truetype(font_path, size, index=0)
    d = ImageDraw.Draw(canvas)
    bbox = d.textbbox((0, 0), text, font=font, stroke_width=round(size * 0.09))
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (W - tw) // 2 - bbox[0]; y = round(H * y_frac) - bbox[1]
    # 그림자
    sh = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).text((x + size * 0.04, y + size * 0.07), text, font=font, fill=(10, 30, 50, 170), stroke_width=round(size * 0.09), stroke_fill=(10, 30, 50, 170))
    sh = sh.filter(ImageFilter.GaussianBlur(size * 0.06))
    canvas.paste(sh, (0, 0), sh)
    d.text((x, y), text, font=font, fill=(255, 212, 59), stroke_width=round(size * 0.09), stroke_fill=(20, 40, 70))
    if sub:
        f2 = ImageFont.truetype(font_path, round(size * 0.34), index=0)
        b2 = d.textbbox((0, 0), sub, font=f2, stroke_width=round(size * 0.03))
        x2 = (W - (b2[2] - b2[0])) // 2 - b2[0]; y2 = y + th + round(size * 0.12) - b2[1]
        d.text((x2, y2), sub, font=f2, fill=(255, 255, 255), stroke_width=round(size * 0.03), stroke_fill=(20, 40, 70))

SIZES = [(1920, 1080, 0.26, 0.0, 0.70, 150), (800, 1200, 0.26, 0.0, 0.66, 120), (800, 800, 0.30, 0.0, 0.74, 110)]
for W, H, cx, cy, yf, fs in SIZES:
    base = fit(src, W, H, cx, cy)
    base.save(f'store/cover_{W}x{H}_plain.jpg', quality=92)
    en = base.copy(); logo(en, 'TILT BIKE', INTER, fs, yf, 'tilt your phone · ride the hills')
    en.save(f'store/cover_{W}x{H}_en.jpg', quality=92)
    ko = base.copy(); logo(ko, '기울기 자전거', CJK, round(fs * 0.9), yf, '폰을 기울여 언덕을 달려요')
    ko.save(f'store/cover_{W}x{H}_ko.jpg', quality=92)
    print(W, H, 'ok')
# 미리보기 한 장
sheet = Image.new('RGB', (1920 + 800 + 800 + 40, 1200), 'white')
sheet.paste(Image.open('store/cover_1920x1080_en.jpg'), (0, 0))
sheet.paste(Image.open('store/cover_800x1200_en.jpg'), (1940, 0))
sheet.paste(Image.open('store/cover_800x800_ko.jpg'), (2760, 0))
sheet.resize((sheet.width // 2, sheet.height // 2)).save('test/contact_cover.png')
print('sheet ok')
