package com.example.callnote

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import kotlin.math.abs
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.app.NotificationCompat

class CallPopupService : Service() {

    private lateinit var windowManager: WindowManager
    private var popupView: View? = null

    private val CHANNEL_ID = "call_note_channel"
    private val NOTIFICATION_ID = 1

    // "IN"(수신) / "OUT"(발신) — CallReceiver가 넘겨줌, 팝업 문구 표시에만 사용
    private var callDirection = "IN"
    private val directionLabel get() = if (callDirection == "OUT") "발신" else "수신"

    // 번호를 못 가져왔을 때 이유 — "PERMISSION"(통화기록 권한 없음) / "UNKNOWN"(그 외, 타이밍 등)
    private var noNumberReason = "UNKNOWN"

    // "상담하기" 버튼이 클릭 시점 기준 최신 정보로 앱을 열 수 있도록 유지하는 상태
    private var currentPhone = ""
    private var currentName = ""
    private var currentMemo = ""
    private var currentHasRecord = false

    companion object {
        private const val TAG = "CallNote"
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "onStartCommand phone=${intent?.getStringExtra("PHONE_NUMBER")}")

        // 앱이 완전히 종료된 상태에서 재기동될 때 여기서 예외(예: ForegroundServiceStartNotAllowedException)가 나면
        // 팝업까지 도달하지 못하고 조용히 실패함 — Logcat에서 "CallNote" 태그로 확인
        try {
            startForegroundWithNotification()
        } catch (e: Exception) {
            Log.e(TAG, "startForeground failed", e)
            stopSelf()
            return START_NOT_STICKY
        }

        val phoneNumber = intent?.getStringExtra("PHONE_NUMBER") ?: return START_NOT_STICKY
        callDirection = intent.getStringExtra("CALL_DIRECTION") ?: "IN"
        noNumberReason = intent.getStringExtra("NO_NUMBER_REASON") ?: "UNKNOWN"
        showPopup(phoneNumber)
        fetchCustomerData(phoneNumber)
        return START_NOT_STICKY
    }

    private fun startForegroundWithNotification() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID, "통화 메모 알림", NotificationManager.IMPORTANCE_LOW
            )
            val nm = getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(channel)
        }

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("스마트 상담도구")
            .setContentText("통화 메모를 확인하고 있습니다")
            .setSmallIcon(android.R.drawable.ic_menu_call)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
        Log.d(TAG, "startForeground succeeded")
    }

    // 이 화면은 XML 없이 코드로만 만들기 때문에 크기를 px로 쓰면 폰마다 실제 크기가 달라진다.
    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private fun showPopup(phoneNumber: String) {
        if (popupView != null) return

        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager

        // 둥근 모서리 흰색 카드
        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(36, 28, 36, 32)
            background = GradientDrawable().apply {
                setColor(Color.WHITE)
                cornerRadius = 28f
            }
            elevation = 24f
        }

        val headerRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }

        val titleView = TextView(this).apply {
            // 번호가 아직 없어도(통신사가 뒤이어 번호를 붙여 다시 보내는 경우가 많음) 바로 "확인 불가"라고
            // 단정하지 않고 "조회 중"으로 표시 — 곧 번호가 채워지면 팝업이 한 번만 자연스럽게 갱신됨
            text = if (phoneNumber.isNotEmpty()) "📞 $directionLabel: $phoneNumber\n조회 중..." else "📞 $directionLabel 전화\n조회 중..."
            textSize = 15f
            setTextColor(Color.parseColor("#1e293b"))
            tag = "TITLE_VIEW"
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }

        // 통화 중에 한 손으로 누르는 버튼이라 터치 영역을 넉넉히(48dp 정사각) 잡는다.
        // 예전엔 textSize 18에 px 패딩만 줘서, 고해상도 폰일수록 실제 누를 수 있는 면적이
        // 글자 크기만큼밖에 안 돼 잘 안 눌렸다. 회색 원 배경은 "누르는 곳"임을 알려주는 용도.
        val closeBtn = TextView(this).apply {
            text = "✕"
            textSize = 22f
            setTextColor(Color.parseColor("#475569"))
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#f1f5f9"))
            }
            layoutParams = LinearLayout.LayoutParams(dp(48), dp(48)).apply {
                marginStart = dp(8)
            }
            setOnClickListener { stopSelf() }
        }

        headerRow.addView(titleView)
        headerRow.addView(closeBtn)

        val memoView = TextView(this).apply {
            text = ""
            textSize = 16f
            setTextColor(Color.parseColor("#334155"))
            setPadding(0, 24, 0, 20)
            tag = "MEMO_VIEW"
        }

        currentPhone = phoneNumber
        val openAppBtn = Button(this).apply {
            text = "상담하기"
            setBackgroundColor(Color.parseColor("#2196f3"))
            setTextColor(Color.WHITE)
            tag = "OPEN_BTN"
            // 데이터 조회가 끝나기 전(또는 실패해서 updatePopupUI가 아예 호출 안 되는 경우)에도
            // 버튼이 눌리도록, 클릭 리스너를 여기서 바로 붙여둠 — 이전엔 updatePopupUI 안에서만
            // 붙여서, 조회가 안 끝났거나 실패한 케이스에선 눌러도 완전히 무반응이었음
            setOnClickListener {
                val intent = Intent(this@CallPopupService, MainActivity::class.java).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                    putExtra("PHONE", currentPhone)
                    putExtra("NAME", currentName)
                    putExtra("MEMO", currentMemo)
                    putExtra("HAS_CONSULT_RECORD", currentHasRecord)
                    putExtra("TARGET_CONSULT", true)
                }
                startActivity(intent)
                stopSelf()
            }
        }

        card.addView(headerRow)
        card.addView(memoView)
        card.addView(openAppBtn)

        // 화면 가장자리 여백을 주기 위한 바깥 래퍼
        val outer = FrameLayout(this).apply {
            setPadding(16, 16, 16, 16)
        }
        outer.addView(card, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT))

        popupView = outer

        val screenWidth = resources.displayMetrics.widthPixels
        val popupWidth = screenWidth / 2

        val prefs = getSharedPreferences("call_note_prefs", Context.MODE_PRIVATE)
        val savedX = prefs.getInt("popup_x", (screenWidth - popupWidth) / 2)
        val savedY = prefs.getInt("popup_y", 100)

        val layoutParams = WindowManager.LayoutParams(
            popupWidth,
            WindowManager.LayoutParams.WRAP_CONTENT,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY else WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
                // 화면이 꺼져있거나 잠겨있는 상태(전화가 올 때 가장 흔한 상태)에서도 팝업이 보이도록 함.
                // 이 두 플래그는 Activity 전용 API(setShowWhenLocked 등)로 대체된 뒤에도, 이 서비스처럼
                // Activity가 아닌 순수 오버레이 창에서는 여전히 이 방법밖에 없음.
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = savedX
            y = savedY
        }

        try {
            windowManager.addView(popupView, layoutParams)
            Log.d(TAG, "overlay addView succeeded")
        } catch (e: Exception) {
            // '다른 앱 위에 표시' 권한이 실제로는 꺼져 있을 때 여기서 실패함 (BadTokenException 등)
            Log.e(TAG, "overlay addView failed", e)
            popupView = null
            return
        }
        enableDragToMove(outer, layoutParams)
    }

    // 카드의 빈 영역(제목/메모 부분)을 드래그하면 팝업이 움직이고, 뗀 위치가 저장돼서 다음 전화부터 그대로 뜸.
    // 버튼(✕, 상담하기) 위에서는 자체 클릭 처리가 우선되므로 드래그와 충돌하지 않음.
    private fun enableDragToMove(target: View, layoutParams: WindowManager.LayoutParams) {
        var initialX = 0
        var initialY = 0
        var initialTouchX = 0f
        var initialTouchY = 0f
        var dragging = false
        val touchSlop = 12

        target.setOnTouchListener { _, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    initialX = layoutParams.x
                    initialY = layoutParams.y
                    initialTouchX = event.rawX
                    initialTouchY = event.rawY
                    dragging = false
                    false
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = event.rawX - initialTouchX
                    val dy = event.rawY - initialTouchY
                    if (!dragging && (abs(dx) > touchSlop || abs(dy) > touchSlop)) {
                        dragging = true
                    }
                    if (dragging) {
                        layoutParams.x = initialX + dx.toInt()
                        layoutParams.y = initialY + dy.toInt()
                        windowManager.updateViewLayout(popupView, layoutParams)
                    }
                    dragging
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    if (dragging) {
                        getSharedPreferences("call_note_prefs", Context.MODE_PRIVATE).edit()
                            .putInt("popup_x", layoutParams.x)
                            .putInt("popup_y", layoutParams.y)
                            .apply()
                    }
                    dragging
                }
                else -> false
            }
        }
    }

    private fun fetchCustomerData(phoneNumber: String) {
        if (phoneNumber.isEmpty()) {
            // 통신사가 뒤이어 번호가 포함된 RINGING을 다시 보내는 경우가 많아서, 바로 "못 가져왔다"고
            // 단정하지 않고 잠깐 기다렸다가 그때도 여전히 번호가 없으면 그제서야 안내 문구를 보여줌.
            // (이 사이 진짜 번호가 도착하면 currentPhone이 채워져서 아래 메시지는 아예 안 뜸 —
            //  팝업이 "번호 확인 불가" → 실제 결과, 이렇게 두 번 바뀌어 보이던 문제를 없앰)
            Handler(Looper.getMainLooper()).postDelayed({
                if (currentPhone.isEmpty()) {
                    popupView?.findViewWithTag<TextView>("MEMO_VIEW")?.text = if (noNumberReason == "PERMISSION") {
                        "통화기록 권한이 없어 번호를 가져오지 못했습니다.\n설정 > 앱 > 스마트 상담도구 > 권한에서 '통화 기록'을 허용해주세요."
                    } else {
                        "번호를 가져오지 못했습니다. 통화가 연결된 뒤 앱을 열면 번호가 채워져 있을 수 있어요."
                    }
                }
            }, 800)
            return
        }

        // 실제 조회(로컬/서버)가 끝나기 전이라도 번호 자체는 이미 확보됐으니 바로 반영 —
        // 위 지연 메시지가 "아직도 번호가 없다"고 착각해서 뒤늦게 잘못 뜨는 걸 막아줌
        currentPhone = phoneNumber

        // 사용자 이름이나 Google Sheet 동기화 여부와 관계없이 로컬 저장소를 조회한다.

        // 로컬 캐시만 조회 — 하루 4회 자동 동기화 + "로컬에 저장" 수동 동기화로 이미 최신 상태를 유지하니
        // 여기서 굳이 서버까지 다시 왕복할 필요 없음(속도도 빠르고 서버 부담도 없음)
        // 최근 Consult_Main.html이 저장한 로컬 저장소를 기준으로 번호를 조회한다.
        val cached = ConsultRecordStore.findByPhone(this, phoneNumber)
        if (cached != null) {
            Log.d(TAG, "consult cache hit for $phoneNumber")
            updatePopupUI(phoneNumber, cached.optString("name", ""), cached.optString("memo", ""), true)
        } else {
            Log.d(TAG, "consult cache miss for $phoneNumber")
            updatePopupUI(phoneNumber, "", "", false)
        }
    }

    private fun updatePopupUI(phone: String, name: String, memo: String, hasRecord: Boolean) {
        currentPhone = phone
        currentName = name
        currentMemo = memo
        currentHasRecord = hasRecord

        val title = popupView?.findViewWithTag<TextView>("TITLE_VIEW")
        val memoView = popupView?.findViewWithTag<TextView>("MEMO_VIEW")

        val openButton = popupView?.findViewWithTag<Button>("OPEN_BTN")
        if (hasRecord) {
            title?.text = if (name.isNotEmpty()) "👤 $name 고객님 ($phone)" else "👤 상담내역 있음 ($phone)"
            memoView?.text = if (memo.isNotEmpty()) memo else "등록된 과거 상담이력이 있습니다."
            openButton?.text = "상담내역 불러오기"
        } else {
            title?.text = "📞 신규 $directionLabel: $phone"
            memoView?.text = "저장된 상담내역이 없습니다."
            openButton?.text = "상담하기"
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        popupView?.let {
            if (it.isAttachedToWindow) windowManager.removeView(it)
        }
        popupView = null
    }
}
