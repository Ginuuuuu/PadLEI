# PadLEI App Install Guide

PadLEI is now set up as an installable web app. This is called a PWA. It keeps the same website, but users can install it from the browser and open it from the phone or desktop home screen like an app.

If you need a direct Android APK file instead, use `docs/padlei-apk-guide.md`.

## What Is Already Done

- App name is set to `PadLEI`.
- The PadLEI icon is connected for browser tabs, Android install, iPhone home screen, and desktop install.
- A web app manifest is available at `/manifest.webmanifest`.
- A service worker is available at `/sw.js`.
- A safe offline page is available at `/offline.html`.
- Private PDFs and user study data are not cached by the service worker.

## What You Need To Do Before Sharing It

1. Deploy the latest code to your hosting provider, for example Vercel.
2. Make sure the live site opens with `https://`.
3. Open the live site once after deployment and log in.
4. Install it from the browser using the steps below.

The install option usually appears only on the deployed HTTPS website, not always in local development.

## Android Install

1. Open PadLEI in Chrome.
2. Tap the three-dot menu.
3. Tap `Add to Home screen` or `Install app`.
4. Confirm `PadLEI`.
5. Open PadLEI from the new home screen icon.

## iPhone Install

1. Open PadLEI in Safari.
2. Tap the Share button.
3. Tap `Add to Home Screen`.
4. Confirm the name `PadLEI`.
5. Open PadLEI from the new home screen icon.

## Windows Or Laptop Install

1. Open PadLEI in Chrome or Edge.
2. Look for the install icon in the address bar, or open the browser menu.
3. Choose `Install PadLEI`.
4. Open it from the desktop shortcut or Start menu.

## Important Notes

- This does not publish PadLEI to Google Play Store or Apple App Store.
- Users install it directly from your website.
- If the icon does not change immediately, clear browser cache or wait a little because browsers cache app icons strongly.
- If users see Firebase permission errors after deployment, deploy the updated Firebase rules before sharing the app widely.

## Production Checklist

- Run `npm run typecheck`.
- Run `npm run build`.
- Deploy the app.
- Deploy Firebase rules if they changed.
- Test login on the live site.
- Test install on Android Chrome.
- Test install on iPhone Safari if you want iPhone users.
- Test dashboard, upload, study mode, mock test, and history after installing.
