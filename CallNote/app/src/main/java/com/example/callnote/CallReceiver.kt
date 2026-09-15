package com.example.callnote

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.provider.CallLog
import android.telephony.TelephonyManager
import android.util.Log
import androidx.core.content.ContextCompat

class CallReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        Log.d(TAG, "onReceive action=${intent.action}")
        if (intent.action != TelephonyManager.ACTION_PHONE_STATE_CHANGED) return

        val state = intent.getStringExtra(TelephonyManager.EXTRA_STATE) ?: return
        val incomingNumber = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER)
        Log.d(TAG, "state=$state incomingNumber=$incomingNumber")

        // 리시버 인스턴스는 브로드캐스트마다 새로 만들어져서 인스턴스 변수로는 이전 상태를 기억할 수 없음 —
        // 상태 전이를 판단하려면(특히 발신 감지) prefs에 저장해서 브로드캐스트 사이에 유지해야 함
        val prefs = context.getSharedPreferences("call_note_prefs", Context.MODE_PRIVATE)
        val previousState = prefs.getString("last_phone_state", TelephonyManager.EXTRA_STATE_IDLE)
            ?: TelephonyManager.EXTRA_STATE_IDLE

        when {
            state == TelephonyManager.EXTRA_STATE_RINGING -> {
                val isNewRing = previousState != TelephonyManager.EXTRA_STATE_RINGING
                if (isNewRing) {
                    // 새 벨울림 시작 — 이번 통화에서 아직 번호를 못 구했다는 표시로 초기화
                    // (active_call_phone 자체는 건드리지 않음 — 직전 통화 종료 후 1분 유지 기능과 무관하게 둠)
                    prefs.edit().putBoolean("ringing_number_found", false).apply()
                }
                // 통신사가 발신자 정보를 늦게 붙여서 RINGING이 두 번(번호 없이 한 번, 번호 붙여서 한 번) 오는 경우가 있음.
                // 이번 벨울림에서 아직 번호를 못 구했다면 같은 RINGING이 반복돼도 계속 다시 시도해야
                // 두 번째 방송에 실린 진짜 번호를 놓치지 않음. 번호를 이미 구했으면 그 다음부터는 중복으로 무시.
                val numberAlreadyFound = prefs.getBoolean("ringing_number_found", false)
                if (isNewRing || !numberAlreadyFound) {
                    handleIncomingRinging(context, incomingNumber)
                }
            }
            // RINGING을 거치지 않고 IDLE에서 바로 OFFHOOK로 넘어감 = 내가 건 발신 전화
            state == TelephonyManager.EXTRA_STATE_OFFHOOK && previousState == TelephonyManager.EXTRA_STATE_IDLE -> {
                // 발신 시 팝업은 잠시 비활성화함.
                // 나중에 다시 활성화하려면 아래 주석을 해제하면 됨.
                // handleOutgoingStarted(context)
            }
            state == TelephonyManager.EXTRA_STATE_IDLE -> {
                // 통화 종료 — 기억해둔 번호를 바로 지우지 않고 1분 뒤에 지우도록 예약
                ClearActiveCallWorker.scheduleClear(context)
                context.stopService(Intent(context, CallPopupService::class.java))
            }
        }

        prefs.edit().putString("last_phone_state", state).apply()
    }

    private fun handleIncomingRinging(context: Context, incomingNumber: String?) {
        ClearActiveCallWorker.cancelPendingClear(context)

        // incomingNumber가 비어있어도(권한/타이밍 문제로 가끔 발생) 팝업 자체는 항상 띄움
        val formattedNumber = if (!incomingNumber.isNullOrEmpty()) PhoneUtils.format(incomingNumber) else ""
        if (formattedNumber.isNotEmpty()) {
            saveActiveCallPhone(context, formattedNumber)
            context.getSharedPreferences("call_note_prefs", Context.MODE_PRIVATE).edit()
                .putBoolean("ringing_number_found", true)
                .apply()
        } else {
            Log.w(TAG, "incomingNumber is empty (raw=$incomingNumber) — READ_CALL_LOG 권한 상태 확인 필요")
        }
        startPopup(context, formattedNumber, "IN")
    }

    private fun handleOutgoingStarted(context: Context) {
        ClearActiveCallWorker.cancelPendingClear(context)

        // 발신 전화는 PHONE_STATE 브로드캐스트에 번호가 실려오지 않아서, 방금 막 기록된 통화기록에서 가져옴
        val outgoingNumber = queryLatestOutgoingNumber(context)
        val formattedNumber = if (!outgoingNumber.isNullOrEmpty()) PhoneUtils.format(outgoingNumber) else ""
        if (formattedNumber.isNotEmpty()) {
            saveActiveCallPhone(context, formattedNumber)
        } else {
            Log.w(TAG, "발신번호를 통화기록에서 찾지 못함")
        }
        startPopup(context, formattedNumber, "OUT")
    }

    // READ_CALL_LOG가 실제로 허용돼 있는지 확인 — 번호가 안 잡힐 때 팝업에 정확한 원인을 보여주기 위함
    private fun hasCallLogPermission(context: Context): Boolean {
        return ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CALL_LOG) ==
            PackageManager.PERMISSION_GRANTED
    }

    private fun queryLatestOutgoingNumber(context: Context): String? {
        return try {
            context.contentResolver.query(
                CallLog.Calls.CONTENT_URI,
                arrayOf(CallLog.Calls.NUMBER, CallLog.Calls.DATE),
                "${CallLog.Calls.TYPE} = ?",
                arrayOf(CallLog.Calls.OUTGOING_TYPE.toString()),
                // 일부 기기는 sortOrder에 LIMIT 토큰이 있으면 "Invalid token LIMIT" 예외를 던짐 —
                // 정렬만 맡기고 moveToFirst()로 최신 1건만 사용
                "${CallLog.Calls.DATE} DESC"
            )?.use { cursor ->
                if (!cursor.moveToFirst()) return null
                val date = cursor.getLong(cursor.getColumnIndexOrThrow(CallLog.Calls.DATE))
                val ageMs = System.currentTimeMillis() - date
                // 오래된 기록을 잘못 집어오지 않도록, 방금(15초 이내) 생긴 기록만 인정
                if (ageMs !in 0..15000) return null
                cursor.getString(cursor.getColumnIndexOrThrow(CallLog.Calls.NUMBER))
            }
        } catch (e: Exception) {
            Log.e(TAG, "queryLatestOutgoingNumber failed", e)
            null
        }
    }

    private fun saveActiveCallPhone(context: Context, phone: String) {
        // 팝업을 거치지 않고 나중에 앱을 직접 열어도, 통화가 아직 유지 중이면 번호를 채워줄 수 있도록 기억해둠
        context.getSharedPreferences("call_note_prefs", Context.MODE_PRIVATE).edit()
            .putString("active_call_phone", phone)
            .apply()
    }

    private fun startPopup(context: Context, formattedNumber: String, direction: String) {
        val serviceIntent = Intent(context, CallPopupService::class.java).apply {
            putExtra("PHONE_NUMBER", formattedNumber)
            putExtra("CALL_DIRECTION", direction) // "IN" 수신 / "OUT" 발신
            if (formattedNumber.isEmpty()) {
                // 번호를 못 가져온 이유를 팝업이 바로 안내할 수 있도록 전달
                putExtra("NO_NUMBER_REASON", if (hasCallLogPermission(context)) "UNKNOWN" else "PERMISSION")
            }
        }
        try {
            // API 26+ 에서는 백그라운드 상태의 startService()가 IllegalStateException으로 죽을 수 있어 포그라운드 서비스로 기동
            ContextCompat.startForegroundService(context, serviceIntent)
            Log.d(TAG, "startForegroundService requested ($direction) for ${formattedNumber.ifEmpty { "(번호 없음)" }}")
        } catch (e: Exception) {
            // 앱이 완전히 종료된 상태에서 백그라운드 서비스 기동이 시스템에 의해 거부되면 여기서 잡힘
            // (예: ForegroundServiceStartNotAllowedException). Logcat에서 "CallNote" 태그로 확인 가능
            Log.e(TAG, "startForegroundService failed", e)
        }
    }

    companion object {
        private const val TAG = "CallNote"
    }
}
