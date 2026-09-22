package com.example.callnote
import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
/** Consult_Main.html 전용 상담저장소. 예전 상담일지용 LocalConsultCache와 분리한다. */
object ConsultRecordStore {
    private const val TAG = "CallNote"
    private const val FILE_NAME = "consult_main_records.json"
    private const val LIMIT = 100
    @Synchronized fun save(context: Context, record: JSONObject) {
        try {
            val records = read(context)
            val phone = normalize(record.optString("phone"))
            if (phone.isNotEmpty()) for (i in records.length() - 1 downTo 0) {
                if (normalize(records.optJSONObject(i)?.optString("phone").orEmpty()) == phone) records.remove(i)
            }
            records.put(record)
            while (records.length() > LIMIT) records.remove(0)
            context.openFileOutput(FILE_NAME, Context.MODE_PRIVATE).use { it.write(records.toString().toByteArray(Charsets.UTF_8)) }
        } catch (e: Exception) { Log.e(TAG, "ConsultRecordStore.save failed", e) }
    }
    @Synchronized fun findByPhone(context: Context, phone: String): JSONObject? {
        val key = normalize(phone); if (key.isEmpty()) return null
        val records = read(context)
        for (i in records.length() - 1 downTo 0) {
            val item = records.optJSONObject(i) ?: continue
            if (normalize(item.optString("phone")) == key) return item
        }
        return null
    }
    @Synchronized fun getAll(context: Context): JSONArray = read(context)

    private fun read(context: Context): JSONArray = try {
        val text = context.openFileInput(FILE_NAME).bufferedReader(Charsets.UTF_8).use { it.readText() }
        JSONArray(text)
    } catch (_: Exception) { JSONArray() }
    private fun normalize(value: String): String = value.filter { it.isDigit() }
}
