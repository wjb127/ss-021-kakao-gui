import SwiftUI
import WebKit

struct WorkspacePage: NSViewRepresentable {
    let title: String
    let cookies: [HTTPCookie]
    let openRoom: (String?) -> Void
    private let routes = ["전체 검색":"/search","오늘 할 일":"/tasks","요청 목록":"/requests","내 계정":"/account","팀 관리":"/admin"]
    func makeCoordinator() -> Coordinator { Coordinator(openRoom) }
    func makeNSView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        let view = WKWebView(frame:.zero, configuration:config)
        view.navigationDelegate = context.coordinator
        Task { @MainActor in
            for cookie in cookies { await config.websiteDataStore.httpCookieStore.setCookie(cookie) }
            if let path = routes[title], let url = URL(string:"http://localhost:3032" + path) {
                view.load(URLRequest(url:url))
            }
        }
        return view
    }
    func updateNSView(_ view:WKWebView,context:Context) {}
    final class Coordinator:NSObject,WKNavigationDelegate {
        let openRoom:(String?) -> Void
        init(_ openRoom:@escaping (String?) -> Void) { self.openRoom = openRoom }
        func webView(_ webView:WKWebView, decidePolicyFor action:WKNavigationAction, decisionHandler:@escaping (WKNavigationActionPolicy)->Void) {
            guard let url = action.request.url, url.scheme == "http", url.host == "localhost", url.port == 3032 else { decisionHandler(.cancel); return }
            if url.path == "/" || url.path.isEmpty {
                decisionHandler(.cancel)
                openRoom(URLComponents(url:url,resolvingAgainstBaseURL:false)?.queryItems?.first(where:{$0.name == "chat"})?.value)
                return
            }
            decisionHandler(.allow)
        }
    }
}
