#!/usr/bin/env bash
# Force toutes les compilations (debug) à utiliser la même clé de signature.
# À lancer depuis la racine du projet, APRÈS que le dossier android/ existe.
set -e
G=android/app/build.gradle
[ -f "$G" ] || { echo "Introuvable : $G"; exit 1; }
[ -f android/app/debug.keystore ] || { echo "Il manque android/app/debug.keystore"; exit 1; }
if grep -q "gametrack-signing" "$G"; then echo "Signature déjà configurée."; exit 0; fi
cat >> "$G" <<'GRADLE'

// gametrack-signing : même clé à chaque compilation pour pouvoir mettre à jour l'appli
android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
    }
}
GRADLE
echo "Signature configurée dans $G"
