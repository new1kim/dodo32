    document.getElementById('customerInfoTabBtn').addEventListener('click', function () {
      var body = document.getElementById('customerInfoTabBody');
      var isOpen = body.classList.toggle('open');
      this.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      // 접혀있던 동안(scrollHeight=0)에는 메모칸 높이를 제대로 잴 수 없으므로, 펼쳐질 때 다시 계산한다.
      if (isOpen && typeof autoResizeMemoTextarea === 'function') {
        autoResizeMemoTextarea(document.getElementById('customerInfoMemo'));
      }
    });
    document.querySelectorAll('.info-tab-field .field-clear-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var field = btn.closest('.info-tab-field');
        var input = field ? field.querySelector('input') : null;
        if (input) {
          input.value = '';
          // 실제 input 이벤트를 발생시켜, 그 입력칸에 붙어있는 포맷팅/요약 갱신 리스너가 각자 알아서 반응하게 한다.
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
    });

    // 연락처 입력 중 자동으로 하이픈(-) 삽입 (Consult.html 전화번호 입력칸과 동일한 포맷 규칙)
    var customerPhoneInput = document.getElementById('customerPhoneInput');
    customerPhoneInput.addEventListener('input', function (e) {
      var v = e.target.value.replace(/\D/g, '').slice(0, 11);
      if (v.length > 7) v = v.replace(/(\d{3})(\d{4})(\d{0,4})/, '$1-$2-$3');
      else if (v.length > 3) v = v.replace(/(\d{3})(\d{0,4})/, '$1-$2');
      e.target.value = v.replace(/-+$/, '');
      updateCustomerInfoSummary();
    });

    // 이름/연락처가 채워지면 탭 제목줄에 "이름 (연락처)" 형태로 같이 보여준다
    var customerNameInput = document.getElementById('customerNameInput');
    var customerInfoSummary = document.getElementById('customerInfoSummary');
    function updateCustomerInfoSummary() {
      var name = customerNameInput.value.trim();
      var phone = customerPhoneInput.value.trim();
      var text = '';
      if (name && phone) text = ' - ' + name + ' (' + phone + ')';
      else if (name) text = ' - ' + name;
      else if (phone) text = ' - (' + phone + ')';
      customerInfoSummary.textContent = text;
    }
    customerNameInput.addEventListener('input', updateCustomerInfoSummary);

    /* ── 통화목록 불러오기 (Call Note 앱 전용) ──────────────────────
       연락처·고객명 입력칸을 탭하면 최근 통화기록을 드롭다운으로 보여주고,
       항목을 고르면 연락처와 이름이 함께 채워진다.
       AndroidBridge 는 앱의 WebView에서만 주입되므로, 웹 브라우저에서 열면
       함수가 조용히 빠져나가 아무 동작도 하지 않는다(오류 없음).
       상담일지.html 의 같은 기능을 이 화면의 두 입력칸에 이식한 것. */
    // 어느 칸에서 열렸는지(연락처/고객명)를 기억해 그 칸 아래에 붙인다
    var activeCallLogInput = customerPhoneInput;

    function showCallLogDropdown(anchorInput) {
      // AndroidBridge 존재 여부는 반드시 '클릭한 순간'에 검사한다.
      // 스크립트 로드 시점에 한 번만 검사하면, 그때 브릿지가 아직 준비되지 않은 경우
      // 리스너를 등록하기 전에 빠져나가 영영 동작하지 않는다(상담일지가 매번 검사하는 이유).
      if (!(window.AndroidBridge && window.AndroidBridge.getRecentCallLog)) {
        // 앱에서 이 로그가 찍히면 브릿지 주입이 안 된 것이므로 원인 파악이 바로 된다
        if (window.AndroidBridge) console.warn('[통화목록] AndroidBridge는 있으나 getRecentCallLog가 없음');
        else console.log('[통화목록] AndroidBridge 없음 - 웹 브라우저이거나 주입 실패');
        return;
      }

      activeCallLogInput = anchorInput || customerPhoneInput;

      var dropdown = document.getElementById('callLogDropdown');
      if (!dropdown) {
        dropdown = document.createElement('div');
        dropdown.id = 'callLogDropdown';
        dropdown.style.cssText = 'position:absolute; z-index:2000; background:#fff; border:1px solid #cbd5e1;'
          + ' border-radius:10px; box-shadow:0 12px 30px rgba(0,0,0,0.15); max-height:280px; overflow-y:auto; display:none;';
        document.body.appendChild(dropdown);
      }

      var records = [];
      try { records = JSON.parse(window.AndroidBridge.getRecentCallLog()) || []; } catch (e) { records = []; }
      if (!Array.isArray(records)) records = [];

      if (records.length === 0) {
        dropdown.innerHTML = '<div style="padding:12px 14px; color:#94a3b8; font-size:13px;">최근 통화기록이 없습니다.</div>';
      } else {
        dropdown.innerHTML = records.map(function (r) {
          var dir = String(r.direction || '').toUpperCase();
          var icon = (dir === 'OUT' || dir === 'OUTGOING') ? '📤'
                   : (dir === 'IN' || dir === 'INCOMING' || dir === 'MISSED') ? '📥' : '📞';
          var rPhone = r.phone || r.number || '';
          var rName = r.name || r.contactName || '';
          var label = rName
            ? '<b>' + rName + '</b> <span style="color:#64748b;">(' + rPhone + ')</span>'
            : rPhone;
          return '<div class="call-log-item" data-phone="' + rPhone + '" data-name="' + rName + '"'
            + ' style="padding:10px 14px; cursor:pointer; border-bottom:1px solid #f1f5f9; font-size:14px;">'
            + icon + ' + label + '</div>';
        }).join('');
      }

      var rect = activeCallLogInput.getBoundingClientRect();
      dropdown.style.left = (rect.left + window.scrollX) + 'px';
      dropdown.style.top = (rect.bottom + window.scrollY + 4) + 'px';
      dropdown.style.width = Math.max(rect.width, 220) + 'px';
      dropdown.style.display = 'block';

      dropdown.querySelectorAll('.call-log-item').forEach(function (item) {
        item.addEventListener('click', function () {
          // 연락처는 하이픈 자동 포맷 리스너가 붙어 있어, .value 직접 대입 대신 input 이벤트를 발생시킨다
          customerPhoneInput.value = this.getAttribute('data-phone') || '';
          customerPhoneInput.dispatchEvent(new Event('input', { bubbles: true }));
          var nm = this.getAttribute('data-name');
          if (nm) {
            customerNameInput.value = nm;
            customerNameInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
          dropdown.style.display = 'none';
          if (typeof updateCustomerInfoSummary === 'function') updateCustomerInfoSummary();
          if (typeof saveDSRInputs === 'function') saveDSRInputs();
        });
      });
    }

    // 연락처·고객명 두 칸 모두 클릭/포커스 시 통화목록을 띄운다
    customerPhoneInput.addEventListener('click', function () { showCallLogDropdown(customerPhoneInput); });
    customerPhoneInput.addEventListener('focus', function () { showCallLogDropdown(customerPhoneInput); });
    customerNameInput.addEventListener('click', function () { showCallLogDropdown(customerNameInput); });
    customerNameInput.addEventListener('focus', function () { showCallLogDropdown(customerNameInput); });

    // 입력칸 바깥을 누르면 닫기
    document.addEventListener('click', function (e) {
      var dropdown = document.getElementById('callLogDropdown');
      if (!dropdown || dropdown.style.display !== 'block') return;
      if (e.target === customerPhoneInput || e.target === customerNameInput) return;
      if (dropdown.contains(e.target)) return;
      dropdown.style.display = 'none';
    });

    // localStorage에서 복원된 값은 change/input 이벤트 없이 .value로 바로 채워지므로,
    // 복원이 끝난 뒤(Consult_calculator_ui.js의 init() 이후) 제목줄을 한 번 맞춰준다.
    // Consult_calculator_ui.js의 init()도 window.addEventListener('DOMContentLoaded', ...)로 등록되어
    // 있어서, 여기서도 반드시 window에 등록해야 init()(loadDSRInputs 포함)이 끝난 뒤에 실행된다
    // - document에 등록하면 window보다 먼저(캡처/타겟 단계) 실행돼 복원 전 값을 읽게 된다.
    // (메모칸 높이는 탭이 접혀있으면 scrollHeight를 잴 수 없어 여기서는 재지 않고, 펼쳐질 때 잰다.)
    window.addEventListener('DOMContentLoaded', updateCustomerInfoSummary);
