# Instagram 동기부여 릴스 자동화 실행

`instagram-reel-auto/` 폴더로 이동 후 아래 순서대로 실행해줘.

---

## [STEP 0] 설정 확인

`instagram-reel-auto/config.json` 읽어서:
- anthropic_api_key, access_token, user_id 입력 여부 확인
- 미입력 항목 있으면 README.md의 해당 단계 안내 후 중단

---

## [STEP 1] 패키지 및 환경 점검

아래 명령 실행:
```
cd instagram-reel-auto
python test_setup.py
```

❌ 항목 있으면 해결 후 진행.

---

## [STEP 2] 릴스 생성 및 업로드

```
python main.py
```

실행 완료 후:
- `output/` 폴더에서 생성된 영상 확인
- `logs/` 폴더에서 실행 로그 확인
- 업로드 성공/실패 결과 보고

---

## [STEP 3] 오류 발생 시

로그 파일 읽어서 원인 분석 후 해결 방법 안내.
