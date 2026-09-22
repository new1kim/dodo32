# dodo32 프로젝트 — 작업 규칙

세션이 바뀌어도 이 파일은 자동으로 참조된다. 작업 전에 읽고, 규칙이 바뀌면 이 파일을 갱신한다.

---

## 1. 이 저장소의 성격 (가장 중요)

- **GitHub 공개 저장소**이고, 동시에 **앱의 실시간 배포 소스**다.
- Android 앱(`CallNote`)은 실행 시 다음에서 파일을 내려받는다:
  ```
  https://raw.githubusercontent.com/new1kim/dodo32/main/<파일명>
  ```
  (근거: `CallNote/app/src/main/java/com/example/callnote/AssetSyncManager.kt`)
- 즉 **루트의 파일을 지우면 그대로 앱이 깨진다.** 커밋 전 반드시 아래 2번을 확인한다.

### 앱이 실제로 사용하는 파일 (AssetSyncManager.FILES, 21개)
```
Consult_Main.html              Consult_calculator_logic.js
Consult_calculator_ui.js       Consult_style.css
DSR_Main.html                  DSR_calculator_logic.js
DSR_calculator_ui.js           DSR_style.css
시세조회.html                   소액임차보증금.png
장래예상소득증가율.png           상담일지.html
DTI.html                       신용점수기준.png
계산기.html                     날짜계산기.html
MCG.html                       IDCard.html
문서스캔.html
```
추가로 root에 있어야 하는 것: `index.html`, `gonsi.html`, `op_gongsi_data/`(~1,936개 JSON)

> `gonsi.html`은 `op_gongsi_data/*.json`(오피스텔 정적자료)에 의존한다. 이 폴더를 지우면 공시가격 오피스텔 조회가 죽는다.

---

## 2. 커밋 전 필수 점검

```powershell
C:\Program Files\Git\cmd\git.exe status --short
```

- **`D`(삭제)로 잡히는 항목이 있으면 절대 `git add -A` 하지 말 것.**
  실수로 올리면 GitHub에서 파일이 사라져 앱이 즉시 깨진다.
  (2026-09-22 기준 `상담일지.html`, `사용설명서.html`, `사진스캔.html`,
   `DSR_calculator_logic.min.js` 가 작업트리에서 삭제된 상태로 잡혀 있었음 — 복구 필요 여부 확인 대상)
- `.gitignore`가 있어도 **이미 추적 중인 파일은 계속 추적된다.** 삭제 방지는 `git status` 육안 확인만이 확실하다.

---

## 3. 백업 규칙

- 수정 전 **반드시** 백업을 만든다.
- 위치: `Backup\file_backups\<파일명>.<yyyyMMdd_HHmmss>.bak`
- 되돌리는 명령을 작업 요약에 **항상** 포함한다.
- `backup`(소문자)과 `Backup`(대문자)은 Windows에서 **같은 폴더**다. 항상 `Backup` 하나만 쓴다.

```powershell
$ts = Get-Date -Format "yyyyMMdd_HHmmss"
Copy-Item "gonsi.html" "Backup\file_backups\gonsi.html.$ts.bak" -Force
```

---

## 4. 파일 쌍 동기화 (매우 중요)

root의 화면 파일과 앱 번들 사본이 **짝**을 이룬다. 한쪽만 고치면 앱에서 반영이 안 된다.

| root (배포 소스) | 앱 번들 (APK 포함) |
|---|---|
| `gonsi.html` | `CallNote/app/src/main/assets/gonsi.html` |
| `시세조회.html` | `CallNote/app/src/main/assets/시세조회.html` |
| `Consult_Main.html` | `CallNote/app/src/main/assets/Consult_Main.html` |
| `DSR_Main.html` | `CallNote/app/src/main/assets/DSR_Main.html` |
| `MCG.html` | `CallNote/app/src/main/assets/MCG.html` |
| `상담일지.html` | `CallNote/app/src/main/assets/상담일지.html` |

수정 후 **해시가 일치하는지 확인**한다:
```powershell
(Get-FileHash "gonsi.html").Hash -eq (Get-FileHash "CallNote\app\src\main\assets\gonsi.html").Hash
```

---

## 5. 검증 규칙

- HTML/JS 수정 후 **실제 브라우저로 로드해** 콘솔 에러 0건을 확인한다.
- 검증은 추측이 아니라 **측정**으로 한다. 응답 구조·CORS·타이밍은 실제로 호출해서 확인한다.
- 임시 검증 스크립트는 `_qa_<대상>.mjs` 로 만들고 **작업 끝나면 삭제**한다.
- 앱 origin을 흉내낼 때는 `https://appassets.androidx.startup` 을 쓴다 (아래 6번).

---

## 6. 실행 환경 / 네트워크 사실 (실측으로 확인됨)

- 앱은 `WebViewAssetLoader` 로 **`https://appassets.androidx.startup`** origin에서 로드한다.
  (file:// 아님 → 일반 https origin과 동일한 CORS 규칙이 적용된다)
- 로컬 파일은 이 origin으로 서빙된다: `/assets/<파일>` 또는 `/cache/<파일>`.

### 외부 API CORS 실측 결과

| API | 직접 호출 | 조치 |
|---|---|---|
| `api.kbland.kr` (KB 시세) | ✅ 허용 | 직접 호출 + GAS 폴백 |
| `dapi.kakao.com` (주소/건물명) | ✅ 허용 (preflight 포함) | 직접 호출 + GAS 폴백 |
| `api.vworld.kr` (공시가격) | ❌ **차단** | **GAS 경유 필수** |

- VWorld는 `domain` 파라미터가 등록값(`127.0.0.1`)이 아니면 `INCORRECT_KEY` 를 낸다.
- 그래서 `시세조회.html`·`gonsi.html`은 **하이브리드 구조**다:
  ```
  kbFetch()/gasFetch() → 1차 직접 호출, 실패 시 console.warn 후 GAS 폴백
  USE_GAS_DIRECTLY = true  →  한 줄로 예전(GAS 전용) 방식 복귀
  ```

---

## 7. 보안

- **이 저장소는 공개**다. 키를 새로 추가하기 전에 반드시 사용자에게 확인받는다.
- 현재 클라이언트에 노출된 키 (이미 공개된 상태):
  - 카카오 REST 키 → `gonsi.html`
  - VWorld 키 / GAS URL → `시세조회_GAS.gs`, `MCG.html`, `상담일지.html`
- **난독화는 방어가 아니다.** 클라이언트 키는 요청 시점에 복원되므로 네트워크 탭에 그대로 보인다.
  실질 대응은 ① 발급처 도메인 제한 ② 키 재발급 ③ 서버 경유 중 하나다.
- GAS 스크립트 파일: `시세조회_GAS.gs`, `상담일지.gs`, `.clasp-deploy/`

---

## 8. GAS(Google Apps Script) 규칙

- 웹앱 URL(`https://script.google.com/macros/s/.../exec`)은 매 요청마다 **콜드스타트 0.5~3초**가 붙는다.
  → 클라이언트에서 직접 호출 가능한 API는 직접 호출한다.
- `.gs` 안의 `UrlFetchApp` 은 **병렬이 안 된다.** 두 API를 부르면 직렬로 합산된다.
  반면 브라우저 `fetch` + `Promise.all` 은 진짜 병렬이다 → 클라이언트로 옮기면 이득.
- 응답 필드 변환(한글 필드명 매핑)은 GAS가 하던 일을 클라이언트 `normalize*` 함수가 대신한다.

---

## 9. 캐시 규칙

- `cached(key, loader)` 패턴을 쓴다. 키별로 **Promise**를 캐시해 동시 호출도 1회만 나가게 한다.
- 실패한 요청은 캐시에서 제거한다(`p.catch(() => _jsonCache.delete(key))`).
- 캐시는 **메모리(Map)** 라 페이지 리로드 시 사라진다. 영속이 필요하면 `sessionStorage` 를 쓴다.
- 시세/공시가격처럼 하루 단위로만 바뀌는 값은 캐시해도 안전하다.

---

## 10. 코드 스타일 (이 저장소에서 지켜온 것)

- CSS 클래스 접두사로 화면을 구분: `mp-`(시세조회), `gs-`(공시)
- 이벤트는 **위임(delegation)** 을 쓴다 — 항목마다 리스너를 붙이지 않는다.
- 연타/더블탭 방지 가드를 둔다: `isSearching`, `isLoadingDetail`
- `innerHTML` 로 렌더한 직후 `scrollIntoView` 는 `requestAnimationFrame` 으로 미룬다(모바일 튐 방지).
- 정규식은 파일 상수로 올린다 (매 호출 재컴파일 방지).
- 리스트가 비면 `innerHTML = ''` 로 DOM도 비운다 (`display:none` 만 하면 이전 항목이 남는다).
