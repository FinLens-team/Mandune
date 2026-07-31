from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parents[1] / "src/client/assets/themes"
W, H = 732, 1244
FONT = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
REGULAR = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"

CARDS = [
    ("theme-card-zhouli.webp", "周礼", "合乎周礼", "#2b1112", "#b53a2d", "#d6ad61", "ritual"),
    ("theme-card-tieba.webp", "贴吧老哥", "典中典", "#151917", "#344b3c", "#df4a3d", "tieba"),
    ("theme-card-male-succubus.webp", "男魅魔", "看着我", "#100d12", "#3b1521", "#b7253f", "male"),
    ("theme-card-female-succubus.webp", "女魅魔", "过来", "#120c14", "#4c153d", "#dd3b83", "female"),
]

def font(path, size):
    return ImageFont.truetype(path, size)

def gradient(top, bottom):
    a = tuple(int(top[i:i+2], 16) for i in (1, 3, 5))
    b = tuple(int(bottom[i:i+2], 16) for i in (1, 3, 5))
    im = Image.new("RGB", (W, H))
    px = im.load()
    for y in range(H):
        t = y / (H - 1)
        c = tuple(round(a[k] * (1-t) + b[k] * t) for k in range(3))
        for x in range(W): px[x, y] = c  # type: ignore[index]
    return im

def draw_person(d, kind, accent):
    if kind == "ritual":
        d.ellipse((246, 190, 486, 430), fill="#e5c7aa")
        d.polygon([(190, 455), (542, 455), (625, 1055), (105, 1055)], fill="#171619")
        d.polygon([(265, 430), (366, 600), (467, 430), (510, 1010), (222, 1010)], fill="#9c2b25")
        d.rounded_rectangle((315, 570, 417, 940), 18, fill="#d4b36b")
        d.ellipse((305, 285, 338, 305), fill="#221815"); d.ellipse((394, 285, 427, 305), fill="#221815")
        d.line((326, 350, 406, 350), fill="#5c3329", width=8)
        d.rectangle((225, 174, 507, 224), fill="#161519")
        for x in (235, 285, 335, 385, 435, 485): d.line((x, 174, x, 125), fill="#d4b36b", width=10)
    else:
        skin = "#ddbaa8" if kind == "tieba" else "#ead0c4"
        d.ellipse((250, 165, 482, 405), fill=skin)
        if kind == "tieba":
            d.polygon([(170, 430), (562, 430), (620, 1050), (112, 1050)], fill="#202925")
            d.polygon([(245, 430), (366, 610), (487, 430)], fill="#3b5445")
            d.arc((300, 300, 440, 380), 5, 165, fill="#351c19", width=10)
            d.rectangle((105, 835, 627, 1055), fill="#202724", outline=accent, width=8)
            d.rectangle((145, 875, 587, 1015), fill="#0d1410")
            d.line((195, 930, 540, 930), fill="#759a79", width=8)
            d.line((195, 970, 445, 970), fill="#759a79", width=8)
        else:
            d.polygon([(185, 430), (547, 430), (620, 1080), (112, 1080)], fill="#131116")
            d.polygon([(255, 430), (366, 635), (477, 430), (520, 1030), (212, 1030)], fill=accent)
            d.polygon([(272, 175), (210, 95), (315, 145)], fill="#171319")
            d.polygon([(460, 175), (522, 95), (417, 145)], fill="#171319")
            d.ellipse((304, 275, 340, 296), fill=accent); d.ellipse((392, 275, 428, 296), fill=accent)
            d.arc((318, 320, 414, 375), 10, 170, fill="#74213d", width=8)
            if kind == "female":
                d.polygon([(225, 165), (176, 480), (263, 422), (366, 205), (469, 422), (556, 480), (507, 165)], fill="#1a111b")
                d.polygon([(185, 430), (547, 430), (620, 1080), (112, 1080)], fill="#21131f")
                d.polygon([(255, 430), (366, 650), (477, 430), (520, 1030), (212, 1030)], fill=accent)
    # shoulders and foreground glow
    d.arc((75, 930, 657, 1330), 190, 350, fill=accent, width=16)

for filename, title, subtitle, top, bottom, accent, kind in CARDS:
    im = gradient(top, bottom)
    d = ImageDraw.Draw(im)
    for inset, alpha in [(24, "#ffffff22"), (42, "#ffffff12")]:
        d.rounded_rectangle((inset, inset, W-inset, H-inset), 24, outline=alpha, width=3)
    # atmospheric symbols
    for i in range(7):
        x = 70 + i * 100
        d.ellipse((x, 95 + (i%2)*35, x+7, 102 + (i%2)*35), fill=accent)
    draw_person(d, kind, accent)
    d.rectangle((0, 1015, W, H), fill="#09090bcf")
    title_font = font(FONT, 78 if len(title) <= 3 else 66)
    sub_font = font(REGULAR, 32)
    bbox = d.textbbox((0,0), title, font=title_font)
    d.text(((W-(bbox[2]-bbox[0]))/2, 1050), title, font=title_font, fill="#fff8ef")
    bbox = d.textbbox((0,0), subtitle, font=sub_font)
    d.text(((W-(bbox[2]-bbox[0]))/2, 1150), subtitle, font=sub_font, fill=accent)
    im.save(OUT / filename, "WEBP", quality=90, method=6)
    print(OUT / filename)
