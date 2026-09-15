package com.example.callnote

import android.content.Context
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

// 통화가 끝나도 "통화중 번호" 기억을 바로 지우지 않고 1분간 유지했다가 지움
// (전화를 끊고 나서 뒤늦게 앱을 열어도 잠시 동안은 번호가 채워지도록)
class ClearActiveCallWorker(context: Context, params: WorkerParameters) : Worker(context, params) {

    override fun doWork(): Result {
        applicationContext.getSharedPreferences("call_note_prefs", Context.MODE_PRIVATE).edit()
            .remove("active_call_phone")
            .apply()
        return Result.success()
    }

    companion object {
        private const val WORK_NAME = "clear_active_call_phone"

        // 통화 종료(IDLE) 시 호출 — 이미 예약된 게 있으면 최신 것으로 교체
        fun scheduleClear(context: Context) {
            val request = OneTimeWorkRequestBuilder<ClearActiveCallWorker>()
                .setInitialDelay(1, TimeUnit.MINUTES)
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(WORK_NAME, ExistingWorkPolicy.REPLACE, request)
        }

        // 새 전화가 울리기 시작하면(RINGING) 직전 통화의 삭제 예약이 남아있지 않도록 취소
        fun cancelPendingClear(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
        }
    }
}
