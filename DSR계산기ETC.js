/* DSR계산기ETC - 그 외 코드 (UI, 이벤트, 모달, 로컬스토리지 등) */

/* 폰트 크기 자동 맞춤 기믹 (실시간 렌더링 안정화 버전) */
    function adjustTableFontSize() {
      const cells = document.querySelectorAll('table th, table td');
      cells.forEach(cell => {
        if (cell.closest('#modal-rate-card') || cell.closest('#modal-default-card') || cell.closest('#modal-text-card') || cell.closest('#modal-schedule-card')) return;

        if (!cell.dataset.origSize) {
          cell.dataset.origSize = window.getComputedStyle(cell).fontSize;
        }
        cell.style.fontSize = cell.dataset.origSize;
        let currentCellSize = parseFloat(cell.dataset.origSize);
        
        // 최소 폰트 크기를 더 작게 조정 (8px -> 4px)
        while (cell.scrollWidth > cell.clientWidth && currentCellSize > 4) {
          if (cell.clientWidth === 0) break; // 레이아웃 렌더링이 안 된 상태(0px)라면 강제 축소 방지
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
          if (maxWidth <= 0) return; // 인풋 너비가 정상적으로 잡히지 않은 상태면 연산 스킵
          
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

    /* 상환 스케줄 팝업창 활성화 및 데이터 생성 */
    function openScheduleModal() {
      document.getElementById("modal-img").style.display = "none";
      document.getElementById("modal-text-card").style.display = "none";
      
      generateSchedule();

      document.getElementById("modal-schedule-card").style.display = "block";
      document.getElementById("image-modal").style.display = "flex";
    }

    

    /* 이미지 안내 팝업창 활성화 */
    function openImageModal(imageSrc) {
      document.getElementById("modal-text-card").style.display = "none";
      document.getElementById("modal-schedule-card").style.display = "none";
      document.getElementById("modal-img").src = imageSrc;
      document.getElementById("modal-img").style.display = "block";
      document.getElementById("image-modal").style.display = "flex";
    }

    /* 텍스트 내용 안내 팝업창 활성화 */
    function openTextModal() {
      document.getElementById("modal-img").style.display = "none";
      document.getElementById("modal-schedule-card").style.display = "none";
      
      const textCard = document.getElementById("modal-text-card");
      textCard.style.display = "block";
      document.getElementById("image-modal").style.display = "flex";
      textCard.scrollTop = 0;
    }

    /* 장래예상 요율 수정 팝업창 활성화 (계산기설명 팝업 하단으로 이동 후 스크롤) */
    function openRateEditModal() {
      document.getElementById("modal-img").style.display = "none";
      document.getElementById("modal-schedule-card").style.display = "none";
      
      LOAN_RATE_TABLE.forEach((item, index) => {
        document.getElementById(`edit-rate-${index}`).value = item.percent;
      });
      
      const textCard = document.getElementById("modal-text-card");
      textCard.style.display = "block";
      document.getElementById("image-modal").style.display = "flex";

      const targetSection = document.getElementById("modal-rate-card");
      if (targetSection) targetSection.scrollIntoView({ block: "start" });
    }

    /* 본건 대출 기본값 설정 팝업창 활성화 (계산기설명 팝업 하단으로 이동 후 스크롤) */
    function openDefaultFirstRowModal() {
      document.getElementById("modal-img").style.display = "none";
      document.getElementById("modal-schedule-card").style.display = "none";

      const savedData = localStorage.getItem("DEFAULT_FIRST_ROW_DATA");
      if (savedData) {
        const data = JSON.parse(savedData);
        document.getElementById("default-mort-rate").value = data.sixMonthRate || data.rate || "";
        document.getElementById("default-five-year-rate").value = data.fiveYearRate || "";
        document.getElementById("default-mort-st-rate").value = data.sixMonthStRate || data.stRate || "";
        document.getElementById("default-five-year-st-rate").value = data.fiveYearStRate || "";
        document.getElementById("default-mort-term").value = data.sixMonthTerm || data.term || "";
        document.getElementById("default-five-year-term").value = data.fiveYearTerm || "";
      } else {
        document.getElementById("default-mort-rate").value = "";
        document.getElementById("default-five-year-rate").value = "";
        document.getElementById("default-mort-st-rate").value = "";
        document.getElementById("default-five-year-st-rate").value = "";
        document.getElementById("default-mort-term").value = "";
        document.getElementById("default-five-year-term").value = "";
      }

      const textCard = document.getElementById("modal-text-card");
      textCard.style.display = "block";
      document.getElementById("image-modal").style.display = "flex";

      const targetSection = document.getElementById("modal-default-card");
      if (targetSection) targetSection.scrollIntoView({ block: "start" });
    }

    /* 본건 대출 기본값 저장 */
    function saveDefaultFirstRowData() {
      const rate = document.getElementById("default-mort-rate").value.trim();
      const fiveYearRate = document.getElementById("default-five-year-rate").value.trim();
      const sixMonthStRate = document.getElementById("default-mort-st-rate").value.trim();
      const fiveYearStRate = document.getElementById("default-five-year-st-rate").value.trim();
      const sixMonthTerm = document.getElementById("default-mort-term").value.trim();
      const fiveYearTerm = document.getElementById("default-five-year-term").value.trim();

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
        if (rate) firstRow.querySelector('.mort-rate').value = rate;
        if (sixMonthStRate) firstRow.querySelector('.mort-st-rate').value = sixMonthStRate;
        if (sixMonthTerm) firstRow.querySelector('.mort-term').value = sixMonthTerm;
        자동계산();
      }
    }

    /* 요율 세팅 저장 */
    function saveCustomRates() {
      for(let i=0; i<LOAN_RATE_TABLE.length; i++) {
        const val = parseFloat(document.getElementById(`edit-rate-${i}`).value);
        if(isNaN(val) || val < 0) {
          alert("올바른 요율(숫자)을 입력해주세요.");
          return;
        }
        LOAN_RATE_TABLE[i].percent = val;
      }
      localStorage.setItem("CUSTOM_LOAN_RATE_TABLE", JSON.stringify(LOAN_RATE_TABLE));
      showBubble("예상 요율 저장 완료");
      closeModal();
      updateIncomeCalc();
    }

    /* 모든 팝업창 닫기 */
    function closeModal() {
      document.getElementById("image-modal").style.display = "none";
    }

    /* 주담대 상환방식 제어 활성화 함수 */
    function setMortgageRepaymentType(btn, type) {
      const row = btn.closest('tr');
      row.querySelector('.mort-type').value = type;
      const buttons = btn.parentElement.querySelectorAll('.type-btn');
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      자동계산();
    }

    function showBubble(text = "신DTI 적용") {
      const b = document.getElementById("bubble-box");
      b.innerText = text;
      b.style.display = "block"; 
      setTimeout(() => b.style.display = "none", 1000);
    }

    /* 연산 엔진 공식군 */
    

    

    

    

    

    function setFirstRowRepaymentType(type) {
      const firstRow = document.querySelector('#mortgage-inputs .mortgage-row');
      if (!firstRow) return;
      const button = Array.from(firstRow.querySelectorAll('.type-btn')).find(b => b.innerText.trim() === type);
      if (button) setMortgageRepaymentType(button, type);
    }

    function handleDsrMaxBlockClick(block) {
      const mainValEl = block.querySelector('.dsr-main-val');
      const text = mainValEl ? mainValEl.innerText.trim() : block.innerText.trim();
      const totalAmount = parseKoreanAmountText(text);
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
        자동계산();
      }
    }

    /* DSR 한도금액 클릭 시 본건 대출원금 입력칸에 세팅해주는 함수 */
    function 전달DSR한도금액(tdElement) {
      const mainValEl = tdElement.querySelector('.dsr-main-val');
      const text = mainValEl ? mainValEl.innerText.trim() : tdElement.innerText.trim();
      if (!text || text === "-" || text.includes("기존대출 초과")) return;

      const totalAmount = parseKoreanAmountText(text);
      const firstRow = document.querySelector('#mortgage-inputs .mortgage-row');
      if (firstRow) {
        const amtInput = firstRow.querySelector('.mort-amt');
        if (amtInput && totalAmount > 0) {
          amtInput.value = totalAmount.toLocaleString();
          showBubble("최대한도가 본건에 입력되었습니다.");
          자동계산();
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
        
        // 🎯 [수정된 부분] el.getBoundingClientRect().width 대신 clientWidth 사용 후 좌우 여백(-10px) 확보
        const maxWidth = el.clientWidth - 10; 
        if (maxWidth <= 0) return;

        const style = window.getComputedStyle(mainEl);
        ghost.style.fontFamily = style.fontFamily;
        ghost.style.fontWeight = style.fontWeight;
        ghost.style.fontStyle = style.fontStyle;
        ghost.style.letterSpacing = style.letterSpacing;

        ghost.innerText = mainEl.innerText.trim() || '-';

        let fontSize = 28; // 메인 폰트 초기 최대 크기
        ghost.style.fontSize = fontSize + 'px';
        
        // 🎯 [수정된 부분] 폰트 최소 크기를 10에서 8로 낮춰 단위가 100억 단위를 넘어가도 안 깨지게 방어
        while (fontSize > 8 && ghost.offsetWidth > maxWidth) {
          fontSize -= 0.5;
          ghost.style.fontSize = fontSize + 'px';
        }
        mainEl.style.fontSize = fontSize + 'px';
      });
    }

    /* LTV 최대한도 시세 기준 적용 계산 함수 (요청 반영) */
    

    /* LTV 최대한도 실시간 계산 및 렌더링 함수 */
    

    /* 자동계산 메인 연산 엔진 */
    

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
      const savedDataText = localStorage.getItem("DEFAULT_FIRST_ROW_DATA");
      const savedData = savedDataText ? JSON.parse(savedDataText) : null;
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
        자동계산();
      }
    }

    /* 동적 추가된 주담대 인풋 실시간 이벤트 바인딩 (이미지 레이아웃 대응) */
    function bindMortgageRowEvents(row) {
      row.querySelectorAll('.mort-amt, .mort-term').forEach(el => {
        el.addEventListener("input", (e) => {
          let v = e.target.value.replace(/\D/g, '');
          e.target.value = v ? parseInt(v).toLocaleString() : '';
          자동계산();
        });
      });
      
      row.querySelectorAll('.mort-rate, .mort-st-rate').forEach(el => {
        el.addEventListener("input", (e) => {
          e.target.value = e.target.value.replace(/[^0-9.]/g, '');
          자동계산();
        });
      });

      row.querySelectorAll('.mort-grace-term').forEach(el => {
        el.addEventListener("input", (e) => {
          e.target.value = e.target.value.replace(/\D/g, '');
          자동계산();
        });
      });

      const profileSelect = row.querySelector('.mort-default-switch');
      if (profileSelect) {
        profileSelect.addEventListener('click', () => {
          const nextProfile = profileSelect.dataset.profile === '6M' ? '5Y' : '6M';
          profileSelect.dataset.profile = nextProfile;
          profileSelect.classList.toggle('active', nextProfile === '5Y');
          applyDefaultProfileToRow(row, nextProfile);
        });
      }

      let longPressTimer;
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

      row.querySelectorAll('input[type="checkbox"], select').forEach(el => {
        el.addEventListener("change", (e) => {
          if (e.target.tagName === 'SELECT') {
            const termInput = row.querySelector('.mort-term');
            const interestInput = row.querySelector('.mort-interest-only');
            const value = e.target.value;
            if (value === '직접입력') {
              if (termInput) termInput.value = '';
              if (interestInput) interestInput.checked = false;
            } else if (value === '신용대출') {
              if (termInput) termInput.value = '60';
              if (interestInput) interestInput.checked = false;
            } else if (value === '전세자금') {
              if (termInput) termInput.value = '24';
              if (interestInput) interestInput.checked = true;
            } else if (value === '비주택담보') {
              if (termInput) termInput.value = '60';
              if (interestInput) interestInput.checked = false;
            } else if (value === '예적금') {
              if (termInput) termInput.value = '';
              if (interestInput) interestInput.checked = true;
            } else if (value === '기타') {
              if (termInput) termInput.value = '12';
              if (interestInput) interestInput.checked = false;
            } else if (value === '중도/이주') {
              if (termInput) termInput.value = '300';
              if (interestInput) interestInput.checked = false;
            }
             else if (value === '주택담보') {
              if (termInput) termInput.value = '360';
              if (interestInput) interestInput.checked = false;
            }
          }
          if (e.target.classList.contains('mort-interest-only')) showBubble(e.target.checked ? "이자만 적용" : "원금+이자 적용");
          if (e.target.classList.contains('mort-exclude')) showBubble(e.target.checked ? "계산 제외" : "대출 적용");
          if (e.target.classList.contains('mort-grace-check')) showBubble(e.target.checked ? "거치 적용" : "거치 해제");
          자동계산();
        });

        if (el.classList.contains('mort-exclude')) {
          const startPress = () => {
            longPressTimer = setTimeout(() => {
              if (document.querySelectorAll('#mortgage-inputs .mortgage-row').length > 1) {
                row.remove(); 
                showBubble("해당 대출 정보 삭제 완료");
                updateMortgagePlaceholders(); 
                자동계산(); 
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

    /* 행 순서에 따른 placeholder 자동 부여 */
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

    /* 주담대 행 생성 함수 (이미지의 통합된 레이아웃 템플릿 사용) */
    let mortCount = 0;

    function 주담대행추가() {
      mortCount++;
      const tbody = document.getElementById('mortgage-inputs');
      const newRow = document.createElement('tr');
      const isFirstRow = mortCount === 1;
      newRow.className = isFirstRow ? "mortgage-row first-row" : "mortgage-row";
      newRow.style.textAlign = "center";
      const profileSelectMarkup = isFirstRow ? `<button type="button" class="mort-default-switch" data-profile="6M" aria-label="6M/5Y 전환"><span class="switch-label active">6M</span><span class="switch-label">5Y</span></button>` : '';
      
      newRow.innerHTML = `
        <td class="no-bg" style="padding: 6px 4px; vertical-align: middle;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; grid-auto-rows: minmax(38px, auto); gap: 6px; width:100%;">
            <div style="display:flex; justify-content:center; align-items:center; padding:6px; background:#fbfdff; border-radius:8px;">
              <input type="checkbox" class="mort-exclude" title="계산제외">
            </div>
            <div style="display:flex; justify-content:center; align-items:center; padding:6px; background:#fbfdff; border-radius:8px;">
              <input type="checkbox" class="mort-interest-only" title="이자만적용">
            </div>
            <div style="grid-column: 1 / -1;">
              <select class="dropdown-select">
                <option value="직접입력">직접입력</option>
                <option value="신용대출">신용대출</option>
                <option value="주택담보">주택담보</option>
                <option value="전세자금">전세자금</option>
                <option value="비주택담보">비주택담보</option>
                <option value="예적금">예적금</option>
                <option value="중도/이주">중도/이주</option>
                <option value="기타">기타</option>
              </select>
            </div>
          </div>
        </td>
        <td class="no-bg" style="padding: 6px 4px;">
          <div class="input-flex-col">
            <div class="mort-amount-row">
              <input type="text" inputmode="numeric" placeholder="" class="mort-amt">
            </div>
            <input type="hidden" class="mort-default-profile" value="6M">
            <div class="input-flex-row">
              ${profileSelectMarkup}
              <input type="text" inputmode="decimal" placeholder="금리 %" class="mort-rate">
              <input type="text" inputmode="decimal" placeholder="ST %" class="mort-st-rate">
            </div>
          </div>
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
          <div style="display: flex; justify-content: center; align-items: center; gap: 4px; margin-top: 6px;">
            <input type="checkbox" class="mort-grace-check" title="거치 적용">
            <input type="text" inputmode="numeric" placeholder="거치(개월)" class="mort-grace-term" style="width: 70%; padding: 4px; font-size: 11px;">
          </div>
        </td>
      `;
      
      tbody.appendChild(newRow);
      
      if (mortCount === 1) {
        const select = newRow.querySelector('select');
        if (select) select.value = '주택담보';
      }
      
      bindMortgageRowEvents(newRow);
      if (mortCount === 1) {
        applyDefaultProfileToRow(newRow, '6M');
      }
      updateMortgagePlaceholders();
      adjustTableFontSize();
      자동계산();
    }

    /* 장래예상소득(연소득) 제어 및 데이터 연동 로직 */
    const savedRates = localStorage.getItem("CUSTOM_LOAN_RATE_TABLE");
    const LOAN_RATE_TABLE = savedRates ? JSON.parse(savedRates) : [
        { minAge: 20, maxAge: 24, percent: 150.69 },
        { minAge: 25, maxAge: 29, percent: 131.62 },
        { minAge: 30, maxAge: 34, percent: 118.41 },
        { minAge: 35, maxAge: 39, percent: 106.54 },
        { minAge: 40, maxAge: 44, percent: 101.62 }
    ];
    
    let memoBaseIncome = 0;
    let isEditingIncome = false;

    const baseIncomeInput = document.getElementById("baseIncomeInput");
    const hiddenIncomeInput = document.getElementById("computedIncomeHidden");
    const ageInput = document.getElementById("ageInput");
    const applyRateCheck = document.getElementById("applyRateCheck");
    const rateDisplay = document.getElementById("rateDisplay");

    function updateIncomeCalc() {
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
        
        자동계산();
    }

    applyRateCheck.addEventListener("change", (e) => {
        showBubble(e.target.checked ? "장래예상 적용" : "장래예상 해제");
        updateIncomeCalc();
    });


    ageInput.addEventListener("input", updateIncomeCalc);

    baseIncomeInput.addEventListener("focus", () => {
        isEditingIncome = true;
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
        if (applyRateCheck.checked && ageInput.value !== '') {
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
        hiddenIncomeInput.value = tempFinal > 0 ? Math.floor(tempFinal).toLocaleString() : "";
        자동계산();
    });

    // LTV 입력칸 이벤트 실시간 연결 추가
    const ltvMarketPriceInput = document.getElementById("ltvMarketPriceInput");
    if (ltvMarketPriceInput) {
      ltvMarketPriceInput.addEventListener("input", (e) => {
        let v = e.target.value.replace(/\D/g, '');
        e.target.value = v ? parseInt(v).toLocaleString() : '';
        자동계산();
      });
    }

    const ltvMinorLeaseInput = document.getElementById("ltvMinorLeaseInput");
    if (ltvMinorLeaseInput) {
      ltvMinorLeaseInput.addEventListener("input", (e) => {
        let v = e.target.value.replace(/\D/g, '');
        e.target.value = v ? parseInt(v).toLocaleString() : '';
        자동계산();
      });
    }

    const ltvRateRadios = document.querySelectorAll('input[name="ltv_rate"]');
    ltvRateRadios.forEach(radio => {
      radio.addEventListener("change", () => {
        // 라벨 디자인 스타일 토글 반영
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
        자동계산();
      });
    });

    // 지정 항목 초기화 함수 추가
    function 선택초기화() {
      let savedDefaultFirstRowData = null;
      try {
        const savedData = localStorage.getItem("DEFAULT_FIRST_ROW_DATA");
        savedDefaultFirstRowData = savedData ? JSON.parse(savedData) : null;
      } catch (e) {
        console.warn("기본값 복원 데이터 파싱 실패:", e);
      }

      const baseIncomeInput = document.getElementById("baseIncomeInput");
      baseIncomeInput.value = "";
      memoBaseIncome = 0;
      document.getElementById("computedIncomeHidden").value = "";

      const applyRateCheck = document.getElementById("applyRateCheck");
      applyRateCheck.checked = false;

      const ageInput = document.getElementById("ageInput");
      ageInput.value = "";

      const ltvMarketPriceInput = document.getElementById("ltvMarketPriceInput");
      if (ltvMarketPriceInput) ltvMarketPriceInput.value = "";
      const ltvMaxAmountOutput = document.getElementById("ltvMaxAmountOutput");
      if (ltvMaxAmountOutput) ltvMaxAmountOutput.value = "";
      const ltvMinorLeaseInput = document.getElementById("ltvMinorLeaseInput");
      if (ltvMinorLeaseInput) ltvMinorLeaseInput.value = "";

      const firstRow = document.querySelector('#mortgage-inputs .mortgage-row');
      if (firstRow) {
        const mortAmt = firstRow.querySelector('.mort-amt');
        if (mortAmt) {
          mortAmt.value = '';
        }
        
        const loanTypeSelect = firstRow.querySelector('select.dropdown-select');
        if (loanTypeSelect) {
          loanTypeSelect.value = '직접입력';
        }
        
        const rateInput = firstRow.querySelector('.mort-rate');
        if (rateInput) {
          rateInput.value = savedDefaultFirstRowData?.rate || '';
        }
        
        const stRateInput = firstRow.querySelector('.mort-st-rate');
        if (stRateInput) {
          stRateInput.value = savedDefaultFirstRowData?.stRate || '';
        }
        
        const termInput = firstRow.querySelector('.mort-term');
        if (termInput) {
          termInput.value = savedDefaultFirstRowData?.term || '';
        }

        const firstRowCheckboxes = firstRow.querySelectorAll('input[type="checkbox"]');
        firstRowCheckboxes.forEach(checkbox => {
          checkbox.checked = false;
        });
      }

      const allRows = document.querySelectorAll('#mortgage-inputs .mortgage-row');
      for (let i = 1; i < allRows.length; i++) {
        const inputs = allRows[i].querySelectorAll('input, select');
        inputs.forEach(input => {
          if (input.type === 'checkbox') {
            input.checked = false;
          } else {
            input.value = '';
          }
        });

        const typeInput = allRows[i].querySelector('.mort-type');
        const typeButtons = allRows[i].querySelectorAll('.type-btn');
        if (typeInput) {
          typeInput.value = '원리금';
        }
        typeButtons.forEach(btn => btn.classList.remove('active'));
        const defaultTypeBtn = allRows[i].querySelector('.type-btn:nth-child(1)');
        if (defaultTypeBtn) {
          defaultTypeBtn.classList.add('active');
        }
      }

      const firstRowTypeInput = firstRow.querySelector('.mort-type');
      const firstRowTypeButtons = firstRow.querySelectorAll('.type-btn');
      if (firstRowTypeInput) {
        firstRowTypeInput.value = '원리금';
      }
      firstRowTypeButtons.forEach(btn => btn.classList.remove('active'));
      const firstDefaultTypeBtn = firstRow.querySelector('.type-btn:nth-child(1)');
      if (firstDefaultTypeBtn) {
        firstDefaultTypeBtn.classList.add('active');
      }

      const inputs = document.querySelectorAll('input[type="text"], input[type="number"]');
      inputs.forEach(input => {
        if (input.id) {
          localStorage.removeItem(`DSR_${input.id}`);
        }
      });
      
      const checkboxes = document.querySelectorAll('input[type="checkbox"]');
      checkboxes.forEach(checkbox => {
        if (checkbox.id) {
          localStorage.removeItem(`DSR_${checkbox.id}`);
        }
      });
      
      localStorage.removeItem('DSR_mortgageData');
      
      updateIncomeCalc();
      showBubble("입력 내용이 초기화되었습니다.");

      
    }

    // DSR 페이지 LocalStorage 관련 함수들
    function saveDSRInputs() {
      const inputs = document.querySelectorAll('input[type="text"], input[type="number"]');
      inputs.forEach(input => {
        if (input.id) {
          localStorage.setItem(`DSR_${input.id}`, input.value);
        }
      });
      
      const checkboxes = document.querySelectorAll('input[type="checkbox"]');
      checkboxes.forEach(checkbox => {
        if (checkbox.id) {
          localStorage.setItem(`DSR_${checkbox.id}`, checkbox.checked);
        }
      });

      saveMortgageRows();
    }

    function saveMortgageRows() {
      const rows = document.querySelectorAll('#mortgage-inputs .mortgage-row');
      const mortgageData = [];
      
      rows.forEach((row, index) => {
        const rowData = {
          exclude: row.querySelector('.mort-exclude')?.checked || false,
          interestOnly: row.querySelector('.mort-interest-only')?.checked || false,
          loanType: row.querySelector('select.dropdown-select')?.value || '직접입력',
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
      const inputs = document.querySelectorAll('input[type="text"], input[type="number"]');
      inputs.forEach(input => {
        if (input.id) {
          const savedValue = localStorage.getItem(`DSR_${input.id}`);
          if (savedValue !== null) {
            input.value = savedValue;
          }
        }
      });
      
      const checkboxes = document.querySelectorAll('input[type="checkbox"]');
      checkboxes.forEach(checkbox => {
        if (checkbox.id) {
          const savedValue = localStorage.getItem(`DSR_${checkbox.id}`);
          if (savedValue !== null) {
            checkbox.checked = savedValue === 'true';
          }
        }
      });

      setTimeout(() => {
        loadMortgageRows();
      }, 100);
    }

    function loadMortgageRows() {
      const savedData = localStorage.getItem('DSR_mortgageData');
      if (!savedData) return;
      
      try {
        const mortgageData = JSON.parse(savedData);
        const tbody = document.getElementById('mortgage-inputs');
        
        if (!tbody) return;
        
        const existingRows = tbody.querySelectorAll('.mortgage-row');
        for (let i = 0; i < existingRows.length; i++) {
          existingRows[i].remove();
        }
        
        mortCount = 0;
        
        mortgageData.forEach((rowData, index) => {
          주담대행추가();
          
          const rows = tbody.querySelectorAll('.mortgage-row');
          const currentRow = rows[rows.length - 1];
          
          if (currentRow) {
            const exclude = currentRow.querySelector('.mort-exclude');
            const interestOnly = currentRow.querySelector('.mort-interest-only');
            const loanTypeSelect = currentRow.querySelector('select.dropdown-select');
            const amount = currentRow.querySelector('.mort-amt');
            const rate = currentRow.querySelector('.mort-rate');
            const stRate = currentRow.querySelector('.mort-st-rate');
            const term = currentRow.querySelector('.mort-term');
            const repaymentType = currentRow.querySelector('.mort-type');
            const graceCheck = currentRow.querySelector('.mort-grace-check');
            const graceTerm = currentRow.querySelector('.mort-grace-term');
            
            if (exclude) exclude.checked = rowData.exclude;
            if (interestOnly) interestOnly.checked = rowData.interestOnly;
            if (loanTypeSelect) loanTypeSelect.value = rowData.loanType;
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
      const inputs = document.querySelectorAll('input[type="text"], input[type="number"], input[type="checkbox"]');
      inputs.forEach(input => {
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

    /* 초기 기본 세팅 */
    function init() {
      if (!localStorage.getItem('DSR_mortgageData') || localStorage.getItem('DSR_mortgageData') === "[]") {
        주담대행추가();
      }
      loadDSRInputs();
      setupDSRAutoSave();
      자동계산();
      
      // 화면 렌더링 즉시 및 리사이즈 시 텍스트 크기 조절
      window.addEventListener('resize', () => {
        adjustTableFontSize();
        adjustDsrMaxFontSize();
      });
      setTimeout(() => {
        adjustTableFontSize();
        adjustDsrMaxFontSize();
      }, 100);
    }

    window.addEventListener('DOMContentLoaded', init);