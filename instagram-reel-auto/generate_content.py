"""
명언 콘텐츠 생성 — API 없이 로컬 데이터베이스 사용 (완전 무료)

config.json에 "use_ai": true 를 추가하면 Gemini API 무료 티어 사용
"""

import json
import random
import hashlib
from datetime import date
from pathlib import Path


def _get_today_index(total: int) -> int:
    """날짜 기반 인덱스 — 매일 다른 명언, 같은 날은 항상 같은 명언"""
    seed = date.today().toordinal()
    return seed % total


def _build_caption(quote: str, author: str, theme: str) -> str:
    theme_intros = {
        "도전": "두려움 없이 도전하는 자만이 성장합니다.",
        "성장": "어제의 나보다 오늘의 내가 조금 더 나아지면 됩니다.",
        "노력": "보이지 않는 곳에서의 노력이 빛나는 순간을 만듭니다.",
        "자기계발": "스스로를 가꾸는 것이 가장 가치 있는 투자입니다.",
        "성공": "성공은 결과가 아니라 매일의 선택입니다.",
        "마인드셋": "생각이 바뀌면 행동이 바뀌고, 행동이 바뀌면 삶이 바뀝니다.",
        "긍정": "긍정적인 시각이 긍정적인 현실을 만듭니다.",
        "꾸준함": "매일 조금씩, 멈추지 않는 것이 전부입니다.",
        "목표": "명확한 목표가 있는 사람은 흔들리지 않습니다.",
        "시간관리": "시간을 지배하는 자가 인생을 지배합니다.",
        "인내": "견디는 자에게 반드시 기회가 옵니다.",
        "용기": "용기는 두려움이 없는 것이 아니라, 두려움에도 행동하는 것입니다.",
        "회복탄력성": "넘어져도 다시 일어서는 힘, 그것이 당신의 강점입니다.",
        "행동": "생각은 시작이고, 행동이 현실을 만듭니다.",
        "변화": "변화는 불편하지만, 성장은 그 안에 있습니다.",
        "열정": "열정이 있는 곳에 길이 생깁니다.",
        "자신감": "자신을 믿는 것이 모든 것의 시작입니다.",
        "결단": "결단력 있는 한 번의 선택이 인생을 바꿉니다.",
        "감사": "지금 이 순간에 감사할 것들을 찾아보세요.",
    }

    intro = theme_intros.get(theme, "오늘 하루도 한 걸음 더 나아가세요.")
    caption = f"{quote}\n\n{intro}"
    if author:
        caption += f"\n\n- {author}"
    return caption


def generate_quote(config: dict) -> dict:
    # Gemini 사용 여부 확인 (선택적)
    if config.get('use_ai') and config.get('gemini_api_key'):
        return _generate_with_gemini(config)

    # 기본: 로컬 명언 DB 사용
    quotes_path = Path("quotes.json")
    if not quotes_path.exists():
        raise FileNotFoundError("quotes.json 파일이 없습니다.")

    with open(quotes_path, encoding="utf-8") as f:
        data = json.load(f)

    quotes = data['quotes']
    idx = _get_today_index(len(quotes))
    item = quotes[idx]

    quote = item['quote']
    author = item.get('author', '')
    theme = item.get('theme', '')

    return {
        'quote': quote,
        'author': author,
        'caption': _build_caption(quote, author, theme),
        'theme': theme,
        'source': 'local_db',
        'index': idx,
    }


def _generate_with_gemini(config: dict) -> dict:
    """Gemini API 무료 티어 사용 (하루 1,500 requests 무료)"""
    try:
        import google.generativeai as genai
    except ImportError:
        raise ImportError("pip install google-generativeai  를 실행해주세요.")

    import json as _json
    import re
    import random

    genai.configure(api_key=config['gemini_api_key'])
    model = genai.GenerativeModel('gemini-1.5-flash')  # 무료 티어

    themes = config['content'].get('themes', ['성공', '자기계발', '긍정'])
    theme = random.choice(themes)

    prompt = f"""한국 인스타그램 동기부여 릴스용 명언을 만들어주세요.
테마: {theme}

조건:
- 40자 이내의 강렬한 한국어 명언
- 진부하지 않고 실제 행동을 유발하는 문장

JSON만 반환:
{{"quote": "명언", "author": "저자 또는 빈 문자열", "caption": "2-3줄 캡션 (이모지 1개)", "theme": "{theme}"}}"""

    response = model.generate_content(prompt)
    text = response.text.strip()
    match = re.search(r'\{[\s\S]*\}', text)
    if match:
        text = match.group()
    data = _json.loads(text)

    return {
        'quote': data.get('quote', ''),
        'author': data.get('author', ''),
        'caption': data.get('caption', data.get('quote', '')),
        'theme': data.get('theme', theme),
        'source': 'gemini',
    }
