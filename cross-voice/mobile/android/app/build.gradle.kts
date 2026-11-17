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
        versionCode = 2
        versionName = "0.2.0"
        // Configure once for each server deployment, never ask every mobile user.
        // CI can override with -PvoiceSiteOrigin=https://your-pages-domain
        val voiceSite = providers.gradleProperty("voiceSiteOrigin")
            .getOrElse("https://voice-test.sscircle.pages.dev")
        require(voiceSite.matches(Regex("https://[a-zA-Z0-9.-]+(?::[0-9]+)?"))) {
            "voiceSiteOrigin must be an HTTPS origin without path"
        }
        resValue("string", "voice_site_origin", voiceSite)
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

// Reuse the real SSCircle website logo; do not ship a synthetic app icon.
val generatedVoiceRes = layout.buildDirectory.dir("generated/sscircle-voice-res")
android.sourceSets.getByName("main").res.srcDir(generatedVoiceRes)
val copyVoiceLogo by tasks.registering(Copy::class) {
    from(rootProject.file("../../../assets/sscircle-logo.png"))
    into(generatedVoiceRes.map { it.dir("drawable") })
    rename { "sscircle_voice_logo.png" }
}
tasks.named("preBuild") { dependsOn(copyVoiceLogo) }

dependencies {
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
}
