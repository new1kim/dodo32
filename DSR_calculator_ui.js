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

function openRateEditModal() {
  const panels = getModalPanels();
  hideOtherModalPanels(panels, 'textCard');

  populateRateEditFields();

  if (panels.textCard) panels.textCard.style.display = "block";
  if (panels.imageModal) panels.imageModal.style.display = "flex";

  const targetSection = document.getElementById("modal-rate-card");
  if (targetSection) targetSection.scrollIntoView({ block: "start" });

  fitAllNumericInputFontSizes();
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
  localStorage.setItem("DEFAULT_FIRST_ROW_DATA", JSON.stringify(data));
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
  localStorage.setItem("CUSTOM_LOAN_RATE_TABLE", JSON.stringify(LOAN_RATE_TABLE));
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

function showBubble(text = "신DTI 적용") {
  const b = document.getElementById("bubble-box");
  if (!b) return;
  b.innerText = text;
  b.style.display = "block"; 
  setTimeout(() => b.style.display = "none", 1000);
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

function 전달DSR한도금액(tdElement) {
  const mainValEl = tdElement.querySelector('.dsr-main-val');
  const text = mainValEl ? mainValEl.innerText.trim() : tdElement.innerText.trim();
  if (!text || text === "-" || text.includes("대출 불가")) return;

  let totalAmount = parseKoreanAmountText(text);
  
  if (totalAmount > 0) {
    totalAmount = Math.floor(totalAmount / 1000000) * 1000000;
  }

  const type = tdElement.dataset.type;
  if (type) {
    setFirstRowRepaymentType(type);
  }

  const firstRow = document.querySelector('#mortgage-inputs .mortgage-row');
  if (firstRow) {
    const amtInput = firstRow.querySelector('.mort-amt');
    if (amtInput && totalAmount > 0) {
      amtInput.value = totalAmount.toLocaleString();
      showBubble(`${type || '최대한도'} 및 최대한도가 본건에 입력되었습니다.`);
      if (typeof 자동계산 === 'function') 자동계산();
      if (typeof saveDSRInputs === 'function') saveDSRInputs();
    }
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
    <td class="no-bg" style="padding: 6px 4px; vertical-align: middle;">
      <div class="mort-exclude-cell">
        <input type="checkbox" class="mort-exclude" title="계산제외">
      </div>
    </td>
    <td class="no-bg" style="padding: 6px 4px;">
      ${isFirstRow ? firstRowAmountMarkup : addedRowAmountMarkup}
    </td>
    <td class="no-bg" style="padding: 6px 2px;">
      <input type="text" inputmode="numeric" placeholder="개월" class="mort-term">
    </td>
    <td class="no-bg" style="padding: 10px 3px;">
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

    hiddenIncomeInput.value = finalVal > 0 ? Math.floor(finalVal).toLocaleString() : "";
    
    if (!isEditingIncome) {
        baseIncomeInput.value = finalVal > 0 ? Math.floor(finalVal).toLocaleString() : "";
        
        if (isChecked && currentRate !== 1.0 && memoBaseIncome > 0 && (typeof baseIncomeMode === 'undefined' || baseIncomeMode !== '신고')) {
            baseIncomeInput.style.color = "#1d4ed8";
            baseIncomeInput.style.fontWeight = "bold";
            baseIncomeInput.style.backgroundColor = "#eff6ff";
        } else {
            baseIncomeInput.style.color = "";
            baseIncomeInput.style.fontWeight = "bold"; 
            baseIncomeInput.style.backgroundColor = "";
        }
    }
    
    if (typeof 자동계산 === 'function') 자동계산();
}

if (applyRateCheck) {
  applyRateCheck.addEventListener("change", (e) => {
      showBubble(e.target.checked ? "장래예상 적용" : "장래예상 해제");
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

// 배우자 연소득 입력 및 상환능력 보정
let memoSpouseIncome = 0;
let isEditingSpouseIncome = false;
const spouseIncomeInput = document.getElementById("spouseIncomeInput");
const spouseHiddenIncomeInput = document.getElementById("spouseComputedIncomeHidden");
const spouseAgeInput = document.getElementById("spouseAgeInput");
const spouseApplyRateCheck = document.getElementById("spouseApplyRateCheck");
const spouseRateDisplay = document.getElementById("spouseRateDisplay");

function updateSpouseIncomeCalc() {
  if (!spouseIncomeInput || !spouseHiddenIncomeInput || !spouseAgeInput || !spouseApplyRateCheck || !spouseRateDisplay) return;
  if (spouseAgeInput.value.length > 4) spouseAgeInput.value = spouseAgeInput.value.slice(0, 4);
  const age = parseAgeInputValue(spouseAgeInput.value);
  const matched = LOAN_RATE_TABLE.find(item => age >= item.minAge && age <= item.maxAge);
  const rate = matched ? matched.percent / 100 : 1;
  const spouseIsDeclareMode = (typeof spouseIncomeMode !== 'undefined' && spouseIncomeMode === '신고');
  const spouseRateApplies = spouseApplyRateCheck.checked && !spouseIsDeclareMode; // 신고소득 모드에서는 장래예상 미적용
  spouseRateDisplay.innerText = `(${matched ? matched.percent + "%" : "-"})`;
  const finalVal = spouseRateApplies ? memoSpouseIncome * rate : memoSpouseIncome;
  spouseHiddenIncomeInput.value = finalVal > 0 ? Math.floor(finalVal).toLocaleString() : "";
  if (!isEditingSpouseIncome) spouseIncomeInput.value = finalVal > 0 ? Math.floor(finalVal).toLocaleString() : "";
  if (spouseApplyRateCheck.checked && matched && memoSpouseIncome > 0 && (typeof spouseIncomeMode === 'undefined' || spouseIncomeMode !== '신고')) {
    spouseIncomeInput.style.color = "#1d4ed8";
    spouseIncomeInput.style.backgroundColor = "#eff6ff";
  } else {
    spouseIncomeInput.style.color = "";
    spouseIncomeInput.style.backgroundColor = "";
  }
  if (typeof 자동계산 === 'function') 자동계산();
}

if (spouseApplyRateCheck) spouseApplyRateCheck.addEventListener("change", updateSpouseIncomeCalc);
if (spouseAgeInput) spouseAgeInput.addEventListener("input", updateSpouseIncomeCalc);
if (spouseIncomeInput) {
  spouseIncomeInput.addEventListener("focus", () => {
    isEditingSpouseIncome = true;
    const value = spouseIncomeInput.value.replace(/\D/g, '');
    if (value && memoSpouseIncome === 0) memoSpouseIncome = parseFloat(value);
    memoSpouseIncomeDirect = memoSpouseIncome;
    spouseIncomeInput.value = memoSpouseIncome > 0 ? memoSpouseIncome.toLocaleString() : "";
  });
  spouseIncomeInput.addEventListener("blur", () => {
    isEditingSpouseIncome = false;
    updateSpouseIncomeCalc();
  });
  spouseIncomeInput.addEventListener("input", (e) => {
    const value = e.target.value.replace(/\D/g, '');
    memoSpouseIncome = value ? parseFloat(value) : 0;
    memoSpouseIncomeDirect = memoSpouseIncome;
    e.target.value = value ? memoSpouseIncome.toLocaleString() : "";
    updateSpouseIncomeCalc();
  });
}

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

let spouseIncomeMode = '증빙';
let spouseDeclareType = '카드';
let memoSpouseDeclareAmounts = { '카드': 0, '건강': 0, '연금': 0 };
let memoSpouseIncomeDirect = 0;

const baseIncomeModeRadios = document.querySelectorAll('input[name="base_income_mode"]');
const baseDeclareTypeRadios = document.querySelectorAll('input[name="base_declare_type"]');
const baseDeclareAmountInput = document.getElementById("baseDeclareAmountInput");
const baseDeclareConvertedOutput = document.getElementById("baseDeclareConvertedOutput");
const baseDeclareInputGroup = document.getElementById("baseDeclareInputGroup");

const spouseIncomeModeRadios = document.querySelectorAll('input[name="spouse_income_mode"]');
const spouseDeclareTypeRadios = document.querySelectorAll('input[name="spouse_declare_type"]');
const spouseDeclareAmountInput = document.getElementById("spouseDeclareAmountInput");
const spouseDeclareConvertedOutput = document.getElementById("spouseDeclareConvertedOutput");
const spouseDeclareInputGroup = document.getElementById("spouseDeclareInputGroup");

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

function refreshSpouseDeclareConverted() {
  const amount = memoSpouseDeclareAmounts[spouseDeclareType] || 0;
  const converted = calcDeclareConvertedIncome(spouseDeclareType, amount);
  if (spouseDeclareConvertedOutput) {
    spouseDeclareConvertedOutput.value = converted > 0 ? Math.floor(converted).toLocaleString() : "";
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
  if (ageInput) ageInput.style.display = isDeclare ? 'none' : '';
  if (baseDeclareAmountInput) {
    baseDeclareAmountInput.style.display = isDeclare ? '' : 'none';
    baseDeclareAmountInput.placeholder = DECLARE_AMOUNT_PLACEHOLDERS[baseDeclareType] || '금액 입력';
    const amt = memoBaseDeclareAmounts[baseDeclareType] || 0;
    baseDeclareAmountInput.value = amt > 0 ? amt.toLocaleString() : '';
  }
  const baseRateToggleRow = applyRateCheck ? applyRateCheck.closest('.rate-toggle-row') : null;
  if (baseRateToggleRow) baseRateToggleRow.style.display = isDeclare ? 'none' : '';
  if (baseDeclareConvertedOutput) baseDeclareConvertedOutput.style.display = isDeclare ? '' : 'none';
  if (rateDisplay) rateDisplay.style.display = isDeclare ? 'none' : '';
  // 추정(신고) 모드에서는 나이 칸을 숨기고, 환산금액 칸이 두 칸 폭을 모두 차지하도록 합친다.
  const baseAgeCell = document.getElementById('baseAgeCell');
  const baseToggleCell = document.getElementById('baseToggleCell');
  if (baseAgeCell) baseAgeCell.style.display = isDeclare ? 'none' : '';
  if (baseToggleCell) baseToggleCell.colSpan = isDeclare ? 2 : 1;
  memoBaseIncome = isDeclare ? refreshBaseDeclareConverted() : memoBaseIncomeDirect;
  updateIncomeCalc();
}

function applySpouseIncomeMode() {
  const isDeclare = spouseIncomeMode === '신고';
  if (spouseIncomeInput) spouseIncomeInput.style.display = isDeclare ? 'none' : '';
  if (spouseDeclareInputGroup) spouseDeclareInputGroup.style.display = isDeclare ? 'flex' : 'none';
  if (spouseAgeInput) spouseAgeInput.style.display = isDeclare ? 'none' : '';
  if (spouseDeclareAmountInput) {
    spouseDeclareAmountInput.style.display = isDeclare ? '' : 'none';
    spouseDeclareAmountInput.placeholder = DECLARE_AMOUNT_PLACEHOLDERS[spouseDeclareType] || '금액 입력';
    const amt = memoSpouseDeclareAmounts[spouseDeclareType] || 0;
    spouseDeclareAmountInput.value = amt > 0 ? amt.toLocaleString() : '';
  }
  const spouseRateToggleRow = spouseApplyRateCheck ? spouseApplyRateCheck.closest('.rate-toggle-row') : null;
  if (spouseRateToggleRow) spouseRateToggleRow.style.display = isDeclare ? 'none' : '';
  if (spouseDeclareConvertedOutput) spouseDeclareConvertedOutput.style.display = isDeclare ? '' : 'none';
  if (spouseRateDisplay) spouseRateDisplay.style.display = isDeclare ? 'none' : '';
  // 추정(신고) 모드에서는 나이 칸을 숨기고, 환산금액 칸이 두 칸 폭을 모두 차지하도록 합친다.
  const spouseAgeCell = document.getElementById('spouseAgeCell');
  const spouseToggleCell = document.getElementById('spouseToggleCell');
  if (spouseAgeCell) spouseAgeCell.style.display = isDeclare ? 'none' : '';
  if (spouseToggleCell) spouseToggleCell.colSpan = isDeclare ? 2 : 1;
  memoSpouseIncome = isDeclare ? refreshSpouseDeclareConverted() : memoSpouseIncomeDirect;
  updateSpouseIncomeCalc();
}

baseIncomeModeRadios.forEach(radio => {
  radio.addEventListener("change", () => {
    baseIncomeMode = radio.value;
    refreshRadioToggleStyles('#baseIncomeModeToggle');
    showBubble(baseIncomeMode === '신고' ? '차주 추정소득 모드' : '차주 증빙소득 모드');
    applyBaseIncomeMode();
  });
});

spouseIncomeModeRadios.forEach(radio => {
  radio.addEventListener("change", () => {
    spouseIncomeMode = radio.value;
    refreshRadioToggleStyles('#spouseIncomeModeToggle');
    showBubble(spouseIncomeMode === '신고' ? '배우자 추정소득 모드' : '배우자 증빙소득 모드');
    applySpouseIncomeMode();
  });
});

baseDeclareTypeRadios.forEach(radio => {
  radio.addEventListener("change", () => {
    baseDeclareType = radio.value;
    refreshRadioToggleStyles('#baseDeclareTypeToggle');
    if (baseDeclareAmountInput) {
      baseDeclareAmountInput.placeholder = DECLARE_AMOUNT_PLACEHOLDERS[baseDeclareType] || '금액 입력';
      // 종류별로 저장해둔 금액을 그대로 불러와 입력창에 표시 (다른 종류의 금액과 섞이지 않음)
      const amt = memoBaseDeclareAmounts[baseDeclareType] || 0;
      baseDeclareAmountInput.value = amt > 0 ? amt.toLocaleString() : '';
    }
    if (baseIncomeMode === '신고') {
      memoBaseIncome = refreshBaseDeclareConverted();
      updateIncomeCalc();
    }
  });
});

spouseDeclareTypeRadios.forEach(radio => {
  radio.addEventListener("change", () => {
    spouseDeclareType = radio.value;
    refreshRadioToggleStyles('#spouseDeclareTypeToggle');
    if (spouseDeclareAmountInput) {
      spouseDeclareAmountInput.placeholder = DECLARE_AMOUNT_PLACEHOLDERS[spouseDeclareType] || '금액 입력';
      const amt = memoSpouseDeclareAmounts[spouseDeclareType] || 0;
      spouseDeclareAmountInput.value = amt > 0 ? amt.toLocaleString() : '';
    }
    if (spouseIncomeMode === '신고') {
      memoSpouseIncome = refreshSpouseDeclareConverted();
      updateSpouseIncomeCalc();
    }
  });
});

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

if (spouseDeclareAmountInput) {
  spouseDeclareAmountInput.addEventListener("input", (e) => {
    const v = e.target.value.replace(/\D/g, '');
    const num = v ? parseFloat(v) : 0;
    memoSpouseDeclareAmounts[spouseDeclareType] = num;
    e.target.value = v ? num.toLocaleString() : '';
    if (spouseIncomeMode === '신고') {
      memoSpouseIncome = refreshSpouseDeclareConverted();
      updateSpouseIncomeCalc();
    } else {
      refreshSpouseDeclareConverted();
    }
  });
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
  localStorage.setItem("CUSTOM_DECLARE_INCOME_RATES", JSON.stringify(DECLARE_INCOME_RATES));
  showBubble("신고소득 환산 요율 저장 완료");
  closeModal();
  if (baseIncomeMode === '신고') { memoBaseIncome = refreshBaseDeclareConverted(); updateIncomeCalc(); }
  if (spouseIncomeMode === '신고') { memoSpouseIncome = refreshSpouseDeclareConverted(); updateSpouseIncomeCalc(); }
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

function 선택초기화() {
  const savedDefaultFirstRowData = getStoredJson("DEFAULT_FIRST_ROW_DATA");

  if (baseIncomeInput) baseIncomeInput.value = "";
  memoBaseIncome = 0;
  const computedHidden = document.getElementById("computedIncomeHidden");
  if (computedHidden) computedHidden.value = "";
  if (spouseIncomeInput) spouseIncomeInput.value = "";
  memoSpouseIncome = 0;
  if (spouseHiddenIncomeInput) spouseHiddenIncomeInput.value = "";

  if (applyRateCheck) applyRateCheck.checked = false;
  if (ageInput) ageInput.value = "";
  if (spouseApplyRateCheck) spouseApplyRateCheck.checked = false;
  if (spouseAgeInput) spouseAgeInput.value = "";

  // 신고소득(카드/건강/연금) 관련 상태 초기화
  memoBaseIncomeDirect = 0;
  memoSpouseIncomeDirect = 0;
  memoBaseDeclareAmounts = { '카드': 0, '건강': 0, '연금': 0 };
  memoSpouseDeclareAmounts = { '카드': 0, '건강': 0, '연금': 0 };
  baseIncomeMode = '증빙';
  spouseIncomeMode = '증빙';
  baseDeclareType = '카드';
  spouseDeclareType = '카드';
  if (baseDeclareAmountInput) baseDeclareAmountInput.value = "";
  if (spouseDeclareAmountInput) spouseDeclareAmountInput.value = "";
  if (baseDeclareConvertedOutput) baseDeclareConvertedOutput.value = "";
  if (spouseDeclareConvertedOutput) spouseDeclareConvertedOutput.value = "";
  const baseModeDefaultRadio = document.querySelector('input[name="base_income_mode"][value="증빙"]');
  if (baseModeDefaultRadio) baseModeDefaultRadio.checked = true;
  const spouseModeDefaultRadio = document.querySelector('input[name="spouse_income_mode"][value="증빙"]');
  if (spouseModeDefaultRadio) spouseModeDefaultRadio.checked = true;
  const baseDeclareDefaultRadio = document.querySelector('input[name="base_declare_type"][value="카드"]');
  if (baseDeclareDefaultRadio) baseDeclareDefaultRadio.checked = true;
  const spouseDeclareDefaultRadio = document.querySelector('input[name="spouse_declare_type"][value="카드"]');
  if (spouseDeclareDefaultRadio) spouseDeclareDefaultRadio.checked = true;
  refreshRadioToggleStyles('#baseIncomeModeToggle');
  refreshRadioToggleStyles('#spouseIncomeModeToggle');
  refreshRadioToggleStyles('#baseDeclareTypeToggle');
  refreshRadioToggleStyles('#spouseDeclareTypeToggle');
  applyBaseIncomeMode();
  applySpouseIncomeMode();

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

    firstRow.querySelectorAll(CHECKBOX_INPUT_SELECTOR).forEach(checkbox => {
      checkbox.checked = false;
    });
  }

  const allRows = document.querySelectorAll('#mortgage-inputs .mortgage-row');
  for (let i = 1; i < allRows.length; i++) {
    allRows[i].querySelectorAll('input, select').forEach(input => {
      if (input.type === 'checkbox') input.checked = false;
      else input.value = '';
    });

    const typeInput = allRows[i].querySelector('.mort-type');
    const typeButtons = allRows[i].querySelectorAll('.type-btn');
    if (typeInput) typeInput.value = '원리금';
    typeButtons.forEach(btn => btn.classList.remove('active'));
    const defaultTypeBtn = allRows[i].querySelector('.type-btn:nth-child(1)');
    if (defaultTypeBtn) defaultTypeBtn.classList.add('active');
  }

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
  ['base_income_mode', 'spouse_income_mode', 'base_declare_type', 'spouse_declare_type'].forEach(name => {
    localStorage.removeItem(`DSR_radio_${name}`);
  });
  ['카드', '건강', '연금'].forEach(type => {
    localStorage.removeItem(`DSR_declareAmt_base_${type}`);
    localStorage.removeItem(`DSR_declareAmt_spouse_${type}`);
  });
  localStorage.removeItem('DSR_mortgageData');
  
  updateIncomeCalc();
  showBubble("입력 내용이 초기화되었습니다.");
}

function saveDSRInputs() {
  document.querySelectorAll(TEXT_NUMBER_INPUT_SELECTOR).forEach(input => {
    if (input.id) localStorage.setItem(`DSR_${input.id}`, input.value);
  });
  document.querySelectorAll(CHECKBOX_INPUT_SELECTOR).forEach(checkbox => {
    if (checkbox.id) localStorage.setItem(`DSR_${checkbox.id}`, checkbox.checked);
  });
  // 증빙/신고 및 카드·건강·연금 선택 상태도 함께 저장 (새로고침 후에도 환산 금액이 바로 계산되도록)
  ['base_income_mode', 'spouse_income_mode', 'base_declare_type', 'spouse_declare_type'].forEach(name => {
    const checked = document.querySelector(`input[name="${name}"]:checked`);
    if (checked) localStorage.setItem(`DSR_radio_${name}`, checked.value);
  });
  // 추정(카드/건보/연금) 버튼별 입력 금액을 각각 따로 저장 (공용 입력창 하나를 돌려쓰기 때문에 종류별로 키를 분리해야 함)
  ['카드', '건강', '연금'].forEach(type => {
    localStorage.setItem(`DSR_declareAmt_base_${type}`, memoBaseDeclareAmounts[type] || 0);
    localStorage.setItem(`DSR_declareAmt_spouse_${type}`, memoSpouseDeclareAmounts[type] || 0);
  });
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
      graceTerm: row.querySelector('.mort-grace-term')?.value || ''
    };
    mortgageData.push(rowData);
  });
  
  localStorage.setItem('DSR_mortgageData', JSON.stringify(mortgageData));
}

function loadDSRInputs() {
  document.querySelectorAll(TEXT_NUMBER_INPUT_SELECTOR).forEach(input => {
    if (input.id) {
      const savedValue = localStorage.getItem(`DSR_${input.id}`);
      if (savedValue !== null) {
        input.value = savedValue;
        if (input.id === 'baseIncomeInput') {
          memoBaseIncome = parseFloat(savedValue.replace(/\D/g, '')) || 0;
        }
        if (input.id === 'spouseIncomeInput') {
          memoSpouseIncome = parseFloat(savedValue.replace(/\D/g, '')) || 0;
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

  // 증빙/신고 및 카드·건강·연금 선택 상태 복원
  ['base_income_mode', 'spouse_income_mode', 'base_declare_type', 'spouse_declare_type'].forEach(name => {
    const savedValue = localStorage.getItem(`DSR_radio_${name}`);
    if (savedValue !== null) {
      const radio = document.querySelector(`input[name="${name}"][value="${savedValue}"]`);
      if (radio) radio.checked = true;
    }
  });
  const baseModeChecked = document.querySelector('input[name="base_income_mode"]:checked');
  if (baseModeChecked) baseIncomeMode = baseModeChecked.value;
  const spouseModeChecked = document.querySelector('input[name="spouse_income_mode"]:checked');
  if (spouseModeChecked) spouseIncomeMode = spouseModeChecked.value;
  const baseTypeChecked = document.querySelector('input[name="base_declare_type"]:checked');
  if (baseTypeChecked) baseDeclareType = baseTypeChecked.value;
  const spouseTypeChecked = document.querySelector('input[name="spouse_declare_type"]:checked');
  if (spouseTypeChecked) spouseDeclareType = spouseTypeChecked.value;

  // 추정(카드/건보/연금) 버튼별로 저장해둔 금액을 각각 복원
  ['카드', '건강', '연금'].forEach(type => {
    const savedBaseAmt = localStorage.getItem(`DSR_declareAmt_base_${type}`);
    if (savedBaseAmt !== null) memoBaseDeclareAmounts[type] = parseFloat(savedBaseAmt) || 0;
    const savedSpouseAmt = localStorage.getItem(`DSR_declareAmt_spouse_${type}`);
    if (savedSpouseAmt !== null) memoSpouseDeclareAmounts[type] = parseFloat(savedSpouseAmt) || 0;
  });

  loadMortgageRows();
}

function loadMortgageRows() {
  const mortgageData = getStoredJson('DSR_mortgageData');
  if (!Array.isArray(mortgageData)) return;
  
  try {
    const tbody = document.getElementById('mortgage-inputs');
    if (!tbody) return;
    
    tbody.querySelectorAll('.mortgage-row').forEach(row => row.remove());
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

function splitIncomeSettingsIntoCells() {
  const table = document.querySelector('.income-table');
  if (!table || table.dataset.splitCells === 'true') return;
  table.dataset.splitCells = 'true';
  table.querySelectorAll('.income-settings-cell').forEach(cell => {
    const age = cell.querySelector('.age-input');
    const toggle = cell.querySelector('.rate-toggle-row');
    const rate = cell.querySelector('.rate-display');
    if (!age || !toggle || !rate) return;
    const prefix = age.id === 'spouseAgeInput' ? 'spouse' : 'base'; // 분리된 셀을 이후 JS에서 다시 찾아 숨기기 위한 식별용 접두사
    // .age-slot/.toggle-slot 래퍼가 있으면 그 안의 신고소득 대체 입력칸까지 통째로 옮긴다.
    const ageNode = age.closest('.age-slot') || age;
    const toggleNode = toggle.closest('.toggle-slot') || toggle;
    const makeCell = (cls, node, id) => {
      const td = document.createElement('td');
      td.className = `income-settings-cell ${cls}`;
      if (id) td.id = id;
      td.appendChild(node);
      return td;
    };
    const row = cell.parentElement;
    const toggleCell = makeCell('toggle-cell', toggleNode, `${prefix}ToggleCell`);
    toggleCell.appendChild(rate);
    row.insertBefore(makeCell('age-cell', ageNode, `${prefix}AgeCell`), cell);
    row.insertBefore(toggleCell, cell);
    cell.remove();
  });
}

function init() {
  splitIncomeSettingsIntoCells();
  if (!localStorage.getItem('DSR_mortgageData') || localStorage.getItem('DSR_mortgageData') === "[]") {
    주담대행추가();
  }
  loadDSRInputs();
  setupDSRAutoSave();
  refreshRadioToggleStyles('#baseIncomeModeToggle');
  refreshRadioToggleStyles('#spouseIncomeModeToggle');
  refreshRadioToggleStyles('#baseDeclareTypeToggle');
  refreshRadioToggleStyles('#spouseDeclareTypeToggle');
  applyBaseIncomeMode();
  applySpouseIncomeMode();
  updateIncomeCalc();
  updateSpouseIncomeCalc();
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

  const lines = [];
  const 구분선 = '－－－－－－－－－－－－－－－－－－';

  // 1) 본건 월별 상환 스케줄
  lines.push('[ 본건 월별 상환 스케줄 ]');
  lines.push(`합 계 : ${getText('월합계') || '-'}    월원금 : ${getText('월원금') || '-'}    월이자 : ${getText('월이자') || '-'}`);
  lines.push(구분선);

  // 2) DSR 최대한도 (원리금 / 원금)
  const dsrLimitRadio = document.querySelector('input[name="dsr_limit_rate"]:checked');
  const dsrLimitLabel = dsrLimitRadio ? `DSR${dsrLimitRadio.value}%` : '-';
  const dsrWonrigeumMain = document.querySelector('#DSR최대금액확인-원리금 .dsr-main-val')?.innerText.trim() || '-';
  const dsrWonrigeumSub = document.querySelector('#DSR최대금액확인-원리금 .dsr-sub-val')?.innerText.trim() || '';
  const dsrWongeumMain = document.querySelector('#DSR최대금액확인-원금 .dsr-main-val')?.innerText.trim() || '-';
  const dsrWongeumSub = document.querySelector('#DSR최대금액확인-원금 .dsr-sub-val')?.innerText.trim() || '';
  lines.push(`[ DSR 최대한도 (${dsrLimitLabel}) ]`);
  lines.push(`원리금 : ${dsrWonrigeumMain} ${dsrWonrigeumSub}`.trim());
  lines.push(`원  금 : ${dsrWongeumMain} ${dsrWongeumSub}`.trim());
  lines.push(구분선);

  // 3) LTV
  lines.push('[ LTV ]');
  const ltvRadio = document.querySelector('input[name="ltv_rate"]:checked');
  const ltvPercent = ltvRadio ? `${ltvRadio.value}%` : '-';
  const kbSise = getVal('ltvMarketPriceInput') || '-';
  lines.push(`KB시세 : ${kbSise}    LTV비율 : ${ltvPercent}`);
  lines.push(`소액임차금액 : ${getVal('ltvMinorLeaseInput') || '-'}`);
  lines.push(`계산값 : ${getVal('ltvMaxAmountOutput') || '-'}`);
  lines.push(구분선);

  // 4) DSR / DTI / 신DTI
  lines.push('[ DSR / DTI / 신DTI ]');
  lines.push(`DSR : ${getText('DSR확인') || '-'}    DTI : ${getText('DIT확인') || '-'}    신DTI : ${getText('신DTI확인') || '-'}`);
  lines.push(구분선);

  // 5) 소득
  lines.push('[ 소득 ]');
  const baseChecked = applyRateCheck ? applyRateCheck.checked : false;
  const baseRawNum = memoBaseIncome || 0;
  const baseRawStr = baseRawNum > 0 ? Math.floor(baseRawNum).toLocaleString() : (getVal('baseIncomeInput') || '-');
  if (baseIncomeMode === '신고') {
    // 추정소득(카드/건보/연금) 모드: 어떤 항목으로 추정했는지 함께 표시
    lines.push(`차주 소득 : ${baseRawStr} (${DECLARE_TYPE_LABELS[baseDeclareType] || baseDeclareType})`);
  } else if (baseChecked) {
    const baseAppliedStr = hiddenIncomeInput && hiddenIncomeInput.value ? hiddenIncomeInput.value : baseRawStr;
    const baseAppliedNum = parseFloat((hiddenIncomeInput?.value || '').replace(/,/g, '')) || baseRawNum;
    const baseIncreaseStr = Math.max(0, Math.floor(baseAppliedNum - baseRawNum)).toLocaleString();
    const basePercent = rateDisplay ? rateDisplay.innerText.replace(/[()]/g, '') : '-';
    lines.push(`차주 소득 : ${baseRawStr} ( ${baseAppliedStr} )    나이 : ${getVal('ageInput') || '-'}    장래예상 : ${basePercent} (${baseIncreaseStr})`);
  } else {
    lines.push(`차주 소득 : ${baseRawStr}`);
  }

  // 배우자 소득 (소득값이 없으면 배우자 소득/합산소득 줄 자체를 생략)
  const spouseRawNum = memoSpouseIncome || 0;
  const hasSpouseIncome = spouseRawNum > 0;
  let spouseChecked = false;

  if (hasSpouseIncome) {
    spouseChecked = spouseApplyRateCheck ? spouseApplyRateCheck.checked : false;
    const spouseRawStr = Math.floor(spouseRawNum).toLocaleString();
    if (spouseIncomeMode === '신고') {
      lines.push(`배우자 소득 : ${spouseRawStr} (${DECLARE_TYPE_LABELS[spouseDeclareType] || spouseDeclareType})`);
    } else if (spouseChecked) {
      const spouseAppliedStr = spouseHiddenIncomeInput && spouseHiddenIncomeInput.value ? spouseHiddenIncomeInput.value : spouseRawStr;
      const spouseAppliedNum = parseFloat((spouseHiddenIncomeInput?.value || '').replace(/,/g, '')) || spouseRawNum;
      const spouseIncreaseStr = Math.max(0, Math.floor(spouseAppliedNum - spouseRawNum)).toLocaleString();
      const spousePercent = spouseRateDisplay ? spouseRateDisplay.innerText.replace(/[()]/g, '') : '-';
      lines.push(`배우자 소득 : ${spouseRawStr} ( ${spouseAppliedStr} )    나이 : ${getVal('spouseAgeInput') || '-'}    장래예상 : ${spousePercent} (${spouseIncreaseStr})`);
    } else {
      lines.push(`배우자 소득 : ${spouseRawStr}`);
    }

    // 합산소득 (장래예상 체크 또는 추정소득 사용된 경우에만 괄호 표시)
    const rawSum = (memoBaseIncome || 0) + spouseRawNum;
    const rawSumStr = rawSum > 0 ? Math.floor(rawSum).toLocaleString() : '-';
    const appliedSumStr = getVal('totalIncomeOutput') || rawSumStr;
    if (baseChecked || spouseChecked || baseIncomeMode === '신고' || spouseIncomeMode === '신고') {
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
      pill('40', 'DSR40%') +
      `<div style="height:2px;"></div>` +
      pill('50', 'DSR50%') +
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

  const renderBlob = async () => {
    const restore = swapDsrToggleForCapture();
    try {
      const canvas = await html2canvas(target, {
        backgroundColor: '#ffffff',
        scale: Math.min(window.devicePixelRatio || 1, 2) + 0.5,
        useCORS: true
      });
      return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    } finally {
      restore();
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