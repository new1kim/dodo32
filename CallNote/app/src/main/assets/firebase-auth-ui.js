/* =========================================================================
   firebase-auth-ui.js — Firebase 로그인 UI + 세션 관리 (dodo32)

   · 이메일/비밀번호 로그인 · 회원가입 · 로그아웃
   · 로그인 상태를 localStorage 와 Firebase Auth 양쪽에 반영
   · 로그인하면 기존 화면이 쓰는 calc_user_name(표시 이름)을 자동으로 채운다.
     → 상담저장소(syncConsultRecords)와 사용내역 기록이 그대로 동작한다.
   · Firebase 가 준비 안 된 환경(스크립트 로드 실패)에서는 조용히 비활성화되어
     기존 "이름 입력" 방식이 계속 동작한다.

   의존: firebase-init.js (window.DodoFirebase)
   ========================================================================= */
(function () {
  'use strict';

  function fb() { return window.DodoFirebase; }
  function ready() { return !!(fb() && fb().auth); }

  // 로그인한 사용자의 "표시 이름"을 정한다.
  //   1순위: displayName (나중에 카카오 닉네임도 여기로 들어옴)
  //   2순위: 이메일 @ 앞부분
  //   기존 화면(calc_user_name)을 이 값으로 채워, 이름 기반 로직과 호환시킨다.
  function displayNameOf(user) {
    if (!user) return '';
    var name = String(user.displayName || '').trim();
    if (name) return name;
    var email = String(user.email || '').trim();
    return email ? email.split('@')[0] : '';
  }

  // Firestore 에 사용자 프로필 문서를 만든다(있으면 유지).
  //   users/{uid} = { name, email, createdAt }
  function upsertUserProfile(user) {
    var f = fb();
    if (!f || !f.db || !user) return Promise.resolve();
    var docRef = f.db.collection('users').doc(user.uid);
    var data = {
      name: displayNameOf(user),
      email: String(user.email || ''),
      lastLoginAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    return docRef.get().then(function (snap) {
      if (!snap.exists) {
        data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        return docRef.set(data);
      }
      return docRef.set(data, { merge: true });
    }).catch(function (e) {
      // 규칙/네트워크 문제로 프로필 기록이 실패해도 로그인 자체는 유지한다.
      console.warn('[Firebase Auth] 프로필 저장 실패:', e);
    });
  }

  // 로그인 상태에 따라 화면을 바꾼다.
  //   - 로그인 안 됨: 로그인 카드를 화면 "중앙"에 띄워 바로 입력하게 한다.
  //   - 로그인 됨: 카드를 닫고, 우상단에 작은 "이름 + 로그아웃" 칩만 남긴다.
  function applyAuthState(user) {
    var box = document.getElementById('dodo-auth-box');
    if (box) {
      var label = box.querySelector('.dodo-auth-user');
      var logoutBtn = box.querySelector('.dodo-auth-logout');
      if (user) {
        if (label) label.textContent = displayNameOf(user) || user.email || user.uid;
        if (logoutBtn) logoutBtn.hidden = false;
        box.style.display = 'flex';
        hideLoginModal();
      } else {
        box.style.display = 'none';
        // 로그인 안 됐으면 중앙 로그인 카드를 자동으로 띄운다.
        showLoginModal();
      }
    }
  }

  // 로그인 폼(모달)을 만들어 body 에 붙인다.
  function buildLoginModal() {
    var modal = document.getElementById('dodo-auth-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'dodo-auth-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:5000;display:none;align-items:center;justify-content:center;'
      + 'background:rgba(15,23,42,.55);';
    modal.innerHTML = ''
      + '<div style="background:#fff;border-radius:16px;padding:24px;width:340px;max-width:92vw;box-shadow:0 20px 50px rgba(0,0,0,.3);">'
      + '  <div style="font-weight:800;font-size:19px;margin-bottom:4px;color:#1e293b;">🔐 로그인</div>'
      + '  <div style="color:#64748b;font-size:12px;margin-bottom:16px;">이메일로 로그인하거나 새로 가입하세요.</div>'
      + '  <input type="email" id="dodo-auth-email" placeholder="이메일" autocomplete="username"'
      + '    style="width:100%;box-sizing:border-box;padding:10px;border:1px solid #cbd5e1;border-radius:8px;margin-bottom:8px;font-size:14px;">'
      + '  <input type="password" id="dodo-auth-pass" placeholder="비밀번호 (6자 이상)" autocomplete="current-password"'
      + '    style="width:100%;box-sizing:border-box;padding:10px;border:1px solid #cbd5e1;border-radius:8px;margin-bottom:8px;font-size:14px;">'
      + '  <div id="dodo-auth-msg" style="min-height:16px;color:#dc2626;font-size:12px;margin-bottom:8px;"></div>'
      + '  <div style="display:flex;gap:8px;">'
      + '    <button type="button" id="dodo-auth-login-btn" style="flex:1;padding:10px;border:0;border-radius:8px;background:#2563eb;color:#fff;font-weight:700;cursor:pointer;">로그인</button>'
      + '    <button type="button" id="dodo-auth-signup-btn" style="flex:1;padding:10px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#334155;font-weight:700;cursor:pointer;">회원가입</button>'
      + '  </div>'
      + '  <button type="button" id="dodo-auth-cancel-btn" style="width:100%;margin-top:8px;padding:8px;border:0;background:transparent;color:#64748b;cursor:pointer;font-size:13px;">닫기</button>'
      + '</div>';
    document.body.appendChild(modal);

    modal.addEventListener('click', function (e) { if (e.target === modal) hideLoginModal(); });
    modal.querySelector('#dodo-auth-cancel-btn').addEventListener('click', hideLoginModal);

    function submit(signUp) {
      var email = modal.querySelector('#dodo-auth-email').value.trim();
      var pass = modal.querySelector('#dodo-auth-pass').value;
      var msg = modal.querySelector('#dodo-auth-msg');
      msg.textContent = '';
      if (!email || !pass) { msg.textContent = '이메일과 비밀번호를 입력하세요.'; return; }
      var btn = modal.querySelector('#' + (signUp ? 'dodo-auth-signup-btn' : 'dodo-auth-login-btn'));
      var prev = btn.textContent; btn.disabled = true; btn.textContent = '처리 중...';
      var action = signUp ? fb().auth.createUserWithEmailAndPassword(email, pass)
                          : fb().auth.signInWithEmailAndPassword(email, pass);
      action.then(function () { hideLoginModal(); })
        .catch(function (err) {
          msg.textContent = authErrorMessage(err);
        })
        .finally(function () { btn.disabled = false; btn.textContent = prev; });
    }
    modal.querySelector('#dodo-auth-login-btn').addEventListener('click', function () { submit(false); });
    modal.querySelector('#dodo-auth-signup-btn').addEventListener('click', function () { submit(true); });
    modal.querySelector('#dodo-auth-pass').addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(false); });
    return modal;
  }

  function authErrorMessage(err) {
    var code = String(err && err.code || '');
    if (code.indexOf('email-already-in-use') !== -1) return '이미 가입된 이메일입니다. 로그인하세요.';
    if (code.indexOf('invalid-email') !== -1) return '이메일 형식이 올바르지 않습니다.';
    if (code.indexOf('weak-password') !== -1) return '비밀번호는 6자 이상이어야 합니다.';
    if (code.indexOf('wrong-password') !== -1 || code.indexOf('invalid-credential') !== -1) return '이메일 또는 비밀번호가 틀렸습니다.';
    if (code.indexOf('user-not-found') !== -1) return '등록되지 않은 이메일입니다. 회원가입하세요.';
    if (code.indexOf('network') !== -1) return '네트워크 오류입니다. 잠시 후 다시 시도하세요.';
    return '로그인 실패: ' + (err && err.message ? err.message : code);
  }

  function showLoginModal() {
    if (!ready()) { alert('Firebase가 아직 준비되지 않았습니다.'); return; }
    buildLoginModal().style.display = 'flex';
    var emailInput = document.getElementById('dodo-auth-email');
    if (emailInput) setTimeout(function () { emailInput.focus(); }, 30);
  }
  function hideLoginModal() {
    var modal = document.getElementById('dodo-auth-modal');
    if (modal) modal.style.display = 'none';
  }

  // 로그인/로그아웃 버튼이 있는 상단 박스를 만든다.
  // 상담 화면 우상단에 작게 붙는다.
  function buildAuthBox() {
    if (document.getElementById('dodo-auth-box')) return;
    var box = document.createElement('div');
    box.id = 'dodo-auth-box';
    // 로그인 후 우상단에 남는 작은 칩(이름 + 로그아웃). 로그인 전에는 숨긴다.
    box.style.cssText = 'position:fixed;top:6px;right:8px;z-index:4500;display:none;align-items:center;gap:6px;'
      + 'background:rgba(255,255,255,.92);border:1px solid #e2e8f0;border-radius:999px;padding:4px 8px;'
      + 'box-shadow:0 2px 8px rgba(0,0,0,.08);font-size:12px;';
    box.innerHTML = ''
      + '<span class="dodo-auth-user" style="color:#475569;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>'
      + '<button type="button" class="dodo-auth-logout" style="border:0;background:#e2e8f0;color:#334155;border-radius:999px;padding:3px 10px;cursor:pointer;font-size:12px;">로그아웃</button>';
    document.body.appendChild(box);
    box.querySelector('.dodo-auth-logout').addEventListener('click', function () {
      if (!ready()) return;
      fb().auth.signOut().catch(function () {});
    });
  }

  function init() {
    if (!ready()) return;
    buildAuthBox();
    fb().auth.onAuthStateChanged(function (user) {
      applyAuthState(user);
      if (user) {
        // 기존 화면과 호환: 로그인한 사용자의 표시 이름을 calc_user_name 에 채운다.
        var name = displayNameOf(user);
        if (name) {
          try { localStorage.setItem('calc_user_name', name); } catch (e) {}
          var counterEl = document.getElementById('today-count');
          if (counterEl) counterEl.textContent = name + ' ✔';
        }
        upsertUserProfile(user);
        // 다른 모듈(상담저장소 등)이 로그인 이후 동작하도록 알린다.
        window.dispatchEvent(new CustomEvent('dodoAuthChanged', { detail: { user: user } }));
      } else {
        window.dispatchEvent(new CustomEvent('dodoAuthChanged', { detail: { user: null } }));
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  // 외부에서 쓰는 공개 API
  window.DodoAuth = {
    showLogin: showLoginModal,
    hideLogin: hideLoginModal,
    isReady: ready,
    currentUser: function () { return ready() ? fb().auth.currentUser : null; },
    uid: function () { return ready() && fb().auth.currentUser ? fb().auth.currentUser.uid : null; },
    displayName: function () { return ready() && fb().auth.currentUser ? displayNameOf(fb().auth.currentUser) : ''; }
  };
})();