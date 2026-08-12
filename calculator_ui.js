/* DSR계산기ETC - 그 외 코드 (UI, 이벤트, 모달, 로컬스토리지 등) */

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

function adjustTableFontSize() {
  const cells = document.querySelectorAll('table th, table td');
  cells.forEach(cell => {
    if (cell.closest('#modal-rate-card') || cell.closest('#modal-default-card') || cell.closest('#modal-text-card') || cell.closest('#modal-schedule-card')) return;

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

    const input = cell.querySelector('input[type="text"], input[type="number"], select');
    if (input) {
      if (!input.dataset.origSize) {
        input.dataset.origSize = window.getComputedStyle(input).fontSize;
      }
      input.style.fontSize = input.dataset.origSize;
      let currentInputSize = parseFloat(input.dataset.origSize);
      
      let ghost = document.getElementById("input-ghost");
      if (!ghost) {
        ghost = document.createElement("span");
        ghost.id = "input-ghost";
        ghost.style.position = "absolute";
        ghost.style.visibility = "hidden";
        ghost.style.whiteSpace = "pre";
        document.body.appendChild(ghost);
      }
      ghost.style.fontFamily = window.getComputedStyle(input).fontFamily;
      ghost.style.fontWeight = window.getComputedStyle(input).fontWeight;
      
      const maxWidth = input.clientWidth - 6; 
      if (maxWidth <= 0) return;
      
      if (input.tagName === 'SELECT') {
        const sel = input;
        const opt = sel.options[sel.selectedIndex];
        ghost.innerText = opt ? opt.text : (sel.value || '');
      } else {
        ghost.innerText = input.value || input.placeholder || "";
      }
      
      while (currentInputSize > 4) {
        ghost.style.fontSize = currentInputSize + 'px';
        if (ghost.offsetWidth <= maxWidth) {
          break;
        }
        currentInputSize -= 0.5;
      }
      input.style.fontSize = currentInputSize + 'px';
    }
  });
}

function openScheduleModal() {
  const imgModal = document.getElementById("modal-img");
  const textCard = document.getElementById("modal-text-card");
  const scheduleCard = document.getElementById("modal-schedule-card");
  const imageModal = document.getElementById("image-modal");

  if (imgModal) imgModal.style.display = "none";
  if (textCard) textCard.style.display = "none";
  
  if (typeof generateSchedule === 'function') generateSchedule();

  if (scheduleCard) scheduleCard.style.display = "block";
  if (imageModal) imageModal.style.display = "flex";
}

function openImageModal(imageSrc) {
  const imgModal = document.getElementById("modal-img");
  const imageCredit = document.getElementById("modal-image-credit");
  const textCard = document.getElementById("modal-text-card");
  const scheduleCard = document.getElementById("modal-schedule-card");
  const imageModal = document.getElementById("image-modal");

  if (textCard) textCard.style.display = "none";
  if (scheduleCard) scheduleCard.style.display = "none";
  if (imgModal) {
    imgModal.src = imageSrc;
    imgModal.style.display = "block";
  }
  if (imageCredit) imageCredit.style.display = imageSrc === "소액임차보증금.png" ? "block" : "none";
  if (imageModal) imageModal.style.display = "flex";
}

function openTextModal() {
  const imgModal = document.getElementById("modal-img");
  const scheduleCard = document.getElementById("modal-schedule-card");
  const textCard = document.getElementById("modal-text-card");
  const imageModal = document.getElementById("image-modal");

  if (imgModal) imgModal.style.display = "none";
  if (scheduleCard) scheduleCard.style.display = "none";
  
  if (textCard) {
    textCard.style.display = "block";
    textCard.scrollTop = 0;
  }
  if (imageModal) imageModal.style.display = "flex";
}

function openRateEditModal() {
  const imgModal = document.getElementById("modal-img");
  const scheduleCard = document.getElementById("modal-schedule-card");
  const textCard = document.getElementById("modal-text-card");
  const imageModal = document.getElementById("image-modal");

  if (imgModal) imgModal.style.display = "none";
  if (scheduleCard) scheduleCard.style.display = "none";
  
  LOAN_RATE_TABLE.forEach((item, index) => {
    const editEl = document.getElementById(`edit-rate-${index}`);
    if (editEl) editEl.value = item.percent;
  });
  
  if (textCard) textCard.style.display = "block";
  if (imageModal) imageModal.style.display = "flex";

  const targetSection = document.getElementById("modal-rate-card");
  if (targetSection) targetSection.scrollIntoView({ block: "start" });
}

function openDefaultFirstRowModal() {
  const imgModal = document.getElementById("modal-img");
  const scheduleCard = document.getElementById("modal-schedule-card");
  const textCard = document.getElementById("modal-text-card");
  const imageModal = document.getElementById("image-modal");

  if (imgModal) imgModal.style.display = "none";
  if (scheduleCard) scheduleCard.style.display = "none";

  const data = getStoredJson("DEFAULT_FIRST_ROW_DATA");
  if (data) {
    if (document.getElementById("default-mort-rate")) document.getElementById("default-mort-rate").value = data.sixMonthRate || data.rate || "";
    if (document.getElementById("default-five-year-rate")) document.getElementById("default-five-year-rate").value = data.fiveYearRate || "";
    if (document.getElementById("default-mort-st-rate")) document.getElementById("default-mort-st-rate").value = data.sixMonthStRate || data.stRate || "";
    if (document.getElementById("default-five-year-st-rate")) document.getElementById("default-five-year-st-rate").value = data.fiveYearStRate || "";
    if (document.getElementById("default-mort-term")) document.getElementById("default-mort-term").value = data.sixMonthTerm || data.term || "";
    if (document.getElementById("default-five-year-term")) document.getElementById("default-five-year-term").value = data.fiveYearTerm || "";
  } else {
    ['default-mort-rate', 'default-five-year-rate', 'default-mort-st-rate', 'default-five-year-st-rate', 'default-mort-term', 'default-five-year-term'].forEach(id => {
      if (document.getElementById(id)) document.getElementById(id).value = "";
    });
  }

  if (textCard) textCard.style.display = "block";
  if (imageModal) imageModal.style.display = "flex";

  const targetSection = document.getElementById("modal-default-card");
  if (targetSection) targetSection.scrollIntoView({ block: "start" });
}

function saveDefaultFirstRowData() {
  const rate = document.getElementById("default-mort-rate") ? document.getElementById("default-mort-rate").value.trim() : "";
  const fiveYearRate = document.getElementById("default-five-year-rate") ? document.getElementById("default-five-year-rate").value.trim() : "";
  const sixMonthStRate = document.getElementById("default-mort-st-rate") ? document.getElementById("default-mort-st-rate").value.trim() : "";
  const fiveYearStRate = document.getElementById("default-five-year-st-rate") ? document.getElementById("default-five-year-st-rate").value.trim() : "";
  const sixMonthTerm = document.getElementById("default-mort-term") ? document.getElementById("default-mort-term").value.trim() : "";
  const fiveYearTerm = document.getElementById("default-five-year-term") ? document.getElementById("default-five-year-term").value.trim() : "";

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
  let ghost = document.getElementById('dsr-max-font-ghost');
  if (!ghost) {
    ghost = document.createElement('span');
    ghost.id = 'dsr-max-font-ghost';
    ghost.style.position = 'absolute';
    ghost.style.visibility = 'hidden';
    ghost.style.whiteSpace = 'nowrap';
    ghost.style.left = '-9999px';
    ghost.style.top = '-9999px';
    document.body.appendChild(ghost);
  }

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

    ghost.innerText = mainEl.innerText.trim() || '-';

    let fontSize = 28;
    ghost.style.fontSize = fontSize + 'px';
    
    while (fontSize > 8 && ghost.offsetWidth > maxWidth) {
      fontSize -= 0.5;
      ghost.style.fontSize = fontSize + 'px';
    }
    mainEl.style.fontSize = fontSize + 'px';
  });
}

function adjustDsrToggleFontSize() {
  let ghost = document.getElementById('dsr-toggle-font-ghost');
  if (!ghost) {
    ghost = document.createElement('span');
    ghost.id = 'dsr-toggle-font-ghost';
    ghost.style.position = 'absolute';
    ghost.style.visibility = 'hidden';
    ghost.style.whiteSpace = 'nowrap';
    ghost.style.left = '-9999px';
    ghost.style.top = '-9999px';
    document.body.appendChild(ghost);
  }

  document.querySelectorAll('#dsrLimitToggleGroup label').forEach(label => {
    const maxWidth = label.clientWidth - 8;
    if (maxWidth <= 0) return;

    const style = window.getComputedStyle(label);
    ghost.style.fontFamily = style.fontFamily;
    ghost.style.fontWeight = style.fontWeight;

    ghost.innerText = label.innerText.trim();

    let fontSize = 13;
    ghost.style.fontSize = fontSize + 'px';

    while (fontSize > 7 && ghost.offsetWidth > maxWidth) {
      fontSize -= 0.5;
      ghost.style.fontSize = fontSize + 'px';
    }
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

  let inputLongPressTimer;

  row.querySelectorAll('.mort-rate, .mort-st-rate, .mort-term').forEach(el => {
    const startInputPress = () => {
      const rows = Array.from(document.querySelectorAll('#mortgage-inputs .mortgage-row'));
      if (rows.indexOf(row) === 0) {
        inputLongPressTimer = setTimeout(() => {
          openDefaultFirstRowModal();
        }, 3000);
      }
    };
    const endInputPress = () => clearTimeout(inputLongPressTimer);

    el.addEventListener("mousedown", startInputPress);
    el.addEventListener("mouseup", endInputPress);
    el.addEventListener("mouseleave", endInputPress);
    el.addEventListener("touchstart", startInputPress, {passive: true});
    el.addEventListener("touchend", endInputPress, {passive: true});
  });

  row.querySelectorAll('input[type="checkbox"]').forEach(el => {
    el.addEventListener("change", (e) => {
      if (e.target.classList.contains('mort-exclude')) showBubble(e.target.checked ? "계산 제외" : "대출 적용");
      if (e.target.classList.contains('mort-grace-check')) showBubble(e.target.checked ? "거치 적용" : "거치 해제");
      if (typeof 자동계산 === 'function') 자동계산();
    });

    if (el.classList.contains('mort-exclude')) {
      let longPressTimer;
      const startPress = () => {
        longPressTimer = setTimeout(() => {
          if (document.querySelectorAll('#mortgage-inputs .mortgage-row').length > 1) {
            row.remove(); 
            showBubble("해당 대출 정보 삭제 완료");
            updateMortgagePlaceholders(); 
            if (typeof 자동계산 === 'function') 자동계산(); 
            if (typeof saveDSRInputs === 'function') saveDSRInputs();
          }
        }, 2000);
      };
      const endPress = () => clearTimeout(longPressTimer);

      el.addEventListener("mousedown", startPress);
      el.addEventListener("mouseup", endPress);
      el.addEventListener("mouseleave", endPress);
      el.addEventListener("touchstart", startPress, {passive: true});
      el.addEventListener("touchend", endPress, {passive: true});
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
      <div class="type-btn-group">
        <button type="button" class="type-btn active" onclick="setMortgageRepaymentType(this, '원리금')">원리금</button>
        <button type="button" class="type-btn" onclick="setMortgageRepaymentType(this, '원금')">원금</button>
        <button type="button" class="type-btn" onclick="setMortgageRepaymentType(this, '만기')">만기</button>
      </div>
      <input type="hidden" class="mort-type" value="원리금">
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
    const isChecked = applyRateCheck.checked;
    let currentRate = 1.0;
    let percentStr = "-";
    let calculatedAge = -1;

    if (rawInputStr !== '') {
        if (rawInputStr.length === 2) {
            calculatedAge = parseInt(rawInputStr);
        } else if (rawInputStr.length === 4) {
            const currentYear = new Date().getFullYear();
            calculatedAge = currentYear - parseInt(rawInputStr);
        }

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
        
        if (isChecked && currentRate !== 1.0 && memoBaseIncome > 0) {
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
      e.target.value = v ? memoBaseIncome.toLocaleString() : '';
      
      let tempRate = 1.0;
      if (applyRateCheck && applyRateCheck.checked && ageInput && ageInput.value !== '') {
          let tempAge = -1;
          if (ageInput.value.length === 2) {
              tempAge = parseInt(ageInput.value);
          } else if (ageInput.value.length === 4) {
              const currentYear = new Date().getFullYear();
              tempAge = currentYear - parseInt(ageInput.value);
          }

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
  let age = -1;
  if (spouseAgeInput.value.length === 2) age = parseInt(spouseAgeInput.value);
  else if (spouseAgeInput.value.length === 4) age = new Date().getFullYear() - parseInt(spouseAgeInput.value);
  const matched = LOAN_RATE_TABLE.find(item => age >= item.minAge && age <= item.maxAge);
  const rate = matched ? matched.percent / 100 : 1;
  spouseRateDisplay.innerText = `(${matched ? matched.percent + "%" : "-"})`;
  const finalVal = spouseApplyRateCheck.checked ? memoSpouseIncome * rate : memoSpouseIncome;
  spouseHiddenIncomeInput.value = finalVal > 0 ? Math.floor(finalVal).toLocaleString() : "";
  if (!isEditingSpouseIncome) spouseIncomeInput.value = finalVal > 0 ? Math.floor(finalVal).toLocaleString() : "";
  if (spouseApplyRateCheck.checked && matched && memoSpouseIncome > 0) {
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
    spouseIncomeInput.value = memoSpouseIncome > 0 ? memoSpouseIncome.toLocaleString() : "";
  });
  spouseIncomeInput.addEventListener("blur", () => {
    isEditingSpouseIncome = false;
    updateSpouseIncomeCalc();
  });
  spouseIncomeInput.addEventListener("input", (e) => {
    const value = e.target.value.replace(/\D/g, '');
    memoSpouseIncome = value ? parseFloat(value) : 0;
    e.target.value = value ? memoSpouseIncome.toLocaleString() : "";
    updateSpouseIncomeCalc();
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

const ltvRateRadios = document.querySelectorAll('input[name="ltv_rate"]');
ltvRateRadios.forEach(radio => {
  radio.addEventListener("change", () => {
    document.querySelectorAll('#ltvRateToggleGroup label').forEach(lbl => {
      const r = lbl.querySelector('input[type="radio"]');
      if (r && r.checked) {
        lbl.style.backgroundColor = "#2563eb";
        lbl.style.color = "#ffffff";
      } else {
        lbl.style.backgroundColor = "transparent";
        lbl.style.color = "#64748b";
      }
    });
    if (typeof 자동계산 === 'function') 자동계산();
  });
});

const dsrLimitRateRadios = document.querySelectorAll('input[name="dsr_limit_rate"]');
dsrLimitRateRadios.forEach(radio => {
  radio.addEventListener("change", (e) => {
    document.querySelectorAll('#dsrLimitToggleGroup label').forEach(lbl => {
      const r = lbl.querySelector('input[type="radio"]');
      if (r && r.checked) {
        lbl.style.backgroundColor = "#2563eb";
        lbl.style.color = "#ffffff";
      } else {
        lbl.style.backgroundColor = "transparent";
        lbl.style.color = "#64748b";
      }
    });

    if (typeof 자동계산 === 'function') 자동계산();
  });
});

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

    firstRow.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
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

  document.querySelectorAll('input[type="text"], input[type="number"]').forEach(input => {
    if (input.id) localStorage.removeItem(`DSR_${input.id}`);
  });
  document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
    if (checkbox.id) localStorage.removeItem(`DSR_${checkbox.id}`);
  });
  localStorage.removeItem('DSR_mortgageData');
  
  updateIncomeCalc();
  showBubble("입력 내용이 초기화되었습니다.");
}

function saveDSRInputs() {
  document.querySelectorAll('input[type="text"], input[type="number"]').forEach(input => {
    if (input.id) localStorage.setItem(`DSR_${input.id}`, input.value);
  });
  document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
    if (checkbox.id) localStorage.setItem(`DSR_${checkbox.id}`, checkbox.checked);
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
      graceCheck: row.querySelector('.mort-grace-check')?.checked || false,
      graceTerm: row.querySelector('.mort-grace-term')?.value || ''
    };
    mortgageData.push(rowData);
  });
  
  localStorage.setItem('DSR_mortgageData', JSON.stringify(mortgageData));
}

function loadDSRInputs() {
  document.querySelectorAll('input[type="text"], input[type="number"]').forEach(input => {
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
      }
    }
  });
  
  document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
    if (checkbox.id) {
      const savedValue = localStorage.getItem(`DSR_${checkbox.id}`);
      if (savedValue !== null) {
        checkbox.checked = savedValue === 'true';
      }
    }
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
        const graceCheck = currentRow.querySelector('.mort-grace-check');
        const graceTerm = currentRow.querySelector('.mort-grace-term');
        
        if (exclude) exclude.checked = rowData.exclude;
        if (amount) amount.value = rowData.amount;
        if (rate) rate.value = rowData.rate;
        if (stRate) stRate.value = rowData.stRate;
        if (term) term.value = rowData.term;
        if (repaymentType) repaymentType.value = rowData.repaymentType;
        if (graceCheck) graceCheck.checked = rowData.graceCheck;
        if (graceTerm) graceTerm.value = rowData.graceTerm;
        
        const typeButtons = currentRow.querySelectorAll('.type-btn');
        typeButtons.forEach(btn => btn.classList.remove('active'));
        if (rowData.repaymentType === '원리금') typeButtons[0]?.classList.add('active');
        else if (rowData.repaymentType === '원금') typeButtons[1]?.classList.add('active');
        else if (rowData.repaymentType === '만기') typeButtons[2]?.classList.add('active');
      }
    });
  } catch (e) {
    console.warn('Failed to load mortgage data:', e);
  }
}

function setupDSRAutoSave() {
  document.querySelectorAll('input[type="text"], input[type="number"], input[type="checkbox"]').forEach(input => {
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
    const makeCell = (cls, node) => {
      const td = document.createElement('td');
      td.className = `income-settings-cell ${cls}`;
      td.appendChild(node);
      return td;
    };
    const row = cell.parentElement;
    const toggleCell = makeCell('toggle-cell', toggle);
    toggleCell.appendChild(rate);
    row.insertBefore(makeCell('age-cell', age), cell);
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
  updateIncomeCalc();
  updateSpouseIncomeCalc();
  if (typeof 자동계산 === 'function') 자동계산();
  
  window.addEventListener('resize', () => {
    adjustTableFontSize();
    adjustDsrMaxFontSize();
    adjustDsrToggleFontSize();
  });
  setTimeout(() => {
    adjustTableFontSize();
    adjustDsrMaxFontSize();
    adjustDsrToggleFontSize();
  }, 100);
}

window.addEventListener('DOMContentLoaded', init);
