import AppKit
import Foundation
import WebKit

private let inboxURL = URL(string: "http://localhost:3032")!
private let launchAgentLabel = "com.kakao-gui"

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate {
    private var window: NSWindow!
    private var webView: WKWebView!
    private var retryCount = 0
    private let maxRetryCount = 30

    func applicationDidFinishLaunching(_ notification: Notification) {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()

        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.setValue(false, forKey: "drawsBackground")

        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1440, height: 920),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = "카카오 인박스"
        window.minSize = NSSize(width: 980, height: 680)
        window.isReleasedWhenClosed = false
        window.center()
        window.delegate = self
        window.contentView = webView
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        showStatus("카카오 인박스를 시작하는 중입니다.")
        ensureServer()
    }

    func applicationDidBecomeActive(_ notification: Notification) {
        if window != nil && !window.isVisible {
            window.makeKeyAndOrderFront(nil)
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag {
            window.makeKeyAndOrderFront(nil)
        }
        return true
    }

    func windowWillClose(_ notification: Notification) {
        NSApp.terminate(nil)
    }

    private func ensureServer() {
        checkHealth { [weak self] isHealthy in
            guard let self else { return }
            if isHealthy {
                DispatchQueue.main.async {
                    self.webView.load(URLRequest(url: inboxURL))
                }
                return
            }

            if self.retryCount == 0 {
                self.restartLaunchAgent()
            }

            guard self.retryCount < self.maxRetryCount else {
                DispatchQueue.main.async {
                    self.showFailure()
                }
                return
            }

            self.retryCount += 1
            DispatchQueue.global().asyncAfter(deadline: .now() + 1) {
                self.ensureServer()
            }
        }
    }

    private func checkHealth(completion: @escaping (Bool) -> Void) {
        var request = URLRequest(url: inboxURL)
        request.timeoutInterval = 2
        URLSession.shared.dataTask(with: request) { _, response, _ in
            let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
            completion((200..<500).contains(statusCode))
        }.resume()
    }

    private func restartLaunchAgent() {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/launchctl")
        process.arguments = ["kickstart", "-k", "gui/\(getuid())/\(launchAgentLabel)"]
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        try? process.run()
    }

    private func showStatus(_ message: String) {
        let html = """
        <!doctype html><meta charset="utf-8">
        <style>
          body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f7f7f5; color: #242424; font: 15px -apple-system, BlinkMacSystemFont, sans-serif; }
          div { text-align: center; }
          progress { width: 180px; accent-color: #3c1e1e; }
        </style>
        <div><progress></progress><p>\(message)</p></div>
        """
        webView.loadHTMLString(html, baseURL: nil)
    }

    private func showFailure() {
        let html = """
        <!doctype html><meta charset="utf-8">
        <style>
          body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f7f7f5; color: #242424; font: 15px -apple-system, BlinkMacSystemFont, sans-serif; }
          div { text-align: center; max-width: 420px; }
          button { border: 0; border-radius: 6px; padding: 10px 16px; background: #3c1e1e; color: white; font: inherit; cursor: pointer; }
        </style>
        <div><h2>카카오 인박스를 열 수 없습니다</h2><p>로컬 서버가 30초 안에 시작되지 않았습니다.</p><button onclick="location.href='kakao-inbox://retry'">다시 시도</button></div>
        """
        webView.loadHTMLString(html, baseURL: nil)
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }

        if url.scheme == "kakao-inbox" {
            retryCount = 0
            showStatus("서버에 다시 연결하는 중입니다.")
            ensureServer()
            decisionHandler(.cancel)
            return
        }

        if url.host == "localhost" || url.scheme == "about" || url.scheme == "data" {
            decisionHandler(.allow)
            return
        }

        if navigationAction.navigationType == .linkActivated {
            NSWorkspace.shared.open(url)
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
        if let url = navigationAction.request.url {
            NSWorkspace.shared.open(url)
        }
        return nil
    }
}

@main
struct KakaoInboxApp {
    static func main() {
        let application = NSApplication.shared
        let delegate = AppDelegate()
        application.delegate = delegate
        application.setActivationPolicy(.regular)
        application.run()
    }
}
