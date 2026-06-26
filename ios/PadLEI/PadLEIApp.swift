import SwiftUI
import UIKit

@main
struct PadLEIApp: App {
    init() {
        UIView.appearance().tintColor = UIColor(red: 22 / 255, green: 32 / 255, blue: 51 / 255, alpha: 1)
    }

    var body: some Scene {
        WindowGroup {
            PadleiWebView(startURL: URL(string: "https://avn-study.vercel.app")!)
                .ignoresSafeArea(.keyboard, edges: .bottom)
        }
    }
}
