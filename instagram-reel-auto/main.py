"""
Instagram 동기부여 릴스 자동화
실행: python main.py
"""

import json
import sys
import logging
from datetime import datetime
from pathlib import Path

# 로그 설정
Path("logs").mkdir(exist_ok=True)
log_file = f"logs/run_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler(log_file, encoding='utf-8'),
        logging.StreamHandler(sys.stdout),
    ]
)
log = logging.getLogger(__name__)


def load_config():
    with open("config.json", "r", encoding="utf-8") as f:
        config = json.load(f)

    if config['instagram']['access_token'].startswith("YOUR_"):
        raise ValueError("config.json에 Instagram Access Token을 입력해주세요.")
    if config['instagram']['user_id'].startswith("YOUR_"):
        raise ValueError("config.json에 Instagram User ID를 입력해주세요.")

    return config


def main():
    log.info("=" * 55)
    log.info("  Instagram 동기부여 릴스 자동화 시작")
    log.info("=" * 55)

    try:
        config = load_config()
    except (FileNotFoundError, ValueError) as e:
        log.error(f"설정 오류: {e}")
        sys.exit(1)

    # STEP 1: 명언 생성
    log.info("\n[STEP 1] 오늘의 명언 생성 중...")
    from generate_content import generate_quote
    quote_data = generate_quote(config)

    log.info(f"  명언   : {quote_data['quote']}")
    if quote_data.get('author'):
        log.info(f"  출처   : {quote_data['author']}")
    log.info(f"  테마   : {quote_data['theme']}")

    # STEP 2: 영상 제작
    log.info("\n[STEP 2] 릴스 영상 제작 중...")
    from create_video import create_reel_video
    video_path = create_reel_video(
        quote=quote_data['quote'],
        author=quote_data.get('author', ''),
        output_dir="output",
        config=config,
    )
    log.info(f"  완료: {video_path}")

    # STEP 3: 인스타그램 업로드
    log.info("\n[STEP 3] 인스타그램 업로드 중...")
    from post_instagram import post_reel

    hashtags = config['instagram'].get('caption_hashtags', '')
    caption = quote_data['caption']
    if hashtags:
        caption = f"{caption}\n.\n.\n{hashtags}"

    result = post_reel(
        video_path=video_path,
        caption=caption,
        config=config,
    )

    log.info("\n" + "=" * 55)
    if result['success']:
        log.info("  ✅ 업로드 성공!")
        log.info(f"  게시물 ID: {result['post_id']}")
    else:
        log.error(f"  ❌ 업로드 실패: {result['error']}")
        sys.exit(1)
    log.info("=" * 55)


if __name__ == "__main__":
    main()
