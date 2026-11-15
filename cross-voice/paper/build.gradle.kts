plugins { java }
group = "id.sscircle"
version = "0.1.0"
repositories {
    mavenCentral()
    maven("https://repo.papermc.io/repository/maven-public/")
    maven("https://maven.maxhenkel.de/repository/public")
    maven("https://repo.opencollab.dev/main/")
}
dependencies {
    compileOnly("io.papermc.paper:paper-api:26.3.build.+")
    compileOnly("de.maxhenkel.voicechat:voicechat-api:2.6.25")
    compileOnly("org.geysermc.floodgate:api:2.2.5-SNAPSHOT")
    compileOnly("com.google.code.gson:gson:2.11.0")
    testImplementation("org.junit.jupiter:junit-jupiter:5.11.4")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}
java { toolchain.languageVersion.set(JavaLanguageVersion.of(25)) }
tasks.withType<JavaCompile>().configureEach {
    options.encoding = "UTF-8"
    options.release.set(25)
}
tasks.test { useJUnitPlatform() }
tasks.jar {
    archiveBaseName.set("SSCircleCrossVoice")
    archiveVersion.set("")
}
