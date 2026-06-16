"""PIL + ffmpeg를 사용해 9:16 동기부여 릴스 영상 생성"""

import os
import subprocess
import random
from pathlib import Path
from datetime import datetime
from PIL import Image, ImageDraw, ImageFont


THEMES = {
    'dark':     {'bg1': (8, 8, 20),   'bg2': (28, 28, 58),  'text': (255, 255, 255), 'accent': (255, 210, 50),  'dim': (50, 42, 10)},
    'midnight': {'bg1': (5, 5, 30),   'bg2': (15, 10, 55),  'text': (255, 255, 255), 'accent': (90, 200, 255),  'dim': (18, 40, 51)},
    'forest':   {'bg1': (5, 25, 15),  'bg2': (10, 55, 30),  'text': (255, 255, 255), 'accent': (120, 255, 140), 'dim': (24, 51, 28)},
    'rose':     {'bg1': (25, 10, 15), 'bg2': (55, 20, 35),  'text': (255, 255, 255), 'accent': (255, 150, 180), 'dim': (51, 30, 36)},
}

KOREAN_FONTS = [
    "C:/Windows/Fonts/malgunbd.ttf",
    "C:/Windows/Fonts/malgun.ttf",
    "C:/Windows/Fonts/NanumGothicBold.ttf",
    "C:/Windows/Fonts/NanumGothic.ttf",
    "C:/Windows/Fonts/gulim.ttc",
]


def _find_font():
    for fp in KOREAN_FONTS:
        if os.path.exists(fp):
            return fp
    return None


def _wrap_text(text, font, max_width, draw):
    lines = []
    for paragraph in text.split('\n'):
        words = paragraph.split(' ')
        current = []
        for word in words:
            test = ' '.join(current + [word])
            bbox = draw.textbbox((0, 0), test, font=font)
            if bbox[2] - bbox[0] <= max_width or not current:
                current.append(word)
            else:
                lines.append(' '.join(current))
                current = [word]
        if current:
            lines.append(' '.join(current))
    return lines


def create_quote_image(quote: str, author: str, theme_name: str,
                        width=1080, height=1920) -> Image.Image:
    colors = THEMES.get(theme_name, THEMES['dark'])

    # Vertical gradient background
    img = Image.new('RGB', (width, height))
    draw = ImageDraw.Draw(img)
    for y in range(height):
        ratio = y / height
        r = int(colors['bg1'][0] + (colors['bg2'][0] - colors['bg1'][0]) * ratio)
        g = int(colors['bg1'][1] + (colors['bg2'][1] - colors['bg1'][1]) * ratio)
        b = int(colors['bg1'][2] + (colors['bg2'][2] - colors['bg1'][2]) * ratio)
        draw.line([(0, y), (width, y)], fill=(r, g, b))

    font_path = _find_font()
    QUOTE_SIZE, AUTHOR_SIZE, DECO_SIZE = 68, 40, 110

    def load_font(size):
        if font_path:
            try:
                return ImageFont.truetype(font_path, size)
            except Exception:
                pass
        return ImageFont.load_default()

    quote_font = load_font(QUOTE_SIZE)
    author_font = load_font(AUTHOR_SIZE)
    deco_font = load_font(DECO_SIZE)

    # Text layout
    padding_x = 100
    max_width = width - padding_x * 2
    lines = _wrap_text(quote, quote_font, max_width, draw)

    line_spacing = 22
    line_h = QUOTE_SIZE + line_spacing
    quote_block_h = len(lines) * line_h
    author_h = (AUTHOR_SIZE + 50) if author else 0
    total_h = quote_block_h + author_h + 80

    start_y = (height - total_h) // 2

    # Top decoration bar
    bar_w = 70
    bar_x = width // 2 - bar_w // 2
    draw.rectangle([(bar_x, start_y - 55), (bar_x + bar_w, start_y - 50)], fill=colors['accent'])

    # Dim decorative quotation mark
    draw.text((padding_x - 15, start_y - 65), '“', font=deco_font, fill=colors['dim'])

    # Quote text lines
    y = start_y
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=quote_font)
        x = (width - (bbox[2] - bbox[0])) // 2
        draw.text((x + 2, y + 2), line, font=quote_font, fill=(0, 0, 0))  # shadow
        draw.text((x, y), line, font=quote_font, fill=colors['text'])
        y += line_h

    # Author section
    if author:
        y += 25
        sep_w = 50
        draw.rectangle(
            [(width // 2 - sep_w, y), (width // 2 + sep_w, y + 2)],
            fill=colors['accent']
        )
        y += 18
        author_text = f"— {author}"
        bbox = draw.textbbox((0, 0), author_text, font=author_font)
        x = (width - (bbox[2] - bbox[0])) // 2
        draw.text((x, y), author_text, font=author_font, fill=colors['accent'])
        y += AUTHOR_SIZE + 15
    else:
        y += 20

    # Bottom decoration bar
    draw.rectangle([(bar_x, y), (bar_x + bar_w, y + 5)], fill=colors['accent'])

    return img


def check_ffmpeg() -> bool:
    try:
        result = subprocess.run(['ffmpeg', '-version'], capture_output=True)
        return result.returncode == 0
    except FileNotFoundError:
        return False


def create_reel_video(quote: str, author: str, output_dir: str, config: dict) -> str:
    if not check_ffmpeg():
        raise RuntimeError(
            "ffmpeg가 설치되지 않았습니다.\n"
            "https://ffmpeg.org/download.html 에서 다운로드 후 PATH에 추가해주세요.\n"
            "또는: winget install ffmpeg"
        )

    Path(output_dir).mkdir(exist_ok=True)

    theme = config['content'].get('video_theme', 'dark')
    duration = config['content'].get('video_duration', 20)
    fade = 1.5

    stamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    img_path = os.path.join(output_dir, f"_frame_{stamp}.png")
    video_path = os.path.join(output_dir, f"reel_{stamp}.mp4")

    img = create_quote_image(quote, author, theme)
    img.save(img_path, 'PNG')

    # Find background music (optional)
    bg_dir = Path("backgrounds")
    music_files = []
    if bg_dir.exists():
        music_files = list(bg_dir.glob("*.mp3")) + list(bg_dir.glob("*.m4a"))

    vf = f"scale=1080:1920,fade=in:st=0:d={fade},fade=out:st={duration - fade}:d={fade}"

    cmd = ['ffmpeg', '-y', '-loop', '1', '-framerate', '30', '-i', img_path]

    if music_files:
        cmd += ['-i', str(random.choice(music_files))]
        cmd += [
            '-vf', vf,
            '-af', f'afade=in:st=0:d={fade},afade=out:st={duration - fade}:d={fade},volume=0.25',
            '-c:v', 'libx264', '-crf', '23', '-preset', 'medium',
            '-c:a', 'aac', '-b:a', '128k',
            '-t', str(duration), '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart', video_path
        ]
    else:
        cmd += [
            '-vf', vf,
            '-c:v', 'libx264', '-crf', '23', '-preset', 'medium',
            '-t', str(duration), '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart', '-an', video_path
        ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    os.remove(img_path)

    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg 오류:\n{result.stderr[-1000:]}")

    return video_path
