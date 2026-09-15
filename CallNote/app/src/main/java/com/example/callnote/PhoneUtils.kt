package com.example.callnote

object PhoneUtils {
    fun format(number: String): String {
        var v = number.filter { it.isDigit() }
        if (v.startsWith("82")) v = "0" + v.substring(2)
        val formatted = when {
            v.length == 11 -> "${v.substring(0, 3)}-${v.substring(3, 7)}-${v.substring(7)}"
            v.length == 10 -> "${v.substring(0, 3)}-${v.substring(3, 6)}-${v.substring(6)}"
            else -> v
        }
        // 발신자표시제한 등 숫자가 아닌 값이 오면 v가 빈 문자열이 될 수 있음 —
        // 이 경우 포맷팅 없이 원본 문자열이라도 그대로 보여주는 게 완전히 숨기는 것보다 나음
        return formatted.ifEmpty { number }
    }
}
