# 네이버 블로그 서로이웃 자동화

명령 하나로 서로이웃 신청 + 맞춤 멘트 + 댓글 자동 처리

---

## 사용 방법

### 1단계: 설정
`config.json` 열어서 입력:
- 네이버 아이디/비밀번호
- 하루 처리 인원 (기본 15명)
- 블로그 간 대기 시간 (기본 7분)

### 2단계: 대상 블로그 입력
`targets.txt` 열어서 블로그 URL 한 줄씩 추가:
```
https://blog.naver.com/example1
https://blog.naver.com/example2
```

### 3단계: 실행 (명령 하나)
Claude Code에서:
```
prompt.md 파일 읽고 그대로 실행해줘
```

끝! Claude가 알아서 전부 처리합니다.

---

## 폴더 구조
```
naver-blog-auto/
├── config.json   ← 아이디/비번/설정
├── targets.txt   ← 대상 블로그 목록
├── prompt.md     ← 자동화 명령 (수정 불필요)
└── README.md     ← 이 파일
```

---

## 주의사항
- 하루 15명 이상은 계정 위험
- 첫 실행 시 캡차가 뜰 수 있음 (수동 해결 필요)
- config.json은 절대 외부에 공유 금지 (비밀번호 있음)
