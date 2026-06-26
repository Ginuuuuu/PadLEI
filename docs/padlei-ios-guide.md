# PadLEI iOS Guide

There is no APK for iPhone. APK files only work on Android.

For iPhone, use one of these:

- Install the PadLEI website as a Safari home-screen web app.
- Build the iOS wrapper in `ios/PadLEI.xcodeproj` using Xcode on a Mac.
- Export an IPA from Xcode if you have the right Apple signing setup.

## What Is Ready

- iOS Xcode project: `ios/PadLEI.xcodeproj`
- App name: `PadLEI`
- Bundle id: `com.padlei.ios`
- App icon: PadLEI icon generated for iOS sizes
- Website loaded inside app: `https://avn-study.vercel.app`
- Email/password login message for the iOS native app

## Build On Mac

1. Copy this repo to a Mac.
2. Open:

```text
ios/PadLEI.xcodeproj
```

3. Select the `PadLEI` app target.
4. Go to `Signing & Capabilities`.
5. Select your Apple account/team.
6. Connect your iPhone.
7. Select your iPhone at the top of Xcode.
8. Click Run.

This installs PadLEI on your iPhone.

## Export IPA

To make an IPA:

1. In Xcode, select `Any iOS Device`.
2. Choose `Product > Archive`.
3. In Organizer, choose `Distribute App`.
4. Follow Apple's signing flow.

If you are not using the App Store, you still need Apple signing. iOS will not install unsigned app files.

## Easiest iPhone Option Without IPA

Use Safari:

1. Open the PadLEI website in Safari.
2. Tap Share.
3. Tap `Add to Home Screen`.
4. Name it `PadLEI`.

This uses the PWA setup already added to the website.
