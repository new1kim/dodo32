/* =========================================================================
   firebase-init.js — Firebase 초기화 모듈 (dodo32 상담저장소)

   ※ 이 프로젝트는 번들러(webpack/vite)가 없다.
     파일을 GitHub raw 에서 그대로 내려받아 <script> 로 로드하므로,
     `import { ... } from "firebase/app"` 같은 모듈 구문을 쓸 수 없다.
     따라서 gstatic CDN 의 **compat** 빌드를 <script> 태그로 로드하고,
     여기서 전역 `firebase.*` 네임스페이스를 사용한다.

   로드 순서(HTML에서):
     1. firebase-app-compat.js
     2. firebase-auth-compat.js
     3. firebase-firestore-compat.js
     4. firebase-init.js  ← 이 파일 (위 전역이 준비된 뒤 실행)

   firebaseConfig 의 apiKey 는 웹에 공개되는 값이다(비밀이 아님).
   보안은 firestore.rules 로 강제한다.
   ========================================================================= */
(function () {
  'use strict';

  var firebaseConfig = {
    apiKey: "AIzaSyCGT7kjtwtyif4NyUUQlawW1ZTFNHH6dLU",
    authDomain: "dodo32-8fee5.firebaseapp.com",
    projectId: "dodo32-8fee5",
    storageBucket: "dodo32-8fee5.firebasestorage.app",
    messagingSenderId: "586774572409",
    appId: "1:586774572409:web:0f3565db3e689adec3d3a8",
    measurementId: "G-YXVZ12V77S"
  };

  // compat 전역이 없으면(스크립트 로드 실패) 앱을 죽이지 않고 조용히 비활성화한다.
  // 기존 GAS 기반 기능은 그대로 동작해야 하기 때문이다.
  if (typeof firebase === 'undefined' || !firebase.initializeApp) {
    console.error('[Firebase] SDK가 로드되지 않았습니다. compat 스크립트 순서를 확인하세요.');
    window.DODO_FIREBASE_READY = false;
    return;
  }

  // 중복 초기화 방지(여러 화면에서 이 파일을 로드해도 안전)
  var app;
  try {
    app = firebase.app();
  } catch (e) {
    app = firebase.initializeApp(firebaseConfig);
  }

  var auth = (typeof firebase.auth === 'function') ? firebase.auth() : null;
  var db = (typeof firebase.firestore === 'function') ? firebase.firestore() : null;

  // 여러 브라우저 탭/WebView 간 로그인 유지(기본값과 동일하지만 명시)
  if (auth) {
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(function () { /* WebView에서 실패해도 무시 */ });
  }

  // 다른 모듈이 쓰는 공개 API
  window.DodoFirebase = {
    app: app,
    auth: auth,
    db: db,
    config: firebaseConfig,
    // 로그인한 사용자 uid(없으면 null)
    uid: function () { return auth && auth.currentUser ? auth.currentUser.uid : null; },
    // 로그인 완료를 기다리는 헬퍼 (초기 로딩 시 1회)
    ready: function () {
      return new Promise(function (resolve) {
        if (!auth) { resolve(null); return; }
        var unsub = auth.onAuthStateChanged(function (user) {
          unsub();
          resolve(user);
        });
      });
    }
  };
  window.DODO_FIREBASE_READY = true;
  console.log('[Firebase] 초기화 완료 (project: ' + firebaseConfig.projectId + ')');
})();