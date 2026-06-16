"""실행 전 설정 검증 스크립트"""

import json
import os
import sys
import subprocess


def check_python():
    version = sys.version_info
    ok = version.major == 3 and version.minor >= 8
    status = "✅" if ok else "❌"
    print(f"{status} Python {version.major}.{version.minor} {'(OK)' if ok else '(3.8+ 필요)'}")
    return ok


def check_ffmpeg():
    try:
        result = subprocess.run(['ffmpeg', '-version'], capture_output=True)
        ok = result.returncode == 0
        print(f"{'✅' if ok else '❌'} ffmpeg {'설치됨' if ok else '미설치 — winget install ffmpeg'}")
        return ok
    except FileNotFoundError:
        print("❌ ffmpeg 미설치 — winget install ffmpeg  또는  https://ffmpeg.org/download.html")
        return False


def check_packages():
    packages = ['anthropic', 'PIL', 'requests']
    all_ok = True
    for pkg in packages:
        try:
            __import__(pkg)
            print(f"✅ {pkg}")
        except ImportError:
            print(f"❌ {pkg} 미설치 — pip install -r requirements.txt")
            all_ok = False
    return all_ok


def check_korean_font():
    font_paths = [
        "C:/Windows/Fonts/malgunbd.ttf",
        "C:/Windows/Fonts/malgun.ttf",
    ]
    for fp in font_paths:
        if os.path.exists(fp):
            print(f"✅ 한국어 폰트: {fp}")
            return True
    print("⚠️  맑은 고딕 폰트 없음 — 기본 폰트 사용 (한글 깨질 수 있음)")
    return False


def check_config():
    try:
        with open("config.json") as f:
            config = json.load(f)

        issues = []
        if config['anthropic_api_key'].startswith("YOUR_"):
            issues.append("Anthropic API 키 미입력")
        if config['instagram']['access_token'].startswith("YOUR_"):
            issues.append("Instagram Access Token 미입력")
        if config['instagram']['user_id'].startswith("YOUR_"):
            issues.append("Instagram User ID 미입력")

        if issues:
            for issue in issues:
                print(f"❌ config.json: {issue}")
            return False
        print("✅ config.json 설정 완료")
        return True
    except FileNotFoundError:
        print("❌ config.json 없음")
        return False


def check_instagram_api():
    try:
        import requests
        with open("config.json") as f:
            config = json.load(f)

        if config['instagram']['access_token'].startswith("YOUR_"):
            print("⏭️  Instagram API 테스트 건너뜀 (토큰 미입력)")
            return None

        token = config['instagram']['access_token']
        user_id = config['instagram']['user_id']

        resp = requests.get(
            f"https://graph.facebook.com/v21.0/{user_id}",
            params={'fields': 'id,username,followers_count,media_count', 'access_token': token},
            timeout=10
        )
        data = resp.json()

        if 'error' in data:
            print(f"❌ Instagram API: {data['error'].get('message', '오류')}")
            return False

        print(f"✅ Instagram API 연결 성공")
        print(f"   계정: @{data.get('username', 'N/A')}")
        print(f"   팔로워: {data.get('followers_count', 0):,}명")
        return True
    except Exception as e:
        print(f"❌ Instagram API 오류: {e}")
        return False


def check_anthropic_api():
    try:
        import anthropic
        with open("config.json") as f:
            config = json.load(f)

        if config['anthropic_api_key'].startswith("YOUR_"):
            print("⏭️  Anthropic API 테스트 건너뜀 (키 미입력)")
            return None

        client = anthropic.Anthropic(api_key=config['anthropic_api_key'])
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=10,
            messages=[{"role": "user", "content": "안녕"}]
        )
        print("✅ Anthropic API 연결 성공")
        return True
    except Exception as e:
        print(f"❌ Anthropic API 오류: {e}")
        return False


if __name__ == "__main__":
    print("=" * 50)
    print("  설정 검증 시작")
    print("=" * 50)

    print("\n[환경]")
    check_python()
    check_ffmpeg()

    print("\n[패키지]")
    check_packages()
    check_korean_font()

    print("\n[설정]")
    check_config()

    print("\n[API 연결]")
    check_instagram_api()
    check_anthropic_api()

    print("\n" + "=" * 50)
    print("  모든 ✅ 이면 python main.py 로 실행하세요")
    print("=" * 50)
