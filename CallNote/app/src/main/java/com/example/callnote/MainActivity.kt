package com.example.callnote

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.CallLog
import android.provider.ContactsContract
import android.provider.MediaStore
import android.provider.Settings
import android.util.Base64
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

class MainActivity : AppCompatActivity() {

    // 앱에서 오갈 수 있는 화면들. 평소 실행은 상담(Consult_Main.html)이고,
    // 전화 수신 팝업의 "상담하기"를 거치면 같은 상담 화면에 통화 정보가 자동 주입된다.
    // 나머지는 우측 상단 메뉴 버튼으로 수동 이동.
    private enum class Page(val fileName: String, val menuLabel: String) {
        // 상담(Consult_Main.html)은 웹 index.html의 "상담" 버튼과 같은 화면 - 탭 맨 왼쪽에 온다.
        // DSR 탭(DSR_Main.html)과는 완전히 독립된 별도 세트(Consult_*)를 참조한다.
        // 전화 수신 팝업의 "상담하기"도 이 화면으로 온다(예전의 상담일지.html 경로는 제거됨).
        CONSULT("Consult_Main.html", "상담"),
        DSR("DSR_Main.html", "DSR 계산"),
        DTI("DTI.html", "DTI 계산"),
        DATE_CALC("날짜계산기.html", "날짜계산"),
        // 공시가조회(gonsi.html)는 법정동코드별 시세 JSON(op_gongsi_data/, 약 1900개 파일)을
        // 같이 데리고 다녀야 해서 다른 화면들과 달리 GitHub 동기화 대상이 아니다 - 항상 APK
        // 번들 원본만 쓴다(아래 openPage()의 특별 처리 참고). 새 연도 자료로 갱신하려면
        // 앱 자체를 다시 빌드해서 올려야 한다.
        PROPERTY_PRICE("gonsi.html", "공시가조회"),
        // 신분증변환(IDCard.html)은 AssetSyncManager.FILES에 포함돼 있어 다른 화면들과 똑같이
        // GitHub 동기화 대상이다 - 웹(dodo32)에 푸시만 하면 앱 다음 실행부터 자동 반영된다.
        ID_CARD_CONVERT("IDCard.html", "신분증변환"),
        // 문서스캔(문서스캔.html)도 마찬가지로 GitHub 동기화 대상.
        DOCUMENT_SCAN("문서스캔.html", "문서스캔"),
        MCG("MCG.html", "MCG 계산"),
        LOAN_CALC("계산기.html", "계산기")
    }

    private lateinit var webView: WebView
    private val tabViews = mutableMapOf<Page, TextView>()
    private val prefs by lazy { getSharedPreferences("call_note_prefs", Context.MODE_PRIVATE) }
    private var webViewLoaded = false
    private var currentPage = Page.CONSULT

    // WebView에 URL을 한 번이라도 넘겼는지. currentPage의 초기값이 DSR이라, 이게 없으면
    // 첫 openPage(DSR)이 "이미 그 화면에 있다"고 판단해 loadUrl을 건너뛰고 빈 화면이 남는다.
    private var hasNavigated = false

    // 에셋(/assets/)과 캐시(/cache/)를 같은 가상 도메인 밑 서로 다른 경로로 서빙 - AssetSyncManager.resolveUrl()이
    // 만든 URL과 경로 접두사가 반드시 일치해야 한다
    private val assetLoader: WebViewAssetLoader by lazy {
        WebViewAssetLoader.Builder()
            .setDomain(AssetSyncManager.APP_DOMAIN)
            .addPathHandler(AssetSyncManager.ASSETS_PATH_PREFIX, WebViewAssetLoader.AssetsPathHandler(this))
            .addPathHandler(AssetSyncManager.CACHE_PATH_PREFIX, WebViewAssetLoader.InternalStoragePathHandler(this, AssetSyncManager.cacheDir(this)))
            .build()
    }

    // 상담(Consult_Main.html) 화면으로 전화 데이터를 넘겨야 하는데 아직 로딩 중일 때 잠깐 들고 있는 자리.
    // onPageFinished에서 로딩이 끝나는 걸 확인한 뒤 실제로 주입한다.
    private var pendingConsultCallData: Triple<String, String, String>? = null
    private var pendingConsultLoadExisting = false
    // DSR 계산기의 "상담 전달"이 넘긴 값(JSON 문자열). 위 pendingConsultCallData와 같은 이유로
    // 상담 화면 로딩이 끝날 때까지 들고 있다가 onPageFinished에서 주입한다.
    private var pendingConsultingPayload: String? = null

    // checkPermissions()가 띄운 설정 화면 때문에 Activity가 백그라운드로 밀려났다 돌아온 경우 표시.
    // 첫 로딩이 설정 화면에 가려진 채 진행됐을 수 있어 복귀 시 한 번 다시 불러온다.
    // (시작 직후라 사용자가 입력한 내용이 없어 안전하다)
    private var pendingReloadAfterSettings = false

    // 신분증변환(IDCard.html) 등 <input type="file">이 있는 화면에서 WebView가 파일 선택을
    // 요청하면(onShowFileChooser) 그 콜백을 잠깐 들고 있다가, 아래 fileChooserLauncher의
    // 결과가 오면 웹페이지에 돌려준다.
    private var filePathCallback: ValueCallback<Array<Uri>>? = null

    // 카메라 촬영 결과가 저장될 위치. ACTION_IMAGE_CAPTURE는 결과 Intent에 데이터를 담아주지
    // 않고(찍은 사진이 큼) 미리 지정해 둔 이 URI에 바로 저장하므로, 결과를 받을 때 다시 써먹는다.
    private var cameraPhotoUri: Uri? = null

    // 파일 선택(갤러리) 또는 카메라 촬영 화면을 띄우고 결과를 받는다. 카메라의 경우 결과 Intent에
    // 데이터가 없으므로(위 cameraPhotoUri 참고) 실패(RESULT_OK 아님)만 아니면 그 URI를 그대로 쓴다.
    private val fileChooserLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val callback = filePathCallback
        filePathCallback = null

        if (callback == null) return@registerForActivityResult

        if (result.resultCode != RESULT_OK) {
            callback.onReceiveValue(null)
            return@registerForActivityResult
        }

        val pickedUri = result.data?.data ?: cameraPhotoUri
        callback.onReceiveValue(if (pickedUri != null) arrayOf(pickedUri) else null)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this)
        setupWebView()
        setContentView(buildRootView())
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                webView.evaluateJavascript("window.closeRecentCallLogPopup ? window.closeRecentCallLogPopup() : false;") { result ->
                    if (result != "true") {
                        isEnabled = false
                        onBackPressedDispatcher.onBackPressed()
                        isEnabled = true
                    }
                }
            }
        })

        // 상태바 영역 배경이 흰색이라, 시스템 글자(시간/배터리 등)도 밝은색이면 안 보임 -
        // "이 영역은 밝은 배경"이라고 명시해서 시스템이 어두운 글자로 그리게 한다
        WindowCompat.getInsetsController(window, window.decorView).isAppearanceLightStatusBars = true

        // 지난 실행 때 받아둔 최신본을 지금 반영한다 - 반드시 아래 openPage()보다 먼저,
        // 즉 WebView가 아무것도 읽고 있지 않을 때 해야 한다(AssetSyncManager 주석 참고)
        AssetSyncManager.promotePendingCache(this)

        checkPermissions()
        ensureUserCode()
        ConsultSyncWorker.schedulePeriodic(this) // 하루 4회 상담내역 로컬 캐시 동기화 예약(이미 예약돼 있으면 무시됨)
        AssetSyncManager.syncInBackground(this) // 각 화면 파일을 GitHub 원본에서 백그라운드로 최신화 시도

        // 평소 실행(아이콘 탭)은 상담(Consult_Main.html). 전화 수신 팝업의 "상담하기"를 거쳐
        // 들어온 경우(인텐트에 PHONE extra가 있음)에도 같은 상담 화면에 통화 정보를 주입한다.
        val phone = intent?.getStringExtra("PHONE")
        if (phone != null) {
            openConsultWithCall(
                phone,
                intent?.getStringExtra("NAME") ?: "",
                intent?.getStringExtra("MEMO") ?: "",
                intent?.getBooleanExtra("HAS_CONSULT_RECORD", false) == true
            )
        } else {
            openPage(Page.CONSULT)
        }
    }

    // 같은 화면을 다시 눌렀을 때 불필요하게 새로 불러오지 않도록 currentPage와 비교하되,
    // 아직 한 번도 로드한 적이 없으면(hasNavigated=false) 무조건 불러온다.
    // force=true는 다이얼로그/설정화면에 가려진 채 로딩된 화면을 확실히 다시 그리고 싶을 때 쓴다.
    private fun openPage(page: Page, force: Boolean = false) {
        val needsNavigate = force || !hasNavigated || currentPage != page
        currentPage = page
        if (needsNavigate) {
            hasNavigated = true
            webViewLoaded = false
            // 공시가조회는 항상 APK 번들 원본(/assets/)에서만 읽는다 - op_gongsi_data/(약 1900개
            // 파일)를 같이 데리고 다녀야 해서 GitHub 동기화 대상(AssetSyncManager.FILES)에 없고,
            // 캐시 폴더에 해당 파일이 존재한 적이 없다. resolveUrl()의 일반 규칙대로 두면(캐시가
            // 다른 화면들 기준으로 "완전한 세트"가 되는 순간부터) 무조건 /cache/를 골라버려 이
            // 화면만 파일을 못 찾아 빈 화면으로 남는 버그가 있어 이 처리가 필요하다.
            // 신분증변환·문서스캔은 FILES에 포함돼 있으므로 다른 화면들과 동일하게 resolveUrl()을 탄다.
            val url = if (page == Page.PROPERTY_PRICE) {
                "https://${AssetSyncManager.APP_DOMAIN}${AssetSyncManager.ASSETS_PATH_PREFIX}${Uri.encode(page.fileName)}"
            } else {
                AssetSyncManager.resolveUrl(this, page.fileName)
            }
            Log.d("CallNote", "openPage ${page.name} -> $url")
            webView.loadUrl(url)
        } else if (page == Page.CONSULT) {
            // 이미 상담 화면이 떠 있으면 새로고침 없이 바로 통화 데이터만 주입
            injectPendingConsultCallDataIfReady()
        }
        updateTabHighlight()
    }

    // 전화 수신 팝업의 "상담하기"를 거쳐 들어온 경우 전용 - 전화 데이터를 같이 넘긴다
    private fun openConsultWithCall(phone: String, name: String, memo: String, loadExisting: Boolean = false) {
        pendingConsultCallData = Triple(phone, name, memo)
        pendingConsultLoadExisting = loadExisting
        openPage(Page.CONSULT)
    }

    private fun injectPendingConsultCallDataIfReady() {
        if (!webViewLoaded || currentPage != Page.CONSULT) return
        val (phone, name, memo) = pendingConsultCallData ?: return
        val jsPhone = JSONObject.quote(phone)
        val jsName = JSONObject.quote(name)
        val js = "(function(){" +
            "var phone=" + jsPhone + ",name=" + jsName + ";" +
            "var phoneInput=document.getElementById('customerPhoneInput');" +
            "var nameInput=document.getElementById('customerNameInput');" +
            "if(phoneInput){phoneInput.value=phone;phoneInput.dispatchEvent(new Event('input',{bubbles:true}));}" +
            "if(nameInput&&name){nameInput.value=name;nameInput.dispatchEvent(new Event('input',{bubbles:true}));}" +
                  "if(typeof updateCustomerInfoSummary==='function')updateCustomerInfoSummary();" +
                (if (pendingConsultLoadExisting) "if(typeof openConsultStorageForPhone==='function')openConsultStorageForPhone(phone);" else "") +
                "})();"
            webView.evaluateJavascript(js, null)
            pendingConsultCallData = null
            pendingConsultLoadExisting = false
    }

    // 현재 화면에 해당하는 탭만 강조 표시(배경색 + 굵게)
    private fun updateTabHighlight() {
        tabViews.forEach { (page, view) ->
            val active = page == currentPage
            view.setBackgroundColor(if (active) Color.parseColor("#3a52b8") else Color.TRANSPARENT)
            view.setTypeface(null, if (active) Typeface.BOLD else Typeface.NORMAL)
        }
    }

    // 화면 맨 위에 9개 탭을 전부 펼쳐놓고, 그 아래에 WebView를 채운다.
    // 좁은 화면에서 9개가 한 줄에 다 안 들어가도 잘리지 않도록 가로 스크롤로 감싼다.
    private fun buildRootView(): View {
        val density = resources.displayMetrics.density
        val column = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }

        val tabBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setBackgroundColor(Color.parseColor("#1e293b"))
        }
        Page.values().forEach { page ->
            val tab = TextView(this).apply {
                text = page.menuLabel
                textSize = 13f
                setTextColor(Color.WHITE)
                gravity = Gravity.CENTER
                setPadding((18 * density).toInt(), (12 * density).toInt(), (18 * density).toInt(), (12 * density).toInt())
                setOnClickListener { openPage(page) }
            }
            tabViews[page] = tab
            tabBar.addView(tab)
        }
        val tabScroll = HorizontalScrollView(this).apply {
            isFillViewport = true
            addView(tabBar, ViewGroup.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        }

        column.addView(tabScroll, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
        column.addView(webView, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))

        // 버전 표시를 화면 위에 잠깐 겹쳐 띄우기 위해 FrameLayout으로 한 겹 감싼다.
        // 다이얼로그(별도 윈도우)를 쓰면 Activity 상태가 흔들려 WebView 로딩에 영향을 줄 수 있어
        // 같은 창 안의 평범한 View로 처리한다.
        val root = FrameLayout(this)
        root.addView(column, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        showVersionBadge(root)

        /* 위: 상태바(배터리/시간 표시줄) 높이만큼 여백을 줘서 탭바가 그 밑으로 내려오게 한다.
              상태바를 숨기는 대신 이렇게 하면 사용자가 상담 중에도 시간/배터리를 계속 볼 수 있다.

           아래: 소프트 키보드(IME)와 내비게이션바 중 더 높은 쪽만큼 여백을 준다.
              targetSdk 35부터 안드로이드는 창을 대신 줄여주지 않는다(adjustResize 무시,
              화면 전체를 앱이 쓰는 edge-to-edge가 기본). 그래서 여백을 직접 주지 않으면
                · 키보드가 올라와도 WebView는 화면 전체 높이를 그대로 유지한다.
                  웹페이지의 body{height:100%}도 그 큰 높이 그대로라 넘치는 내용이 없어
                  스크롤이 아예 안 생긴다 - 키보드에 가려진 위쪽을 볼 방법이 없었다.
                · 화면 맨 아래 버튼이 내비게이션바에 깔려 일부가 안 보인다.
              여백을 주면 WebView가 실제로 줄어들고, 그때 100%가 다시 계산되어
              내용이 넘치면 평범한 웹페이지처럼 상하 스크롤이 된다.

              둘 중 큰 값만 쓰는 이유: 키보드가 올라오면 내비게이션바 영역까지 함께 덮으므로
              두 값을 더하면 키보드 위에 빈 띠가 생긴다. */
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val statusBarInset = insets.getInsets(WindowInsetsCompat.Type.statusBars())
            val imeInset = insets.getInsets(WindowInsetsCompat.Type.ime())
            val navBarInset = insets.getInsets(WindowInsetsCompat.Type.navigationBars())
            view.setPadding(
                view.paddingLeft,
                statusBarInset.top,
                view.paddingRight,
                maxOf(imeInset.bottom, navBarInset.bottom)
            )
            insets
        }
        return root
    }

    // 빌드한 게 실제로 폰에 올라갔는지 눈으로 바로 확인하려고 시작 시 1.5초간 버전을 띄운다.
    // 표시할 값은 build.gradle.kts의 versionName 하나에서만 온다 - 코드와 APK 버전이 어긋날 일이 없다.
    private fun showVersionBadge(parent: FrameLayout) {
        val density = resources.displayMetrics.density
        val badge = TextView(this).apply {
            text = "v${BuildConfig.VERSION_NAME}"
            textSize = 24f
            setTextColor(Color.WHITE)
            setTypeface(null, Typeface.BOLD)
            gravity = Gravity.CENTER
            setPadding((32 * density).toInt(), (18 * density).toInt(), (32 * density).toInt(), (18 * density).toInt())
            background = GradientDrawable().apply {
                cornerRadius = 18 * density
                setColor(Color.parseColor("#E61e293b")) // 약간 비치는 남색 - 뒤 화면이 뜨는 걸 가리지 않게
            }
        }
        parent.addView(
            badge,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.CENTER
            )
        )
        badge.postDelayed({ parent.removeView(badge) }, 1500)
    }

    private fun setupWebView() {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            cacheMode = WebSettings.LOAD_DEFAULT
            // 이 설정이 없으면 WebView가 페이지의 viewport meta 태그를 무시하고 데스크톱 폭(약 980dp)으로
            // 렌더링한 뒤 화면에 맞춰 축소해서 보여줌 -> 화면에 보이는 위치와 실제 터치 좌표가 어긋나서
            // 버튼이 눈에 보이는 자리를 눌러도 잘 안 눌리는 현상이 생김
            useWideViewPort = true
            loadWithOverviewMode = true
            builtInZoomControls = false
            setSupportZoom(false)
            textZoom = 100
        }
        webView.webViewClient = object : WebViewClient() {
            // 에셋/캐시 파일을 실제로 서빙하는 지점 - file:// 대신 가상 https:// 주소로 들어오는
            // 요청을 여기서 가로채 assetLoader가 실제 바이트를 읽어 응답한다(네트워크 왕복 없음)
            override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest?): WebResourceResponse? {
                val url = request?.url ?: return null
                val response = assetLoader.shouldInterceptRequest(url)
                // 우리 가상 도메인인데 파일을 못 찾은 경우만 남긴다(응답은 오지만 내용물이 비어있음).
                // 다른 도메인(폰트/html2canvas 등 CDN)은 null이 정상 - WebView가 직접 받아오라는 뜻이라
                // 이걸 실패로 기록하면 매 실행마다 로그만 시끄러워진다.
                // favicon.ico는 페이지와 무관하게 WebView가 습관적으로 찾는 것이라 제외.
                if (response != null && response.data == null && url.lastPathSegment != "favicon.ico") {
                    Log.e("CallNote", "화면 파일 없음: $url")
                }
                return response
            }

            override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: android.webkit.WebResourceError?) {
                super.onReceivedError(view, request, error)
                // favicon.ico는 WebView가 페이지와 무관하게 습관적으로 찾는 것이라 항상 실패한다 - 무해하므로 제외
                if (request?.url?.lastPathSegment == "favicon.ico") return
                Log.e("CallNote", "load error: ${request?.url} -> ${error?.description}")
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                webViewLoaded = true
                // 최초 실행 때 네이티브 다이얼로그에서 저장한 사용자 이름을
                // 모든 WebView 화면의 localStorage에도 주입한다. Consult_Main.html도
                // 동기화 버튼에서 같은 이름을 사용해야 한다.
                syncUserCodeToWebView()
                if (currentPage == Page.CONSULT) {
                    injectPendingConsultCallDataIfReady()
                    injectPendingConsultingPayloadForMain()
                }
                if (currentPage == Page.DSR) installConsultingBridgeOnDsr()
                fillActiveCallPhoneIfAny()
            }
        }
        // 페이지 안의 JS 오류(예전에 겪은 injectCallData 관련 TypeError 같은)도 Logcat에 남기려면
        // 기본 WebChromeClient 대신 콘솔 메시지를 직접 받아야 한다
        webView.webChromeClient = object : WebChromeClient() {
            // 화면 스크립트가 죽으면 계산이 조용히 멈추므로 오류만 남긴다(경고/로그는 잡음이라 무시)
            override fun onConsoleMessage(msg: android.webkit.ConsoleMessage?): Boolean {
                if (msg?.messageLevel() == android.webkit.ConsoleMessage.MessageLevel.ERROR) {
                    Log.e("CallNote", "JS 오류: ${msg.message()} @${msg.sourceId()}:${msg.lineNumber()}")
                }
                return true
            }

            // <input type="file">(신분증변환의 "사진 선택하기"/"카메라로 촬영하기")은 WebView가
            // 이 콜백을 직접 구현해줘야만 반응한다 - 기본 WebChromeClient는 아무것도 안 하므로
            // 지금까지 두 버튼을 눌러도 아무 일도 안 일어났다.
            override fun onShowFileChooser(
                webView: WebView?,
                callback: ValueCallback<Array<Uri>>?,
                params: WebChromeClient.FileChooserParams?
            ): Boolean {
                // 이전에 띄운 선택창이 아직 안 닫힌 채로 또 요청이 오면(드물지만) 빈 값으로 정리
                filePathCallback?.onReceiveValue(null)
                filePathCallback = callback

                // <input id="camera" capture="environment">처럼 촬영 전용으로 지정된 input이면
                // 카메라 앱을 바로 띄운다("카메라로 촬영하기" 버튼). 그 외("사진 선택하기")는 갤러리.
                val captureRequested = params?.isCaptureEnabled == true

                if (captureRequested) {
                    val cameraIntent = createCameraCaptureIntent()
                    if (cameraIntent != null) {
                        fileChooserLauncher.launch(cameraIntent)
                        return true
                    }
                    // 카메라 앱이 없거나 임시 파일 생성에 실패하면 갤러리로 대체
                }

                fileChooserLauncher.launch(
                    Intent(Intent.ACTION_GET_CONTENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        type = "image/*"
                    }
                )
                return true
            }
        }
        webView.addJavascriptInterface(WebAppBridge(), "AndroidBridge")
    }

    // 카메라로 찍을 사진을 저장할 임시 파일을 캐시 폴더에 만들고, FileProvider로 감싼 URI를
    // 카메라 앱에 건넬 촬영 Intent를 만든다. 카메라 앱 자체가 없거나(에뮬레이터 등) 임시 파일을
    // 못 만들면 null을 돌려주고, 호출부(onShowFileChooser)가 갤러리 선택으로 대신 넘어간다.
    // (여기서 android.permission.CAMERA를 따로 요청하지 않는 이유: ACTION_IMAGE_CAPTURE는
    // 시스템 카메라 앱을 실행만 시키는 것이라 그 권한은 카메라 앱 쪽 책임이고, 우리 앱은 필요 없다.)
    private fun createCameraCaptureIntent(): Intent? {
        return try {
            val photoFile = File.createTempFile("idcard_", ".jpg", cacheDir)
            val photoUri = FileProvider.getUriForFile(this, "$packageName.fileprovider", photoFile)
            cameraPhotoUri = photoUri

            Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
                putExtra(MediaStore.EXTRA_OUTPUT, photoUri)
                addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
            }.takeIf { it.resolveActivity(packageManager) != null }
        } catch (e: Exception) {
            Log.e("CallNote", "카메라 촬영 준비 실패", e)
            null
        }
    }

    // DSR 화면에 "상담 전달" 메시지를 받아 네이티브로 넘기는 리스너를 심는다.
    //
    // 화면 파일(DSR_calculator_ui.js)은 GitHub 캐시가 있으면 그쪽을 먼저 쓰기 때문에(AssetSyncManager),
    // APK만 다시 빌드해서는 폰의 화면 파일이 갱신되지 않는다. 그래서 화면 파일이 옛것이어도
    // 동작하도록 받는 쪽을 네이티브에 둔다.
    //  - 옛 화면 파일: window.parent.postMessage를 부르는데 앱에는 부모 프레임이 없어 그 메시지가
    //    자기 페이지로 되돌아온다. 그걸 여기 리스너가 잡아서 네이티브로 넘긴다.
    //  - 새 화면 파일: 부모가 없는 걸 알고 AndroidBridge를 직접 부르므로 메시지를 아예 안 보낸다.
    // 두 경우 모두 정확히 한 번만 전달된다(중복 아님).
    private fun installConsultingBridgeOnDsr() {
        val js = """
            (function () {
              if (window.__consultingBridgeInstalled) return;
              window.__consultingBridgeInstalled = true;
              window.addEventListener('message', function (e) {
                if (!e.data || e.data.type !== 'dsrSendToConsulting') return;
                if (!(window.AndroidBridge && window.AndroidBridge.openConsultingWith)) return;
                window.AndroidBridge.openConsultingWith(JSON.stringify(e.data));
              });
            })();
        """.trimIndent()
        webView.evaluateJavascript(js, null)
        Log.d("CallNote", "DSR 화면에 상담 전달 리스너 설치")
    }

    // DSR에서 넘어온 값을 상담 화면(Consult_Main.html)에 넣는다. 그 화면은 웹에서 쓰던 것과 같은
    // message 이벤트 리스너로 이 값을 받으므로, 전용 함수를 새로 만들지 않고
    // customerInfoMemo 입력칸에 직접 넣어 input 이벤트를 일으킨다(받는 쪽 코드를 웹과 앱이 그대로 공유).
    // 기존에 적어둔 상담내용 뒤에 이어붙는다.
    private fun injectPendingConsultingPayloadForMain() {
        val payload = pendingConsultingPayload ?: return
        if (!webViewLoaded || currentPage != Page.CONSULT) return
        pendingConsultingPayload = null
        val js = "(function(){var p=$payload;var memo=p.text||'';var input=document.getElementById('customerInfoMemo');if(input&&memo){input.value=memo;input.dispatchEvent(new Event('input',{bubbles:true}));}})();"
        webView.evaluateJavascript(js, null)
    }

    // 웹뷰(Consult_Main.html)와 네이티브 로컬 캐시를 잇는 창구
    private inner class WebAppBridge {
        // DSR 계산기의 "상담 전달" 버튼. 웹에서는 부모 프레임(index.html)이 받아 중계하지만
        // 앱은 화면 하나를 통째로 띄우는 구조라 부모 프레임이 없어 그 경로가 통하지 않는다.
        // 여기서 상담 화면으로 바꾸고, 로딩이 끝나면 넘겨받은 값을 그 화면에 주입한다.
        // @JavascriptInterface 메서드는 UI 스레드가 아닌 별도 스레드에서 불리므로,
        // WebView를 건드리는 openPage는 반드시 runOnUiThread로 감싸야 한다.
        @JavascriptInterface
        fun openConsultingWith(payloadJson: String) {
            Log.d("CallNote", "상담 전달 요청 받음 (${payloadJson.length}자)")
            runOnUiThread {
                pendingConsultingPayload = payloadJson
                openPage(Page.CONSULT)
            }
        }

        // Consult_Main.html의 최신 로컬저장소에 상담기록을 저장한다.
        @JavascriptInterface
        fun saveLocalRecord(json: String) {
            try {
                ConsultRecordStore.save(this@MainActivity, JSONObject(json))
            } catch (e: Exception) {
                Log.e("CallNote", "saveLocalRecord failed", e)
            }
        }

        // Consult_Main.html에서 전화번호 기준으로 상담기록을 불러올 때 사용한다.
        @JavascriptInterface
        fun findConsultRecord(phone: String): String {
            return try {
                ConsultRecordStore.findByPhone(this@MainActivity, phone)?.toString().orEmpty()
            } catch (e: Exception) {
                Log.e("CallNote", "findConsultRecord failed", e)
                ""
            }
        }

        // Consult_Main.html의 최신 로컬저장소 전체 기록을 읽는다.
        @JavascriptInterface
        fun getLocalRecords(): String {
            return try {
                ConsultRecordStore.getAll(this@MainActivity).toString()
            } catch (e: Exception) {
                Log.e("CallNote", "getLocalRecords failed", e)
                "[]"
            }
        }

        // 연락처 칸을 탭했을 때 보여줄 최근 통화기록(부재중 제외, 최근 15건)
        @JavascriptInterface
        fun getRecentCallLog(): String {
            return try {
                queryRecentCallLog(this@MainActivity).toString()
            } catch (e: Exception) {
                Log.e("CallNote", "getRecentCallLog failed", e)
                "[]"
            }
        }

        // "로컬에 저장" 버튼 — 하루 4회 자동 동기화를 기다리지 않고 그 자리에서 즉시 서버 자료를 로컬에 반영.
        // 네트워크 호출이라 이 호출이 끝날 때까지 웹뷰 쪽 자바스크립트는 대기함(의도된 동작 — 사용자가
        // 버튼을 눌러 명시적으로 요청한 동기화라 완료/실패를 바로 알려주는 게 더 명확함)
        @JavascriptInterface
        fun syncNowBlocking(): Boolean {
            return ConsultSyncWorker.performSync(this@MainActivity)
        }

        // 신분증변환(IDCard.html)의 "공유하기". WebView 안에서는 navigator.share()나
        // <a download> 클릭이 별도 네이티브 처리 없이는 조용히 아무 반응도 없는 경우가 많아서
        // (카메라 파일선택 버튼이 처음에 그랬던 것과 같은 문제), 파일을 base64로 통째로 넘겨받아
        // 여기서 직접 표준 Android 공유 인텐트를 띄운다 - 카카오톡·메시지·인쇄 등 그 파일
        // 형식을 받을 수 있는 앱이 전부 선택지로 뜬다.
        @JavascriptInterface
        fun shareFile(base64Data: String, filename: String, mimeType: String) {
            runOnUiThread {
                try {
                    val bytes = Base64.decode(base64Data, Base64.DEFAULT)
                    val file = File(cacheDir, filename)
                    file.writeBytes(bytes)

                    val uri = FileProvider.getUriForFile(this@MainActivity, "$packageName.fileprovider", file)
                    val intent = Intent(Intent.ACTION_SEND).apply {
                        type = mimeType
                        putExtra(Intent.EXTRA_STREAM, uri)
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    }
                    startActivity(Intent.createChooser(intent, "공유하기"))
                } catch (e: Exception) {
                    Log.e("CallNote", "shareFile failed", e)
                    Toast.makeText(this@MainActivity, "공유 중 문제가 발생했습니다.", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private fun queryRecentCallLog(context: Context): JSONArray {
        val result = JSONArray()

        val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CALL_LOG) ==
            PackageManager.PERMISSION_GRANTED
        Log.d("CallNote", "queryRecentCallLog: READ_CALL_LOG granted=$granted")
        if (!granted) return result

        val limit = 15
        val projection = arrayOf(CallLog.Calls.NUMBER, CallLog.Calls.TYPE, CallLog.Calls.DATE)
        val selection = "${CallLog.Calls.TYPE} IN (?, ?)" // 부재중(MISSED_TYPE)은 제외
        val selectionArgs = arrayOf(
            CallLog.Calls.INCOMING_TYPE.toString(),
            CallLog.Calls.OUTGOING_TYPE.toString()
        )
        // 일부 기기/안드로이드 버전은 sortOrder에 LIMIT 같은 SQL 토큰을 넣으면
        // "Invalid token LIMIT" 예외를 던짐 — 정렬만 맡기고 개수 제한은 코드에서 직접 처리
        val sortOrder = "${CallLog.Calls.DATE} DESC"

        val cursor = context.contentResolver.query(CallLog.Calls.CONTENT_URI, projection, selection, selectionArgs, sortOrder)
        Log.d("CallNote", "queryRecentCallLog: cursor=${cursor}, count=${cursor?.count}")

        cursor?.use { c ->
            val numberIdx = c.getColumnIndexOrThrow(CallLog.Calls.NUMBER)
            val typeIdx = c.getColumnIndexOrThrow(CallLog.Calls.TYPE)

            while (c.moveToNext() && result.length() < limit) {
                val rawNumber = c.getString(numberIdx) ?: continue
                if (rawNumber.isBlank()) continue

                val type = c.getInt(typeIdx)
                // 1순위: 상담에서 저장된 이름(업무상 더 의미 있는 이름일 수 있음)
                // 2순위: 폰 연락처에 저장된 이름 — 전화기 통화목록에 뜨는 것과 동일하게 보이도록
                val cachedName = LocalConsultCache.findByPhone(context, rawNumber)?.optString("name", "").orEmpty()
                val displayName = cachedName.ifEmpty { resolveContactName(context, rawNumber) }

                val item = JSONObject()
                item.put("phone", PhoneUtils.format(rawNumber))
                item.put("name", displayName)
                item.put("direction", if (type == CallLog.Calls.OUTGOING_TYPE) "OUT" else "IN")
                result.put(item)
            }
        }
        Log.d("CallNote", "queryRecentCallLog: returning ${result.length()} items")
        return result
    }

    // 전화번호로 폰 연락처의 표시 이름을 역조회 — 전화기 자체 통화목록에 뜨는 이름과 동일한 방식
    private fun resolveContactName(context: Context, phoneNumber: String): String {
        val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CONTACTS) ==
            PackageManager.PERMISSION_GRANTED
        if (!granted) return ""

        return try {
            val uri = Uri.withAppendedPath(ContactsContract.PhoneLookup.CONTENT_FILTER_URI, Uri.encode(phoneNumber))
            context.contentResolver.query(uri, arrayOf(ContactsContract.PhoneLookup.DISPLAY_NAME), null, null, null)
                ?.use { cursor ->
                    if (cursor.moveToFirst()) {
                        cursor.getString(cursor.getColumnIndexOrThrow(ContactsContract.PhoneLookup.DISPLAY_NAME))
                    } else null
                }.orEmpty()
        } catch (e: Exception) {
            Log.e("CallNote", "resolveContactName failed", e)
            ""
        }
    }

    private fun syncUserCodeToWebView() {
        val userCode = prefs.getString("user_code", "")?.trim().orEmpty()
        if (userCode.isEmpty()) return
        // 동기화의 기준은 상담 입력칸이 아니라 WebView localStorage다.
        // Consult_Main.html처럼 입력칸이 없는 화면에서도 같은 사용자 이름을 사용한다.
        val quotedUserCode = JSONObject.quote(userCode)
        val js = "(function(){" +
            "var name=" + quotedUserCode + ";" +
            "localStorage.setItem('calc_user_name',name);" +
            "var input=document.getElementById('userCodeInput');" +
            "if(input){input.value=name;if(typeof submitUserCode==='function')submitUserCode();}" +
            "})();"
        webView.evaluateJavascript(js, null)
    }

    // 팝업을 거치지 않고 나중에 앱을 직접 열었을 때, CallReceiver가 기억해둔 통화중 번호가 있으면
    // 연락처 칸을 채우고, 상담 히스토리 검색도 화면에 띄우지 않은 채 미리 해둠(조용한 백그라운드 준비)
    private fun fillActiveCallPhoneIfAny() {
        if (!webViewLoaded) return
        val phone = prefs.getString("active_call_phone", "")?.trim().orEmpty()
        if (phone.isNotEmpty()) {
            val quotedPhone = JSONObject.quote(phone)
            val js = "javascript:if(window.prefetchActiveCall){prefetchActiveCall($quotedPhone);}"
            webView.evaluateJavascript(js, null)
        }
    }

    // 최초 실행 시 사용자 이름을 입력받아 로컬(SharedPreferences)에 저장 — 이후 실행부터는 다시 묻지 않음
    private fun ensureUserCode() {
        val existing = prefs.getString("user_code", "")?.trim().orEmpty()
        if (existing.isNotEmpty()) return

        val input = EditText(this).apply { hint = "예: 홍길동" }
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 32, 48, 16)
            addView(TextView(context).apply { text = "전화 수신 시 메모를 조회할 사용자 이름을 입력해주세요." })
            addView(input)
        }

        val dialog = AlertDialog.Builder(this)
            .setTitle("스마트 상담도구 최초 설정")
            .setView(container)
            .setCancelable(false)
            .setPositiveButton("저장", null)
            .create()

        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val name = input.text.toString().trim()
                if (name.isEmpty()) {
                    input.error = "이름을 입력해주세요."
                } else {
                    prefs.edit().putString("user_code", name).apply()
                    // 현재 화면이 무엇이든 WebView localStorage에 사용자 이름을 즉시 반영한다.
                    syncUserCodeToWebView()
                    ConsultSyncWorker.syncNow(this@MainActivity) // 다음 정기 동기화까지 기다리지 않고 즉시 캐시 채움
                    dialog.dismiss()
                    // onCreate()에서 이 다이얼로그가 openPage(Page.DSR)보다 먼저 뜨기 때문에,
                    // DSR 화면은 다이얼로그에 완전히 가려진 채로 처음 로딩/렌더링된다. reload()는
                    // 첫 로딩이 끝난 적 없는 상태에서 안 먹힐 수 있어, 항상 검증된 openPage(force=true)
                    // 경로로 강제 재요청한다. 이 시점엔 사용자가 아직 DSR 화면에 입력한 게 없어 안전하다.
                    openPage(currentPage, force = true)
                }
            }
        }
        dialog.show()
    }

    private fun checkPermissions() {
        val permissions = mutableListOf(
            Manifest.permission.READ_PHONE_STATE,
            Manifest.permission.READ_CALL_LOG,
            Manifest.permission.READ_CONTACTS // 최근 통화기록 목록에 연락처 이름을 같이 보여주기 위함
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissions.add(Manifest.permission.POST_NOTIFICATIONS)
        }

        val needed = permissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }

        if (needed.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, needed.toTypedArray(), 100)
        }

        // 오버레이(팝업) 권한 확인
        if (!Settings.canDrawOverlays(this)) {
            // 이 설정 화면 때문에 MainActivity가 완전히 백그라운드로 밀려나면서 Surface가 통째로
            // 파괴됐다가 복귀 시 새로 만들어짐 - 그 사이 시작된 WebView 로딩이 화면에 안 그려진
            // 채로 멈추는 원인이라, 돌아왔을 때(onResume) 강제로 다시 불러오도록 표시해둔다
            pendingReloadAfterSettings = true
            val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName"))
            startActivity(intent)
            Toast.makeText(this, "전화 수신 팝업을 위해 '다른 앱 위에 표시' 권한을 허용해주세요.", Toast.LENGTH_LONG).show()
            return
        }

        // 배터리 최적화 대상이면 앱이 백그라운드/화면 꺼짐 상태에서 죽어 전화 수신을 못 잡을 수 있어 예외 요청
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        if (!pm.isIgnoringBatteryOptimizations(packageName)) {
            pendingReloadAfterSettings = true
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName"))
            startActivity(intent)
        }
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
        if (pendingReloadAfterSettings) {
            pendingReloadAfterSettings = false
            // 권한 설정 화면 때문에 Activity가 완전히 백그라운드로 밀려나며 Surface 자체가
            // 파괴됐다 재생성됐다 - onResume()만으로는 그 사이 멈춘 렌더링이 다시 안 그려져서
            // 아예 다시 불러온다. 이 시점은 설정 화면으로 나가기 전이라 사용자가 화면에 뭔가
            // 입력했을 가능성이 없어 안전하다. reload()는 첫 로딩이 끝난 적 없는 상태에서
            // 안 먹힐 수 있어, 항상 검증된 openPage(force=true) 경로로 강제 재요청한다.
            openPage(currentPage, force = true)
        }
        fillActiveCallPhoneIfAny()
    }

    override fun onPause() {
        super.onPause()
        webView.onPause()
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        handleIntentData(intent)
    }

    private fun handleIntentData(intent: Intent?) {
        val phone = intent?.getStringExtra("PHONE") ?: return
        val name = intent.getStringExtra("NAME") ?: ""
        val memo = intent.getStringExtra("MEMO") ?: ""
        val hasRecord = intent.getBooleanExtra("HAS_CONSULT_RECORD", false)
        // 앱이 이미 실행 중인 상태에서도 최근 상담 화면(Consult_Main.html)만 사용한다.
        openConsultWithCall(phone, name, memo, hasRecord)
    }
}
