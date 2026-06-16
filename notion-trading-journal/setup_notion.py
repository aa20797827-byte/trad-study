"""
노션 매매일지 데이터베이스 자동 생성 스크립트
처음 한 번만 실행하면 됩니다.

사용법:
  python setup_notion.py <PARENT_PAGE_ID>

  PARENT_PAGE_ID: 데이터베이스를 만들 노션 페이지 ID
  (페이지 URL의 마지막 32자리 - 하이픈 제외)
"""

import sys
import os
from notion_client import Client
from dotenv import load_dotenv

load_dotenv()

NOTION_TOKEN = os.getenv("NOTION_TOKEN")

if not NOTION_TOKEN:
    print("❌ .env 파일에 NOTION_TOKEN이 없습니다.")
    sys.exit(1)

if len(sys.argv) < 2:
    print("사용법: python setup_notion.py <PARENT_PAGE_ID>")
    sys.exit(1)

parent_page_id = sys.argv[1].replace("-", "")
notion = Client(auth=NOTION_TOKEN)

print("📋 노션 데이터베이스 생성 중...")

db = notion.databases.create(
    parent={"type": "page_id", "page_id": parent_page_id},
    title=[{"type": "text", "text": {"content": "📈 국장 데이트레이딩 매매일지"}}],
    icon={"type": "emoji", "emoji": "📈"},
    properties={
        "이름": {"title": {}},
        "날짜": {"date": {}},
        "종목명": {"rich_text": {}},
        "종목코드": {"rich_text": {}},
        "거래유형": {
            "select": {
                "options": [
                    {"name": "매수", "color": "blue"},
                    {"name": "매도", "color": "red"},
                    {"name": "공매도", "color": "orange"},
                ]
            }
        },
        "진입가": {"number": {"format": "number_with_commas"}},
        "청산가": {"number": {"format": "number_with_commas"}},
        "수량": {"number": {"format": "number"}},
        "투자금액": {"number": {"format": "number_with_commas"}},
        "손익금": {"number": {"format": "number_with_commas"}},
        "손익률(%)": {"number": {"format": "percent"}},
        "감정상태": {
            "select": {
                "options": [
                    {"name": "😌 평온", "color": "green"},
                    {"name": "😤 탐욕", "color": "red"},
                    {"name": "😰 공포", "color": "purple"},
                    {"name": "😟 불안", "color": "orange"},
                    {"name": "😎 자신감", "color": "blue"},
                    {"name": "😵 혼란", "color": "gray"},
                ]
            }
        },
        "결과": {
            "select": {
                "options": [
                    {"name": "✅ 익절", "color": "green"},
                    {"name": "❌ 손절", "color": "red"},
                    {"name": "🔄 홀딩중", "color": "yellow"},
                    {"name": "😑 본전", "color": "gray"},
                ]
            }
        },
    },
)

db_id = db["id"]
print(f"✅ 데이터베이스 생성 완료!")
print(f"📌 DATABASE_ID: {db_id}")
print()
print("👉 .env 파일에 아래 내용을 추가하세요:")
print(f"NOTION_DATABASE_ID={db_id}")
