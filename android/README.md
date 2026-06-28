# PadLEI Android APK

This folder is a native Android wrapper for PadLEI. It builds an APK named `PadLEI` with package id `com.padlei.app`.

By default the APK opens:

```text
https://avn-study.vercel.app
```

To use another live URL, pass `PADLEI_START_URL` when building.

## Build Debug APK

Install Android Studio first. Then open a terminal:

```powershell
cd C:\Project\PadLEI
npm run apk:debug
```

The build helper creates both Gradle's standard file and a clearly named copy:

```text
C:\Project\PadLEI\android\app\build\outputs\apk\debug\app-debug.apk
C:\Project\PadLEI\android\app\build\outputs\apk\debug\PadLEI.apk
```

## Build With A Different Website URL

```powershell
cd C:\Project\PadLEI\android
gradle assembleDebug -PPADLEI_START_URL=https://your-padlei-domain.vercel.app
```

If `gradle` is not recognized, install Android Studio, finish the setup wizard, then install Gradle:

```powershell
cd C:\Project\PadLEI
powershell -ExecutionPolicy Bypass -File scripts\install-gradle-windows.ps1
```

## Install On Phone

1. Send the APK to the Android phone.
2. Open the APK file.
3. Allow install from unknown sources if Android asks.
4. Tap install.
5. Open `PadLEI`.

## Notes

- This is not for Google Play Store.
- This is for direct APK sharing and sideload installation.
- Email/password login is the safest login method inside this APK wrapper.
- Login storage and cookies persist until the user logs out from Settings.
- PDF upload uses the Android file picker.
- Generated reports save to `Downloads/PadLEI`.
- WhatsApp and email links open in their external apps.
- If your live website domain changes, rebuild the APK with the new `PADLEI_START_URL`.
