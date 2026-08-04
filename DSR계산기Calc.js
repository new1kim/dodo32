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
      if (man > 0) result += man.toLocaleString() + "만원";
      else if (uk > 0) result += "원";
      
      return result.trim() || "0원";
    }

function parseKoreanAmountText(text) {
      if (!text) return 0;
      let totalAmount = 0;
      const ukMatch = text.match(/(\d+)억/);
      const manMatch = text.match(/([\d,]+)만원/);

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
        return 600000000; // 15억 이하 최대 6억
      } else if (marketPrice <= 2500000000) {
        return 400000000; // 15 ~ 25억 최대 4억
      } else {
        return 200000000; // 25억 초과 최대 2억
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

      ltvOutput.value = formatKoreanAmount(Math.round(maxLtvAmount));
    }

function generateSchedule() {
      const tbody = document.getElementById("schedule-tbody");
      tbody.innerHTML = "";

      const firstRow = document.querySelector('#mortgage-inputs .mortgage-row');
      if (!firstRow) return;

      const isExcluded = firstRow.querySelector('.mort-exclude').checked;
      if (isExcluded) {
        tbody.innerHTML = "<tr><td colspan='5' style='text-align:center; padding:20px;'>계산 제외된 대출입니다.</td></tr>";
        return;
      }

      const amt = parseFloat(firstRow.querySelector('.mort-amt').value.replace(/,/g, '')) || 0;
      const pureRate = parseFloat(firstRow.querySelector('.mort-rate').value) / 100 || 0;
      const term = parseInt(firstRow.querySelector('.mort-term').value) || 0;
      const type = firstRow.querySelector('.mort-type').value;
      const isInterestOnly = firstRow.querySelector('.mort-interest-only').checked;

      const graceCheck = firstRow.querySelector('.mort-grace-check') ? firstRow.querySelector('.mort-grace-check').checked : false;
      let graceTerm = parseInt(firstRow.querySelector('.mort-grace-term') ? firstRow.querySelector('.mort-grace-term').value : 0) || 0;
      if (!graceCheck) graceTerm = 0;
      if (graceTerm >= term) graceTerm = term > 0 ? term - 1 : 0;
      let postTerm = term - graceTerm;
      if (postTerm <= 0) postTerm = 1;

      if (amt <= 0 || term <= 0 || pureRate <= 0) {
        tbody.innerHTML = "<tr><td colspan='5' style='text-align:center; padding:20px;'>본건 대출 정보(금액, 금리, 기간)를 정확히 입력해주세요.</td></tr>";
        return;
      }

      let balance = amt;
      const mRate = pureRate / 12;
      let html = "";
      
      if (isInterestOnly || type === "만기") {
        const mPay = balance * mRate;
        for (let i = 1; i <= term; i++) {
          let principal = 0;
          let interest = mPay;
          if (i === term) principal = balance;
          balance -= principal;
          
          const dividerClass = (i % 12 === 0 && i !== term) ? "year-divider" : "";
          
          html += `<tr class="${dividerClass}">
            <td style="text-align:center;">${i}</td>
            <td style="text-align:right;">${Math.round(principal + interest).toLocaleString()}</td>
            <td style="text-align:right;">${Math.round(principal).toLocaleString()}</td>
            <td style="text-align:right;">${Math.round(interest).toLocaleString()}</td>
            <td style="text-align:right;">${Math.round(balance).toLocaleString()}</td>
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
            <td style="text-align:right;">${Math.round(mPay).toLocaleString()}</td>
            <td style="text-align:right;">${Math.round(principal).toLocaleString()}</td>
            <td style="text-align:right;">${Math.round(interest).toLocaleString()}</td>
            <td style="text-align:right;">${Math.round(balance).toLocaleString()}</td>
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
            <td style="text-align:right;">${Math.round(currentPay).toLocaleString()}</td>
            <td style="text-align:right;">${Math.round(principal).toLocaleString()}</td>
            <td style="text-align:right;">${Math.round(interest).toLocaleString()}</td>
            <td style="text-align:right;">${Math.round(balance).toLocaleString()}</td>
          </tr>`;
        }
      }

      tbody.innerHTML = html;
    }


function 자동계산() {
      const incomeInput = document.getElementById("computedIncomeHidden").value || document.getElementById("baseIncomeInput").value;
      const income = parseFloat(incomeInput.replace(/,/g, '')) || 0;
      
      let sumM = 0, sumP = 0, sumI = 0;
      
      // 분리된 누적 변수 선언 (DSR, DTI, 신DTI)
      let totalDsrDebt = 0;
      let totalDtiDebt = 0;
      let totalNewDtiDebt = 0;
      let existingOtherDebtPayment = 0; 

      const mortRows = document.querySelectorAll('#mortgage-inputs .mortgage-row');
      mortRows.forEach((row, index) => {
        const isExcluded = row.querySelector('.mort-exclude').checked;
        if (isExcluded) return; 

        const amt = parseFloat(row.querySelector('.mort-amt').value.replace(/,/g, '')) || 0;
        const pureRate = parseFloat(row.querySelector('.mort-rate').value) / 100 || 0;
        const stRateValue = parseFloat(row.querySelector('.mort-st-rate').value) || 0;
        const combinedRate = (pureRate * 100 + stRateValue) / 100;
        const term = parseInt(row.querySelector('.mort-term').value) || 0;
        const type = row.querySelector('.mort-type').value;
        const isInterestOnly = row.querySelector('.mort-interest-only').checked;

        const graceCheck = row.querySelector('.mort-grace-check') ? row.querySelector('.mort-grace-check').checked : false;
        let graceTerm = parseInt(row.querySelector('.mort-grace-term') ? row.querySelector('.mort-grace-term').value : 0) || 0;
        if (!graceCheck) graceTerm = 0;
        if (graceTerm >= term) graceTerm = term > 0 ? term - 1 : 0;
        
        let postTerm = term - graceTerm;
        if (postTerm <= 0) postTerm = 1;

        let fixGrace = graceTerm >= 180 ? 179 : graceTerm;
        let fixPostTerm = 180 - fixGrace;
        if (fixPostTerm <= 0) fixPostTerm = 1;

        // 월 상환액 계산
        let monthlyRes;
        if (isInterestOnly || type === "만기") {
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
        
        // 연간 상환액(DSR용) 및 연간 이자액(DTI용) 분리 계산 로직
        let annualTotal = 0, fixAnnualTotal = 0;
        let annualInterest = 0, fixAnnualInterest = 0;
        
        const years = postTerm / 12 || 1;
        const fixYears = fixPostTerm / 12 || 1;

        if (isInterestOnly || type === "만기") {
          // 만기일시: 납입액이 곧 이자
          annualInterest = amt * combinedRate;
          fixAnnualInterest = amt * combinedRate;
          annualTotal = annualInterest + (amt / years);
          fixAnnualTotal = fixAnnualInterest + (amt / fixYears);
        } else if (type === "원리금") {
          const calc = 원리금균등_계산대출(amt, combinedRate, postTerm);
          const fix = 원리금균등_계산대출(amt, combinedRate, fixPostTerm);
          annualTotal = calc.월상환금액 * 12;
          fixAnnualTotal = fix.월상환금액 * 12;
          
          // ★ 수정된 부분: 원리금균등 방식의 정확한 연평균 이자 산출
          // 총 부담한 이자(월납입액 * 개월수 - 원금)를 대출년수로 나눔
          const totalInterest = (calc.월상환금액 * postTerm) - amt;
          annualInterest = totalInterest > 0 ? (totalInterest / years) : 0;
          
          const fixTotalInterest = (fix.월상환금액 * fixPostTerm) - amt;
          fixAnnualInterest = fixTotalInterest > 0 ? (fixTotalInterest / fixYears) : 0;
        } else if (type === "원금") {
          const calcA = 원금균등_연간계산(amt, combinedRate, postTerm);
          const fixA = 원금균등_연간계산(amt, combinedRate, fixPostTerm);
          annualTotal = calcA.대출합계;
          fixAnnualTotal = fixA.대출합계;
          
          // 원금균등 방식의 연평균 이자 산출 (원금 * 이율 * (개월수+1) / (개월수*2))
          annualInterest = amt * combinedRate * (postTerm + 1) / (postTerm * 2);
          fixAnnualInterest = amt * combinedRate * (fixPostTerm + 1) / (fixPostTerm * 2);
        }

        // 값 누적 처리 로직
        if (index === 0) {
          // 1. 본건 대출(첫 행): DSR, DTI, 신DTI 모두 '연간 원리금 총액' 합산
          totalDsrDebt += annualTotal;
          totalDtiDebt += annualTotal;
          totalNewDtiDebt += fixAnnualTotal;
          
          sumM += monthlyRes.월상환금액; 
          sumP += monthlyRes.첫달원금; 
          sumI += monthlyRes.첫달이자;
        } else {
          // 2. 기타 대출(추가 행): DSR은 '원리금 총액', DTI/신DTI는 '연간 이자'만 합산
          totalDsrDebt += annualTotal;
          totalDtiDebt += annualInterest; 
          totalNewDtiDebt += fixAnnualInterest;
          
          existingOtherDebtPayment += annualTotal; 
        }
      });

      // 월별 금액 표기
      document.getElementById("월합계").innerText = Math.round(sumM).toLocaleString() + " 원";
      document.getElementById("월원금").innerText = Math.round(sumP).toLocaleString() + " 원";
      document.getElementById("월이자").innerText = Math.round(sumI).toLocaleString() + " 원";

      if (income > 0) {
        // 수정된 변수로 최종 퍼센트 계산
        const finalDsr = (totalDsrDebt / income) * 100;
        const finalDti = (totalDtiDebt / income) * 100;
        const finalNewDti = (totalNewDtiDebt / income) * 100;

        document.getElementById("DSR확인").innerText = finalDsr.toFixed(2) + "%";
        if (finalDsr >= 40) {
          document.getElementById("DSR확인").style.setProperty("background-color", "#fee2e2", "important");
          document.getElementById("DSR확인").style.color = "#ef4444";
        } else {
          document.getElementById("DSR확인").style.setProperty("background-color", "transparent", "important");
          document.getElementById("DSR확인").style.color = "#1e293b";
        }
        
        document.getElementById("DIT확인").innerText = finalDti.toFixed(2) + "%";
        if (finalDti >= 40) {
          document.getElementById("DIT확인").style.setProperty("background-color", "#fee2e2", "important");
          document.getElementById("DIT확인").style.color = "#ef4444";
        } else {
          document.getElementById("DIT확인").style.setProperty("background-color", "transparent", "important");
          document.getElementById("DIT확인").style.color = "#1e293b";
        }

        document.getElementById("신DTI확인").innerText = finalNewDti.toFixed(2) + "%";
        if (finalNewDti >= 40) {
          document.getElementById("신DTI확인").style.setProperty("background-color", "#fee2e2", "important");
          document.getElementById("신DTI확인").style.color = "#ef4444";
        } else {
          document.getElementById("신DTI확인").style.setProperty("background-color", "transparent", "important");
          document.getElementById("신DTI확인").style.color = "#1e293b";
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

          // LTV 기준 계산값 가져오기 (시세별 최대 한도 금액 제한 적용)
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
              ltvCapAmount = calcLtv;
            }
          }

          if (combinedRate1 > 0 && term1 > 0) {
            const mRate = combinedRate1 / 12;
            const annualPaymentPerUnit원리금 = (mRate / (1 - Math.pow(1 + mRate, -postTerm1))) * 12;
            const annualPaymentPerUnit원금 = (6 * mRate * (1 + 1 / postTerm1)) + (12 / postTerm1);

            const maxTotalAnnualPayment40 = income * 0.4;
            const availableForMortgage40 = maxTotalAnnualPayment40 - existingOtherDebtPayment;
            
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
              if (ltvCapAmount !== Infinity && rawLoanVal > ltvCapAmount) {
                const formattedLtv = formatKoreanAmount(Math.round(ltvCapAmount));
                if (mainEl) mainEl.innerText = formattedLtv;
                if (subEl) subEl.innerText = `(${formattedIncomeMax})`;
              } else {
                if (mainEl) mainEl.innerText = formattedIncomeMax;
                if (subEl) subEl.innerText = `(${formattedIncomeMax})`;
              }
            };

            if (availableForMortgage40 <= 0) {
              document.getElementById("DSR최대금액확인40-원리금").querySelector('.dsr-main-val').innerText = "기존대출 초과";
              document.getElementById("DSR최대금액확인40-원리금").querySelector('.dsr-sub-val').innerText = "(-)";
              document.getElementById("DSR최대금액확인40-원금").querySelector('.dsr-main-val').innerText = "기존대출 초과";
              document.getElementById("DSR최대금액확인40-원금").querySelector('.dsr-sub-val').innerText = "(-)";
            } else {
              const maxLoan40원리금 = availableForMortgage40 / annualPaymentPerUnit원리금;
              const maxLoan40원금 = availableForMortgage40 / annualPaymentPerUnit원금;
              setDsrBlockValues("DSR최대금액확인40-원리금", maxLoan40원리금);
              setDsrBlockValues("DSR최대금액확인40-원금", maxLoan40원금);
            }

            const maxTotalAnnualPayment50 = income * 0.5;
            const availableForMortgage50 = maxTotalAnnualPayment50 - existingOtherDebtPayment;
            if (availableForMortgage50 <= 0) {
              document.getElementById("DSR최대금액확인50-원리금").querySelector('.dsr-main-val').innerText = "기존대출 초과";
              document.getElementById("DSR최대금액확인50-원리금").querySelector('.dsr-sub-val').innerText = "(-)";
              document.getElementById("DSR최대금액확인50-원금").querySelector('.dsr-main-val').innerText = "기존대출 초과";
              document.getElementById("DSR최대금액확인50-원금").querySelector('.dsr-sub-val').innerText = "(-)";
            } else {
              const maxLoan50원리금 = availableForMortgage50 / annualPaymentPerUnit원리금;
              const maxLoan50원금 = availableForMortgage50 / annualPaymentPerUnit원금;
              setDsrBlockValues("DSR최대금액확인50-원리금", maxLoan50원리금);
              setDsrBlockValues("DSR최대금액확인50-원금", maxLoan50원금);
            }
          } else {
            document.getElementById("DSR최대금액확인40-원리금").querySelector('.dsr-main-val').innerText = "-";
            document.getElementById("DSR최대금액확인40-원리금").querySelector('.dsr-sub-val').innerText = "(-)";
            document.getElementById("DSR최대금액확인40-원금").querySelector('.dsr-main-val').innerText = "-";
            document.getElementById("DSR최대금액확인40-원금").querySelector('.dsr-sub-val').innerText = "(-)";
            document.getElementById("DSR최대금액확인50-원리금").querySelector('.dsr-main-val').innerText = "-";
            document.getElementById("DSR최대금액확인50-원리금").querySelector('.dsr-sub-val').innerText = "(-)";
            document.getElementById("DSR최대금액확인50-원금").querySelector('.dsr-main-val').innerText = "-";
            document.getElementById("DSR최대금액확인50-원금").querySelector('.dsr-sub-val').innerText = "(-)";
          }
        }
      } else {
        document.getElementById("DSR확인").innerText = "-";
        document.getElementById("DSR확인").style.setProperty("background-color", "transparent", "important");
        document.getElementById("DSR확인").style.color = "#1e293b";
        
        document.getElementById("DIT확인").innerText = "-";
        document.getElementById("DIT확인").style.setProperty("background-color", "transparent", "important");
        document.getElementById("DIT확인").style.color = "#1e293b";
        
        document.getElementById("신DTI확인").innerText = "-";
        document.getElementById("신DTI확인").style.setProperty("background-color", "transparent", "important");
        document.getElementById("신DTI확인").style.color = "#1e293b";
        
        document.getElementById("DSR최대금액확인40-원리금").querySelector('.dsr-main-val').innerText = "-";
        document.getElementById("DSR최대금액확인40-원리금").querySelector('.dsr-sub-val').innerText = "(-)";
        document.getElementById("DSR최대금액확인40-원금").querySelector('.dsr-main-val').innerText = "-";
        document.getElementById("DSR최대금액확인40-원금").querySelector('.dsr-sub-val').innerText = "(-)";
        document.getElementById("DSR최대금액확인50-원리금").querySelector('.dsr-main-val').innerText = "-";
        document.getElementById("DSR최대금액확인50-원리금").querySelector('.dsr-sub-val').innerText = "(-)";
        document.getElementById("DSR최대금액확인50-원금").querySelector('.dsr-main-val').innerText = "-";
        document.getElementById("DSR최대금액확인50-원금").querySelector('.dsr-sub-val').innerText = "(-)";
      }

      updateLtvMaxAmount();
      
      // 브라우저가 변경된 데이터로 레이아웃을 다시 그린 직후(Reflow 완료 후)에 실행되도록 딜레이 부여
      setTimeout(() => {
        adjustDsrMaxFontSize();
        adjustTableFontSize();
      }, 0);

      setTimeout(() => {
        adjustTableFontSize();
        adjustDsrMaxFontSize();
        }, 0);

    }