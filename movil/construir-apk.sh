#!/usr/bin/env bash

set -euo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$AQUI"

IMAGEN="terracota-android-build"
VOLUMEN_GRADLE="terracota-gradle"
API_URL="${EXPO_PUBLIC_API_URL:-https://servidor-docker.tailfb6291.ts.net:8443/api/v1}"

paso() { echo; echo "==> $1"; }

paso "1/6  Comprobando la firma"
if [ ! -f firma.properties ] || [ ! -f terracota-release.jks ]; then
  cat <<'AYUDA'
Falta la keystore. Para crearla una sola vez:

  CLAVE='pon-aqui-una-clave-larga'
  docker run --rm -u "$(id -u):$(id -g)" -v "$PWD:/app" -w /app terracota-android-build \
    keytool -genkeypair -v -keystore terracota-release.jks -alias terracota \
      -keyalg RSA -keysize 2048 -validity 10000 \
      -storepass "$CLAVE" -keypass "$CLAVE" \
      -dname "CN=Terracota, O=Terracota, C=MX"

  cat > firma.properties <<EOF
  TERRACOTA_STORE_FILE=/app/terracota-release.jks
  TERRACOTA_STORE_PASSWORD=$CLAVE
  TERRACOTA_KEY_ALIAS=terracota
  TERRACOTA_KEY_PASSWORD=$CLAVE
  EOF

IMPORTANTE: guarda los dos archivos fuera del servidor. Android exige firmar
cada actualización con la MISMA clave; si se pierde, no se puede volver a
publicar una actualización de esta aplicación.
AYUDA
  exit 1
fi
set -a; . ./firma.properties; set +a
echo "    firma encontrada"

paso "2/6  Preparando la imagen de compilación"
if docker image inspect "$IMAGEN" >/dev/null 2>&1; then
  echo "    ya existe ($(docker images "$IMAGEN" --format '{{.Size}}'))"
else
  echo "    construyendo (tarda; descarga el SDK de Android)"
  docker build -t "$IMAGEN" -f - . <<'DOCKERFILE'
FROM eclipse-temurin:17-jdk
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl unzip git ca-certificates xz-utils && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://nodejs.org/dist/v20.18.1/node-v20.18.1-linux-x64.tar.xz -o /tmp/n.tar.xz \
    && tar -xJf /tmp/n.tar.xz -C /usr/local --strip-components=1 && rm /tmp/n.tar.xz
ENV ANDROID_HOME=/opt/android-sdk
ENV ANDROID_SDK_ROOT=$ANDROID_HOME
ENV PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools
RUN mkdir -p $ANDROID_HOME/cmdline-tools \
    && curl -fsSLo /tmp/t.zip https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip \
    && unzip -q /tmp/t.zip -d $ANDROID_HOME/cmdline-tools \
    && mv $ANDROID_HOME/cmdline-tools/cmdline-tools $ANDROID_HOME/cmdline-tools/latest && rm /tmp/t.zip
RUN yes | sdkmanager --licenses > /dev/null 2>&1 || true
RUN sdkmanager --install "platform-tools" "platforms;android-35" "platforms;android-36" \
      "build-tools;35.0.0" "build-tools;36.0.0" "ndk;27.1.12297006" "cmake;3.22.1" > /dev/null
ENV GRADLE_USER_HOME=/gradle-home
RUN mkdir -p /gradle-home && chmod 777 /gradle-home $ANDROID_HOME
WORKDIR /app
DOCKERFILE
fi

docker volume create "$VOLUMEN_GRADLE" >/dev/null

en_contenedor() {
  docker run --rm -u "$(id -u):$(id -g)" \
    -e HOME=/tmp -e npm_config_cache=/tmp/.npm -e CI=1 \
    -e GRADLE_USER_HOME=/gradle-home \
    -e EXPO_PUBLIC_API_URL="$API_URL" \
    -v "$AQUI:/app" -v "$VOLUMEN_GRADLE:/gradle-home" \
    -w "$1" "$IMAGEN" "${@:2}"
}

paso "3/6  Generando el proyecto nativo (expo prebuild)"
en_contenedor /app npx expo prebuild --platform android --clean --no-install

paso "4/6  Aplicando la firma de release"
python3 - <<'PY'
import pathlib, sys

ruta = pathlib.Path("android/app/build.gradle")
texto = ruta.read_text(encoding="utf-8")

bloque_firma = """        release {
            if (project.hasProperty('TERRACOTA_STORE_FILE')) {
                storeFile file(project.property('TERRACOTA_STORE_FILE'))
                storePassword project.property('TERRACOTA_STORE_PASSWORD')
                keyAlias project.property('TERRACOTA_KEY_ALIAS')
                keyPassword project.property('TERRACOTA_KEY_PASSWORD')
            }
        }
    }"""

if "TERRACOTA_STORE_FILE" not in texto:
    ancla = """            keyPassword 'android'
        }
    }"""
    if ancla not in texto:
        sys.exit("No se encontró el bloque signingConfigs; revisa la plantilla de Expo.")
    texto = texto.replace(ancla, """            keyPassword 'android'
        }
""" + bloque_firma, 1)

    viejo = "signingConfig signingConfigs.debug\n            def enableShrinkResources"
    nuevo = ("signingConfig project.hasProperty('TERRACOTA_STORE_FILE') "
             "? signingConfigs.release : signingConfigs.debug\n            def enableShrinkResources")
    if viejo not in texto:
        sys.exit("No se encontró el buildType release; revisa la plantilla de Expo.")
    texto = texto.replace(viejo, nuevo, 1)

    ruta.write_text(texto, encoding="utf-8")
    print("    firma de release aplicada")
else:
    print("    ya estaba aplicada")

props = pathlib.Path("android/gradle.properties")
p = props.read_text(encoding="utf-8")
if "-Xmx4096m" not in p:
    import re
    p = re.sub(r"^org\.gradle\.jvmargs=.*$",
               "org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m",
               p, count=1, flags=re.M)
    props.write_text(p, encoding="utf-8")
    print("    memoria de Gradle ampliada a 4 GB")
PY

chmod +x android/gradlew

paso "5/6  Compilando el APK"
echo "    servidor incrustado: $API_URL"
en_contenedor /app/android ./gradlew assembleRelease --no-daemon --console=plain \
  -PTERRACOTA_STORE_FILE="$TERRACOTA_STORE_FILE" \
  -PTERRACOTA_STORE_PASSWORD="$TERRACOTA_STORE_PASSWORD" \
  -PTERRACOTA_KEY_ALIAS="$TERRACOTA_KEY_ALIAS" \
  -PTERRACOTA_KEY_PASSWORD="$TERRACOTA_KEY_PASSWORD"

paso "6/6  Resultado"
ORIGEN="android/app/build/outputs/apk/release/app-release.apk"
VERSION="$(python3 -c "import json;print(json.load(open('app.json'))['expo']['version'])")"
DESTINO="../Terracota-v${VERSION}.apk"

cp "$ORIGEN" "$DESTINO"
echo "    $(cd .. && ls -lh "$(basename "$DESTINO")" | awk '{print $5}')  ->  $(cd .. && pwd)/$(basename "$DESTINO")"

en_contenedor /app sh -c '$ANDROID_HOME/build-tools/35.0.0/apksigner verify --print-certs '"$ORIGEN"' 2>&1 | head -3' \
  | sed 's/^/    /'

echo
echo "Listo."
