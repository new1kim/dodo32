/* DSR계산기Calc - 계산 관련 로직 (DSR, DTI, 신DTI, 원리금, 원금균등, 만기일시 등) */

function 원리금균등_계산대출(amt, rate, term) {
  if (rate > 0 && term > 0 && amt > 0) {
    const mRate = rate / 12;
    const mPay = amt * mRate / (1 - Math.pow(1 + mRate, -term));
    const mInt = amt * mRate;
    return { 월상환금액: mPay, 첫달원금: mPay - mInt, 첫달이자: mInt };
  }
  return { 월상환금액: 0, 첫달원금: 0, 첫달이자: 0 };
}

function 원금균등_월부담액(amt, rate, term) {
  if (rate > 0 && term > 0 && amt > 0) {
    const mRate = rate / 12;
    const p = Math.round(amt / term);
    const i = Math.round(amt * mRate);
    return { 월상환금액: p + i, 첫달원금: p, 첫달이자: i };
  }
  return { 월상환금액: 0, 첫달원금: 0, 첫달이자: 0 };
}

function 원금균등_연간계산(amt, rate, term) {
  if (rate > 0 && term > 0 && amt > 0) {
    const mRate = rate / 12;
    const p = amt / term;
    const i = amt * mRate;
    const annualInt = ((i + (p * mRate)) / 2) * 12;
    const annualP = p * 12;
    return { 대출합계: annualInt + annualP };
  }
  return { 대출합계: 0 };
}

function formatKoreanAmount(amount) {
  if (amount <= 0 || isNaN(amount) || !isFinite(amount)) return "-";
  const uk = Math.floor(amount / 100000000);
  const man = Math.floor((amount % 100000000) / 10000);
  
  let result = "";
  if (uk > 0) result += uk + "억 ";
  if (man > 0) result += man.toLocaleString() + "만";    
  else if (uk > 0) result += "원";
  
  return result.trim() || "0원";
}

function parseKoreanAmountText(text) {
  if (!text) return 0;
  let totalAmount = 0;
  const ukMatch = text.match(/([\d,]+)억/);
  const manMatch = text.match(/([\d,]+)만/);

  if (ukMatch) {
    totalAmount += parseInt(ukMatch[1].replace(/,/g, ''), 10) * 100000000;
  }
  if (manMatch) {
    totalAmount += parseInt(manMatch[1].replace(/,/g, ''), 10) * 10000;
  }
  return totalAmount;
}

/* -------------------- 거치기간 반영 공통 유틸 --------------------
   대출행(row)의 거치 체크/거치개월 입력값을 읽어, 실제 거치개월(graceTerm)과
   원금 상환이 시작되는 이후 개월수(postTerm)를 계산한다.
   기존에는 본건 스케줄(generateSchedule), 자동계산 메인 루프, DSR 최대한도 계산부
   3곳에 동일한 로직이 그대로 반복되어 있었음. */
function getGraceAdjustedTerm(row, term) {
  const graceCheckEl = row.querySelector('.mort-grace-check');
  const graceCheck = graceCheckEl ? graceCheckEl.checked : false;

  const graceTermEl = row.querySelector('.mort-grace-term');
  let graceTerm = parseInt(graceTermEl ? graceTermEl.value : 0) || 0;
  if (!graceCheck) graceTerm = 0;
  if (graceTerm >= term) graceTerm = term > 0 ? term - 1 : 0;

  let postTerm = term - graceTerm;
  if (postTerm <= 0) postTerm = 1;

  return { graceTerm, postTerm };
}

function getLtvMaxLimitByMarketPrice(marketPrice) {
  if (marketPrice <= 1500000000) {
    return 600000000; 
  } else if (marketPrice <= 2500000000) {
    return 400000000; 
  } else {
    return 200000000; 
  }
}

/* LTV 최대한도 금액(원 단위 숫자)을 계산한다. 시세가 입력되지 않았으면 null 반환.
   기존에는 updateLtvMaxAmount()와 자동계산() 내부(DSR 최대한도 산정용)에
   동일한 산식이 두 번 중복 작성되어 있었음. */
function calculateLtvMaxAmount() {
  const marketPriceInput = document.getElementById("ltvMarketPriceInput");
  const priceVal = marketPriceInput ? (parseFloat(marketPriceInput.value.replace(/,/g, '')) || 0) : 0;
  if (priceVal <= 0) return null;

  const selectedRadio = document.querySelector('input[name="ltv_rate"]:checked');
  const ltvRate = selectedRadio ? parseFloat(selectedRadio.value) || 0 : 70;

  const minorLeaseInput = document.getElementById("ltvMinorLeaseInput");
  const minorLeaseVal = minorLeaseInput ? (parseFloat(minorLeaseInput.value.replace(/,/g, '')) || 0) : 0;

  let maxLtvAmount = priceVal * (ltvRate / 100) - minorLeaseVal;
  const limitAmount = getLtvMaxLimitByMarketPrice(priceVal);
  if (maxLtvAmount > limitAmount) {
    maxLtvAmount = limitAmount;
  }
  return Math.max(0, maxLtvAmount);
}

function updateLtvMaxAmount() {
  const ltvOutput = document.getElementById("ltvMaxAmountOutput");
  if (!ltvOutput) return;

  const maxLtvAmount = calculateLtvMaxAmount();
  if (maxLtvAmount === null) {
    ltvOutput.value = "-";
    return;
  }

  ltvOutput.value = maxLtvAmount > 0 ? formatKoreanAmount(Math.round(maxLtvAmount)) : "0원";
}


function updateScheduleLoanInfo(amtText, rateText, termText, typeText) {
  const infoEl = document.getElementById("schedule-loan-info");
  if (!infoEl) return;
  if (!amtText) {
    infoEl.textContent = "";
    return;
  }
            // 대출정보 표시    대출금액 / 금리 / 기간 / 상환방식
  infoEl.textContent = `${amtText} / ${rateText} / ${termText} / ${typeText}`;
}

/* 상환 스케줄 표 한 행(<tr>)을 생성한다. 만기/원리금/원금 세 가지 방식 모두
   "월상환금액 = 원금 + 이자" 이므로 payAmount는 내부에서 계산한다.
   기존에는 세 방식의 반복문마다 동일한 <tr> 마크업이 그대로 복사되어 있었음. */
function buildScheduleRow(i, principal, interest, balance, term) {
  const payAmount = principal + interest;
  const dividerClass = (i % 12 === 0 && i !== term) ? "year-divider" : "";
  return `<tr class="${dividerClass}">
        <td style="text-align:center;">${i}</td>
        <td style="text-align:center;">${Math.round(payAmount).toLocaleString()}</td>
        <td style="text-align:center;">${Math.round(principal).toLocaleString()}</td>
        <td style="text-align:center;">${Math.round(interest).toLocaleString()}</td>
        <td style="text-align:center;">${Math.round(balance).toLocaleString()}</td>
      </tr>`;
}

function generateSchedule() {
  const tbody = document.getElementById("schedule-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const firstRow = document.querySelector('#mortgage-inputs .mortgage-row');
  if (!firstRow) { updateScheduleLoanInfo(); return; }

  const isExcluded = firstRow.querySelector('.mort-exclude').checked;
  if (isExcluded) {
    tbody.innerHTML = "<tr><td colspan='5' style='text-align:center; padding:20px;'>계산 제외된 대출입니다.</td></tr>";
    updateScheduleLoanInfo();
    return;
  }

  const rateInputVal = firstRow.querySelector('.mort-rate').value;
  const amt = parseFloat(firstRow.querySelector('.mort-amt').value.replace(/,/g, '')) || 0;
  const pureRate = parseFloat(rateInputVal) / 100 || 0;
  const term = parseInt(firstRow.querySelector('.mort-term').value) || 0;
  const type = firstRow.querySelector('.mort-type').value;
  const typeLabelMap = { "만기": "만기일시", "원리금": "원리금균등", "원금": "원금균등" };

  const { graceTerm, postTerm } = getGraceAdjustedTerm(firstRow, term);

  if (amt <= 0 || term <= 0 || pureRate <= 0) {
    tbody.innerHTML = "<tr><td colspan='5' style='text-align:center; padding:20px;'>본건 대출 정보(금액, 금리, 기간)를 정확히 입력해주세요.</td></tr>";
    updateScheduleLoanInfo();
    return;
  }

  updateScheduleLoanInfo(
    formatKoreanAmount(amt),
    `${rateInputVal}%`,
    `${term}개월`,
    typeLabelMap[type] || type
  );

  let balance = amt;
  const mRate = pureRate / 12;
  let html = "";
  
  if (type === "만기") {
    const mPay = balance * mRate;
    for (let i = 1; i <= term; i++) {
      let principal = 0;
      const interest = mPay;
      if (i === term) principal = balance;
      balance -= principal;

      html += buildScheduleRow(i, principal, interest, balance, term);
    }
  } else if (type === "원리금") {
    let mPayPost = amt * mRate / (1 - Math.pow(1 + mRate, -postTerm));
    for (let i = 1; i <= term; i++) {
      const interest = balance * mRate;
      let principal = 0;

      if (i > graceTerm) {
        principal = mPayPost - interest;
        if (i === term) {
          principal = balance;
        }
      }

      balance -= principal;
      if (balance < 0) balance = 0;

      html += buildScheduleRow(i, principal, interest, balance, term);
    }
  } else if (type === "원금") {
    const fixedPrincipal = amt / postTerm;
    for (let i = 1; i <= term; i++) {
      const interest = balance * mRate;
      let principal = 0;

      if (i > graceTerm) {
        principal = fixedPrincipal;
        if (i === term) principal = balance;
      }

      balance -= principal;
      if (balance < 0) balance = 0;

      html += buildScheduleRow(i, principal, interest, balance, term);
    }
  }

  tbody.innerHTML = html;
}

/* DSR/DTI/신DTI 결과칸에 값과 40% 초과 여부에 따른 경고 스타일을 함께 적용한다.
   기존에는 DSR/DTI/신DTI 3개 칸에 대해 동일한 if(>=40){...}else{...} 블록이
   그대로 3번 반복 작성되어 있었음. */
function applyRatioResultStyle(el, ratioPercent) {
  if (!el) return;
  el.innerText = ratioPercent.toFixed(2) + "%";
  if (ratioPercent >= 40) {
    el.style.setProperty("background-color", "#fee2e2", "important");
    el.style.color = "#ef4444";
  } else {
    el.style.setProperty("background-color", "transparent", "important");
    el.style.color = "#1e293b";
  }
}

/* DSR/DTI/신DTI 결과칸을 "-"(미입력) 상태로 되돌린다. */
function resetRatioResultDisplay(el) {
  if (!el) return;
  el.innerText = "-";
  el.style.setProperty("background-color", "transparent", "important");
  el.style.color = "#1e293b";
}

/* DSR 최대한도(원리금/원금) 블록을 "-" 상태로 되돌린다.
   기존에는 소득이 없을 때, DSR 계산이 불가능할 때 2곳에서
   동일한 forEach 블록이 그대로 중복 작성되어 있었음. */
function resetDsrMaxBlocks() {
  ['DSR최대금액확인-원리금', 'DSR최대금액확인-원금'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.querySelector('.dsr-main-val').innerText = "-";
      el.querySelector('.dsr-sub-val').innerText = "(-)";
    }
  });
}

function 자동계산() {
  const income = ["computedIncomeHidden", "spouseComputedIncomeHidden"].reduce((total, id) => {
    const el = document.getElementById(id);
    return total + (parseFloat((el?.value || "").replace(/,/g, '')) || 0);
  }, 0);
  const totalIncomeOutput = document.getElementById("totalIncomeOutput");
  if (totalIncomeOutput) totalIncomeOutput.value = income > 0 ? Math.floor(income).toLocaleString() : "";
  
  let sumM = 0, sumP = 0, sumI = 0;
  
  let totalDsrDebt = 0;
  let totalDtiDebt = 0;
  let totalNewDtiDebt = 0;
  let existingOtherDebtPayment = 0; 

  const mortRows = document.querySelectorAll('#mortgage-inputs .mortgage-row');
  mortRows.forEach((row, index) => {
    const excludeEl = row.querySelector('.mort-exclude');
    const isExcluded = excludeEl ? excludeEl.checked : false;
    if (isExcluded) return; 

    const amtEl = row.querySelector('.mort-amt');
    const rateEl = row.querySelector('.mort-rate');
    const stRateEl = row.querySelector('.mort-st-rate');
    const termEl = row.querySelector('.mort-term');
    const typeEl = row.querySelector('.mort-type');

    const amt = amtEl ? (parseFloat(amtEl.value.replace(/,/g, '')) || 0) : 0;
    const pureRate = rateEl ? (parseFloat(rateEl.value) / 100 || 0) : 0;
    const stRateValue = stRateEl ? (parseFloat(stRateEl.value) || 0) : 0;
    const combinedRate = (pureRate * 100 + stRateValue) / 100;
    const term = termEl ? (parseInt(termEl.value) || 0) : 0;
    const type = typeEl ? typeEl.value : "원리금";

    const { graceTerm, postTerm } = getGraceAdjustedTerm(row, term);

    let fixGrace = graceTerm >= 180 ? 179 : graceTerm;
    let fixPostTerm = 180 - fixGrace;
    if (fixPostTerm <= 0) fixPostTerm = 1;

    let monthlyRes;
    if (type === "만기") {
        const mInt = amt * pureRate / 12;
        monthlyRes = { 월상환금액: mInt, 첫달원금: 0, 첫달이자: mInt };
    } else if (type === "원리금") {
        if (graceTerm > 0) {
            const mInt = amt * pureRate / 12;
            monthlyRes = { 월상환금액: mInt, 첫달원금: 0, 첫달이자: mInt };
        } else {
            monthlyRes = 원리금균등_계산대출(amt, pureRate, term);
        }
    } else {
        if (graceTerm > 0) {
            const mInt = amt * pureRate / 12;
            monthlyRes = { 월상환금액: mInt, 첫달원금: 0, 첫달이자: mInt };
        } else {
            monthlyRes = 원금균등_월부담액(amt, pureRate, term);
        }
    }
    
    let annualTotal = 0, fixAnnualTotal = 0;
    let annualInterest = 0, fixAnnualInterest = 0;
    
    const years = postTerm / 12 || 1;
    const fixYears = fixPostTerm / 12 || 1;

    if (type === "만기") {
      annualInterest = amt * combinedRate;
      fixAnnualInterest = amt * combinedRate;
      // 본건 만기일시는 실제 이자 납입액만 반영한다. 추가행의 만기일시
      // 대출만 DSR에 기간환산 원금을 더하며, DTI/신DTI는 이자만 반영한다..
      annualTotal = annualInterest + (index > 0 ? (amt * 12 / postTerm) : 0);
      fixAnnualTotal = fixAnnualInterest;
    } else if (type === "원리금") {
      const calc = 원리금균등_계산대출(amt, combinedRate, postTerm);
      const fix = 원리금균등_계산대출(amt, combinedRate, fixPostTerm);
      annualTotal = calc.월상환금액 * 12;
      fixAnnualTotal = fix.월상환금액 * 12;
      
      const totalInterest = (calc.월상환금액 * postTerm) - amt;
      annualInterest = totalInterest > 0 ? (totalInterest / years) : 0;
      
      const fixTotalInterest = (fix.월상환금액 * fixPostTerm) - amt;
      fixAnnualInterest = fixTotalInterest > 0 ? (fixTotalInterest / fixYears) : 0;
    } else if (type === "원금") {
      const calcA = 원금균등_연간계산(amt, combinedRate, postTerm);
      const fixA = 원금균등_연간계산(amt, combinedRate, fixPostTerm);
      annualTotal = calcA.대출합계;
      fixAnnualTotal = fixA.대출합계;
      
      annualInterest = amt * combinedRate * (postTerm + 1) / (postTerm * 2);
      fixAnnualInterest = amt * combinedRate * (fixPostTerm + 1) / (fixPostTerm * 2);
    }

    if (index === 0) {
      totalDsrDebt += annualTotal;
      totalDtiDebt += annualTotal;
      totalNewDtiDebt += fixAnnualTotal;
      
      sumM += monthlyRes.월상환금액; 
      sumP += monthlyRes.첫달원금; 
      sumI += monthlyRes.첫달이자;
    } else {
      totalDsrDebt += annualTotal;
      totalDtiDebt += annualInterest; 
      totalNewDtiDebt += fixAnnualInterest;
      
      existingOtherDebtPayment += annualTotal; 
    }
  });

  const 월합계El = document.getElementById("월합계");
  const 월원금El = document.getElementById("월원금");
  const 월이자El = document.getElementById("월이자");
  if (월합계El) 월합계El.innerText = Math.round(sumM).toLocaleString() + " 원";
  if (월원금El) 월원금El.innerText = Math.round(sumP).toLocaleString() + " 원";
  if (월이자El) 월이자El.innerText = Math.round(sumI).toLocaleString() + " 원";

  const dsrCheckEl = document.getElementById("DSR확인");
  const dtiCheckEl = document.getElementById("DIT확인");
  const newDtiCheckEl = document.getElementById("신DTI확인");

  if (income > 0) {
    const finalDsr = (totalDsrDebt / income) * 100;
    const finalDti = (totalDtiDebt / income) * 100;
    const finalNewDti = (totalNewDtiDebt / income) * 100;

    applyRatioResultStyle(dsrCheckEl, finalDsr);
    applyRatioResultStyle(dtiCheckEl, finalDti);
    applyRatioResultStyle(newDtiCheckEl, finalNewDti);

    const firstRow = document.querySelector('#mortgage-inputs .mortgage-row');
    if (firstRow) {
      const pureRate1 = parseFloat(firstRow.querySelector('.mort-rate').value) / 100 || 0;
      const stRateValue1 = parseFloat(firstRow.querySelector('.mort-st-rate').value) || 0;
      const combinedRate1 = pureRate1 + (stRateValue1 / 100);
      const term1 = parseInt(firstRow.querySelector('.mort-term').value) || 0;

      const { postTerm: postTerm1 } = getGraceAdjustedTerm(firstRow, term1);

      let ltvCapAmount = Infinity;
      const ltvMax = calculateLtvMaxAmount();
      if (ltvMax !== null) ltvCapAmount = ltvMax;

      if (combinedRate1 > 0 && term1 > 0) {
        const mRate = combinedRate1 / 12;
        const annualPaymentPerUnit원리금 = (mRate / (1 - Math.pow(1 + mRate, -postTerm1))) * 12;
        const annualPaymentPerUnit원금 = (6 * mRate * (1 + 1 / postTerm1)) + (12 / postTerm1);

        const selectedLimitRadio = document.querySelector('input[name="dsr_limit_rate"]:checked');
        const selectedLimitRate = selectedLimitRadio ? (parseFloat(selectedLimitRadio.value) || 40) : 40;
        const maxTotalAnnualPayment = income * (selectedLimitRate / 100);
        const availableForMortgage = maxTotalAnnualPayment - existingOtherDebtPayment;

        const setDsrBlockValues = (elId, rawLoanVal) => {
          const containerEl = document.getElementById(elId);
          if (!containerEl) return;
          const mainEl = containerEl.querySelector('.dsr-main-val');
          const subEl = containerEl.querySelector('.dsr-sub-val');

          if (rawLoanVal <= 0 || !isFinite(rawLoanVal)) {
            if (mainEl) mainEl.innerText = "-";
            if (subEl) subEl.innerText = "(-)";
            return;
          }

          const formattedIncomeMax = formatKoreanAmount(Math.round(rawLoanVal));
          if (ltvCapAmount !== Infinity && ltvCapAmount <= 0) {
            if (mainEl) mainEl.innerText = "대출 불가";
            if (subEl) subEl.innerText = `(${formattedIncomeMax})`;
          } else if (ltvCapAmount !== Infinity && rawLoanVal > ltvCapAmount) {
            const formattedLtv = formatKoreanAmount(Math.round(ltvCapAmount));
            if (mainEl) mainEl.innerText = formattedLtv;
            if (subEl) subEl.innerText = `(${formattedIncomeMax})`;
          } else {
            if (mainEl) mainEl.innerText = formattedIncomeMax;
            if (subEl) subEl.innerText = `(${formattedIncomeMax})`;
          }
        };

        const rw = document.getElementById("DSR최대금액확인-원리금");
        const rg = document.getElementById("DSR최대금액확인-원금");
        if (availableForMortgage <= 0) {
          if (rw) { rw.querySelector('.dsr-main-val').innerText = "대출 불가"; rw.querySelector('.dsr-sub-val').innerText = "(-)"; }
          if (rg) { rg.querySelector('.dsr-main-val').innerText = "대출 불가"; rg.querySelector('.dsr-sub-val').innerText = "(-)"; }
        } else {
          const maxLoan원리금 = availableForMortgage / annualPaymentPerUnit원리금;
          const maxLoan원금 = availableForMortgage / annualPaymentPerUnit원금;
          setDsrBlockValues("DSR최대금액확인-원리금", maxLoan원리금);
          setDsrBlockValues("DSR최대금액확인-원금", maxLoan원금);
        }
      } else {
        resetDsrMaxBlocks();
      }
    }
  } else {
    resetRatioResultDisplay(dsrCheckEl);
    resetRatioResultDisplay(dtiCheckEl);
    resetRatioResultDisplay(newDtiCheckEl);
    resetDsrMaxBlocks();
  }

  updateLtvMaxAmount();
  
  setTimeout(() => {
    if (typeof adjustDsrMaxFontSize === 'function') adjustDsrMaxFontSize();
    if (typeof adjustTableFontSize === 'function') adjustTableFontSize();
    if (typeof adjustDsrToggleFontSize === 'function') adjustDsrToggleFontSize();
    if (typeof fitAllNumericInputFontSizes === 'function') fitAllNumericInputFontSizes();
  }, 0);
}