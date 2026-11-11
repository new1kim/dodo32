/* DSR계산기ETC - 그 외 코드 (UI, 이벤트, 모달, 로컬스토리지 등) */

/* localStorage 저장/불러오기 대상 입력창 셀렉터 (여러 함수에서 공용으로 사용) */
const TEXT_NUMBER_INPUT_SELECTOR = 'input[type="text"], input[type="number"], textarea';
const CHECKBOX_INPUT_SELECTOR = 'input[type="checkbox"]';
/* 대출 종류 드롭다운 선택값 목록 (저장/복원 유효성 검사에 사용) */
const VALID_LOAN_CATEGORIES = ['주담대', '전세대', '신용대', '이자만', '원리금', '연간원리금'];
/* 본건(첫 행) 드롭다운에 표시하는 구분 (2026-11-11: 3개로 축소) */
const FIRST_ROW_LOAN_CATEGORIES = ['주담대', '전세대', '원리금'];

/* DSR_Main과 Consult_Main은 같은 origin의 iframe이므로 localStorage를 공유한다.
   상담 화면은 입력값을 별도 저장소로 격리해 DSR 계산 화면과 서로 덮어쓰지 않게 한다. */
function consultStorageKey(key) {
  const value = String(key);
  return value.startsWith('CONSULT_') ? value : `CONSULT_${value}`;
}
function consultStorageKeys() {
  const prefix = 'CONSULT_';
  return Object.keys(window.localStorage)
    .filter(key => key.startsWith(prefix))
    .map(key => key.slice(prefix.length));
}
const consultLocalStorage = {
  getItem(key) { return window.localStorage.getItem(consultStorageKey(key)); },
  setItem(key, value) { return window.localStorage.setItem(consultStorageKey(key), value); },
  removeItem(key) { return window.localStorage.removeItem(consultStorageKey(key)); }
};

/* 복원(불러오기) 중에는 setRestoredInputValue/setRestoredCheckboxValue가 발생시키는
   input/change 이벤트가 setupDSRAutoSave의 자동저장(saveDSRInputs)을 유발해,
   아직 복원되지 않은 기존 화면 상태(특히 대출행)로 DSR_* 키를 덮어써 스냅샷이 파괴된다.
   복원 중에는 자동저장을 잠가야 한다. */
let __dsrRestoring = false;
function isDsrRestoring() { return __dsrRestoring; }

/* 새로고침/불러오기로 저장값을 화면에 복원한 직후에는 "기본값 자동 적용"을 하지 않는다.
   (본건 금리·ST금리·기간이 사용자가 입력한 값 대신 기본값으로 되돌아가던 문제)
   복원이 끝나면 true가 되고, 사용자가 [6M/5Y 전환] 버튼이나 구분(담보/전세)을 바꿀 때만
   기본값을 다시 적용한다. */
let __dsrRestoredFromStorage = false;
function isDsrRestoredFromStorage() { return __dsrRestoredFromStorage; }
function markDsrRestoredFromStorage() { __dsrRestoredFromStorage = true; }

function getStoredJson(key, fallback = null) {
  try {
    const raw = consultLocalStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.warn(`저장 데이터가 손상되어 초기화했습니다: ${key}`, e);
    consultLocalStorage.removeItem(key);
    return fallback;
  }
}

/* getStoredJson의 짝. 저장 용량 초과(iOS 사파리 시크릿 모드 등)로 setItem이 던져도
   계산 화면 자체는 계속 쓸 수 있어야 하므로 예외를 삼키고 경고만 남긴다. */
function setStoredJson(key, value) {
  try {
    consultLocalStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn(`저장에 실패했습니다: ${key}`, e);
  }
}

/* -------------------- 공통 유틸: 글자크기 자동 축소(fit-to-width) -------------------- */
/* 여러 곳(테이블 셀/입력창, DSR 최대금액, DSR 한도 토글 라벨 등)에서
   "보이지 않는 ghost 엘리먼트로 텍스트 폭을 재서 넘치면 글자를 줄인다"는
   동일한 패턴이 4곳에 개별 구현되어 있던 것을 공통 유틸 2개로 통합함. */
function getMeasureGhost(id) {
  let ghost = document.getElementById(id);
  if (!ghost) {
    ghost = document.createElement("span");
    ghost.id = id;
    ghost.style.position = "absolute";
    ghost.style.visibility = "hidden";
    ghost.style.whiteSpace = "pre";
    ghost.style.left = "-9999px";
    ghost.style.top = "-9999px";
    document.body.appendChild(ghost);
  }
  return ghost;
}

function shrinkFontSizeToFit(ghost, text, maxWidth, startSize, minSize = 4, step = 0.5) {
  let size = startSize;
  ghost.style.fontSize = size + "px";
  ghost.innerText = text;
  while (size > minSize && ghost.offsetWidth > maxWidth) {
    size -= step;
    ghost.style.fontSize = size + "px";
  }
  return size;
}

function adjustTableFontSize() {
  const cells = document.querySelectorAll('table th, table td');
  cells.forEach(cell => {
    if (cell.closest('#modal-rate-card') || cell.closest('#modal-default-card') || cell.closest('#modal-text-card') || cell.closest('#modal-schedule-card') || cell.closest('.income-label') || cell.querySelector('#dsrLimitToggleGroup')) return;

    if (!cell.dataset.origSize) {
      cell.dataset.origSize = window.getComputedStyle(cell).fontSize;
    }
    cell.style.fontSize = cell.dataset.origSize;
    let currentCellSize = parseFloat(cell.dataset.origSize);

    while (cell.scrollWidth > cell.clientWidth && currentCellSize > 4) {
      if (cell.clientWidth === 0) break;
      currentCellSize -= 0.5;
      cell.style.fontSize = currentCellSize + 'px';
    }

    const input = cell.querySelector(`${TEXT_NUMBER_INPUT_SELECTOR}, select`);
    if (input) {
      if (!input.dataset.origSize) {
        input.dataset.origSize = window.getComputedStyle(input).fontSize;
      }
      const origSize = parseFloat(input.dataset.origSize);
      const maxWidth = input.clientWidth - 6;
      if (maxWidth <= 0) { input.style.fontSize = input.dataset.origSize; return; }

      const ghost = getMeasureGhost("input-ghost");
      const cs = window.getComputedStyle(input);
      ghost.style.fontFamily = cs.fontFamily;
      ghost.style.fontWeight = cs.fontWeight;

      let text;
      if (input.tagName === 'SELECT') {
        const opt = input.options[input.selectedIndex];
        text = opt ? opt.text : (input.value || '');
      } else {
        text = input.value || input.placeholder || "";
      }

      const fontSize = shrinkFontSizeToFit(ghost, text, maxWidth, origSize);
      input.style.fontSize = fontSize + 'px';
    }
  });
}

/* -------------------- 숫자 입력창 전용 자동 글자크기 조정 -------------------- */
/* 대상: inputmode="numeric" / inputmode="decimal" / type="number" 인 모든 입력창
   (테이블 내부, 모달 내부 등 위치·파일 상관없이 전부 적용됨) */
const NUMERIC_INPUT_SELECTOR = 'input[inputmode="numeric"], input[inputmode="decimal"], input[type="number"]';

function fitNumericInputFontSize(input) {
  if (!input) return;
  if (!input.dataset.origSize) {
    input.dataset.origSize = window.getComputedStyle(input).fontSize;
  }
  const origSize = parseFloat(input.dataset.origSize);
  const maxWidth = input.clientWidth - 2; // 커서 표시를 위한 최소 여유
  if (maxWidth <= 0) { input.style.fontSize = input.dataset.origSize; return; }

  const ghost = getMeasureGhost("numeric-input-ghost");
  const cs = window.getComputedStyle(input);
  ghost.style.fontFamily = cs.fontFamily;
  ghost.style.fontWeight = cs.fontWeight;

  const fontSize = shrinkFontSizeToFit(ghost, input.value || input.placeholder || "", maxWidth, origSize);
  input.style.fontSize = fontSize + "px";
}

function fitAllNumericInputFontSizes() {
  document.querySelectorAll(NUMERIC_INPUT_SELECTOR).forEach(fitNumericInputFontSize);
}

// 입력창 위치와 상관없이(테이블/모달 등) 타이핑 즉시 글자크기를 맞춤
document.addEventListener("input", (e) => {
  const target = e.target;
  if (target && target.matches && target.matches(NUMERIC_INPUT_SELECTOR)) {
    fitNumericInputFontSize(target);
  }
});

/* -------------------- 공통 유틸: 이미지/설명/스케줄 모달 -------------------- */
/* 5개의 open*Modal 함수가 모달 패널(modal-img/modal-text-card/modal-schedule-card/
   image-modal)을 각자 조회하고, 자신을 제외한 패널을 숨기는 동일한 코드를
   반복하고 있던 것을 공통 유틸 2개로 통합함. */
function getModalPanels() {
  return {
    imgModal: document.getElementById("modal-img"),
    textCard: document.getElementById("modal-text-card"),
    scheduleCard: document.getElementById("modal-schedule-card"),
    imageModal: document.getElementById("image-modal"),
  };
}

function hideOtherModalPanels(panels, panelToKeep) {
  ['imgModal', 'textCard', 'scheduleCard'].forEach(key => {
    if (key !== panelToKeep && panels[key]) panels[key].style.display = "none";
  });
  const reductionCard = document.getElementById('reduction-recommend-card');
  if (reductionCard && panelToKeep !== 'reductionCard') reductionCard.style.display = 'none';
}

function openScheduleModal() {
  const panels = getModalPanels();
  hideOtherModalPanels(panels, 'scheduleCard');

  if (typeof generateSchedule === 'function') generateSchedule();

  if (panels.scheduleCard) panels.scheduleCard.style.display = "block";
  if (panels.imageModal) panels.imageModal.style.display = "flex";
}

function openImageModal(imageSrc) {
  const panels = getModalPanels();
  const imageCredit = document.getElementById("modal-image-credit");
  hideOtherModalPanels(panels, 'imgModal');

  if (panels.imgModal) {
    panels.imgModal.src = imageSrc;
    panels.imgModal.style.display = "block";
  }
  if (imageCredit) imageCredit.style.display = imageSrc === "소액임차보증금.png" ? "block" : "none";
  if (panels.imageModal) panels.imageModal.style.display = "flex";
}

function openTextModal() {
  const panels = getModalPanels();
  hideOtherModalPanels(panels, 'textCard');

  // "계산기 설명" 모달 안에는 장래예상소득 요율 수정, 본건 기본값 설정 섹션이
  // 함께 들어있으므로, 모달을 여는 경로와 상관없이 저장된 값을 항상 채워둔다.
  populateRateEditFields();
  populateDefaultFirstRowFields();
  populateDeclareRateEditFields();
  // 금리표 캐시 표도 모달을 열 때마다 현재 저장값으로 다시 그린다.
  if (typeof renderConsultRateCacheTable === 'function') renderConsultRateCacheTable();

  if (panels.textCard) {
    panels.textCard.style.display = "block";
    panels.textCard.scrollTop = 0;
  }
  if (panels.imageModal) panels.imageModal.style.display = "flex";

  fitAllNumericInputFontSizes();
}

function populateRateEditFields() {
  LOAN_RATE_TABLE.forEach((item, index) => {
    const editEl = document.getElementById(`edit-rate-${index}`);
    if (editEl) editEl.value = item.percent;
  });
}

/* 본건 대출 기본값(6M/5Y 금리·ST금리·개월) 입력창 id 목록 - 모달 열기/저장 양쪽에서 공용 */
const DEFAULT_FIRST_ROW_FIELD_IDS = ['default-mort-rate', 'default-five-year-rate', 'default-mort-st-rate', 'default-five-year-st-rate', 'default-mort-term', 'default-five-year-term'];

function populateDefaultFirstRowFields() {
  const data = getStoredJson("DEFAULT_FIRST_ROW_DATA");
  const valuesById = data ? {
    'default-mort-rate': data.sixMonthRate || data.rate || "",
    'default-five-year-rate': data.fiveYearRate || "",
    'default-mort-st-rate': data.sixMonthStRate || data.stRate || "",
    'default-five-year-st-rate': data.fiveYearStRate || "",
    'default-mort-term': data.sixMonthTerm || data.term || "",
    'default-five-year-term': data.fiveYearTerm || "",
  } : null;

  DEFAULT_FIRST_ROW_FIELD_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = valuesById ? valuesById[id] : "";
  });
}

function openDefaultFirstRowModal() {
  const panels = getModalPanels();
  hideOtherModalPanels(panels, 'textCard');

  populateDefaultFirstRowFields();

  if (panels.textCard) panels.textCard.style.display = "block";
  if (panels.imageModal) panels.imageModal.style.display = "flex";

  const targetSection = document.getElementById("modal-default-card");
  if (targetSection) targetSection.scrollIntoView({ block: "start" });

  fitAllNumericInputFontSizes();
}

function saveDefaultFirstRowData() {
  const getTrimmedValue = (id) => {
    const el = document.getElementById(id);
    return el ? el.value.trim() : "";
  };
  const rate = getTrimmedValue("default-mort-rate");
  const fiveYearRate = getTrimmedValue("default-five-year-rate");
  const sixMonthStRate = getTrimmedValue("default-mort-st-rate");
  const fiveYearStRate = getTrimmedValue("default-five-year-st-rate");
  const sixMonthTerm = getTrimmedValue("default-mort-term");
  const fiveYearTerm = getTrimmedValue("default-five-year-term");

  const data = {
    rate,
    sixMonthRate: rate,
    fiveYearRate,
    sixMonthStRate,
    fiveYearStRate,
    sixMonthTerm,
    fiveYearTerm,
    stRate: sixMonthStRate,
    term: sixMonthTerm
  };
  setStoredJson("DEFAULT_FIRST_ROW_DATA", data);
  showBubble("본건 대출 기본값 저장 완료");
  closeModal();

  const firstRow = document.querySelector('#mortgage-inputs .mortgage-row');
  if (firstRow) {
    if (rate && firstRow.querySelector('.mort-rate')) firstRow.querySelector('.mort-rate').value = rate;
    if (sixMonthStRate && firstRow.querySelector('.mort-st-rate')) firstRow.querySelector('.mort-st-rate').value = sixMonthStRate;
    if (sixMonthTerm && firstRow.querySelector('.mort-term')) firstRow.querySelector('.mort-term').value = sixMonthTerm;
    if (typeof 자동계산 === 'function') 자동계산();
    if (typeof saveDSRInputs === 'function') saveDSRInputs();
  }
}

function saveCustomRates() {
  for(let i=0; i<LOAN_RATE_TABLE.length; i++) {
    const editRateEl = document.getElementById(`edit-rate-${i}`);
    if (editRateEl) {
      const val = parseFloat(editRateEl.value);
      if(isNaN(val) || val < 0) {
        alert("올바른 요율(숫자)을 입력해주세요.");
        return;
      }
      LOAN_RATE_TABLE[i].percent = val;
    }
  }
  setStoredJson("CUSTOM_LOAN_RATE_TABLE", LOAN_RATE_TABLE);
  showBubble("예상 요율 저장 완료");
  closeModal();
  if (typeof updateIncomeCalc === 'function') updateIncomeCalc();
}

function closeModal() {
  const panels = getModalPanels();
  Object.values(panels).forEach(panel => {
    if (panel) panel.style.display = 'none';
  });
  const reductionCard = document.getElementById('reduction-recommend-card');
  if (reductionCard) reductionCard.style.display = 'none';
  const imageModal = document.getElementById("image-modal");
  if (imageModal) imageModal.style.display = "none";
}

function getMortgageAnnualDebtForRow(row, index) {
  if (!row) return 0;

  const amtEl = row.querySelector('.mort-amt');
  const rateEl = row.querySelector('.mort-rate');
  const stRateEl = row.querySelector('.mort-st-rate');
  const termEl = row.querySelector('.mort-term');
  const typeEl = row.querySelector('.mort-type');
  const categoryEl = row.querySelector('.mort-loan-category');

  const amt = amtEl ? (parseFloat(amtEl.value.replace(/,/g, '')) || 0) : 0;
  const pureRate = rateEl ? (parseFloat(rateEl.value) / 100 || 0) : 0;
  const stRateValue = stRateEl ? (parseFloat(stRateEl.value) || 0) : 0;
  const combinedRate = (pureRate * 100 + stRateValue) / 100;
  const term = termEl ? (parseInt(termEl.value) || 0) : 0;
  const type = typeEl ? typeEl.value : '원리금';
  const loanCategory = categoryEl ? categoryEl.value : '신용';
  const { graceTerm, postTerm } = getGraceAdjustedTerm(row, term);

  if (amt <= 0 || term <= 0 || combinedRate <= 0) return 0;

  // 신DTI 산정 기간 = min(입력 개월수, 180)개월.
  //   · 본건(index 0): 입력값을 최소, 180개월을 최대로 캡 적용
  //   · 분류상 주담대(추가행): 최대 180개월 캡 적용
  const isNewDtiTarget = (index === 0) || (loanCategory === '주담대');
  let fixPostTerm;
  if (isNewDtiTarget && term > 0) {
    const newDtiBaseTerm = Math.min(term, 180);
    let fixGrace = graceTerm >= newDtiBaseTerm ? Math.max(newDtiBaseTerm - 1, 0) : graceTerm;
    fixPostTerm = newDtiBaseTerm - fixGrace;
  } else {
    fixPostTerm = postTerm;
  }
  if (fixPostTerm <= 0) fixPostTerm = 1;

  if (type === '만기') {
    // 만기일시는 이자만 부담한다. 원금 기간환산액을 더하면 DSR이 폭증하므로
    // 추가대출(index > 0)이라도 이자만 반환한다.
    return amt * combinedRate;
  }

  if (type === '원리금') {
    const calc = 원리금균등_계산대출(amt, combinedRate, postTerm);
    const totalInterest = (calc.월상환금액 * postTerm) - amt;
    const years = postTerm / 12 || 1;
    return (calc.월상환금액 * 12) + (index === 0 ? 0 : 0);
  }

  if (type === '원금') {
    const calcA = 원금균등_연간계산(amt, combinedRate, postTerm);
    return calcA.대출합계;
  }

  if (loanCategory === '이자만') {
    const mInt = amt * combinedRate / 12;
    return mInt * 12;
  }

  return 0;
}

/* 행의 입력 상태를 점검해 사용자에게 보여줄 안내문을 반환한다.
   - 금리만 비어 있으면 "금리 입력해주세요"
   - 금리·개월수 둘 다 비어 있으면 "금리,개월 입력해주세요"
   - 아무것도 입력되지 않았으면 "" (빈 값 → 계산값도 빈 값으로 표시)
   반환: { message, isEmpty, rowInfoEmpty } */
function getMortgageRowInputHint(row) {
  if (!row) return { message: '', isEmpty: true, rowInfoEmpty: true };
  const val = (sel) => (row.querySelector(sel)?.value || '').trim();
  const amtText = val('.mort-amt');
  const rateText = val('.mort-rate');
  const termText = val('.mort-term');
  const annualText = val('.mort-annual');

  // 연간원리금 직접입력 행은 금액·금리·개월수 대신 연간원리금만 확인한다.
  if ((row.querySelector('.mort-loan-category')?.value || '') === '연간원리금') {
    if (!annualText) return { message: '', isEmpty: true, rowInfoEmpty: true };
    return { message: '', isEmpty: false, rowInfoEmpty: false };
  }

  const rowInfoEmpty = !amtText && !rateText && !termText;
  if (rowInfoEmpty) return { message: '', isEmpty: true, rowInfoEmpty: true };

  const hasRate = (parseFloat(rateText) || 0) > 0;
  const hasTerm = (parseInt(termText, 10) || 0) > 0;
  let message = '';
  if (!hasRate && !hasTerm) message = '금리,개월 입력해주세요';
  else if (!hasRate) message = '금리 입력해주세요';

  return { message, isEmpty: false, rowInfoEmpty: false };
}

/* 입력이 비어 있는 추가대출 행이 있는지 확인한다(DSR/DTI 표시용). */
function getMortgageRowsInputState() {
  const rows = [...document.querySelectorAll('#mortgage-inputs .mortgage-row')];
  let message = '';
  let hasEmptyRow = false;
  rows.forEach((row) => {
    // 본건 첫 행은 화면 기본값(금리/기간)이 항상 있으므로 누락 판단에서 제외한다.
    if (row.classList.contains('first-row')) return;
    const state = getMortgageRowInputHint(row);
    if (state.rowInfoEmpty) { hasEmptyRow = true; return; }
    if (!message && state.message) message = state.message;
  });
  return { message, hasEmptyRow };
}

function updateMortgageReductionButtons() {
  const buttons = document.querySelectorAll('.mort-reduction-btn');
  if (!buttons.length) return;

  const incomeEls = document.querySelectorAll('.income-computed-hidden');
  const income = [...incomeEls].reduce((sum, el) => sum + (parseFloat((el.value || '').replace(/,/g, '')) || 0), 0);

  let totalDsrDebt = 0;
  const rows = document.querySelectorAll('#mortgage-inputs .mortgage-row');
  rows.forEach((row, index) => {
    totalDsrDebt += getMortgageAnnualDebtForRow(row, index);
  });

  // DSR 39.9%(사실상 40% 한도)를 꽹 채울 수 있는 여유 금액 계산에 쓰인다.
  const DSR_TARGET_PERCENT = 39.9;

  buttons.forEach((btn) => {
    const memoRow = btn.closest('.mortgage-memo-row');
    const sourceRow = memoRow ? memoRow.previousElementSibling : null;
    const category = sourceRow?.querySelector('.mort-loan-category')?.value || '';

    // 이 버튼은 "신용대" 인 추가대출 행에서만 노출한다.
    // 본건(첫 행)이거나 신용대가 아닌 행은 버튼을 숨기고, 숨긴 만큼 메모창이 폭을 차지한다.
    if (!sourceRow || sourceRow.classList.contains('first-row') || category !== '신용대') {
      btn.hidden = true;
      btn.style.display = 'none';
      btn.dataset.status = 'hidden';
      return;
    }
    btn.hidden = false;
    btn.style.display = '';

    // 입력 누락 안내가 우선(금리/개월 미입력 시 계산 불가)
    const hint = getMortgageRowInputHint(sourceRow);
    if (hint.message) {
      btn.textContent = hint.message;
      btn.dataset.status = 'missing';
      btn.dataset.addable = '';
      return;
    }

    // DSR 39.9% 기준으로 두 가지 경우를 모두 표시한다.
    //  - 초과: 이 행을 감액해야 하는 금액 → "N만 감액필요"
    //  - 여유: 이 행으로 더 받을 수 있는 금액 → "N만 추가가능"
    // 감액액/추가액은 같은 역산식(calcAddableLoanForRow)의 부호만 뒤집어 구한다.
    const diff = calcAddableLoanForRow(sourceRow, income, totalDsrDebt, DSR_TARGET_PERCENT);
    if (diff > 0) {
      btn.textContent = `${formatAddableAmount(diff)} 추가가능`;
      btn.dataset.status = 'possible';
      btn.dataset.addable = String(Math.round(diff));
      return;
    }
    if (diff < 0) {
      // 감액이 필요하지만 이 행 연부담으로는 목표까지 못 내리는 경우,
      // 이 행에서 줄일 수 있는 최대치(현재 금액 전체)를 감액액으로 표시한다.
      const reduce = Math.abs(diff);
      btn.textContent = `${formatAddableAmount(reduce)} 감액필요`;
      btn.dataset.status = 'reduce';
      btn.dataset.addable = '0';
      return;
    }
    // diff === 0: 정확히 39.9%에 걸린 경우
    btn.textContent = hint.rowInfoEmpty ? '' : '추가가능 0만';
    btn.dataset.status = hint.rowInfoEmpty ? 'empty' : 'possible';
    btn.dataset.addable = '0';
  });
}

/* 해당 행의 조건(금리·기간·상환방식)을 유지한 채로 금액을 늘이면 DSR이 얼마나 오를지 역산해
   "목표 DSR(39.9%)까지 추가로 가능한 금액"(원금 기준)을 반환한다.
   - 이 행의 연간부담은 금액에 정비례하므로 선형 비율로 계산할 수 있다. */
function calcAddableLoanForRow(sourceRow, income, totalDsrDebt, targetPercent) {
  if (!sourceRow || income <= 0) return 0;
  const amountInput = sourceRow.querySelector('.mort-amt');
  const currentAmount = amountInput ? (parseFloat(amountInput.value.replace(/,/g, '')) || 0) : 0;
  if (currentAmount <= 0) return 0;

  const rowIndex = [...document.querySelectorAll('#mortgage-inputs .mortgage-row')].indexOf(sourceRow);
  const rowDebt = getMortgageAnnualDebtForRow(sourceRow, rowIndex);
  if (rowDebt <= 0) return 0;

  // 여유가 없으면 양수 0을 돌려주면 초과/여유를 구분할 수 없으므로,
  // "이 행 연부담으로 목표 DSR에서 벗어난 금액"을 음수로 돌려준다.
  //  계산식 자체(room ÷ rowDebt × 현재금액)는 그대로이며 부호만 유지한다.
  const targetDebt = income * (targetPercent / 100);
  const room = targetDebt - totalDsrDebt;
  const amount = currentAmount * (room / rowDebt);
  return Number.isFinite(amount) ? amount : 0;
}

function formatAddableAmount(amount) {
  const n = Math.floor(Number(amount) || 0);
  if (n <= 0) return '0';
  if (n >= 100000000) {
    const eok = Math.floor(n / 100000000);
    const man = Math.floor((n % 100000000) / 10000);
    return man > 0 ? `${eok}억 ${man.toLocaleString()}만` : `${eok}억`;
  }
  const man = Math.floor(n / 10000);
  return `${man.toLocaleString()}만`;
}

function openDebtReductionRecommendation(button) {
  const memoRow = button.closest('.mortgage-memo-row');
  const sourceRow = memoRow ? memoRow.previousElementSibling : null;
  if (!sourceRow) return;

  const categoryInput = sourceRow.querySelector('.mort-loan-category');
  const amountInput = sourceRow.querySelector('.mort-amt');
  const rateInput = sourceRow.querySelector('.mort-rate');
  const termInput = sourceRow.querySelector('.mort-term');
  const typeInput = sourceRow.querySelector('.mort-type');

  const loanCategory = categoryInput ? categoryInput.value : '신용';
  const currentAmount = amountInput ? (parseFloat(amountInput.value.replace(/,/g, '')) || 0) : 0;
  const currentRate = rateInput ? (parseFloat(rateInput.value) || 0) : 0;
  const currentTerm = termInput ? (parseInt(termInput.value) || 0) : 0;

  if (loanCategory !== '신용대') {
    alert('신용대 구분 행에서만 추가가능 금액을 계산할 수 있습니다.');
    return;
  }

  if (!currentAmount || !currentRate || !currentTerm) {
    alert('신용대출 금액, 금리, 기간을 먼저 입력해 주세요.');
    return;
  }

  const incomeEls = document.querySelectorAll('.income-computed-hidden');
  const income = [...incomeEls].reduce((sum, el) => sum + (parseFloat((el.value || '').replace(/,/g, '')) || 0), 0);
  if (income <= 0) {
    alert('소득이 입력되어야 DSR 40% 기준 계산을 할 수 있습니다.');
    return;
  }

  let selectedDebt = 0;
  let totalDsrDebt = 0;
  const rows = document.querySelectorAll('#mortgage-inputs .mortgage-row');
  rows.forEach((row, index) => {
    const annualDebt = getMortgageAnnualDebtForRow(row, index);
    totalDsrDebt += annualDebt;
    if (row === sourceRow) selectedDebt = annualDebt;
  });

  if (selectedDebt <= 0) {
    alert('현재 신용대출의 DSR 반영액이 0이어서 계산할 수 없습니다.');
    return;
  }

  const currentDsr = (totalDsrDebt / income) * 100;
  // DSR 39.9%(사실상 40% 한도)까지 채울 수 있는 금액을 역산한다.
  const targetDebt = income * 0.399;
  const typeLabel = typeInput ? typeInput.value : '원리금';

  // [연간원리금 표시] 현재 입력된 신용대출의 연간 원리금을 계산해 모달에 함께 보여준다.
  //  · 원리금균등: 월상환금 × 12 (= 연 원금 + 연 이자)
  //  · 원금균등  : 연 원금 + 연 이자(대출금 × 금리 × (n+1) / 2n)
  //  · 만기일시  : 연 이자 + 연 원금(대출금 × 12 / 120개월 고정)
  //  selectedDebt(DSR 반영액)와는 다를 수 있다. 신용대는 DSR에 원리금 전액이 들어가므로
  //  원리금균등에서는 같은 값이지만, 만기일시는 DSR 반영액이 이자만이라 값이 달라진다.
  const annualPrincipal = (() => {
    if (typeLabel === '만기') {
      const principalTerm = Math.min(currentTerm > 0 ? currentTerm : 120, 120);
      return currentAmount * 12 / principalTerm;
    }
    return currentAmount * 12 / currentTerm;
  })();
  const annualInterest = (() => {
    if (typeLabel === '만기') return currentAmount * (currentRate / 100);
    if (typeLabel === '원금') return currentAmount * (currentRate / 100) * (currentTerm + 1) / (currentTerm * 2);
    const calc = 원리금균등_계산대출(currentAmount, currentRate / 100, currentTerm);
    return Math.max((calc.월상환금액 * 12) - annualPrincipal, 0);
  })();
  const annualTotal = annualPrincipal + annualInterest;
  const annualTotalText = formatKoreanAmount(Math.round(annualTotal));
  const annualDetailText = `연 원금 ${formatKoreanAmount(Math.round(annualPrincipal))} + 연 이자 ${formatKoreanAmount(Math.round(annualInterest))}`;
  const monthlyAverageText = formatKoreanAmount(Math.round(annualTotal / 12));

  const overlay = document.getElementById('image-modal');
  if (!overlay) return;

  const reductionCard = document.getElementById('reduction-recommend-card') || document.createElement('div');
  reductionCard.id = 'reduction-recommend-card';
  reductionCard.className = 'text-popup-card';
  reductionCard.style.display = 'block';
  reductionCard.style.maxWidth = '520px';
  reductionCard.style.width = 'min(92vw, 520px)';
  reductionCard.onclick = (e) => e.stopPropagation();

  if (currentDsr > 39.9) {
    const requiredDebtReduction = Math.max(0, totalDsrDebt - targetDebt);
    const recommendedAnnualDebtReduction = Math.min(selectedDebt, requiredDebtReduction);
    const principalReduction = selectedDebt > 0 ? currentAmount * (recommendedAnnualDebtReduction / selectedDebt) : 0;
    const recommendedAmount = Math.max(0, currentAmount - principalReduction);
    const reductionText = formatKoreanAmount(Math.round(principalReduction));

    reductionCard.innerHTML = `
      <div class="text-popup-title" style="margin-bottom: 12px;">💸 DSR 40% 감액 필요</div>
      <div class="text-popup-content">
        <div class="alert-box">
          현재 DSR <b>${currentDsr.toFixed(2)}%</b> 이므로, 목표 DSR 40% 달성을 위해<br>
          <b>신용대출</b>을 약 <b>${reductionText}</b> 정도 감액하는 것이 적절합니다.
        </div>
        <div class="info-section">
          <div class="section-title">📌 계산 기준</div>
          <ul class="info-list">
            <li>대출금액: ${formatKoreanAmount(Math.round(currentAmount))}</li>
            <li>금리: ${currentRate.toFixed(2)}%</li>
            <li>기간: ${currentTerm}개월</li>
            <li>상환방식: ${typeLabel}</li>
          </ul>
        </div>
        <div class="info-section">
          <div class="section-title">💰 현재 신용대출 연간원리금</div>
          <ul class="info-list">
            <li>연간 원리금: <b>${annualTotalText}</b></li>
            <li>${annualDetailText}</li>
            <li>월 평균: ${monthlyAverageText}</li>
          </ul>
        </div>
        <div class="info-section">
          <div class="section-title">🔍 역산 결과</div>
          <ul class="info-list">
            <li>현재 신용대출 DSR 반영액: ${formatKoreanAmount(Math.round(selectedDebt))}</li>
            <li>필요 감액액(원금 기준): 약 <b>${reductionText}</b></li>
            <li>감액 후 권장 대출금액: 약 <b>${formatKoreanAmount(Math.round(recommendedAmount))}</b></li>
          </ul>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn-neutral" onclick="closeModal()">닫기</button>
        </div>
      </div>
    `;
  } else {
    const availableDebtIncrease = Math.max(0, targetDebt - totalDsrDebt);
    const principalIncrease = selectedDebt > 0 ? currentAmount * (availableDebtIncrease / selectedDebt) : 0;
    const maxRecommendedAmount = currentAmount + principalIncrease;
    const increaseText = formatKoreanAmount(Math.round(principalIncrease));

    reductionCard.innerHTML = `
      <div class="text-popup-title" style="margin-bottom: 12px;">💸 DSR 40% 추가 가능</div>
      <div class="text-popup-content">
        <div class="alert-box">
          현재 DSR <b>${currentDsr.toFixed(2)}%</b> 이므로, 목표 DSR 40% 유지 기준으로<br>
          <b>신용대출</b>을 약 <b>${increaseText}</b>까지 더 받을 수 있습니다.
        </div>
        <div class="info-section">
          <div class="section-title">📌 계산 기준</div>
          <ul class="info-list">
            <li>대출금액: ${formatKoreanAmount(Math.round(currentAmount))}</li>
            <li>금리: ${currentRate.toFixed(2)}%</li>
            <li>기간: ${currentTerm}개월</li>
            <li>상환방식: ${typeLabel}</li>
          </ul>
        </div>
        <div class="info-section">
          <div class="section-title">💰 현재 신용대출 연간원리금</div>
          <ul class="info-list">
            <li>연간 원리금: <b>${annualTotalText}</b></li>
            <li>${annualDetailText}</li>
            <li>월 평균: ${monthlyAverageText}</li>
          </ul>
        </div>
        <div class="info-section">
          <div class="section-title">🔍 역산 결과</div>
          <ul class="info-list">
            <li>현재 총 DSR 반영액: ${formatKoreanAmount(Math.round(totalDsrDebt))}</li>
            <li>DSR 40% 기준 허용 한도: ${formatKoreanAmount(Math.round(targetDebt))}</li>
            <li>추가 가능 대출액: 약 <b>${increaseText}</b></li>
            <li>권장 최대 대출금액: 약 <b>${formatKoreanAmount(Math.round(maxRecommendedAmount))}</b></li>
          </ul>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn-neutral" onclick="closeModal()">닫기</button>
        </div>
      </div>
    `;
  }

  // 팝업을 닫아도 버튼 문구는 "N만 추가가능" 계산값을 그대로 유지한다.
  // (예전에는 클릭 시 '감액필요'/'추가가능'으로 바꿔 계산값이 사라졌음)
  updateMortgageReductionButtons();

  const allPanels = getModalPanels();
  ['imgModal', 'textCard', 'scheduleCard'].forEach(key => {
    if (allPanels[key]) allPanels[key].style.display = 'none';
  });
  overlay.appendChild(reductionCard);
  overlay.style.display = 'flex';
  reductionCard.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function setMortgageRepaymentType(btn, type) {
  const row = btn.closest('tr');
  if (!row) return;
  const typeInput = row.querySelector('.mort-type');
  if (typeInput) typeInput.value = type;
  const buttons = btn.parentElement.querySelectorAll('.type-btn');
  buttons.forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  // B타입: 선택된 방식 1개만 보이는 버튼 문구를 갱신하고 팝업을 닫는다.
  const trigger = row.querySelector('.type-btn-trigger');
  if (trigger) trigger.textContent = type;
  closeRepaymentTypeMenu();
  // 현재 구분에서 마지막으로 고른 방식을 기억한다(구분을 오가도 되살아나게).
  // hidden input(.mort-loan-category)이 병합 과정에서 잠시 행 밖에 있을 수 있으므로
  // 드롭다운 값을 우선 사용한다.
  const category = row.querySelector('.mort-category-select')?.value
    || row.querySelector('.mort-loan-category')?.value
    || '';
  saveRepayTypeForCategory(row, category, type);
  if (typeof 자동계산 === 'function') 자동계산();
  if (typeof saveDSRInputs === 'function') saveDSRInputs();
  applyJeonseRowLayout(row);
}

/* ── 상환방식 선택기 (순환형) ──
   [2026-11-11 변경] 팝업 대신 클릭할 때마다 다음 방식으로 순환한다.
   원리금 → 원금 → 만기 → 원리금 ...
   기존 .type-btn 버튼/이벤트는 그대로 두고, 순환 시 해당 버튼을 클릭해 준다
   (계산·저장 로직은 setMortgageRepaymentType 그대로 사용). */
const REPAYMENT_TYPE_CYCLE = ['원리금', '원금', '만기'];

function toggleRepaymentTypeMenu(trigger) {
  const row = trigger.closest('tr');
  if (!row) return;
  const typeInput = row.querySelector('.mort-type');

  // [2026-11-11 추가] 전세대·이자만은 상환방식이 "만기"로 고정이다.
  //  칩을 누르면 만기 → 원리금으로 순환해 계산이 바뀌고, 다시 만기로 돌아오지 않아
  //  "화면은 만기인데 계산은 원리금"이 되는 문제가 있었다.
  //  → 이 구분에서는 클릭을 무시하고 항상 만기로 유지한다.
  const category = row.querySelector('.mort-loan-category')?.value || '';
  if (category === '전세대' || category === '이자만') {
    if (typeInput && typeInput.value !== '만기') typeInput.value = '만기';
    row.querySelectorAll('.type-btn').forEach(btn => {
      btn.classList.toggle('active', (btn.getAttribute('onclick') || '').includes("'만기'"));
    });
    trigger.textContent = '만기';
    if (typeof 자동계산 === 'function') 자동계산();
    return;
  }

  const current = typeInput ? typeInput.value : '원리금';
  const idx = REPAYMENT_TYPE_CYCLE.indexOf(current);
  const next = REPAYMENT_TYPE_CYCLE[(idx + 1) % REPAYMENT_TYPE_CYCLE.length];
  const nextBtn = [...row.querySelectorAll('.type-btn')]
    .find(btn => (btn.getAttribute('onclick') || '').includes(`'${next}'`));
  if (nextBtn) {
    setMortgageRepaymentType(nextBtn, next);
  } else if (typeInput) {
    typeInput.value = next;
    trigger.textContent = next;
    if (typeof 자동계산 === 'function') 자동계산();
    if (typeof saveDSRInputs === 'function') saveDSRInputs();
  }
}

function closeRepaymentTypeMenu() {
  document.querySelectorAll('.type-btn-group.is-open').forEach(group => {
    group.classList.remove('is-open');
    const trigger = group.closest('tr')?.querySelector('.type-btn-trigger');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
  });
}

// 팝업 바깥을 누르면 닫기
if (!window.__repaymentTypeMenuBound) {
  window.__repaymentTypeMenuBound = true;
  document.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('.type-btn-group, .type-btn-trigger')) return;
    closeRepaymentTypeMenu();
  });
}

/* 구분이 "연간원리금"이면 금액·금리·ST금리·개월수·상환방식·거치 입력을 숨기고
   연간원리금 입력칸만 보여준다. 다른 구분으로 돌아오면 원래 입력칸을 복원한다.
   (입력값 자체는 지우지 않으므로 구분을 오가도 기존 값이 유지된다) */
function applyAnnualRepaymentMode(row) {
  if (!row) return;
  const isAnnual = (row.querySelector('.mort-loan-category')?.value || '') === '연간원리금';
  row.classList.toggle('is-annual-mode', isAnnual);

  // 숨기기 전 인라인 display 값을 기억해 두고, 복원할 때 그 값으로 되돌린다.
  // (CSS에서 display:flex 로 지정된 요소라 ''로 되돌리면 레이아웃이 틀어짐)
  const setDisplay = (el, hide) => {
    if (!el) return;
    if (hide) {
      if (el.dataset.prevDisplay === undefined) el.dataset.prevDisplay = el.style.display || '';
      el.style.display = 'none';
    } else if (el.dataset.prevDisplay !== undefined) {
      el.style.display = el.dataset.prevDisplay;
      delete el.dataset.prevDisplay;
    }
  };

  // 금액·금리·ST금리·개월수·상환방식·거치 입력을 숨긴다.
  setDisplay(row.querySelector('.mort-amt'), isAnnual);
  setDisplay(row.querySelector('.mort-rate'), isAnnual);
  setDisplay(row.querySelector('.mort-st-rate'), isAnnual);
  setDisplay(row.querySelector('.mort-term'), isAnnual);
  setDisplay(row.querySelector('.type-btn-row'), isAnnual);
  setDisplay(row.querySelector('.grace-cell'), isAnnual);
  // 금리/ST금리 줄과 6M/5Y 전환 버튼 줄을 통째로 숨긴다(빈 줄이 남지 않게).
  //  · 본건 행: .input-flex-col > .input-flex-row(전환버튼 + 금리 + ST금리)
  //  · 추가 행: 금액 줄에 금리칸이 직접 들어있어 위 setDisplay로 이미 숨겨짐
  const profileSwitchEl = row.querySelector('.mort-default-switch');
  const rateRow = profileSwitchEl ? profileSwitchEl.closest('.input-flex-row') : row.querySelector('.input-flex-row');
  setDisplay(rateRow, isAnnual);
  // 전환 버튼 자체도 숨긴다(줄을 못 찾는 구조 대비).
  setDisplay(profileSwitchEl, isAnnual);
  // 전환 버튼을 감싸는 랩퍼(.rate-toggle-row 등)가 남아 빈 줄이 생기지 않도록 함께 숨긴다.
  if (profileSwitchEl && profileSwitchEl.parentElement && profileSwitchEl.parentElement !== rateRow) {
    setDisplay(profileSwitchEl.parentElement, isAnnual);
  }
  // 본건 행의 6M/5Y 전환 버튼은 .input-flex-row 밖(별도 줄)에 있어 위 처리로 숨겨지지 않는다.
  // → 버튼을 감싸는 가장 가까운 줄을 찾아 통째로 숨긴다.
  if (profileSwitchEl) {
    const switchRow = profileSwitchEl.closest('.input-flex-row');
    if (switchRow) setDisplay(switchRow, isAnnual);
  }
  // 금리/ST금리 줄을 숨기면 그 줄이 차지하던 세로 공간이 남으므로,
  // 연간원리금 모드에서는 금액 칸의 세로 여백을 줄여 한 줄짜리 높이로 맞춘다.
  const amountCellPad = row.querySelector('.mort-exclude-amount-cell');
  if (amountCellPad) {
    if (isAnnual) {
      if (amountCellPad.dataset.prevPadding === undefined) {
        amountCellPad.dataset.prevPadding = amountCellPad.style.padding || '';
      }
      amountCellPad.style.padding = '4px 4px';
    } else if (amountCellPad.dataset.prevPadding !== undefined) {
      amountCellPad.style.padding = amountCellPad.dataset.prevPadding;
      delete amountCellPad.dataset.prevPadding;
    }
  }

  // 연간원리금 모드에서는 개월수 칸과 상환방식/거치 칸이 비므로 숨긴다.
  // 금액 칸은 원래 폭(55%)을 그대로 유지하고, 그 안에서 구분 드롭다운과
  // 연간원리금 입력칸이 같은 줄에 나란히 놓이게 한다.
  const termCell = row.querySelector('.mort-term')?.closest('td');
  const repaymentCell = row.querySelector('.mortgage-repayment-cell');
  setDisplay(termCell, isAnnual);
  setDisplay(repaymentCell, isAnnual);
  // 금액칸 TD는 항상 보여야 한다.
  // (신용대·원리금 병합/해제 과정에서 display:none 이 남아 연간원리금 입력칸까지 사라지던 문제)
  const amountCellEl = row.querySelector('.mort-exclude-amount-cell');
  if (amountCellEl) {
    amountCellEl.style.display = '';
    delete amountCellEl.dataset.prevDisplay;
  }
  // 금액 칸 안의 입력 줄: 연간원리금 모드에서는 줄바꿈 없이 한 줄 유지
  const amountRow = row.querySelector('.mort-amount-row');
  if (amountRow) amountRow.classList.toggle('is-annual-row', isAnnual);
  const annualInput = row.querySelector('.mort-annual');
  if (annualInput) annualInput.style.display = isAnnual ? '' : 'none';
  // 연간원리금 모드에서는 금액 입력칸이 없으므로 placeholder 안내도 바꿔준다.
  const amtInput = row.querySelector('.mort-amt');
  if (amtInput && !isAnnual) {
    const index = [...document.querySelectorAll('#mortgage-inputs .mortgage-row')].indexOf(row);
    amtInput.placeholder = index === 0 ? '본건 대출금액입력' : `보유대출금액 ${index}`;
  }
}

/* 구분이 "전세대"일 때만 적용하는 화면 전용 레이아웃 (2026-11-11 재구현).
   TD가 나뉘어 있으면 열 폭(colgroup 55/15/15/15%)에 갇혀 정렬이 틀어지므로,
   전세대일 때는 4개 TD를 1개 TD로 합치고 그 안에 한 줄 컨테이너(.mort-jeonse-line)를 만든다.
   - 1행: 드롭다운 · 대출금액(40%) · 금리(25%) · ST금리(25%)   [개월수 숨김]
   - 2행: 메모 입력창(기존 .mortgage-memo-row) 그대로 유지
   - 금리선택기(6M/2Y) 숨김, 상환방식은 만기일시(내부값 '만기')로 자동 선택 후 선택기 숨김
   계산 로직/입력값은 건드리지 않고 표시만 바꾼다. 다른 구분으로 돌아오면 원래 구조로 복원한다. */
/* C타입: 상환방식 선택기를 메모 행 오른쪽 슬롯으로 옮기거나 원래 자리로 되돌린다.
   - 옮길 때: .type-btn-row를 메모 행의 .mort-repayment-slot 안으로 이동
   - 되돌릴 때: .mortgage-repayment-cell 안으로 다시 이동
   숨겨진 상태값(.mort-type / .mort-loan-category)은 행에 그대로 두어 계산 로직이 계속 찾을 수 있게 한다. */
function moveRepaymentToMemoRow(row, move) {
  if (!row) return;
  const memoRow = row.nextElementSibling;
  if (!memoRow || !memoRow.classList.contains('mortgage-memo-row')) return;
  const slot = memoRow.querySelector('.mort-repayment-slot');
  const repaymentCell = row.querySelector('.mortgage-repayment-cell');
  const typeRow = row.querySelector('.type-btn-row') || slot?.querySelector('.type-btn-row');
  if (!slot || !repaymentCell || !typeRow) return;

  if (move) {
    if (typeRow.parentElement !== slot) slot.appendChild(typeRow);
  } else if (typeRow.parentElement !== repaymentCell) {
    // 원래 자리(상환방식 TD)의 맨 앞으로 되돌린다.
    repaymentCell.insertBefore(typeRow, repaymentCell.firstChild);
  }
}

/* C타입: 신용대 · 원리금 행을 TD 하나로 병합한다.
   [드롭다운][금액][금리][개월][상환방식] 을 한 줄로 정렬하고,
   2번째 행(메모)는 그대로 둔다. 다른 구분으로 돌아오면 원래 3-TD 구조로 복원한다. */
function applyCompactRepaymentLayout(row, compact) {
  if (!row) return;
  const amountCell = row.querySelector('.mort-exclude-amount-cell');
  const termCell = row.querySelector('.mort-term')?.closest('td');
  const repaymentCell = row.querySelector('.mortgage-repayment-cell');
  if (!amountCell) return;
  const merged = amountCell.classList.contains('mort-compact-single-cell');

  if (compact) {
    if (merged) return;
    if (!termCell || !repaymentCell) return;

    const line = document.createElement('div');
    line.className = 'mort-compact-line';

    // 1) 드롭다운 + 금액 (+ 추가 행이면 금리까지)
    const amountRow = amountCell.querySelector('.mort-amount-row');
    if (amountRow) [...amountRow.children].forEach(child => line.appendChild(child));
    // 2) 본건 행의 금리/ST금리 줄(금리선택기 포함)도 한 줄로 끌어온다.
    //    (이걸 빼먹으면 주담대로 돌아올 때 금리·ST금리 칸이 사라짐)
    const rateRow = amountCell.querySelector('.input-flex-row');
    if (rateRow) [...rateRow.children].forEach(child => line.appendChild(child));
    // 3) 개월수
    const termInput = termCell.querySelector('.mort-term');
    if (termInput) line.appendChild(termInput);
    // 4) 상환방식
    const typeRow = repaymentCell.querySelector('.type-btn-row');
    if (typeRow) line.appendChild(typeRow);
    // 4) 숨겨진 상태값은 행에 그대로 둔다.
    repaymentCell.querySelectorAll('.mort-type, .mort-loan-category').forEach(input => row.appendChild(input));

    // 나머지 TD 제거 후 금액 TD 하나만 남긴다.
    [...row.children].filter(el => el.tagName === 'TD' && el !== amountCell).forEach(el => el.remove());
    amountCell.className = 'no-bg mort-exclude-amount-cell mort-compact-single-cell';
    amountCell.removeAttribute('style');
    amountCell.colSpan = 4;
    amountCell.innerHTML = '';
    amountCell.appendChild(line);
    row.dataset.compactMerged = '1';
    return;
  }

  // ── 해제: 원래 3-TD 구조로 되돌린다 ──
  if (!merged || !row.dataset.compactMerged) return;
  delete row.dataset.compactMerged;

  const line = amountCell.querySelector('.mort-compact-line');
  if (!line) return;

  const select = line.querySelector('.mort-category-select');
  const amt = line.querySelector('.mort-amt');
  const annual = line.querySelector('.mort-annual');
  const rate = line.querySelector('.mort-rate');
  const stRate = line.querySelector('.mort-st-rate');
  const term = line.querySelector('.mort-term');
  const typeRow = line.querySelector('.type-btn-row');
  const isFirstRow = row.classList.contains('first-row');

  // 본건 행은 [드롭다운+금액] 줄과 [금리선택기+금리+ST금리] 줄로 나뉜 원래 구조로 되돌린다.
  // 추가 행은 금액 줄에 금리까지 한 줄로 들어간다.
  const amountRow = document.createElement('div');
  amountRow.className = isFirstRow ? 'mort-amount-row' : 'mort-amount-row mort-amount-row--added';
  if (select) amountRow.appendChild(select);
  if (amt) amountRow.appendChild(amt);
  if (!isFirstRow && rate) amountRow.appendChild(rate);
  if (annual) amountRow.appendChild(annual);

  amountCell.className = 'no-bg mort-exclude-amount-cell' + (isFirstRow ? ' first-row' : '');
  amountCell.colSpan = 1;
  amountCell.style.width = '55%';
  amountCell.style.padding = '4px 4px';
  amountCell.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'mort-exclude-amount-wrap';

  if (isFirstRow) {
    // 본건: 세로 묶음 안에 금액 줄 + 금리/ST금리 줄을 둔다.
    const col = document.createElement('div');
    col.className = 'input-flex-col';
    col.appendChild(amountRow);
    const profileInput = document.createElement('input');
    profileInput.type = 'hidden';
    profileInput.className = 'mort-default-profile';
    profileInput.value = '6M';
    col.appendChild(profileInput);

    const rateRow = document.createElement('div');
    rateRow.className = 'input-flex-row';
    const profileSwitch = document.createElement('button');
    profileSwitch.type = 'button';
    profileSwitch.className = 'mort-default-switch';
    profileSwitch.dataset.profile = '6M';
    profileSwitch.setAttribute('aria-label', '6M/5Y 전환');
    profileSwitch.innerHTML = '<span class="switch-label active">6M</span><span class="switch-label">5Y</span>';
    rateRow.appendChild(profileSwitch);
    if (rate) rateRow.appendChild(rate);
    if (stRate) rateRow.appendChild(stRate);
    col.appendChild(rateRow);
    wrap.appendChild(col);
  } else {
    wrap.appendChild(amountRow);
  }
  amountCell.appendChild(wrap);

  const termTd = document.createElement('td');
  termTd.className = 'no-bg' + (isFirstRow ? ' first-row' : '');
  termTd.style.width = '15%';
  termTd.style.padding = '4px 2px';
  if (term) termTd.appendChild(term);

  const repayTd = document.createElement('td');
  repayTd.className = 'no-bg mortgage-repayment-cell' + (isFirstRow ? ' first-row' : '');
  repayTd.colSpan = 2;
  repayTd.style.width = '30%';
  repayTd.style.padding = '4px 3px';
  if (typeRow) repayTd.appendChild(typeRow);
  repayTd.innerHTML += `
    <div class="grace-cell">
      <input type="checkbox" class="mort-grace-check" title="거치 적용">
      <input type="text" inputmode="numeric" placeholder="거치(개월)" class="mort-grace-term grace-term-input">
    </div>`;

  row.appendChild(termTd);
  row.appendChild(repayTd);

  row.querySelectorAll('.mort-type, .mort-loan-category').forEach(input => repayTd.appendChild(input));

  bindMortgageRowEvents(row);
  applyAnnualRepaymentMode(row);
}

/* ST금리 칸 표시/숨김과 값 보존을 함께 처리한다.
   숨기는 구분에서는 input을 숨기면서 값을 비워 DSR 계산에 섞이지 않게 하고,
   비우기 직전 값을 row.dataset 에 보관했다가 다른 구분으로 돌아오면 복원한다. */
function applyStRateVisibility(row, hide) {
  if (!row) return;
  const stRateInput = row.querySelector('.mort-st-rate');
  if (!stRateInput) return;
  if (hide) {
    if (row.dataset.stRateSaved === undefined) row.dataset.stRateSaved = stRateInput.value || '';
    if (stRateInput.value !== '') {
      stRateInput.value = '';
      stRateInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    stRateInput.style.display = 'none';
  } else {
    stRateInput.style.display = '';
    if (row.dataset.stRateSaved !== undefined) {
      const saved = row.dataset.stRateSaved;
      delete row.dataset.stRateSaved;
      if (saved !== '' && stRateInput.value === '') {
        stRateInput.value = saved;
        stRateInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  }
}

/* ── 구분별 입력값 저장소 (2026-11-11 추가) ──
   드롭다운 구분마다 금액·금리·ST금리·개월수·상환방식을 각각 따로 기억한다.
   예) 주담대에 3억/4.5% 를 넣고 전세대로 바꿔 2억/3.7% 를 넣은 뒤
       다시 주담대로 돌아오면 3억/4.5% 가 그대로 나온다.
   저장 위치: row.dataset.categoryInputStore = JSON 문자열
     { "주담대": { amt, rate, stRate, term, type }, "전세대": {...} }
   본건 행은 금리·ST금리가 이미 별도 키(DSR_firstRowRate_*)로 관리되므로
   여기서는 금액·개월수·상환방식만 다룬다(중복 저장 방지). */
const CATEGORY_INPUT_FIELDS = ['amt', 'rate', 'stRate', 'term', 'type'];

function getCategoryInputStore(row) {
  try {
    return JSON.parse(row.dataset.categoryInputStore || '{}') || {};
  } catch (e) {
    return {};
  }
}

function readRowInputs(row) {
  return {
    amt: row.querySelector('.mort-amt')?.value || '',
    rate: row.querySelector('.mort-rate')?.value || '',
    stRate: row.querySelector('.mort-st-rate')?.value || '',
    term: row.querySelector('.mort-term')?.value || '',
    type: row.querySelector('.mort-type')?.value || '원리금'
  };
}

/* 현재 구분에 지금 화면의 입력값을 저장한다. */
function saveCategoryInputs(row, category) {
  if (!row || !category) return;
  const store = getCategoryInputStore(row);
  const prev = store[category] || {};
  const current = readRowInputs(row);
  // [2026-11-11 변경] 본건 행의 구분별 저장소는 "이 구분 고유값"만 기억한다.
  //  · 금리·ST금리: 주담대/원리금/전세대는 이미 DSR_firstRowRate_* 전용 키로 분리되어 있으므로 여기서는 저장하지 않는다.
  //    (여기 저장하면 주담대에 넣은 금리가 원리금으로 돌아와도 다시 복원되는 원인)
  //  · 개월수·상환방식: 원리금은 따로 기억하지 않는다(초기화 후에도 이전 값이 되살아나지 않도록).
  const isFirstRow = row.classList.contains('first-row');
  const isWongum = category === '원리금';
  // [2026-11-11 변경] 전세대·이자만은 상환방식이 "만기"로 자동 고정된다.
  //  이 자동값을 저장해 두면 주담대/신용대로 돌아왔을 때 만기가 그대로 따라온다.
  //  → 전세대·이자만은 상환방식을 저장하지 않는다(저장값이 없으면 기본값 원리금).
  const isJeonseCategory = category === '전세대' || category === '이자만';
  const next = isFirstRow
    ? {
        amt: current.amt,
        rate: '',
        stRate: '',
        term: isWongum ? '' : current.term,
        type: isWongum ? '원리금' : current.type
      }
    : {
        amt: current.amt,
        rate: current.rate,
        stRate: current.stRate,
        term: current.term,
        // 전세대·이자만의 자동 "만기"는 기억하지 않는다.
        type: isJeonseCategory ? '' : current.type
      };
  store[category] = Object.assign({}, prev, next);
  row.dataset.categoryInputStore = JSON.stringify(store);
}

/* 저장된 구분 입력값을 화면에 되살린다. 저장값이 없으면 아무것도 하지 않는다. */
function restoreCategoryInputs(row, category) {
  if (!row || !category) return;
  const store = getCategoryInputStore(row);
  const saved = store[category];
  if (!saved) return;
  const setVal = (sel, v) => {
    const el = row.querySelector(sel);
    if (!el || v === undefined || v === null) return;
    if (el.value === String(v)) return;
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const isFirstRow = row.classList.contains('first-row');
  setVal('.mort-amt', saved.amt);
  // [2026-11-11 변경] 본건 행의 금리·ST금리·개월수는 각 구분 전용 저장소(DSR_firstRowRate_* 등)가
  //  담당한다. 여기서 또 복원하면 다른 구분의 값이 이 칸에 되살아난다(원리금 금리 잔존 원인).
  if (!isFirstRow) {
    setVal('.mort-rate', saved.rate);
    setVal('.mort-st-rate', saved.stRate);
    setVal('.mort-term', saved.term);
  }
  if (saved.type) {
    // [2026-11-11 변경] 전세대·이자만은 상환방식이 항상 "만기"로 고정된다.
    //  저장된 type(예전에 저장된 "원리금")을 복원하면 칩 문구가 원리금으로 남는다.
    //  → 이 구분들은 type 복원을 건너뛴다.
    const isJeonseCategory = category === '전세대' || category === '이자만';
    if (!isJeonseCategory) {
      const typeInput = row.querySelector('.mort-type');
      if (typeInput && typeInput.value !== saved.type) {
        typeInput.value = saved.type;
        row.querySelectorAll('.type-btn').forEach(btn => {
          btn.classList.toggle('active', (btn.getAttribute('onclick') || '').includes(`'${saved.type}'`));
        });
        const trigger = row.querySelector('.type-btn-trigger');
        if (trigger) trigger.textContent = saved.type;
      }
    }
  } else if (!isFirstRow) {
    // [2026-11-11 추가] 추가대출행에서 이 구분에 저장된 상환방식이 없으면
    //  기본값(원리금)으로 되돌린다. (전세대의 자동 "만기"가 따라오지 않게)
    const typeInput = row.querySelector('.mort-type');
    if (typeInput && typeInput.value !== '원리금') {
      typeInput.value = '원리금';
      row.querySelectorAll('.type-btn').forEach(btn => {
        btn.classList.toggle('active', (btn.getAttribute('onclick') || '').includes("'원리금'"));
      });
      const trigger = row.querySelector('.type-btn-trigger');
      if (trigger) trigger.textContent = '원리금';
    }
  }
}

/* 구분별 입력값 저장소를 모두 비운다(초기화용). */
function clearCategoryInputStore(row) {
  if (!row) return;
  delete row.dataset.categoryInputStore;
}

/* 본건 행의 구분별 전용 저장 키(금리·ST금리·개월수)를 모두 비운다(초기화용).
   DSR_firstRowRate_주담대_6M / _주담대_2Y / _전세대 / _원리금 ,
   DSR_firstRowStRate_주담대_6M / _주담대_2Y / _전세대 / _원리금 */
function clearFirstRowCategoryRateStore() {
  const categories = ['주담대_6M', '주담대_2Y', '전세대', '원리금'];
  categories.forEach(cat => {
    consultLocalStorage.removeItem(`${FIRST_ROW_RATE_KEY_PREFIX}${cat}`);
    consultLocalStorage.removeItem(`${FIRST_ROW_ST_RATE_KEY_PREFIX}${cat}`);
    consultLocalStorage.removeItem(`${FIRST_ROW_TERM_KEY_PREFIX}${cat}`);
  });
  // 예전 형식(프로필 묶음)도 함께 비운다.
  consultLocalStorage.removeItem(FIRST_ROW_PROFILE_VALUES_KEY);
}

/* 구분별 상환방식 기억 (2026-11-11 추가)
   드롭다운으로 구분을 바꿨다가 돌아오면, 그 구분에서 마지막으로 쓰던 상환방식을 되살린다.
   예) 주담대=원리금 → 신용대=원금 → 주담대 돌아오면 다시 원리금
   저장 위치: row.dataset.repayTypeByCategory = JSON 문자열 */
function getRepayTypeMap(row) {
  try {
    return JSON.parse(row.dataset.repayTypeByCategory || '{}') || {};
  } catch (e) {
    return {};
  }
}

function saveRepayTypeForCategory(row, category, type) {
  if (!row || !category || !type) return;
  const map = getRepayTypeMap(row);
  map[category] = type;
  row.dataset.repayTypeByCategory = JSON.stringify(map);
}

function restoreRepaymentTypeForCategory(row, category) {
  if (!row || !category) return;
  const map = getRepayTypeMap(row);
  const saved = map[category];
  if (!saved) return;
  const typeInput = row.querySelector('.mort-type');
  if (!typeInput || typeInput.value === saved) return;
  typeInput.value = saved;
  row.querySelectorAll('.type-btn').forEach(btn => {
    btn.classList.toggle('active', (btn.getAttribute('onclick') || '').includes(`'${saved}'`));
  });
  const trigger = row.querySelector('.type-btn-trigger');
  if (trigger) trigger.textContent = saved;
}

function applyJeonseRowLayout(row) {
  if (!row) return;
  // 드롭다운(updateLoanCategory)이 호출한 경우 구분 전환으로 표시한다.
  const isCategorySwitch = __inCategoryChange > 0;
  const category = row.querySelector('.mort-loan-category')?.value || '';
  // [2026-11-11 변경] "이자만"도 전세대와 동일한 레이아웃을 쓴다.
  //  (둘 다 원금 상환이 없는 상품이라 만기일시 고정·개월수/거치 불필요)
  const isJeonse = category === '전세대' || category === '이자만';
  row.classList.toggle('is-jeonse-layout', isJeonse);

  // 구분이 바뀌면 본건 행의 금리·ST금리를 그 구분 전용 저장소 값으로 갱신한다.
  // (주담대 6M / 주담대 2Y / 전세대 / 원리금 이 서로 섞이지 않게 함)
  syncFirstRowRateAndStRate(row, isCategorySwitch);

  // 금리선택기(6M/5Y)를 숨기는 구분: 전세대 · 신용대 · 이자만 · 원리금
  // (주담대·연간원리금은 현재 상태 유지 — 연간원리금은 기존 CSS가 숨김)
  const hideRateSwitch = isJeonse || category === '신용대' || category === '이자만' || category === '원리금';
  row.classList.toggle('is-rate-switch-hidden', hideRateSwitch);

  // 거치 입력(체크박스 + 개월수)을 숨기는 구분: 신용대 · 원리금 · 이자만
  const hideGrace = category === '신용대' || category === '원리금' || category === '이자만';
  row.classList.toggle('is-grace-hidden', hideGrace);

  // ST금리 칸을 숨기는 구분: 신용대 · 원리금 · 연간원리금
  // [2026-11-11 변경] 보유대출(추가대출) 행은 ST금리를 계산하지 않으므로 구분과 무관하게 숨긴다.
  //  (본건 행에만 ST금리 칸이 보인다 — 전세대→주담대 전환 시 ST칸이 다시 나타나던 문제)
  // (계산 로직은 hidden 입력도 그대로 읽으므로, 숨길 때 값을 비우고 원래 값은 저장해 둔다.
  //  → 다시 ST금리를 쓰는 구분으로 돌아오면 저장해 둔 값을 복원한다.)
  const isFirstRowForSt = row.classList.contains('first-row');
  const hideStRate = !isFirstRowForSt
    || category === '신용대' || category === '원리금' || category === '연간원리금';
  row.classList.toggle('is-st-rate-hidden', hideStRate);
  applyStRateVisibility(row, hideStRate);

  // C타입: 신용대·원리금은 첫 행을 TD 하나로 병합해
  // [드롭다운][금액][금리][개월][상환방식] 을 한 줄로 정렬한다.
  // [2026-11-11 변경] 보유대출(추가대출) 행은 구분과 무관하게 항상 한 줄로 병합한다.
  //  (전세대→주담대 전환 시 3-TD 구조로 풀려 ST금리 칸이 다시 보이던 문제)
  const isAddedRow = !row.classList.contains('first-row');
  const moveRepayment = isAddedRow || category === '신용대' || category === '원리금';
  row.classList.toggle('is-repayment-moved', moveRepayment);
  // [2026-11-11 변경] 병합/해제는 상환방식을 정한 뒤에 한다.
  //  (병합 해제가 버튼을 새로 만들면서 이전 값을 복사해, 전세대 재진입 시
  //   칩 문구가 "원리금"으로 남는 문제가 있었다)
  //  → 아래에서 상환방식을 먼저 확정하고, 그 다음에 병합을 적용한다.

  // 구분별 상환방식 기억: 구분을 바꿨다 돌아오면 그 구분에서 쓰던 방식을 되살린다.
  // (전세대·이자만은 만기 고정이므로 제외)
  // [2026-11-11 변경] 전세대에서 자동으로 넣은 "만기"가 주담대/신용대 저장소에 남아
  //  구분을 바꿔도 만기가 그대로 따라오던 문제.
  //  → 전세대·이자만으로 들어갈 때는 "이전 구분의 상환방식을 저장하지 않고",
  //    나올 때는 그 구분에 저장된 값이 있으면 그것을, 없으면 기본값(원리금)을 쓴다.
  if (!isJeonse) {
    restoreRepaymentTypeForCategory(row, category);
    // [2026-11-11 추가] 추가대출행: 이 구분에 저장된 상환방식이 없으면 기본값(원리금)으로 되돌린다.
    //  (전세대에서 자동으로 넣은 "만기"가 그대로 따라오는 것을 막는다)
    //  상환방식은 repayTypeByCategory 에 저장되므로 그 값을 기준으로 판단한다.
    if (!row.classList.contains('first-row')) {
      const savedType = getRepayTypeMap(row)[category];
      if (!savedType) {
        const typeInput = row.querySelector('.mort-type');
        if (typeInput && typeInput.value !== '원리금') {
          typeInput.value = '원리금';
          row.querySelectorAll('.type-btn').forEach(btn => {
            btn.classList.toggle('active', (btn.getAttribute('onclick') || '').includes("'원리금'"));
          });
          const trigger = row.querySelector('.type-btn-trigger');
          if (trigger) trigger.textContent = '원리금';
        }
      }
    }
  } else {
    // 전세대·이자만은 항상 만기일시로 고정한다(저장소에는 쓰지 않는다).
    const jeonseTypeInput = row.querySelector('.mort-type');
    if (jeonseTypeInput && jeonseTypeInput.value !== '만기') jeonseTypeInput.value = '만기';
    row.querySelectorAll('.type-btn').forEach(btn => {
      btn.classList.toggle('active', (btn.getAttribute('onclick') || '').includes("'만기'"));
    });
    // [2026-11-11 추가] 병합이 이미 유지된 상태(재진입)에서는 버튼이 새로 만들어지지 않으므로
    //  칩 문구를 여기서 직접 "만기"로 맞춘다. (원리금으로 남아 보이던 문제)
    const jeonseTrigger = row.querySelector('.type-btn-trigger');
    if (jeonseTrigger) jeonseTrigger.textContent = '만기';
  }

  // [2026-11-11 변경] 상환방식을 확정한 뒤에 병합/해제를 적용한다.
  //  (병합 해제가 버튼을 새로 만들기 때문에, 먼저 확정해야 칩 문구가 맞게 나온다)
  applyCompactRepaymentLayout(row, moveRepayment);

  // B타입 상환방식 선택기: 현재 선택된 방식 1개만 보이도록 문구를 맞춘다.
  const typeTrigger = row.querySelector('.type-btn-trigger');
  if (typeTrigger) {
    const activeBtn = row.querySelector('.type-btn.active');
    if (activeBtn) typeTrigger.textContent = activeBtn.textContent.trim();
  }

  const cells = [...row.children].filter(el => el.tagName === 'TD');
  const amountCell = row.querySelector('.mort-exclude-amount-cell');
  if (!amountCell) return;
  const isMerged = amountCell.classList.contains('mort-jeonse-single-cell');
  const termCell = row.querySelector('.mort-term')?.closest('td');
  const repaymentCell = row.querySelector('.mortgage-repayment-cell');

  // 표의 colgroup(55/15/15/15%)이 열 폭을 고정하므로, 병합된 한 칸은 colspan=4로
  // 4개 열을 모두 차지하게 한다. (colgroup을 숨기면 다른 행 폭까지 바뀌므로 건드리지 않는다)

  if (isJeonse) {
    // [2026-11-11 변경] 보유대출(추가대출) 행은 전세대여도 별도 병합을 하지 않는다.
    //  추가대출행은 아래 C타입(한 줄 병합)으로 통일해 [드롭다운][금액][금리][개월][상환방식]을
    //  한 줄로 나열한다. (전세대 전용 병합과 겹치면 레이아웃이 깨진다)
    if (!row.classList.contains('first-row')) {
      // 상환방식만 만기일시로 맞춘다.
      const addedTypeInput = row.querySelector('.mort-type');
      if (addedTypeInput && addedTypeInput.value !== '만기') addedTypeInput.value = '만기';
      row.querySelectorAll('.type-btn').forEach(btn => {
        btn.classList.toggle('active', (btn.getAttribute('onclick') || '').includes("'만기'"));
      });
      // [2026-11-11 추가] 여기서 return 하면 아래 칩 문구 갱신을 건너뛰어
      //  전세대 재진입 시 칩이 "원리금"으로 남는다. 여기서 직접 "만기"로 맞춘다.
      const addedTrigger = row.querySelector('.type-btn-trigger');
      if (addedTrigger) addedTrigger.textContent = '만기';
      return;
    }
    // 합쳐진 뒤에는 개월수/상환방식 TD가 없으므로, 합치기 전에만 존재 여부를 검사한다.
    if (!isMerged && (!termCell || !repaymentCell)) return;
    // 상환방식: 전세대는 만기일시로 자동 선택
    const typeInput = row.querySelector('.mort-type');
    if (typeInput && typeInput.value !== '만기') typeInput.value = '만기';
    row.querySelectorAll('.type-btn').forEach(btn => {
      btn.classList.toggle('active', (btn.getAttribute('onclick') || '').includes("'만기'"));
    });

    // 이미 합쳐져 있으면 다시 만들지 않는다(재진입 방지).
    if (isMerged) return;

    // 원래 구조를 복원할 수 있도록 원본 TD/자식들을 기억해 둔다.
    row.dataset.jeonseMerged = '1';
    const line = document.createElement('div');
    line.className = 'mort-jeonse-line';

    // 1) 드롭다운 + 금액
    // [2026-11-11 추가] 전세대 한 줄 구성에 각 칸 라벨을 붙인다.
    //   대출구분 / 대출금액 / 금리% / 스트레스금리%
    //   라벨은 입력칸을 감싸는 <label class="mort-jeonse-field"> 안에 넣어
    //   라벨을 눌러도 해당 입력칸에 포커스가 가게 한다.
    const wrapWithLabel = (el, text) => {
      if (!el) return null;
      const box = document.createElement('label');
      box.className = 'mort-jeonse-field';
      const cap = document.createElement('span');
      cap.className = 'mort-jeonse-label';
      cap.textContent = text;
      box.appendChild(cap);
      box.appendChild(el);
      return box;
    };

    const amountRow = amountCell.querySelector('.mort-amount-row');
    if (amountRow) {
      [...amountRow.children].forEach(child => {
        if (child.classList.contains('mort-category-select')) {
          line.appendChild(wrapWithLabel(child, '대출구분'));
        } else if (child.classList.contains('mort-amt')) {
          line.appendChild(wrapWithLabel(child, '대출금액'));
        } else {
          line.appendChild(child);
        }
      });
    }
    // 2) 금리 + ST금리 (금리선택기 6M/2Y는 CSS로 숨김)
    const rateRow = amountCell.querySelector('.input-flex-row');
    if (rateRow) {
      [...rateRow.children].forEach(child => {
        if (child.classList.contains('mort-rate')) {
          line.appendChild(wrapWithLabel(child, '금리%'));
        } else if (child.classList.contains('mort-st-rate')) {
          line.appendChild(wrapWithLabel(child, '스트레스금리%'));
        } else {
          line.appendChild(child);
        }
      });
    }
    // 3) 개월수 (CSS로 숨김 — 값/이벤트는 그대로 살아 있음)
    const termInput = termCell.querySelector('.mort-term');
    if (termInput) line.appendChild(termInput);

    // 4) 숨겨진 상태값(.mort-type / .mort-loan-category)은 행에 그대로 남겨 계산 로직이 계속 찾을 수 있게 한다.
    const hiddenInputs = repaymentCell.querySelectorAll('.mort-type, .mort-loan-category');
    hiddenInputs.forEach(input => row.appendChild(input));

    // 5) 나머지 TD는 제거하고, 금액 TD 하나만 남겨 한 줄 전체를 쓰게 한다.
    cells.forEach(cell => {
      if (cell !== amountCell) cell.remove();
    });
    amountCell.className = 'no-bg mort-exclude-amount-cell mort-jeonse-single-cell';
    amountCell.removeAttribute('style');
    // colgroup(55/15/15/15%)이 열 폭을 고정하므로, 4개 열을 모두 차지하게 한다.
    // (colgroup을 숨기면 본건·보유대출 행 폭까지 바뀌므로 colspan으로 해결)
    amountCell.colSpan = 4;
    amountCell.innerHTML = '';
    amountCell.appendChild(line);
    return;
  }

  // ── 전세대 해제: 원래 4-TD 구조로 되돌린다 ──
  if (!row.dataset.jeonseMerged) return;
  delete row.dataset.jeonseMerged;

  const line = amountCell.querySelector('.mort-jeonse-line');
  if (!line) return;

  const select = line.querySelector('.mort-category-select');
  const amt = line.querySelector('.mort-amt');
  const annual = line.querySelector('.mort-annual');
  const rate = line.querySelector('.mort-rate');
  const stRate = line.querySelector('.mort-st-rate');
  const term = line.querySelector('.mort-term');
  const profileSwitch = line.querySelector('.mort-default-switch');
  const typeInput = row.querySelector('.mort-type');
  const categoryInput = row.querySelector('.mort-loan-category');
  const isFirstRow = row.classList.contains('first-row');

  // 금액 TD 복원 (본건 행은 금리선택기 6M/5Y 버튼도 함께 되살린다)
  amountCell.className = 'no-bg mort-exclude-amount-cell' + (isFirstRow ? ' first-row' : '');
  amountCell.colSpan = 1;
  amountCell.style.width = '55%';
  amountCell.style.padding = '4px 4px';
  amountCell.innerHTML = `
    <div class="mort-exclude-amount-wrap">
      <div class="input-flex-col">
        <div class="mort-amount-row">
          ${select ? select.outerHTML : ''}
          ${amt ? amt.outerHTML : ''}
          ${annual ? annual.outerHTML : ''}
        </div>
        <input type="hidden" class="mort-default-profile" value="6M">
        <div class="input-flex-row">
          ${profileSwitch ? profileSwitch.outerHTML : (isFirstRow ? '<button type="button" class="mort-default-switch" data-profile="6M" aria-label="6M/5Y 전환"><span class="switch-label active">6M</span><span class="switch-label">5Y</span></button>' : '')}
          <input type="text" inputmode="decimal" placeholder="금리 %" class="mort-rate">
          <input type="text" inputmode="decimal" placeholder="ST %" class="mort-st-rate">
        </div>
      </div>
    </div>`;

  // 개월수 TD 복원
  const termTd = document.createElement('td');
  termTd.className = 'no-bg' + (row.classList.contains('first-row') ? ' first-row' : '');
  termTd.style.width = '15%';
  termTd.style.padding = '4px 2px';
  termTd.appendChild(term || document.createElement('input'));

  // 상환방식 TD 복원
  const repayTd = document.createElement('td');
  repayTd.className = 'no-bg mortgage-repayment-cell' + (row.classList.contains('first-row') ? ' first-row' : '');
  repayTd.colSpan = 2;
  repayTd.style.width = '30%';
  repayTd.style.padding = '4px 3px';
  // B타입: 현재 선택된 방식 1개만 보이는 트리거 + 3개 선택지 팝업
  // [2026-11-11 변경] 추가대출행이 전세대(자동 만기)에서 다른 구분으로 나올 때
  //  만기가 그대로 따라오지 않도록, 저장된 상환방식이 없으면 기본값(원리금)을 쓴다.
  //  (이 함수는 병합을 풀면서 버튼을 새로 만들기 때문에 여기서 값을 정해야 한다)
  let currentType = typeInput ? typeInput.value : '원리금';
  if (!isFirstRow) {
    const savedType = getRepayTypeMap(row)[categoryInput?.value || ''];
    currentType = savedType || '원리금';
    if (typeInput && typeInput.value !== currentType) typeInput.value = currentType;
  }
  const typeLabel = currentType === '만기' ? '만기' : currentType;
  repayTd.innerHTML = `
    <div class="type-btn-row">
      <button type="button" class="type-btn-trigger" aria-expanded="false" onclick="toggleRepaymentTypeMenu(this)">${typeLabel}</button>
      <div class="type-btn-group">
        <button type="button" class="type-btn${currentType === '원리금' ? ' active' : ''}" onclick="setMortgageRepaymentType(this, '원리금')">원리금</button>
        <button type="button" class="type-btn${currentType === '원금' ? ' active' : ''}" onclick="setMortgageRepaymentType(this, '원금')">원금</button>
        <button type="button" class="type-btn${currentType === '만기' ? ' active' : ''}" onclick="setMortgageRepaymentType(this, '만기')">만기</button>
      </div>
    </div>
    <div class="grace-cell">
      <input type="checkbox" class="mort-grace-check" title="거치 적용">
      <input type="text" inputmode="numeric" placeholder="거치(개월)" class="mort-grace-term grace-term-input">
    </div>`;

  row.appendChild(termTd);
  row.appendChild(repayTd);

  // 숨겨둔 상태값을 상환방식 TD 안으로 되돌린다.
  if (typeInput) repayTd.appendChild(typeInput);
  if (categoryInput) repayTd.appendChild(categoryInput);

  // 입력값 복원(구조를 새로 만들었으므로 값/이벤트를 다시 연결)
  const newAmt = amountCell.querySelector('.mort-amt');
  const newRate = amountCell.querySelector('.mort-rate');
  const newStRate = amountCell.querySelector('.mort-st-rate');
  if (newAmt && amt) newAmt.value = amt.value;
  if (newRate && rate) newRate.value = rate.value;
  if (newStRate && stRate) newStRate.value = stRate.value;
  if (term && termTd.firstChild) term.value = term.value;

  bindMortgageRowEvents(row);
  applyAnnualRepaymentMode(row);
  if (typeof 자동계산 === 'function') 자동계산();
}

// 보유대출 구분 드롭다운: 선택값은 기존 대출구분 저장/계산 로직에서 그대로 사용한다.
function updateLoanCategory(select) {
  const row = select.closest('tr');
  if (!row) return;

  if (select.value === '행삭제') {
    if (row.classList.contains('first-row')) {
      showBubble("본건 대출은 삭제할 수 없습니다");
      const categoryInput = row.querySelector('.mort-loan-category');
      select.value = categoryInput ? categoryInput.value : '주담대';
      return;
    }
    const memoRow = row.nextElementSibling;
    if (memoRow && memoRow.classList.contains('mortgage-memo-row')) memoRow.remove();
    row.remove();
    mortCount = document.querySelectorAll('#mortgage-inputs .mortgage-row').length;
    showBubble("해당 대출 정보 삭제 완료");
    updateMortgagePlaceholders();
    if (typeof 자동계산 === 'function') 자동계산();
    updateMortgageReductionButtons();
    if (typeof updateLoanInfoSummary === 'function') updateLoanInfoSummary();
    if (typeof saveDSRInputs === 'function') saveDSRInputs();
    return;
  }

  const categoryInput = row.querySelector('.mort-loan-category');
  const prevCategory = categoryInput ? categoryInput.value : '';
  // 구분을 바꾸기 전에, 지금 화면의 입력값을 이전 구분 저장소에 남긴다.
  if (prevCategory && prevCategory !== select.value) {
    saveCategoryInputs(row, prevCategory);
  }
  if (categoryInput) categoryInput.value = select.value;
  // 구분별 색상 팔레트용 속성 동기화
  select.dataset.cat = select.value;
  applyAnnualRepaymentMode(row);
  // applyJeonseRowLayout → sync 가 "구분 전환"임을 알 수 있게 표시한다.
  __inCategoryChange += 1;
  try {
    applyJeonseRowLayout(row);
  } finally {
    __inCategoryChange -= 1;
  }
  // 새 구분에 저장해 둔 입력값이 있으면 되살린다.
  // [2026-11-11 변경] 전세대·이자만은 상환방식이 "만기"로 고정이므로,
  //  저장값 복원이 그 값을 덮어쓰지 않도록 복원 후 다시 만기로 맞춘다.
  restoreCategoryInputs(row, select.value);
  if (select.value === '전세대' || select.value === '이자만') {
    const jeonseType = row.querySelector('.mort-type');
    if (jeonseType && jeonseType.value !== '만기') jeonseType.value = '만기';
    row.querySelectorAll('.type-btn').forEach(btn => {
      btn.classList.toggle('active', (btn.getAttribute('onclick') || '').includes("'만기'"));
    });
    const jeonseChip = row.querySelector('.type-btn-trigger');
    if (jeonseChip) jeonseChip.textContent = '만기';
  }
  const reductionButton = row.nextElementSibling?.querySelector('.mort-reduction-btn');
  if (reductionButton) {
    // 버튼 노출 여부는 updateMortgageReductionButtons()가 '신용대' 기준으로 일괄 처리한다.
    reductionButton.setAttribute('aria-label', 'DSR 39.9% 기준 추가가능 금액');
  }
  if (typeof 자동계산 === 'function') 자동계산();
  updateMortgageReductionButtons();
  if (typeof updateLoanInfoSummary === 'function') updateLoanInfoSummary();
  if (typeof saveDSRInputs === 'function') saveDSRInputs();
}

let bubbleHideTimer = null;
function showBubble(text = "신DTI 적용") {
  const b = document.getElementById("bubble-box");
  if (!b) return;
  b.innerText = text;
  b.style.display = "block";
  // 이전 메시지가 아직 떠 있는 상태에서 새로 호출되면, 남아있던 타이머가 새 메시지를
  // 조기에 꺼버리지 않도록 취소하고 지금 이 호출 기준으로 1초를 다시 센다.
  if (bubbleHideTimer) clearTimeout(bubbleHideTimer);
  bubbleHideTimer = setTimeout(() => {
    b.style.display = "none";
    bubbleHideTimer = null;
  }, 1000);
}

function setFirstRowRepaymentType(type) {
  const firstRow = document.querySelector('#mortgage-inputs .mortgage-row');
  if (!firstRow) return;
  const button = Array.from(firstRow.querySelectorAll('.type-btn')).find(b => b.innerText.trim() === type);
  if (button) setMortgageRepaymentType(button, type);
}

function handleDsrMaxBlockClick(block) {
  const mainValEl = block.querySelector('.dsr-main-val');
  const text = mainValEl ? mainValEl.innerText.trim() : block.innerText.trim();
  let totalAmount = parseKoreanAmountText(text);

  if (totalAmount > 0) {
    totalAmount = Math.floor(totalAmount / 1000000) * 1000000;
  }

  const type = block.dataset.type;

  if (type) {
    setFirstRowRepaymentType(type);
  }

  if (totalAmount > 0) {
    const firstRow = document.querySelector('#mortgage-inputs .mortgage-row');
    const amtInput = firstRow ? firstRow.querySelector('.mort-amt') : null;
    if (amtInput) {
      amtInput.value = totalAmount.toLocaleString();
      amtInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    showBubble(`${type || '최대값'} 방식 선택 및 본건 입력`);
    if (typeof 자동계산 === 'function') 자동계산();
    if (typeof saveDSRInputs === 'function') saveDSRInputs();
  }
}

function adjustDsrMaxFontSize() {
  const ghost = getMeasureGhost('dsr-max-font-ghost');

  document.querySelectorAll('.dsr-max-value-number').forEach(el => {
    const mainEl = el.querySelector('.dsr-main-val');
    if (!mainEl) return;

    const maxWidth = Math.max(el.clientWidth - 10, 0);
    if (maxWidth <= 0) return;

    const style = window.getComputedStyle(mainEl);
    ghost.style.fontFamily = style.fontFamily;
    ghost.style.fontWeight = style.fontWeight;
    ghost.style.fontStyle = style.fontStyle;
    ghost.style.letterSpacing = style.letterSpacing;

    const fontSize = shrinkFontSizeToFit(ghost, mainEl.innerText.trim() || '-', maxWidth, 28, 8);
    mainEl.style.fontSize = fontSize + 'px';
  });
}

function refreshDsrMaxFontSizeStably() {
  const steps = [0, 20, 80, 180];
  steps.forEach((delay) => {
    setTimeout(() => {
      if (typeof adjustDsrMaxFontSize === 'function') adjustDsrMaxFontSize();
    }, delay);
  });
}

function adjustDsrToggleFontSize() {
  const ghost = getMeasureGhost('dsr-toggle-font-ghost');

  document.querySelectorAll('#dsrLimitToggleGroup label').forEach(label => {
    const maxWidth = label.clientWidth - 8;
    if (maxWidth <= 0) return;

    const style = window.getComputedStyle(label);
    ghost.style.fontFamily = style.fontFamily;
    ghost.style.fontWeight = style.fontWeight;

    const fontSize = shrinkFontSizeToFit(ghost, label.innerText.trim(), maxWidth, 13, 7);
    label.style.fontSize = fontSize + 'px';
  });
}

function getDefaultProfileValues(profile, savedData) {
  if (!savedData) return { rate: '', stRate: '', term: '' };
  if (profile === '5Y' || profile === '2Y') {
    return {
      rate: savedData.fiveYearRate || savedData.rate || '',
      stRate: savedData.fiveYearStRate || savedData.stRate || '',
      term: savedData.fiveYearTerm || savedData.term || ''
    };
  }
  return {
    rate: savedData.sixMonthRate || savedData.rate || '',
    stRate: savedData.sixMonthStRate || savedData.stRate || '',
    term: savedData.sixMonthTerm || savedData.term || ''
  };
}

/* 사용자가 본건 행에 직접 입력한 금리·ST금리·기간을 6M/5Y(2Y) 프로필별로 따로 기억한다.
   → 6M에서 5.55를 넣고 5Y로 바꿔 4.75를 넣은 뒤 다시 6M으로 돌아오면 5.55가 그대로 나온다.
   저장 위치: CONSULT_DSR_firstRowProfileValues = { "6M": {...}, "5Y": {...}, "2Y": {...} }

   [2026-11-11 변경] ST금리·금리 저장소를 구분별로 분리한다.
   · 주담대 6M  → DSR_firstRowStRate_주담대_6M  / DSR_firstRowRate_주담대_6M
   · 주담대 2Y  → DSR_firstRowStRate_주담대_2Y  / DSR_firstRowRate_주담대_2Y
   · 전세대     → DSR_firstRowStRate_전세대      / DSR_firstRowRate_전세대
   기간은 기존 프로필 저장소를 그대로 쓴다. */
const FIRST_ROW_PROFILE_VALUES_KEY = 'DSR_firstRowProfileValues';
const FIRST_ROW_ST_RATE_KEY_PREFIX = 'DSR_firstRowStRate_';
const FIRST_ROW_RATE_KEY_PREFIX = 'DSR_firstRowRate_';

function getFirstRowProfileValues() {
  const data = getStoredJson(FIRST_ROW_PROFILE_VALUES_KEY);
  return (data && typeof data === 'object') ? data : {};
}

/* 본건 행의 금리·ST금리 저장 키를 구분·프로필로 만든다.
   · 전세대·원리금 → 프로필(6M/2Y)과 무관하게 구분별 하나의 키
   · 그 외(주담대 등) → 주담대_6M / 주담대_2Y 로 프로필별 분리
   [2026-11-11 추가] 원리금도 주담대와 섮이지 않게 전용 키를 쓴다. */
function firstRowRateStorageSuffix(row) {
  const category = row?.querySelector('.mort-loan-category')?.value || '주담대';
  if (category === '전세대') return '전세대';
  if (category === '원리금') return '원리금';
  const profile = row?.querySelector('.mort-default-profile')?.value
    || row?.querySelector('.mort-default-switch')?.dataset.profile
    || '6M';
  // 주담대는 6M / 2Y(5Y) 두 가지로만 나눈다.
  const normalized = (profile === '5Y' || profile === '2Y') ? '2Y' : '6M';
  return `주담대_${normalized}`;
}

function firstRowStRateKey(row) {
  return `${FIRST_ROW_ST_RATE_KEY_PREFIX}${firstRowRateStorageSuffix(row)}`;
}

function getFirstRowStRate(row) {
  const saved = consultLocalStorage.getItem(firstRowStRateKey(row));
  return saved === null ? null : saved;
}

/* 금리 저장 키: ST금리와 같은 구분·프로필 규칙을 쓰고 접두사만 다르다. */
function firstRowRateKey(row) {
  return `${FIRST_ROW_RATE_KEY_PREFIX}${firstRowRateStorageSuffix(row)}`;
}

function getFirstRowRate(row) {
  const saved = consultLocalStorage.getItem(firstRowRateKey(row));
  return saved === null ? null : saved;
}

function setFirstRowRate(row, value) {
  // sync로 화면 값을 맞추는 중이거나 복원 중에는 쓰지 않는다(다른 구분 값을 덮어쓰는 것 방지).
  if (__syncingFirstRowRate || isDsrRestoring()) return;
  consultLocalStorage.setItem(firstRowRateKey(row), value == null ? '' : String(value));
}

/* ── 원리금 전용 개월수 저장소 (2026-11-11 추가) ──
   원리금 구분의 금리·ST금리는 firstRowRateKey/firstRowStRateKey 가
   '원리금' 접미사로 이미 분리해 둔다. 개월수도 같은 방식으로 분리한다. */
const FIRST_ROW_TERM_KEY_PREFIX = 'DSR_firstRowTerm_';

function firstRowTermKey(row) {
  return `${FIRST_ROW_TERM_KEY_PREFIX}${firstRowRateStorageSuffix(row)}`;
}

function getFirstRowTerm(row) {
  const saved = consultLocalStorage.getItem(firstRowTermKey(row));
  return saved === null ? null : saved;
}

function setFirstRowTerm(row, value) {
  consultLocalStorage.setItem(firstRowTermKey(row), value == null ? '' : String(value));
}

/* 본건 행의 개월수를 현재 구분·프로필 전용 저장소 값으로 맞춘다.
   저장된 값이 없으면 전세대는 빈값(개월수 숨김 상태)으로 둔다. */
function syncFirstRowTerm(row) {
  if (!row || !row.classList.contains('first-row')) return;
  if (isDsrRestoring()) return;
  const termInput = row.querySelector('.mort-term');
  if (!termInput) return;
  const category = row.querySelector('.mort-loan-category')?.value || '';
  const saved = getFirstRowTerm(row);
  let next;
  if (saved !== null) {
    next = String(saved);
  } else if (category === '원리금' || category === '전세대' || category === '이자만') {
    next = '';
  } else {
    return; // 담보는 기존 기본값 로직을 그대로 둔다.
  }
  if (termInput.value === next) return;
  termInput.value = next;
  termInput.dispatchEvent(new Event('input', { bubbles: true }));
}

/* 본건 행의 금리를 현재 구분·프로필 전용 저장소 값으로 맞춘다.
   저장된 값이 없으면 전세대는 빈값으로 비우고, 담보는 건드리지 않는다.
   (전세대 진입 시 이전 구분의 금리가 남아 전세대 저장소를 덮어쓰는 것을 막음) */
function syncFirstRowRate(row) {
  if (!row || !row.classList.contains('first-row')) return;
  if (isDsrRestoring()) return;
  const rateInput = row.querySelector('.mort-rate');
  if (!rateInput) return;
  const category = row.querySelector('.mort-loan-category')?.value || '';
  const saved = getFirstRowRate(row);
  let next;
  if (saved !== null && String(saved).trim() !== '') {
    next = String(saved);
  } else if (category === '전세대' || category === '원리금') {
    // [2026-11-11 변경] 원리금도 전용 저장소만 쓴다.
    //  저장값이 없으면 빈값으로 비운다(이전 구분/기본값 금리가 그대로 남지 않게).
    next = '';
  } else {
    // [2026-11-11 변경] 담보(주담대)도 다른 구분과 같은 규칙으로 맞춘다.
    //  전용 키에 값이 없으면 빈값이다. (이전 구분의 값이 그대로 남지 않게)
    //  기본값 설정 금리는 사용자가 [6M/5Y 전환] 버튼을 누를 때 applyDefaultProfileToRow 가 적용한다.
    //  복원(새로고침/불러오기) 직후에는 저장값을 덮지 않도록 손대지 않는다.
    //  단, 사용자가 드롭다운으로 구분을 바꿨을 때(__categorySwitchSync)는 저장소 기준으로 맞춘다.
    if (isDsrRestoredFromStorage() && !__categorySwitchSync) return;
    next = '';
  }
  if (rateInput.value === next) return;
  rateInput.value = next;
  rateInput.dispatchEvent(new Event('input', { bubbles: true }));
}

/* 본건 행의 ST금리를 현재 구분·프로필 전용 저장소 값으로 맞춘다.
   저장된 값이 없으면 전세대는 빈값, 담보는 그대로 둔다.
   (구분/프로필을 바꿀 때마다 호출되어 서로 섞이지 않게 한다) */
function syncFirstRowStRate(row) {
  if (!row || !row.classList.contains('first-row')) return;
  if (isDsrRestoring()) return;
  const stRateInput = row.querySelector('.mort-st-rate');
  if (!stRateInput) return;
  const category = row.querySelector('.mort-loan-category')?.value || '';
  const saved = getFirstRowStRate(row);
  let next;
  if (saved !== null && String(saved).trim() !== '') {
    next = String(saved);
  } else if (category === '전세대' || category === '원리금') {
    // [2026-11-11 변경] 원리금 ST금리도 전용 저장소만 쓴다.
    next = '';
  } else {
    return; // 담보는 기존 기본값 로직을 그대로 둔다.
  }
  if (stRateInput.value === next) return;
  stRateInput.value = next;
  stRateInput.dispatchEvent(new Event('input', { bubbles: true }));
}

/* 구분·프로필이 바뀔 때 금리·ST금리를 각자의 전용 저장소 값으로 맞춘다.
   sync 중 발생하는 input 이벤트가 saveFirstRowProfileValues를 다시 호출해
   이전 구분의 값으로 새 구분 저장소를 덮어쓰는 것을 막기 위해 플래그로 잠근다.
   [2026-11-11 변경] 예전에는 이 플래그가 켜져 있으면 sync 자체를 건너뛰었다.
   그런데 applyJeonseRowLayout → saveFirstRowStRate 인라인 저장 도중 다시 sync가 불리면
   (원리금 → 주담대 전환) 그 호출이 통째로 무시되어 주담대 금리칸에 원리금 값이 남았다.
   그래서 "sync를 건너뛰는" 대신 "sync 중에는 전용 저장소에 쓰지 않는" 방식으로 바꿔다. */
let __syncingFirstRowRate = false;
function isSyncingFirstRowRate() { return __syncingFirstRowRate; }
// 적용 중인 구분을 기억한다. (sync 도중 인라인 저장이 다른 구분 키를 덮어쓰지 않게 함)
let __activeCategory = '';
// 구분(드롭다운)을 바꿔 sync를 돌릴 때만 true. 복원 직후 잠금(__dsrRestoredFromStorage)을 무시하고
// 전용 저장소 값을 화면에 확실히 입히기 위해서다.
let __categorySwitchSync = false;
// 드롭다운(updateLoanCategory) 처리 중임을 나타내는 카운터 (구분 전환 sync 판별용)
let __inCategoryChange = 0;
function syncFirstRowRateAndStRate(row, force) {
  const prevSyncing = __syncingFirstRowRate;
  const prevCategory = __activeCategory;
  const prevForce = __categorySwitchSync;
  if (force) __categorySwitchSync = true;
  __syncingFirstRowRate = true;
  __activeCategory = row?.querySelector('.mort-loan-category')?.value || '';
  try {
    syncFirstRowStRate(row);
    syncFirstRowRate(row);
    syncFirstRowTerm(row);
  } finally {
    __syncingFirstRowRate = prevSyncing;
    __activeCategory = prevCategory;
    __categorySwitchSync = prevForce;
  }
}

function setFirstRowStRate(row, value) {
  if (__syncingFirstRowRate || isDsrRestoring()) return;
  consultLocalStorage.setItem(firstRowStRateKey(row), value == null ? '' : String(value));
}

function saveFirstRowProfileValues(row, profile) {
  if (!row || !profile) return;
  // 구분/프로필 전환에 따른 동기화 중에는 저장하지 않는다(이전 값이 새 구분을 덮어쓰는 것 방지).
  if (__syncingFirstRowRate) return;
  const rateInput = row.querySelector('.mort-rate');
  const stRateInput = row.querySelector('.mort-st-rate');
  const termInput = row.querySelector('.mort-term');
  // [2026-11-11 변경] 원리금 구분은 전용 저장소(DSR_firstRowRate_원리금 등)만 쓴다.
  //  공용 프로필 저장소(FIRST_ROW_PROFILE_VALUES_KEY)에도 함께 쓰면,
  //  초기화로 주담대로 돌아왔을 때 원리금에서 입력한 금리가 다시 읽혀 표시된다.
  const isWongumRow = (row.querySelector('.mort-loan-category')?.value || '') === '원리금';
  if (!isWongumRow) {
    const all = getFirstRowProfileValues();
    all[profile] = {
      rate: rateInput ? rateInput.value : '',
      stRate: stRateInput ? stRateInput.value : '',
      term: termInput ? termInput.value : ''
    };
    setStoredJson(FIRST_ROW_PROFILE_VALUES_KEY, all);
  }
  // 금리·ST금리·개월수는 구분별 전용 키에도 함께 저장한다(원리금 포함).
  // [2026-11-11 변경] sync로 화면에 값을 입히는 중에는 저장하지 않는다.
  //  (그 시점의 화면 값은 "이전 구분의 값"일 수 있어 다른 구분의 저장소를 덮어쓴다)
  if (__syncingFirstRowRate) return;
  // [2026-11-11 변경] 구분이 확정되기 전(행 생성 직후 등)에는 저장하지 않는다.
  //  이때 화면 값은 이전 구분의 값일 수 있어 엉뚱한 구분 키로 저장된다.
  const rowCategory = row.querySelector('.mort-loan-category')?.value || '';
  if (__activeCategory && rowCategory && __activeCategory !== rowCategory) return;
  if (stRateInput) setFirstRowStRate(row, stRateInput.value);
  if (rateInput) setFirstRowRate(row, rateInput.value);
  if (termInput) setFirstRowTerm(row, termInput.value);
}

function applyDefaultProfileToRow(row, profile) {
  const savedData = getStoredJson("DEFAULT_FIRST_ROW_DATA");
  const values = getDefaultProfileValues(profile, savedData);

  const rateInput = row.querySelector('.mort-rate');
  const stRateInput = row.querySelector('.mort-st-rate');
  const termInput = row.querySelector('.mort-term');
  const profileInput = row.querySelector('.mort-default-profile');

  // 이 프로필에서 사용자가 직접 입력해 둔 값이 있으면 그것을 우선 적용한다.
  // (없을 때만 기본값 설정 팝업의 값으로 채운다)
  const userValues = getFirstRowProfileValues()[profile] || null;
  const pick = (userValue, defaultValue) => {
    if (userValue !== undefined && userValue !== null && String(userValue).trim() !== '') return userValue;
    return defaultValue;
  };

  if (rateInput) {
    const v = pick(userValues?.rate, values.rate);
    if (v !== '') rateInput.value = v;
  }
  if (stRateInput) {
    const v = pick(userValues?.stRate, values.stRate);
    if (v !== '') stRateInput.value = v;
  }
  if (termInput) {
    const v = pick(userValues?.term, values.term);
    if (v !== '') termInput.value = v;
  }
  if (profileInput) profileInput.value = profile;

  const profileSelect = row.querySelector('.mort-default-switch');
  if (profileSelect) {
    const isJeonseProfile = consultLocalStorage.getItem('DSR_propertyLoanType') === '전세';
    const secondProfile = isJeonseProfile ? '2Y' : '5Y';
    profileSelect.dataset.profile = profile === '5Y' && isJeonseProfile ? '2Y' : profile;
    profileSelect.classList.toggle('active', profileSelect.dataset.profile === secondProfile);
    profileSelect.querySelectorAll('.switch-label').forEach(label => {
      const labelValue = label.textContent.trim();
      const isActive = (profile === '5Y' || profile === '2Y') ? labelValue === (profile === '2Y' ? '2Y' : '5Y') : labelValue === '6M';
      label.classList.toggle('active', isActive);
    });
  }

  if (rateInput || stRateInput || termInput) {
    if (typeof 자동계산 === 'function') 자동계산();
  }
}

/* 길게 누르기(long-press) 공통 유틸: mousedown/touchstart 시 타이머 시작,
   mouseup/mouseleave/touchend 시 취소. 기존에는 "본건 기본값 모달 열기"(3초)와
   "보유대출 행 삭제"(2초) 두 곳에 동일한 타이머 바인딩 코드가 반복되어 있었음. */
function bindLongPress(el, duration, onLongPress) {
  let timer;
  const start = () => { timer = setTimeout(onLongPress, duration); };
  const end = () => clearTimeout(timer);
  el.addEventListener("mousedown", start);
  el.addEventListener("mouseup", end);
  el.addEventListener("mouseleave", end);
  el.addEventListener("touchstart", start, { passive: true });
  el.addEventListener("touchend", end, { passive: true });
}

function bindMortgageRowEvents(row) {
  row.querySelectorAll('.mort-amt, .mort-term').forEach(el => {
    el.addEventListener("input", (e) => {
      let v = e.target.value.replace(/\D/g, '');
      e.target.value = v ? parseInt(v).toLocaleString() : '';
      // 본건 행의 기간도 프로필별로 기억한다(금액은 프로필과 무관).
      if (row.classList.contains('first-row') && e.target.classList.contains('mort-term') && !isDsrRestoring()) {
        const profile = row.querySelector('.mort-default-profile')?.value
          || row.querySelector('.mort-default-switch')?.dataset.profile || '6M';
        saveFirstRowProfileValues(row, profile);
      }
      if (typeof 자동계산 === 'function') 자동계산();
      updateMortgageReductionButtons();
    });
  });

  row.querySelectorAll('.mort-rate, .mort-st-rate').forEach(el => {
    el.addEventListener("input", (e) => {
      e.target.value = e.target.value.replace(/[^0-9.]/g, '');
      // 본건 행이면, 지금 선택된 프로필(6M/5Y)의 값으로 기억해 둔다.
      if (row.classList.contains('first-row') && !isDsrRestoring()) {
        const profile = row.querySelector('.mort-default-profile')?.value
          || row.querySelector('.mort-default-switch')?.dataset.profile || '6M';
        saveFirstRowProfileValues(row, profile);
      }
      if (typeof 자동계산 === 'function') 자동계산();
      updateMortgageReductionButtons();
    });
  });

  row.querySelectorAll('.mort-grace-term').forEach(el => {
    el.addEventListener("input", (e) => {
      e.target.value = e.target.value.replace(/\D/g, '');
      if (typeof 자동계산 === 'function') 자동계산();
    });
  });

  // 연간원리금 직접입력: 숫자만 + 콤마 포맷, 입력 즉시 재계산
  row.querySelectorAll('.mort-annual').forEach(el => {
    el.addEventListener("input", (e) => {
      const v = e.target.value.replace(/\D/g, '');
      e.target.value = v ? parseInt(v, 10).toLocaleString() : '';
      if (typeof 자동계산 === 'function') 자동계산();
      updateMortgageReductionButtons();
    });
  });

  const categorySelect = row.querySelector('.mort-category-select');
  const catInput = row.querySelector('.mort-loan-category');
  if (categorySelect && catInput) {
    // 저장값/기존값이 드롭다운 목록에 있는 값이면 그대로 유지한다(새로고침 후 선택 유지).
    // 목록에 없는 예전 값만 대표값으로 보정한다.
    const legacyMap = { '신용': '신용대', '전세': '전세대' };
    if (legacyMap[catInput.value]) catInput.value = legacyMap[catInput.value];
    if (!VALID_LOAN_CATEGORIES.includes(catInput.value)) catInput.value = '주담대';
    // 본건 행은 주담대·전세대·원리금 3개만 있으므로, 그 외 값은 주담대로 보정한다.
    if (row.classList.contains('first-row') && !FIRST_ROW_LOAN_CATEGORIES.includes(catInput.value)) {
      catInput.value = '주담대';
    }
    categorySelect.value = catInput.value;
    // 구분별 색상 팔레트용 속성 동기화
    categorySelect.dataset.cat = catInput.value;
    applyAnnualRepaymentMode(row);
    applyJeonseRowLayout(row);
  }

  const profileSelect = row.querySelector('.mort-default-switch');
  if (profileSelect) {
    profileSelect.addEventListener('click', () => {
      const isJeonse = consultLocalStorage.getItem('DSR_propertyLoanType') === '전세';
      const secondProfile = isJeonse ? '2Y' : '5Y';
      const currentProfile = profileSelect.dataset.profile === '5Y' && isJeonse ? '2Y' : (profileSelect.dataset.profile || '6M');
      const nextProfile = currentProfile === '6M' ? secondProfile : '6M';
      // 전환하기 전에, 지금 화면에 있는 값(사용자가 직접 입력했을 수 있음)을 현재 프로필에 저장한다.
      // → 6M/5Y 각각의 금리·ST금리·기간이 따로 기억된다.
      saveFirstRowProfileValues(row, currentProfile);
      // 마지막으로 선택한 프로필도 기억한다(새로고침 후에도 그 프로필로 복원).
      consultLocalStorage.setItem('DSR_firstRowProfile', nextProfile);
      profileSelect.dataset.profile = nextProfile;
      profileSelect.querySelectorAll('.switch-label').forEach((label, index) => {
        label.textContent = index === 0 ? '6M' : secondProfile;
        label.classList.toggle('active', index === 0 ? nextProfile === '6M' : nextProfile === secondProfile);
      });
      profileSelect.classList.toggle('active', nextProfile === secondProfile);
      // 사용자가 직접 전환을 눌렀으니 기본값 적용을 허용한다(복원 직후 잠금 해제).
      __dsrRestoredFromStorage = false;
      applyDefaultProfileToRow(row, nextProfile);
      if (typeof saveDSRInputs === 'function') saveDSRInputs();
    });
  }

  // 금리/ST금리/기간 입력칸을 선택하거나 길게 누를 때 뜨던 팝업 제거 (하단 기본값 설정 버튼 사용)

  row.querySelectorAll(CHECKBOX_INPUT_SELECTOR).forEach(el => {
    el.addEventListener("change", (e) => {
      if (e.target.classList.contains('mort-grace-check')) showBubble(e.target.checked ? "거치 적용" : "거치 해제");
      if (typeof 자동계산 === 'function') 자동계산();
    });
  });
}

function updateMortgagePlaceholders() {
  const rows = document.querySelectorAll('#mortgage-inputs .mortgage-row');
  rows.forEach((row, index) => {
    const amtInput = row.querySelector('.mort-amt');
    if (amtInput) {
      if (index === 0) {
        amtInput.placeholder = "본건 대출금액입력";
      } else {
        amtInput.placeholder = `보유대출금액 ${index}`;
      }
    }
  });
}



let mortCount = 0;

// KB 시세 조회 오버레이에서 선택한 아파트명/타입/평형 정보 - "내용복사" 텍스트에 같이 포함시킨다.
let selectedAptInfo = null; // { aptName, typeLabel, pyeong, priceField }
function setSelectedAptInfo(info) {
  selectedAptInfo = info;
  renderSelectedAptRow();
  if (typeof saveDSRInputs === 'function') saveDSRInputs();
}

// 시세입력 테이블 맨 아래 - 선택된 아파트 정보를 보여주는 행을 갱신한다.
// selectedAptInfo가 없으면(아직 KB시세 조회로 선택한 적 없으면) 행 자체를 숨긴다.
const APT_PRICE_FIELD_LABELS = { '매매하한가': '하한가', '매매일반가': '일반가', '매매상한가': '상한가' };

function renderSelectedAptRow() {
  const row = document.getElementById('selectedAptRow');
  const textEl = document.getElementById('selectedAptInfoText');
  const addressEl = document.getElementById('selectedAptAddressText');
  const badgesEl = document.getElementById('selectedAptRegulationBadges');
  if (!row || !textEl || !addressEl || !badgesEl) return;

  if (!selectedAptInfo || !selectedAptInfo.aptName) {
    row.style.display = 'none';
    badgesEl.innerHTML = '';
    return;
  }

  const typePart = selectedAptInfo.typeLabel ? ` (${selectedAptInfo.typeLabel}타입)` : '';
  const areaPart = selectedAptInfo.exclusiveSqm
    ? `전용 ${selectedAptInfo.exclusiveSqm}㎡, 공급 ${selectedAptInfo.supplyPyeong}평`
    : `전용 ${selectedAptInfo.pyeong}평`; // 예전에 저장된 값(공급/㎡ 정보 없음)과의 호환용
  const priceTierText = APT_PRICE_FIELD_LABELS[selectedAptInfo.priceField] || '';

  textEl.textContent = `${selectedAptInfo.aptName}${typePart}, ${areaPart}${priceTierText ? '     ' + priceTierText : ''}`;
  const dongHoPart = (selectedAptInfo.dong && selectedAptInfo.ho) ? `, ${selectedAptInfo.dong}동 ${selectedAptInfo.ho}호` : '';
  addressEl.textContent = (selectedAptInfo.address || '') + dongHoPart;

  const badges = [];
  if (selectedAptInfo.투기과열지구) badges.push('<span class="apt-reg-badge apt-reg-badge-danger">투기과열</span>');
  if (selectedAptInfo.조정대상지역) badges.push('<span class="apt-reg-badge apt-reg-badge-warning">조정지역</span>');
  badgesEl.innerHTML = badges.join('');

  row.style.display = '';
}

// 대출 행(.mortgage-row) 바로 아래 짝지어진 메모 행에서 입력값을 읽어온다.
function getMortgageRowMemo(row) {
  const memoRow = row?.nextElementSibling;
  if (!memoRow || !memoRow.classList.contains('mortgage-memo-row')) return '';
  return memoRow.querySelector('.mort-memo')?.value.trim() || '';
}

/* 소득/대출 메모칸(textarea)은 입력 중인 줄 수에 맞춰 높이가 늘어나야 하므로,
   값이 바뀔 때마다(사용자 입력 또는 저장된 값 복원) 높이를 다시 계산한다. */
function autoResizeMemoTextarea(el) {
  if (!el) return;
  el.style.height = 'auto';
  // scrollHeight는 소수점이 버려져 1~2px 모자라면 마지막 줄이 잘린다.
  // (화면캡쳐에서 메모 마지막 줄이 잘리던 원인) → 올림해서 여유를 준다.
  el.style.height = `${Math.ceil(el.scrollHeight) + 2}px`;
}
document.addEventListener('input', (e) => {
  if (e.target.matches?.('.mort-memo, .income-memo')) {
    autoResizeMemoTextarea(e.target);
  }
});

/* 본건 대출정보 행의 "필요일자" 입력칸 - 클릭하면 달력 팝업을 띄운다.
   .mort-need-date는 주담대행추가()가 호출될 때 동적으로 생성되므로, 개별 바인딩 대신
   document 레벨 이벤트 위임(상담일지.html의 날짜 선택 UI와 동일한 로직)으로 처리한다. */
function setupNeedDatePicker() {
  const popup = document.getElementById('datePickerPopup');
  if (!popup) return;
  const monthLabel = popup.querySelector('.date-picker-month');
  const grid = popup.querySelector('.date-picker-grid');
  const navPrev = popup.querySelector('.nav-prev');
  const navNext = popup.querySelector('.nav-next');
  let currentPickerYear = new Date().getFullYear();
  let currentPickerMonth = new Date().getMonth();
  let activeInput = null;

  function formatToCustomDate(str) {
    if (!str) return '';
    let digits = str.replace(/\D/g, '');
    if (digits.length > 6) digits = digits.slice(0, 6);
    let formatted = digits;
    if (digits.length >= 6) {
      formatted = digits.replace(/(\d{2})(\d{2})(\d{2})/, '$1/$2/$3');
      const parsed = parseCustomDate(formatted);
      if (parsed) {
        const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
        formatted += ` (${dayNames[parsed.getDay()]})`;
      }
    } else if (digits.length >= 4) {
      formatted = digits.replace(/(\d{2})(\d{2})/, '$1/$2/');
    } else if (digits.length >= 2) {
      formatted = digits.replace(/(\d{2})/, '$1/');
    }
    return formatted;
  }

  function parseCustomDate(str) {
    if (!str) return null;
    const match = str.match(/(\d{2})\D*(\d{2})\D*(\d{2})/);
    if (!match) {
      const clean = str.replace(/\D/g, '');
      if (clean.length === 6) {
        return new Date(2000 + Number(clean.slice(0, 2)), Number(clean.slice(2, 4)) - 1, Number(clean.slice(4, 6)));
      }
      return null;
    }
    const year = 2000 + Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    return new Date(year, month, day);
  }

  function formatDisplayDate(date) {
    const yy = String(date.getFullYear()).slice(-2);
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    return `${yy}/${mm}/${dd} (${dayNames[date.getDay()]})`;
  }

  function renderDatePicker(year, month) {
    currentPickerYear = year;
    currentPickerMonth = month;
    monthLabel.textContent = `${year}년 ${String(month + 1).padStart(2, '0')}월`;
    grid.innerHTML = '';

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const selectedDate = activeInput ? parseCustomDate(activeInput.value) : null;
    const today = new Date();

    for (let i = 0; i < firstDay; i++) {
      const empty = document.createElement('div');
      empty.className = 'calendar-cell empty';
      grid.appendChild(empty);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'calendar-cell';
      button.textContent = day;
      const cellDate = new Date(year, month, day);
      if (selectedDate && cellDate.toDateString() === selectedDate.toDateString()) {
        button.classList.add('selected');
      }
      if (cellDate.toDateString() === today.toDateString()) {
        button.classList.add('today');
      }
      button.addEventListener('click', function (e) {
        e.stopPropagation();
        if (activeInput) {
          activeInput.value = formatDisplayDate(cellDate);
          activeInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        closeDatePicker();
      });
      grid.appendChild(button);
    }
  }

  function openDatePicker(input) {
    activeInput = input;
    const parsed = parseCustomDate(input.value) || new Date();
    renderDatePicker(parsed.getFullYear(), parsed.getMonth());
    popup.classList.add('open');
    popup.setAttribute('aria-hidden', 'false');
    const rect = input.getBoundingClientRect();
    popup.style.top = `${rect.bottom + window.scrollY + 8}px`;
    popup.style.left = `${Math.max(16, rect.left + window.scrollX - 10)}px`;
  }

  function closeDatePicker() {
    popup.classList.remove('open');
    popup.setAttribute('aria-hidden', 'true');
    activeInput = null;
  }

  document.addEventListener('click', function (e) {
    if (e.target.classList && e.target.classList.contains('mort-need-date')) {
      e.stopPropagation();
      openDatePicker(e.target);
      return;
    }
    if (!popup.contains(e.target)) closeDatePicker();
  });

  document.addEventListener('input', function (e) {
    if (e.target.classList && e.target.classList.contains('mort-need-date')) {
      e.target.value = formatToCustomDate(e.target.value);
    }
  });

  navPrev.addEventListener('click', function (e) {
    e.stopPropagation();
    const newDate = new Date(currentPickerYear, currentPickerMonth - 1, 1);
    renderDatePicker(newDate.getFullYear(), newDate.getMonth());
  });
  navNext.addEventListener('click', function (e) {
    e.stopPropagation();
    const newDate = new Date(currentPickerYear, currentPickerMonth + 1, 1);
    renderDatePicker(newDate.getFullYear(), newDate.getMonth());
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeDatePicker();
  });
}

function 주담대행추가() {
  mortCount++;
  const tbody = document.getElementById('mortgage-inputs');
  if (!tbody) return;
  const newRow = document.createElement('tr');
  const isFirstRow = mortCount === 1;
  newRow.className = isFirstRow ? "mortgage-row first-row" : "mortgage-row";
  newRow.style.textAlign = "center";
  const profileSelectMarkup = isFirstRow ? `<button type="button" class="mort-default-switch" data-profile="6M" aria-label="6M/5Y 전환"><span class="switch-label active">6M</span><span class="switch-label">5Y</span></button>` : '';
  const categoryDefault = isFirstRow ? '주담대' : '신용대';
  // [2026-11-11 변경] 본건(첫 행)은 주담대·전세대·원리금 3개만 표시한다.
  //  추가 행(보유대출)은 기존 목록을 그대로 유지한다.
  const loanCategoryOptionsMarkup = isFirstRow
    ? `
      <option value="주담대" ${categoryDefault === '주담대' ? 'selected' : ''}>주담대</option>
      <option value="전세대" ${categoryDefault === '전세대' ? 'selected' : ''}>전세대</option>
      <option value="원리금" ${categoryDefault === '원리금' ? 'selected' : ''}>원리금</option>
    `
    : `
      <option value="주담대" ${categoryDefault === '주담대' ? 'selected' : ''}>주담대</option>
      <option value="전세대" ${categoryDefault === '전세대' ? 'selected' : ''}>전세대</option>
      <option value="신용대" ${categoryDefault === '신용대' ? 'selected' : ''}>신용대</option>
      <option value="이자만" ${categoryDefault === '이자만' ? 'selected' : ''}>이자만</option>
      <option value="원리금" ${categoryDefault === '원리금' ? 'selected' : ''}>원리금</option>
      <option value="연간원리금" ${categoryDefault === '연간원리금' ? 'selected' : ''}>연간원리금</option>
      <option value="행삭제">행삭제</option>
    `;
  const loanCategorySelectMarkup = `
    <select class="mort-category-select" data-cat="${categoryDefault}" aria-label="대출 종류" onchange="updateLoanCategory(this)">${loanCategoryOptionsMarkup}
    </select>
  `;

  // 본건(첫 행) 금액 입력 영역 - 구분 드롭다운을 금액 입력칸 왼쪽에 둔다.
  const firstRowAmountMarkup = `
    <div class="input-flex-col">
      <div class="mort-amount-row">
        ${loanCategorySelectMarkup}
        <input type="text" inputmode="numeric" placeholder="" class="mort-amt">
        <input type="text" inputmode="numeric" placeholder="연간원리금" class="mort-annual" style="display:none;">
      </div>
      <input type="hidden" class="mort-default-profile" value="6M">
      <div class="input-flex-row">
        ${profileSelectMarkup}
        <input type="text" inputmode="decimal" placeholder="금리 %" class="mort-rate">
        <input type="text" inputmode="decimal" placeholder="ST %" class="mort-st-rate">
      </div>
    </div>
  `;

  // 추가되는 행(보유대출) 금액 입력 영역: 금액과 금리를 나란히 배치
  const addedRowAmountMarkup = `
    <div class="mort-amount-row mort-amount-row--added">
      ${loanCategorySelectMarkup}
      <input type="text" inputmode="numeric" placeholder="" class="mort-amt">
      <input type="text" inputmode="decimal" placeholder="금리 %" class="mort-rate">
      <input type="text" inputmode="numeric" placeholder="연간원리금" class="mort-annual" style="display:none;">
    </div>
  `;
  const amountCellWidth = '55%';
  const termCellWidth = '15%';
  const repaymentCellWidth = '30%';
  const firstRowClass = isFirstRow ? ' first-row' : '';

  newRow.innerHTML = `
    <td class="no-bg mort-exclude-amount-cell${firstRowClass}" style="width: ${amountCellWidth}; padding: 4px 4px;">
      <div class="mort-exclude-amount-wrap">
        ${isFirstRow ? firstRowAmountMarkup : addedRowAmountMarkup}
      </div>
    </td>
    <td class="no-bg${firstRowClass}" style="width: ${termCellWidth}; padding: 4px 2px;">
      <input type="text" inputmode="numeric" placeholder="개월" class="mort-term">
    </td>
    <td class="no-bg mortgage-repayment-cell${firstRowClass}" colspan="2" style="width: ${repaymentCellWidth}; padding: 4px 3px;">
      <div class="type-btn-row">
        <button type="button" class="type-btn-trigger" aria-expanded="false" onclick="toggleRepaymentTypeMenu(this)">원리금</button>
        <div class="type-btn-group">
          <button type="button" class="type-btn active" onclick="setMortgageRepaymentType(this, '원리금')">원리금</button>
          <button type="button" class="type-btn" onclick="setMortgageRepaymentType(this, '원금')">원금</button>
          <button type="button" class="type-btn" onclick="setMortgageRepaymentType(this, '만기')">만기</button>
        </div>
      </div>
      <input type="hidden" class="mort-type" value="원리금">
      <input type="hidden" class="mort-loan-category" value="${categoryDefault}">
      <div class="grace-cell">

        <input type="checkbox" class="mort-grace-check" title="거치 적용">
        <input type="text" inputmode="numeric" placeholder="거치(개월)" class="mort-grace-term grace-term-input">
      </div>
    </td>
  `;

  tbody.appendChild(newRow);

  // 대출 행마다 바로 아래에 메모 전용 행을 붙인다 (.mortgage-row가 아니어서 대출 행 개수를
  // 세는 기존 로직에는 안 잡히고, 항상 newRow의 다음 형제로만 짝지어 찾는다).
  const memoRow = document.createElement('tr');
  memoRow.className = 'mortgage-memo-row';
  // 필요일자는 물건지정보 표 하단(잔금일자)으로 이동했다. 마크업은 빈 문자열로 둔다.
  const needDateMarkup = '';
  const reductionButtonMarkup = isFirstRow ? '' : `<button type="button" class="mort-reduction-btn" hidden style="display:none;" aria-label="DSR 39.9% 기준 추가가능 금액"></button>`;
  const memoTextareaMarkup = `<textarea class="mort-memo" placeholder="메모 입력" lang="ko" rows="1" autocomplete="off"></textarea>`;
  // 신용대·원리금은 상환방식 선택기를 메모 행 오른쪽으로 옮긴다(C타입).
  // → 첫 행은 드롭다운·금액·금리·개월만 쓰고, 상환방식은 메모 옆에 둔다.
  const repaymentSlotMarkup = `<div class="mort-repayment-slot"></div>`;
  memoRow.innerHTML = `
    <td colspan="4" class="no-bg">
      <div class="mortgage-memo-row-inner">
        ${reductionButtonMarkup}
        ${needDateMarkup}
        ${memoTextareaMarkup}
        ${repaymentSlotMarkup}
      </div>
    </td>
  `;
  tbody.appendChild(memoRow);

  const reductionBtn = memoRow.querySelector('.mort-reduction-btn');
  if (reductionBtn) {
    reductionBtn.addEventListener('click', () => openDebtReductionRecommendation(reductionBtn));
    // 실제 표시 여부·문구는 updateMortgageReductionButtons()가 결정한다(신용대 행만 노출).
  }

  bindMortgageRowEvents(newRow);
  // 첫 행(본건)은 "기본값"을 넣지 않는다.
  //  - 새로고침/불러오기 복원 중이면 loadMortgageRows()가 저장된 값을 그대로 넣는다.
  //  - 사용자가 직접 입력한 값도 이 경로로 복원되므로, 여기서 기본값을 덮어쓰면 안 된다.
  //  - 기본값은 사용자가 [6M/5Y 전환] 버튼을 누를 때만 적용된다(applyDefaultProfileToRow).
  if (isFirstRow && !isDsrRestoring()) {
    const savedDefault = getStoredJson("DEFAULT_FIRST_ROW_DATA");
    if (savedDefault) applyDefaultProfileToRow(newRow, '6M');
  }
  updateMortgagePlaceholders();
  applyJeonseRowLayout(newRow);
  adjustTableFontSize();
  fitAllNumericInputFontSizes();
  if (typeof 자동계산 === 'function') 자동계산();
  updateMortgageReductionButtons();
}

const DEFAULT_LOAN_RATE_TABLE = [
    { minAge: 20, maxAge: 24, percent: 150.69 },
    { minAge: 25, maxAge: 29, percent: 131.62 },
    { minAge: 30, maxAge: 34, percent: 118.41 },
    { minAge: 35, maxAge: 39, percent: 106.54 },
    { minAge: 40, maxAge: 44, percent: 101.62 }
];
const savedRates = getStoredJson("CUSTOM_LOAN_RATE_TABLE");
const LOAN_RATE_TABLE = Array.isArray(savedRates) ? savedRates : DEFAULT_LOAN_RATE_TABLE;

let memoBaseIncome = 0;
let isEditingIncome = false;

/* 나이 입력창(2자리 나이 또는 4자리 출생연도) 값을 나이(숫자)로 변환.
   본인 소득(updateIncomeCalc, baseIncomeInput 입력 이벤트)과 배우자 소득
   (updateSpouseIncomeCalc) 3곳에 동일한 변환 로직이 반복되어 있었음. */
function parseAgeInputValue(rawStr) {
  if (!rawStr) return -1;
  if (rawStr.length === 2) return parseInt(rawStr);
  if (rawStr.length === 4) return new Date().getFullYear() - parseInt(rawStr);
  return -1;
}

// 장래예상효율 구간의 경계 나이는 생일 전후로 적용 요율이 달라질 수 있으므로 안내한다.
let lastAgeBoundaryWarningKey = '';
function warnAgeBoundaryIfNeeded(age, rawAge, shouldWarn) {
  if (!shouldWarn || !Number.isFinite(age) || age < 0) {
    lastAgeBoundaryWarningKey = '';
    return;
  }
  // 효율표의 구간 경계: 24↔25, 29↔30, 34↔35, 39↔40
  // 사용자 설정표가 일부 저장되어 있어도 안내가 빠지 않도록 명시적으로 검사한다.
  const rateBoundaryAges = new Set([24, 25, 29, 30, 34, 35, 39, 40]);
  const isBoundary = rateBoundaryAges.has(age) || LOAN_RATE_TABLE.some(item => age === item.minAge || age === item.maxAge);
  const warningKey = isBoundary ? `${rawAge}:${age}` : '';
  if (warningKey && warningKey !== lastAgeBoundaryWarningKey) {
    lastAgeBoundaryWarningKey = warningKey;
    showBubble('생일 꼭 확인!');
  } else if (!warningKey) {
    lastAgeBoundaryWarningKey = '';
  }
}

const baseIncomeInput = document.getElementById("baseIncomeInput");
const hiddenIncomeInput = document.getElementById("computedIncomeHidden");
const ageInput = document.getElementById("ageInput");
const applyRateCheck = document.getElementById("applyRateCheck");
const rateDisplay = document.getElementById("rateDisplay");
const baseFutureIncomeConverted = document.getElementById("baseFutureIncomeConverted");

function updateIncomeCalc() {
    if (!ageInput || !applyRateCheck || !rateDisplay || !hiddenIncomeInput || !baseIncomeInput) return;

    if (ageInput.value.length > 4) {
        ageInput.value = ageInput.value.slice(0, 4);
    }

    const rawInputStr = ageInput.value;
    const isDeclareMode = (typeof baseIncomeMode !== 'undefined' && baseIncomeMode === '신고');
    const isChecked = applyRateCheck.checked && !isDeclareMode; // 신고소득 모드에서는 장래예상 미적용
    let currentRate = 1.0;
    let percentStr = "-";
    let calculatedAge = -1;

    if (rawInputStr !== '') {
        calculatedAge = parseAgeInputValue(rawInputStr);

        if (calculatedAge >= 0) {
            warnAgeBoundaryIfNeeded(calculatedAge, rawInputStr, isChecked);
            const matched = LOAN_RATE_TABLE.find(item => calculatedAge >= item.minAge && calculatedAge <= item.maxAge);
            if (matched) {
                currentRate = matched.percent / 100.0;
                percentStr = matched.percent + "%";
            } else {
                percentStr = "범위외";
            }
        }
    }

    rateDisplay.innerText = `(${percentStr})`;

    const applyRateBtn = document.getElementById('applyRateBtn');
    if (applyRateBtn) applyRateBtn.classList.toggle('active', applyRateCheck.checked);

    let finalVal = memoBaseIncome;
    if (isChecked && currentRate !== 1.0) {
        finalVal = memoBaseIncome * currentRate;
    }

    if (baseFutureIncomeConverted) {
        if (isChecked && currentRate !== 1.0 && finalVal > 0) {
            baseFutureIncomeConverted.textContent = `→ ${Math.floor(finalVal).toLocaleString()}원`;
            baseFutureIncomeConverted.style.display = '';
        } else {
            baseFutureIncomeConverted.style.display = 'none';
        }
    }

    hiddenIncomeInput.value = finalVal > 0 ? Math.floor(finalVal).toLocaleString() : "";

    // 연소득 입력칸 자체는 항상 원래 입력값(memoBaseIncome)만 보여준다 - 장래예상 환산값은
    // baseFutureIncomeConverted(나이입력 오른쪽 표시)에서만 보여주면 되고, 입력칸 자체를
    // 환산값으로 덮어써서 강조 색칠하던 방식은 더 이상 쓰지 않는다.
    if (!isEditingIncome) {
        baseIncomeInput.value = memoBaseIncome > 0 ? Math.floor(memoBaseIncome).toLocaleString() : "";
    }

    if (typeof 자동계산 === 'function') 자동계산();
}

if (applyRateCheck) {
  applyRateCheck.addEventListener("change", (e) => {
      showBubble(e.target.checked ? "장래예상 적용" : "장래예상 해제");
      // 체크 시에만 나이/요율 칸이 옆에 나타나도록 표시 여부를 다시 계산
      if (ageInput) ageInput.style.display = e.target.checked ? '' : 'none';
      if (rateDisplay) rateDisplay.style.display = e.target.checked ? '' : 'none';
      updateIncomeCalc();
  });
}

if (ageInput) {
  ageInput.addEventListener("input", updateIncomeCalc);
}

if (baseIncomeInput) {
  baseIncomeInput.addEventListener("focus", () => {
      isEditingIncome = true;
      let v = baseIncomeInput.value.replace(/\D/g, '');
      if (v && memoBaseIncome === 0) {
          memoBaseIncome = parseFloat(v);
      }
      memoBaseIncomeDirect = memoBaseIncome;
      baseIncomeInput.value = memoBaseIncome > 0 ? memoBaseIncome.toLocaleString() : "";
      baseIncomeInput.style.color = "";
      baseIncomeInput.style.backgroundColor = "";
      adjustTableFontSize();
  });

  baseIncomeInput.addEventListener("blur", () => {
      isEditingIncome = false;
      updateIncomeCalc();
  });

  baseIncomeInput.addEventListener("input", (e) => {
      let v = e.target.value.replace(/\D/g, '');
      memoBaseIncome = v ? parseFloat(v) : 0;
      memoBaseIncomeDirect = memoBaseIncome;
      e.target.value = v ? memoBaseIncome.toLocaleString() : '';
      updateIncomeCalc();
  });
}

// 배우자(고정 1인) 로직은 동적 "소득N" 행 제네릭 엔진으로 대체됨 - 아래 "소득행 제네릭 엔진" 섹션 참고.

/* ==========================================================================
   신고소득(카드/건강/연금) 환산 - 차주/배우자 공통
   증빙(기존 방식) / 신고(카드·건강·연금 환산) 토글에 따라 소득을 다르게 산출한다.
   환산 공식: 환산소득 = 입력금액 ÷ (요율/100) × 개월수 × (인정배수/100)
   - 카드: 개월수 1 (연간사용액을 그대로 사용, 월환산 없음)
   - 건강/연금: 개월수 12 (월 보험료를 연간으로 환산)
   ========================================================================== */
const DEFAULT_DECLARE_INCOME_RATES = {
  '카드': { divisor: 40.9, months: 1, multiplier: 90 },
  '건강': { divisor: 3.595, months: 12, multiplier: 95 },
  '연금': { divisor: 9.5, months: 12, multiplier: 95 }
};
const savedDeclareRates = getStoredJson("CUSTOM_DECLARE_INCOME_RATES");
const DECLARE_INCOME_RATES = (savedDeclareRates && typeof savedDeclareRates === 'object')
  ? {
      '카드': Object.assign({}, DEFAULT_DECLARE_INCOME_RATES['카드'], savedDeclareRates['카드']),
      '건강': Object.assign({}, DEFAULT_DECLARE_INCOME_RATES['건강'], savedDeclareRates['건강']),
      '연금': Object.assign({}, DEFAULT_DECLARE_INCOME_RATES['연금'], savedDeclareRates['연금'])
    }
  : JSON.parse(JSON.stringify(DEFAULT_DECLARE_INCOME_RATES));

const DECLARE_INCOME_CAP = 50000000; // 신고소득 환산: 1인당 최대 인정 금액
const COMBINED_DECLARE_INCOME_CAP = 50000000; // 차주/배우자 중 1명 이상 신고소득 사용 시, 합산 소득 최대 인정 금액

function calcDeclareConvertedIncome(type, rawAmount) {
  const cfg = DECLARE_INCOME_RATES[type];
  if (!cfg || !rawAmount || rawAmount <= 0) return 0;
  const raw = (rawAmount / (cfg.divisor / 100)) * cfg.months * (cfg.multiplier / 100);
  return Math.min(raw, DECLARE_INCOME_CAP);
}

let baseIncomeMode = '증빙';
let baseDeclareType = '카드';
let memoBaseDeclareAmounts = { '카드': 0, '건강': 0, '연금': 0 }; // 추정 버튼(카드/건보/연금) 별로 입력값을 따로 저장
let memoBaseIncomeDirect = 0; // 증빙 모드에서 직접 입력한 원본 연소득 (모드 전환 시 복원용)

const baseIncomeModeRadios = document.querySelectorAll('input[name="base_income_mode"]');
const baseDeclareTypeRadios = document.querySelectorAll('input[name="base_declare_type"]');
const baseDeclareAmountInput = document.getElementById("baseDeclareAmountInput");
const baseDeclareConvertedOutput = document.getElementById("baseDeclareConvertedOutput");
const baseDeclareInputGroup = document.getElementById("baseDeclareInputGroup");
const baseEstimateLabel = document.getElementById("baseEstimateLabel");

// 카드는 연사용액을 그대로 입력, 건보/연금은 최근 3개월 평균 월납부액을 입력받는다.
const DECLARE_AMOUNT_PLACEHOLDERS = { '카드': '연사용액 입력', '건강': '3개월 평균 입력', '연금': '3개월 평균 입력' };
const DECLARE_TYPE_LABELS = { '카드': '카드', '건강': '건보', '연금': '연금' }; // 내용복사 텍스트 등에서 화면 표기(건보)와 맞추기 위한 라벨

function refreshBaseDeclareConverted() {
  const amount = memoBaseDeclareAmounts[baseDeclareType] || 0;
  const converted = calcDeclareConvertedIncome(baseDeclareType, amount);
  if (baseDeclareConvertedOutput) {
    baseDeclareConvertedOutput.value = converted > 0 ? Math.floor(converted).toLocaleString() : "";
  }
  return converted;
}

/* 신고소득 모드 전환: 같은 행 안에서 칸의 내용을 그대로 바꿔치기한다.
   연소득 입력칸 -> 카드/건강/연금 토글(+ 바로 아랫줄 연사용액 입력),
   나이 칸 + 장래예상 체크박스 칸 -> 두 칸을 합쳐 환산금액 표시. */
function applyBaseIncomeMode() {
  const isDeclare = baseIncomeMode === '신고';
  if (baseIncomeInput) baseIncomeInput.style.display = isDeclare ? 'none' : '';
  if (baseDeclareInputGroup) baseDeclareInputGroup.style.display = isDeclare ? 'flex' : 'none';
  if (baseDeclareAmountInput) {
    baseDeclareAmountInput.style.display = isDeclare ? '' : 'none';
    baseDeclareAmountInput.placeholder = DECLARE_AMOUNT_PLACEHOLDERS[baseDeclareType] || '금액 입력';
    const amt = memoBaseDeclareAmounts[baseDeclareType] || 0;
    baseDeclareAmountInput.value = amt > 0 ? amt.toLocaleString() : '';
  }
  // 장래예상(체크박스+나이+요율) 한 줄 전체는 추정(신고) 모드에서는 의미가 없으므로 숨기고,
  // 증빙 모드에서는 체크박스만 항상 보이다가 체크했을 때만 나이/요율이 옆에 나타난다.
  const baseFutureIncomeRow = document.getElementById('baseFutureIncomeRow');
  if (baseFutureIncomeRow) baseFutureIncomeRow.style.display = isDeclare ? 'none' : '';
  const showAgeAndRate = !isDeclare && applyRateCheck && applyRateCheck.checked;
  if (ageInput) ageInput.style.display = showAgeAndRate ? '' : 'none';
  if (rateDisplay) rateDisplay.style.display = showAgeAndRate ? '' : 'none';
  if (baseDeclareConvertedOutput) baseDeclareConvertedOutput.style.display = isDeclare ? '' : 'none';
  // "추정" 버튼 라벨: 신고 모드일 땐 현재 선택된 카드/건보/연금을, 증빙으로 돌아가면 "추정"으로 복원
  const baseTitleEl = document.getElementById('baseIncomeTitle');
  if (baseEstimateLabel) {
    baseEstimateLabel.textContent = isDeclare ? (DECLARE_TYPE_LABELS[baseDeclareType] || '추정') : '추정';
    const baseEstimateLabelEl = baseEstimateLabel.closest('label');
    const baseRow = baseEstimateLabel.closest('tr');
    const baseLabelCell = baseRow ? baseRow.querySelector('.income-label') : null;
    if (isDeclare) {
      const activeBubble = document.querySelector(`#baseDeclareTypeBubbleList .declare-type-bubble-item[data-value="${baseDeclareType}"]`);
      const bg = activeBubble ? getComputedStyle(activeBubble).backgroundImage : null;
      if (bg) {
        if (baseEstimateLabelEl) baseEstimateLabelEl.style.setProperty('background', bg, 'important');
        if (baseLabelCell) {
          baseLabelCell.style.setProperty('background', bg, 'important');
          baseLabelCell.style.setProperty('color', '#ffffff', 'important');
        }
      }
      // 선택된 소득 종류(카드/건보/연금) 이름을 "소득1" 자리에 그대로 표시
      if (baseTitleEl) {
        baseTitleEl.textContent = DECLARE_TYPE_LABELS[baseDeclareType] || baseTitleEl.textContent;
        baseTitleEl.dataset.labelOverride = '1';
      }
    } else {
      if (baseEstimateLabelEl) baseEstimateLabelEl.style.removeProperty('background');
      if (baseLabelCell) {
        baseLabelCell.style.removeProperty('background');
        baseLabelCell.style.removeProperty('color');
      }
      // 증빙 모드일 때도 "소득1" 대신 "증빙"으로 표시한다.
      if (baseTitleEl) {
        baseTitleEl.textContent = '증빙';
        baseTitleEl.dataset.labelOverride = '1';
      }
    }
  }
  memoBaseIncome = isDeclare ? refreshBaseDeclareConverted() : memoBaseIncomeDirect;
  updateIncomeCalc();
  applyOtherRowsBlock();
  relabelIncomeRows();
}

baseIncomeModeRadios.forEach(radio => {
  radio.addEventListener("change", () => {
    baseIncomeMode = radio.value;
    refreshRadioToggleStyles('#baseIncomeModeToggle');
    applyBaseIncomeMode();
  });
});

baseDeclareTypeRadios.forEach(radio => {
  radio.addEventListener("change", () => {
    baseDeclareType = radio.value;
    refreshRadioToggleStyles('#baseDeclareTypeToggle');
    // 이미 신고 모드인 상태에서 카드->건보처럼 종류만 바뀌는 경우 모드 라디오는 change가 안 뜨므로,
    // 제목/라벨 갱신을 포함한 applyBaseIncomeMode()를 여기서 직접 호출해줘야 반영된다.
    applyBaseIncomeMode();
  });
});

// "소득N" 제목을 클릭하면 뜨는 증빙/카드/(건보/연금)/삭제/초기화 곡선(")") 버블 팝업 - 소득 모드를
// 고르거나 행을 삭제/초기화하는 유일한 수단(연소득 입력 옆의 증빙/추정 버튼은 숨김 처리됨).
// 소득1(base)은 증빙/카드/건보/연금/초기화, 소득2 이후는 증빙/카드/삭제만 표시하도록 각 행의
// declare-type-bubble-list HTML 자체에 항목을 다르게 구성해둔다.
function setupIncomeTitleBubble(titleEl, bubbleListEl, modeRadios, typeRadios, options = {}) {
  if (!titleEl || !bubbleListEl) return null;
  document.body.appendChild(bubbleListEl);

  const positionBubble = () => {
    const rect = titleEl.getBoundingClientRect();
    const bubbleW = bubbleListEl.offsetWidth;
    const bubbleH = bubbleListEl.offsetHeight;
    const viewportW = document.documentElement.clientWidth || window.innerWidth;
    const viewportH = document.documentElement.clientHeight || window.innerHeight;

    // 기본은 제목 오른쪽에 띄우되, 화면 밖으로 넘치면 왼쪽/위로 밀어 넣는다.
    // (가로 배치 버블이 오른쪽 끝에서 잘리던 문제 방지)
    let left = rect.right + 10;
    if (left + bubbleW > viewportW - 4) left = Math.max(4, viewportW - bubbleW - 4);
    let top = rect.top + rect.height / 2 - bubbleH / 2;
    if (top + bubbleH > viewportH - 4) top = Math.max(4, viewportH - bubbleH - 4);
    if (top < 4) top = 4;

    bubbleListEl.style.left = left + 'px';
    bubbleListEl.style.top = top + 'px';
  };
  const openBubble = () => {
    // 이미 선택되어 있는 값(증빙 or 현재 declareType)은 버블 목록에서 감춘다 - 삭제/초기화 같은
    // 동작 항목은 선택 상태와 무관하므로 항상 표시한다.
    const modeChecked = [...modeRadios].find(r => r.checked);
    const activeValue = (modeChecked && modeChecked.value === '신고')
      ? (([...typeRadios].find(r => r.checked) || {}).value)
      : '증빙';
    // 소득1(#baseDeclareTypeBubbleList)은 원형 배치라 항목이 빠지면 원이 비대칭이 된다.
    // → 소득1은 현재 선택 항목도 그대로 보여주고(선택 표시만), 소득추가 행만 기존처럼 숨긴다.
    const isCircularLayout = bubbleListEl.id === 'baseDeclareTypeBubbleList';
    bubbleListEl.querySelectorAll('.declare-type-bubble-item').forEach(item => {
      const value = item.dataset.value;
      if (value === '삭제' || value === '초기화') return;
      if (isCircularLayout) {
        item.style.display = '';
        item.classList.toggle('active', value === activeValue);
        return;
      }
      item.style.display = (value === activeValue) ? 'none' : '';
    });
    bubbleListEl.classList.add('open');
    positionBubble();
  };
  const closeBubble = () => bubbleListEl.classList.remove('open');

  titleEl.addEventListener('click', () => openBubble());

  bubbleListEl.querySelectorAll('.declare-type-bubble-item').forEach(item => {
    const value = item.dataset.value;

    item.addEventListener('mousedown', (e) => {
      e.preventDefault();
      if (value === '삭제') {
        closeBubble();
        if (options.onDelete) options.onDelete();
        return;
      }
      if (value === '초기화') {
        closeBubble();
        if (options.onReset) options.onReset();
        return;
      }
      if (value === '증빙') {
        const modeRadio = [...modeRadios].find(r => r.value === '증빙');
        if (modeRadio && !modeRadio.checked) {
          modeRadio.checked = true;
          modeRadio.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } else {
        // 종류(카드/건보/연금)를 먼저 반영해야, 뒤이어 모드를 "신고"로 바꿀 때 실행되는
        // 라벨/제목 갱신 로직이 방금 고른 종류를 정확히 읽는다(순서가 바뀌면 이전 종류로 표시됨).
        const typeRadio = [...typeRadios].find(r => r.value === value);
        if (typeRadio && !typeRadio.checked) {
          typeRadio.checked = true;
          typeRadio.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const modeRadio = [...modeRadios].find(r => r.value === '신고');
        if (modeRadio && !modeRadio.checked) {
          modeRadio.checked = true;
          modeRadio.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
      closeBubble();
    });
  });

  document.addEventListener('click', (e) => {
    if (e.target === titleEl || bubbleListEl.contains(e.target)) return;
    closeBubble();
  });

  document.body.addEventListener('scroll', closeBubble, { passive: true });

  return { openBubble, closeBubble };
}

setupIncomeTitleBubble(
  document.getElementById('baseIncomeTitle'),
  document.getElementById('baseDeclareTypeBubbleList'),
  baseIncomeModeRadios,
  baseDeclareTypeRadios,
  {
    onReset: () => {
      소득1초기화();
      showBubble('소득1이 초기화되었습니다');
      if (typeof saveDSRInputs === 'function') saveDSRInputs();
    },
  }
);

if (baseDeclareAmountInput) {
  baseDeclareAmountInput.addEventListener("input", (e) => {
    const v = e.target.value.replace(/\D/g, '');
    const num = v ? parseFloat(v) : 0;
    memoBaseDeclareAmounts[baseDeclareType] = num; // 현재 선택된 종류(카드/건보/연금)에만 저장
    e.target.value = v ? num.toLocaleString() : '';
    if (baseIncomeMode === '신고') {
      memoBaseIncome = refreshBaseDeclareConverted();
      updateIncomeCalc();
    } else {
      refreshBaseDeclareConverted();
    }
  });
}

/* ==========================================================================
   소득행 제네릭 엔진 - "소득 추가" 버튼으로 늘어나는 소득2, 소득3, ... 행 전용.
   소득1(위의 base* 코드)은 기존 그대로 두고, 2번째 이후 행만 이 엔진으로 동적 생성/관리한다.
   ========================================================================== */
const incomeRowState = new Map(); // index(2,3,...) -> {mode, declareType, memoIncome, memoIncomeDirect, memoDeclareAmounts, isEditing}
let nextIncomeRowIndex = 2;
let otherRowsWereBlocked = false;

function extraIncomeRowIndexes() {
  return [...incomeRowState.keys()].sort((a, b) => a - b);
}

function getRowEls(index) {
  return {
    row: document.getElementById(`incomeRow_${index}`),
    incomeInput: document.getElementById(`incomeInput_${index}`),
    hiddenInput: document.getElementById(`computedIncomeHidden_${index}`),
    ageInput: document.getElementById(`ageInput_${index}`),
    applyRateCheck: document.getElementById(`applyRateCheck_${index}`),
    rateDisplay: document.getElementById(`rateDisplay_${index}`),
    futureIncomeConverted: document.getElementById(`futureIncomeConverted_${index}`),
    declareAmountInput: document.getElementById(`declareAmountInput_${index}`),
    declareConvertedOutput: document.getElementById(`declareConvertedOutput_${index}`),
    declareInputGroup: document.getElementById(`declareInputGroup_${index}`),
    estimateLabel: document.getElementById(`estimateLabel_${index}`),
    bubbleList: document.getElementById(`declareTypeBubbleList_${index}`),
    titleEl: document.getElementById(`incomeTitle_${index}`),
    futureIncomeRow: document.getElementById(`futureIncomeRow_${index}`),
    modeRadios: document.querySelectorAll(`input[name="income_mode_${index}"]`),
    typeRadios: document.querySelectorAll(`input[name="declare_type_${index}"]`),
  };
}

function buildIncomeRowHTML(index) {
  return `
      <tr class="income-data-row" id="incomeRow_${index}">
        <td class="income-label">
          <div class="income-title" id="incomeTitle_${index}">증빙</div>
        </td>
        <td class="income-mode-cell" id="modeCell_${index}">
          <div class="income-mode-toggle pill-toggle-group" id="incomeModeToggle_${index}">
            <label style="background-color: #2563eb; color: #ffffff;">
              <input type="radio" name="income_mode_${index}" value="증빙" checked><span class="income-mode-label">증빙</span>
            </label>
            <label style="background-color: transparent; color: #64748b;">
              <input type="radio" name="income_mode_${index}" value="신고"><span class="income-mode-label" id="estimateLabel_${index}">추정</span>
            </label>
          </div>
          <div class="declare-type-bubble-list" id="declareTypeBubbleList_${index}">
            <div class="declare-type-bubble-item" data-value="증빙">증빙</div>
            <div class="declare-type-bubble-item" data-value="카드">카드</div>
            <div class="declare-type-bubble-item" data-value="삭제">삭제</div>
          </div>
        </td>
        <td class="income-input-cell" id="incomeInputCell_${index}" colspan="3">
          <input type="hidden" id="computedIncomeHidden_${index}" class="income-computed-hidden" value="">
          <!-- 증빙 모드: 연소득 입력 + 장래예상(체크박스/나이/요율)을 가로로 나란히 배치 -->
          <div class="income-cell-flex" id="incomeCellFlex_${index}">
            <input type="text" id="incomeInput_${index}" class="income-input" inputmode="numeric" placeholder="연소득 입력" autocomplete="off">
            <div class="future-income-row" id="futureIncomeRow_${index}">
              <span class="rate-toggle-row">
                <button type="button" id="applyRateBtn_${index}" class="mort-category-toggle rate-toggle-btn" onclick="document.getElementById('applyRateCheck_${index}').click()">
                  <span class="rate-toggle-label">장래예상</span>
                  <span id="rateDisplay_${index}" class="rate-display" style="display:none;">(-)</span>
                </button>
                <input type="checkbox" id="applyRateCheck_${index}" style="display:none;">
              </span>
              <input type="number" id="ageInput_${index}" class="age-input" placeholder="32 or 1992" style="display:none;">
            </div>
          </div>
          <span id="futureIncomeConverted_${index}" class="future-income-converted" style="display:none;"></span>
          <!-- 추정 모드: 연사용액 입력칸과 환산금액 칸을 합치지 않고, 증빙과 마찬가지로 가로로 나란히 배치 -->
          <div class="declare-cell-flex" id="declareCellFlex_${index}">
            <div class="declare-input-group" id="declareInputGroup_${index}" style="display:none;">
              <div class="pill-toggle-group declare-type-toggle" id="declareTypeToggle_${index}" style="display:none;">
                <label style="background-color: #2563eb; color: #ffffff;"><input type="radio" name="declare_type_${index}" value="카드" checked>카드</label>
                <label style="background-color: transparent; color: #64748b;"><input type="radio" name="declare_type_${index}" value="건강">건보</label>
                <label style="background-color: transparent; color: #64748b;"><input type="radio" name="declare_type_${index}" value="연금">연금</label>
              </div>
              <input type="text" inputmode="numeric" class="declare-amount-input" id="declareAmountInput_${index}" placeholder="연사용액 입력">
            </div>
            <input type="text" class="declare-converted-output" id="declareConvertedOutput_${index}" readonly placeholder="환산금액" style="display:none;">
          </div>
        </td>
      </tr>
      <tr class="income-memo-row">
        <td colspan="4">
          <textarea id="incomeMemo_${index}" class="income-memo" placeholder="메모 입력" lang="ko" rows="1" autocomplete="off"></textarea>
        </td>
      </tr>`;
}

function refreshRowDeclareConverted(index) {
  const els = getRowEls(index);
  const st = incomeRowState.get(index);
  if (!st) return 0;
  const amount = st.memoDeclareAmounts[st.declareType] || 0;
  const converted = calcDeclareConvertedIncome(st.declareType, amount);
  if (els.declareConvertedOutput) {
    els.declareConvertedOutput.value = converted > 0 ? Math.floor(converted).toLocaleString() : "";
  }
  return converted;
}

function updateRowIncomeCalc(index) {
  const els = getRowEls(index);
  const st = incomeRowState.get(index);
  if (!st || !els.incomeInput || !els.hiddenInput || !els.ageInput || !els.applyRateCheck || !els.rateDisplay) return;
  if (els.ageInput.value.length > 4) els.ageInput.value = els.ageInput.value.slice(0, 4);
  const age = parseAgeInputValue(els.ageInput.value);
  const rateApplies = els.applyRateCheck.checked && st.mode !== '신고';
  warnAgeBoundaryIfNeeded(age, els.ageInput.value, rateApplies);
  const matched = LOAN_RATE_TABLE.find(item => age >= item.minAge && age <= item.maxAge);
  const rate = matched ? matched.percent / 100 : 1;
  const isDeclareMode = st.mode === '신고';
  // rateApplies는 위에서 계산한 값과 동일하게 유지한다. 신고소득 모드에서는 장래예상을 적용하지 않는다.
  els.rateDisplay.innerText = `(${matched ? matched.percent + "%" : "-"})`;
  const applyRateBtn = document.getElementById(`applyRateBtn_${index}`);
  if (applyRateBtn) applyRateBtn.classList.toggle('active', els.applyRateCheck.checked);
  const finalVal = rateApplies ? st.memoIncome * rate : st.memoIncome;
  // 소득1이 건보/연금 추정소득이면 나머지 행 소득은 합산 대상에서 제외한다 (입력값 자체는 보존).
  els.hiddenInput.value = (!isOtherIncomeBlocked() && finalVal > 0) ? Math.floor(finalVal).toLocaleString() : "";
  // 연소득 입력칸 자체는 항상 원래 입력값(st.memoIncome)만 보여주고, 장래예상 환산값은
  // futureIncomeConverted(나이입력 오른쪽 표시)에서만 보여준다.
  if (!st.isEditing) els.incomeInput.value = st.memoIncome > 0 ? Math.floor(st.memoIncome).toLocaleString() : "";
  if (els.futureIncomeConverted) {
    if (rateApplies && finalVal > 0) {
      els.futureIncomeConverted.textContent = `→ ${Math.floor(finalVal).toLocaleString()}원`;
      els.futureIncomeConverted.style.display = '';
    } else {
      els.futureIncomeConverted.style.display = 'none';
    }
  }
  if (typeof 자동계산 === 'function') 자동계산();
}

function applyIncomeRowMode(index) {
  const els = getRowEls(index);
  const st = incomeRowState.get(index);
  if (!st || !els.row) return;
  // 소득2 이후 행은 건보/연금 추정소득 자체를 쓸 수 없음 - 복원된 값 등으로 남아있으면 카드로 강제 복원
  if (st.declareType === '건강' || st.declareType === '연금') {
    st.declareType = '카드';
    const cardRadio = [...els.typeRadios].find(r => r.value === '카드');
    if (cardRadio) cardRadio.checked = true;
    refreshRadioToggleStyles(`#declareTypeToggle_${index}`);
  }
  const isDeclare = st.mode === '신고';
  const isJeonseBranch = consultLocalStorage.getItem('DSR_propertyLoanType') === '전세';
  if (els.incomeInput) els.incomeInput.style.display = isDeclare ? 'none' : '';
  if (els.declareInputGroup) els.declareInputGroup.style.display = isDeclare ? 'flex' : 'none';
  if (els.declareAmountInput) {
    els.declareAmountInput.style.display = isDeclare ? '' : 'none';
    els.declareAmountInput.placeholder = DECLARE_AMOUNT_PLACEHOLDERS[st.declareType] || '금액 입력';
    const amt = st.memoDeclareAmounts[st.declareType] || 0;
    els.declareAmountInput.value = amt > 0 ? amt.toLocaleString() : '';
  }
  // 전세 분기에서는 소득2 이상 행의 장래예상을 비활성화하고 숨긴다.
  // 담보 분기에서는 기존처럼 장래예상 버튼을 사용할 수 있다.
  if (els.applyRateCheck) {
    els.applyRateCheck.disabled = isJeonseBranch;
    if (isJeonseBranch) els.applyRateCheck.checked = false;
  }
  const extraRateButton = document.getElementById(`applyRateBtn_${index}`);
  if (extraRateButton) {
    extraRateButton.disabled = isJeonseBranch;
    extraRateButton.classList.toggle('active', !isJeonseBranch && els.applyRateCheck?.checked);
  }
  if (els.futureIncomeRow) els.futureIncomeRow.style.display = (isDeclare || isJeonseBranch) ? 'none' : '';
  const showAgeAndRate = !isDeclare && !isJeonseBranch && els.applyRateCheck && els.applyRateCheck.checked;
  if (els.ageInput) els.ageInput.style.display = showAgeAndRate ? '' : 'none';
  if (els.rateDisplay) els.rateDisplay.style.display = showAgeAndRate ? '' : 'none';
  if (els.declareConvertedOutput) els.declareConvertedOutput.style.display = isDeclare ? '' : 'none';
  if (els.estimateLabel) {
    els.estimateLabel.textContent = isDeclare ? (DECLARE_TYPE_LABELS[st.declareType] || '추정') : '추정';
    const estimateLabelEl = els.estimateLabel.closest('label');
    const labelCell = els.row ? els.row.querySelector('.income-label') : null;
    if (isDeclare) {
      const activeBubble = els.bubbleList ? els.bubbleList.querySelector(`.declare-type-bubble-item[data-value="${st.declareType}"]`) : null;
      const bg = activeBubble ? getComputedStyle(activeBubble).backgroundImage : null;
      if (bg) {
        if (estimateLabelEl) estimateLabelEl.style.setProperty('background', bg, 'important');
        if (labelCell) {
          labelCell.style.setProperty('background', bg, 'important');
          labelCell.style.setProperty('color', '#ffffff', 'important');
        }
      }
      // 선택된 소득 종류(카드) 이름을 "소득N" 자리에 그대로 표시
      if (els.titleEl) {
        els.titleEl.textContent = DECLARE_TYPE_LABELS[st.declareType] || els.titleEl.textContent;
        els.titleEl.dataset.labelOverride = '1';
      }
    } else {
      if (estimateLabelEl) estimateLabelEl.style.removeProperty('background');
      if (labelCell) {
        labelCell.style.removeProperty('background');
        labelCell.style.removeProperty('color');
      }
      if (els.titleEl) delete els.titleEl.dataset.labelOverride;
    }
  }
  st.memoIncome = isDeclare ? refreshRowDeclareConverted(index) : st.memoIncomeDirect;
  updateRowIncomeCalc(index);
  relabelIncomeRows();
}

function wireIncomeRow(index) {
  const els = getRowEls(index);
  els.modeRadios.forEach(radio => {
    radio.addEventListener("change", () => {
      incomeRowState.get(index).mode = radio.value;
      refreshRadioToggleStyles(`#incomeModeToggle_${index}`);
      applyIncomeRowMode(index);
    });
  });
  els.typeRadios.forEach(radio => {
    radio.addEventListener("change", () => {
      const st = incomeRowState.get(index);
      st.declareType = radio.value;
      refreshRadioToggleStyles(`#declareTypeToggle_${index}`);
      // 이미 신고 모드인 상태에서 종류만 바뀌는 경우 모드 라디오는 change가 안 뜨므로,
      // 제목/라벨 갱신을 포함한 applyIncomeRowMode()를 여기서 직접 호출해줘야 반영된다.
      applyIncomeRowMode(index);
    });
  });
  if (els.declareAmountInput) {
    els.declareAmountInput.addEventListener("input", (e) => {
      const st = incomeRowState.get(index);
      const v = e.target.value.replace(/\D/g, '');
      const num = v ? parseFloat(v) : 0;
      st.memoDeclareAmounts[st.declareType] = num;
      e.target.value = v ? num.toLocaleString() : '';
      if (st.mode === '신고') {
        st.memoIncome = refreshRowDeclareConverted(index);
        updateRowIncomeCalc(index);
      } else {
        refreshRowDeclareConverted(index);
      }
    });
  }
  if (els.applyRateCheck) {
    els.applyRateCheck.addEventListener("change", (e) => {
      // 체크 시에만 나이/요율 칸이 옆에 나타나도록 표시 여부를 다시 계산
      if (els.ageInput) els.ageInput.style.display = e.target.checked ? '' : 'none';
      if (els.rateDisplay) els.rateDisplay.style.display = e.target.checked ? '' : 'none';
      updateRowIncomeCalc(index);
    });
  }
  if (els.ageInput) els.ageInput.addEventListener("input", () => updateRowIncomeCalc(index));
  if (els.incomeInput) {
    els.incomeInput.addEventListener("focus", () => {
      const st = incomeRowState.get(index);
      st.isEditing = true;
      const value = els.incomeInput.value.replace(/\D/g, '');
      if (value && st.memoIncome === 0) st.memoIncome = parseFloat(value);
      st.memoIncomeDirect = st.memoIncome;
      els.incomeInput.value = st.memoIncome > 0 ? st.memoIncome.toLocaleString() : "";
    });
    els.incomeInput.addEventListener("blur", () => {
      incomeRowState.get(index).isEditing = false;
      updateRowIncomeCalc(index);
    });
    els.incomeInput.addEventListener("input", (e) => {
      const st = incomeRowState.get(index);
      const value = e.target.value.replace(/\D/g, '');
      st.memoIncome = value ? parseFloat(value) : 0;
      st.memoIncomeDirect = st.memoIncome;
      e.target.value = value ? st.memoIncome.toLocaleString() : "";
      updateRowIncomeCalc(index);
    });
  }
  return setupIncomeTitleBubble(
    els.titleEl,
    els.bubbleList,
    els.modeRadios,
    els.typeRadios,
    { onDelete: () => 소득행삭제(index) }
  );
}

/* 소득1(base)이 건보/연금 추정소득이면 소득2 이후 행 전체를 입력 불가(회색) 처리한다. */
function isOtherIncomeBlocked() {
  return baseIncomeMode === '신고' && (baseDeclareType === '건강' || baseDeclareType === '연금');
}

function applyOtherRowsBlock() {
  const blocked = isOtherIncomeBlocked();
  const isJeonseBranch = consultLocalStorage.getItem('DSR_propertyLoanType') === '전세';
  extraIncomeRowIndexes().forEach(idx => {
    const els = getRowEls(idx);
    [els.incomeInput, els.declareAmountInput, els.ageInput, ...els.modeRadios].forEach(el => {
      if (el) el.disabled = blocked;
    });
    if (els.applyRateCheck) {
      els.applyRateCheck.disabled = blocked || isJeonseBranch;
      if (isJeonseBranch) els.applyRateCheck.checked = false;
    }
    const rateButton = document.getElementById(`applyRateBtn_${idx}`);
    if (rateButton) {
      rateButton.disabled = blocked || isJeonseBranch;
      rateButton.classList.toggle('active', !blocked && !isJeonseBranch && els.applyRateCheck?.checked);
    }
    if (els.row) els.row.classList.toggle('income-row-blocked', blocked);
    // 구분 전환 시 숨김/표시 상태도 즉시 갱신해 담보에서는 기존 버튼을 복원한다.
    applyIncomeRowMode(idx);
  });
  if (blocked && !otherRowsWereBlocked) {
    showBubble('건보/연금 소득은 다른 소득에 합산이 불가합니다');
  }
  otherRowsWereBlocked = blocked;
  if (typeof 자동계산 === 'function') 자동계산();
}

function relabelIncomeRows() {
  document.querySelectorAll('.income-data-row').forEach((row) => {
    const titleEl = row.querySelector('.income-title');
    if (!titleEl) return;
    // 카드/건보/연금 등 선택된 라벨을 표시 중인 행(labelOverride)은 번호로 덮어쓰지 않는다.
    if (titleEl.dataset.labelOverride === '1') return;
    // "소득1/소득2" 대신 소득 종류(증빙/카드/건보/연금)를 제목으로 표시한다.
    // (소득1과 소득추가 행 모두 동일 규칙)
    const rowIndex = Number(titleEl.id.replace('incomeTitle_', '')) || 1;
    const modeRadio = document.querySelector(`input[name="${rowIndex === 1 ? 'base_income_mode' : `income_mode_${rowIndex}`}"]:checked`);
    const typeRadio = document.querySelector(`input[name="${rowIndex === 1 ? 'base_declare_type' : `declare_type_${rowIndex}`}"]:checked`);
    const isDeclare = modeRadio && modeRadio.value === '신고';
    titleEl.textContent = isDeclare
      ? (DECLARE_TYPE_LABELS[typeRadio ? typeRadio.value : ''] || '추정')
      : '증빙';
  });
}

// explicitIndex: 저장된 값 복원 시 원래 인덱스 그대로 재생성하기 위해 사용 (삭제로 인덱스에 구멍이 생길 수 있음).
// isRestore: true면 새로고침 복원 과정이므로 선택 버블을 자동으로 띄우지 않는다.
// presetType: 소득추가 버튼의 사전 선택 버블(증빙/카드)에서 이미 종류를 고르고 들어온 경우 - 행 생성 직후
//             해당 종류를 바로 적용하고, 뒤이어 뜨는 증빙/카드/삭제 선택 버블은 띄우지 않는다.
function 소득행추가(explicitIndex) {
  const index = (typeof explicitIndex === 'number') ? explicitIndex : nextIncomeRowIndex++;
  if (index >= nextIncomeRowIndex) nextIncomeRowIndex = index + 1;
  const table = document.querySelector('.income-table');
  if (!table) return;
  // "소득 추가" 버튼 행(#incomeAddRow)이 항상 맨 아래에 있도록, 새 행은 그 버튼 행 바로 앞에 끼워 넣는다.
  const addRow = document.getElementById('incomeAddRow');
  if (addRow) addRow.insertAdjacentHTML('beforebegin', buildIncomeRowHTML(index));
  else table.insertAdjacentHTML('beforeend', buildIncomeRowHTML(index));
  incomeRowState.set(index, {
    mode: '증빙',
    declareType: '카드',
    memoIncome: 0,
    memoIncomeDirect: 0,
    memoDeclareAmounts: { '카드': 0, '건강': 0, '연금': 0 },
    isEditing: false,
  });
  wireIncomeRow(index);
  applyIncomeRowMode(index);
  applyOtherRowsBlock();
  relabelIncomeRows();
  adjustTableFontSize();
  // 소득추가 시 팝업 제거
  return index;
}

/* "소득 추가" 버튼: 1번 행이 건보/연금이면 합산 자체가 불가하므로 행을 만들지 않고 안내만 띄운다.
   그 외에는 증빙/카드를 고르는 버블 없이 바로 증빙 모드의 새 소득 행을 추가한다. */
function handleAddIncomeClick(triggerEl) {
  if (isOtherIncomeBlocked()) {
    showBubble('건보 또는 연금은 소득합산 불가');
    return;
  }
  소득행추가();
}

function 소득행삭제(index) {
  const els = getRowEls(index);
  const memoRow = els.row?.nextElementSibling;
  if (memoRow && memoRow.classList.contains('income-memo-row')) memoRow.remove();
  if (els.row) els.row.remove();
  if (els.bubbleList) els.bubbleList.remove(); // body로 옮겨져 있으므로 행 삭제와 별개로 제거해야 함
  incomeRowState.delete(index);
  applyOtherRowsBlock();
  relabelIncomeRows();
  adjustTableFontSize();
  if (typeof 자동계산 === 'function') 자동계산();
  showBubble('소득 행이 삭제되었습니다');
  if (typeof saveDSRInputs === 'function') saveDSRInputs();
}

function resetExtraIncomeRowsForRestore() {
  extraIncomeRowIndexes().forEach(idx => {
    const els = getRowEls(idx);
    const memoRow = els.row?.nextElementSibling;
    if (memoRow && memoRow.classList.contains('income-memo-row')) memoRow.remove();
    if (els.row) els.row.remove();
    if (els.bubbleList) els.bubbleList.remove();
  });
  incomeRowState.clear();
  nextIncomeRowIndex = 2;
  otherRowsWereBlocked = false;
}

function populateDeclareRateEditFields() {
  Object.keys(DECLARE_INCOME_RATES).forEach(type => {
    const cfg = DECLARE_INCOME_RATES[type];
    const divisorEl = document.getElementById(`edit-declare-${type}-divisor`);
    const multiplierEl = document.getElementById(`edit-declare-${type}-multiplier`);
    if (divisorEl) divisorEl.value = cfg.divisor;
    if (multiplierEl) multiplierEl.value = cfg.multiplier;
  });
}

function saveDeclareIncomeRates() {
  const types = Object.keys(DECLARE_INCOME_RATES);
  const parsed = {};
  for (const type of types) {
    const divisorEl = document.getElementById(`edit-declare-${type}-divisor`);
    const multiplierEl = document.getElementById(`edit-declare-${type}-multiplier`);
    const divisorVal = parseFloat(divisorEl?.value);
    const multiplierVal = parseFloat(multiplierEl?.value);
    if (isNaN(divisorVal) || divisorVal <= 0 || isNaN(multiplierVal) || multiplierVal < 0) {
      alert("올바른 요율(숫자)을 입력해주세요.");
      return;
    }
    parsed[type] = { divisor: divisorVal, multiplier: multiplierVal };
  }
  types.forEach(type => {
    DECLARE_INCOME_RATES[type].divisor = parsed[type].divisor;
    DECLARE_INCOME_RATES[type].multiplier = parsed[type].multiplier;
  });
  setStoredJson("CUSTOM_DECLARE_INCOME_RATES", DECLARE_INCOME_RATES);
  showBubble("신고소득 환산 요율 저장 완료");
  closeModal();
  if (baseIncomeMode === '신고') { memoBaseIncome = refreshBaseDeclareConverted(); updateIncomeCalc(); }
  extraIncomeRowIndexes().forEach(idx => {
    const st = incomeRowState.get(idx);
    if (st.mode === '신고') { st.memoIncome = refreshRowDeclareConverted(idx); updateRowIncomeCalc(idx); }
  });
}

const ltvMarketPriceInput = document.getElementById("ltvMarketPriceInput");
if (ltvMarketPriceInput) {
  ltvMarketPriceInput.addEventListener("input", (e) => {
    let v = e.target.value.replace(/\D/g, '');
    e.target.value = v ? parseInt(v).toLocaleString() : '';
    if (typeof 자동계산 === 'function') 자동계산();
  });
}

const ltvMinorLeaseInput = document.getElementById("ltvMinorLeaseInput");
if (ltvMinorLeaseInput) {
  ltvMinorLeaseInput.addEventListener("input", (e) => {
    let v = e.target.value.replace(/\D/g, '');
    e.target.value = v ? parseInt(v).toLocaleString() : '';
    if (typeof 자동계산 === 'function') 자동계산();
  });
}

// 소액임차금액 추천 목록: 브라우저 자동완성(과거 입력 이력) 대신 지정된 4개 금액만
// 라벨("5,500만" 등)로 보여주고, 선택 시 전체 숫자를 입력칸에 채워 넣는 커스텀 드롭다운.
const minorLeaseSuggestList = document.getElementById("minorLeaseSuggestList");
if (ltvMinorLeaseInput && minorLeaseSuggestList) {
  // table의 overflow:hidden + 셀의 container-type이 만드는 클리핑/컨테이닝 블록을
  // 피하기 위해 드롭다운을 body 바로 아래로 옮기고, position:fixed 좌표를 매번 계산한다.
  document.body.appendChild(minorLeaseSuggestList);

  const positionList = () => {
    // 버블 팝업은 입력칸 폭에 맞추지 않고 콘텐츠 크기대로 펼쳐지므로,
    // 입력칸 가로 중앙에 맞춰 배치한다 (CSS의 translateX(-50%)와 짝을 이룸).
    const rect = ltvMinorLeaseInput.getBoundingClientRect();
    minorLeaseSuggestList.style.left = (rect.left + rect.width / 2) + 'px';
    minorLeaseSuggestList.style.top = (rect.bottom + 4) + 'px';
  };
  const openList = () => { positionList(); minorLeaseSuggestList.classList.add('open'); };
  const closeList = () => minorLeaseSuggestList.classList.remove('open');

  // focus만으로는 입력칸이 이미 포커스된 상태(다른 버블의 mousedown preventDefault로 blur가
  // 안 일어난 경우)에서 다시 클릭해도 focus 이벤트가 재발생하지 않아 버블이 안 뜨는 문제가 있어
  // click에도 동일하게 열어준다.
  ltvMinorLeaseInput.addEventListener("focus", openList);
  ltvMinorLeaseInput.addEventListener("click", openList);

  minorLeaseSuggestList.querySelectorAll('.minor-lease-suggest-item').forEach(item => {
    // click보다 먼저 발생하는 mousedown에서 처리 - input의 blur가 항목 클릭을 가로채지 않도록 함
    item.addEventListener("mousedown", (e) => {
      e.preventDefault();
      ltvMinorLeaseInput.value = item.dataset.value;
      ltvMinorLeaseInput.dispatchEvent(new Event('input', { bubbles: true }));
      closeList();
    });
  });

  document.addEventListener("click", (e) => {
    if (e.target !== ltvMinorLeaseInput && !minorLeaseSuggestList.contains(e.target)) {
      closeList();
    }
  });

  // 스크롤 중에는 좌표가 어긋날 수 있으므로 열려 있으면 닫는다 (페이지 스크롤 컨테이너는 body).
  document.body.addEventListener("scroll", closeList, { passive: true });
}

// 내용복사 버튼: "텍스트로 복사" / "화면 캡쳐" 2가지 선택 팝업
// table의 overflow:hidden에 잘리지 않도록 body 바로 아래로 옮기고 버튼 위쪽에 표시한다.
const copyMenuBtn = document.getElementById("copy-menu-btn");
const copyMenuList = document.getElementById("copyMenuList");
if (copyMenuBtn && copyMenuList) {
  document.body.appendChild(copyMenuList);
  const positionCopyMenu = () => {
    const rect = copyMenuBtn.getBoundingClientRect();
    copyMenuList.style.left = (rect.left + rect.width / 2) + 'px';
    copyMenuList.style.top = (rect.top - copyMenuList.offsetHeight - 6) + 'px';
  };
  copyMenuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    copyMenuList.classList.toggle("open");
    if (copyMenuList.classList.contains("open")) positionCopyMenu();
  });
  copyMenuList.querySelectorAll(".copy-menu-item").forEach(item => {
    item.addEventListener("click", () => copyMenuList.classList.remove("open"));
  });
  document.addEventListener("click", (e) => {
    if (e.target === copyMenuBtn || copyMenuList.contains(e.target)) return;
    copyMenuList.classList.remove("open");
  });
  document.body.addEventListener("scroll", () => copyMenuList.classList.remove("open"), { passive: true });
}

/* 라디오 토글 그룹(LTV 비율 / DSR 한도율) 공통 처리:
   선택된 라디오가 속한 label만 강조색을 입히는 동일한 로직이
   두 그룹에 그대로 반복되어 있던 것을 헬퍼 하나로 통합함. */
function refreshRadioToggleStyles(groupSelector) {
  document.querySelectorAll(`${groupSelector} label`).forEach(lbl => {
    const r = lbl.querySelector('input[type="radio"]');
    if (r && r.checked) {
      lbl.style.backgroundColor = "#2563eb";
      lbl.style.color = "#ffffff";
    } else {
      lbl.style.backgroundColor = "transparent";
      lbl.style.color = "#64748b";
    }
  });
}

function bindRadioToggleGroup(radios, groupSelector) {
  radios.forEach(radio => {
    radio.addEventListener("change", () => {
      refreshRadioToggleStyles(groupSelector);
      if (typeof 자동계산 === 'function') 자동계산();
    });
  });
}

const ltvRateRadios = document.querySelectorAll('input[name="ltv_rate"]');
bindRadioToggleGroup(ltvRateRadios, '#ltvRateToggleGroup');

const dsrLimitRateRadios = document.querySelectorAll('input[name="dsr_limit_rate"]');
bindRadioToggleGroup(dsrLimitRateRadios, '#dsrLimitToggleGroup');

// 소득1(본인) 행만 초기값으로 되돌린다 - 대출/LTV 등 다른 입력은 건드리지 않는다.
// "소득1" 제목 버블의 "초기화" 항목과 선택초기화() 양쪽에서 공유해서 쓴다.
function 소득1초기화() {
  if (baseIncomeInput) baseIncomeInput.value = "";
  memoBaseIncome = 0;
  const computedHidden = document.getElementById("computedIncomeHidden");
  if (computedHidden) computedHidden.value = "";

  if (applyRateCheck) applyRateCheck.checked = false;
  if (ageInput) ageInput.value = "";
  const baseIncomeMemo = document.getElementById("baseIncomeMemo");
  if (baseIncomeMemo) { baseIncomeMemo.value = ""; autoResizeMemoTextarea(baseIncomeMemo); }

  // 신고소득(카드/건강/연금) 관련 상태 초기화
  memoBaseIncomeDirect = 0;
  memoBaseDeclareAmounts = { '카드': 0, '건강': 0, '연금': 0 };
  baseIncomeMode = '증빙';
  baseDeclareType = '카드';
  if (baseDeclareAmountInput) baseDeclareAmountInput.value = "";
  if (baseDeclareConvertedOutput) baseDeclareConvertedOutput.value = "";
  const baseModeDefaultRadio = document.querySelector('input[name="base_income_mode"][value="증빙"]');
  if (baseModeDefaultRadio) baseModeDefaultRadio.checked = true;
  const baseDeclareDefaultRadio = document.querySelector('input[name="base_declare_type"][value="카드"]');
  if (baseDeclareDefaultRadio) baseDeclareDefaultRadio.checked = true;
  refreshRadioToggleStyles('#baseIncomeModeToggle');
  refreshRadioToggleStyles('#baseDeclareTypeToggle');
  applyBaseIncomeMode();

  [baseIncomeInput, ageInput, applyRateCheck, baseDeclareAmountInput].forEach(el => {
    if (el && el.id) consultLocalStorage.removeItem(`DSR_${el.id}`);
  });
  consultLocalStorage.removeItem('DSR_radio_base_income_mode');
  consultLocalStorage.removeItem('DSR_radio_base_declare_type');
  ['카드', '건강', '연금'].forEach(type => consultLocalStorage.removeItem(`DSR_declareAmt_base_${type}`));
}

function 선택초기화() {
  const savedDefaultFirstRowData = getStoredJson("DEFAULT_FIRST_ROW_DATA");

  소득1초기화();

  // "소득 추가"로 늘어난 소득2 이후 행은 모두 제거하고 소득1만 남긴다.
  extraIncomeRowIndexes().forEach(idx => {
    const els = getRowEls(idx);
    const memoRow = els.row?.nextElementSibling;
    if (memoRow && memoRow.classList.contains('income-memo-row')) memoRow.remove();
    if (els.row) els.row.remove();
    if (els.bubbleList) els.bubbleList.remove(); // body로 옮겨져 있으므로 행 삭제와 별개로 제거해야 함
  });
  incomeRowState.clear();
  nextIncomeRowIndex = 2;
  otherRowsWereBlocked = false;

  if (ltvMarketPriceInput) {
    ltvMarketPriceInput.value = "";
    // 초기화에서는 value를 직접 비우므로 input 이벤트가 발생하지 않는다.
    // 물건지정보 탭 제목줄의 시세 요약도 즉시 다시 계산한다.
    ltvMarketPriceInput.dispatchEvent(new Event('input', { bubbles: true }));
  }
  if (typeof updatePropertyInfoSummary === 'function') updatePropertyInfoSummary();
  const ltvMaxAmountOutput = document.getElementById("ltvMaxAmountOutput");
  if (ltvMaxAmountOutput) ltvMaxAmountOutput.value = "";
  if (ltvMinorLeaseInput) ltvMinorLeaseInput.value = "";

  const firstRow = document.querySelector('#mortgage-inputs .mortgage-row');
  // 아래 두 값은 뒤쪽(병합 해제) 블록에서도 다시 쓰므로 이 if 블록 밖에서 선언한다.
  //  (블록 안 const 로 두면 뒤 블록에서 ReferenceError 가 나 초기화가 중간에 멈춘다)
  let resetProfile = '6M';
  let resetProfileValues = { rate: '', stRate: '', term: '' };
  if (firstRow) {
    const mortAmt = firstRow.querySelector('.mort-amt');
    if (mortAmt) mortAmt.value = '';
    const mortAnnual = firstRow.querySelector('.mort-annual');
    if (mortAnnual) mortAnnual.value = '';

    // [2026-11-11 재변경] 초기화는 "화면을 빈 상태로 되돌리기"다.
    //  · 금리: 빈값 (예전에는 저장된 기본값 금리를 칸에 채웠는데, 그 값이 구분을 바꿔도
    //    그대로 보여 "원리금 금리가 초기화 후에도 남는" 문제가 생겼다)
    //  · ST금리: 6M=3% / 5Y·2Y=1.5% (기본값 설정 팝업 저장값이 있으면 그것)
    //  · 기간: 360개월 (기본값 설정 팝업 저장값이 있으면 그것)
    const rateInput = firstRow.querySelector('.mort-rate');
    if (rateInput) rateInput.value = '';

    resetProfile = firstRow.querySelector('.mort-default-profile')?.value
      || firstRow.querySelector('.mort-default-switch')?.dataset.profile
      || '6M';
    resetProfileValues = getDefaultProfileValues(resetProfile, savedDefaultFirstRowData);

    const stRateInput = firstRow.querySelector('.mort-st-rate');
    if (stRateInput) {
      stRateInput.value = resetProfileValues.stRate
        || (resetProfile === '5Y' || resetProfile === '2Y' ? '1.5' : '3');
    }

    const termInput = firstRow.querySelector('.mort-term');
    if (termInput) termInput.value = resetProfileValues.term || '360';

    const firstMemoRow = firstRow.nextElementSibling;
    if (firstMemoRow && firstMemoRow.classList.contains('mortgage-memo-row')) {
      const firstMemoInput = firstMemoRow.querySelector('.mort-memo');
      if (firstMemoInput) { firstMemoInput.value = ''; autoResizeMemoTextarea(firstMemoInput); }
      // 본건 대출행의 필요일자도 함께 초기화한다 (메모 행이 있으면 그 안의 입력칸).
      const firstNeedDateInput = firstMemoRow.querySelector('.mort-need-date');
      if (firstNeedDateInput) firstNeedDateInput.value = '';
    }

    firstRow.querySelectorAll(CHECKBOX_INPUT_SELECTOR).forEach(checkbox => {
      checkbox.checked = false;
    });
  }

  // "대출 추가"로 늘어난 두 번째 이후 대출 행은 값만 지우지 말고 행 자체를 제거해야
  // 새로고침 없이도 화면에서 바로 사라진다.
  const allRows = document.querySelectorAll('#mortgage-inputs .mortgage-row');
  for (let i = allRows.length - 1; i >= 1; i--) {
    const memoRow = allRows[i].nextElementSibling;
    if (memoRow && memoRow.classList.contains('mortgage-memo-row')) memoRow.remove();
    allRows[i].remove();
  }
  mortCount = allRows.length > 0 ? 1 : 0;
  updateMortgagePlaceholders();

  if (firstRow) {
    const firstRowTypeInput = firstRow.querySelector('.mort-type');
    const firstRowTypeButtons = firstRow.querySelectorAll('.type-btn');
    if (firstRowTypeInput) firstRowTypeInput.value = '원리금';
    firstRowTypeButtons.forEach(btn => btn.classList.remove('active'));
    const firstDefaultTypeBtn = firstRow.querySelector('.type-btn:nth-child(1)');
    if (firstDefaultTypeBtn) firstDefaultTypeBtn.classList.add('active');
    // 상환방식 칩 문구도 기본값(원리금)으로 되돌린다.
    const firstTypeTrigger = firstRow.querySelector('.type-btn-trigger');
    if (firstTypeTrigger) firstTypeTrigger.textContent = '원리금';

    const firstRowCategoryInput = firstRow.querySelector('.mort-loan-category');
    const firstRowCategorySelect = firstRow.querySelector('.mort-category-select');
    // 초기화 후 기본값: 본건대출행 = 주담대 (추가대출행은 생성 시 신용대가 기본)
    if (firstRowCategoryInput) firstRowCategoryInput.value = '주담대';
    if (firstRowCategorySelect) {
      firstRowCategorySelect.value = '주담대';
      firstRowCategorySelect.dataset.cat = '주담대';
    }

    // 구분별로 기억해 둔 상환방식·ST금리 백업은 나중에 지운다.
    // (병합 해제 코드가 dataset.compactMerged 를 보고 동작하므로, 먼저 지우면
    //  "원리금 → 초기화" 시 TD 병합이 풀리지 않아 ST칸이 막대로 찌그러졌다)
    // 구분별 입력값 저장소(금액·금리·ST·개월·상환방식)도 모두 비운다.
    clearCategoryInputStore(firstRow);

    // 구분별 전용 저장 키(DSR_firstRowRate_* / DSR_firstRowStRate_*)도 비운다.
    // → 초기화 후 다시 계산할 때 예전 사용자 입력값이 되살아나지 않게 한다.
    clearFirstRowCategoryRateStore();

    // applyJeonseRowLayout()이 저장소를 다시 읽어 기본값을 덮어쓰지 않도록
    // 복원 중 플래그를 켜두고 실행한다.
    const prevRestoring = __dsrRestoring;
    __dsrRestoring = true;
    try {
      // 병합 구조(전세대/원리금)를 먼저 확실히 해제한다.
      // (dataset 플래그가 남아 있는 이 시점에 해제해야 원래 3-TD 구조로 돌아간다)
      applyCompactRepaymentLayout(firstRow, false);
      applyJeonseRowLayout(firstRow);
      // 그래도 병합이 남아 있으면 플래그를 되살려 한 번 더 해제한다.
      const stillMerged = firstRow.querySelector('.mort-compact-single-cell, .mort-jeonse-single-cell');
      if (stillMerged) {
        if (firstRow.querySelector('.mort-compact-single-cell')) firstRow.dataset.compactMerged = '1';
        if (firstRow.querySelector('.mort-jeonse-single-cell')) firstRow.dataset.jeonseMerged = '1';
        applyCompactRepaymentLayout(firstRow, false);
        applyJeonseRowLayout(firstRow);
      }
      // 플래그로 막혔을 수 있으므로 기본값을 다시 적용한다.
      //  (금리는 초기화 시 항상 빈값 - 위 주석 참조)
      const rateInput = firstRow.querySelector('.mort-rate');
      if (rateInput) rateInput.value = '';
      const stInput = firstRow.querySelector('.mort-st-rate');
      if (stInput) stInput.value = resetProfileValues.stRate
        || (resetProfile === '5Y' || resetProfile === '2Y' ? '1.5' : '3');
      const termEl = firstRow.querySelector('.mort-term');
      if (termEl) termEl.value = resetProfileValues.term || '360';
    } finally {
      __dsrRestoring = prevRestoring;
    }
    // 병합 해제가 끝난 뒤에 기억용 플래그를 지운다.
    delete firstRow.dataset.repayTypeByCategory;
    delete firstRow.dataset.stRateSaved;
    delete firstRow.dataset.jeonseMerged;
    delete firstRow.dataset.compactMerged;
  }

  // 현재 폼 데이터만 비우고, 저장 이력/신규 슬롯은 유지한다.
  consultStorageKeys().forEach(key => {
    if (key.startsWith('DSR_') && !key.startsWith('DSR_HISTORY') && !key.startsWith('DSR_SLOT_')) {
      consultLocalStorage.removeItem(key);
    }
  });
  selectedAptInfo = null;
  renderSelectedAptRow();

  // 고객정보 탭(연락처/고객명/중개업소/메모)도 같이 초기화
  //  · customerJeonseMemo는 전세 분기에서 쓰는 별도 메모칸인데, customerInfoMemo와
  //    input 이벤트로 값을 서로 복사하므로 둘 다 비워야 메모가 남지 않는다.
  ['customerNameInput', 'customerPhoneInput', 'customerBrokerInput', 'customerInfoMemo', 'customerJeonseMemo'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = '';
    // 메모칸은 자동 높이 조절(textarea)이라, 비운 뒤 높이도 다시 맞춰야 빈 칸이 남지 않는다.
    if (el.tagName === 'TEXTAREA' && typeof autoResizeMemoTextarea === 'function') {
      autoResizeMemoTextarea(el);
    }
  });
  if (typeof updateCustomerInfoSummary === 'function') updateCustomerInfoSummary();

  consultLocalStorage.setItem('CONSULT_housingStatus', '무주택');
  consultLocalStorage.setItem('DSR_propertyLoanType', '담보');
  consultLocalStorage.setItem('DSR_propertyJeonseGuarantee', '');
  const housingStatusBtn = document.getElementById('housingStatusBtn');
  if (housingStatusBtn) {
    housingStatusBtn.textContent = '무주택';
    housingStatusBtn.hidden = true;
    if (housingStatusBtn.parentElement) housingStatusBtn.parentElement.classList.remove('is-housing-status-active');
  }
  const categoryBtn = document.getElementById('propertyCategoryBtn');
  if (categoryBtn) categoryBtn.textContent = '담보';
  window.dispatchEvent(new CustomEvent('consultLoanTypeChanged'));
  window.dispatchEvent(new CustomEvent('housingStatusChanged'));

  updateIncomeCalc();
  if (typeof openAllInfoTabs === 'function') openAllInfoTabs();

  // 초기화 후에는 모든 구분의 상환방식을 "원리금"으로 맞춰 둔다.
  //  (원리금 구분에 예전에 골랐던 방식이 남아 있지 않도록)
  //  위의 consultLoanTypeChanged / housingStatusChanged 이벤트가
  //  applyJeonseRowLayout → saveRepayTypeForCategory 를 다시 호출해
  //  예전 값을 되살리므로, 반드시 이벤트 처리가 모두 끝난 뒤에 설정한다.
  const resetRow = document.querySelector('#mortgage-inputs .mortgage-row');
  if (resetRow) {
    try {
      const resetRepayMap = {};
      const resetInputStore = {};
      ['주담대', '전세대', '원리금', '신용대', '이자만', '연간원리금'].forEach(cat => {
        resetRepayMap[cat] = '원리금';
        // 구분별 입력값 저장소의 상환방식도 원리금으로 맞춘다.
        // (restoreCategoryInputs 가 저장소의 type 을 되살려 '만기'로 되돌리던 문제)
        resetInputStore[cat] = { type: '원리금' };
      });
      resetRow.dataset.repayTypeByCategory = JSON.stringify(resetRepayMap);
      resetRow.dataset.categoryInputStore = JSON.stringify(resetInputStore);
    } catch (e) {
      console.warn('[초기화] 상환방식 저장소 초기화 실패', e);
    }
    const typeInput2 = resetRow.querySelector('.mort-type');
    if (typeInput2) typeInput2.value = '원리금';
    const trigger2 = resetRow.querySelector('.type-btn-trigger');
    if (trigger2) trigger2.textContent = '원리금';
    // 활성 버튼 표시도 원리금으로 맞춘다.
    resetRow.querySelectorAll('.type-btn').forEach(btn => {
      btn.classList.toggle('active', (btn.getAttribute('onclick') || '').includes("'원리금'"));
    });
  }

  showBubble("입력 내용이 초기화되었습니다.");
}

const DSR_HISTORY_KEY = 'DSR_HISTORY_ITEMS';
const DSR_HISTORY_LIMIT = 30;

function getDsrHistoryItems() {
  try {
    const raw = consultLocalStorage.getItem(DSR_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('DSR 저장 이력 불러오기 실패:', e);
    return [];
  }
}

function getDsrStorageSnapshot() {
  const snapshot = {};
  consultStorageKeys().forEach(key => {
    if (key.startsWith('DSR_') && !key.startsWith('DSR_HISTORY') && !key.startsWith('DSR_SLOT_')) {
      snapshot[key] = consultLocalStorage.getItem(key);
    }
  });
  return snapshot;
}

function clearDsrStorageSnapshot() {
  consultStorageKeys().forEach(key => {
    if (key.startsWith('DSR_') && !key.startsWith('DSR_HISTORY') && !key.startsWith('DSR_SLOT_')) {
      consultLocalStorage.removeItem(key);
    }
  });
}

function restoreDsrSnapshot(snapshot = {}) {
  const preserved = {};
  consultStorageKeys().forEach(key => {
    if (key.startsWith('DSR_HISTORY') || key.startsWith('DSR_SLOT_')) {
      preserved[key] = consultLocalStorage.getItem(key);
    }
  });

  clearDsrStorageSnapshot();

  Object.entries(snapshot || {}).forEach(([key, value]) => {
    if (value !== null && value !== undefined) consultLocalStorage.setItem(key, value);
  });

  Object.entries(preserved).forEach(([key, value]) => {
    consultLocalStorage.setItem(key, value);
  });
}

function loadDsrSnapshotIntoForm(snapshot = {}) {
  // 복원 전체 구간에서 자동저장을 잠근다 - 복원 중 발생하는 input/change 이벤트와
  // 소득행추가()/주담대행추가() 내부 로직이 saveDSRInputs를 유발해,
  // 아직 복원되지 않은 이전 화면 상태(특히 대출행)로 DSR_* 키를 덮어쓰는 것을 막는다.
  const prevRestoreFlag = __dsrRestoring;
  __dsrRestoring = true;
  try {
    resetExtraIncomeRowsForRestore();
    restoreDsrSnapshot(snapshot || {});
    loadDSRInputs();
  } finally {
    __dsrRestoring = prevRestoreFlag;
    // 복원 완료 표시 — 이후 기본값 자동 적용(applyConsultCachedRateToFirstRow)을 막는다.
    markDsrRestoredFromStorage();
  }

  refreshRadioToggleStyles('#baseIncomeModeToggle');
  refreshRadioToggleStyles('#baseDeclareTypeToggle');
  if (typeof applyBaseIncomeMode === 'function') applyBaseIncomeMode();

  extraIncomeRowIndexes().forEach(idx => {
    if (typeof refreshRadioToggleStyles === 'function') {
      refreshRadioToggleStyles(`#incomeModeToggle_${idx}`);
      refreshRadioToggleStyles(`#declareTypeToggle_${idx}`);
    }
    if (typeof applyIncomeRowMode === 'function') applyIncomeRowMode(idx);
  });

  if (typeof updateIncomeCalc === 'function') updateIncomeCalc();
  if (typeof applyOtherRowsBlock === 'function') applyOtherRowsBlock();
  if (typeof 자동계산 === 'function') 자동계산();

  if (typeof updateCustomerInfoSummary === 'function') updateCustomerInfoSummary();
  if (typeof updateIncomeInfoSummary === 'function') updateIncomeInfoSummary();
  if (typeof updatePropertyInfoSummary === 'function') updatePropertyInfoSummary();
  if (typeof updateLoanInfoSummary === 'function') updateLoanInfoSummary();
  if (typeof updateDsrInfoSummary === 'function') updateDsrInfoSummary();
}

function setRestoredInputValue(input, value, triggerEvent = true) {
  if (!input) return;
  input.value = value;
  if (triggerEvent && typeof Event !== 'undefined') {
    // 복원 중 발생하는 input 이벤트가 자동저장(saveDSRInputs)을 유발해
    // 아직 복원되지 않은 이전 화면 상태로 저장 키를 덮어쓰지 않도록 잠글 때가 있다.
    const prev = __dsrRestoring;
    __dsrRestoring = true;
    try {
      input.dispatchEvent(new Event('input', { bubbles: true }));
    } finally {
      __dsrRestoring = prev;
    }
  }
}

function setRestoredCheckboxValue(checkbox, checked, triggerEvent = true) {
  if (!checkbox) return;
  checkbox.checked = checked;
  if (triggerEvent && typeof Event !== 'undefined') {
    const prev = __dsrRestoring;
    __dsrRestoring = true;
    try {
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    } finally {
      __dsrRestoring = prev;
    }
  }
}

function normalizeDsrPhoneNumber(value) {
  return String(value || '').replace(/\D/g, '');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function buildDsrSavedMemoText(storage = null) {
  const readValue = (id, fallback = '') => {
    if (storage && Object.prototype.hasOwnProperty.call(storage, `DSR_${id}`)) {
      const value = storage[`DSR_${id}`];
      return value === null || value === undefined ? fallback : String(value);
    }
    const el = document.getElementById(id);
    if (!el) return fallback;
    if (typeof el.value !== 'undefined') return String(el.value ?? '');
    return String(el.textContent ?? '');
  };

  const selectedAptInfoSnapshot = storage && storage.DSR_selectedAptInfo
    ? (() => {
        try { return JSON.parse(storage.DSR_selectedAptInfo); } catch { return null; }
      })()
    : (selectedAptInfo || null);

  const mortgageData = storage && storage.DSR_mortgageData
    ? (() => {
        try { return JSON.parse(storage.DSR_mortgageData) || []; } catch { return []; }
      })()
    : Array.from(document.querySelectorAll('#mortgage-inputs .mortgage-row')).map(row => ({
        amount: row.querySelector('.mort-amt')?.value || '',
        rate: row.querySelector('.mort-rate')?.value || '',
        term: row.querySelector('.mort-term')?.value || '',
        type: row.querySelector('.mort-type')?.value || '',
        memo: row.nextElementSibling?.querySelector('.mort-memo')?.value || ''
      }));

  const firstRowData = mortgageData[0] || {};
  const heldRows = Array.isArray(mortgageData) ? mortgageData.slice(1) : [];

  const customerName = readValue('customerNameInput', '').trim() || '고객명 미입력';
  const customerPhone = readValue('customerPhoneInput', '').trim() || '연락처 미입력';
  const customerBroker = readValue('customerBrokerInput', '').trim() || '중개업소 미입력';
  const customerMemo = readValue('customerInfoMemo', '').trim();
  const propertyName = (selectedAptInfoSnapshot && selectedAptInfoSnapshot.aptName) || readValue('selectedAptInfoText', '').trim() || '아파트 미선택';
  const kbPrice = readValue('ltvMarketPriceInput', '').trim() || '-';
  const incomeMode = storage && storage.DSR_radio_base_income_mode ? storage.DSR_radio_base_income_mode : (baseIncomeMode || '증빙');
  const incomeKind = incomeMode === '신고'
    ? (storage && storage.DSR_radio_base_declare_type ? storage.DSR_radio_base_declare_type : (baseDeclareType || '신고'))
    : '근로소득';
  const incomeValue = readValue('baseIncomeInput', '').trim() || '-';
  const incomeMemo = readValue('baseIncomeMemo', '').trim();

  const firstAmt = firstRowData.amount || '-';
  const firstRate = firstRowData.rate || '-';
  const firstTerm = firstRowData.term || '-';
  const firstType = firstRowData.type || '-';
  const firstMemo = (firstRowData.memo || '').trim();

  const heldStatus = heldRows.length
    ? heldRows.map((row, idx) => `보유대출${idx + 1} [ ${row.amount || '-'}, ${row.rate || '-'}%, ${row.term || '-'}개월, ${row.type || '-'} ]`).join(' / ')
    : '없음';
  const heldMemo = heldRows.length
    ? heldRows.map(row => String(row.memo || '')).filter(Boolean).join(' / ') || '없음'
    : '없음';

  return [
    '👉👉👉👉👉👉👉👉👉👉👉',
    '',
    `👉 고객정보 : ${customerName} [ ${customerPhone} ] ( ${customerBroker} )`,
    customerMemo ? `👉 고객정보 메모 : ${customerMemo}` : '👉 고객정보 메모 : 없음',
    '👉',
    `👉 물건지 정보 : [ ${propertyName}, ${kbPrice} ]`,
    `👉 소득정보 : [ ${incomeKind} ] [ ${incomeValue} ]`,
    incomeMemo ? `👉 소득 메모 : ${incomeMemo}` : '👉 소득 메모 : 없음',
    '👉',
    `👉 신청금액 - 본건대출금 [ ${firstAmt}, ${firstRate}%, ${firstTerm}개월, ${firstType} ]`,
    firstMemo ? `👉 신청금액 메모 : ${firstMemo}` : '👉 신청금액 메모 : 없음',
    '👉',
    `👉 보유대출 - 보유대출 현황 [ ${heldStatus} ]`,
    `👉 보유대출 메모 : ${heldMemo}`
  ].join('\n');
}

function getDsrHistorySearchText() {
  const values = [];

  const idList = [
    'customerNameInput', 'customerPhoneInput', 'customerBrokerInput', 'customerInfoMemo',
    'ltvMarketPriceInput', 'ltvMinorLeaseInput', 'selectedAptInfoText', 'selectedAptAddressText',
    'baseIncomeInput', 'baseIncomeMemo', 'baseDeclareAmountInput', 'baseDeclareConvertedOutput',
    'ltvMaxAmountOutput', 'DSR확인', 'DIT확인', '신DTI확인', 'loanInfoSummary', 'dsrInfoSummary'
  ];

  idList.forEach(id => {
    const el = document.getElementById(id);
    if (el && el.value !== undefined) values.push(String(el.value || ''));
    else if (el && el.textContent) values.push(String(el.textContent || ''));
  });

  document.querySelectorAll('input, textarea').forEach(el => {
    if (el.id && !el.closest('#dsrHistoryModal')) {
      const value = (el.type === 'checkbox' ? (el.checked ? 'checked' : '') : (el.value || ''));
      if (value) values.push(String(value));
    }
  });

  const selectedAptInfoText = document.getElementById('selectedAptInfoText');
  if (selectedAptInfoText) values.push(selectedAptInfoText.textContent || '');

  const selectedAptAddressText = document.getElementById('selectedAptAddressText');
  if (selectedAptAddressText) values.push(selectedAptAddressText.textContent || '');

  values.push(buildDsrSavedMemoText());

  return values.join(' ');
}

function saveDsrHistoryItem() {
  saveDSRInputs();
  const history = getDsrHistoryItems();
  const phoneInput = document.getElementById('customerPhoneInput');
  const currentPhone = normalizeDsrPhoneNumber(phoneInput ? phoneInput.value : consultLocalStorage.getItem('DSR_customerPhoneInput'));

  const item = {
    savedAt: new Date().toISOString(),
    // 스냅샷은 localStorage의 DSR_* 키 복사본인데, 결과값(DSR/DTI/신DTI, 최대금액)과 소득 요율 표시는
    // 입력창이 아니라 화면 텍스트라 스냅샷에 없다. 저장 시점에 화면에서 읽어 함께 넣어둔다.
    storage: (() => {
      const snap = getDsrStorageSnapshot();
      const rateEl = document.getElementById('rateDisplay');
      snap.DSR_rateDisplay = rateEl ? rateEl.innerText.replace(/[()]/g, '') : '';
      const extraIdx = (getStoredJson('DSR_incomeRowIndexes', []) || []);
      extraIdx.forEach(idx => {
        const el = document.getElementById(`rateDisplay_${idx}`);
        snap[`DSR_rateDisplay_${idx}`] = el ? el.innerText.replace(/[()]/g, '') : '';
      });
      const readText = id => {
        const el = document.getElementById(id);
        return el ? (el.textContent || '').trim() : '';
      };
      snap.DSR_DSR확인 = readText('DSR확인');
      snap.DSR_DIT확인 = readText('DIT확인');
      snap.DSR_신DTI확인 = readText('신DTI확인');
      const readMax = suffix => {
        const el = document.querySelector(`[id^="DSR최대금액확인-${suffix}"] .dsr-main-val`);
        return el ? el.textContent.trim() : '';
      };
      snap.DSR_dsrMax_원리금 = readMax('원리금');
      snap.DSR_dsrMax_원금 = readMax('원금');
      snap.DSR_hasHeldLoan = Array.from(document.querySelectorAll('#mortgage-inputs .mort-loan-category')).some(input => input.value === '주담대');
      const ltvRateChecked = document.querySelector('input[name="ltv_rate"]:checked');
      snap.DSR_radio_ltv_rate = ltvRateChecked ? ltvRateChecked.value : '';
      // 물건지정보 하단 잔금일자/메모는 저장 스냅샷에 자동 포함되지 않으므로 직접 담는다.
      const settlementEl = document.getElementById('propertySettlementDate');
      snap.DSR_propertySettlementDate = settlementEl ? settlementEl.value : '';
      const propertyMemoEl = document.getElementById('propertyInfoMemo');
      snap.DSR_propertyInfoMemo = propertyMemoEl ? propertyMemoEl.value : '';
      return snap;
    })(),
    searchText: getDsrHistorySearchText()
  };

  if (currentPhone) {
    const samePhoneIndex = history.findIndex(entry => {
      const storedPhone = normalizeDsrPhoneNumber(entry.storage && entry.storage.DSR_customerPhoneInput);
      return storedPhone && storedPhone === currentPhone;
    });

    if (samePhoneIndex >= 0) {
      history.splice(samePhoneIndex, 1);
    }
  }

  history.unshift(item);

  const deduped = [];
  const seenPhones = new Set();
  history.forEach(entry => {
    const phone = normalizeDsrPhoneNumber(entry.storage && entry.storage.DSR_customerPhoneInput);
    if (phone && seenPhones.has(phone)) {
      return;
    }
    if (phone) {
      seenPhones.add(phone);
    }
    deduped.push(entry);
  });

  const trimmed = deduped.slice(0, DSR_HISTORY_LIMIT);
  consultLocalStorage.setItem(DSR_HISTORY_KEY, JSON.stringify(trimmed));
  showBubble('현재 입력 내용을 저장했습니다.');
}

/* ------------------- 저장 목록 카드 렌더링 (예제 양식 적용) ------------------- */
function dsrHistGet(storage, id) {
  const v = storage[`DSR_${id}`];
  return v === undefined || v === null ? '' : String(v);
}
function dsrHistFmtMoney(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (/^-?[\d,]+$/.test(s)) {
    const numeric = Number(s.replace(/,/g, ''));
    return Number.isFinite(numeric) ? `${numeric.toLocaleString('ko-KR')}원` : s;
  }
  return s;
}
/* 화면 표시용 금액(예: "5억 9,500만", "595,000,000")에서 숫자만 추출 */
function dsrHistNum(v) {
  if (v === null || v === undefined) return NaN;
  const s = String(v).replace(/[^0-9]/g, '');
  return s ? Number(s) : NaN;
}
/* [LTV비율 - 소액임차] 계산값: 시세 × 비율 − 소액임차(있을 때만). 시세가 없으면 화면의 LTV 최대한도 값을 그대로 쓴다. */
function dsrHistLtvCalc(storage) {
  const price = dsrHistNum(storage.DSR_ltvMarketPriceInput);
  const rate = Number(dsrHistGet(storage, 'radio_ltv_rate') || '70');
  const minor = dsrHistNum(storage.DSR_ltvMinorLeaseInput);
  if (Number.isFinite(price) && price > 0) {
    let val = price * rate / 100;
    if (Number.isFinite(minor) && minor > 0) val -= minor;
    return `${Math.round(val).toLocaleString('ko-KR')}원`;
  }
  return dsrHistFmtMoney(storage.DSR_ltvMaxAmountOutput);
}
function dsrHistRow(label, value, muted) {
  const v = String(value || '').trim() || '미입력';
  return `<div class="dsr-h-row"><span class="dsr-h-lbl">${label}</span><span class="dsr-h-val${muted ? ' muted' : ''}">${escapeHtml(v)}</span></div>`;
}
function dsrHistIncomeBlock(storage, idx) {
  const p = idx === 1 ? '' : `_${idx}`;
  const mode = dsrHistGet(storage, idx === 1 ? 'radio_base_income_mode' : `radio_income_mode_${idx}`) || '증빙';
  const dtype = dsrHistGet(storage, idx === 1 ? 'radio_base_declare_type' : `radio_declare_type_${idx}`) || '카드';
  const isDeclare = mode === '신고';
  const rawAmount = isDeclare
    ? dsrHistGet(storage, idx === 1 ? 'baseDeclareConvertedOutput' : `declareConvertedOutput${p}`)
    : dsrHistGet(storage, idx === 1 ? 'baseIncomeInput' : `incomeInput${p}`);
  const amount = dsrHistFmtMoney(rawAmount);
  const future = dsrHistGet(storage, idx === 1 ? 'applyRateCheck' : `applyRateCheck${p}`) === 'true';
  const age = dsrHistGet(storage, idx === 1 ? 'ageInput' : `ageInput${p}`).trim();
  // 저장된 요율은 "(5.5%)" 또는 "5.5%" 형태일 수 있으므로 %/괄호를 제거한 뒤 한 번만 붙인다.
  const rate = dsrHistGet(storage, idx === 1 ? 'rateDisplay' : `rateDisplay${p}`)
    .replace(/[()%]/g, '')
    .trim();
  const memo = dsrHistGet(storage, idx === 1 ? 'baseIncomeMemo' : `incomeMemo${p}`).trim();
  const futureConverted = dsrHistGet(storage, idx === 1 ? 'computedIncomeHidden' : `computedIncomeHidden${p}`).trim();
  const label = isDeclare ? `소득${idx} (추정 - ${dtype})` : `소득${idx} (증빙)`;
  let html = '<div class="dsr-h-income-block">';
  html += `<div class="dsr-h-row"><span class="dsr-h-lbl">${label}</span><span class="dsr-h-val">${escapeHtml(amount || '미입력')} ${future ? '<span class="badge future">장래예상</span>' : ''}</span></div>`;
  if (future && (age || rate)) {
    html += `<div class="dsr-h-row"><span class="dsr-h-lbl">나이 / 요율</span><span class="dsr-h-val">${escapeHtml([age ? `${age}세` : '', rate ? `${rate}%` : ''].filter(Boolean).join(' · ') || '미입력')}</span></div>`;
  }
  if (future && (futureConverted || rawAmount)) {
    // 내부 장래예상효율은 118.41%처럼 "최종 적용 배율"로 저장되어 있다.
    // 따라서 75,000,000 × (118.41 / 100)으로 계산해야 하며, 1을 더하면 안 된다.
    const incomeNumber = Number(String(rawAmount || '').replace(/[^0-9.-]/g, ''));
    let rateNumber = Number(String(rate || '').replace(/[^0-9.-]/g, ''));
    // 예전 저장분에 요율이 없으면 저장된 나이로 내부 요율표에서 다시 찾는다.
    if (!Number.isFinite(rateNumber)) {
      const savedAgeRaw = age.replace(/[^0-9]/g, '');
      const savedAge = parseAgeInputValue(savedAgeRaw);
      const matchedRate = LOAN_RATE_TABLE.find(item => savedAge >= item.minAge && savedAge <= item.maxAge);
      if (matchedRate) rateNumber = Number(matchedRate.percent);
    }
    const calculatedFutureIncome = Number.isFinite(incomeNumber) && incomeNumber > 0 && Number.isFinite(rateNumber)
      ? Math.round(incomeNumber * rateNumber / 100)
      : dsrHistNum(futureConverted);
    const appliedVal = calculatedFutureIncome > 0
      ? dsrHistFmtMoney(String(calculatedFutureIncome))
      : dsrHistFmtMoney(futureConverted || rawAmount);
    html += `<div class="dsr-h-row"><span class="dsr-h-lbl">장래예상적용</span><span class="dsr-h-val dsr-h-future-val">${escapeHtml(appliedVal)}</span></div>`;
  }
  if (memo) html += `<div class="dsr-h-memo">${escapeHtml(memo)}</div>`;
  html += '</div>';
  return html;
}
function dsrHistLoanBlock(rows, idx) {
  const row = rows[idx];
  if (!row) return '';
  const tag = idx === 0 ? '본건' : `보유${idx}`;
  const bits = [];
  if (row.loanCategory === '연간원리금') {
    bits.push('연간원리금');
    if (row.annual) bits.push(`연 ${dsrHistFmtMoney(row.annual)}`);
    const excludeBadgeAnnual = row.exclude ? ' <span class="badge danger">계산제외</span>' : '';
    let annualHtml = '<div class="dsr-h-loan-block">';
    annualHtml += `<div class="dsr-h-loan-row"><span class="dsr-h-tag${idx === 0 ? ' primary' : ''}">${tag}</span><span>${escapeHtml(bits.join(' · '))}${excludeBadgeAnnual}</span></div>`;
    if (row.memo) annualHtml += `<div class="dsr-h-memo">${escapeHtml(row.memo)}</div>`;
    annualHtml += '</div>';
    return annualHtml;
  }
  if (row.amount) bits.push(dsrHistFmtMoney(row.amount));
  if (row.rate) bits.push(`${row.rate}%`);
  if (row.term) bits.push(`${row.term}개월`);
  if (row.repaymentType) bits.push(row.repaymentType);
  if (row.loanCategory && row.loanCategory !== '이자만') bits.push(row.loanCategory);
  if (row.graceCheck && row.graceTerm) bits.push(`거치 ${row.graceTerm}개월`);
  const excludeBadge = row.exclude ? ' <span class="badge danger">계산제외</span>' : '';
  let html = '<div class="dsr-h-loan-block">';
  html += `<div class="dsr-h-loan-row"><span class="dsr-h-tag${idx === 0 ? ' primary' : ''}">${tag}</span><span>${escapeHtml(bits.join(' · ') || '내용 없음')}${excludeBadge}</span></div>`;
  if (row.memo) html += `<div class="dsr-h-memo">${escapeHtml(row.memo)}</div>`;
  html += '</div>';
  return html;
}
/* ------------------- 저장 카드 글자 자동 축소 (줄바꿈 없이 폭에 맞춤) ------------------- */
function fitDsrHistoryRows() {
  // 펼쳐진(보이는) 카드의 행만 측정 가능하므로, 렌더 직후에는 열려 있는 카드만 맞추고
  // 나머지는 제목줄 클릭으로 펼쳐질 때 다시 맞춘다.
  document.querySelectorAll('.dsr-history-item.open').forEach(itemEl => {
    itemEl.querySelectorAll('.dsr-h-row, .dsr-history-item-title').forEach(row => {
      // 축소 적용 전에 초기화해야 다시 측정할 때 정확하다
      row.style.fontSize = '';
      row.querySelectorAll('.dsr-h-sub').forEach(el => el.style.fontSize = '');
      // 실제 가용 폭은 각 행의 부모(중첩 블록이면 그 블록) 기준으로 잰다
      const availW = row.parentElement ? row.parentElement.clientWidth : 0;
      if (!availW || row.scrollWidth <= availW) return;
      let size = parseFloat(getComputedStyle(row).fontSize);
      while (size > 7 && row.scrollWidth > availW) {
        size -= 0.5;
        row.style.fontSize = size + 'px';
        // 괄호 보조값은 본문보다 작게 유지
        row.querySelectorAll('.dsr-h-sub').forEach(el => el.style.fontSize = (size - 1) + 'px');
      }
    });
  });
}

/* 창 크기가 바뀌면 열려 있는 카드 글자 크기를 다시 맞춘다 */
window.addEventListener('resize', fitDsrHistoryRows);

function renderDsrHistoryList(filterText = '') {
  const listEl = document.getElementById('dsrHistoryList');
  if (!listEl) return;
  const items = getDsrHistoryItems();
  const normalized = (filterText || '').trim().toLowerCase();
  const filtered = normalized
    ? items.filter(item => (item.searchText || '').toLowerCase().includes(normalized))
    : items;
  if (!filtered.length) {
    listEl.innerHTML = '<div class="dsr-history-empty">저장된 항목이 없습니다. 현재 입력값을 저장하면 여기에 표시됩니다.</div>';
    return;
  }
  listEl.innerHTML = filtered.map((item, index) => {
    const storage = item.storage || {};
    const name = escapeHtml(storage.DSR_customerNameInput || '미입력');
    const phone = escapeHtml(storage.DSR_customerPhoneInput || '연락처 없음');
    const date = new Date(item.savedAt).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

    /* --- 고객정보 --- */
    let secCustomer = '';
    secCustomer += dsrHistRow('이름', storage.DSR_customerNameInput || '');
    secCustomer += dsrHistRow('연락처', storage.DSR_customerPhoneInput || '');
    secCustomer += dsrHistRow('중개업소', storage.DSR_customerBrokerInput || '');
    secCustomer += dsrHistRow('메모', storage.DSR_customerInfoMemo || '');

    /* --- 물건지정보 --- */
    let apt = null;
    try { apt = JSON.parse(storage.DSR_selectedAptInfo || 'null'); } catch (e) { apt = null; }
    let secProperty = '';
    if (apt && (apt.aptName || apt.address)) {
      const aptBits = [apt.aptName].filter(Boolean);
      if (apt.exclusiveSqm) aptBits.push(`${apt.exclusiveSqm}㎡`);
      else if (apt.pyeong) aptBits.push(`${apt.pyeong}평`);
      else if (apt.supplyPyeong) aptBits.push(`공급 ${apt.supplyPyeong}평`);
      // 둘 다 해당되면 투기과열만 표시하고, 조정지역만이면 규제 뱃지는 숨긴다.
      const regBadges = (apt.투기과열지구 ? ' <span class="badge danger">투기과열</span>' : '');
      // 뱃지는 HTML이므로 텍스트 부분만 이스케이프하고 뱃지는 그대로 넣는다 (dsrHistRow를 쓰면 뱃지가 이스케이프돼 태그가 그대로 보이는 문제)
      secProperty += `<div class="dsr-h-row"><span class="dsr-h-lbl">단지</span><span class="dsr-h-val">${escapeHtml(aptBits.join(' '))}${regBadges}</span></div>`;
      // 주소 뒤에 콤마를 붙인 뒤 동호수를 붙인다. 예: "팔달구 인계로 20, 100동 200호"
      if (apt.address) {
        let addrLine = String(apt.address || '').trim();
        const dong = String(apt.dong || '').trim();
        const ho = String(apt.ho || '').trim();
        const dongHo = [dong ? `${/\d$/.test(dong) ? dong + '동' : dong}` : '', ho ? `${/\d$/.test(ho) ? ho + '호' : ho}` : ''].filter(Boolean).join(' ');
        if (dongHo) addrLine = (addrLine ? `${addrLine}, ` : '') + dongHo;
        secProperty += dsrHistRow('주소', addrLine);
      }
    }
    secProperty += dsrHistRow('KB시세', dsrHistFmtMoney(storage.DSR_ltvMarketPriceInput));
    /* LTV 행: 라벨은 비율만(LTV 70%), 값은 [LTV비율 - 소액임차] 계산 금액 */
    const ltvRate = dsrHistGet(storage, 'radio_ltv_rate') || '70';
    const ltvCalcVal = dsrHistLtvCalc(storage);
    secProperty += dsrHistRow(`LTV ${ltvRate}%`, ltvCalcVal);
    let mortgageRows = [];
    try { mortgageRows = JSON.parse(storage.DSR_mortgageData || '[]') || []; } catch (e) { mortgageRows = []; }
    const firstMortAmt = dsrHistFmtMoney((mortgageRows[0] || {}).amount || '');
    /* 본건신청금액 옆 괄호: [LTV비율 - 소액임차] 계산값 */
    const ltvMaxParen = ltvCalcVal
      ? ` <span class="dsr-h-sub">( ${ltvCalcVal} )</span>` : '';
    secProperty += `<div class="dsr-h-row"><span class="dsr-h-lbl">본건신청금액</span><span class="dsr-h-val">${escapeHtml(firstMortAmt || '미입력')}${ltvMaxParen}</span></div>`;
    secProperty += dsrHistRow('잔금일자', storage.DSR_propertySettlementDate || '');
    secProperty += dsrHistRow('메모', storage.DSR_propertyInfoMemo || '');


    /* --- 소득정보 --- */
    let extraIdx = [];
    try { extraIdx = JSON.parse(storage.DSR_incomeRowIndexes || '[]') || []; } catch (e) { extraIdx = []; }
    const totalIncome = dsrHistFmtMoney(storage.DSR_totalIncomeOutput);
    let secIncome = dsrHistIncomeBlock(storage, 1);
    extraIdx.forEach(idx => { secIncome += dsrHistIncomeBlock(storage, idx); });

    /* --- 대출정보 (제목줄에 DSR/DTI/신DTI) --- */
    const dsrVal = (storage.DSR_DSR확인 || '').trim();
    const dtiVal = (storage.DSR_DIT확인 || '').trim();
    const newDtiVal = (storage.DSR_신DTI확인 || '').trim();
    const heldLoanCount = mortgageRows.filter(r => r.loanCategory === '주담대').length;
    const loanHeaderParts = [];
    if (dsrVal && dsrVal !== '-') loanHeaderParts.push(`DSR ${dsrVal}`);
    if (dtiVal && dtiVal !== '-') loanHeaderParts.push(`DTI ${dtiVal}`);
    // 신DTI는 주담대 2건 이상일 때만 의미가 있다.
    if (heldLoanCount >= 2 && newDtiVal && newDtiVal !== '-') loanHeaderParts.push(`신DTI ${newDtiVal}`);
    const loanHeader = loanHeaderParts.length
      ? `<span class="dsr-h-sec-h-right">${escapeHtml(loanHeaderParts.join(' | '))}</span>` : '';
    let secLoan = '';
    if (mortgageRows.length) {
      mortgageRows.forEach((row, i) => { secLoan += dsrHistLoanBlock(mortgageRows, i); });
    } else {
      secLoan += dsrHistRow('대출', '', true);
    }

    /* --- 결과 --- */
    let secResult = '<div class="dsr-h-kpi-row">';
    secResult += `<div class="dsr-h-kpi"><div class="dsr-h-k">DSR</div><div class="dsr-h-v">${escapeHtml(dsrVal || '-')}</div></div>`;
    secResult += `<div class="dsr-h-kpi"><div class="dsr-h-k">DTI</div><div class="dsr-h-v">${escapeHtml(dtiVal || '-')}</div></div>`;
    // 신DTI는 주담대 2건 이상일 때만 표시한다.
    const showNewDtiKpi = heldLoanCount >= 2;
    if (showNewDtiKpi) {
      secResult += `<div class="dsr-h-kpi"><div class="dsr-h-k">신DTI</div><div class="dsr-h-v">${escapeHtml(newDtiVal || '-')}</div></div>`;
    }
    secResult += '</div>';
    secResult += '<div class="dsr-h-kpi-row" style="margin-top:6px;">';
    secResult += `<div class="dsr-h-kpi"><div class="dsr-h-k">최대 원리금</div><div class="dsr-h-v">${escapeHtml(storage.DSR_dsrMax_원리금 || '-')}</div></div>`;
    secResult += `<div class="dsr-h-kpi"><div class="dsr-h-k">최대 원금</div><div class="dsr-h-v">${escapeHtml(storage.DSR_dsrMax_원금 || '-')}</div></div>`;
    secResult += '</div>';

    return `
      <div class="dsr-history-item" data-index="${index}">
        <div class="dsr-history-item-meta">
          <span>${date}</span>
          <button type="button" class="dsr-history-load-btn" data-index="${index}">불러오기</button>
        </div>
        <div class="dsr-history-item-title dsr-history-toggle">
          <span><span class="name">${name}</span><span class="dsr-history-item-phone"> ( ${phone} )</span></span>
          <span class="dsr-h-caret-wrap"><span class="dsr-h-caret-label">펼치기</span><span class="dsr-h-caret">▾</span></span>
        </div>
        <div class="dsr-history-body">
          <div class="dsr-h-sec">
            <div class="dsr-h-sec-h">👤 고객정보</div>
            <div class="dsr-h-sec-rows">${secCustomer}</div>
          </div>
          <div class="dsr-h-sec">
            <div class="dsr-h-sec-h">🏢 물건지정보</div>
            <div class="dsr-h-sec-rows">${secProperty}</div>
          </div>
          <div class="dsr-h-sec">
            <div class="dsr-h-sec-h">💰 소득정보${totalIncome ? `<span class="dsr-h-sec-h-right">합산 ${totalIncome}</span>` : ''}</div>
            <div class="dsr-h-sec-rows">${secIncome}</div>
          </div>
          <div class="dsr-h-sec">
            <div class="dsr-h-sec-h">🏦 대출정보${loanHeader}</div>
            <div class="dsr-h-sec-rows">${secLoan}</div>
          </div>
          <div class="dsr-h-sec">
            <div class="dsr-h-sec-h">📊 결과</div>
            <div class="dsr-h-sec-rows">${secResult}</div>
          </div>
        </div>
      </div>
    `;
  }).join('');
  // 제목줄(이름/연락처) 클릭 → 내용 펼침/접힘 + 라벨 토글
  listEl.querySelectorAll('.dsr-history-toggle').forEach(toggleEl => {
    toggleEl.addEventListener('click', () => {
      const itemEl = toggleEl.closest('.dsr-history-item');
      const isOpen = itemEl.classList.toggle('open');
      const labelEl = toggleEl.querySelector('.dsr-h-caret-label');
      if (labelEl) labelEl.textContent = isOpen ? '접기' : '펼치기';
      if (isOpen) requestAnimationFrame(fitDsrHistoryRows);
    });
  });
  // 이미 펼쳐져 있는 카드는 화면 폭에 맞게 글자를 축소한다
  requestAnimationFrame(fitDsrHistoryRows);
  // 불러오기 버튼 → 저장값 복원 (기존 동작 유지)
  listEl.querySelectorAll('.dsr-history-load-btn').forEach(loadBtn => {
    loadBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = Number(loadBtn.dataset.index);
      const itemsAfterFilter = normalized ? filtered : getDsrHistoryItems();
      const snapshot = itemsAfterFilter[idx];
      if (!snapshot) return;
      loadDsrSnapshotIntoForm(snapshot.storage || {});
      if (typeof openAllInfoTabs === 'function') openAllInfoTabs();
      showBubble('저장된 내용을 불러왔습니다.');
      closeDsrHistoryModal();
    });
  });
}

function openDsrHistoryModal() {
  const modal = document.getElementById('dsrHistoryModal');
  if (!modal) return;
  renderDsrHistoryList();
  modal.style.display = 'flex';
}

function closeDsrHistoryModal() {
  const modal = document.getElementById('dsrHistoryModal');
  if (modal) modal.style.display = 'none';
}

function initDsrHistoryModal() {
  const saveBtn = document.getElementById('dsrSaveBtn');
  const loadBtn = document.getElementById('dsrLoadBtn');
  const closeBtn = document.getElementById('closeDsrHistoryBtn');
  const searchInput = document.getElementById('dsrHistorySearch');
  const clearBtn = document.getElementById('clearDsrHistorySearchBtn');

  if (saveBtn) saveBtn.addEventListener('click', saveDsrHistoryItem);
  if (loadBtn) loadBtn.addEventListener('click', openDsrHistoryModal);
  if (closeBtn) closeBtn.addEventListener('click', closeDsrHistoryModal);
  if (searchInput) {
    searchInput.addEventListener('input', function () {
      renderDsrHistoryList(this.value);
    });
  }
  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      if (searchInput) {
        searchInput.value = '';
        renderDsrHistoryList('');
      }
    });
  }
  const modal = document.getElementById('dsrHistoryModal');
  if (modal) {
    modal.addEventListener('click', function (event) {
      if (event.target === modal) closeDsrHistoryModal();
    });
  }
}

function saveDSRInputs() {
  // 복원(불러오기) 중에는 자동저장 금지 - 복원 이벤트로 인해 이전 화면 상태가
  // 저장 키를 덮어써 불러온 스냅샷이 파괴되는 것을 방지한다.
  if (__dsrRestoring) return;
  // 구분값은 일반 입력 selector에 포함되지 않으므로 저장 시 명시적으로 보장한다.
  const category = document.getElementById('propertyCategoryBtn')?.textContent?.trim();
  const currentLoanType = consultLocalStorage.getItem('DSR_propertyLoanType')
    || (category === '담보' ? '담보' : '전세');
  const currentGuarantee = consultLocalStorage.getItem('DSR_propertyJeonseGuarantee') || '';
  consultLocalStorage.setItem('DSR_propertyLoanType', currentLoanType);
  consultLocalStorage.setItem('DSR_propertyJeonseGuarantee', currentGuarantee);
  consultLocalStorage.setItem('DSR_selectedAptInfo', selectedAptInfo ? JSON.stringify(selectedAptInfo) : '');
  document.querySelectorAll(TEXT_NUMBER_INPUT_SELECTOR).forEach(input => {
    if (input.id) consultLocalStorage.setItem(`DSR_${input.id}`, input.value);
  });
  document.querySelectorAll(CHECKBOX_INPUT_SELECTOR).forEach(checkbox => {
    if (checkbox.id) consultLocalStorage.setItem(`DSR_${checkbox.id}`, checkbox.checked);
  });
  // 증빙/신고 및 카드·건강·연금 선택 상태도 함께 저장 (새로고침 후에도 환산 금액이 바로 계산되도록)
  const saveRadioAndAmounts = (modeName, typeName, amountKey, amounts) => {
    const modeChecked = document.querySelector(`input[name="${modeName}"]:checked`);
    if (modeChecked) consultLocalStorage.setItem(`DSR_radio_${modeName}`, modeChecked.value);
    const typeChecked = document.querySelector(`input[name="${typeName}"]:checked`);
    if (typeChecked) consultLocalStorage.setItem(`DSR_radio_${typeName}`, typeChecked.value);
    // 추정(카드/건보/연금) 버튼별 입력 금액을 각각 따로 저장 (공용 입력창 하나를 돌려쓰기 때문에 종류별로 키를 분리해야 함)
    ['카드', '건강', '연금'].forEach(type => {
      consultLocalStorage.setItem(`DSR_declareAmt_${amountKey}_${type}`, amounts[type] || 0);
    });
  };
  saveRadioAndAmounts('base_income_mode', 'base_declare_type', 'base', memoBaseDeclareAmounts);
  const extraIdx = extraIncomeRowIndexes();
  extraIdx.forEach(idx => {
    saveRadioAndAmounts(`income_mode_${idx}`, `declare_type_${idx}`, String(idx), incomeRowState.get(idx).memoDeclareAmounts);
  });
  // 새로고침 시 어떤 인덱스의 소득 행을 다시 만들어야 하는지 저장 (개별 삭제로 인덱스에 구멍이 생길 수 있어 개수 대신 목록으로 저장)
  setStoredJson('DSR_incomeRowIndexes', extraIdx);
  saveMortgageRows();
}

function saveMortgageRows() {
  const rows = document.querySelectorAll('#mortgage-inputs .mortgage-row');
  const mortgageData = [];

  rows.forEach(row => {
    const rowData = {
      amount: row.querySelector('.mort-amt')?.value || '',
      rate: row.querySelector('.mort-rate')?.value || '',
      stRate: row.querySelector('.mort-st-rate')?.value || '',
      term: row.querySelector('.mort-term')?.value || '',
      annual: row.querySelector('.mort-annual')?.value || '',
      repaymentType: row.querySelector('.mort-type')?.value || '원리금',
      loanCategory: row.querySelector('.mort-loan-category')?.value || (row.classList.contains('first-row') ? '주담대' : '신용대'),
      graceCheck: row.querySelector('.mort-grace-check')?.checked || false,
      graceTerm: row.querySelector('.mort-grace-term')?.value || '',
      memo: row.nextElementSibling?.classList.contains('mortgage-memo-row')
        ? (row.nextElementSibling.querySelector('.mort-memo')?.value || '')
        : '',
      needDate: row.nextElementSibling?.classList.contains('mortgage-memo-row')
        ? (row.nextElementSibling.querySelector('.mort-need-date')?.value || '')
        : ''
    };
    mortgageData.push(rowData);
  });

  setStoredJson('DSR_mortgageData', mortgageData);
}

function loadDSRInputs() {
  selectedAptInfo = getStoredJson('DSR_selectedAptInfo', null);
  renderSelectedAptRow();

  // 불러오기/복원 시 기존에 화면에 남아있던 소득 추가행이 다시 쌓이지 않도록 먼저 정리한다.
  resetExtraIncomeRowsForRestore();

  // "소득 추가"로 늘어났던 행들을 먼저 원래 인덱스 그대로 다시 만들어둬야, 그 안의 입력값들이
  // 아래 일반 복원 루프(TEXT_NUMBER_INPUT_SELECTOR)에서 정상적으로 걸린다.
  getStoredJson('DSR_incomeRowIndexes', []).forEach(idx => 소득행추가(idx));

  document.querySelectorAll(TEXT_NUMBER_INPUT_SELECTOR).forEach(input => {
    if (input.id) {
      const savedValue = consultLocalStorage.getItem(`DSR_${input.id}`);
      if (savedValue !== null) {
        setRestoredInputValue(input, savedValue);
        if (input.tagName === 'TEXTAREA') autoResizeMemoTextarea(input);
        if (input.id === 'baseIncomeInput') {
          memoBaseIncome = parseFloat(savedValue.replace(/\D/g, '')) || 0;
          memoBaseIncomeDirect = memoBaseIncome; // applyBaseIncomeMode()가 증빙 모드로 되돌릴 때 이 값을 기준으로 삼음
        }
        const extraMatch = input.id.match(/^incomeInput_(\d+)$/);
        if (extraMatch) {
          const st = incomeRowState.get(parseInt(extraMatch[1], 10));
          if (st) {
            st.memoIncome = parseFloat(savedValue.replace(/\D/g, '')) || 0;
            st.memoIncomeDirect = st.memoIncome; // applyIncomeRowMode()가 증빙 모드로 되돌릴 때 이 값을 기준으로 삼음
          }
        }
        // 카드/건강/연금 금액 입력창(공용 필드)의 값은 아래 별도 로직에서
        // 종류별로 복원하므로, 여기서는 화면 표시값만 그대로 둔다.
      }
    }
  });

  document.querySelectorAll(CHECKBOX_INPUT_SELECTOR).forEach(checkbox => {
    if (checkbox.id) {
      const savedValue = consultLocalStorage.getItem(`DSR_${checkbox.id}`);
      if (savedValue !== null) {
        setRestoredCheckboxValue(checkbox, savedValue === 'true');
      }
    }
  });

  // 증빙/신고 및 카드·건강·연금 선택 상태 + 종류별 금액 복원 (소득1 / 소득N 공용)
  const restoreRadioAndAmounts = (modeName, typeName, amountKey, amounts, setMode, setType) => {
    const savedMode = consultLocalStorage.getItem(`DSR_radio_${modeName}`);
    if (savedMode !== null) {
      const radio = document.querySelector(`input[name="${modeName}"][value="${savedMode}"]`);
      if (radio) setRestoredCheckboxValue(radio, true, true);
    }
    const savedType = consultLocalStorage.getItem(`DSR_radio_${typeName}`);
    if (savedType !== null) {
      const radio = document.querySelector(`input[name="${typeName}"][value="${savedType}"]`);
      if (radio) setRestoredCheckboxValue(radio, true, true);
    }
    ['카드', '건강', '연금'].forEach(type => {
      const saved = consultLocalStorage.getItem(`DSR_declareAmt_${amountKey}_${type}`);
      if (saved !== null) amounts[type] = parseFloat(saved) || 0;
    });
    const modeChecked = document.querySelector(`input[name="${modeName}"]:checked`);
    if (modeChecked) setMode(modeChecked.value);
    const typeChecked = document.querySelector(`input[name="${typeName}"]:checked`);
    if (typeChecked) setType(typeChecked.value);
  };

  restoreRadioAndAmounts('base_income_mode', 'base_declare_type', 'base', memoBaseDeclareAmounts,
    (v) => { baseIncomeMode = v; }, (v) => { baseDeclareType = v; });
  extraIncomeRowIndexes().forEach(idx => {
    const st = incomeRowState.get(idx);
    if (!st) return;
    restoreRadioAndAmounts(`income_mode_${idx}`, `declare_type_${idx}`, String(idx), st.memoDeclareAmounts,
      (v) => { st.mode = v; }, (v) => { st.declareType = v; });
  });

  loadMortgageRows();

  // 새로고침 복원 직후에는 각 행의 select 표기와 내부값(.mort-loan-category)을 한 번 더 맞춘다.
  document.querySelectorAll('#mortgage-inputs .mortgage-row').forEach(row => {
    const catInput = row.querySelector('.mort-loan-category');
    const catSelect = row.querySelector('.mort-category-select');
    if (catInput && catSelect && VALID_LOAN_CATEGORIES.includes(catInput.value)) {
      catSelect.value = catInput.value;
    }
  });

  // 복원 직후 값은 자동 input/change 이벤트가 발생하지 않으므로,
  // 상태가 보이는 값과 계산 값을 함께 한 번 다시 적용해야 한다.
  if (typeof refreshRadioToggleStyles === 'function') {
    refreshRadioToggleStyles('#baseIncomeModeToggle');
    refreshRadioToggleStyles('#baseDeclareTypeToggle');
  }
  if (typeof applyBaseIncomeMode === 'function') applyBaseIncomeMode();
  extraIncomeRowIndexes().forEach(idx => {
    const st = incomeRowState.get(idx);
    if (!st) return;
    if (typeof refreshRadioToggleStyles === 'function') {
      refreshRadioToggleStyles(`#incomeModeToggle_${idx}`);
      refreshRadioToggleStyles(`#declareTypeToggle_${idx}`);
    }
    if (typeof applyIncomeRowMode === 'function') applyIncomeRowMode(idx);
  });
  if (typeof updateIncomeCalc === 'function') updateIncomeCalc();
  if (typeof 자동계산 === 'function') 자동계산();

  // 저장된 값으로 복원한 뒤에는 input 이벤트가 자동으로 발생하지 않으므로,
  // 제목줄 요약 텍스트를 직접 한 번 갱신해줘야 탭 헤더가 즉시 반영된다.
  if (typeof updateCustomerInfoSummary === 'function') updateCustomerInfoSummary();
  if (typeof updateIncomeInfoSummary === 'function') updateIncomeInfoSummary();
  if (typeof updatePropertyInfoSummary === 'function') updatePropertyInfoSummary();
  if (typeof updateLoanInfoSummary === 'function') updateLoanInfoSummary();
  if (typeof updateDsrInfoSummary === 'function') updateDsrInfoSummary();

  // 복원된 DSR_propertyLoanType/보증값을 기준으로 구분 UI와 전세 분기를 다시 적용한다.
  // 이 이벤트는 "복원"에 따른 것이므로, 리스너가 본건 금리·ST금리·기간을 기본값으로
  // 덮어쓰지 않도록 복원 플래그를 세운 상태에서 보낸다.
  const prevRestoringForEvents = __dsrRestoring;
  __dsrRestoring = true;
  try {
    window.dispatchEvent(new CustomEvent('consultLoanTypeChanged'));
    window.dispatchEvent(new CustomEvent('housingStatusChanged'));
  } finally {
    __dsrRestoring = prevRestoringForEvents;
  }
}

function loadMortgageRows() {
  const mortgageData = getStoredJson('DSR_mortgageData');
  if (!Array.isArray(mortgageData)) return;

  // 행을 새로 만들면서 주담대행추가()가 첫 행에 기본값을 넣지 않도록 복원 중으로 표시한다.
  // (아래에서 저장된 금리·ST금리·기간을 그대로 덮어쓴다)
  const prevRestoring = __dsrRestoring;
  __dsrRestoring = true;
  try {
    const tbody = document.getElementById('mortgage-inputs');
    if (!tbody) return;

    tbody.querySelectorAll('.mortgage-row, .mortgage-memo-row').forEach(row => row.remove());
    mortCount = 0;

    mortgageData.forEach(rowData => {
      주담대행추가();

      const rows = tbody.querySelectorAll('.mortgage-row');
      const currentRow = rows[rows.length - 1];

      if (currentRow) {
        const amount = currentRow.querySelector('.mort-amt');
        const rate = currentRow.querySelector('.mort-rate');
        const stRate = currentRow.querySelector('.mort-st-rate');
        const term = currentRow.querySelector('.mort-term');
        const repaymentType = currentRow.querySelector('.mort-type');
        const loanCategory = currentRow.querySelector('.mort-loan-category');
        const graceCheck = currentRow.querySelector('.mort-grace-check');
        const graceTerm = currentRow.querySelector('.mort-grace-term');
        const annual = currentRow.querySelector('.mort-annual');

        if (annual) annual.value = rowData.annual || '';
        if (amount) amount.value = rowData.amount;
        if (rate) rate.value = rowData.rate;
        if (stRate) stRate.value = rowData.stRate;
        if (term) term.value = rowData.term;
        if (repaymentType) repaymentType.value = rowData.repaymentType;
        const isFirstRow = currentRow.classList.contains('first-row');
        const defaultCategory = isFirstRow ? '주담대' : '신용대';
        // 새로고침 복원: 저장된 드롭다운 값을 그대로 되살린다.
        //  [2026-11-11 수정] '원리금'은 이제 정식 옵션이므로 '신용대'로 바꾸지 않는다.
        //  (예전에는 원리금→신용대 로 매핑해서, 본건에서 원리금이 풀리는 원인이었다)
        //  예전 버전 호환으로 '전세'만 '전세대'로 바꿔준다.
        const LEGACY_CATEGORY_MAP = { '전세': '전세대' };
        const restoredCategory = LEGACY_CATEGORY_MAP[rowData.loanCategory] || rowData.loanCategory;
        let storedCategory = VALID_LOAN_CATEGORIES.includes(restoredCategory)
          ? restoredCategory
          : defaultCategory;
        // 본건 행은 주담대·전세대·원리금만 있으므로, 그 외 값은 주담대로 보정한다.
        if (isFirstRow && !FIRST_ROW_LOAN_CATEGORIES.includes(storedCategory)) {
          storedCategory = '주담대';
        }
        if (loanCategory) loanCategory.value = storedCategory;
        if (graceCheck) graceCheck.checked = rowData.graceCheck;
        if (graceTerm) graceTerm.value = rowData.graceTerm;

        const memoRow = currentRow.nextElementSibling;
        if (memoRow && memoRow.classList.contains('mortgage-memo-row')) {
          const memoInput = memoRow.querySelector('.mort-memo');
          if (memoInput) { memoInput.value = rowData.memo || ''; autoResizeMemoTextarea(memoInput); }
          const needDateInput = memoRow.querySelector('.mort-need-date');
          if (needDateInput) needDateInput.value = rowData.needDate || '';
        }

        const typeButtons = currentRow.querySelectorAll('.type-btn');
        typeButtons.forEach(btn => btn.classList.remove('active'));
        if (rowData.repaymentType === '원리금') typeButtons[0]?.classList.add('active');
        else if (rowData.repaymentType === '원금') typeButtons[1]?.classList.add('active');
        else if (rowData.repaymentType === '만기') typeButtons[2]?.classList.add('active');

        const categorySelect = currentRow.querySelector('.mort-category-select');
        if (categorySelect) {
          categorySelect.value = storedCategory;
          categorySelect.dataset.cat = storedCategory;
        }
        applyAnnualRepaymentMode(currentRow);
        applyJeonseRowLayout(currentRow);
        // 복원 후 상환방식 표시(칩 문구·버튼 active)를 저장된 값과 맞춘다.
        const restoreTrigger = currentRow.querySelector('.type-btn-trigger');
        if (restoreTrigger) {
          const activeBtn = currentRow.querySelector('.type-btn.active');
          if (activeBtn) restoreTrigger.textContent = activeBtn.textContent.trim();
        }
        const reductionButton = memoRow?.querySelector('.mort-reduction-btn');
        if (reductionButton) reductionButton.hidden = true;

        // 본건 행: 마지막으로 선택했던 금리 프로필(6M/5Y)도 함께 복원한다.
        // (프로필 버튼 표시만 맞추고, 금리·ST·기간은 위에서 저장값을 그대로 넣었으므로 건드리지 않는다)
        if (isFirstRow) {
          const savedProfile = consultLocalStorage.getItem('DSR_firstRowProfile') || '6M';
          const profileInput = currentRow.querySelector('.mort-default-profile');
          if (profileInput) profileInput.value = savedProfile;
          const profileSwitch = currentRow.querySelector('.mort-default-switch');
          if (profileSwitch) {
            const isJeonseProfile = consultLocalStorage.getItem('DSR_propertyLoanType') === '전세';
            const secondProfile = isJeonseProfile ? '2Y' : '5Y';
            const shownProfile = savedProfile === '5Y' && isJeonseProfile ? '2Y' : savedProfile;
            profileSwitch.dataset.profile = shownProfile;
            profileSwitch.classList.toggle('active', shownProfile === secondProfile);
            profileSwitch.querySelectorAll('.switch-label').forEach((label, index) => {
              label.textContent = index === 0 ? '6M' : secondProfile;
              label.classList.toggle('active', index === 0 ? shownProfile === '6M' : shownProfile === secondProfile);
            });
          }
        }
      }
    });
  } catch (e) {
    console.warn('Failed to load mortgage data:', e);
  } finally {
    __dsrRestoring = prevRestoring;
  }
}

/* -------------------- 저장/불러오기 슬롯 (1/2/3번 버튼) --------------------
   버튼을 길게 누르면(0.7초) 지금 입력된 모든 내용을 그 번호에 저장하고,
   짧게 누르면 그 번호에 저장된 내용을 불러온다. 화면에 이미 뭔가 입력돼 있으면
   불러오기 전에 덮어쓸지 한 번 물어본다. */
const SLOT_SAVE_LONG_PRESS_MS = 700;
const DSR_SLOT_PREFIX = 'DSR_SLOT_';

function formHasContent() {
  const hasTextValue = [...document.querySelectorAll(TEXT_NUMBER_INPUT_SELECTOR)]
    .some(el => el.value && el.value.trim() !== '');
  const hasExtraIncomeRows = extraIncomeRowIndexes().length > 0;
  const hasExtraLoanRows = document.querySelectorAll('#mortgage-inputs .mortgage-row').length > 1;
  return hasTextValue || hasExtraIncomeRows || hasExtraLoanRows;
}

function refreshSlotButtonStates() {
  document.querySelectorAll('.slot-btn').forEach(btn => {
    const n = btn.dataset.slot;
    btn.classList.toggle('slot-has-data', !!consultLocalStorage.getItem(`${DSR_SLOT_PREFIX}${n}`));
  });
}

function saveFormToSlot(n) {
  saveDSRInputs(); // 지금 상태를 최신 DSR_* 키에 우선 반영
  const snapshot = {};
  consultStorageKeys().forEach(key => {
    if (key.startsWith('DSR_') && !key.startsWith(DSR_SLOT_PREFIX)) {
      snapshot[key] = consultLocalStorage.getItem(key);
    }
  });
  setStoredJson(`${DSR_SLOT_PREFIX}${n}`, snapshot);
  showBubble(`${n}번에 저장되었습니다`);
  refreshSlotButtonStates();
}

// init()이 새로고침 시 하는 순서와 동일하게, 저장된 스냅샷 기준으로 화면을 다시 그린다.
function applySlotSnapshot(n) {
  const raw = consultLocalStorage.getItem(`${DSR_SLOT_PREFIX}${n}`);
  if (!raw) { showBubble(`${n}번에 저장된 내용이 없습니다`); return; }
  let snapshot;
  try {
    snapshot = JSON.parse(raw);
  } catch (e) {
    showBubble('저장된 데이터를 불러올 수 없습니다');
    return;
  }

  if (!consultLocalStorage.getItem('DSR_mortgageData') || consultLocalStorage.getItem('DSR_mortgageData') === '[]') {
    주담대행추가();
  }
  loadDsrSnapshotIntoForm(snapshot);
  showBubble(`${n}번 저장 내용을 불러왔습니다`);
}

function loadFormFromSlot(n) {
  if (!consultLocalStorage.getItem(`${DSR_SLOT_PREFIX}${n}`)) {
    showBubble(`${n}번에 저장된 내용이 없습니다`);
    return;
  }
  if (formHasContent()) {
    if (confirm('입력창에 내용이 남아있습니다. 덮어씌울까요?')) applySlotSnapshot(n);
  } else {
    applySlotSnapshot(n);
  }
}

function initSlotButtons() {
  document.querySelectorAll('.slot-btn').forEach(btn => {
    const n = btn.dataset.slot;
    let timer = null;
    let longPressFired = false;

    const start = () => {
      if (timer) clearTimeout(timer);
      longPressFired = false;
      btn.classList.add('slot-saving');
      timer = setTimeout(() => {
        longPressFired = true;
        timer = null;
        btn.classList.remove('slot-saving');
        saveFormToSlot(n);
        if (navigator.vibrate) navigator.vibrate(25);
      }, SLOT_SAVE_LONG_PRESS_MS);
    };
    const cancel = () => {
      if (timer) { clearTimeout(timer); timer = null; }
      btn.classList.remove('slot-saving');
    };

    btn.addEventListener('mousedown', start);
    btn.addEventListener('touchstart', start, { passive: true });
    btn.addEventListener('mouseup', cancel);
    btn.addEventListener('mouseleave', cancel);
    btn.addEventListener('touchend', cancel, { passive: true });
    btn.addEventListener('touchcancel', cancel, { passive: true });

    btn.addEventListener('click', () => {
      if (longPressFired) {
        longPressFired = false;
        return;
      }
      loadFormFromSlot(n);
    });
  });
  refreshSlotButtonStates();
}

function setupDSRAutoSave() {
  // 요소별 리스너 방식은 setup 시점에 존재하는 입력창에만 붙으므로,
  // 이후 "소득 추가"/"대출 추가"로 만들어진 행의 입력값은 저장되지 않았다.
  // 문서 레벨 이벤트 위임으로 바꿔 나중에 추가된 입력창/라디오도 모두 자동저장되게 한다.
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (!t || t.disabled || t.readOnly) return;
    if ((t.tagName === 'INPUT' && (t.type === 'text' || t.type === 'number')) || t.tagName === 'TEXTAREA') {
      saveDSRInputs();
    }
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (!t || t.disabled) return;
    // 텍스트/숫자/textarea의 change도 저장 (input 이벤트 없이 값이 채워지는 케이스 대비)
    if ((t.tagName === 'INPUT' && (t.type === 'text' || t.type === 'number')) || t.tagName === 'TEXTAREA') {
      saveDSRInputs();
      return;
    }
    // 체크박스 + 증빙/신고·카드/건보/연금 등 모든 라디오 선택 상태 저장
    if (t.tagName === 'INPUT' && (t.type === 'checkbox' || t.type === 'radio')) {
      saveDSRInputs();
    }
  });
}

/* -------------------- 테이블 롱프레스 드래그 재배치 --------------------
   저장 키를 DSR_ 접두사 없이 따로 둔다 - 선택초기화()/소득1초기화() 등 기존 초기화 로직이
   DSR_ 접두사가 붙은 키만 개별적으로 지우므로, 테이블 배치 순서는 그 영향을 받지 않고
   새로고침 후에도 그대로 유지된다. */
const TABLE_ORDER_STORAGE_KEY = 'dsrTableLayoutOrder';

function applySavedTableLayoutOrder() {
  const area = document.getElementById('capture-area');
  if (!area) return;
  const saved = getStoredJson(TABLE_ORDER_STORAGE_KEY, null);
  if (!Array.isArray(saved) || !saved.length) return;
  saved.forEach(key => {
    const wrap = area.querySelector(`:scope > .dsr-table-wrap[data-table-key="${key}"]`);
    if (wrap) area.appendChild(wrap);
  });
}

function saveCurrentTableLayoutOrder() {
  const area = document.getElementById('capture-area');
  if (!area) return;
  const order = [...area.querySelectorAll(':scope > .dsr-table-wrap[data-table-key]')].map(w => w.dataset.tableKey);
  setStoredJson(TABLE_ORDER_STORAGE_KEY, order);
}

// 1.시세입력 2.DSR선택 3.소득입력 4.DSR값표시 5.대출정보입력 6.상환스케줄표
const TABLE_ORDER_NUMBER_TO_KEY = {
  1: 'ltv',
  2: 'dsr-limit',
  3: 'income',
  4: 'dsr-dti',
  5: 'loan',
  6: 'schedule',
};
const TABLE_ORDER_KEY_TO_NUMBER = Object.fromEntries(
  Object.entries(TABLE_ORDER_NUMBER_TO_KEY).map(([num, key]) => [key, Number(num)])
);

const TABLE_ORDER_SHORT_LABELS = {
  'ltv': '시세',
  'dsr-limit': 'DSR%',
  'income': '소득',
  'dsr-dti': 'DSR값',
  'loan': '대출',
  'schedule': '스케줄',
};

let tableOrderSelectedKey = null;

// 지금 화면에 실제로 놓인 순서 그대로 버튼 6개를 다시 그린다 (선택된 버튼은 강조 표시)
function renderTableOrderButtons() {
  const row = document.getElementById('tableOrderBtnRow');
  const area = document.getElementById('capture-area');
  if (!row || !area) return;
  const keys = [...area.querySelectorAll(':scope > .dsr-table-wrap[data-table-key]')].map(w => w.dataset.tableKey);
  row.innerHTML = keys.map(key => `
    <button type="button" class="table-order-btn${key === tableOrderSelectedKey ? ' selected' : ''}" onclick="handleTableOrderBtnClick('${key}')">
      <span class="table-order-btn-num">${TABLE_ORDER_KEY_TO_NUMBER[key]}</span>
      <span class="table-order-btn-label">${TABLE_ORDER_SHORT_LABELS[key]}</span>
    </button>
  `).join('');
}

// 버튼 하나를 누르면 선택, 다른 버튼을 이어서 누르면 두 표의 자리를 서로 맞바꾼다
function handleTableOrderBtnClick(key) {
  if (tableOrderSelectedKey === null) {
    tableOrderSelectedKey = key;
    renderTableOrderButtons();
    return;
  }
  if (tableOrderSelectedKey === key) {
    tableOrderSelectedKey = null;
    renderTableOrderButtons();
    return;
  }

  const area = document.getElementById('capture-area');
  const wrapA = area.querySelector(`:scope > .dsr-table-wrap[data-table-key="${tableOrderSelectedKey}"]`);
  const wrapB = area.querySelector(`:scope > .dsr-table-wrap[data-table-key="${key}"]`);
  if (wrapA && wrapB) {
    const nextA = wrapA.nextSibling;
    const nextB = wrapB.nextSibling;
    if (nextA === wrapB) {
      area.insertBefore(wrapB, wrapA);
    } else if (nextB === wrapA) {
      area.insertBefore(wrapA, wrapB);
    } else {
      area.insertBefore(wrapA, nextB);
      area.insertBefore(wrapB, nextA);
    }
    saveCurrentTableLayoutOrder();
    showBubble('테이블 순서가 적용되었습니다');
  }

  tableOrderSelectedKey = null;
  renderTableOrderButtons();
}

function init() {
  // 테이블 순서를 최종 배치(6,1,2,4,3,5)로 HTML에 직접 고정해서, 순서 선택기(테스트용)는
  // 지금은 꺼둔다 - 나중에 다시 실험하려면 이 두 줄만 살리면 된다 (선택기 HTML은 Consult_Main.html에 주석으로 남아있음).
  // applySavedTableLayoutOrder();
  // renderTableOrderButtons();
  if (!consultLocalStorage.getItem('DSR_mortgageData') || consultLocalStorage.getItem('DSR_mortgageData') === "[]") {
    주담대행추가();
  }
  loadDSRInputs();
  // 저장된 본건 대출값(금리·ST금리·기간)을 화면에 복원했으므로,
  // 이후 기본값 자동 적용이 이를 덮어쓰지 않도록 표시한다.
  markDsrRestoredFromStorage();
  setupDSRAutoSave();
  setupNeedDatePicker();
  initDsrHistoryModal();
  initSlotButtons();
  refreshRadioToggleStyles('#baseIncomeModeToggle');
  refreshRadioToggleStyles('#baseDeclareTypeToggle');
  applyBaseIncomeMode();
  extraIncomeRowIndexes().forEach(idx => {
    refreshRadioToggleStyles(`#incomeModeToggle_${idx}`);
    refreshRadioToggleStyles(`#declareTypeToggle_${idx}`);
    applyIncomeRowMode(idx);
  });
  updateIncomeCalc();
  applyOtherRowsBlock();
  if (typeof 자동계산 === 'function') 자동계산();

  window.addEventListener('resize', () => {
    adjustTableFontSize();
    adjustDsrMaxFontSize();
    adjustDsrToggleFontSize();
    fitAllNumericInputFontSizes();
  });
  setTimeout(() => {
    adjustTableFontSize();
    refreshDsrMaxFontSizeStably();
    adjustDsrToggleFontSize();
    fitAllNumericInputFontSizes();
  }, 100);
}

/* -------------------- 내용복사: 대출 정보 입력 요약 텍스트 클립보드 복사 -------------------- */
function 대출정보텍스트생성() {
  const getVal = (id) => {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  };
  const getText = (id) => {
    const el = document.getElementById(id);
    return el ? el.innerText.trim() : '';
  };
  const getIncomeMemo = (index) => {
    const el = document.getElementById(index === 1 ? 'baseIncomeMemo' : `incomeMemo_${index}`);
    return el ? el.value.trim() : '';
  };

  const lines = [];
  const 구분선 = '－－－－－－－－－－－－－－－－－－';

  // LTV
  lines.push('[ LTV ]');
  const ltvRadio = document.querySelector('input[name="ltv_rate"]:checked');
  const ltvPercent = ltvRadio ? `${ltvRadio.value}%` : '-';
  const kbSise = getVal('ltvMarketPriceInput') || '-';
  lines.push(`KB시세 : ${kbSise}    LTV비율 : ${ltvPercent}`);
  if (selectedAptInfo && selectedAptInfo.aptName) {
    const typePart = selectedAptInfo.typeLabel ? `${selectedAptInfo.typeLabel}타입 · ` : '';
    const areaPart = selectedAptInfo.exclusiveSqm
      ? `전용 ${selectedAptInfo.exclusiveSqm}㎡ · 공급 ${selectedAptInfo.supplyPyeong}평`
      : `전용 ${selectedAptInfo.pyeong}평`; // 예전에 저장된 값(공급/㎡ 정보 없음)과의 호환용
    lines.push(`단지 : ${selectedAptInfo.aptName} (${typePart}${areaPart})`);
  }
  lines.push(`소액임차금액 : ${getVal('ltvMinorLeaseInput') || '-'}`);
  lines.push(`계산값 : ${getVal('ltvMaxAmountOutput') || '-'}`);
  lines.push(구분선);

  // 4) DSR / DTI / 신DTI
  lines.push('[ DSR / DTI / 신DTI ]');
  lines.push(`DSR : ${getText('DSR확인') || '-'}    DTI : ${getText('DIT확인') || '-'}    신DTI : ${getText('신DTI확인') || '-'}`);
  lines.push(구분선);

  // 5) 소득 (소득1 + "소득 추가"로 늘어난 소득2, 소득3, ...)
  lines.push('[ 소득 ]');
  const baseChecked = applyRateCheck ? applyRateCheck.checked : false;
  const baseRawNum = memoBaseIncome || 0;
  const baseRawStr = baseRawNum > 0 ? Math.floor(baseRawNum).toLocaleString() : (getVal('baseIncomeInput') || '-');
  let anyChecked = baseChecked || baseIncomeMode === '신고';
  let rawSum = baseRawNum;
  if (baseIncomeMode === '신고') {
    // 추정소득(카드/건보/연금) 모드: 어떤 항목으로 추정했는지 함께 표시
    lines.push(`소득1 : ${baseRawStr} (${DECLARE_TYPE_LABELS[baseDeclareType] || baseDeclareType})`);
  } else if (baseChecked) {
    const baseAppliedStr = hiddenIncomeInput && hiddenIncomeInput.value ? hiddenIncomeInput.value : baseRawStr;
    const baseAppliedNum = parseFloat((hiddenIncomeInput?.value || '').replace(/,/g, '')) || baseRawNum;
    const baseIncreaseStr = Math.max(0, Math.floor(baseAppliedNum - baseRawNum)).toLocaleString();
    const basePercent = rateDisplay ? rateDisplay.innerText.replace(/[()]/g, '') : '-';
    lines.push(`소득1 : ${baseRawStr} (근로소득) ( ${baseAppliedStr} )    나이 : ${getVal('ageInput') || '-'}    장래예상 : ${basePercent} (${baseIncreaseStr})`);
  } else {
    lines.push(`소득1 : ${baseRawStr} (근로소득)`);
  }
  const baseMemo = getIncomeMemo(1);
  if (baseMemo) lines.push(`  메모 : ${baseMemo}`);

  // 소득2 이후 행 (값이 없는 행은 줄 자체를 생략)
  extraIncomeRowIndexes().forEach(idx => {
    const st = incomeRowState.get(idx);
    const els = getRowEls(idx);
    const rawNum = st.memoIncome || 0;
    if (rawNum <= 0) return;
    rawSum += rawNum;
    const rawStr = Math.floor(rawNum).toLocaleString();
    const rowChecked = els.applyRateCheck ? els.applyRateCheck.checked : false;
    if (st.mode === '신고') {
      lines.push(`소득${idx} : ${rawStr} (${DECLARE_TYPE_LABELS[st.declareType] || st.declareType})`);
      anyChecked = true;
    } else if (rowChecked) {
      const appliedStr = els.hiddenInput && els.hiddenInput.value ? els.hiddenInput.value : rawStr;
      const appliedNum = parseFloat((els.hiddenInput?.value || '').replace(/,/g, '')) || rawNum;
      const increaseStr = Math.max(0, Math.floor(appliedNum - rawNum)).toLocaleString();
      const percent = els.rateDisplay ? els.rateDisplay.innerText.replace(/[()]/g, '') : '-';
      lines.push(`소득${idx} : ${rawStr} (근로소득) ( ${appliedStr} )    나이 : ${getVal(`ageInput_${idx}`) || '-'}    장래예상 : ${percent} (${increaseStr})`);
      anyChecked = true;
    } else {
      lines.push(`소득${idx} : ${rawStr} (근로소득)`);
    }
    const rowMemo = getIncomeMemo(idx);
    if (rowMemo) lines.push(`  메모 : ${rowMemo}`);
  });

  // 합산소득 (소득이 2줄 이상일 때만 표시 - 장래예상/추정소득 사용 시에만 괄호로 실제 반영값 병기)
  if (extraIncomeRowIndexes().some(idx => (incomeRowState.get(idx).memoIncome || 0) > 0)) {
    const rawSumStr = rawSum > 0 ? Math.floor(rawSum).toLocaleString() : '-';
    const appliedSumStr = getVal('totalIncomeOutput') || rawSumStr;
    if (anyChecked) {
      lines.push(`합산소득 : ${rawSumStr} ( ${appliedSumStr} )`);
    } else {
      lines.push(`합산소득 : ${rawSumStr}`);
    }
  }

  lines.push(구분선);

  // 6) 대출 정보 입력 - 본건대출금액 (첫 행)
  lines.push('[ 대출 정보 입력 ]');
  const firstRow = document.querySelector('#mortgage-inputs .mortgage-row');
  if (firstRow) {
    const amt = firstRow.querySelector('.mort-amt')?.value || '-';
    const profile = firstRow.querySelector('.mort-default-profile')?.value || '6M';
    const profileLabel = profile === '5Y' ? '5년' : '6개월';
    const rate = firstRow.querySelector('.mort-rate')?.value || '-';
    const stRate = firstRow.querySelector('.mort-st-rate')?.value || '-';
    const term = firstRow.querySelector('.mort-term')?.value || '-';
    const type = firstRow.querySelector('.mort-type')?.value || '-';
    const category = firstRow.querySelector('.mort-loan-category')?.value || '';
    const graceChecked = firstRow.querySelector('.mort-grace-check')?.checked;
    const graceTerm = firstRow.querySelector('.mort-grace-term')?.value || '-';

    if (category === '연간원리금') {
      const annual = firstRow.querySelector('.mort-annual')?.value || '-';
      lines.push(`본건대출금액 : ${category} ${annual}원 (연간 원리금 직접입력)`);
      const annualMemo = getMortgageRowMemo(firstRow);
      if (annualMemo) lines.push(`메모 : ${annualMemo}`);
      lines.push(구분선);
      const heldAnnualRows = Array.from(document.querySelectorAll('#mortgage-inputs .mortgage-row')).slice(1);
      if (heldAnnualRows.length === 0) {
        lines.push('보유대출없음');
      } else {
        heldAnnualRows.forEach((row, idx) => {
          const rowCategory = row.querySelector('.mort-loan-category')?.value || '';
          if (rowCategory === '연간원리금') {
            const rowAnnual = row.querySelector('.mort-annual')?.value || '-';
            lines.push(`보유대출${idx + 1} : ${rowCategory} ${rowAnnual}원`);
          } else {
            const rowAmt = row.querySelector('.mort-amt')?.value || '-';
            const rowRate = row.querySelector('.mort-rate')?.value || '-';
            const rowTerm = row.querySelector('.mort-term')?.value || '-';
            const rowType = row.querySelector('.mort-type')?.value || '-';
            lines.push(`보유대출${idx + 1} : ${rowCategory} ${rowAmt}    금리 : ${rowRate}%    기간 : ${rowTerm}개월    상환방식 : ${rowType}`);
          }
          const rowMemo = getMortgageRowMemo(row);
          if (rowMemo) lines.push(`  메모 : ${rowMemo}`);
        });
      }
      return lines.join('\n');
    }

    lines.push(`본건대출금액 : ${category} ${amt}`);
    lines.push(`금리종류 : ${profileLabel}    금리 : ${rate}%    ST금리 : ${stRate}%`);
    lines.push(`기간 : ${term}개월    상환방식 : ${type}`);
    if (graceChecked) {
      lines.push(`거치 : ${graceTerm}개월`);
    }
    const firstMemo = getMortgageRowMemo(firstRow);
    if (firstMemo) lines.push(`메모 : ${firstMemo}`);
  }

  lines.push(구분선);

  // 보유대출
  const heldRows = Array.from(document.querySelectorAll('#mortgage-inputs .mortgage-row')).slice(1);
  if (heldRows.length === 0) {
    lines.push('보유대출없음');
  } else {
    heldRows.forEach((row, idx) => {
      const amt = row.querySelector('.mort-amt')?.value || '-';
      const rate = row.querySelector('.mort-rate')?.value || '-';
      const term = row.querySelector('.mort-term')?.value || '-';
      const type = row.querySelector('.mort-type')?.value || '-';
      const category = row.querySelector('.mort-loan-category')?.value || '';
      if (category === '연간원리금') {
        const rowAnnual = row.querySelector('.mort-annual')?.value || '-';
        lines.push(`보유대출${idx + 1} : ${category} ${rowAnnual}원`);
        const rowAnnualMemo = getMortgageRowMemo(row);
        if (rowAnnualMemo) lines.push(`  메모 : ${rowAnnualMemo}`);
        return;
      }
      const rowLine = `보유대출${idx + 1} : ${category} ${amt}    금리 : ${rate}%    기간 : ${term}개월    상환방식 : ${type}`;
      lines.push(rowLine);
      const memo = getMortgageRowMemo(row);
      if (memo) lines.push(`  메모 : ${memo}`);
    });
  }

  return lines.join('\n');
}

function copyTextSynchronously(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '0';
  textarea.style.top = '0';
  textarea.style.width = '1px';
  textarea.style.height = '1px';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus({ preventScroll: true });
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  let copied = false;
  try { copied = document.execCommand('copy') === true; } catch (e) { copied = false; }
  textarea.remove();
  return copied;
}

function fallbackCopyText(text) {
  const copied = copyTextSynchronously(text);
  showBubble(copied ? '내용이 복사되었습니다' : '복사에 실패했습니다. 다시 시도해 주세요');
  return copied;
}

function 내용복사() {
  let text;
  try {
    text = 대출정보텍스트생성();
  } catch (e) {
    console.error('텍스트 생성 실패:', e);
    showBubble('복사할 내용을 만들지 못했습니다');
    return;
  }
  if (!text) {
    showBubble('복사할 내용이 없습니다');
    return;
  }

  // Clipboard API는 WebView/비보안 환경에서 실패할 수 있으므로 먼저 동기 복사를 시도한다.
  if (copyTextSynchronously(text)) {
    showBubble('내용이 복사되었습니다');
    return;
  }
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    navigator.clipboard.writeText(text).then(() => {
      showBubble('내용이 복사되었습니다');
    }).catch(() => {
      showBubble('복사에 실패했습니다. 다시 시도해 주세요');
    });
  } else {
    showBubble('복사에 실패했습니다. 다시 시도해 주세요');
  }
}

// 대출 정보 요약 텍스트(상담내용 메모용) + 시세/필요금액/단지명·평형·동호수·주소·규제지역배지(상담일지 물건정보 1칸용)를 상담일지 탭으로 전달한다.
//
// 전달 경로가 웹과 앱에서 다르다.
//  - 웹: DSR이 index.html 안의 iframe이라 부모로 보내면 index.html이 모바일/PC 여부에 따라
//        알맞은 프레임(content-frame 또는 consulting-frame)으로 중계한다.
//  - 앱: 화면 하나를 웹뷰에 통째로 띄우는 구조라 부모 프레임이 없다. 예전에는 여기서도
//        window.parent.postMessage를 불렀는데, 부모가 없으면 window.parent는 자기 자신이라
//        메시지가 DSR 화면으로 되돌아왔고 이걸 받는 곳이 없어 버튼이 반응하지 않았다.
//        그래서 네이티브(AndroidBridge)에 넘겨 상담일지 화면으로 전환한 뒤 주입하게 한다.
function 상담일지로전달() {
  const text = 대출정보텍스트생성();
  const kbPrice = document.getElementById('ltvMarketPriceInput')?.value.trim() || '';
  const firstMortAmt = document.querySelector('#mortgage-inputs .mortgage-row .mort-amt')?.value.trim() || '';
  const aptName = (selectedAptInfo && selectedAptInfo.aptName) || '';
  const typeLabel = (selectedAptInfo && selectedAptInfo.typeLabel) || '';
  const pyeong = (selectedAptInfo && (selectedAptInfo.supplyPyeong || selectedAptInfo.pyeong)) || '';
  const exclusiveSqm = (selectedAptInfo && selectedAptInfo.exclusiveSqm) || '';
  const dongHo = (selectedAptInfo && selectedAptInfo.dong && selectedAptInfo.ho) ? `${selectedAptInfo.dong}동 ${selectedAptInfo.ho}호` : '';
  const address = (selectedAptInfo && selectedAptInfo.address) || '';
  const payload = {
    type: 'dsrSendToConsulting',
    text,
    kbPrice,
    neededAmount: firstMortAmt,
    aptName,
    typeLabel,
    pyeong,
    exclusiveSqm,
    dongHo,
    address,
    투기과열지구: !!(selectedAptInfo && selectedAptInfo.투기과열지구),
    조정대상지역: !!(selectedAptInfo && selectedAptInfo.조정대상지역)
  };

  // 웹: 부모(index.html)가 받아서 상담일지 프레임으로 중계한다.
  if (window.parent !== window) {
    window.parent.postMessage(payload, '*');
    return;
  }

  // 앱: 네이티브가 상담일지 화면으로 바꾸고, 그 화면 로딩이 끝나면 같은 내용을 넣어준다.
  // 상담일지.html은 웹과 똑같이 message 이벤트로 받으므로 받는 쪽 코드는 그대로 쓴다.
  const bridge = window.AndroidBridge;
  if (bridge && typeof bridge.openConsultingWith === 'function') {
    try {
      bridge.openConsultingWith(JSON.stringify(payload));
      return;
    } catch (e) {
      console.error('상담일지 전달 실패:', e);
    }
  }

  showBubble('상담일지로 전달할 수 없습니다');
}

/* -------------------- 화면캐치: 계산기 화면(월상환스케줄~대출정보입력) 이미지 캡쳐 후 클립보드 복사 -------------------- */
async function 화면캡쳐() {
  const target = document.getElementById('capture-area');
  if (!target) {
    showBubble('캡쳐 영역을 찾을 수 없습니다');
    return;
  }
  if (typeof html2canvas === 'undefined') {
    showBubble('캡쳐 라이브러리를 불러오지 못했습니다');
    return;
  }

  showBubble('화면 캡쳐 중...');

  // DSR 한도 토글(DSR40%/50%)이 있는 좁은 표 칸 + 세로형 flex 레이아웃을
  // html2canvas가 정상적으로 그리지 못하는 것으로 확인되어, 캡쳐하는 순간에만
  // 이 영역을 flex/숨김입력 없는 아주 단순한 임시 마크업으로 바꿔치기한다.
  const swapDsrToggleForCapture = () => {
    const groupEl = document.getElementById('dsrLimitToggleGroup');
    if (!groupEl) return () => {};

    const cellEl = groupEl.closest('td');
    const originalGroupHTML = groupEl.innerHTML;
    const originalGroupStyle = groupEl.getAttribute('style');
    const originalCellStyle = cellEl ? cellEl.getAttribute('style') : null;

    // 셀 크기를 실제 렌더링된 크기(px)로 고정해서 html2canvas가
    // 표 컬럼 폭을 다시 계산하다가 틀어지는 상황을 막는다.
    if (cellEl) {
      const rect = cellEl.getBoundingClientRect();
      cellEl.style.width = rect.width + 'px';
      cellEl.style.height = rect.height + 'px';
      cellEl.style.boxSizing = 'border-box';
    }

    // 부모 컨테이너 자체가 display:inline-flex; flex-direction:column 이라
    // html2canvas의 flexbox 렌더링 한계에 걸릴 수 있으므로, 캡쳐 순간엔
    // flex를 완전히 끄고 평범한 block 요소로 바꾼다.
    const groupRect = groupEl.getBoundingClientRect();
    groupEl.style.display = 'block';
    groupEl.style.width = groupRect.width + 'px';
    groupEl.style.boxSizing = 'border-box';

    const checkedRadio = groupEl.querySelector('input[type="radio"]:checked');
    const checkedValue = checkedRadio ? checkedRadio.value : '40';
    const pill = (value, text) => {
      const active = value === checkedValue;
      const bg = active ? '#2563eb' : 'transparent';
      const color = active ? '#ffffff' : '#64748b';
      return `<div style="display:block;text-align:center;padding:4px 6px;border-radius:999px;font-size:12px;font-weight:700;background-color:${bg};color:${color};">${text}</div>`;
    };

    groupEl.innerHTML =
      `<div style="display:block;background-color:#e5e7f5;border-radius:999px;padding:3px;">` +
      pill('40', '40%') +
      `<div style="height:2px;"></div>` +
      pill('50', '50%') +
      `</div>`;

    return () => {
      groupEl.innerHTML = originalGroupHTML;
      if (originalGroupStyle === null) groupEl.removeAttribute('style');
      else groupEl.setAttribute('style', originalGroupStyle);
      if (cellEl) {
        if (originalCellStyle === null) cellEl.removeAttribute('style');
        else cellEl.setAttribute('style', originalCellStyle);
      }
    };
  };

  // "본건 월별 상환 스케줄", "소득 정보", "대출 정보" 제목은 background-clip:text로
  // 그라데이션을 입힌 글자라, html2canvas가 이 속성을 지원하지 못해 캡쳐본에는
  // 글자 없이 그라데이션 배경 박스만 찍힌다. 캡쳐하는 순간에만 단색 글자로 바꿔치기한다.
  const swapGradientTitlesForCapture = () => {
    // capture-area 바깥(상환 스케줄 표 등)의 그라데이션 제목도 함께 바꿔야
    // 캡쳐본에 글자 없이 색 박스만 찍히지 않는다.
    const titleEls = document.querySelectorAll('.section-title-graphic');
    const originalStyles = [...titleEls].map(el => el.getAttribute('style'));

    titleEls.forEach(el => {
      el.style.setProperty('background', 'none', 'important');
      el.style.setProperty('-webkit-background-clip', 'initial', 'important');
      el.style.setProperty('background-clip', 'initial', 'important');
      el.style.setProperty('-webkit-text-fill-color', '#3a52b8', 'important');
      el.style.setProperty('color', '#3a52b8', 'important');
    });

    return () => {
      titleEls.forEach((el, i) => {
        const original = originalStyles[i];
        if (original === null) el.removeAttribute('style');
        else el.setAttribute('style', original);
      });
    };
  };

  // html2canvas는 <textarea>의 줄바꿈/자동 높이를 제대로 그리지 못해,
  // 캡쳐할 때만 textarea를 "같은 글자·같은 서식의 div"로 잠시 바꿔치기한다.
  //  → 화면에서 스크롤로 가려진 메모도 전체 내용이 줄바꿈 그대로 찍힌다.
  const swapMemosForCapture = () => {
    const memos = [...document.querySelectorAll('textarea.income-memo, textarea.mort-memo')]
      .filter(el => el.offsetParent !== null);

    const replacements = memos.map(el => {
      const cs = getComputedStyle(el);
      const div = document.createElement('div');
      div.className = el.className;
      div.textContent = el.value || '';
      div.style.cssText = [
        `box-sizing:${cs.boxSizing}`,
        `width:${el.getBoundingClientRect().width}px`,
        `padding:${cs.padding}`,
        `border:${cs.borderWidth} ${cs.borderStyle} ${cs.borderColor}`,
        `border-radius:${cs.borderRadius}`,
        `background-color:${cs.backgroundColor}`,
        `color:${cs.color}`,
        `font-family:${cs.fontFamily}`,
        `font-size:${cs.fontSize}`,
        `font-weight:${cs.fontWeight}`,
        `line-height:${cs.lineHeight}`,
        `text-align:${cs.textAlign}`,
        'white-space:pre-wrap',
        'word-break:break-word',
        'overflow-wrap:break-word',
        'min-height:0',
        'margin:0'
      ].join(';');

      // 빈 메모는 placeholder를 찍지 않는다(캡쳐본에는 안내문이 남지 않게).
      // 높이만 화면과 같게 유지해 표 모양이 틀어지지 않도록 한다.
      if (!(el.value || '').trim()) {
        div.style.minHeight = `${el.getBoundingClientRect().height}px`;
      }

      const parent = el.parentNode;
      parent.insertBefore(div, el);
      parent.removeChild(el);
      return { el, div, parent };
    });

    return () => {
      // 삽입했던 div를 직접 기억해 두었다가 원래 textarea로 되돌린다.
      replacements.forEach(({ el, div, parent }) => {
        if (div.parentNode === parent) parent.replaceChild(el, div);
      });
    };
  };

  // 입력창의 placeholder("연락처 입력", "시세 입력 (원)" 등)는 캡쳐본에서 제외한다.
  // html2canvas는 placeholder를 글자처럼 그리므로, 캡쳐하는 순간에만 비운다.
  const hidePlaceholdersForCapture = () => {
    const els = [...document.querySelectorAll('input[placeholder], textarea[placeholder]')]
      .filter(el => el.offsetParent !== null);
    const originals = els.map(el => ({ el, placeholder: el.getAttribute('placeholder') }));
    els.forEach(el => el.setAttribute('placeholder', ''));
    return () => {
      originals.forEach(({ el, placeholder }) => {
        if (placeholder === null) el.removeAttribute('placeholder');
        else el.setAttribute('placeholder', placeholder);
      });
    };
  };

  const renderBlob = async () => {
    const restoreDsrToggle = swapDsrToggleForCapture();
    const restoreGradientTitles = swapGradientTitlesForCapture();
    const restoreMemos = swapMemosForCapture();
    const restorePlaceholders = hidePlaceholdersForCapture();
    try {
      const canvas = await html2canvas(target, {
        backgroundColor: '#ffffff',
        scale: Math.min(window.devicePixelRatio || 1, 2) + 0.5,
        useCORS: true
      });

      // 고객정보 탭부터 대출정보 탭까지만 잘라낸다.
      const captureAreaRect = target.getBoundingClientRect();
      const customerSection = target.querySelector('[data-table-key="customer-info"]');
      const loanSection = target.querySelector('[data-table-key="loan"]');
      if (customerSection && loanSection) {
        const customerRect = customerSection.getBoundingClientRect();
        const loanRect = loanSection.getBoundingClientRect();
        const scaleX = canvas.width / captureAreaRect.width;
        const scaleY = canvas.height / captureAreaRect.height;
        const cropY = Math.max(0, Math.round((customerRect.top - captureAreaRect.top) * scaleY));
        const cropBottom = Math.min(canvas.height, Math.round((loanRect.bottom - captureAreaRect.top) * scaleY));
        const cropHeight = Math.max(1, cropBottom - cropY);
        const croppedCanvas = document.createElement('canvas');
        croppedCanvas.width = canvas.width;
        croppedCanvas.height = cropHeight;
        croppedCanvas.getContext('2d').drawImage(canvas, 0, cropY, canvas.width, cropHeight, 0, 0, canvas.width, cropHeight);
        return await new Promise((resolve) => croppedCanvas.toBlob(resolve, 'image/png'));
      }

      return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    } finally {
      restoreDsrToggle();
      restoreGradientTitles();
      restoreMemos();
      restorePlaceholders();
    }
  };

  const supportsClipboardImage = !!(navigator.clipboard && navigator.clipboard.write && window.ClipboardItem);

  if (supportsClipboardImage) {
    try {
      // 모바일 브라우저(Safari 등)의 사용자 제스처(user-gesture)를 유지하기 위해
      // Blob이 아닌 Promise<Blob>을 그대로 ClipboardItem에 전달한다.
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': renderBlob() })
      ]);
      showBubble('화면이 클립보드에 복사되었습니다');
      return;
    } catch (err) {
      console.warn('클립보드 이미지 복사 실패, 이미지 저장으로 대체합니다.', err);
    }
  }

  // 폴백: 클립보드 이미지 복사 미지원(또는 실패) 브라우저 → 이미지 파일로 저장
  try {
    const blob = await renderBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `대출상담_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    showBubble('클립보드 복사가 지원되지 않아 이미지로 저장했습니다');
  } catch (err) {
    console.error(err);
    showBubble('화면 캡쳐에 실패했습니다');
  }
}

// 물건지정보의 LTV 계산값을 클릭하면 본건 대출금액으로 전달한다.
function initLtvAmountTransfer() {
  const ltvOutput = document.getElementById('ltvMaxAmountOutput');
  if (!ltvOutput || ltvOutput.dataset.transferReady === 'true') return;
  ltvOutput.dataset.transferReady = 'true';
  ltvOutput.style.cursor = 'pointer';
  ltvOutput.title = '클릭하면 본건 대출금액에 적용됩니다';
  ltvOutput.addEventListener('click', () => {
    const displayed = String(ltvOutput.value || '').trim();
    let amount = typeof parseKoreanAmountText === 'function' ? parseKoreanAmountText(displayed) : NaN;
    if (!Number.isFinite(amount) || amount <= 0) {
      const digits = displayed.replace(/[^0-9]/g, '');
      amount = digits ? Number(digits) : NaN;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      showBubble('시세대비금액이 없습니다');
      return;
    }
    const firstMortgageAmount = document.querySelector('#mortgage-inputs .mortgage-row .mort-amt');
    if (!firstMortgageAmount) {
      showBubble('본건 대출금액 칸을 찾을 수 없습니다');
      return;
    }
    firstMortgageAmount.value = Math.floor(amount).toLocaleString('ko-KR');
    firstMortgageAmount.dispatchEvent(new Event('input', { bubbles: true }));
    firstMortgageAmount.dispatchEvent(new Event('change', { bubbles: true }));
    if (typeof 자동계산 === 'function') 자동계산();
    if (typeof saveDSRInputs === 'function') saveDSRInputs();
    showBubble('시세대비금액을 본건 대출금액에 적용했습니다');
  });
}

/* -------------------- 물건지정보 하단 잔금일자/메모 연동 --------------------
   본건 대출행에 있던 필요일자 기능을 물건지정보 표 하단으로 옮기면서,
   기존 초기화/저장 함수를 건드리지 않도록 별도 함수로 분리했다.
   (신규 입력값은 DOM에만 존재하고, 초기화·저장은 여기서 처리한다.) */
function initPropertyExtraFields() {
  const settlementInput = document.getElementById('propertySettlementDate');
  const propertyMemo = document.getElementById('propertyInfoMemo');
  const categoryList = document.getElementById('propertyCategoryList');
  if (!settlementInput) return;

  // 메모 앞 "구분" 선택값은 다음 물건지정보 연동을 위해 별도 저장한다.
  // 버튼 표시명 <-> 저장값(기존 분기 유지) 매핑: 담보 / 전세+주신보=주신보, 도시보증=도보, 서울보증=서보
  const savedLoanType = consultLocalStorage.getItem('DSR_propertyLoanType') || '담보';
  const savedGuarantee = consultLocalStorage.getItem('DSR_propertyJeonseGuarantee') || '';
  const categoryBtn = document.getElementById('propertyCategoryBtn');
  const categoryButtons = categoryList?.querySelectorAll('[data-category]') || [];
  const housingStatusBtn = document.getElementById('housingStatusBtn');
  let housingStatus = consultLocalStorage.getItem('CONSULT_housingStatus') || '무주택';
  const refreshHousingStatus = (isJeonse) => {
    if (!housingStatusBtn) return;
    const currentHousing = consultLocalStorage.getItem('CONSULT_housingStatus') || '무주택';
    housingStatus = currentHousing;

    // 전세에서 선택한 1주택 상태는 저장해 두되, 매매 분기에서는 적용하지 않는다.
    // 따라서 매매로 전환하면 버튼을 숨기고 화면상 상태도 무주택으로 비활성화한다.
    // 다시 전세로 돌아오면 저장된 housingStatus(1주택/무주택)를 복원한다.
    housingStatusBtn.hidden = !isJeonse;
    housingStatusBtn.textContent = isJeonse ? currentHousing : '무주택';
    if (housingStatusBtn.parentElement) {
      housingStatusBtn.parentElement.classList.toggle(
        'is-housing-status-active',
        isJeonse && currentHousing === '1주택'
      );
    }
  };
  if (housingStatusBtn) {
    refreshHousingStatus(consultLocalStorage.getItem('DSR_propertyLoanType') === '전세');
    housingStatusBtn.addEventListener('click', () => {
      // 매매 분기에서는 버튼이 숨겨져 있으므로 저장 상태를 변경하지 않는다.
      if (housingStatusBtn.hidden) return;

      const currentStatus = consultLocalStorage.getItem('CONSULT_housingStatus') || '무주택';
      const nextStatus = currentStatus === '무주택' ? '1주택' : '무주택';
      housingStatus = nextStatus;
      consultLocalStorage.setItem('CONSULT_housingStatus', nextStatus);
      refreshHousingStatus(true);
      window.dispatchEvent(new CustomEvent('housingStatusChanged'));
      refreshCreditLimit();
      saveDSRInputs();
    });
  }
  const categoryToStorage = { '담보': ['담보', ''], '주신보': ['전세', '주신보'], '도보': ['전세', '도시보증'], '서보': ['전세', '서울보증'] };
  const currentCategory = () => {
    const loanType = consultLocalStorage.getItem('DSR_propertyLoanType') || '담보';
    const guarantee = consultLocalStorage.getItem('DSR_propertyJeonseGuarantee') || '';
    if (loanType === '전세') {
      if (guarantee === '도시보증') return '도보';
      if (guarantee === '서울보증') return '서보';
      return '주신보';
    }
    return '담보';
  };
  // KCB / NICE 신용점수 입력칸: 전세 상품(주신보/도보/서보)일 때만 보인다.
  const creditScoreFields = document.getElementById('creditScoreFields');
  const creditScoreKcb = document.getElementById('creditScoreKcbInput');
  const creditScoreNice = document.getElementById('creditScoreNiceInput');
  const creditScoreLimitLabel = document.getElementById('creditScoreLimitLabel');
  // 신용점수기준.png의 판정 규칙.
  // 도시보증(도보): 모든 행이 "둘중하나"이므로 KCB 또는 NICE 중 하나만 해당하면 적용한다.
  // 서울보증(서보): 5억·4억은 "둘다만족", 3억·2억은 "둘중하나"이다.
  // 서울보증의 기준은 5억·3억이 805/820, 4억이 710/775, 2억이 655/740이다.
  const CREDIT_SCORE_RULES = {
    '도보': [
      { limit: '4.5억', matches: (kcb, nice) => kcb >= 805 || nice >= 820 },
      { limit: '1.5억', matches: (kcb, nice) => (kcb >= 655 && kcb <= 804) || (nice >= 740 && nice <= 819) },
      { limit: '7천', matches: (kcb, nice) => (kcb >= 550 && kcb <= 654) || (nice >= 545 && nice <= 739) }
    ],
    '서보': [
      { limit: '5억', matches: (kcb, nice) => kcb >= 805 && nice >= 820 },
      { limit: '4억', matches: (kcb, nice) => kcb >= 710 && nice >= 775 },
      { limit: '3억', matches: (kcb, nice) => kcb >= 805 || nice >= 820 },
      { limit: '2억', matches: (kcb, nice) => kcb >= 655 || nice >= 740 }
    ]
  };
  // 입력된 KCB/NICE 점수로 최대 한도 문자열을 돌려준다.
  const calcCreditLimit = (category) => {
    const rawKcb = consultLocalStorage.getItem('DSR_creditScoreKCB') || creditScoreKcb?.value || '';
    const rawNice = consultLocalStorage.getItem('DSR_creditScoreNICE') || creditScoreNice?.value || '';
    const kcb = parseInt(rawKcb, 10);
    const nice = parseInt(rawNice, 10);
    const hasKcb = Number.isFinite(kcb);
    const hasNice = Number.isFinite(nice);

    // 주신보는 신용점수 기준을 따르지 않는다.
    const rules = CREDIT_SCORE_RULES[category];
    if (!rules) return '';
    if (!hasKcb && !hasNice) return '신용 미입력';

    // 입력된 점수만으로 판정한다. OR 행은 한 점수만 있어도 적용되고,
    // AND 행은 KCB와 NICE를 모두 입력해 모두 만족해야 적용된다.
    const safeKcb = hasKcb ? kcb : -Infinity;
    const safeNice = hasNice ? nice : -Infinity;
    for (const rule of rules) {
      if (rule.matches(safeKcb, safeNice)) {
        // 1주택자는 계산된 한도가 2억을 초과할 때만 2억으로 제한한다.
        if (housingStatus === '1주택') {
          const limitManwon = rule.limit === '4.5억' ? 45000
            : rule.limit === '5억' ? 50000
            : rule.limit === '4억' ? 40000
            : rule.limit === '3억' ? 30000
            : rule.limit === '2억' ? 20000
            : rule.limit === '1.5억' ? 15000
            : rule.limit === '7천' ? 7000 : 0;
          if (limitManwon > 20000) return '최대 2억';
        }
        return `최대 ${rule.limit}`;
      }
    }
    return '취급불가';
  };
  const refreshCreditLimit = () => {
    if (!creditScoreLimitLabel) return;
    creditScoreLimitLabel.textContent = calcCreditLimit(currentCategory());
  };
  const memoWrap = document.getElementById('customerMemoWrap');
  const customerJeonseMemo = document.getElementById('customerJeonseMemo');
  const customerInlineMemo = document.getElementById('customerInfoMemo');
  const propertySaleControls = document.getElementById('propertySaleControls');
  const propertyJeonseControls = document.getElementById('propertyJeonseControls');
  const maxAmountTab = document.querySelector('[data-table-key="dsr-limit"]');
  const jeonseDepositInput = document.getElementById('jeonseDepositInput');
  const jeonseSeniorAmountInput = document.getElementById('jeonseSeniorAmountInput');
  const ltvMaxAmountOutput = document.getElementById('ltvMaxAmountOutput');
  const refreshPropertyBranch = (category) => {
    const isJeonse = category === '주신보' || category === '도보' || category === '서보';
    if (propertySaleControls) propertySaleControls.hidden = isJeonse;
    // 전세 계산식은 테스트 단계이므로 운영 물건지정보탭에서는
    // 보증금·선순위 입력과 계산 결과를 숨긴다.
    if (propertyJeonseControls) propertyJeonseControls.hidden = true;
    if (jeonseDepositInput) jeonseDepositInput.hidden = isJeonse;
    if (jeonseSeniorAmountInput) jeonseSeniorAmountInput.hidden = isJeonse;
    if (ltvMaxAmountOutput) ltvMaxAmountOutput.hidden = isJeonse;
  };
  const refreshLoanType = () => {
    const category = currentCategory();
    const isJeonse = consultLocalStorage.getItem('DSR_propertyLoanType') === '전세';
    const futureIncomeRow = document.getElementById('baseFutureIncomeRow');
    if (futureIncomeRow) futureIncomeRow.hidden = isJeonse;
    if (categoryBtn) categoryBtn.textContent = category;
    categoryButtons.forEach(button => {
      button.classList.toggle('active', button.dataset.category === category);
      // 전세 분기에서는 주신보 선택 버튼을 숨긴다.
      button.hidden = isJeonse && button.dataset.category === '주신보';
    });
    // 담보일 땐 숨김, 전세 상품일 땐 표시
    const isMaeme = consultLocalStorage.getItem('DSR_propertyLoanType') !== '전세';
    if (creditScoreFields) creditScoreFields.hidden = isMaeme;
    if (maxAmountTab) maxAmountTab.hidden = isJeonse;
    refreshHousingStatus(!isMaeme);
    // 전세 상품일 때는 랩퍼에 클래스를 주어 메모가 다음 줄로 내려가게 한다.
    // (CSS :has() 의존 없이 모든 WebView에서 동일하게 동작하도록 JS로 토글한다)
    if (memoWrap) memoWrap.classList.toggle('is-jeonse-category', !isMaeme);
    if (customerJeonseMemo && customerInlineMemo) {
      if (!isMaeme && customerInlineMemo.value && !customerJeonseMemo.value) customerJeonseMemo.value = customerInlineMemo.value;
      if (isMaeme && customerJeonseMemo.value && !customerInlineMemo.value) customerInlineMemo.value = customerJeonseMemo.value;
      if (typeof autoResizeMemoTextarea === 'function') autoResizeMemoTextarea(isMaeme ? customerInlineMemo : customerJeonseMemo);
    }
    refreshPropertyBranch(category);
    refreshCreditLimit();
  };
  if (customerJeonseMemo && customerInlineMemo) {
    customerJeonseMemo.addEventListener('input', () => {
      customerInlineMemo.value = customerJeonseMemo.value;
      if (typeof autoResizeMemoTextarea === 'function') autoResizeMemoTextarea(customerJeonseMemo);
    });
    customerInlineMemo.addEventListener('input', () => {
      customerJeonseMemo.value = customerInlineMemo.value;
    });
  }
  if (categoryBtn && categoryList) {
    categoryBtn.addEventListener('click', () => { categoryList.hidden = !categoryList.hidden; });
  }
  categoryButtons.forEach(button => button.addEventListener('click', () => {
    const previousLoanType = consultLocalStorage.getItem('DSR_propertyLoanType') || '담보';
    const [loanType, guarantee] = categoryToStorage[button.dataset.category] || ['담보', ''];
    consultLocalStorage.setItem('DSR_propertyLoanType', loanType);
    consultLocalStorage.setItem('DSR_propertyJeonseGuarantee', guarantee);
    if (categoryList) categoryList.hidden = true;
    // 도보/서보(전세 보증) 선택 시 본건 드롭다운을 "전세대"로 맞춘다.
    if (button.dataset.category === '도보' || button.dataset.category === '서보') {
      const firstRow = document.querySelector('#mortgage-inputs .mortgage-row.first-row');
      if (firstRow) {
        const catSelect = firstRow.querySelector('.mort-category-select');
        const catInput = firstRow.querySelector('.mort-loan-category');
        if (catSelect) catSelect.value = '전세대';
        if (catInput) catInput.value = '전세대';
      }
      if (typeof 자동계산 === 'function') 자동계산();
    }
    refreshLoanType();
    // 사용자가 구분(담보/전세)을 직접 바꿨으므로, 기본값 자동 적용을 다시 허용한다.
    __dsrRestoredFromStorage = false;
    window.dispatchEvent(new CustomEvent('consultLoanTypeChanged'));
    window.dispatchEvent(new CustomEvent('housingStatusChanged'));
    if (typeof refreshMarketPriceBranch === 'function') refreshMarketPriceBranch();
    saveDSRInputs();
  }));
  consultLocalStorage.setItem('DSR_propertyLoanType', savedLoanType);
  consultLocalStorage.setItem('DSR_propertyJeonseGuarantee', savedGuarantee);
  refreshLoanType();
  // 구분 변경/복원 시 동일한 전세·담보 UI 갱신을 사용한다.
  window.addEventListener('consultLoanTypeChanged', refreshLoanType);
  window.addEventListener('housingStatusChanged', refreshLoanType);
  const formatBranchAmount = (value) => {
    const digits = String(value || '').replace(/\D/g, '');
    return digits ? Number(digits).toLocaleString('ko-KR') : '';
  };
  if (jeonseDepositInput) jeonseDepositInput.value = formatBranchAmount(consultLocalStorage.getItem('DSR_jeonseDepositInput'));
  if (jeonseSeniorAmountInput) jeonseSeniorAmountInput.value = formatBranchAmount(consultLocalStorage.getItem('DSR_jeonseSeniorAmountInput'));
  [jeonseDepositInput, jeonseSeniorAmountInput].forEach((input) => {
    if (!input) return;
    input.addEventListener('input', () => {
      input.value = formatBranchAmount(input.value);
      consultLocalStorage.setItem(`DSR_${input.id}`, input.value);
      if (typeof saveDSRInputs === 'function') saveDSRInputs();
    });
  });

  // KCB / NICE 저장값 복원 + 입력 중 숫자만 3자리로 제한
  ['kcb', 'nice'].forEach((key) => {
    const input = key === 'kcb' ? creditScoreKcb : creditScoreNice;
    if (!input) return;
    const savedScore = consultLocalStorage.getItem(key === 'kcb' ? 'DSR_creditScoreKCB' : 'DSR_creditScoreNICE');
    if (savedScore) input.value = savedScore;
    input.addEventListener('input', () => {
      const digits = input.value.replace(/\D/g, '').slice(0, 3);
      input.value = digits;
      consultLocalStorage.setItem(key === 'kcb' ? 'DSR_creditScoreKCB' : 'DSR_creditScoreNICE', digits);
      refreshCreditLimit();
      if (typeof saveDSRInputs === 'function') saveDSRInputs();
    });
  });
  refreshCreditLimit();

  // 저장된 값이 있으면 복원한다 (초기화 시에는 아래 선택초기화 후킹이 지운다).
  const savedDate = consultLocalStorage.getItem('DSR_propertySettlementDate');
  if (savedDate) settlementInput.value = savedDate;
  const savedMemo = consultLocalStorage.getItem('DSR_propertyInfoMemo');
  if (propertyMemo && savedMemo) {
    propertyMemo.value = savedMemo;
    if (typeof autoResizeMemoTextarea === 'function') autoResizeMemoTextarea(propertyMemo);
  }

  if (propertyMemo && typeof autoResizeMemoTextarea === 'function') autoResizeMemoTextarea(propertyMemo);

  // 초기화 버튼은 기존 선택초기화()를 그대로 쓰고, 그 안에서 지워지 않는 이 두 칸만
  // 여기서 따로 비운다. (기존 함수 본문을 수정하지 않기 위한 방식)
  const resetBtn = document.querySelector('.reset-btn[onclick="선택초기화()"], [onclick="선택초기화()"]');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      settlementInput.value = '';
      consultLocalStorage.removeItem('DSR_propertyLoanType');
      consultLocalStorage.removeItem('DSR_propertyJeonseGuarantee');
      consultLocalStorage.removeItem('DSR_creditScoreKCB');
      consultLocalStorage.removeItem('DSR_creditScoreNICE');
      consultLocalStorage.removeItem('DSR_jeonseDepositInput');
      consultLocalStorage.removeItem('DSR_jeonseSeniorAmountInput');
      if (jeonseDepositInput) jeonseDepositInput.value = '';
      if (jeonseSeniorAmountInput) jeonseSeniorAmountInput.value = '';
      if (creditScoreKcb) creditScoreKcb.value = '';
      if (creditScoreNice) creditScoreNice.value = '';
      if (categoryList) categoryList.hidden = true;
      refreshLoanType();
      if (propertyMemo) {
        propertyMemo.value = '';
        if (typeof autoResizeMemoTextarea === 'function') autoResizeMemoTextarea(propertyMemo);
      }
    });
  }
}

window.addEventListener('DOMContentLoaded', initPropertyExtraFields);
window.addEventListener('DOMContentLoaded', initLtvAmountTransfer);
window.addEventListener('DOMContentLoaded', init);

/* ───────────────── 전세 전용 표시 보정 ─────────────────
   기존 계산 함수/계산 로직은 수정하지 않고, 화면 상태만 분기한다.
   전세: 본건 금리 프로필을 6M/2Y로 표시하고 상환방식을 만기일시(기존 값은 만기)로 선택한다.
   담보: 기존 6M/5Y 표시와 원리금 선택을 복원한다. */
function refreshJeonseMortgageUi() {
  const isJeonse = consultLocalStorage.getItem('DSR_propertyLoanType') === '전세';
  const firstRow = document.querySelector('#mortgage-inputs .mortgage-row.first-row');
  if (!firstRow) return;

  const profileButton = firstRow.querySelector('.mort-default-switch');
  if (profileButton) {
    const labels = profileButton.querySelectorAll('.switch-label');
    if (labels[0]) labels[0].textContent = '6M';
    if (labels[1]) labels[1].textContent = isJeonse ? '2Y' : '5Y';
    profileButton.dataset.profile = isJeonse && profileButton.dataset.profile === '5Y' ? '2Y' : (!isJeonse && profileButton.dataset.profile === '2Y' ? '5Y' : profileButton.dataset.profile);
    labels.forEach((label, index) => label.classList.toggle('active', index === 0 ? profileButton.dataset.profile === '6M' : profileButton.dataset.profile === (isJeonse ? '2Y' : '5Y')));
    profileButton.setAttribute('aria-label', isJeonse ? '6M/2Y 전환' : '6M/5Y 전환');
  }

  if (isJeonse) {
    const maturityButton = firstRow.querySelector('.type-btn[onclick*="\'만기\'"]');
    if (maturityButton && typeof setMortgageRepaymentType === 'function') {
      setMortgageRepaymentType(maturityButton, '만기');
    }
  } else {
    const principalInterestButton = firstRow.querySelector('.type-btn[onclick*="\'원리금\'"]');
    if (principalInterestButton && typeof setMortgageRepaymentType === 'function') {
      setMortgageRepaymentType(principalInterestButton, '원리금');
    }
  }

  // 전세대 행 레이아웃(금리선택기·상환방식 선택기 숨김)을 모든 대출 행에 다시 적용한다.
  document.querySelectorAll('#mortgage-inputs .mortgage-row').forEach(row => applyJeonseRowLayout(row));
}
window.addEventListener('DOMContentLoaded', () => setTimeout(refreshJeonseMortgageUi, 0));
window.addEventListener('consultLoanTypeChanged', refreshJeonseMortgageUi);
/* ───────────────── 상담 전용 저장소 ───────────────── */
const CONSULT_STORAGE_KEY = '상담저장소';
const CONSULT_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbwnijhKF5l5r_BupFxu-Dcz0jkjOcDZPS7nWdjLkBB95wO_sUZ44ucrG-9g3BGTeTRd/exec';

function consultUserCode() {
  return String(window.localStorage.getItem('calc_user_name') || '').trim();
}
function consultPhoneKey(phone) {
  return String(phone || '').replace(/\D/g, '');
}
function consultRecordTime(record) {
  const value = String(record?.savedAt || record?.dateTime || '').trim();
  if (!value) return 0;

  // 시트 표시형식(yy.MM.dd HH:mm:ss)을 먼저 정규식으로 잡는다.
  // Date.parse를 먼저 시도하면 브라우저/WebView마다 이 형식을 제멋대로(혹은 아예 다르게)
  // 해석해 서버 기록 시간이 엉뚱해질 수 있다. 시트 형식이면 항상 정규식으로 파싱한다.
  const sheetMatch = value.match(/^(\d{2})[./-](\d{1,2})[./-](\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (sheetMatch) {
    const year = Number(sheetMatch[1]) + (Number(sheetMatch[1]) < 70 ? 2000 : 1900);
    const t = new Date(year, Number(sheetMatch[2]) - 1, Number(sheetMatch[3]), Number(sheetMatch[4]), Number(sheetMatch[5]), Number(sheetMatch[6] || 0)).getTime();
    return Number.isFinite(t) ? t : 0;
  }

  // ISO 등 표준 형식만 Date.parse에 맡긴다.
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}
/* 병합/정렬에서 비교할 때마다 날짜 문자열을 다시 파싱하지 않도록
   시간값을 1회만 계산해 부착한다(정렬 comparator는 n log n번 호출되므로 비용이 크다). */
function consultWithTime(record) {
  if (!record || Object.prototype.hasOwnProperty.call(record, '__time')) return record;
  try { Object.defineProperty(record, '__time', { value: consultRecordTime(record), enumerable: false, configurable: true }); }
  catch (_) { record.__time = consultRecordTime(record); }
  return record;
}
function consultRecordTimeCached(record) {
  if (record && Number.isFinite(record.__time)) return record.__time;
  return consultRecordTime(record);
}
/* 동기화에서 서버 기록과 로컬 기록을 같은 규칙으로 병합한다.
   saveConsultRecord와 동일하게 폰번호를 우선 키로 쓰고, 폰번호가 없으면
   이름을 폴백 키로 사용한다(두 곳의 병합 기준을 일치시켜 중복 누적을 막는다). */
function consultMergeKey(record) {
  const phone = consultPhoneKey(record && record.phone);
  if (phone) return `p:${phone}`;
  const name = String((record && record.name) || '').trim();
  return name ? `n:${name}` : '';
}
function consultMergeRecords(serverRecords, localRecords) {
  const byKey = new Map();
  const noKey = [];
  [...serverRecords, ...localRecords].forEach(raw => {
    const record = consultWithTime(raw);
    const key = consultMergeKey(record);
    if (!key) { noKey.push(record); return; }
    const previous = byKey.get(key);
    // 서버 기록을 먼저 넣고, 로컬은 "엄격하게 더 최신"일 때만 교체한다.
    // (시간이 같거나 파싱 실패로 둘 다 0이면 서버 값을 유지 — 서버가 공용 최신본이기 때문)
    if (!previous || consultRecordTimeCached(record) > consultRecordTimeCached(previous)) {
      byKey.set(key, record);
    }
  });
  return [...byKey.values(), ...noKey]
    .sort((a, b) => consultRecordTimeCached(b) - consultRecordTimeCached(a));
}
function consultServerRecordToLocal(record) {
  let storage = record.storage || {};
  try {
    if (record.inputSnapshot) storage = { ...storage, ...JSON.parse(record.inputSnapshot) };
  } catch (_) {}
  return {
    phone: record.phone || '',
    name: record.name || '',
    broker: record.broker || '',
    memo: record.memo || record.content || '',
    savedAt: record.dateTime || new Date(0).toISOString(),
    futureSummary: record.futureSummary || '',
    inputSnapshot: record.inputSnapshot || '',
    propertyInfo: record.propertyInfo || '',
    heldLoans: record.heldLoans || '',
    fullRecord: record.fullRecord || '',
    storage
  };
}
function consultLocalRecordToServer(record, userCode) {
  // 서버(doPost action=sync)는 fullRecord 열을 쓰지 않으므로 전송하지 않는다.
  // inputSnapshot도 storage가 있으면 그걸 쓰므로 fullRecord 중복 전송을 제거해
  // 레코드당 페이로드를 줄인다(100건이면 POST 왕복이 눈에 띄게 가벼워진다).
  return {
    userCode,
    dateTime: record.savedAt || new Date().toISOString(),
    phone: record.phone || '',
    name: record.name || '',
    needDate: record.needDate || '',
    needAmount: record.needAmount || '',
    loanType: record.loanType || '',
    memo: record.memo || '',
    broker: record.broker || '',
    futureSummary: record.futureSummary || '',
    inputSnapshot: record.inputSnapshot || JSON.stringify(record.storage || {}),
    propertyInfo: record.propertyInfo || '',
    heldLoans: record.heldLoans || ''
  };
}
/* JSONP 조회/전송 공통 실행기. sync와 delete가 같은 정리 로직을 공유한다. */
function consultJsonp(userCode, action, extraParams, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const callbackName = `__consultSync_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement('script');
    const cleanup = () => {
      delete window[callbackName];
      script.remove();
    };
    const timer = setTimeout(() => { cleanup(); reject(new Error('서버 응답 시간 초과')); }, timeoutMs);
    window[callbackName] = data => { clearTimeout(timer); cleanup(); resolve(data); };
    script.onerror = () => { clearTimeout(timer); cleanup(); reject(new Error('서버 요청 실패')); };
    const params = new URLSearchParams({ action, userCode, callback: callbackName, t: Date.now(), ...(extraParams || {}) });
    script.src = `${CONSULT_WEB_APP_URL}?${params.toString()}`;
    document.head.appendChild(script);
  });
}
function consultReadServerRecords(userCode) {
  return consultJsonp(userCode, 'read', null).then(data => (Array.isArray(data) ? data : []));
}
/* 삭제한 상담을 서버에서도 지운다. 서버(.gs)에 이미 있는 action=delete 를 사용한다.
   이게 없으면 다음 동기화 때 서버의 옛 기록이 다시 병합되어 삭제가 되살아난다. */
function consultDeleteServerRecord(record) {
  const userCode = consultUserCode();
  if (!userCode || !record) return Promise.resolve();
  return consultJsonp(userCode, 'delete', {
    dateTime: record.savedAt || record.dateTime || '',
    name: record.name || ''
  }, 15000).catch(error => { console.warn('서버 삭제 실패:', error); });
}
/* JSONP(GET)가 URL 길이 등으로 실패할 때 쓰는 POST 폴백.
   no-cors라 응답은 못 읽지만 서버 반영 자체는 보장한다(기존 방식). */
async function consultPostSync(userCode, syncPayload) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);
  try {
    await fetch(CONSULT_WEB_APP_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({ action: 'sync', userCode, records: JSON.stringify(syncPayload) }).toString(),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
async function syncConsultRecords() {
  const userCode = consultUserCode();
  if (!userCode) {
    showBubble('사용자 이름을 먼저 확인해 주세요');
    return;
  }
  const button = document.getElementById('consultSyncBtn');
  if (button) { button.disabled = true; button.textContent = '동기화 중...'; }
  try {
    // 서버 조회가 실패해도(콜백 포맷 문제·URL 길이 등) 동기화 전체를 죽이지 않는다.
    // 조회 실패 시에는 빈 목록으로 진행해, 최소한 내 기록 업로드는 계속한다.
    let serverRecords = [];
    try {
      const rawServer = await consultReadServerRecords(userCode);
      console.log(`[동기화] userCode="${userCode}" 서버 조회 ${rawServer.length}건`);
      serverRecords = rawServer.map(consultServerRecordToLocal);
    } catch (readError) {
      console.warn('서버 조회 실패, 로컬만으로 진행:', readError);
      serverRecords = [];
    }
    const localRecords = getConsultRecords();
    console.log(`[동기화] 로컬 ${localRecords.length}건 + 서버 ${serverRecords.length}건 병합`);
    // 병합 → 최신순 정렬. 시간값은 1회만 계산한다(#2).
    const mergedAll = consultMergeRecords(serverRecords, localRecords);
    console.log(`[동기화] 병합 결과 ${mergedAll.length}건`, mergedAll.map(r => `${r.name || '(이름없음)'}/${r.phone || '(번호없음)'} @${r.savedAt || ''}`));
    // 화면(localStorage)에는 최신 100건만 보관하지만, 서버 업로드는 자르지 않는다.
    // 잘라서 올리면 101건째부터 서버에서도 조용히 사라진다(#8).
    consultLocalStorage.setItem(CONSULT_STORAGE_KEY, JSON.stringify(mergedAll.slice(0, 100)));

    // 병합된 최종 목록 전체를 서버에 반영한다.
    // 동기화는 항상 POST(no-cors)로 보낸다.
    // - JSONP(GET)는 records 를 URL에 담아야 해서, 기록이 많으면 URL 길이 초과로
    //   script.onerror(서버 요청 실패)가 났다. POST는 URL 길이 제한이 없다.
    // - 응답을 읽지 못하므로 반영 건수는 전송한 개수로 표시한다(완료 안내에만 사용).
    const syncPayload = mergedAll.map(record => consultLocalRecordToServer(record, userCode));
    let serverCount = syncPayload.length;
    try {
      await consultPostSync(userCode, syncPayload);
    } catch (postError) {
      console.warn('서버 반영 실패:', postError);
      serverCount = -1;
    }

    if (typeof openConsultStorageModal === 'function') openConsultStorageModal();
    showBubble(serverCount < 0
      ? `동기화 완료: ${mergedAll.length}건 (서버 반영 확인 안 됨)`
      : `동기화 완료: ${mergedAll.length}건 / 서버 반영 ${serverCount}건`);
  } catch (error) {
    console.error('상담저장소 동기화 실패:', error);
    showBubble('동기화에 실패했습니다');
  } finally {
    if (button) { button.disabled = false; button.textContent = '동기화'; }
  }
}
function getConsultRecords() {
  try { const value = JSON.parse(consultLocalStorage.getItem(CONSULT_STORAGE_KEY) || '[]'); return Array.isArray(value) ? value : []; }
  catch (_) { return []; }
}
function saveConsultRecord() {
  const phone = document.getElementById('customerPhoneInput')?.value.trim() || '';
  const name = document.getElementById('customerNameInput')?.value.trim() || '';
  const broker = document.getElementById('customerBrokerInput')?.value.trim() || '';
  const memo = document.getElementById('customerInfoMemo')?.value.trim() || '';
  const snapshot = getDsrStorageSnapshot();
  const hasStoredInput = Object.values(snapshot).some(value => String(value ?? '').trim() !== '');
  const hasMeaningfulData = phone || name || broker || memo || hasStoredInput;
  if (!hasMeaningfulData) return false;
  const formSnapshot = {};
  [...document.querySelectorAll('input, select, textarea')].forEach((el, index) => {
    const key = el.id || el.name || `field_${index}`;
    if (el.type === 'radio' && !el.checked) return;
    formSnapshot[key] = {
      tag: el.tagName.toLowerCase(),
      type: el.type || '',
      name: el.name || '',
      value: el.type === 'checkbox' || el.type === 'radio' ? el.checked : el.value,
      checked: !!el.checked,
      placeholder: el.placeholder || ''
    };
  });
  const futureFields = Object.entries(formSnapshot)
    .filter(([key, item]) => /장래|예상|future/i.test(`${key} ${item.name} ${item.placeholder}`))
    .map(([key, item]) => `${key}=${item.value}`);
  const futureSummary = futureFields.join('\n');
  const readSnapshot = key => String(snapshot[key] || '');
  const firstMortgage = (() => {
    try { return JSON.parse(readSnapshot('DSR_mortgageData'))[0] || {}; } catch (_) { return {}; }
  })();
  const heldMortgage = (() => {
    try {
      const rows = JSON.parse(readSnapshot('DSR_mortgageData')) || [];
      return rows.slice(1).map((row, index) => `보유대출${index + 1}: 금액=${row.amount || ''}, 금리=${row.rate || ''}, 기간=${row.term || ''}, 방식=${row.type || ''}`).join('\n');
    } catch (_) { return ''; }
  })();
  const propertyInfo = [
    readSnapshot('DSR_selectedAptInfo'),
    readSnapshot('DSR_propertyLoanType') ? `대출종류=${readSnapshot('DSR_propertyLoanType')}${readSnapshot('DSR_propertyJeonseGuarantee') ? `(${readSnapshot('DSR_propertyJeonseGuarantee')})` : ''}` : '',
    readSnapshot('DSR_propertySettlementDate'),
    readSnapshot('DSR_propertyInfoMemo'),
    readSnapshot('DSR_ltvMarketPriceInput')
  ].filter(Boolean).join('\n');
  const record = {
    phone, name, broker, memo,
    needDate: readSnapshot('DSR_propertySettlementDate'),
    loanCategory: readSnapshot('DSR_propertyLoanType') || '담보',
    guaranteeType: readSnapshot('DSR_propertyJeonseGuarantee'),
    needAmount: firstMortgage.amount || '',
    loanType: firstMortgage.type || '',
    heldLoans: heldMortgage,
    propertyInfo,
    savedAt: new Date().toISOString(),
    storage: snapshot,
    // 서버에서 내려받은 뒤 loadDsrSnapshotIntoForm()이 바로 복원할 수 있도록
    // DSR_* 저장 스냅샷과 전체 폼 입력값을 하나의 JSON으로 합친다.
    inputSnapshot: JSON.stringify({ ...snapshot, ...formSnapshot }),
    futureSummary
  };
  // 구분값이 있는 경우에만 같은 번호 상담을 교체한다. 번호와 이름이 모두 없으면 매번 새 기록으로 남긴다.
  const hasIdentifier = Boolean(phone || name);
  const records = hasIdentifier
    ? getConsultRecords().filter(item => {
        const samePhone = phone && String(item.phone || '').replace(/\D/g, '') === phone.replace(/\D/g, '');
        const sameName = name && String(item.name || '').trim() === name;
        return !(samePhone || sameName);
      })
    : getConsultRecords();
  records.unshift(record);
  consultLocalStorage.setItem(CONSULT_STORAGE_KEY, JSON.stringify(records.slice(0, 100)));
  // Android WebView의 네이티브 캐시에도 저장한다. 구버전 브리지와 호환되도록
  // saveConsultRecord/saveLocalRecord 두 이름을 모두 지원한다.
  if (window.AndroidBridge) {
    try {
      const save = window.AndroidBridge.saveConsultRecord || window.AndroidBridge.saveLocalRecord;
      if (typeof save === 'function') save.call(window.AndroidBridge, JSON.stringify(record));
    } catch (_) {}
  }
  if (typeof showBubble === 'function') showBubble('상담저장소에 저장했습니다');
}
function openConsultStorageModal() {
  let modal = document.getElementById('consultStorageModal');
  // 이미 열려 있고 렌더 함수를 보관 중이면, 네이티브 재조회/전체 재구성 없이
  // 목록만 새로 그린다(#1). 동기화 버튼은 모달이 이미 열린 상태에서 눌리므로
  // 이 경로로 들어와 불필요한 전체 재렌더를 건너뛴다.
  if (modal && typeof modal.__consultRenderRecords === 'function') {
    modal.__consultRenderRecords();
    modal.style.display = 'flex';
    return;
  }

  let records = getConsultRecords();
  // 앱 네이티브 캐시에만 남아 있는 기존 기록도 상담저장소 목록에 합친다.
  if (window.AndroidBridge && typeof window.AndroidBridge.getLocalRecords === 'function') {
    try {
      const nativeRecords = JSON.parse(window.AndroidBridge.getLocalRecords() || '[]');
      records = consultMergeRecords(nativeRecords, records);
      consultLocalStorage.setItem(CONSULT_STORAGE_KEY, JSON.stringify(records.slice(0, 100)));
    } catch (_) {}
  }
  if (!modal) {
    modal = document.createElement('div'); modal.id = 'consultStorageModal'; modal.className = 'consult-storage-modal';
    // "전체삭제"는 제목(상담저장소) 왼쪽에 둔다.
    modal.innerHTML = '<div class="consult-storage-panel"><div class="consult-storage-header"><button type="button" class="consult-storage-clear-all" id="consultClearAllBtn">전체삭제</button><div class="consult-storage-title">상담저장소</div><input type="search" class="consult-storage-search" placeholder="이름, 연락처, 메모 등 검색" autocomplete="off"><button type="button" class="consult-storage-sync" id="consultSyncBtn">동기화</button></div><div class="consult-storage-list"></div></div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', (event) => {
      if (event.target === modal) modal.style.display = 'none';
    });
    modal.querySelector('#consultSyncBtn').addEventListener('click', syncConsultRecords);
  }
  const list = modal.querySelector('.consult-storage-list');
  const search = modal.querySelector('.consult-storage-search');
  const renderRecords = () => {
    const query = String(search?.value || '').trim().toLowerCase();
    const filtered = query ? records.filter(r => JSON.stringify(r).toLowerCase().includes(query)) : records;
    list.innerHTML = filtered.length ? filtered.map(r => {
      const displayName = String(r.name || r.customerName || r.customer_name || '').trim() || '이름없음';
      const index = records.indexOf(r);
      return `<div class="consult-storage-item" data-index="${index}" role="button" tabindex="0"><b>${escapeHtml(displayName)}</b><span>${escapeHtml(r.phone || '연락처 없음')}</span><button type="button" class="consult-storage-delete" data-index="${index}" aria-label="저장된 상담내용 삭제">×</button><small>${escapeHtml(r.memo || '')}</small></div>`;
    }).join('') : '<div class="consult-storage-empty">검색 결과가 없습니다.</div>';
    list.querySelectorAll('.consult-storage-item').forEach(item => item.addEventListener('click', (event) => {
      const deleteButton = event.target.closest('.consult-storage-delete');
      if (deleteButton) {
        event.preventDefault();
        event.stopPropagation();
        const deleteIndex = Number(deleteButton.dataset.index);
        const deleteRecord = records[deleteIndex];
        if (!deleteRecord) return;
        if (!window.confirm('삭제하시겠습니까?')) return;
        records.splice(deleteIndex, 1);
        consultLocalStorage.setItem(CONSULT_STORAGE_KEY, JSON.stringify(records.slice(0, 100)));
        // 서버에도 삭제를 전파해야 다음 동기화 때 되살아나지 않는다(#6).
        consultDeleteServerRecord(deleteRecord);
        renderRecords();
        if (typeof showBubble === 'function') showBubble('저장된 상담내용을 삭제했습니다');
        return;
      }

      const record = records[Number(item.dataset.index)];
      if (!record) return;
      // 저장된 상담 복원 진단용 로그 (서버에서 내려온 기록인지 확인)
      console.log('[불러오기] 선택:', record.name, '/ storage키수:', Object.keys(record.storage || {}).length, '/ inputSnapshot길이:', String(record.inputSnapshot || '').length, '/ fullRecord:', !!record.fullRecord);
      // 구버전 저장 기록처럼 storage에 구분 키가 없는 경우에도 최상위 구분값을 복원한다.
      const recordSnapshot = { ...(record.storage || {}) };
      if (!recordSnapshot.DSR_propertyLoanType && record.loanCategory) {
        recordSnapshot.DSR_propertyLoanType = ['담보'].includes(record.loanCategory) ? '담보' : '전세';
      }
      if (!recordSnapshot.DSR_propertyJeonseGuarantee && record.guaranteeType) {
        recordSnapshot.DSR_propertyJeonseGuarantee = record.guaranteeType;
      }
      loadDsrSnapshotIntoForm(recordSnapshot);
      // 서버 동기화 기록은 inputSnapshot 안에 DSR_* 키가 들어 있다.
      // storage가 비어 있어도 서버에서 내려받은 입력값을 먼저 복원한다.
      if ((!record.storage || Object.keys(record.storage).length === 0) && record.inputSnapshot) {
        try { loadDsrSnapshotIntoForm(JSON.parse(record.inputSnapshot)); } catch (_) {}
      }
      // 저장 당시 상담정보를 별도로 직접 복원해 UI/요약/팝업 모두 같은 값을 사용하게 한다.
      const fields = [['customerPhoneInput', record.phone], ['customerNameInput', record.name], ['customerBrokerInput', record.broker], ['customerInfoMemo', record.memo]];
      fields.forEach(([id, value]) => { const el = document.getElementById(id); if (el && value !== undefined) { el.value = value || ''; el.dispatchEvent(new Event('input', { bubbles: true })); } });
      if (typeof updateCustomerInfoSummary === 'function') updateCustomerInfoSummary();
      if (typeof openAllInfoTabs === 'function') openAllInfoTabs();
      modal.style.display = 'none';
      if (typeof showBubble === 'function') showBubble('상담저장소에서 불러왔습니다');
    }));
  };
  if (search && !search.dataset.bound) { search.dataset.bound = 'true'; search.addEventListener('input', renderRecords); }

  // 전체삭제: 저장된 상담을 모두 지운다(단건 삭제와 동일하게 서버에도 전파).
  const clearAllBtn = modal.querySelector('#consultClearAllBtn');
  if (clearAllBtn && !clearAllBtn.dataset.bound) {
    clearAllBtn.dataset.bound = 'true';
    clearAllBtn.addEventListener('click', async (event) => {
      event.stopPropagation();
      if (!records.length) {
        if (typeof showBubble === 'function') showBubble('삭제할 상담내용이 없습니다');
        return;
      }
      if (!window.confirm(`저장된 상담 ${records.length}건을 모두 삭제하시겠습니까?\n삭제한 내용은 되살릴 수 없습니다.`)) return;

      const toDelete = records.slice();
      records = [];
      consultLocalStorage.setItem(CONSULT_STORAGE_KEY, JSON.stringify([]));
      renderRecords();

      // 서버에서도 지워야 다음 동기화 때 되살아나지 않는다(단건 삭제와 같은 경로).
      try {
        await Promise.all(toDelete.map(record => consultDeleteServerRecord(record)));
      } catch (error) {
        console.warn('전체삭제 서버 전파 실패:', error);
      }
      if (typeof showBubble === 'function') showBubble(`상담 ${toDelete.length}건을 모두 삭제했습니다`);
    });
  }
  // 모달 엘리먼트에 렌더 함수를 보관해, 다음 호출(예: 동기화 후)에서
  // 전체 재구성 없이 목록만 다시 그릴 수 있게 한다(#1).
  modal.__consultRenderRecords = () => {
    records = getConsultRecords();
    renderRecords();
  };
  renderRecords();
  modal.style.display = 'flex';
}
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('consultSaveBtn')?.addEventListener('click', saveConsultRecord);
  document.getElementById('consultLoadBtn')?.addEventListener('click', openConsultStorageModal);
});

/* ───────────────── Firebase(Firestore) 연동 브리지 ─────────────────
   로그인한 사용자에게만 적용된다. 로그인 안 됐거나 Firebase 미준비면
   기존 localStorage/GAS 경로가 그대로 동작한다(하위호환).

   1) 저장: saveConsultRecord 가 만든 레코드를 Firestore 에도 저장
   2) 불러오기: Firestore 기록을 로컬 캐시로 내려받아 기존 모달에 합쳐 보여줌 */
(function () {
  function firestoreReady() {
    return !!(window.DodoConsult && window.DodoConsult.available());
  }

  // 저장 버튼: 기존 저장(로컬) 후 Firestore 에도 반영
  window.addEventListener('DOMContentLoaded', function () {
    var saveBtn = document.getElementById('consultSaveBtn');
    if (!saveBtn) return;
    saveBtn.addEventListener('click', function () {
      if (!firestoreReady()) return;
      // saveConsultRecord 는 방금 로컬에 저장했으므로, 최신 1건을 Firestore 로 올린다.
      setTimeout(function () {
        try {
          var recs = getConsultRecords();
          if (recs && recs.length) {
            window.DodoConsult.save(recs[0]).then(function () {
              if (typeof showBubble === 'function') showBubble('Firestore에도 저장했습니다');
            }).catch(function (e) { console.warn('Firestore 저장 실패:', e); });
          }
        } catch (e) { console.warn('Firestore 저장 브리지 오류:', e); }
      }, 0);
    });
  });

  // 불러오기 버튼: Firestore 기록을 먼저 로컬 캐시로 내려받은 뒤 모달을 연다.
  window.addEventListener('DOMContentLoaded', function () {
    var loadBtn = document.getElementById('consultLoadBtn');
    if (!loadBtn) return;
    loadBtn.addEventListener('click', function () {
      if (!firestoreReady()) return;
      // Firestore → 로컬 캐시 동기화 (실패해도 기존 캐시로 계속 진행)
      window.DodoConsult.exportToLocal().catch(function (e) { console.warn('Firestore 불러오기 실패:', e); });
    });
  });
})();


/* 내용복사 출력 형식 재정의 */
function 대출정보텍스트생성() {
  const val = id => document.getElementById(id)?.value?.trim() || '';
  const text = id => document.getElementById(id)?.innerText?.trim() || '';
  const incomeMemo = index => document.getElementById(index === 1 ? 'baseIncomeMemo' : `incomeMemo_${index}`)?.value?.trim() || '';
  const cleanMemo = value => {
    const memo = (value || '').trim();
    if (!memo) return '';
    const half = memo.length / 2;
    return Number.isInteger(half) && memo.slice(0, half) === memo.slice(half) ? memo.slice(0, half).trim() : memo;
  };
  // 복사 텍스트는 괄호 없이 쉼표로 구분해 읽기 쉽게 구성한다.
  const b = value => value || '';
  const lines = [];
  const addMemo = value => { if (value) lines.push(` 👉 ${b(value)}`); };
  const addIncome = (kind, income, future, age, converted, memo) => {
    lines.push(` 👉 ${[kind, income, future, age].filter(Boolean).join(', ')}`);
    if (future && converted) lines.push(` 👉 장래예상소득 계산값, ${b(converted)}`);
    if (memo) lines.push(` 👉 ${memo}`);
  };

  lines.push('👤 고객정보');
  lines.push(` 👉 ${[val('customerNameInput'), val('customerPhoneInput')].filter(Boolean).join(', ')}`);
  const broker = val('customerBrokerInput');
  if (broker) lines.push(` 👉 중개업소 -> ${broker}`);
  if (val('customerInfoMemo')) lines.push(` 👉 ${val('customerInfoMemo')}`);
  lines.push('');

  const apt = selectedAptInfo || {};
  const area = apt.exclusiveSqm ? `전용 ${apt.exclusiveSqm}` : (apt.pyeong ? `전용 ${apt.pyeong}평` : '');
  const supply = apt.supplyPyeong ? `공급 ${apt.supplyPyeong}` : '';
  const dongHo = apt.dong && apt.ho ? `${apt.dong}동 ${apt.ho}호` : '';
  lines.push('🏢 물건지정보');
  lines.push(` 👉 ${[apt.aptName, area, supply].filter(Boolean).join(', ')}`);
  lines.push(` 👉 ${[apt.address, dongHo, apt.투기과열지구 ? '투기과열' : ''].filter(Boolean).join(', ')}`);
  const propertyKbPrice = val('ltvMarketPriceInput');
  if (propertyKbPrice) lines.push(` 👉 KB시세 : ${propertyKbPrice}`);
  if (val('propertySettlementDate')) lines.push(` 👉 잔금일자 : ${val('propertySettlementDate')}`);
  const propertyMemo = cleanMemo(val('propertyInfoMemo'));
  if (propertyMemo) lines.push(` 👉 물건지 정보  ${propertyMemo}`);
  lines.push('');

  const baseIncomeValue = parseFloat((val('baseIncomeInput') || '').replace(/,/g, '')) || 0;
  const extraIncomeCount = typeof extraIncomeRowIndexes === 'function'
    ? extraIncomeRowIndexes().filter(idx => (incomeRowState.get(idx)?.memoIncome || 0) > 0).length
    : 0;
  const incomeCount = (baseIncomeValue > 0 ? 1 : 0) + extraIncomeCount;
  lines.push(`💰 소득정보${incomeCount >= 2 ? `  합산소득 - ${b(val('totalIncomeOutput'))}` : ''}`);
  const future = typeof applyRateCheck !== 'undefined' && applyRateCheck?.checked;
  const kind = typeof baseIncomeMode !== 'undefined' && baseIncomeMode === '신고' ? (typeof baseDeclareType !== 'undefined' ? baseDeclareType : '추정') : '근로소득';
  addIncome(kind, val('baseIncomeInput'), future ? '장래예상' : '', val('ageInput'), text('baseFutureIncomeConverted'), val('baseIncomeMemo'));
  if (typeof extraIncomeRowIndexes === 'function') extraIncomeRowIndexes().forEach(idx => {
    const st = incomeRowState.get(idx); const els = getRowEls(idx);
    addIncome(st?.mode === '신고' ? (st.declareType || '추정') : '근로소득', els.incomeInput?.value?.trim(), els.applyRateCheck?.checked ? '장래예상' : '', els.ageInput?.value?.trim(), els.futureIncomeConverted?.textContent?.trim(), incomeMemo(idx));
  });
  lines.push('');

  const rows = Array.from(document.querySelectorAll('#mortgage-inputs .mortgage-row'));
  const hasMortgage = rows.some(row => row.querySelector('.mort-loan-category')?.value === '주담대');
  // 신DTI는 주담대 2건 이상일 때만 내용에 포함한다.
  const mortgageCount = rows.filter(row => row.querySelector('.mort-loan-category')?.value === '주담대').length;
  const ratioSummary = [`DSR ${text('DSR확인') || '-'}`, `DTI ${text('DIT확인') || '-'}`];
  if (mortgageCount >= 2) ratioSummary.push(`신DTI ${text('신DTI확인') || '-'}`);
  lines.push(`💲 대출정보 · ${ratioSummary.join(', ')}`);
  rows.forEach((row, index) => {
    const amount = row.querySelector('.mort-amt')?.value?.trim() || '';
    const rate = row.querySelector('.mort-rate')?.value?.trim() || '';
    const term = row.querySelector('.mort-term')?.value?.trim() || '';
    const rateDisplay = rate ? (rate.endsWith('%') ? rate : `${rate}%`) : '';
    const termDisplay = term ? (term.endsWith('개월') ? term : `${term}개월`) : '';
    const type = row.querySelector('.mort-type')?.value?.trim() || '';
    const profile = row.querySelector('.mort-default-profile')?.value === '5Y' ? '5년' : '6개월';
    const grace = row.querySelector('.mort-grace-check')?.checked ? row.querySelector('.mort-grace-term')?.value?.trim() : '';
    const category = row.querySelector('.mort-loan-category')?.value || '';
    if (category === '연간원리금') {
      const annual = row.querySelector('.mort-annual')?.value?.trim() || '';
      const annualDisplay = annual ? `${annual}원` : '';
      if (index === 0) {
        lines.push(` 👉 본건대출금액, ${[category, annualDisplay].filter(Boolean).join(', ')}`);
        if (getMortgageRowMemo(row)) lines.push(` 👉 ${getMortgageRowMemo(row)}`);
      } else {
        lines.push(` 👉 보유대출${index} -> ${[category, annualDisplay].filter(Boolean).join(', ')}`);
        if (getMortgageRowMemo(row)) lines.push(` 👉 ${getMortgageRowMemo(row)}`);
      }
      return;
    }
    if (index === 0) {
      lines.push(` 👉 본건대출금액, ${[category, amount, rateDisplay, termDisplay].filter(Boolean).join(', ')}`);
      lines.push(` 👉 ${[rateDisplay, termDisplay, type, grace ? '거치 ' + grace + '개월' : ''].filter(Boolean).join(', ')}`);
      if (getMortgageRowMemo(row)) lines.push(` 👉 ${getMortgageRowMemo(row)}`);
    } else {
      const loanDetails = [category, amount, rateDisplay, termDisplay, type];
      lines.push(` 👉 보유대출${index} -> ${loanDetails.filter(Boolean).join(', ')}`);
      if (getMortgageRowMemo(row)) lines.push(` 👉 ${getMortgageRowMemo(row)}`);
    }
  });
  return lines.join('\n');
}

/* ───────────────── 금리표가공 하루 1회 조회/저장 ─────────────────
   계산 로직은 건드리지 않고, 금리 원자료를 상담 화면 전용 localStorage에 캐시한다.
   한국시간 09:50 전에는 조회하지 않으며, 09:50 이후에도 같은 날짜에는 한 번만 요청한다. */
const CONSULT_RATE_SHEET_ID = '10fehqfYPhiKwOI6amMNX9lxmsxox3M5SKyW3MaAJH9w';
const CONSULT_RATE_SHEET_NAME = '금리표가공';
const CONSULT_RATE_CACHE_KEY = 'CONSULT_RATE_TABLE_CACHE';
const CONSULT_RATE_CACHE_DATE_KEY = 'CONSULT_RATE_TABLE_CACHE_DATE';
// 신한 금리표 시트에 '작성일/기준일'이 적힌 셀 주소 목록.
// 이 셀(들)에 오늘 날짜가 적혀 있으면 자동 갱신을 건너뛴다.
// 병합 셀에 대비해 날짜가 들어있을 수 있는 셀을 모두 나열한다.
const CONSULT_RATE_SHEET_DATE_CELLS = ['S30', 'T30', 'U30'];

function consultKstNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(new Date()).reduce((out, part) => {
    if (part.type !== 'literal') out[part.type] = part.value;
    return out;
  }, {});
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), minute: Number(parts.minute) };
}

function parseGoogleVisualizationResponse(text) {
  const match = String(text).match(/setResponse\((.*)\);?\s*$/s);
  if (!match) throw new Error('금리표 응답 형식을 읽을 수 없습니다.');
  return JSON.parse(match[1]);
}

function googleSheetCellValue(table, rowIndex = 0, colIndex = 0) {
  const row = table?.rows?.[rowIndex];
  const cell = row?.c?.[colIndex];
  return cell && cell.v !== null && cell.v !== undefined ? String(cell.v).trim() : '';
}

// 구글시트 금리값은 화면/입력값 모두 소수점 둘째 자리까지 반올림한다.
function normalizeConsultRateValue(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const numeric = Number.parseFloat(text.replace(/%/g, '').replace(/,/g, ''));
  return Number.isFinite(numeric) ? String(Number(numeric.toFixed(2))) : text;
}

function normalizeConsultRates(rates) {
  if (!rates || typeof rates !== 'object') return rates;
  const normalized = { ...rates };
  ['sale6M', 'sale5Y', 'jusinbo6M', 'jusinbo2Y', 'dosi6M', 'dosi2Y', 'seoul6M', 'seoul2Y']
    .forEach(key => { normalized[key] = normalizeConsultRateValue(rates[key]); });
  return normalized;
}

function getNormalizedConsultRateCache() {
  const cachedRates = getStoredJson(CONSULT_RATE_CACHE_KEY, null);
  if (!cachedRates) return null;
  const normalizedRates = normalizeConsultRates(cachedRates);
  // 기존 저장값도 읽는 즉시 반올림된 값으로 다시 저장해 저장소 자체를 정리한다.
  if (JSON.stringify(cachedRates) !== JSON.stringify(normalizedRates)) {
    consultLocalStorage.setItem(CONSULT_RATE_CACHE_KEY, JSON.stringify(normalizedRates));
  }
  return normalizedRates;
}

async function fetchConsultRateCell(cellAddress) {
  const url = `https://docs.google.com/spreadsheets/d/${CONSULT_RATE_SHEET_ID}/gviz/tq?tqx=out:json&gid=100298208&range=${encodeURIComponent(cellAddress)}`;
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`금리표 ${cellAddress} HTTP ${response.status}`);
  const payload = parseGoogleVisualizationResponse(await response.text());
  return googleSheetCellValue(payload.table);
}

function hasConsultRateValues(rates) {
  if (!rates || typeof rates !== 'object') return false;
  return ['sale6M', 'sale5Y', 'jusinbo6M', 'jusinbo2Y', 'dosi6M', 'dosi2Y', 'seoul6M', 'seoul2Y']
    .some(key => String(rates[key] ?? '').trim() !== '');
}

/* 오늘자 기준 금리가 이미 확보돼 있는지 판단한다.
   신한 금리표 시트의 "작성일/기준일" 셀(CONSULT_RATE_SHEET_DATE_CELLS)에
   오늘 날짜가 적혀 있으면 자동 갱신을 건너뛴다.
   날짜를 못 읽으면 false를 돌려 기존처럼 조회하므로 동작이 멈추지 않는다. */
/* 시트의 날짜 셀 값을 'YYYY-MM-DD' 문자열로 정규화한다.
   정규화 실패 시 빈 문자열을 돌려준다.

   실제로 시트가 돌려주는 값은 셀 타입에 따라 세 가지 형태가 섞인다.
     1) 텍스트: "2026년 10월 5일 월요일"  ← S30 실제 값
     2) 날짜형: "Date(2026,9,5)"            ← gviz 내부 표기(월이 0부터 셈)
     3) 숫자  : "20261005" (시리얼번호)
   예전 구현은 숫자를 뽑아 8자리인 경우만 '날짜'로 인정했는데,
   1번 형태는 "2026105"(일 7자리)라 통과하지 못하고,
   2번 형태는 "202695"(5자리)라 아예 실패했다. */
function normalizeConsultSheetDate(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  // 2) gviz 날짜 표기: Date(2026,9,5) → 인덱스는 0-based이므로 월/일 +1
  const gvizDate = raw.match(/Date\((\d{4}),\s*(\d{1,2}),\s*(\d{1,2})\)/);
  if (gvizDate) {
    const [, y, m, d] = gvizDate;
    return `${y}-${String(Number(m) + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  // 1) "2026년 10월 5일 월요일" / "2026-10-05" / "2026.10.05" / "2026/10/5"
  const parts = raw.match(/(\d{4})\s*[년\-./]\s*(\d{1,2})\s*[월\-./]\s*(\d{1,2})/);
  if (parts) {
    const [, y, m, d] = parts;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  // 3) 20261005
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  }
  return '';
}

// 셀 하나를 읽고 '오늘 날짜인가'만 판정한다. 실패하면 false(=재조회).
async function consultRateSheetCellIsToday(cellAddress) {
  try {
    const value = await fetchConsultRateCell(cellAddress);
    return normalizeConsultSheetDate(value) === consultKstNow().date;
  } catch (e) {
    return false;
  }
}

/* 시트의 기준일자가 이미 오늘인지 확인한다.
   날짜 전용 셀이 없으면(후보 주소가 비어 있으면) 항상 false를 돌려준다. */
async function consultRateSheetIsUpToDate() {
  if (!CONSULT_RATE_SHEET_DATE_CELLS.length) return false;
  const results = await Promise.all(
    CONSULT_RATE_SHEET_DATE_CELLS.map(consultRateSheetCellIsToday)
  );
  return results.some(Boolean);
}

async function fetchConsultRatesOnceDaily(force = false) {
  const now = consultKstNow();
  // force(금리확인 버튼을 직접 누른 경우)일 땐 시간 조건을 우회해 즉시 조회한다.
  if (!force && (now.hour < 9 || (now.hour === 9 && now.minute < 50))) return null;
  const cachedDate = consultLocalStorage.getItem(CONSULT_RATE_CACHE_DATE_KEY);
  const cachedRates = getNormalizedConsultRateCache();
  // 오늘 날짜로 기록되어 있어도 실제 금리값이 비어 있으면 캐시 완료로 취급하지 않고 재조회한다.
  if (!force && cachedDate === now.date && hasConsultRateValues(cachedRates)) return cachedRates;

  // 시트에 오늘자 기준 금리가 이미 적혀 있으면(CONSULT_RATE_SHEET_DATE_CELLS 설정 시)
  // 값을 다시 받지 않고 캐시를 그대로 쓴다.
  if (!force && await consultRateSheetIsUpToDate() && hasConsultRateValues(cachedRates)) {
    consultLocalStorage.setItem(CONSULT_RATE_CACHE_DATE_KEY, now.date);
    return cachedRates;
  }

  try {
    // 전체 범위 조회는 빈 행/병합셀 때문에 상대 행 인덱스가 달라질 수 있어,
    // 요청받은 셀 주소를 각각 직접 조회한다.
    const [sale6M, sale5Y, jusinbo6M, jusinbo2Y, dosi6M, dosi2Y, seoul6M, seoul2Y] = await Promise.all([
      fetchConsultRateCell('H14'), fetchConsultRateCell('I14'),
      fetchConsultRateCell('C6'), fetchConsultRateCell('D6'),
      fetchConsultRateCell('C14'), fetchConsultRateCell('D14'),
      fetchConsultRateCell('C22'), fetchConsultRateCell('D22')
    ]);
    const rates = normalizeConsultRates({
      sale6M, sale5Y, jusinbo6M, jusinbo2Y, dosi6M, dosi2Y, seoul6M, seoul2Y,
      fetchedAtKST: `${now.date} ${String(now.hour).padStart(2, '0')}:${String(now.minute).padStart(2, '0')}`
    });
    // 응답은 왔지만 실제 값이 하나도 없으면 날짜 캐시를 기록하지 않아 다음 진입 때 재시도한다.
    if (!hasConsultRateValues(rates)) throw new Error('금리표에 읽을 값이 없습니다.');
    consultLocalStorage.setItem(CONSULT_RATE_CACHE_KEY, JSON.stringify(rates));
    consultLocalStorage.setItem(CONSULT_RATE_CACHE_DATE_KEY, now.date);
    return rates;
  } catch (error) {
    console.warn('금리표가공 조회 실패:', error);
    // 기존 정상 캐시는 유지하되, 실패한 날의 조회 완료 날짜는 저장하지 않아 다음 진입 때 재시도한다.
    return hasConsultRateValues(cachedRates) ? cachedRates : null;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  fetchConsultRatesOnceDaily();
});

/* ───────────────── 저장된 금리표 → 본건 금리입력창 적용 ─────────────────
   기존 계산 로직은 수정하지 않고, 금리 프로필 선택 후 입력값만 별도로 적용한다. */
function consultCachedRateValue(category, profile) {
  const rates = getNormalizedConsultRateCache();
  if (!rates) return '';
  if (category === '담보') return profile === '5Y' ? rates.sale5Y : rates.sale6M;
  if (category === '주신보') return profile === '2Y' ? rates.jusinbo2Y : rates.jusinbo6M;
  if (category === '도보') return profile === '2Y' ? rates.dosi2Y : rates.dosi6M;
  if (category === '서보') return profile === '2Y' ? rates.seoul2Y : rates.seoul6M;
  return '';
}

function consultCurrentRateCategory() {
  const loanType = consultLocalStorage.getItem('DSR_propertyLoanType') || '담보';
  const guarantee = consultLocalStorage.getItem('DSR_propertyJeonseGuarantee') || '';
  if (loanType !== '전세') return '담보';
  if (guarantee === '도시보증') return '도보';
  if (guarantee === '서울보증') return '서보';
  return '주신보';
}

function applyConsultCachedRateToFirstRow() {
  const row = document.querySelector('#mortgage-inputs .mortgage-row.first-row');
  if (!row) return;

  // 새로고침/불러오기로 저장된 값을 복원한 뒤에는 덮어쓰지 않는다.
  // (사용자가 직접 입력한 본건 금리·ST금리·기간이 기본값으로 되돌아가던 원인)
  // 기본값은 사용자가 [6M/5Y 전환] 버튼을 누르거나 구분(담보/전세)을 바꿀 때만 적용된다.
  if (isDsrRestoring() || isDsrRestoredFromStorage()) return;

  const loanType = consultLocalStorage.getItem('DSR_propertyLoanType') || '담보';
  const housingStatus = consultLocalStorage.getItem('CONSULT_housingStatus') || '무주택';
  const profile = row.querySelector('.mort-default-profile')?.value || row.querySelector('.mort-default-switch')?.dataset.profile || '6M';
  const stRateInput = row.querySelector('.mort-st-rate');
  const termInput = row.querySelector('.mort-term');

  // 구분과 금리 프로필에 따라 본건 대출의 ST금리/기간을 적용한다.
  // 담보는 기본값 설정 팝업에 저장한 6M/5Y 값을 우선 사용하고,
  // 전세는 기존의 주택 보유 여부별 고정값을 사용한다.
  const savedData = getStoredJson("DEFAULT_FIRST_ROW_DATA");
  const savedProfileValues = getDefaultProfileValues(profile, savedData);

  // 사용자가 이 프로필(6M/5Y)에서 직접 입력해 둔 값이 있으면 그것을 우선한다.
  // (없을 때만 기본값 설정 팝업의 값 → 신한은행 캐시 금리 순으로 사용)
  const userValues = getFirstRowProfileValues()[profile] || null;
  const pickUser = (key) => {
    const v = userValues ? userValues[key] : '';
    return (v !== undefined && v !== null && String(v).trim() !== '') ? String(v) : '';
  };

  if (stRateInput) {
    // [2026-11-11 변경] ST금리 저장소를 구분별로 분리했다.
    //  · 주담대 6M → DSR_firstRowStRate_주담대_6M
    //  · 주담대 2Y → DSR_firstRowStRate_주담대_2Y
    //  · 전세대     → DSR_firstRowStRate_전세대
    // 저장된 값이 있으면 그 값을, 없으면 전세대는 빈값 / 담보는 기본값을 쓴다.
    const savedStRate = getFirstRowStRate(row);
    let stRate;
    if (savedStRate !== null && String(savedStRate).trim() !== '') {
      stRate = String(savedStRate);
    } else if (loanType === '전세') {
      stRate = '';
    } else {
      stRate = pickUser('stRate') || savedProfileValues.stRate || (profile === '5Y' || profile === '2Y' ? '1.5' : '3');
    }
    if (stRateInput.value !== stRate) {
      stRateInput.value = stRate;
      stRateInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  if (termInput) {
    // 사다리: 구분별 전용 저장소 → 사용자 입력값 → 기본값 설정 팝업 → 360
    const savedTerm = getFirstRowTerm(row);
    let term;
    if (savedTerm !== null) {
      term = String(savedTerm);
    } else if (loanType === '전세') {
      term = '24';
    } else {
      term = pickUser('term') || savedProfileValues.term || '360';
    }
    if (termInput.value !== term) {
      termInput.value = term;
      termInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  // 금리도 구분별 전용 저장소 → 사용자가 입력한 값 → 기본값 설정 팝업 저장값 → 신한은행 캐시 금리 순으로 적용한다.
  const savedRate = getFirstRowRate(row);
  // [2026-11-11 변경] 주담대 저장소 키가 이미 있고 값이 비어 있으면 "빈값 유지"다.
  //  (원리금에서 쓰던 값·기본값을 다시 읽어와 주담대 칸에 되살리는 것을 막는다)
  const isBlankDamBoRate = (row.querySelector('.mort-loan-category')?.value || '') !== '원리금'
    && savedRate !== null && String(savedRate).trim() === '';
  const value = (savedRate !== null && String(savedRate).trim() !== '' ? String(savedRate) : '')
    || (isBlankDamBoRate ? '' : (pickUser('rate') || savedProfileValues.rate || consultCachedRateValue(consultCurrentRateCategory(), profile)));
  const rateInput = row.querySelector('.mort-rate');
  if (!value || !rateInput) return;
  rateInput.value = String(value);
  rateInput.dispatchEvent(new Event('input', { bubbles: true }));
}

// [6M/5Y 전환] 버튼에만 리스너를 붙인다.
// 예전에는 이 함수가 끝에서 applyConsultCachedRateToFirstRow()를 직접 불렀는데,
// 그 때문에 새로고침/불러오기로 복원한 본건 금리·ST금리·기간이 기본값으로 덮어써졌다.
// 기본값 적용은 사용자가 전환 버튼을 누를 때만 일어나야 한다.
function bindConsultCachedRateToProfile() {
  const row = document.querySelector('#mortgage-inputs .mortgage-row.first-row');
  const profileButton = row?.querySelector('.mort-default-switch');
  if (!profileButton || profileButton.dataset.cachedRateBound === 'true') return;
  profileButton.dataset.cachedRateBound = 'true';
  profileButton.addEventListener('click', () => setTimeout(applyConsultCachedRateToFirstRow, 0));
}

window.addEventListener('DOMContentLoaded', () => setTimeout(() => {
  bindConsultCachedRateToProfile();
}, 0));
// 구분(담보/전세)·주택보유 여부가 바뀌면 기본값을 다시 적용한다.
// 단, 화면 초기화(복원) 중에 발생한 이벤트는 무시한다 — 복원된 본건 금리·ST금리·기간을
// 기본값으로 덮어쓰지 않기 위함이다.
window.addEventListener('consultLoanTypeChanged', () => setTimeout(() => {
  // 복원 직후(저장값을 화면에 올린 상태)에는 기본값을 다시 적용하지 않는다.
  if (isDsrRestoring() || isDsrRestoredFromStorage()) return;
  bindConsultCachedRateToProfile();
  applyConsultCachedRateToFirstRow();
  applyOtherRowsBlock();
}, 0));
window.addEventListener('housingStatusChanged', () => setTimeout(() => {
  if (isDsrRestoring() || isDsrRestoredFromStorage()) return;
  applyConsultCachedRateToFirstRow();
}, 0));

function renderConsultRateCacheTable() {
  const saleBody = document.getElementById('consultRateSaleTableBody');
  const jeonseBody = document.getElementById('consultRateJeonseTableBody');
  const updated = document.getElementById('consultRateCacheUpdatedAt');
  if (!saleBody || !jeonseBody) return;
  const rates = getNormalizedConsultRateCache();
  if (!rates) {
    saleBody.innerHTML = '<tr><td colspan="3">조회값 없음</td></tr>';
    jeonseBody.innerHTML = '<tr><td colspan="3">조회값 없음</td></tr>';
    if (updated) updated.textContent = '아직 조회되지 않았습니다.';
    return;
  }
  saleBody.innerHTML = `<tr><td>담보</td><td>${rates.sale6M || '-'}</td><td>${rates.sale5Y || '-'}</td></tr>`;
  jeonseBody.innerHTML = [
    ['주신보', rates.jusinbo6M, rates.jusinbo2Y],
    ['도시보증', rates.dosi6M, rates.dosi2Y],
    ['서울보증', rates.seoul6M, rates.seoul2Y]
  ].map(row => `<tr><td>${row[0]}</td><td>${row[1] || '-'}</td><td>${row[2] || '-'}</td></tr>`).join('');
  if (updated) updated.textContent = rates.fetchedAtKST ? `마지막 조회: ${rates.fetchedAtKST}` : '';
}

// [변경] 예전에는 document 클릭 위임으로 처리했는데, 모달 카드(#modal-text-card)에
// onclick="event.stopPropagation()"이 걸려 있어 위임 리스너가 document까지 도달하지
// 못해 '금리확인' 버튼이 아예 실행되지 않았다. 이제 버튼에 직접 바인딩한다.
// (모달 카드 안에 있는 요소라 stopPropagation에 막히지 않는다.)
async function handleConsultRateRefreshClick(event) {
  const btn = event.currentTarget;
  if (btn.disabled) return;
  btn.disabled = true;
  btn.textContent = '조회 중...';
  try {
    // '금리확인' 버튼은 사용자가 명시적으로 누른 것이므로, 시트 날짜가 오늘이더라도
    // 항상 새로 조회한다. (날짜 판정은 자동 조회 쪽에서만 쓰인다)
    await fetchConsultRatesOnceDaily(true);
    renderConsultRateCacheTable();
    if (typeof showBubble === 'function') showBubble('금리표를 갱신했습니다');
  } finally {
    btn.disabled = false;
    btn.textContent = '금리확인';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('consultRateRefreshBtn');
  if (btn && btn.dataset.refreshBound !== 'true') {
    btn.dataset.refreshBound = 'true';
    btn.addEventListener('click', handleConsultRateRefreshClick);
  }
});

window.addEventListener('DOMContentLoaded', renderConsultRateCacheTable);
