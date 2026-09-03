/* =========================================================================
   이용 제한(인증) 게이트 - API 통신 모듈
   ⚠️ 이 파일에는 API 엔드포인트(GAS URL)가 포함되어 있습니다.
   난수화/난독화 등 보안 처리는 이 파일을 대상으로 진행하세요.
   ========================================================================= */
const GATE_GAS_URL = "https://script.google.com/macros/s/AKfycbwW_7x4agccYUUn2BoLTpcln8auXCqYATYay3bGFy_gzT4yvuSy2Ae005hwcEBJjCaOpg/exec";
const GATE_SESSION_KEY = "dsr_gate_session";
const GATE_SESSION_TTL_MS =  1 //6 * 60 * 60 * 1000; // 6시간 (필요시 조정)
const GATE_ENABLED = false; // ← 인증 기능 잠시 끄고 싶을 때 false로 변경

function getGateSession() {
  try {
    const raw = localStorage.getItem(GATE_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function saveGateSession(uid, name) {
  const session = { uid, name, expiresAt: Date.now() + GATE_SESSION_TTL_MS };
  localStorage.setItem(GATE_SESSION_KEY, JSON.stringify(session));
  return session;
}

function clearGateSession() {
  localStorage.removeItem(GATE_SESSION_KEY);
}

async function callGateAPI(params) {
  const url = new URL(GATE_GAS_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("GAS 응답 오류: " + res.status);
  return res.json();
}

// 세션 유효기간 내: 화면은 그대로 두고 사용횟수만 백그라운드 기록
function logUsageBackground(session) {
  callGateAPI({ action: "logUsage", uid: session.uid, name: session.name }).catch((err) => {
    console.error("사용횟수 기록 실패:", err);
  });
}

// 세션 만료 시: 화면은 막지 않고 백그라운드로만 재검증
async function backgroundVerifyGate(uid, name) {
  try {
    const result = await callGateAPI({ action: "verify", uid, name });
    if (result.allowed) {
      saveGateSession(uid, name); // 세션 갱신
    } else {
      lockApp(result.reason);
    }
  } catch (err) {
    console.error("재검증 실패:", err);
    // 네트워크 오류는 사용자 귀책이 아니므로 세션 유지, 다음 로드 때 재시도
  }
}

const GATE_MESSAGES = {
  blocked: "이용이 제한된 계정입니다. 관리자에게 문의해주세요.",
  expired: "이용 기간이 만료되었습니다. 관리자에게 문의해주세요.",
  mismatch: "이미 다른 기기에 등록된 이름입니다. 관리자에게 문의해주세요.",
  unregistered: "등록되지 않은 사용자입니다. 관리자에게 문의해주세요.",
  network_error: "인증 서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.",
  invalid_request: "요청 정보가 올바르지 않습니다."
};

// 인증 실패 시: 세션/이름 초기화하고 다시 잠금
function lockApp(reason) {
  clearGateSession();
  localStorage.removeItem('calc_user_name');

  alert(GATE_MESSAGES[reason] || "이용이 제한되었습니다.");

  document.getElementById('auth-section').style.display = 'flex';
  document.querySelectorAll('.nav-btn, .main-wrapper').forEach(el => el.classList.add('locked-content'));

  const nameInput = document.getElementById('user-name-input');
  const counterEl = document.getElementById('today-count');
  if (nameInput) { nameInput.value = ''; nameInput.focus(); }
  if (counterEl) counterEl.textContent = "이름 입력 필요";
}

function getDeviceId() {
  let id = localStorage.getItem('calc_device_id');
  if (!id) {
    id = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
          const r = Math.random() * 16 | 0;
          const v = c === 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
        });
    localStorage.setItem('calc_device_id', id);
  }
  return id;
}

function getEnvSummary() {
  const ua = navigator.userAgent;

  let os = 'Unknown';
  if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Mac OS X/i.test(ua)) os = 'Mac';

  let browser = 'Unknown';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari';

  const deviceType = /Mobi|Android|iPhone|iPad/i.test(ua) ? 'Mobile' : 'PC';

  return `${os}·${browser}·${deviceType}`;
}

const ACCESS_LOG_CACHE_KEY = 'calc_last_access_log';
const ACCESS_LOG_CACHE_MS = 5 * 60 * 1000; // 5분 - 새로고침 등으로 인한 재접속을 서버에 중복 기록하지 않기 위한 캐시

function startWorkerRecordAccess(userName) {
  const lastLoggedAt = parseInt(localStorage.getItem(ACCESS_LOG_CACHE_KEY) || '0', 10);
  if (Date.now() - lastLoggedAt < ACCESS_LOG_CACHE_MS) {
    // 5분 이내 재접속(새로고침 포함) - 접속횟수가 중복 카운트되지 않도록 서버 기록을 건너뛴다.
    const counterEl = document.getElementById('today-count');
    if (counterEl) counterEl.textContent = `${userName} ✔`;
    return;
  }

  if (window.Worker) {
    document.getElementById('today-count').textContent = `${userName} 기록중...`;
    // 실제 요청 전에 미리 기록해 두어야, 워커 응답을 기다리는 짧은 시간 안에 페이지가
    // 다시 로드되어도(예: 빠른 새로고침) 같은 접속이 두 번 기록되는 것을 막을 수 있다.
    localStorage.setItem(ACCESS_LOG_CACHE_KEY, String(Date.now()));

    const deviceId = getDeviceId();
    const envSummary = getEnvSummary();
    const ua = navigator.userAgent;

    const workerCode = `
      self.addEventListener('message', (e) => {
        if (e.data && e.data.type === 'start') {
          const name = encodeURIComponent(e.data.name);
          const deviceId = encodeURIComponent(e.data.deviceId);
          const env = encodeURIComponent(e.data.env);
          const ua = encodeURIComponent(e.data.ua);
          const apiUrl = "${GATE_GAS_URL}?name=" + name + "&device_id=" + deviceId + "&env=" + env + "&ua=" + ua;

          fetch(apiUrl)
            .then(response => {
              if (!response.ok) throw new Error("HTTP 에러");
              return response.json();
            })
            .then(data => {
              self.postMessage({ success: true, name: e.data.name });
            })
            .catch((error) => {
              self.postMessage({ success: false, error: "통신 실패" });
            });
        }
      });
    `;
    const blob = new Blob([workerCode], { type: "application/javascript" });
    const worker = new Worker(URL.createObjectURL(blob));

    worker.addEventListener('message', (e) => {
      const counterEl = document.getElementById('today-count');
      if (counterEl) {
        if (e.data && e.data.success) {
          counterEl.textContent = `${e.data.name} ✔`;
        } else {
          counterEl.textContent = `연결실패`;
        }
      }
    });

    worker.postMessage({ type: "start", name: userName, deviceId: deviceId, env: envSummary, ua: ua });
  } else {
    console.warn("Web Worker를 지원하지 않는 브라우저입니다.");
  }
}
