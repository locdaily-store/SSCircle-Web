plugins { java }

group = "id.sscircle"
version = "10.49.1.3"

repositories {
    mavenCentral()
    maven("https://repo.papermc.io/repository/maven-public/")
}

dependencies {
    compileOnly("io.papermc.paper:paper-api:26.3.build.+")
}

java { toolchain.languageVersion.set(JavaLanguageVersion.of(25)) }

tasks.withType<JavaCompile>().configureEach {
    options.encoding = "UTF-8"
    options.release.set(21) // Java 21 bytecode, compatible with Paper running Java 25
}

tasks.jar {
    archiveBaseName.set("SSCircle-Skin-Bridge-Paper")
    archiveVersion.set("10.49.1.3")
}
