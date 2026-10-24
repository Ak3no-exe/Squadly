plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.gametrack.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.gametrack.app"
        minSdk = 29
        targetSdk = 34
        versionCode = System.getenv("VERSION_CODE")?.toIntOrNull() ?: 1
        versionName = System.getenv("VERSION_NAME") ?: "1.0.0"
    }

    // Même clé à chaque version : indispensable pour que la mise à jour s'installe par-dessus l'ancienne.
    signingConfigs {
        create("release") {
            storeFile = file("gametrack.jks")
            storePassword = "gametrack123"
            keyAlias = "gametrack"
            keyPassword = "gametrack123"
        }
    }
    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.webkit:webkit:1.11.0")
}
