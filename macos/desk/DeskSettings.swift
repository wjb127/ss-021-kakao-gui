import SwiftUI

struct DeskSettings:View {
    @ObservedObject var inbox:Inbox
    @Environment(\.dismiss) var dismiss
    @State private var values:[String:String] = [:]
    @State private var ready = false
    @State private var note = ""
    func field(_ key:String) -> Binding<String> {
        Binding(get:{ values[key] ?? "" },set:{ values[key] = $0 })
    }
    func toggle(_ key:String) -> Binding<Bool> {
        Binding(get:{ values[key] == "1" },set:{ values[key] = $0 ? "1":"0" })
    }
    var body:some View {
        Form {
            Toggle("카카오톡 답변 전송 허용",isOn:toggle("send_enabled"))
            Toggle("백그라운드 워커",isOn:toggle("worker_enabled"))
            TextField("확인 주기(초)",text:field("poll_interval_sec"))
            Toggle("텔레그램 알림",isOn:toggle("telegram_enabled"))
            SecureField("봇 토큰",text:field("telegram_bot_token"))
            TextField("채팅 ID",text:field("telegram_chat_id"))
            TextField("인박스 URL",text:field("app_url"))
            HStack {
                Button("채팅 ID 감지") { Task { do {
                    let data = try await inbox.request("/api/telegram/init",body:[:])
                    struct Result:Decodable { let chatId:String }
                    values["telegram_chat_id"] = try JSONDecoder().decode(Result.self,from:data).chatId
                } catch { note = error.localizedDescription } } }
                Button("테스트 알림 보내기") { Task { do {
                    let result = try JSONDecoder().decode([String:Bool].self,from:await inbox.request("/api/test-push",body:[:]))
                    note = result["ok"] == true ? "전송됨":"전송 실패"
                } catch { note = error.localizedDescription } } }
            }.disabled(!ready)
            Text(note)
            HStack {
                Button("닫기") { dismiss() }
                Button("저장") { Task {
                    do { _ = try await inbox.request("/api/settings",body:values); dismiss() } catch { note = error.localizedDescription }
                } }.disabled(!ready)
            }
        }.padding().frame(width:470).task {
            do {
                let settings = try JSONDecoder().decode([String:String].self,from:await inbox.request("/api/settings"))
                values = settings.filter { ["send_enabled","worker_enabled","poll_interval_sec","telegram_enabled","telegram_bot_token","telegram_chat_id","app_url"].contains($0.key) }
                ready = true
            } catch { note = error.localizedDescription }
        }
    }
}
