import SwiftUI
import AppKit

extension Inbox {
    func move(_ room:Room, to stage:Stage, before target:Room? = nil) async {
        do {
            var body:[String:Any] = ["chatId":room.id,"stage":stage.rawValue,"revision":room.board?.revision ?? 0]
            if let target {
                var order = rooms.filter { $0.id != room.id && ($0.board?.stage ?? "new") == stage.rawValue }.sorted { ($0.board?.position ?? 0) < ($1.board?.position ?? 0) }
                if let index = order.firstIndex(where:{$0.id == target.id}) {
                    order.insert(room,at:index)
                    body["order"] = order.map { ["id":$0.id,"revision":$0.board?.revision ?? 0] as [String:Any] }
                }
            }
            _ = try await request("/api/board", body:body)
            await refresh()
        } catch { let message = error.localizedDescription; await refresh(); issue = message }
    }
    func reveal(_ entry:Entry, room:Room) async {
        struct Result:Decodable { let path:String; let partial:Bool? }
        do {
            let data = try await request("/api/download-attachment",body:["chatId":room.id,"messageId":entry.id])
            let saved = try JSONDecoder().decode(Result.self,from:data)
            guard selected == room.id else { return }
            NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath:saved.path)])
            if saved.partial == true { issue = "첨부 일부만 저장됐어." }
            await read(room.id)
        } catch { issue = error.localizedDescription }
    }
}

struct RoomActions:View {
    @ObservedObject var inbox:Inbox
    let room:Room
    @State private var days = 2
    @AppStorage("desk.copyScope") private var scope = 0
    @State private var copying = false
    @State private var notice = ""
    var body:some View {
        VStack(alignment:.leading) {
            HStack {
                Picker("복사 범위",selection:$scope) {
                    Text("전체 대화").tag(0)
                    Text("최근 2일").tag(2)
                    Text("최근 7일").tag(7)
                    Text("직접 지정").tag(-1)
                }.labelsHidden().accessibilityLabel("복사 범위").fixedSize()
                if scope == -1 { TextField("일수",value:$days,format:.number).frame(width:42); Text("일") }
                Button("복사") { Task { await copy(all:scope == 0, count:scope == -1 ? days : scope) } }
                    .disabled(copying || (scope == -1 && !(1...3650).contains(days)))
                if copying { ProgressView().controlSize(.small) }
                Text(notice).font(.caption)
            }
        }.padding(8)
    }
    func copy(all:Bool,count:Int) async {
        struct Export:Decodable { let messages:[Entry]; let sourceLine:String; let since:String? }
        copying = true; defer { copying = false }
        do {
            let scope = all ? "all" : "recent"
            let data = try await inbox.request("/api/messages/export?chatId=" + room.id + "&scope=" + scope + "&days=" + String(count))
            let result = try JSONDecoder().decode(Export.self,from:data)
            guard inbox.selected == room.id else { return }
            var merged = [String:Entry]()
            for entry in inbox.entries + result.messages { merged[entry.id] = entry }
            let entries = merged.values.filter { entry in result.since.map { entry.timestamp >= $0 } ?? true }
                .sorted { ($0.timestamp,$0.id) < ($1.timestamp,$1.id) }
            guard !entries.isEmpty else { notice = "복사할 대화 없음"; return }
            let lines = entries.map { entry in
                let sender = entry.is_from_me ? "나" : entry.sender_name ?? "상대"
                let deleted = entry.is_deleted == true ? " (삭제됨, 원문 보존)" : ""
                let body = entry.text.isEmpty ? "[" + entry.type + "]" : entry.text
                return "[" + entry.timestamp + "] " + sender + deleted + ": " + body + (entry.localFilePath.map { " [다운로드됨: " + $0 + "]" } ?? "")
            }
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(lines.joined(separator:"\n") + "\n\n" + result.sourceLine,forType:.string)
            notice = String(entries.count) + "건 복사됨"
        } catch { inbox.issue = error.localizedDescription }
    }
}

struct DeskMemo:View {
    @ObservedObject var inbox:Inbox
    let room:Room
    @State private var expanded = false
    @State private var loaded = false
    @State private var memo = ""
    @State private var notice = ""
    var body:some View {
        VStack(alignment:.leading) {
            Button(expanded ? "⌄  메모 접기":"›  메모 펼치기") { expanded.toggle() }.buttonStyle(.plain)
            if !notice.isEmpty { Text(notice).font(.caption) }
            if expanded {
                TextEditor(text:$memo).frame(height:64).disabled(!loaded || !inbox.admin)
                if inbox.admin {
                    Button("메모 저장") { Task {
                        do { _ = try await inbox.request("/api/memo",body:["chatId":room.id,"content":memo]); notice = "저장됨" }
                        catch { inbox.issue = error.localizedDescription }
                    } }.disabled(!loaded)
                }
            }
        }.padding(8).task(id:expanded) {
            guard expanded && !loaded else { return }
            do {
                let data = try await inbox.request("/api/memo?chatId=" + room.id)
                struct Memo:Decodable { let content:String? }; memo = try JSONDecoder().decode(Memo.self,from:data).content ?? ""
                loaded = true
            } catch { if !Task.isCancelled { inbox.issue = error.localizedDescription } }
        }
    }
}
