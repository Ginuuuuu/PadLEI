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
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.Map;
import org.json.JSONObject;

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
                saveBlobDownload(url, URLUtil.guessFileName(url, contentDisposition, mimetype), mimetype);
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
        private final Map<String, PendingDownload> pendingDownloads = new HashMap<>();

        @JavascriptInterface
        public boolean saveBase64File(String base64, String fileName, String mimeType) {
            new Thread(() -> {
                try {
                    byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                    File temporaryFile = File.createTempFile("padlei-report-", ".part", getCacheDir());
                    try (OutputStream output = new FileOutputStream(temporaryFile)) {
                        output.write(bytes);
                    }
                    saveTemporaryReport(temporaryFile, fileName, mimeType);
                } catch (Exception error) {
                    showReportSaveError();
                }
            }).start();
            return true;
        }

        @JavascriptInterface
        public synchronized boolean beginBase64File(String transferId, String fileName, String mimeType) {
            cancelBase64File(transferId);
            try {
                File temporaryFile = File.createTempFile("padlei-report-", ".part", getCacheDir());
                pendingDownloads.put(transferId, new PendingDownload(
                    temporaryFile,
                    new FileOutputStream(temporaryFile),
                    fileName,
                    mimeType
                ));
                return true;
            } catch (Exception error) {
                showReportSaveError();
                return false;
            }
        }

        @JavascriptInterface
        public synchronized boolean appendBase64FileChunk(String transferId, String chunk) {
            PendingDownload pending = pendingDownloads.get(transferId);
            if (pending == null) return false;
            try {
                pending.output.write(Base64.decode(chunk, Base64.DEFAULT));
                return true;
            } catch (Exception error) {
                cancelBase64File(transferId);
                showReportSaveError();
                return false;
            }
        }

        @JavascriptInterface
        public synchronized boolean finishBase64File(String transferId) {
            PendingDownload pending = pendingDownloads.remove(transferId);
            if (pending == null) return false;
            try {
                pending.output.close();
                saveTemporaryReport(pending.file, pending.fileName, pending.mimeType);
                return true;
            } catch (Exception error) {
                pending.file.delete();
                showReportSaveError();
                return false;
            }
        }

        @JavascriptInterface
        public synchronized void cancelBase64File(String transferId) {
            PendingDownload pending = pendingDownloads.remove(transferId);
            if (pending == null) return;
            try {
                pending.output.close();
            } catch (Exception ignored) {
            }
            pending.file.delete();
        }

        @JavascriptInterface
        public void reportDownloadError() {
            showReportSaveError();
        }
    }

    private static class PendingDownload {
        final File file;
        final FileOutputStream output;
        final String fileName;
        final String mimeType;

        PendingDownload(File file, FileOutputStream output, String fileName, String mimeType) {
            this.file = file;
            this.output = output;
            this.fileName = fileName;
            this.mimeType = mimeType;
        }
    }

    private void saveBlobDownload(String url, String fileName, String mimeType) {
        String script = "(async function(){try{"
            + "const response=await fetch(" + JSONObject.quote(url) + ");"
            + "const blob=await response.blob();"
            + "const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();"
            + "reader.onload=()=>resolve(String(reader.result||'').split(',')[1]||'');"
            + "reader.onerror=reject;reader.readAsDataURL(blob);});"
            + "const bridge=window.PadLEINative;"
            + "const id='blob-'+Date.now()+'-'+Math.random().toString(36).slice(2);"
            + "if(bridge.beginBase64File&&bridge.appendBase64FileChunk&&bridge.finishBase64File){"
            + "if(!bridge.beginBase64File(id," + JSONObject.quote(fileName) + "," + JSONObject.quote(mimeType) + "))throw new Error();"
            + "for(let offset=0;offset<base64.length;offset+=131072){"
            + "if(!bridge.appendBase64FileChunk(id,base64.slice(offset,offset+131072)))throw new Error();}"
            + "if(!bridge.finishBase64File(id))throw new Error();"
            + "}else{bridge.saveBase64File(base64," + JSONObject.quote(fileName) + "," + JSONObject.quote(mimeType) + ");}"
            + "}catch(error){window.PadLEINative.reportDownloadError();}})();";
        webView.evaluateJavascript(script, null);
    }

    private void saveTemporaryReport(File temporaryFile, String fileName, String mimeType) throws Exception {
        String safeFileName = fileName.replaceAll("[\\\\/:*?\"<>|]", "_");
        String resolvedMimeType = mimeType == null || mimeType.isEmpty() ? "application/pdf" : mimeType;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, safeFileName);
            values.put(MediaStore.Downloads.MIME_TYPE, resolvedMimeType);
            values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/PadLEI");
            values.put(MediaStore.Downloads.IS_PENDING, 1);
            Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new IllegalStateException("Could not create download.");
            try {
                try (
                    FileInputStream input = new FileInputStream(temporaryFile);
                    OutputStream output = getContentResolver().openOutputStream(uri)
                ) {
                    if (output == null) throw new IllegalStateException("Could not open download.");
                    byte[] buffer = new byte[64 * 1024];
                    int count;
                    while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
                }
                ContentValues completed = new ContentValues();
                completed.put(MediaStore.Downloads.IS_PENDING, 0);
                getContentResolver().update(uri, completed, null, null);
            } catch (Exception error) {
                getContentResolver().delete(uri, null, null);
                throw error;
            }
        } else {
            File directory = new File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "PadLEI");
            if (!directory.exists() && !directory.mkdirs()) throw new IllegalStateException("Could not create download folder.");
            try (
                FileInputStream input = new FileInputStream(temporaryFile);
                OutputStream output = new FileOutputStream(new File(directory, safeFileName))
            ) {
                byte[] buffer = new byte[64 * 1024];
                int count;
                while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            }
        }

        temporaryFile.delete();
        runOnUiThread(() -> Toast.makeText(MainActivity.this, "Report saved to Downloads/PadLEI", Toast.LENGTH_LONG).show());
    }

    private void showReportSaveError() {
        runOnUiThread(() -> Toast.makeText(MainActivity.this, "Could not save report.", Toast.LENGTH_LONG).show());
    }

    private boolean openExternallyIfNeeded(String url) {
        Uri uri = Uri.parse(url);
        String scheme = uri.getScheme();
        String host = uri.getHost();
        String appHost = Uri.parse(APP_URL).getHost();

        if (scheme == null) return false;
        if (scheme.equals("blob") || scheme.equals("data")) return true;
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
