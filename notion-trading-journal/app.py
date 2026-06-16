import os
import uuid
from datetime import datetime, date

from flask import Flask, render_template, request, redirect, url_for, flash, send_from_directory
from notion_client import Client
from notion_client.errors import APIResponseError
from dotenv import load_dotenv
from werkzeug.utils import secure_filename

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "trading-journal-dev-key")

NOTION_TOKEN = os.getenv("NOTION_TOKEN")
DATABASE_ID = os.getenv("NOTION_DATABASE_ID")
UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), "uploads")
ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp"}

app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024  # 20MB

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

notion = Client(auth=NOTION_TOKEN) if NOTION_TOKEN else None


def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def calc_pnl(trade_type: str, entry: float, exit_p: float, qty: int):
    if trade_type in ("매수",):
        pnl = (exit_p - entry) * qty
        rate = (exit_p - entry) / entry * 100
    else:  # 매도/공매도
        pnl = (entry - exit_p) * qty
        rate = (entry - exit_p) / entry * 100
    return round(pnl), round(rate, 2)


def get_result_label(pnl: float | None) -> str:
    if pnl is None:
        return "🔄 홀딩중"
    if pnl > 0:
        return "✅ 익절"
    if pnl < 0:
        return "❌ 손절"
    return "😑 본전"


@app.route("/")
def index():
    trades = []
    error_msg = None

    if not NOTION_TOKEN or not DATABASE_ID:
        error_msg = ".env 파일에 NOTION_TOKEN과 NOTION_DATABASE_ID를 설정해주세요."
    else:
        try:
            result = notion.databases.query(
                database_id=DATABASE_ID,
                sorts=[{"property": "날짜", "direction": "descending"}],
                page_size=20,
            )
            for page in result["results"]:
                props = page["properties"]
                trades.append({
                    "id": page["id"],
                    "url": page["url"],
                    "name": _text(props.get("이름")),
                    "date": _date(props.get("날짜")),
                    "stock": _text(props.get("종목명")),
                    "code": _text(props.get("종목코드")),
                    "type": _select(props.get("거래유형")),
                    "entry": _number(props.get("진입가")),
                    "exit": _number(props.get("청산가")),
                    "qty": _number(props.get("수량")),
                    "invest": _number(props.get("투자금액")),
                    "pnl": _number(props.get("손익금")),
                    "pnl_rate": _number(props.get("손익률(%)")),
                    "emotion": _select(props.get("감정상태")),
                    "result": _select(props.get("결과")),
                })
        except APIResponseError as e:
            error_msg = f"노션 API 오류: {e.message}"
        except Exception as e:
            error_msg = f"데이터 조회 실패: {str(e)}"

    today = date.today().isoformat()
    return render_template("index.html", trades=trades, today=today, error_msg=error_msg)


@app.route("/add-trade", methods=["POST"])
def add_trade():
    if not notion or not DATABASE_ID:
        flash("노션 연결 설정이 필요합니다.", "error")
        return redirect(url_for("index"))

    try:
        trade_date = request.form["trade_date"]
        stock_name = request.form["stock_name"].strip()
        stock_code = request.form["stock_code"].strip()
        trade_type = request.form["trade_type"]
        entry_price = float(request.form["entry_price"].replace(",", ""))
        exit_price_raw = request.form.get("exit_price", "").replace(",", "")
        quantity = int(request.form["quantity"].replace(",", ""))
        strategy = request.form.get("strategy", "").strip()
        emotion = request.form.get("emotion", "")
        psychology = request.form.get("psychology", "").strip()

        exit_price = float(exit_price_raw) if exit_price_raw else None
        investment = entry_price * quantity
        pnl, pnl_rate = (None, None)
        if exit_price is not None:
            pnl, pnl_rate = calc_pnl(trade_type, entry_price, exit_price, quantity)
        result_label = get_result_label(pnl)

        # 차트 이미지 저장
        chart_filename = None
        file = request.files.get("chart_image")
        if file and file.filename and allowed_file(file.filename):
            ext = file.filename.rsplit(".", 1)[1].lower()
            chart_filename = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}.{ext}"
            file.save(os.path.join(app.config["UPLOAD_FOLDER"], chart_filename))

        page_title = f"{stock_name}({stock_code}) {trade_type} - {trade_date}"

        properties: dict = {
            "이름": {"title": [{"text": {"content": page_title}}]},
            "날짜": {"date": {"start": trade_date}},
            "종목명": {"rich_text": [{"text": {"content": stock_name}}]},
            "종목코드": {"rich_text": [{"text": {"content": stock_code}}]},
            "거래유형": {"select": {"name": trade_type}},
            "진입가": {"number": entry_price},
            "수량": {"number": quantity},
            "투자금액": {"number": investment},
            "결과": {"select": {"name": result_label}},
        }
        if exit_price is not None:
            properties["청산가"] = {"number": exit_price}
        if pnl is not None:
            properties["손익금"] = {"number": pnl}
        if pnl_rate is not None:
            properties["손익률(%)"] = {"number": pnl_rate / 100}  # Notion percent = 0~1
        if emotion:
            properties["감정상태"] = {"select": {"name": emotion}}

        children = []

        if strategy:
            children += [
                {"object": "block", "type": "heading_2",
                 "heading_2": {"rich_text": [{"text": {"content": "📈 매매 근거 / 전략"}}]}},
                {"object": "block", "type": "paragraph",
                 "paragraph": {"rich_text": [{"text": {"content": strategy}}]}},
            ]

        if psychology:
            children += [
                {"object": "block", "type": "heading_2",
                 "heading_2": {"rich_text": [{"text": {"content": "🧠 심리 기록"}}]}},
                {"object": "block", "type": "paragraph",
                 "paragraph": {"rich_text": [{"text": {"content": psychology}}]}},
            ]

        if chart_filename:
            children += [
                {"object": "block", "type": "heading_2",
                 "heading_2": {"rich_text": [{"text": {"content": "📊 차트 스크린샷"}}]}},
                {"object": "block", "type": "paragraph",
                 "paragraph": {"rich_text": [{"text": {"content": f"파일명: {chart_filename}"}}]}},
                {"object": "block", "type": "callout",
                 "callout": {
                     "rich_text": [{"text": {"content": f"로컬 저장 경로: uploads/{chart_filename}"}}],
                     "icon": {"emoji": "📁"},
                 }},
            ]

        notion.pages.create(
            parent={"database_id": DATABASE_ID},
            properties=properties,
            children=children or [],
        )

        flash(f"✅ [{stock_name}] 매매일지가 노션에 기록되었습니다!", "success")

    except APIResponseError as e:
        flash(f"노션 API 오류: {e.message}", "error")
    except (ValueError, KeyError) as e:
        flash(f"입력값 오류: {str(e)}", "error")
    except Exception as e:
        flash(f"오류 발생: {str(e)}", "error")

    return redirect(url_for("index"))


@app.route("/uploads/<filename>")
def uploaded_file(filename: str):
    return send_from_directory(app.config["UPLOAD_FOLDER"], filename)


# ── Notion property helpers ──────────────────────────────────────────────────

def _text(prop) -> str:
    if not prop:
        return ""
    if prop["type"] == "title":
        parts = prop.get("title", [])
    else:
        parts = prop.get("rich_text", [])
    return "".join(p["plain_text"] for p in parts)


def _date(prop) -> str:
    if not prop or not prop.get("date"):
        return ""
    return prop["date"].get("start", "")


def _number(prop) -> float | None:
    if not prop:
        return None
    return prop.get("number")


def _select(prop) -> str:
    if not prop or not prop.get("select"):
        return ""
    return prop["select"].get("name", "")


if __name__ == "__main__":
    if not NOTION_TOKEN:
        print("⚠️  경고: .env에 NOTION_TOKEN이 설정되지 않았습니다.")
    if not DATABASE_ID:
        print("⚠️  경고: .env에 NOTION_DATABASE_ID가 설정되지 않았습니다.")
        print("   setup_notion.py를 먼저 실행하거나 .env에 직접 입력해주세요.")
    print("🚀 서버 시작: http://localhost:5000")
    app.run(debug=True, port=5000)
