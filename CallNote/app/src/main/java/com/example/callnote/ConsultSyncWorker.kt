package com.example.callnote

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

// 내(사용자 이름) 시트 탭의 상담내역 전체를 하루 4회 받아와 로컬 캐시를 통째로 갱신
class ConsultSyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        return if (performSync(applicationContext)) Result.success() else Result.retry()
    }

    companion object {
        private const val TAG = "CallNote"
        private const val WORK_NAME = "consult_sync_periodic"

        // 실제 동기화 로직 — 백그라운드 주기 작업(doWork)과 "로컬에 저장" 버튼(즉시 호출) 둘 다 이걸 씀
        fun performSync(context: Context): Boolean {
            val prefs = context.getSharedPreferences("call_note_prefs", Context.MODE_PRIVATE)
            val userCode = prefs.getString("user_code", "")?.trim().orEmpty()
            if (userCode.isEmpty()) return true // 등록된 사용자 이름이 없으면 할 일이 없는 것 — 실패 아님

            return try {
                val url = "${AppConfig.WEB_APP_URL}?action=read&userCode=${URLEncoder.encode(userCode, "UTF-8")}"
                val request = Request.Builder().url(url).build()
                val response = OkHttpClient().newCall(request).execute()
                val body = response.body?.string() ?: "[]"
                val array = JSONArray(body)
                LocalConsultCache.replaceAll(context, array)
                Log.d(TAG, "synced ${array.length()} records for [$userCode]")
                true
            } catch (e: Exception) {
                Log.e(TAG, "sync failed", e)
                false
            }
        }

        // 하루 4회 ≈ 6시간 간격. 이미 예약돼 있으면(KEEP) 다시 호출해도 스케줄이 리셋되지 않음
        fun schedulePeriodic(context: Context) {
            val request = PeriodicWorkRequestBuilder<ConsultSyncWorker>(6, TimeUnit.HOURS).build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, request
            )
        }

        // 사용자 이름을 처음 등록한 직후 등, 다음 정기 동기화를 기다리지 않고 즉시(백그라운드로) 캐시를 채우고 싶을 때 호출
        fun syncNow(context: Context) {
            WorkManager.getInstance(context).enqueue(OneTimeWorkRequestBuilder<ConsultSyncWorker>().build())
        }
    }
}
