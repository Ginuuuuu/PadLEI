# PadLEI APK Guide

PadLEI now has an Android APK wrapper project in `android/`.

The APK is a normal Android install file. You can share it directly without Google Play Store.

For iPhone, APK will not work. Use `docs/padlei-ios-guide.md`.

## What Is Ready

- Android package name: `com.padlei.app`
- App name: `PadLEI`
- App icon: PadLEI icon generated for Android sizes
- Start website: `https://avn-study.vercel.app`
- PDF upload support through Android file picker
- WhatsApp and external links open outside the WebView when needed
- Build command added: `npm run apk:debug`

## What This Machine Is Missing

This Codex machine does not currently have Java, Gradle, or Android SDK available, so it cannot compile the final `.apk` file here.

Install Android Studio on your Windows machine, then build the APK with the commands below.

## One-Time Setup

1. Install Android Studio.
2. During setup, install:
   - Android SDK Platform 35
   - Android SDK Build-Tools
   - Android SDK Platform-Tools
   - JDK 17 or newer
3. Restart your terminal after installation.

Check that this works:

```powershell
java -version
gradle -v
```

If `gradle -v` is not found, open the `android` folder in Android Studio and use Android Studio's build button.

If `winget install Gradle.Gradle` says no package found, use the included installer script:

```powershell
cd C:\Project\PadLEI
powershell -ExecutionPolicy Bypass -File scripts\install-gradle-windows.ps1
```

After installing, close PowerShell and open it again.

## Build The APK

From the project root:

```powershell
cd C:\Project\PadLEI
npm run apk:debug
```

Or from the Android folder:

```powershell
cd C:\Project\PadLEI\android
gradle assembleDebug
```

The APK will be created here:

```text
C:\Project\PadLEI\android\app\build\outputs\apk\debug\app-debug.apk
```

Rename it to:

```text
PadLEI.apk
```

## If Your Website URL Changes

Build with your final live URL:

```powershell
cd C:\Project\PadLEI\android
gradle assembleDebug -PPADLEI_START_URL=https://your-padlei-domain.vercel.app
```

## Install The APK On Android

1. Send `PadLEI.apk` to the phone.
2. Tap the APK.
3. Allow `Install unknown apps` if Android asks.
4. Tap `Install`.
5. Open `PadLEI`.

## Important

- This APK is not uploaded to Play Store.
- Users install it manually.
- The website must stay live because the APK loads the live PadLEI site.
- Email/password login is recommended inside the APK wrapper.
