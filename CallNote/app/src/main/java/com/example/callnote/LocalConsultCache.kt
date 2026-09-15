package com.example.callnote

import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * 서버(Apps Script)의 상담내역을 로컬 파일(JSON)에 캐싱해서 전화 수신 시 매번 네트워크를
 * 타지 않고 바로 조회할 수 있게 함. 내(사용자 이름) 시트 탭 것만 다룸.
 */
object LocalConsultCache {
    private const val TAG = "CallNote"
    private const val FILE_NAME = "consult_cache.json"

    private fun cacheFile(context: Context) = File(context.filesDir, FILE_NAME)

    private fun normalizePhone(phone: String) = phone.filter { it.isDigit() }

    // 하루 4회 백그라운드 동기화(ConsultSyncWorker)가 서버의 최신 전체 목록으로 통째로 덮어씀
    @Synchronized
    fun replaceAll(context: Context, records: JSONArray) {
        try {
            cacheFile(context).writeText(records.toString())
        } catch (e: Exception) {
            Log.e(TAG, "LocalConsultCache.replaceAll failed", e)
        }
    }

    // 캐시 전체를 그대로 반환 — 웹뷰의 "히스토리 불러오기" 화면이 서버 대신 이걸 씀
    @Synchronized
    fun getAll(context: Context): JSONArray {
        val file = cacheFile(context)
        if (!file.exists()) return JSONArray()
        return try {
            JSONArray(file.readText())
        } catch (e: Exception) {
            Log.e(TAG, "LocalConsultCache.getAll failed", e)
            JSONArray()
        }
    }

    // 전화번호로 최신 1건 조회 (서버가 항상 최신순으로 내려주므로 첫 매치가 최신)
    @Synchronized
    fun findByPhone(context: Context, phone: String): JSONObject? {
        val file = cacheFile(context)
        if (!file.exists()) return null
        return try {
            val target = normalizePhone(phone)
            val array = JSONArray(file.readText())
            for (i in 0 until array.length()) {
                val item = array.getJSONObject(i)
                if (normalizePhone(item.optString("phone")) == target) {
                    return item
                }
            }
            null
        } catch (e: Exception) {
            Log.e(TAG, "LocalConsultCache.findByPhone failed", e)
            null
        }
    }

    // 저장 버튼(웹) 또는 서버 폴백 조회 결과로 받은 레코드 1건을 캐시 맨 앞에 반영
    @Synchronized
    fun upsert(context: Context, record: JSONObject) {
        val file = cacheFile(context)
        val target = normalizePhone(record.optString("phone"))
        val existing = try {
            if (file.exists()) JSONArray(file.readText()) else JSONArray()
        } catch (e: Exception) {
            JSONArray()
        }

        val merged = JSONArray()
        merged.put(record)
        for (i in 0 until existing.length()) {
            val item = existing.getJSONObject(i)
            if (normalizePhone(item.optString("phone")) != target) {
                merged.put(item)
            }
        }

        try {
            file.writeText(merged.toString())
        } catch (e: Exception) {
            Log.e(TAG, "LocalConsultCache.upsert failed", e)
        }
    }
}
