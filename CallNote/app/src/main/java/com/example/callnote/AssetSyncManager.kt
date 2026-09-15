package com.example.callnote

import android.content.Context
import android.net.Uri
import android.util.Log
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.util.concurrent.TimeUnit

// DSR계산기/상담일지 화면 파일들을 GitHub 원본 저장소(new1kim/dodo32, main 브랜치, 공개)에서
// 받아와 로컬 캐시에 반영한다. 화면을 띄울 때는 2단계 우선순위를 따른다:
//   1) 지난 실행 때까지 받아둔 완전한 캐시  2) (캐시가 아예 없을 때만) APK에 번들된 원본
// 이번 실행 중에 받은 최신본은 대기실에 쌓아뒀다가 "다음 실행" 시작 때 반영된다(promotePendingCache).
// 캐시가 "완전한 세트"일 때만 신뢰한다 - 파일 하나가 최신이고 나머지가 예전 버전이면
// 화면이 깨질 수 있어서, 전체가 다 받아졌을 때만 캐시를 통째로 교체한다.
//
// 캐시/에셋 서빙 방식: WebView는 보안상 앱 내부 저장소(getFilesDir())를 file://로 직접 여는 걸
// 차단한다(net::ERR_ACCESS_DENIED) - android_asset만 예외적으로 허용된다. 그래서 실제 파일시스템
// 경로 대신, 구글이 이 용도로 제공하는 WebViewAssetLoader로 두 소스(에셋/캐시) 모두를 가상의
// https://appassets.androidx.startup/ 주소로 가로채서 서빙한다(실제 네트워크 요청은 발생하지 않음).
// 덤으로 에셋 모드/캐시 모드가 항상 같은 출처(origin)를 쓰게 되어, 동기화로 모드가 바뀌어도
// localStorage에 저장된 값(대출 프리셋 등)이 초기화되지 않는다.
object AssetSyncManager {
    private const val TAG = "CallNote"
    private const val RAW_BASE = "https://raw.githubusercontent.com/new1kim/dodo32/main/"

    /* ── 번들 우선 모드 (개발 중 토글) ────────────────────────────────
       true  : 캐시와 GitHub 동기화를 모두 무시하고 항상 APK에 번들된 assets을 쓴다.
               Android Studio에서 Run만 하면 수정한 파일이 즉시 반영되므로,
               "캐시가 옛 파일을 붙들고 있어 화면이 안 바뀌는" 문제가 생기지 않는다.
       false : 기존 동작 - 지난번에 받아둔 캐시를 쓰고 백그라운드로 GitHub 최신화.

       화면을 고치는 동안은 true로 두고, 사용자에게 배포할 때만 false로 바꾸면 된다. */
    const val BUNDLE_ONLY = true

    // 실제로 화면에 서빙되는 폴더. 앱이 도는 동안에는 절대 건드리지 않는다(아래 STAGING 주석 참고)
    private const val CACHE_DIR_NAME = "web_cache"
    // 다운로드가 끝난 최신본이 "다음 실행 때 쓰이려고" 대기하는 곳
    private const val STAGING_DIR_NAME = "web_cache.next"
    // 다운로드가 진행 중인 미완성 폴더
    private const val TEMP_DIR_NAME = "web_cache.tmp"

    const val APP_DOMAIN = "appassets.androidx.startup"
    const val ASSETS_PATH_PREFIX = "/assets/"
    const val CACHE_PATH_PREFIX = "/cache/"

    // 앱에서 쓰는 9개 화면(상담/DSR/상담일지/DTI/날짜계산/MCG/대출계산기/신분증변환/문서스캔)과 그 의존 파일 전체.
    // 날짜계산기.html은 폰트·flatpickr를 jsdelivr CDN에서 받으므로 오프라인이면 일부 기능이 저하될 수 있음(기존 웹의 동작과 동일).
    private val FILES = listOf(
        // ── 상담 화면 세트 (Consult_*) ─────────────────────────────
        // 상담일지.html안에 임베드된 상담용 화면. DSR 세트와 이름만 다르고 각자 독립해서 동작한다.
        "Consult_Main.html",
        "Consult_calculator_logic.js", // Consult_Main.html은 원본(.js)을 참조한다 - 난독화 버전이 아님
        "Consult_calculator_ui.js",
        "Consult_style.css",
        // ── DSR 화면 세트 (DSR_*) ──────────────────
        // Consult 세트와 완전히 분리된 별도 버전. 서로의 파일을 참조하지 않으므로 한쪽을 고쳐도
        // 다른 쪽 화면은 영향을 받지 않는다.
        "DSR_Main.html",
        "DSR_calculator_logic.js", // DSR_Main.html은 원본(.js)을 참조한다 - 난독화 버전이 아님
        "DSR_calculator_ui.js",
        "DSR_style.css",
        "시세조회.html",
        "소액임차보증금.png",
        "장래예상소득증가율.png",
        "상담일지.html",
        "DTI.html",
        "신용점수기준.png",
        "계산기.html",
        "날짜계산기.html",
        "MCG.html",
        "IDCard.html",
        "문서스캔.html"
    )

    private val client by lazy {
        OkHttpClient.Builder()
            .connectTimeout(4, TimeUnit.SECONDS)
            .readTimeout(4, TimeUnit.SECONDS)
            .build()
    }

    // MainActivity가 WebViewAssetLoader의 InternalStoragePathHandler를 이 폴더로 연결해야 해서 공개함.
    // 핸들러 생성 시점에 폴더가 아예 없으면 안 되므로 미리 만들어둔다(비어있어도 안전 - hasCompleteCache가 따로 확인함)
    fun cacheDir(context: Context): File = File(context.filesDir, CACHE_DIR_NAME).also { it.mkdirs() }

    // 앱이 도는 동안 캐시 폴더를 갈아끼우면 안 되는 이유:
    // WebView는 HTML을 먼저 받고 그 다음에 CSS/JS/이미지를 따로 요청한다. 그 사이에 폴더를
    // 통째로 지웠다 새로 만들면 뒤이은 요청들이 전부 실패해서 화면이 하얗게 남는다(실제로 겪은 버그).
    // 그래서 다운로드는 대기실(STAGING)까지만 하고, 교체는 "화면을 열기 직전, 아직 아무것도
    // 로딩 중이 아닌" 앱 시작 시점에 여기서 한 번만 한다. 파일 이동뿐이라 즉시 끝난다.
    // 대가는 최신본이 한 번 늦게(다음 실행부터) 반영된다는 것 - 화면이 깨지는 것보다 훨씬 낫다.
    @Volatile private var promoted = false

    fun promotePendingCache(context: Context) {
        // 번들 우선 모드에서는 대기본을 실제 캐시로 승격하지 않는다(항상 APK 번들 사용)
        if (BUNDLE_ONLY) return
        if (promoted) return // 화면 회전 등으로 Activity가 다시 만들어져도 로딩 중에 교체되는 일이 없도록
        promoted = true

        val staging = File(context.filesDir, STAGING_DIR_NAME)
        if (!staging.exists()) return
        if (!FILES.all { File(staging, it).exists() }) { // 미완성 대기본은 신뢰하지 않고 폐기
            staging.deleteRecursively()
            return
        }

        val live = File(context.filesDir, CACHE_DIR_NAME)
        live.deleteRecursively()
        if (staging.renameTo(live)) {
            Log.d(TAG, "asset cache promoted (${FILES.size} files)")
        } else {
            Log.e(TAG, "asset cache promote failed")
            staging.deleteRecursively()
        }
    }

    // 캐시가 완전한 세트로 존재하는지 확인 - 하나라도 빠져 있으면 아직 못 믿을 캐시로 취급하고
    // 번들 에셋으로 대체한다
    private fun hasCompleteCache(context: Context): Boolean {
        // 번들 우선 모드에서는 캐시가 있어도 절대 쓰지 않는다(항상 APK 안의 파일 사용)
        if (BUNDLE_ONLY) return false
        val dir = cacheDir(context)
        return dir.exists() && FILES.all { File(dir, it).exists() }
    }

    // 화면을 띄울 때 실제로 로드할 가상 URL - 캐시가 완전하면 캐시, 아니면 APK 번들 원본을 가리킨다.
    // MainActivity에 등록된 WebViewAssetLoader가 이 경로들을 가로채서 실제 파일을 서빙한다.
    fun resolveUrl(context: Context, fileName: String): String {
        val prefix = if (hasCompleteCache(context)) CACHE_PATH_PREFIX else ASSETS_PATH_PREFIX
        return "https://$APP_DOMAIN$prefix${Uri.encode(fileName)}"
    }

    // 앱 실행마다 한 번, 백그라운드 스레드에서 최신본을 받아 캐시를 갱신 시도한다.
    // 실패해도(오프라인 등) 조용히 무시 - 지금 화면에는 영향 없고, 다음 화면 전환/재실행부터
    // 갱신된 캐시가 쓰인다.
    fun syncInBackground(context: Context) {
        // 번들 우선 모드에서는 GitHub에서 받아오지 않는다(대기실에 옛 파일이 쌓이는 것 방지)
        if (BUNDLE_ONLY) return
        val appContext = context.applicationContext
        Thread {
            try {
                val updated = syncNow(appContext)
                Log.d(TAG, "asset sync finished: updated=$updated")
            } catch (e: Exception) {
                Log.w(TAG, "asset sync failed", e)
            }
        }.start()
    }

    private fun syncNow(context: Context): Boolean {
        val tempDir = File(context.filesDir, TEMP_DIR_NAME)
        tempDir.deleteRecursively()
        tempDir.mkdirs()

        for (fileName in FILES) {
            val request = Request.Builder().url(RAW_BASE + Uri.encode(fileName)).build()
            try {
                client.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) {
                        Log.w(TAG, "asset sync: $fileName -> HTTP ${response.code}")
                        tempDir.deleteRecursively()
                        return false
                    }
                    val bytes = response.body?.bytes()
                    if (bytes == null || bytes.isEmpty()) {
                        tempDir.deleteRecursively()
                        return false
                    }
                    File(tempDir, fileName).writeBytes(bytes)
                }
            } catch (e: Exception) {
                Log.w(TAG, "asset sync: $fileName failed", e)
                tempDir.deleteRecursively()
                return false
            }
        }

        // 전부 성공했을 때만 대기실에 올려둔다. 지금 화면이 쓰고 있는 캐시 폴더는 건드리지 않는다 -
        // 실제 교체는 다음 실행의 promotePendingCache()에서 안전한 시점에 일어난다
        val staging = File(context.filesDir, STAGING_DIR_NAME)
        staging.deleteRecursively()
        if (!tempDir.renameTo(staging)) {
            Log.e(TAG, "asset sync: staging swap failed")
            tempDir.deleteRecursively()
            return false
        }
        Log.d(TAG, "asset sync: staged ${FILES.size} files (다음 실행부터 적용)")
        return true
    }
}
