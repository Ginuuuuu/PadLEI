# PadLEI iOS App

iPhone does not install APK files. APK is Android only. The iOS equivalent is an app built with Xcode and exported as an IPA, or installed directly to a connected iPhone from Xcode.

This folder contains an Xcode iOS wrapper for PadLEI. It loads:

```text
https://avn-study.vercel.app
```

## Build Or Install On iPhone

You need a Mac with Xcode.

1. Copy the project to a Mac.
2. Open:

```text
ios/PadLEI.xcodeproj
```

3. In Xcode, select the `PadLEI` target.
4. Open `Signing & Capabilities`.
5. Select your Apple account/team.
6. Connect your iPhone with USB.
7. Select your iPhone as the run device.
8. Click Run.

Xcode will install PadLEI on the iPhone.

## If You Need An IPA File

1. In Xcode, select `Any iOS Device`.
2. Choose `Product > Archive`.
3. When Organizer opens, choose `Distribute App`.
4. Use the option available for your Apple account.

Apple signing rules apply. Without App Store release, direct iPhone installs still require Apple signing through Xcode or an Apple Developer account.

## Login Note

Use email/password login in the iOS app wrapper. Google popup login is hidden in the native iOS wrapper because embedded WebViews often block that flow.

The wrapper uses the persistent default website data store, so login remains available between launches until the user logs out from Settings. PDF uploads use the native file picker, generated PadLEI reports open the iOS share/save sheet, and WhatsApp or email links open externally.
