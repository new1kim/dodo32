# dodo32 프로젝트 — 작업 규칙

세션이 바뀌어도 이 파일은 자동으로 참조된다. 작업 전에 읽고, 규칙이 바뀌면 이 파일을 갱신한다.

---

## 0. 대화 및 결과 보고 규칙
- 모든 답변은 **한국어**로 작성한다.
- 작업 결과는 먼저 **핵심 결론과 변경 사항을 간략하게 요약**한다.
- 사용자가 요청하지 않는 한 긴 설명, 전체 코드, 불필요한 진행 과정은 생략한다.
- 오류가 있으면 `원인 → 조치 → 검증 결과` 순서로 짧게 보고한다.
- 백업을 만들었으면 백업 경로와 복구 명령만 간단히 포함한다.
- 검증하지 못한 내용은 완료했다고 표현하지 말고, 확인하지 못한 이유를 명시한다.

### 🔁 반복 실패 시 중단 규칙 (2026-11-11 사용자 지정)
- **동일한 작업이 5번 이상 실패하면 즉시 반복을 멈추고** 원인과 해결책을 브리핑한다.
- 5번 이상 실패한 작업은 같은 방법을 계속 반복해도 의미가 없다고 판단한다.
  → 접근 방식 자체를 바꾸거나, 사용자에게 판단을 요청한다.
- 브리핑 형식: `지금까지 시도한 것 → 실패 원인 → 대안(다른 접근) → 권장안`
- 같은 수정을 반복 적용하는 것도 실패로 센다(결과가 바뀌지 않으면 실패).

### Node.js 검증 환경
- Node.js는 설치되어 있으나 현재 시스템 `PATH`에 등록되어 있지 않을 수 있다.
- Node 실행 파일: `C:\Program Files\nodejs\node.exe`
- npm 실행 파일: `C:\Program Files\nodejs\npm.cmd`
- 터미널 검증 전 PowerShell에서 다음을 먼저 실행한다:
  ```powershell
  $env:Path = "C:\Program Files\nodejs;" + $env:Path
  ```
- `node`, `npm` 명령이 인식되지 않으면 위 절차를 사용하거나 절대 경로 실행한다.
- HTML/JS 문법 검증은 다음처럼 수행한다:
  ```powershell
  & "C:\Program Files\nodejs\node.exe" --version
  ```
- 브라우저 검증도 시스템 `node` 명령에 의존하지 말고 동일한 절대 경로를 사용한다.

---

## 1. 이 저장소의 성격 (가장 중요)

- **GitHub 공개 저장소**이고, 동시에 **앱의 실시간 배포 소스**다.
- Android 앱(`CallNote`)은 실행 시 다음에서 파일을 내려받는다:
  ```
  https://raw.githubusercontent.com/new1kim/dodo32/main/<파일명>
  ```
  (근거: `CallNote/app/src/main/java/com/example/callnote/AssetSyncManager.kt`)
- 즉 **루트의 파일을 지우면 그대로 앱이 깨진다.** 커밋 전 반드시 아래 2번을 확인한다.

### 앱이 실제로 사용하는 파일 (AssetSyncManager.FILES)
```
Consult_Main.html              Consult_calculator_logic.js
Consult_calculator_ui.js       Consult_style.css
DSR_Main.html                  DSR_calculator_logic.js
DSR_calculator_ui.js           DSR_style.css
KB시세조회.html                 소액임차보증금.png
장래예상소득증가율.png           DTI.html
신용점수기준.png                계산기.html
날짜계산기.html                 MCG.html
IDCard.html                    문서스캔.html
```
추가로 root에 있어야 하는 것: `index.html`, `공시가조회.html`, `OP시세조회.html`, `op_gongsi_data/`(~1,936개 JSON)

> - `상담일지.html`은 **2026-09-22 제거됨** (화면·코드 모두). 전화 수신 팝업은 `Consult_Main.html`로 연결된다.
> - `OP시세조회.html`(오피스텔 공시가)은 `op_gongsi_data/*.json`에 의존하며, 용량 때문에 **GitHub 동기화 대상이 아니라 APK 번들 전용**이다.
> - 화면 파일명 변경(2026-11-11): `시세조회.html`→`KB시세조회.html`, `gonsi.html`→`공시가조회.html`(주택 공시가), 오피스텔은 `OP시세조회.html`로 분리.

### 📁 콜노트앱 실제 빌드 프로젝트 위치 (2026-11-05 사용자 지정)
```
C:\Users\Administrator\CallNote
```
- 사용자가 **Android Studio로 열어 빌드하는 실제 프로젝트**다. 앱 빌드·AGP·Gradle·테스트 관련 요청은 이 폴더를 기준으로 본다.
- 이 저장소의 `d:\dodo32\CallNote`는 **GitHub 배포 소스 안의 사본**이며, 위 폴더와 **자동 동기화되지 않는다**(별개 폴더).
- 화면 파일(HTML/JS/CSS)은 `d:\dodo32` 루트에서 수정·푸시하고, 앱 번들 반영이 필요하면 `C:\Users\Administrator\CallNote\app\src\main\assets\` 쪽도 함께 확인한다.

### 🚫 콜노트 앱 작업 금지 (2026-11-11 사용자 지정)
- **사용자가 콜노트 앱 작업을 별도로 명시해 요청하기 전까지 앱 관련 작업을 일절 하지 않는다.** 수정뿐 아니라 파일 열람·조사·빌드·테스트·에셋 동기화도 금지한다.
- 대상: `C:\Users\Administrator\CallNote\`, `d:\dodo32\CallNote\`, `d:\dodo32\.authfix-worktree\CallNote\` 및 그 밖의 콜노트 앱 프로젝트/앱 번들 경로.
- 화면 파일명이 바뀌어도 앱 쪽 `AssetSyncManager.FILES`·`MainActivity` 의 옛 파일명은 **그대로 둔다.**
- 콜노트 앱과 별개인 웹(HTML/JS/CSS) 작업만 수행한다. 웹 작업의 앱 반영, 앱 빌드, 에셋 동기화도 별도 요청 없이는 하지 않는다.

---

## 2. GitHub 반영 및 커밋 전 필수 점검
- **사용자가 GitHub 푸시를 명시적으로 요청하기 전까지 GitHub에 푸시하거나 원격 저장소에 반영하지 않는다.** 푸시 요청 전에는 로컬 작업만 진행한다.
- Git 커밋도 사용자가 별도로 요청하지 않는 한 만들지 않는다.

### 커밋 전 필수 점검

```powershell
C:\Program Files\Git\cmd\git.exe status --short
```

- **`D`(삭제)로 잡히는 항목이 있으면 절대 `git add -A` 하지 말 것.**
  실수로 올리면 GitHub에서 파일이 사라져 앱이 즉시 깨진다.
  (과거 기준 `상담일지.html`, `사용설명서.html`, `사진스캔.html` 이 작업트리에서 삭제된 상태로 잡혀 있었음 — 복구 필요 여부 확인 대상)
- `.gitignore`가 있어도 **이미 추적 중인 파일은 계속 추적된다.** 삭제 방지는 `git status` 육안 확인만이 확실하다.

---

## 2-B. ⚠️ 안드로이드 빌드 잠금 (가장 자주 막히는 지점)

### 증상
```
java.io.IOException: Unable to delete directory '...\app\build\...'
  Failed to delete some children.
Caused by: java.nio.file.AccessDeniedException
```
또는
```
Execution failed for task ':app:dexBuilderDebug'.
Execution failed for task ':app:generateDebugBuildConfig'.
```

### 원인 (2026-09-22 실제 진단)
**컴파일 오류가 아니다.** 코드는 정상인데 **오래된 Gradle/Kotlin 데몬이 빌드 폴더 핸들을 놓지 않아**
새 빌드가 이전 산출물을 지우지 못하는 것이다.

```
1) 터미널에서 빌드  → Gradle/Kotlin 데몬 생성(그 폴더를 "사용 중"으로 등록)
2) Android Studio 실행 → 기존 데몬을 물려받아 재사용
3) 이후 빌드       → Gradle이 이전 산출물 삭제 시도
                   → 데몬이 계속 잡고 있음 → AccessDeniedException
```

**판별법:** 문제 폴더가 **비어 있는데도** 삭제가 안 되면 100% 이 잠금이다.
(PowerShell에서는 지워지는데 Gradle(Java)만 실패하는 것도 같은 증거)

### ✅ 복구 절차 — 이 순서를 반드시 지킬 것

**가장 빠른 방법 (스크립트 한 줄):**
```powershell
cd d:\dodo32
.\build_android.ps1          # 데몬 정리 -> 빌드까지 자동
```
| 옵션 | 동작 |
|---|---|
| (없음) | 데몬 정리 후 빌드 |
| `-Clean` | build 폴더까지 삭제 후 빌드 (증상이 심할 때) |
| `-LockOnly` | 잠금 정리만 (빌드 안 함) |
| `-Diagnose` | 무엇이 잡고 있는지 확인만 |

**수동으로 할 경우:**
```powershell
cd d:\dodo32\CallNote
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"

# 1) 데몬을 반드시 먼저 죽인다 (이걸 빼먹으면 아래 삭제도 실패한다)
.\gradlew.bat --stop
Start-Sleep -Seconds 4

# 2) 빌드 폴더 삭제
Remove-Item "app\build","build" -Recurse -Force -ErrorAction SilentlyContinue

# 3) 재빌드
.\gradlew.bat assembleDebug
```

**성공 기준:** `BUILD SUCCESSFUL` + `app\build\outputs\apk\debug\*.apk` 생성

**실측 (2026-09-22):** 데몬 2개가 떠 있는 상태에서 `build_android.ps1` 실행 → 정상 빌드 확인.

### 🔁 예방 규칙 (시간 낭비를 막는 핵심)

1. **빌드는 한 곳에서만 한다.**
   | 상황 | 할 일 |
   |---|---|
   | Studio로 작업 중 | Studio 안에서 `Build → Rebuild Project` |
   | 터미널로만 작업 | Studio **종료 후** `gradlew assembleDebug` |

2. **Studio 자동빌드를 끈다** (켜져 있으면 저장할 때마다 충돌).
   ```
   File → Settings → Build, Execution, Deployment → Compiler
     → "Build project automatically" 체크 해제
   ```

3. **터미널 빌드 전에는 항상 `--stop` 을 습관으로.**
   ```powershell
   .\gradlew.bat --stop; .\gradlew.bat assembleDebug
   ```

4. 빌드 실패가 나면 **먼저 코드를 의심하지 말고 데몬을 의심한다.**
   `AccessDeniedException` / `Unable to delete directory` 가 보이면 코드 문제가 아니다.

### JDK 경로 (터미널 빌드 시 필요)
```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
```
`java` 가 PATH에 없으므로 위 설정을 매번 넣어야 한다.

### 빠른 진단 명령 (원인 확인용)
```powershell
# 떠 있는 데몬/Studio 확인
Get-Process | Where-Object { $_.ProcessName -match 'java|kotlin|studio' } |
  Select-Object Id, ProcessName, StartTime
```

---

## 3. 백업 규칙

- 수정 전 **반드시** 백업을 만든다.
- 위치: `Backup\file_backups\<파일명>.<yyyyMMdd_HHmmss>.bak`
- 되돌리는 명령을 작업 요약에 **항상** 포함한다.
- `backup`(소문자)과 `Backup`(대문자)은 Windows에서 **같은 폴더**다. 항상 `Backup` 하나만 쓴다.

```powershell
$ts = Get-Date -Format "yyyyMMdd_HHmmss"
Copy-Item "공시가조회.html" "Backup\file_backups\공시가조회.html.$ts.bak" -Force
```

---

## 5. 검증 규칙

- HTML/JS 수정 후 **실제 브라우저로 로드해** 콘솔 에러 0건을 확인한다.
- 검증은 추측이 아니라 **측정**으로 한다. 응답 구조·CORS·타이밍은 실제로 호출해서 확인한다.
- 임시 검증 스크립트는 `_qa_<대상>.mjs` 로 만들고 **작업 끝나면 임시파일들은 모두 삭제**한다.
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
- 그래서 `KB시세조회.html`·`공시가조회.html`·`OP시세조회.html`은 **하이브리드 구조**다:
  ```
  kbFetch()/gasFetch() → 1차 직접 호출, 실패 시 console.warn 후 GAS 폴백
  USE_GAS_DIRECTLY = true  →  한 줄로 예전(GAS 전용) 방식 복귀
  ```

---

## 7. 보안

- **이 저장소는 공개**다. 키를 새로 추가하기 전에 반드시 사용자에게 확인받는다.
- 현재 클라이언트에 노출된 키 (이미 공개된 상태):
  - 카카오 REST 키 → `공시가조회.html`, `OP시세조회.html`
  - VWorld 키 / GAS URL → `시세조회_GAS.gs`, `MCG.html`, `상담일지.html`
- 클라이언트 키는 공개 저장소와 브라우저에 노출된다. 실질 대응은 ① 발급처 도메인 제한 ② 키 재발급 ③ 서버 경유 중 하나다.
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

---

## 10-B. 🔒 Consult 계산식 — 절대식 (깨뜨리면 안 됨)

사용자가 정산표로 하나씩 검증해 확정한 값이다. **아래 식은 임의로 바꾸지 않는다.**
바꿔야 하면 새 정산표를 받아 역산 검증을 마친 뒤에만 수정한다.

대상: `Consult_calculator_logic.js` 의 `자동계산()` 안 `[DSR/DTI 산정 규칙]` 블록

```
연 원금상환액 = 대출금 × 12 ÷ principalTerm
  principalTerm = (상환방식이 "만기") ? min(기간, 120) : 기간     ← 만기일시는 120개월(10년) 고정

연 이자상환액
  · 원리금균등 = 월상환금 × 12 − (대출금 × 12 ÷ 기간)
  · 원금균등   = 대출금 × 금리 × (기간 + 1) ÷ (기간 × 2)
  · 만기일시   = 대출금 × 금리

총 원리금상환액(연) = 연 원금상환액 + 연 이자상환액

[보유대출(추가행) 구분별 분기 — 2026-11-04 확정]
  · 전세대 / 이자만  : 원금 미반영 → DSR = DTI = 연이자만
  · 신용대 / 원리금 / 주담대 :
      DSR = 연 원금 + 연 이자 전액
      DTI = 연이자만

DSR = 총 원리금상환액 ÷ 연소득 × 100
보유대출 연이자
  원리금균등 = 월상환금 × 12 − (대출금 × 12 ÷ 기간)
  원금균등   = 대출금 × 금리 × (기간 + 1) ÷ (기간 × 2)
  만기일시   = 대출금 × 금리

[신DTI] 주담대가 2건 이상일 때만 별도 산정·표시한다.
  신DTI = Σ(주담대 행: 연 원금 + 연 이자) + Σ(비주담대 행: 연이자만) ÷ 연소득 × 100
  · 주담대 2건이 아니면 신DTI는 표시하지 않는다(DTI 옆에 나오지 않음).
  · **DSR·DTI는 입력 기간 그대로**, **신DTI만 본건 개월수에 최대 180개월 상한** 적용
      입력 360 → 신DTI는 180개월로 재계산 / 입력 120 → 입력값 그대로
  검증값(본건 3억 8% **180개월** / 신용대 5천만 8% 60개월 / 주담대 5천만 8% 360개월):
    대출1 34,403,475 + 대출2 이자 2,165,837 + 대출3 4,402,587 = **40,971,899 → 81.94%**

  실측 검증(같은 구성에서 본건 개월수만 변경):
  | 본건 기간 | DSR | DTI | 신DTI |
  |---|---|---|---|
  | 360 | 85.97% | 65.97% | **81.94%** |
  | 240 | 93.36% | 73.36% | **81.94%** |
  | 180 | 101.94% | 81.94% | **81.94%** |
  | 120 | 120.49% | 100.49% | **100.49%** |
```

### 검증된 기준값 4 — 신용대·원리금 분기 (본건 300,000,000 8% 360개월 / 보유 신용대 50,000,000 8% 60개월)

| 보유 상환방식 | 보유 연부담(원금+이자) | DSR | DTI |
|---|---|---|---|
| 원리금균등 | 12,165,837 | **77.16%** | 57.16% |
| 원금균등 | 12,033,333 | **76.90%** | 56.90% |
| 만기일시 | 14,000,000 (원금 1,000만 + 이자 400만) | **80.83%** | 60.83% |

### 검증된 기준값 2 — DTI (소득 50,000,000 / 본건 300,000,000 8% 360개월 / 보유 신용대 50,000,000 60개월)

| 보유대출 상환방식 | 금리 | 보유 연이자 | 총액 | DTI |
|---|---|---|---|---|
| 원리금균등 | 5% | 1,322,740 | 27,738,265 | **55.48%** |
| 원금균등 | 5% | 1,270,833 | 27,686,358 | **55.37%** |
| 만기일시(원금 미반영) | 5% | 2,500,000 | 28,915,525 | **57.83%** |
| 원리금균등 | 8% | 2,165,837 | 28,581,361 | **57.16%** |
| 원금균등 | 8% | 2,033,333 | 28,448,858 | **56.90%** |
| 만기일시(원금 미반영) | 8% | 4,000,000 | 30,415,525 | **60.83%** |

### 검증된 기준값 3 — 전세대 보유대출 (본건 300,000,000 8% 360개월 / 전세대 50,000,000 8% 48개월)

| 전세대 상환방식 | 연이자 | 총액 | DSR = DTI |
|---|---|---|---|
| 원리금균등 | 2,147,753 | 28,563,278 | **57.13%** |
| 원금균등 | 2,041,667 | 28,457,191 | **56.91%** |
| 만기일시 | 4,000,000 | 30,415,525 | **60.83%** |

- 전세대(loanCategory = `전세대`)는 신용대와 동일한 연이자 식을 쓰므로 별도 분기가 필요 없다.
- **2026-11-04 확인**: 8% 전세대의 DTI도 위 표의 DSR과 같은 값(57.13 / 56.91 / 60.83)으로 확정됐다(이전 첨부표의 DTI 55.48 등은 5% 신용대 표의 값이 잘못 복사된 것).

### 검증된 기준값 (소득 50,000,000 / 본건 300,000,000 / 금리 10% / 360개월)

| 상환방식 | 연 원금 | 연 이자 | 총액 | 결과 |
|---|---|---|---|---|
| 원리금균등 | 10,000,000 | 21,592,577 | 31,592,577 | **63.19%** |
| 원금균등 | 10,000,000 | 15,041,667 | 25,041,667 | **50.08%** |
| 만기일시 | 30,000,000 | 30,000,000 | 60,000,000 | **120.00%** |

- 위 표의 어떤 값이라도 달라지면 **회귀(버그)** 로 보고 즉시 되돌린다.
- **2026-11-04 개정**: 기존에 `신DTI` 이름으로 계산하던 식을 **DTI**로 옮겼다. `신DTI`는 주담대 2건 이상에서만 산정·표시한다(1건 이하면 DTI 값을 그대로 쓴다).
- 회귀 검증: `node _qa_consult_dsr.cjs` (전체 PASS 여야 함)

---

## 11. Consult 초기화 동작 (2026-11-11 확정)

- 초기화 버튼(`선택초기화()`)은 **"기본값으로 되돌리기"**다.
  - 본건 행 구분 → `주담대`, 상환방식 → `원리금`
  - 금리: 저장된 기본값, ST금리: 6M=3 / 5Y·2Y=1.5, 기간: 360개월(저장값 우선)
  - 구분별 상환방식 기억(`repayTypeByCategory`)·입력값 저장소(`categoryInputStore`)도 **모두 원리금**으로 리셋
- 초기화 후 드롭다운에서 어떤 구분을 골라도 상환방식이 **원리금**으로 시작해야 한다.
- ⚠️ 함정: `선택초기화()` 안에서 `const`로 선언한 변수를 **다른 블록에서 참조하면**
  `ReferenceError`가 나고 초기화가 그 지점에서 조용히 중단된다(화면 일부만 초기화됨).
  블록을 넘나드는 변수는 함수 최상단에서 `let`으로 선언한다.

### 본건 행 금리·ST금리·개월수 저장소 (2026-11-11 확정)

| 구분 | 키 |
|---|---|
| 주담대 | `DSR_firstRowRate_주담대_6M` / `_주담대_2Y` (ST·Term 동일 규칙) |
| 전세대 | `DSR_firstRowRate_전세대` |
| **원리금** | `DSR_firstRowRate_원리금` (**전용**) |
| 공용 프로필 | `DSR_firstRowProfileValues` — 6M/5Y 묶음 |

- **원리금 구분은 전용 키만 쓴다.** 공용 프로필 저장소(`firstRowProfileValues`)에도 쓰면
  초기화로 주담대로 돌아왔을 때 원리금에서 입력한 금리가 다시 읽혀 화면에 남는다.
  → `saveFirstRowProfileValues()` 는 구분이 `원리금`이면 공용 저장을 건너뛴다.
- 주담대 키가 **이미 존재하고 값이 빈 문자열**이면 "빈값 유지"다.
  `applyConsultCachedRateToFirstRow()` 는 이 경우 기본값/공용 값을 다시 읽어 채우지 않는다.
- 초기화(`clearFirstRowCategoryRateStore`)는 `주담대_6M / 주담대_2Y / 전세대 / 원리금` **4종**을 모두 비운다.
- 초기화 후 **금리 칸은 항상 빈값**이다. 저장된 기본값 금리를 초기화 때 칸에 채우던 동작은 제거됐다
  (그 값이 구분을 바꿔도 그대로 남아 "원리금 금리가 초기화 후에도 남는" 원인이었음).
  기본값 금리는 사용자가 [6M/5Y 전환] 버튼을 누를 때만 적용된다.

### 구분 전환 시 금리 동기화 규칙 (2026-11-11 확정)

- `syncFirstRowRateAndStRate(row, force)`가 유일한 진입점. 모든 구분이 **전용 저장소 기준**으로 맞춰진다.
  - 전용 키에 값이 있으면 그 값, 없으면 **빈값**(이전 구분 값이 남지 않게).
  - `isDsrRestoredFromStorage()`(복원 직후)면 손대지 않는다. 단 `__inCategoryChange > 0`(사용자가 드롭다운으로 전환)이면 예외.
- ⚠️ 함정: 예전엔 `applyJeonseRowLayout` 안에서 `saveFirstRowStRate` 인라인 저장 → 재진입된 sync가
  플래그 때문에 **통째로 무시**되어 이전 구분 금리가 그대로 남았다. 지금은 "sync 중에는 저장하지 않음" 방식이다.
- `saveFirstRowProfileValues()`는 sync 중(`__syncingFirstRowRate`)이면 전용 키에 쓰지 않는다.
- `saveCategoryInputs/restoreCategoryInputs`는 본건 행에서 금리·ST·개월수를 다루지 않는다(전용 키와 중복·충돌 방지).

