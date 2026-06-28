import SwiftUI
import UIKit
import WebKit

struct PadleiWebView: UIViewRepresentable {
    let startURL: URL

    func makeCoordinator() -> Coordinator {
        Coordinator(startURL: startURL)
    }

    func makeUIView(context: Context) -> WKWebView {
        let preferences = WKWebpagePreferences()
        preferences.allowsContentJavaScript = true

        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences = preferences
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        configuration.userContentController.add(context.coordinator, name: "padleiDownload")

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.configuration.applicationNameForUserAgent = "PadLEIiOS"
        webView.scrollView.contentInsetAdjustmentBehavior = .automatic
        webView.load(URLRequest(url: startURL))

        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
        private let appHost: String

        init(startURL: URL) {
            self.appHost = startURL.host ?? ""
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.name == "padleiDownload",
                  let payload = message.body as? [String: String],
                  let base64 = payload["base64"],
                  let data = Data(base64Encoded: base64),
                  let fileName = payload["fileName"] else {
                return
            }

            let safeName = fileName.replacingOccurrences(of: "/", with: "_")
            let fileURL = FileManager.default.temporaryDirectory.appendingPathComponent(safeName)
            do {
                try data.write(to: fileURL, options: .atomic)
                DispatchQueue.main.async {
                    let controller = UIActivityViewController(activityItems: [fileURL], applicationActivities: nil)
                    guard let root = UIApplication.shared.connectedScenes
                        .compactMap({ ($0 as? UIWindowScene)?.keyWindow })
                        .first?.rootViewController else {
                        return
                    }
                    var presenter = root
                    while let presented = presenter.presentedViewController {
                        presenter = presented
                    }
                    controller.popoverPresentationController?.sourceView = presenter.view
                    presenter.present(controller, animated: true)
                }
            } catch {
                return
            }
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.allow)
                return
            }

            if shouldOpenExternally(url) {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
                return
            }

            decisionHandler(.allow)
        }

        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            if navigationAction.targetFrame == nil, let url = navigationAction.request.url {
                if shouldOpenExternally(url) {
                    UIApplication.shared.open(url)
                } else {
                    webView.load(URLRequest(url: url))
                }
            }

            return nil
        }

        private func shouldOpenExternally(_ url: URL) -> Bool {
            guard let scheme = url.scheme?.lowercased() else {
                return false
            }

            if scheme != "http" && scheme != "https" {
                return true
            }

            guard let host = url.host?.lowercased() else {
                return false
            }

            if host == "wa.me" || host.hasSuffix("whatsapp.com") {
                return true
            }

            return false
        }
    }
}
