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
  return { 월상환금액: 0, firstMonthlyPrincipal: 0, 첫달이자: 0 };
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

function getLtvMaxLimitByMarketPrice(marketPrice) {
  if (marketPrice <= 1500000000) {
    return 600000000; 
  } else if (marketPrice <= 2500000000) {
    return 400000000; 
  } else {
    return 200000000; 
  }
}

function updateLtvMaxAmount() {
  const marketPriceInput = document.getElementById("ltvMarketPriceInput");
  const ltvOutput = document.getElementById("ltvMaxAmountOutput");
  if (!marketPriceInput || !ltvOutput) return;

  const priceVal = parseFloat(marketPriceInput.value.replace(/,/g, '')) || 0;
  
  const selectedRadio = document.querySelector('input[name="ltv_rate"]:checked');
  const ltvRate = selectedRadio ? parseFloat(selectedRadio.value) || 0 : 70;

  if (priceVal <= 0) {
    ltvOutput.value = "-";
    return;
  }

  const minorLeaseInput = document.getElementById("ltvMinorLeaseInput");
  const minorLeaseVal = minorLeaseInput ? (parseFloat(minorLeaseInput.value.replace(/,/g, '')) || 0) : 0;

  let maxLtvAmount = priceVal * (ltvRate / 100) - minorLeaseVal;
  const limitAmount = getLtvMaxLimitByMarketPrice(priceVal);
  if (maxLtvAmount > limitAmount) {
    maxLtvAmount = limitAmount;
  }
  maxLtvAmount = Math.max(0, maxLtvAmount);

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

  const graceCheck = firstRow.querySelector('.mort-grace-check') ? firstRow.querySelector('.mort-grace-check').checked : false;
  let graceTerm = parseInt(firstRow.querySelector('.mort-grace-term') ? firstRow.querySelector('.mort-grace-term').value : 0) || 0;
  if (!graceCheck) graceTerm = 0;
  if (graceTerm >= term) graceTerm = term > 0 ? term - 1 : 0;
  let postTerm = term - graceTerm;
  if (postTerm <= 0) postTerm = 1;

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
      let interest = mPay;
      if (i === term) principal = balance;
      balance -= principal;
      
      const dividerClass = (i % 12 === 0 && i !== term) ? "year-divider" : "";
      
      html += `<tr class="${dividerClass}">
        <td style="text-align:center;">${i}</td>
        <td style="text-align:center;">${Math.round(principal + interest).toLocaleString()}</td>
        <td style="text-align:center;">${Math.round(principal).toLocaleString()}</td>
        <td style="text-align:center;">${Math.round(interest).toLocaleString()}</td>
        <td style="text-align:center;">${Math.round(balance).toLocaleString()}</td>
      </tr>`;
    }
  } else if (type === "원리금") {
    let mPayPost = amt * mRate / (1 - Math.pow(1 + mRate, -postTerm));
    for (let i = 1; i <= term; i++) {
      let interest = balance * mRate;
      let principal = 0;
      let mPay = interest;

      if (i > graceTerm) {
        principal = mPayPost - interest;
        if (i === term) {
          principal = balance;
        }
        mPay = principal + interest;
      }

      balance -= principal;
      if (balance < 0) balance = 0;
      
      const dividerClass = (i % 12 === 0 && i !== term) ? "year-divider" : "";

      html += `<tr class="${dividerClass}">
        <td style="text-align:center;">${i}</td>
        <td style="text-align:center;">${Math.round(mPay).toLocaleString()}</td>
        <td style="text-align:center;">${Math.round(principal).toLocaleString()}</td>
        <td style="text-align:center;">${Math.round(interest).toLocaleString()}</td>
        <td style="text-align:center;">${Math.round(balance).toLocaleString()}</td>
      </tr>`;
    }
  } else if (type === "원금") {
    const fixedPrincipal = amt / postTerm;
    for (let i = 1; i <= term; i++) {
      let interest = balance * mRate;
      let principal = 0;

      if (i > graceTerm) {
        principal = fixedPrincipal;
        if (i === term) principal = balance;
      }
      let currentPay = principal + interest;

      balance -= principal;
      if (balance < 0) balance = 0;

      const dividerClass = (i % 12 === 0 && i !== term) ? "year-divider" : "";

      html += `<tr class="${dividerClass}">
        <td style="text-align:center;">${i}</td>
        <td style="text-align:center;">${Math.round(currentPay).toLocaleString()}</td>
        <td style="text-align:center;">${Math.round(principal).toLocaleString()}</td>
        <td style="text-align:center;">${Math.round(interest).toLocaleString()}</td>
        <td style="text-align:center;">${Math.round(balance).toLocaleString()}</td>
      </tr>`;
    }
  }

  tbody.innerHTML = html;
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

    const graceCheck = row.querySelector('.mort-grace-check') ? row.querySelector('.mort-grace-check').checked : false;
    let graceTerm = parseInt(row.querySelector('.mort-grace-term') ? row.querySelector('.mort-grace-term').value : 0) || 0;
    if (!graceCheck) graceTerm = 0;
    if (graceTerm >= term) graceTerm = term > 0 ? term - 1 : 0;
    
    let postTerm = term - graceTerm;
    if (postTerm <= 0) postTerm = 1;

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

    if (dsrCheckEl) {
      dsrCheckEl.innerText = finalDsr.toFixed(2) + "%";
      if (finalDsr >= 40) {
        dsrCheckEl.style.setProperty("background-color", "#fee2e2", "important");
        dsrCheckEl.style.color = "#ef4444";
      } else {
        dsrCheckEl.style.setProperty("background-color", "transparent", "important");
        dsrCheckEl.style.color = "#1e293b";
      }
    }
    
    if (dtiCheckEl) {
      dtiCheckEl.innerText = finalDti.toFixed(2) + "%";
      if (finalDti >= 40) {
        dtiCheckEl.style.setProperty("background-color", "#fee2e2", "important");
        dtiCheckEl.style.color = "#ef4444";
      } else {
        dtiCheckEl.style.setProperty("background-color", "transparent", "important");
        dtiCheckEl.style.color = "#1e293b";
      }
    }

    if (newDtiCheckEl) {
      newDtiCheckEl.innerText = finalNewDti.toFixed(2) + "%";
      if (finalNewDti >= 40) {
        newDtiCheckEl.style.setProperty("background-color", "#fee2e2", "important");
        newDtiCheckEl.style.color = "#ef4444";
      } else {
        newDtiCheckEl.style.setProperty("background-color", "transparent", "important");
        newDtiCheckEl.style.color = "#1e293b";
      }
    }

    const firstRow = document.querySelector('#mortgage-inputs .mortgage-row');
    if (firstRow) {
      const pureRate1 = parseFloat(firstRow.querySelector('.mort-rate').value) / 100 || 0;
      const stRateValue1 = parseFloat(firstRow.querySelector('.mort-st-rate').value) || 0;
      const combinedRate1 = pureRate1 + (stRateValue1 / 100);
      const term1 = parseInt(firstRow.querySelector('.mort-term').value) || 0;
      
      const graceCheck1 = firstRow.querySelector('.mort-grace-check') ? firstRow.querySelector('.mort-grace-check').checked : false;
      let graceTerm1 = parseInt(firstRow.querySelector('.mort-grace-term') ? firstRow.querySelector('.mort-grace-term').value : 0) || 0;
      if (!graceCheck1) graceTerm1 = 0;
      if (graceTerm1 >= term1) graceTerm1 = term1 > 0 ? term1 - 1 : 0;
      let postTerm1 = term1 - graceTerm1;
      if (postTerm1 <= 0) postTerm1 = 1;

      let ltvCapAmount = Infinity;
      const marketPriceInput = document.getElementById("ltvMarketPriceInput");
      if (marketPriceInput) {
        const priceVal = parseFloat(marketPriceInput.value.replace(/,/g, '')) || 0;
        if (priceVal > 0) {
          const selectedRadio = document.querySelector('input[name="ltv_rate"]:checked');
          const ltvRate = selectedRadio ? parseFloat(selectedRadio.value) || 0 : 70;
          const minorLeaseInput = document.getElementById("ltvMinorLeaseInput");
          const minorLeaseVal = minorLeaseInput ? (parseFloat(minorLeaseInput.value.replace(/,/g, '')) || 0) : 0;
          let calcLtv = priceVal * (ltvRate / 100) - minorLeaseVal;
          const limitAmt = getLtvMaxLimitByMarketPrice(priceVal);
          if (calcLtv > limitAmt) calcLtv = limitAmt;
          calcLtv = Math.max(0, calcLtv);
          ltvCapAmount = calcLtv;
        }
      }

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
        ['DSR최대금액확인-원리금', 'DSR최대금액확인-원금'].forEach(id => {
          const el = document.getElementById(id);
          if (el) {
            el.querySelector('.dsr-main-val').innerText = "-";
            el.querySelector('.dsr-sub-val').innerText = "(-)";
          }
        });
      }
    }
  } else {
    if (dsrCheckEl) { dsrCheckEl.innerText = "-"; dsrCheckEl.style.setProperty("background-color", "transparent", "important"); dsrCheckEl.style.color = "#1e293b"; }
    if (dtiCheckEl) { dtiCheckEl.innerText = "-"; dtiCheckEl.style.setProperty("background-color", "transparent", "important"); dtiCheckEl.style.color = "#1e293b"; }
    if (newDtiCheckEl) { newDtiCheckEl.innerText = "-"; newDtiCheckEl.style.setProperty("background-color", "transparent", "important"); newDtiCheckEl.style.color = "#1e293b"; }
    
    ['DSR최대금액확인-원리금', 'DSR최대금액확인-원금'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.querySelector('.dsr-main-val').innerText = "-";
        el.querySelector('.dsr-sub-val').innerText = "(-)";
      }
    });
  }

  updateLtvMaxAmount();
  
  setTimeout(() => {
    if (typeof adjustDsrMaxFontSize === 'function') adjustDsrMaxFontSize();
    if (typeof adjustTableFontSize === 'function') adjustTableFontSize();
    if (typeof adjustDsrToggleFontSize === 'function') adjustDsrToggleFontSize();
  }, 0);
}
