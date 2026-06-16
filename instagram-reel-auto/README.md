# Instagram 동기부여 릴스 자동화

매일 오전 8시 — Claude가 명언 생성 → 영상 제작 → 자동 업로드

---

## 준비물

- Python 3.8+
- ffmpeg
- Anthropic API 키 (claude.ai)
- Instagram 비즈니스/크리에이터 계정 + Facebook Developer App

---

## 1단계: 패키지 설치

```
setup.bat 더블클릭
```

또는:
```
pip install -r requirements.txt
winget install ffmpeg
```

---

## 2단계: Instagram API 설정

### 2-1. Facebook 개발자 앱 만들기
1. https://developers.facebook.com → **My Apps → Create App**
2. App type: **Business** 선택
3. 앱 이름 입력 (예: "MyReelBot")

### 2-2. Instagram 제품 추가
1. 앱 대시보드 → **Add Product → Instagram**
2. **API setup with Instagram Login** 선택
3. Instagram Professional 계정 연결

### 2-3. Access Token 발급
1. Instagram Graph API 섹션 → **Generate Access Token**
2. 계정 선택 → 권한 허용:
   - `instagram_content_publish`
   - `instagram_basic`
   - `pages_read_engagement`
3. 토큰 복사

### 2-4. Long-lived Token 변환 (60일 유효)
브라우저 주소창에 입력:
```
https://graph.facebook.com/oauth/access_token?grant_type=fb_exchange_token&client_id={앱ID}&client_secret={앱시크릿}&fb_exchange_token={단기토큰}
```
→ 반환된 `access_token` 값이 장기 토큰

### 2-5. Instagram User ID 확인
```
https://graph.facebook.com/v21.0/me?fields=id,username&access_token={장기토큰}
```
→ 반환된 `id` 값이 User ID

---

## 3단계: config.json 입력

```json
{
  "anthropic_api_key": "sk-ant-...",
  "instagram": {
    "access_token": "EAA...",
    "user_id": "123456789012345",
    ...
  }
}
```

---

## 4단계: 설정 확인

```
python test_setup.py
```

모두 ✅ 이면 준비 완료.

---

## 5단계: 테스트 실행

```
python main.py
```

`output/` 폴더에 영상이 생성되고 인스타에 업로드됩니다.

---

## 6단계: 매일 자동화

```
schedule_daily.bat  (관리자 권한으로 실행)
```

매일 오전 8시에 자동 실행됩니다.

---

## 폴더 구조

```
instagram-reel-auto/
├── config.json          ← API 키 (외부 공유 금지!)
├── main.py              ← 메인 실행
├── generate_content.py  ← Claude 명언 생성
├── create_video.py      ← 릴스 영상 제작
├── post_instagram.py    ← API 업로드
├── test_setup.py        ← 설정 확인
├── setup.bat            ← 패키지 설치
├── schedule_daily.bat   ← 매일 자동화 등록
├── backgrounds/         ← BGM MP3 파일 넣는 곳 (선택)
├── output/              ← 생성된 영상 저장
└── logs/                ← 실행 로그
```

---

## 영상 테마 변경

`config.json`의 `video_theme` 값:
- `dark` — 진한 남색 + 금색 (기본)
- `midnight` — 딥퍼플 + 하늘색
- `forest` — 다크그린 + 연두
- `rose` — 다크레드 + 로즈골드

## 배경음악 추가

`backgrounds/` 폴더에 `.mp3` 또는 `.m4a` 파일을 넣으면 자동으로 추가됩니다.
(음량은 자동으로 25%로 낮춰서 명언이 잘 보이도록 처리)

---

## 주의사항

- Access Token은 60일마다 갱신 필요
- 하루 1개 업로드 권장 (인스타 정책상 과도한 자동화는 계정 위험)
- config.json 절대 외부 공유 금지 (토큰 포함)
- `logs/` 폴더에서 오류 확인 가능
