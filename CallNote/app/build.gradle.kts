plugins {
    alias(libs.plugins.android.application)
}

android {
    namespace = "com.example.callnote"
    compileSdk {
        version = release(36) {
            minorApiLevel = 1
        }
    }

    defaultConfig {
        applicationId = "com.example.callnote"
        minSdk = 24
        targetSdk = 36
        versionCode = 1
        // 앱 시작 시 1.5초간 화면에 표시되는 값. 빌드가 실제로 폰에 올라갔는지 확인하려면
        // 여기만 올리면 된다(예: "0.2") - APK 정보와 화면 표시가 항상 같이 바뀐다.
        versionName = "0.5"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildFeatures {
        buildConfig = true // MainActivity가 BuildConfig.VERSION_NAME으로 위 버전을 읽어 쓴다
    }

    buildTypes {
        release {
            optimization {
                enable = false
            }
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
}

// 빌드 결과 APK 파일명. 지정하지 않으면 모듈 이름을 따서 app-debug.apk / app-release.apk가 된다.
// AGP 9는 예전 방식(applicationVariants)이 제거돼 androidComponents로 설정한다.
// outputFileName은 AGP 9.2.1에서 VariantOutput 공개 인터페이스에 있어(8.x에서는 내부
// 클래스 VariantOutputImpl에만 있었다) 내부 API 캐스팅 없이 그대로 쓸 수 있다.
// debug/release는 서로 다른 폴더(outputs/apk/debug, outputs/apk/release)로 나가므로
// 이름이 같아도 덮어쓰지 않는다.
androidComponents {
    onVariants { variant ->
        variant.outputs.forEach { output ->
            output.outputFileName.set("스마트 상담도구.apk")
        }
    }
}

dependencies {
    implementation(libs.androidx.activity.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.constraintlayout)
    implementation(libs.androidx.core.ktx)
    implementation(libs.material)
    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(libs.androidx.junit)
    // 기존 의존성들...
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
    implementation("com.google.code.gson:gson:2.10.1")
    // 하루 4회 상담내역 로컬 캐시 동기화(백그라운드 작업)용
    implementation("androidx.work:work-runtime-ktx:2.9.1")
    // WebView가 file://로 직접 열지 못하는 앱 내부 저장소(캐시) 콘텐츠를
    // 가상 https:// 주소로 서빙하기 위함 (AssetSyncManager 참고)
    implementation("androidx.webkit:webkit:1.17.0")
}

// D:\dodo32 의 DSR계산기/상담일지 화면 파일을 수정 후 빌드하면 APK 번들본(최후 폴백)이
// 항상 최신 상태를 유지하도록 자동 복사. 앱은 평소엔 GitHub에서 직접 받아온 캐시를 우선
// 쓰지만(AssetSyncManager), 캐시가 아예 없는 최초 오프라인 실행 대비용으로 이 번들본도 신선하게 유지한다.
tasks.register<Copy>("syncWebAssets") {
    from("D:/dodo32") {
        include(
            // 상담 탭은 Android 프로젝트 내부 복사본이 아니라 D:\\dodo32 원본을 기준으로 매번 갱신한다.
            "Consult_Main.html",
            "Consult_calculator_logic.js",
            "Consult_calculator_ui.js",
            "Consult_style.css",
            "DSR_Main.html",
            "DSR_calculator_logic.min.js", // DSR_Main.html이 참조하는 건 난독화 버전
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
    }
    into("src/main/assets")
}
// D:\\dodo32 원본이 Android 프로젝트 밖에 있어 Gradle의 파일시각 캐시만으로는
// 원본 갱신을 놓칠 수 있다. 앱 빌드 때마다 웹 자산을 다시 복사해 상담 화면이
// 항상 현재 프로젝트 폴더의 최신 파일을 포함하도록 한다.
tasks.named<Copy>("syncWebAssets") {
    outputs.upToDateWhen { false }
}
tasks.named("preBuild") {
    dependsOn("syncWebAssets")
}



