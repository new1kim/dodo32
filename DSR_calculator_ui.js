/* DSR계산기ETC - 그 외 코드 (UI, 이벤트, 모달, 로컬스토리지 등) */

/* localStorage 저장/불러오기 대상 입력창 셀렉터 (여러 함수에서 공용으로 사용) */
const TEXT_NUMBER_INPUT_SELECTOR = 'input[type="text"], input[type="number"]';
const CHECKBOX_INPUT_SELECTOR = 'input[type="checkbox"]';

function getStoredJson(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.warn(`저장 데이터가 손상되어 초기화했습니다: ${key}`, e);
    localStorage.removeItem(key);
    return fallback;
  }
}

/* getStoredJson의 짝. 저장 용량 초과(iOS 사파리 시크릿 모드 등)로 setItem이 던져도
   계산 화면 자체는 계속 쓸 수 있어야 하므로 예외를 삼키고 경고만 남긴다. */
function setStoredJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
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
  const imageModal = document.getElementById("image-modal");
  if (imageModal) imageModal.style.display = "none";
}

function setMortgageRepaymentType(btn, type) {
  const row = btn.closest('tr');
  if (!row) return;
  const typeInput = row.querySelector('.mort-type');
  if (typeInput) typeInput.value = type;
  const buttons = btn.parentElement.querySelectorAll('.type-btn');
  buttons.forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (typeof 자동계산 === 'function') 자동계산();
  if (typeof saveDSRInputs === 'function') saveDSRInputs();
}

// 보유대출 "주담대" 단일 토글: 기본값은 "신용"(이자만 반영)이며,
// 이 버튼을 눌러 켜면(active) "주담대"로 간주해 원리금 전액을 반영한다.
// 원리금/원금/만기 토글과는 독립적으로 중복 선택 가능.
function toggleLoanCategory(btn) {
  const row = btn.closest('tr');
  if (!row) return;
  const categoryInput = row.querySelector('.mort-loan-category');
  const isNowActive = !btn.classList.contains('active');
  btn.classList.toggle('active', isNowActive);
  if (categoryInput) categoryInput.value = isNowActive ? '주담대' : '신용';
  if (typeof 자동계산 === 'function') 자동계산();
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

    const maxWidth = el.clientWidth - 10; 
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
  if (profile === '5Y') {
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

function applyDefaultProfileToRow(row, profile) {
  const savedData = getStoredJson("DEFAULT_FIRST_ROW_DATA");
  const values = getDefaultProfileValues(profile, savedData);

  const rateInput = row.querySelector('.mort-rate');
  const stRateInput = row.querySelector('.mort-st-rate');
  const termInput = row.querySelector('.mort-term');
  const profileInput = row.querySelector('.mort-default-profile');

  if (rateInput && values.rate !== '') rateInput.value = values.rate;
  if (stRateInput && values.stRate !== '') stRateInput.value = values.stRate;
  if (termInput && values.term !== '') termInput.value = values.term;
  if (profileInput) profileInput.value = profile;

  const profileSelect = row.querySelector('.mort-default-switch');
  if (profileSelect) {
    profileSelect.dataset.profile = profile;
    profileSelect.classList.toggle('active', profile === '5Y');
    profileSelect.querySelectorAll('.switch-label').forEach(label => {
      const labelValue = label.textContent.trim();
      const isActive = profile === '5Y' ? labelValue === '5Y' : labelValue === '6M';
      label.classList.toggle('active', isActive);
    });
  }

  if (rateInput || stRateInput || termInput) {
    showBubble(profile === '5Y' ? '5Y 기본값 적용' : '6M 기본값 적용');
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
      if (typeof 자동계산 === 'function') 자동계산();
    });
  });
  
  row.querySelectorAll('.mort-rate, .mort-st-rate').forEach(el => {
    el.addEventListener("input", (e) => {
      e.target.value = e.target.value.replace(/[^0-9.]/g, '');
      if (typeof 자동계산 === 'function') 자동계산();
    });
  });

  row.querySelectorAll('.mort-grace-term').forEach(el => {
    el.addEventListener("input", (e) => {
      e.target.value = e.target.value.replace(/\D/g, '');
      if (typeof 자동계산 === 'function') 자동계산();
    });
  });

  const profileSelect = row.querySelector('.mort-default-switch');
  if (profileSelect) {
    profileSelect.addEventListener('click', () => {
      const nextProfile = profileSelect.dataset.profile === '6M' ? '5Y' : '6M';
      profileSelect.dataset.profile = nextProfile;
      profileSelect.classList.toggle('active', nextProfile === '5Y');
      applyDefaultProfileToRow(row, nextProfile);
      if (typeof saveDSRInputs === 'function') saveDSRInputs();
    });
  }

  row.querySelectorAll('.mort-rate, .mort-st-rate, .mort-term').forEach(el => {
    bindLongPress(el, 3000, () => {
      const rows = Array.from(document.querySelectorAll('#mortgage-inputs .mortgage-row'));
      if (rows.indexOf(row) === 0) openDefaultFirstRowModal();
    });
  });

  row.querySelectorAll(CHECKBOX_INPUT_SELECTOR).forEach(el => {
    el.addEventListener("change", (e) => {
      if (e.target.classList.contains('mort-exclude')) showBubble(e.target.checked ? "계산 제외" : "대출 적용");
      if (e.target.classList.contains('mort-grace-check')) showBubble(e.target.checked ? "거치 적용" : "거치 해제");
      if (typeof 자동계산 === 'function') 자동계산();
    });

    if (el.classList.contains('mort-exclude')) {
      bindLongPress(el, 2000, () => {
        if (document.querySelectorAll('#mortgage-inputs .mortgage-row').length > 1) {
          const memoRow = row.nextElementSibling;
          if (memoRow && memoRow.classList.contains('mortgage-memo-row')) memoRow.remove();
          row.remove();
          showBubble("해당 대출 정보 삭제 완료");
          updateMortgagePlaceholders();
          if (typeof 자동계산 === 'function') 자동계산();
          if (typeof saveDSRInputs === 'function') saveDSRInputs();
        }
      });
    }
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

// 금액 1,000,000원 증가 기능
function increaseAmount(btn) {
  const row = btn.closest('.mort-amount-row');
  if (!row) return;
  const input = row.querySelector('.mort-amt');
  if (!input) return;
  
  let currentVal = parseInt(input.value.replace(/,/g, '')) || 0;
  currentVal += 1000000;
  input.value = currentVal.toLocaleString();
  
  if (typeof 자동계산 === 'function') 자동계산();
  if (typeof saveDSRInputs === 'function') saveDSRInputs();
}

// 금액 1,000,000원 감소 기능
function decreaseAmount(btn) {
  const row = btn.closest('.mort-amount-row');
  if (!row) return;
  const input = row.querySelector('.mort-amt');
  if (!input) return;
  
  let currentVal = parseInt(input.value.replace(/,/g, '')) || 0;
  currentVal -= 1000000;
  if (currentVal <= 0) {
    input.value = "";
  } else {
    input.value = currentVal.toLocaleString();
  }
  
  if (typeof 자동계산 === 'function') 자동계산();
  if (typeof saveDSRInputs === 'function') saveDSRInputs();
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

function 주담대행추가() {
  mortCount++;
  const tbody = document.getElementById('mortgage-inputs');
  if (!tbody) return;
  const newRow = document.createElement('tr');
  const isFirstRow = mortCount === 1;
  newRow.className = isFirstRow ? "mortgage-row first-row" : "mortgage-row";
  newRow.style.textAlign = "center";
  const profileSelectMarkup = isFirstRow ? `<button type="button" class="mort-default-switch" data-profile="6M" aria-label="6M/5Y 전환"><span class="switch-label active">6M</span><span class="switch-label">5Y</span></button>` : '';

  // 본건(첫 행) 금액 입력 영역: 기존 구조 그대로 유지 (수정 금지)
  const firstRowAmountMarkup = `
    <div class="input-flex-col">
      <div class="mort-amount-row">
        <button type="button" class="amount-btn amount-plus" onclick="increaseAmount(this)">+</button>
        <button type="button" class="amount-btn amount-minus" onclick="decreaseAmount(this)">-</button>
        <input type="text" inputmode="numeric" placeholder="" class="mort-amt">
      </div>
      <input type="hidden" class="mort-default-profile" value="6M">
      <div class="input-flex-row">
        ${profileSelectMarkup}
        <input type="text" inputmode="decimal" placeholder="금리 %" class="mort-rate">
        <input type="text" inputmode="decimal" placeholder="ST %" class="mort-st-rate">
      </div>
    </div>
  `;

  // 추가되는 행(보유대출) 금액 입력 영역: ST금리 삭제, +/- 버튼 세로 배치, 금리 입력을 금액 옆에 배치
  const addedRowAmountMarkup = `
    <div class="mort-amount-row mort-amount-row--added">
      <div class="amount-btn-stack">
        <button type="button" class="amount-btn amount-plus" onclick="increaseAmount(this)">+</button>
        <button type="button" class="amount-btn amount-minus" onclick="decreaseAmount(this)">-</button>
      </div>
      <input type="text" inputmode="numeric" placeholder="" class="mort-amt">
      <input type="text" inputmode="decimal" placeholder="금리 %" class="mort-rate">
    </div>
  `;

  newRow.innerHTML = `
    <td class="no-bg" style="padding: 2px; vertical-align: middle;">
      <div class="mort-exclude-cell">
        <input type="checkbox" class="mort-exclude" title="계산제외">
      </div>
    </td>
    <td class="no-bg" style="padding: 4px 4px;">
      ${isFirstRow ? firstRowAmountMarkup : addedRowAmountMarkup}
    </td>
    <td class="no-bg" style="padding: 4px 2px;">
      <input type="text" inputmode="numeric" placeholder="개월" class="mort-term">
    </td>
    <td class="no-bg" style="padding: 4px 3px;">
      <div class="type-btn-row">
        <div class="type-btn-group">
          <button type="button" class="type-btn active" onclick="setMortgageRepaymentType(this, '원리금')">원리금</button>
          <button type="button" class="type-btn" onclick="setMortgageRepaymentType(this, '원금')">원금</button>
          <button type="button" class="type-btn" onclick="setMortgageRepaymentType(this, '만기')">만기</button>
        </div>
        ${isFirstRow ? '' : `<button type="button" class="mort-category-toggle" onclick="toggleLoanCategory(this)">주담대</button>`}
      </div>
      <input type="hidden" class="mort-type" value="원리금">
      ${isFirstRow ? '' : `<input type="hidden" class="mort-loan-category" value="신용">`}
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
  memoRow.innerHTML = `
    <td colspan="4" class="no-bg">
      <input type="text" class="mort-memo" placeholder="메모 입력" lang="ko" inputmode="text" autocomplete="off">
    </td>
  `;
  tbody.appendChild(memoRow);

  bindMortgageRowEvents(newRow);
  if (isFirstRow) {
    applyDefaultProfileToRow(newRow, '6M');
  }
  updateMortgagePlaceholders();
  adjustTableFontSize();
  fitAllNumericInputFontSizes();
  if (typeof 자동계산 === 'function') 자동계산();
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
      
      let tempRate = 1.0;
      if (applyRateCheck && applyRateCheck.checked && ageInput && ageInput.value !== '') {
          const tempAge = parseAgeInputValue(ageInput.value);

          if (tempAge >= 0) {
              const matched = LOAN_RATE_TABLE.find(item => tempAge >= item.minAge && tempAge <= item.maxAge);
              if (matched) tempRate = matched.percent / 100.0;
          }
      }
      const tempFinal = memoBaseIncome * tempRate;
      if (hiddenIncomeInput) hiddenIncomeInput.value = tempFinal > 0 ? Math.floor(tempFinal).toLocaleString() : "";
      if (typeof 자동계산 === 'function') 자동계산();
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
      if (baseTitleEl) delete baseTitleEl.dataset.labelOverride;
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
    bubbleListEl.style.left = (rect.right + 10) + 'px';
    bubbleListEl.style.top = (rect.top + rect.height / 2 - bubbleListEl.offsetHeight / 2) + 'px';
  };
  const openBubble = () => {
    // 이미 선택되어 있는 값(증빙 or 현재 declareType)은 버블 목록에서 감춘다 - 삭제/초기화 같은
    // 동작 항목은 선택 상태와 무관하므로 항상 표시한다.
    const modeChecked = [...modeRadios].find(r => r.checked);
    const activeValue = (modeChecked && modeChecked.value === '신고')
      ? (([...typeRadios].find(r => r.checked) || {}).value)
      : '증빙';
    bubbleListEl.querySelectorAll('.declare-type-bubble-item').forEach(item => {
      const value = item.dataset.value;
      if (value === '삭제' || value === '초기화') return;
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

/* "소득 추가" 버튼 옆에서 증빙/카드 중 어떤 종류로 새 행을 만들지 먼저 고르는 버블.
   행 생성 전에 뜨는 버블이라 기존 declare-type-bubble-list를 그대로 재사용하되,
   기존 행에 딸린 라디오 상태와는 무관하게 독립적으로 동작한다. */
const incomeAddTypeBubbleList = document.getElementById('incomeAddTypeBubbleList');
let openIncomeAddTypeBubble = null;
if (incomeAddTypeBubbleList) {
  document.body.appendChild(incomeAddTypeBubbleList);

  const positionAddBubble = (triggerEl) => {
    const rect = triggerEl.getBoundingClientRect();
    incomeAddTypeBubbleList.style.left = (rect.right + 10) + 'px';
    incomeAddTypeBubbleList.style.top = (rect.top + rect.height / 2 - incomeAddTypeBubbleList.offsetHeight / 2) + 'px';
  };
  const closeAddBubble = () => incomeAddTypeBubbleList.classList.remove('open');

  openIncomeAddTypeBubble = (triggerEl) => {
    incomeAddTypeBubbleList.classList.add('open');
    positionAddBubble(triggerEl);
  };

  incomeAddTypeBubbleList.querySelectorAll('.declare-type-bubble-item').forEach(item => {
    const value = item.dataset.value;
    item.addEventListener('mousedown', (e) => {
      e.preventDefault();
      closeAddBubble();
      소득행추가(undefined, false, value);
    });
  });

  document.addEventListener('click', (e) => {
    const btn = document.querySelector('.income-add-btn');
    if (e.target === btn || incomeAddTypeBubbleList.contains(e.target)) return;
    closeAddBubble();
  });
  document.body.addEventListener('scroll', closeAddBubble, { passive: true });
}

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
          <div class="income-title" id="incomeTitle_${index}">소득${index}</div>
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
                <span class="rate-toggle-text">
                  <label for="applyRateCheck_${index}">장래예상</label>
                  <span id="rateDisplay_${index}" class="rate-display" style="display:none;">(-)</span>
                </span>
                <input type="checkbox" id="applyRateCheck_${index}">
              </span>
              <input type="number" id="ageInput_${index}" class="age-input" placeholder="32 or 1992" style="display:none;">
              <span id="futureIncomeConverted_${index}" class="future-income-converted" style="display:none;"></span>
            </div>
          </div>
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
          <input type="text" id="incomeMemo_${index}" class="income-memo" placeholder="메모 입력" lang="ko" inputmode="text" autocomplete="off">
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
  const matched = LOAN_RATE_TABLE.find(item => age >= item.minAge && age <= item.maxAge);
  const rate = matched ? matched.percent / 100 : 1;
  const isDeclareMode = st.mode === '신고';
  const rateApplies = els.applyRateCheck.checked && !isDeclareMode; // 신고소득 모드에서는 장래예상 미적용
  els.rateDisplay.innerText = `(${matched ? matched.percent + "%" : "-"})`;
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
  if (els.incomeInput) els.incomeInput.style.display = isDeclare ? 'none' : '';
  if (els.declareInputGroup) els.declareInputGroup.style.display = isDeclare ? 'flex' : 'none';
  if (els.declareAmountInput) {
    els.declareAmountInput.style.display = isDeclare ? '' : 'none';
    els.declareAmountInput.placeholder = DECLARE_AMOUNT_PLACEHOLDERS[st.declareType] || '금액 입력';
    const amt = st.memoDeclareAmounts[st.declareType] || 0;
    els.declareAmountInput.value = amt > 0 ? amt.toLocaleString() : '';
  }
  // 장래예상(체크박스+나이+요율) 한 줄은 추정 모드에서는 숨기고, 증빙 모드에서는 체크박스만
  // 항상 보이다가 체크했을 때만 나이/요율이 옆에 나타난다.
  if (els.futureIncomeRow) els.futureIncomeRow.style.display = isDeclare ? 'none' : '';
  const showAgeAndRate = !isDeclare && els.applyRateCheck && els.applyRateCheck.checked;
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
  extraIncomeRowIndexes().forEach(idx => {
    const els = getRowEls(idx);
    [els.incomeInput, els.declareAmountInput, els.ageInput, els.applyRateCheck, ...els.modeRadios].forEach(el => {
      if (el) el.disabled = blocked;
    });
    if (els.row) els.row.classList.toggle('income-row-blocked', blocked);
    updateRowIncomeCalc(idx); // blocked 여부에 맞춰 합산 포함/제외를 다시 반영
  });
  if (blocked && !otherRowsWereBlocked) {
    showBubble('건보/연금 소득은 다른 소득에 합산이 불가합니다');
  }
  otherRowsWereBlocked = blocked;
  if (typeof 자동계산 === 'function') 자동계산();
}

function relabelIncomeRows() {
  document.querySelectorAll('.income-data-row').forEach((row, i) => {
    const titleEl = row.querySelector('.income-title');
    if (!titleEl) return;
    // 카드/건보/연금 등 선택된 라벨을 표시 중인 행(labelOverride)은 번호로 덮어쓰지 않는다.
    if (titleEl.dataset.labelOverride === '1') return;
    titleEl.textContent = `소득${i + 1}`;
  });
}

// explicitIndex: 저장된 값 복원 시 원래 인덱스 그대로 재생성하기 위해 사용 (삭제로 인덱스에 구멍이 생길 수 있음).
// isRestore: true면 새로고침 복원 과정이므로 선택 버블을 자동으로 띄우지 않는다.
// presetType: 소득추가 버튼의 사전 선택 버블(증빙/카드)에서 이미 종류를 고르고 들어온 경우 - 행 생성 직후
//             해당 종류를 바로 적용하고, 뒤이어 뜨는 증빙/카드/삭제 선택 버블은 띄우지 않는다.
function 소득행추가(explicitIndex, isRestore, presetType) {
  const index = (typeof explicitIndex === 'number') ? explicitIndex : nextIncomeRowIndex++;
  if (index >= nextIncomeRowIndex) nextIncomeRowIndex = index + 1;
  const table = document.querySelector('.income-table');
  if (!table) return;
  table.insertAdjacentHTML('beforeend', buildIncomeRowHTML(index));
  incomeRowState.set(index, {
    mode: '증빙',
    declareType: '카드',
    memoIncome: 0,
    memoIncomeDirect: 0,
    memoDeclareAmounts: { '카드': 0, '건강': 0, '연금': 0 },
    isEditing: false,
  });
  const titleBubble = wireIncomeRow(index);
  applyIncomeRowMode(index);
  applyOtherRowsBlock();
  relabelIncomeRows();
  adjustTableFontSize();
  showBubble(`소득${index} 행이 추가되었습니다`);

  if (presetType) {
    const els = getRowEls(index);
    if (presetType === '카드') {
      // 종류(카드)를 먼저 반영해야, 뒤이어 모드를 "신고"로 바꿀 때 실행되는 라벨/제목 갱신 로직이
      // 방금 고른 종류를 정확히 읽는다(순서가 바뀌면 이전 종류로 표시됨).
      const typeRadio = [...els.typeRadios].find(r => r.value === '카드');
      if (typeRadio && !typeRadio.checked) {
        typeRadio.checked = true;
        typeRadio.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const modeRadio = [...els.modeRadios].find(r => r.value === '신고');
      if (modeRadio && !modeRadio.checked) {
        modeRadio.checked = true;
        modeRadio.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } else {
      const modeRadio = [...els.modeRadios].find(r => r.value === '증빙');
      if (modeRadio && !modeRadio.checked) {
        modeRadio.checked = true;
        modeRadio.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  } else if (!isRestore && titleBubble) {
    // 소득 추가 버튼을 눌러 새로 만든 행은 곧바로 증빙/카드/삭제 버블을 띄워 종류를 고르게 한다.
    // setTimeout으로 다음 틱에 열어야, 지금 이 클릭 이벤트가 document까지 버블링되면서 바로 닫아버리는 것을 피할 수 있다.
    setTimeout(() => titleBubble.openBubble(), 0);
  }
  return index;
}

/* "소득 추가" 버튼: 1번 행이 건보/연금이면 합산 자체가 불가하므로 행을 만들지 않고 안내만 띄운다.
   그 외(증빙/카드)에는 행을 만들기 전에 먼저 증빙/카드 중 어떤 종류로 추가할지 버블로 고르게 한다. */
function handleAddIncomeClick(triggerEl) {
  if (isOtherIncomeBlocked()) {
    showBubble('건보 또는 연금은 소득합산 불가');
    return;
  }
  if (typeof openIncomeAddTypeBubble === 'function') openIncomeAddTypeBubble(triggerEl);
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
// table의 overflow:hidden에 잘리지 않도록 body 바로 아래로 옮기고 position:fixed 좌표를 매번 계산한다.
const copyMenuBtn = document.getElementById("copy-menu-btn");
const copyMenuList = document.getElementById("copyMenuList");
if (copyMenuBtn && copyMenuList) {
  document.body.appendChild(copyMenuList);
  const positionCopyMenu = () => {
    const rect = copyMenuBtn.getBoundingClientRect();
    copyMenuList.style.left = (rect.left + rect.width / 2) + 'px';
    copyMenuList.style.top = (rect.bottom + 6) + 'px';
  };
  copyMenuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    positionCopyMenu();
    copyMenuList.classList.toggle("open");
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
  if (baseIncomeMemo) baseIncomeMemo.value = "";

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
    if (el && el.id) localStorage.removeItem(`DSR_${el.id}`);
  });
  localStorage.removeItem('DSR_radio_base_income_mode');
  localStorage.removeItem('DSR_radio_base_declare_type');
  ['카드', '건강', '연금'].forEach(type => localStorage.removeItem(`DSR_declareAmt_base_${type}`));
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

  if (ltvMarketPriceInput) ltvMarketPriceInput.value = "";
  const ltvMaxAmountOutput = document.getElementById("ltvMaxAmountOutput");
  if (ltvMaxAmountOutput) ltvMaxAmountOutput.value = "";
  if (ltvMinorLeaseInput) ltvMinorLeaseInput.value = "";

  const firstRow = document.querySelector('#mortgage-inputs .mortgage-row');
  if (firstRow) {
    const mortAmt = firstRow.querySelector('.mort-amt');
    if (mortAmt) mortAmt.value = '';
    
    const rateInput = firstRow.querySelector('.mort-rate');
    if (rateInput) rateInput.value = savedDefaultFirstRowData?.rate || '';
    
    const stRateInput = firstRow.querySelector('.mort-st-rate');
    if (stRateInput) stRateInput.value = savedDefaultFirstRowData?.stRate || '';
    
    const termInput = firstRow.querySelector('.mort-term');
    if (termInput) termInput.value = savedDefaultFirstRowData?.term || '';

    const firstMemoRow = firstRow.nextElementSibling;
    if (firstMemoRow && firstMemoRow.classList.contains('mortgage-memo-row')) {
      const firstMemoInput = firstMemoRow.querySelector('.mort-memo');
      if (firstMemoInput) firstMemoInput.value = '';
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
  }

  document.querySelectorAll(TEXT_NUMBER_INPUT_SELECTOR).forEach(input => {
    if (input.id) localStorage.removeItem(`DSR_${input.id}`);
  });
  document.querySelectorAll(CHECKBOX_INPUT_SELECTOR).forEach(checkbox => {
    if (checkbox.id) localStorage.removeItem(`DSR_${checkbox.id}`);
  });
  localStorage.removeItem('DSR_radio_base_income_mode');
  localStorage.removeItem('DSR_radio_base_declare_type');
  // 소득2 이후 행(income_mode_N / declare_type_N / declareAmt_N_*)은 몇 개였는지 몰라도
  // 접두어로 한 번에 훑어서 지운다.
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith('DSR_radio_income_mode_') || key.startsWith('DSR_radio_declare_type_') || key.startsWith('DSR_declareAmt_')) {
      localStorage.removeItem(key);
    }
  });
  localStorage.removeItem('DSR_incomeRowIndexes');
  localStorage.removeItem('DSR_mortgageData');
  localStorage.removeItem('DSR_selectedAptInfo');
  selectedAptInfo = null;
  renderSelectedAptRow();

  updateIncomeCalc();
  showBubble("입력 내용이 초기화되었습니다.");
}

function saveDSRInputs() {
  localStorage.setItem('DSR_selectedAptInfo', selectedAptInfo ? JSON.stringify(selectedAptInfo) : '');
  document.querySelectorAll(TEXT_NUMBER_INPUT_SELECTOR).forEach(input => {
    if (input.id) localStorage.setItem(`DSR_${input.id}`, input.value);
  });
  document.querySelectorAll(CHECKBOX_INPUT_SELECTOR).forEach(checkbox => {
    if (checkbox.id) localStorage.setItem(`DSR_${checkbox.id}`, checkbox.checked);
  });
  // 증빙/신고 및 카드·건강·연금 선택 상태도 함께 저장 (새로고침 후에도 환산 금액이 바로 계산되도록)
  const saveRadioAndAmounts = (modeName, typeName, amountKey, amounts) => {
    const modeChecked = document.querySelector(`input[name="${modeName}"]:checked`);
    if (modeChecked) localStorage.setItem(`DSR_radio_${modeName}`, modeChecked.value);
    const typeChecked = document.querySelector(`input[name="${typeName}"]:checked`);
    if (typeChecked) localStorage.setItem(`DSR_radio_${typeName}`, typeChecked.value);
    // 추정(카드/건보/연금) 버튼별 입력 금액을 각각 따로 저장 (공용 입력창 하나를 돌려쓰기 때문에 종류별로 키를 분리해야 함)
    ['카드', '건강', '연금'].forEach(type => {
      localStorage.setItem(`DSR_declareAmt_${amountKey}_${type}`, amounts[type] || 0);
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
      exclude: row.querySelector('.mort-exclude')?.checked || false,
      amount: row.querySelector('.mort-amt')?.value || '',
      rate: row.querySelector('.mort-rate')?.value || '',
      stRate: row.querySelector('.mort-st-rate')?.value || '',
      term: row.querySelector('.mort-term')?.value || '',
      repaymentType: row.querySelector('.mort-type')?.value || '원리금',
      loanCategory: row.querySelector('.mort-loan-category')?.value || '신용',
      graceCheck: row.querySelector('.mort-grace-check')?.checked || false,
      graceTerm: row.querySelector('.mort-grace-term')?.value || '',
      memo: row.nextElementSibling?.classList.contains('mortgage-memo-row')
        ? (row.nextElementSibling.querySelector('.mort-memo')?.value || '')
        : ''
    };
    mortgageData.push(rowData);
  });
  
  setStoredJson('DSR_mortgageData', mortgageData);
}

function loadDSRInputs() {
  selectedAptInfo = getStoredJson('DSR_selectedAptInfo', null);
  renderSelectedAptRow();

  // "소득 추가"로 늘어났던 행들을 먼저 원래 인덱스 그대로 다시 만들어둬야, 그 안의 입력값들이
  // 아래 일반 복원 루프(TEXT_NUMBER_INPUT_SELECTOR)에서 정상적으로 걸린다.
  getStoredJson('DSR_incomeRowIndexes', []).forEach(idx => 소득행추가(idx, true));

  document.querySelectorAll(TEXT_NUMBER_INPUT_SELECTOR).forEach(input => {
    if (input.id) {
      const savedValue = localStorage.getItem(`DSR_${input.id}`);
      if (savedValue !== null) {
        input.value = savedValue;
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
      const savedValue = localStorage.getItem(`DSR_${checkbox.id}`);
      if (savedValue !== null) {
        checkbox.checked = savedValue === 'true';
      }
    }
  });

  // 증빙/신고 및 카드·건강·연금 선택 상태 + 종류별 금액 복원 (소득1 / 소득N 공용)
  const restoreRadioAndAmounts = (modeName, typeName, amountKey, amounts, setMode, setType) => {
    const savedMode = localStorage.getItem(`DSR_radio_${modeName}`);
    if (savedMode !== null) {
      const radio = document.querySelector(`input[name="${modeName}"][value="${savedMode}"]`);
      if (radio) radio.checked = true;
    }
    const savedType = localStorage.getItem(`DSR_radio_${typeName}`);
    if (savedType !== null) {
      const radio = document.querySelector(`input[name="${typeName}"][value="${savedType}"]`);
      if (radio) radio.checked = true;
    }
    ['카드', '건강', '연금'].forEach(type => {
      const saved = localStorage.getItem(`DSR_declareAmt_${amountKey}_${type}`);
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
    restoreRadioAndAmounts(`income_mode_${idx}`, `declare_type_${idx}`, String(idx), st.memoDeclareAmounts,
      (v) => { st.mode = v; }, (v) => { st.declareType = v; });
  });

  loadMortgageRows();
}

function loadMortgageRows() {
  const mortgageData = getStoredJson('DSR_mortgageData');
  if (!Array.isArray(mortgageData)) return;
  
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
        const exclude = currentRow.querySelector('.mort-exclude');
        const amount = currentRow.querySelector('.mort-amt');
        const rate = currentRow.querySelector('.mort-rate');
        const stRate = currentRow.querySelector('.mort-st-rate');
        const term = currentRow.querySelector('.mort-term');
        const repaymentType = currentRow.querySelector('.mort-type');
        const loanCategory = currentRow.querySelector('.mort-loan-category');
        const graceCheck = currentRow.querySelector('.mort-grace-check');
        const graceTerm = currentRow.querySelector('.mort-grace-term');
        
        if (exclude) exclude.checked = rowData.exclude;
        if (amount) amount.value = rowData.amount;
        if (rate) rate.value = rowData.rate;
        if (stRate) stRate.value = rowData.stRate;
        if (term) term.value = rowData.term;
        if (repaymentType) repaymentType.value = rowData.repaymentType;
        if (loanCategory) loanCategory.value = rowData.loanCategory || '신용';
        if (graceCheck) graceCheck.checked = rowData.graceCheck;
        if (graceTerm) graceTerm.value = rowData.graceTerm;

        const memoRow = currentRow.nextElementSibling;
        if (memoRow && memoRow.classList.contains('mortgage-memo-row')) {
          const memoInput = memoRow.querySelector('.mort-memo');
          if (memoInput) memoInput.value = rowData.memo || '';
        }

        const typeButtons = currentRow.querySelectorAll('.type-btn');
        typeButtons.forEach(btn => btn.classList.remove('active'));
        if (rowData.repaymentType === '원리금') typeButtons[0]?.classList.add('active');
        else if (rowData.repaymentType === '원금') typeButtons[1]?.classList.add('active');
        else if (rowData.repaymentType === '만기') typeButtons[2]?.classList.add('active');

        const categoryBtn = currentRow.querySelector('.mort-category-toggle');
        if (categoryBtn) categoryBtn.classList.toggle('active', (rowData.loanCategory || '신용') === '주담대');
      }
    });
  } catch (e) {
    console.warn('Failed to load mortgage data:', e);
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
    btn.classList.toggle('slot-has-data', !!localStorage.getItem(`${DSR_SLOT_PREFIX}${n}`));
  });
}

function saveFormToSlot(n) {
  saveDSRInputs(); // 지금 상태를 최신 DSR_* 키에 우선 반영
  const snapshot = {};
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith('DSR_') && !key.startsWith(DSR_SLOT_PREFIX)) {
      snapshot[key] = localStorage.getItem(key);
    }
  });
  setStoredJson(`${DSR_SLOT_PREFIX}${n}`, snapshot);
  showBubble(`${n}번에 저장되었습니다`);
  refreshSlotButtonStates();
}

// init()이 새로고침 시 하는 순서와 동일하게, 저장된 스냅샷 기준으로 화면을 다시 그린다.
function applySlotSnapshot(n) {
  const raw = localStorage.getItem(`${DSR_SLOT_PREFIX}${n}`);
  if (!raw) { showBubble(`${n}번에 저장된 내용이 없습니다`); return; }
  let snapshot;
  try {
    snapshot = JSON.parse(raw);
  } catch (e) {
    showBubble('저장된 데이터를 불러올 수 없습니다');
    return;
  }

  // 지금 늘어나 있는 소득 추가행부터 정리한다 (대출행은 loadMortgageRows가 스스로 정리함).
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

  // 스냅샷에 없는 기존 DSR_* 값(예: 방금까지 있던 소득행 인덱스 등)은 지워서 안 섞이게 한다.
  Object.keys(localStorage)
    .filter(k => k.startsWith('DSR_') && !k.startsWith(DSR_SLOT_PREFIX))
    .forEach(k => localStorage.removeItem(k));
  Object.entries(snapshot).forEach(([k, v]) => localStorage.setItem(k, v));

  if (!localStorage.getItem('DSR_mortgageData') || localStorage.getItem('DSR_mortgageData') === '[]') {
    주담대행추가();
  }
  loadDSRInputs();
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
  showBubble(`${n}번 저장 내용을 불러왔습니다`);
}

function loadFormFromSlot(n) {
  if (!localStorage.getItem(`${DSR_SLOT_PREFIX}${n}`)) {
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
  document.querySelectorAll(`${TEXT_NUMBER_INPUT_SELECTOR}, ${CHECKBOX_INPUT_SELECTOR}`).forEach(input => {
    input.addEventListener('change', saveDSRInputs);
    if (input.type !== 'checkbox') {
      input.addEventListener('input', saveDSRInputs);
    }
  });
  
  document.addEventListener('change', (e) => {
    if (e.target.closest('#mortgage-inputs')) {
      saveDSRInputs();
    }
  });
  
  document.addEventListener('input', (e) => {
    if (e.target.closest('#mortgage-inputs')) {
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
  // 지금은 꺼둔다 - 나중에 다시 실험하려면 이 두 줄만 살리면 된다 (선택기 HTML은 DSR_Main.html에 주석으로 남아있음).
  // applySavedTableLayoutOrder();
  // renderTableOrderButtons();
  if (!localStorage.getItem('DSR_mortgageData') || localStorage.getItem('DSR_mortgageData') === "[]") {
    주담대행추가();
  }
  loadDSRInputs();
  setupDSRAutoSave();
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
    adjustDsrMaxFontSize();
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
    const graceChecked = firstRow.querySelector('.mort-grace-check')?.checked;
    const graceTerm = firstRow.querySelector('.mort-grace-term')?.value || '-';

    lines.push(`본건대출금액 : ${amt}`);
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
      const conditionChecked = row.querySelector('.mort-exclude')?.checked;
      let rowLine = `보유대출${idx + 1} : ${amt}    금리 : ${rate}%    기간 : ${term}개월    상환방식 : ${type}`;
      if (conditionChecked) rowLine += `    [[ 당일상환조건 ]]`;
      lines.push(rowLine);
      const memo = getMortgageRowMemo(row);
      if (memo) lines.push(`  메모 : ${memo}`);
    });
  }

  return lines.join('\n');
}

function fallbackCopyText(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    document.execCommand('copy');
    showBubble('내용이 복사되었습니다');
  } catch (e) {
    showBubble('복사에 실패했습니다');
  }
  document.body.removeChild(textarea);
}

function 내용복사() {
  const text = 대출정보텍스트생성();
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showBubble('내용이 복사되었습니다');
    }).catch(() => {
      fallbackCopyText(text);
    });
  } else {
    fallbackCopyText(text);
  }
}

// 대출 정보 요약 텍스트(상담내용 메모용) + 시세/필요금액/단지명·평형·동호수·주소·규제지역배지(상담일지 물건정보 1칸용)를 상담일지 탭으로 전달한다.
// index.html이 모바일/PC 여부에 따라 알맞은 프레임(content-frame 또는 consulting-frame)으로 중계한다.
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
  window.parent.postMessage({
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
  }, '*');
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
    const titleEls = target.querySelectorAll('.section-title-graphic');
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

  const renderBlob = async () => {
    const restoreDsrToggle = swapDsrToggleForCapture();
    const restoreGradientTitles = swapGradientTitlesForCapture();
    try {
      const canvas = await html2canvas(target, {
        backgroundColor: '#ffffff',
        scale: Math.min(window.devicePixelRatio || 1, 2) + 0.5,
        useCORS: true
      });
      return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    } finally {
      restoreDsrToggle();
      restoreGradientTitles();
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

window.addEventListener('DOMContentLoaded', init);