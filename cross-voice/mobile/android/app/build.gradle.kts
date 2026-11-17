plugins {
    id("com.android.application")
}

android {
    namespace = "id.sscircle.voice.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "id.sscircle.voice.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }
    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    packaging {
        resources.excludes += "META-INF/{AL2.0,LGPL2.1}"
    }
}

dependencies {
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
}
