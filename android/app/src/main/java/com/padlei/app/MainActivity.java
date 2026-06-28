package com.padlei.app;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

public class MainActivity extends Activity {
    private static final int FILE_CHOOSER_REQUEST_CODE = 1001;
    private static final String APP_URL = BuildConfig.PADLEI_START_URL;

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().setStatusBarColor(Color.parseColor("#162033"));
        getWindow().setNavigationBarColor(Color.parseColor("#162033"));

        webView = new WebView(this);
        webView.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        configureWebView(webView);
        setContentView(webView);

        if (savedInstanceState == null) {
            webView.loadUrl(APP_URL);
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    private void configureWebView(WebView view) {
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setSupportMultipleWindows(true);
        settings.setUserAgentString(settings.getUserAgentString() + " PadLEIAndroid");

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
            CookieManager.getInstance().setAcceptThirdPartyCookies(view, true);
        }

        CookieManager.getInstance().setAcceptCookie(true);

        view.setWebViewClient(new PadleiWebViewClient());
        view.setWebChromeClient(new PadleiWebChromeClient());
        view.setDownloadListener(new PadleiDownloadListener());
        view.addJavascriptInterface(new PadleiDownloadBridge(), "PadLEINative");
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }

        super.onBackPressed();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode != FILE_CHOOSER_REQUEST_CODE || filePathCallback == null) return;

        Uri[] results = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
        filePathCallback.onReceiveValue(results);
        filePathCallback = null;
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
            webView = null;
        }

        super.onDestroy();
    }

    private class PadleiWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return openExternallyIfNeeded(url);
        }
    }

    private class PadleiWebChromeClient extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(
            WebView webView,
            ValueCallback<Uri[]> filePathCallback,
            FileChooserParams fileChooserParams
        ) {
            if (MainActivity.this.filePathCallback != null) {
                MainActivity.this.filePathCallback.onReceiveValue(null);
            }

            MainActivity.this.filePathCallback = filePathCallback;

            Intent intent = fileChooserParams.createIntent();
            intent.addCategory(Intent.CATEGORY_OPENABLE);

            try {
                startActivityForResult(intent, FILE_CHOOSER_REQUEST_CODE);
            } catch (ActivityNotFoundException error) {
                MainActivity.this.filePathCallback = null;
                Toast.makeText(MainActivity.this, "No file picker found.", Toast.LENGTH_SHORT).show();
                return false;
            }

            return true;
        }
    }

    private class PadleiDownloadListener implements DownloadListener {
        @Override
        public void onDownloadStart(
            String url,
            String userAgent,
            String contentDisposition,
            String mimetype,
            long contentLength
        ) {
            if (url.startsWith("blob:") || url.startsWith("data:")) {
                Toast.makeText(MainActivity.this, "Preparing report download...", Toast.LENGTH_SHORT).show();
                return;
            }

            try {
                DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                request.setMimeType(mimetype);
                request.addRequestHeader("User-Agent", userAgent);
                String cookies = CookieManager.getInstance().getCookie(url);
                if (cookies != null) request.addRequestHeader("Cookie", cookies);
                request.setTitle(URLUtil.guessFileName(url, contentDisposition, mimetype));
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, URLUtil.guessFileName(url, contentDisposition, mimetype));
                DownloadManager manager = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                manager.enqueue(request);
            } catch (Exception error) {
                openExternalUrl(url);
            }
        }
    }

    private class PadleiDownloadBridge {
        @JavascriptInterface
        public void saveBase64File(String base64, String fileName, String mimeType) {
            new Thread(() -> {
                try {
                    byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                    String safeFileName = fileName.replaceAll("[\\\\/:*?\"<>|]", "_");
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        ContentValues values = new ContentValues();
                        values.put(MediaStore.Downloads.DISPLAY_NAME, safeFileName);
                        values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
                        values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/PadLEI");
                        Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                        if (uri == null) throw new IllegalStateException("Could not create download.");
                        try (OutputStream output = getContentResolver().openOutputStream(uri)) {
                            if (output == null) throw new IllegalStateException("Could not open download.");
                            output.write(bytes);
                        }
                    } else {
                        File directory = new File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "PadLEI");
                        if (!directory.exists() && !directory.mkdirs()) throw new IllegalStateException("Could not create download folder.");
                        try (OutputStream output = new FileOutputStream(new File(directory, safeFileName))) {
                            output.write(bytes);
                        }
                    }
                    runOnUiThread(() -> Toast.makeText(MainActivity.this, "Report saved to Downloads/PadLEI", Toast.LENGTH_LONG).show());
                } catch (Exception error) {
                    runOnUiThread(() -> Toast.makeText(MainActivity.this, "Could not save report.", Toast.LENGTH_LONG).show());
                }
            }).start();
        }
    }

    private boolean openExternallyIfNeeded(String url) {
        Uri uri = Uri.parse(url);
        String scheme = uri.getScheme();
        String host = uri.getHost();
        String appHost = Uri.parse(APP_URL).getHost();

        if (scheme == null) return false;
        if (!scheme.equals("http") && !scheme.equals("https")) {
            return openExternalUrl(url);
        }

        if (host != null && appHost != null && host.equalsIgnoreCase(appHost)) {
            return false;
        }

        if (host != null && (host.equalsIgnoreCase("wa.me") || host.endsWith("whatsapp.com"))) {
            return openExternalUrl(url);
        }

        return false;
    }

    private boolean openExternalUrl(String url) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            startActivity(intent);
            return true;
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, "No app found to open this link.", Toast.LENGTH_SHORT).show();
            return true;
        }
    }
}
