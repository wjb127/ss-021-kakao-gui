import SwiftUI
import AppKit

enum Stage: String, CaseIterable {
    case new, progress, implemented, reviewed, payment, answered
    var title: String {
        switch self {
        case .new: return "응대필요"
        case .progress: return "구현진행중"
        case .implemented: return "작업완료"
        case .reviewed: return "검수완료"
        case .payment: return "결제필요"
        case .answered: return "응대완료"
        }
    }
}
struct Board: Decodable { let stage: String }
struct Room: Decodable, Identifiable {
    let id: String
    let display_name: String
    let board: Board?
    let category: String?
    let member_count: Int
    let unread_count: Int
}
struct Entry: Decodable, Identifiable {
    let id: String
    let sender_name: String?
    let text: String
    let is_from_me: Bool
    let timestamp: String
    let type: String
}
struct Page: Decodable { let messages: [Entry] }
struct Identity: Decodable {
    struct User: Decodable { let id: String; let revision: Int }
    let user: User
}
@MainActor final class Inbox: ObservableObject {
    @Published var logged = false
    @Published var rooms: [Room] = []
    @Published var entries: [Entry] = []
    @Published var selected: String?
    @Published var issue = ""
    @Published var loading = false
    private var revision: Int?
    private var session = URLSession(configuration: .ephemeral)
    func clear() {
        session.invalidateAndCancel()
        session = URLSession(configuration: .ephemeral)
        logged = false; selected = nil; rooms = []; entries = []; issue = ""; revision = nil
    }
    func request(_ path: String, body: [String:String]? = nil) async throws -> Data {
        let active = session
        var request = URLRequest(url: URL(string: "http://localhost:3032" + path)!)
        request.timeoutInterval = 15
        if let body {
            request.httpMethod = "POST"
            request.setValue("http://localhost:3032", forHTTPHeaderField: "Origin")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(body)
        }
        let (data, response) = try await active.data(for: request)
        guard active === session else { throw CancellationError() }
        let status = (response as? HTTPURLResponse)?.statusCode
        if status == 401 { clear() }
        if status == 403 { entries = [] }
        guard status == 200 else {
            let message = (try? JSONDecoder().decode([String:String].self, from: data))?["error"]
            throw NSError(domain: "Inbox", code: status ?? 0, userInfo: [NSLocalizedDescriptionKey: message ?? "연결을 확인해 주세요."])
        }
        return data
    }
    func login(_ name: String, _ password: String) async {
        loading = true; defer { loading = false }
        do {
            _ = try await request("/api/auth/login", body:["username":name,"password":password])
            logged = true; issue = ""
            await refresh()
        } catch { issue = error.localizedDescription }
    }
    func refresh() async {
        do {
            let identity = try JSONDecoder().decode(Identity.self, from: await request("/api/auth/me"))
            if revision != identity.user.revision { entries = []; selected = nil; rooms = [] }
            revision = identity.user.revision
            let fresh = try JSONDecoder().decode([Room].self, from: await request("/api/chats"))
            rooms = fresh
            if !fresh.contains(where: { $0.id == selected }) { selected = nil; entries = [] }
            issue = ""
        } catch { if !Task.isCancelled { issue = error.localizedDescription } }
    }
    func read(_ id: String?) async {
        guard let room = rooms.first(where: { $0.id == id }) else { return }
        do {
            let data = try await request("/api/messages?paginated=1&limit=300&chatId=" + room.id + "&memberCount=" + String(room.member_count))
            guard selected == id, !Task.isCancelled else { return }
            entries = try JSONDecoder().decode(Page.self, from:data).messages; issue = ""
        } catch { if selected == id && !Task.isCancelled { issue = error.localizedDescription } }
    }
}
struct Desk: View {
    @StateObject private var inbox = Inbox()
    @State private var name = ""
    @State private var password = ""
    @State private var query = ""
    @State private var stage: Stage?
    @State private var unreadOnly = false
    var visibleRooms: [Room] {
        inbox.rooms.filter { room in
            (query.isEmpty || room.display_name.localizedCaseInsensitiveContains(query)) &&
            (!unreadOnly || room.unread_count > 0) &&
            (stage == nil || (room.board?.stage ?? "new") == stage?.rawValue)
        }
    }
    var room: Room? { inbox.rooms.first { $0.id == inbox.selected } }
    var body: some View {
        VStack(spacing:0) {
            if inbox.logged {
                HSplitView {
                    VStack(alignment:.leading, spacing:10) {
                        Text("카카오 인박스").font(.title2.bold())
                        TextField("채팅방 검색", text:$query).textFieldStyle(.roundedBorder)
                        HStack {
                            Picker("단계", selection: $stage) {
                                Text("전체 단계").tag(nil as Stage?)
                                ForEach(Stage.allCases, id: \.self) { Text($0.title).tag(Optional($0)) }
                            }.labelsHidden()
                            Toggle("안 읽음", isOn: $unreadOnly).toggleStyle(.button)
                        }
                        List(selection:$inbox.selected) {
                            ForEach(visibleRooms) { r in
                                HStack {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(r.display_name).lineLimit(1)
                                        Text("\(Stage(rawValue: r.board?.stage ?? "new")?.title ?? "응대필요") · \(r.member_count)명")
                                            .font(.caption).foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    if r.unread_count > 0 { Text(String(r.unread_count)).font(.caption.bold()).padding(4).background(Color.red, in: Capsule()).foregroundColor(.white) }
                                }.tag(r.id)
                            }
                        }.listStyle(.sidebar)
                    }.padding(12).frame(minWidth:210,idealWidth:285,maxWidth:420)
                    VStack(alignment:.leading,spacing:0) {
                        Text(room?.display_name ?? "대화를 선택해 주세요").font(.title2.bold()).padding()
                        Divider()
                        if room != nil {
                            ScrollViewReader { proxy in
                                ScrollView {
                                    LazyVStack(spacing: 10) {
                                        ForEach(inbox.entries) { entry in
                                            VStack(alignment: entry.is_from_me ? .trailing : .leading, spacing: 3) {
                                                Text(entry.is_from_me ? "나" : entry.sender_name ?? "상대").font(.caption.bold())
                                                Text(entry.text.isEmpty ? "[첨부]" : entry.text)
                                                    .textSelection(.enabled).padding(9)
                                                    .background(entry.is_from_me ? Color.yellow.opacity(0.32) : Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 9))
                                                Text(entry.timestamp.prefix(16).replacingOccurrences(of: "T", with: " ")).font(.caption2).foregroundStyle(.secondary)
                                            }.frame(maxWidth: .infinity, alignment: entry.is_from_me ? .trailing : .leading).id(entry.id)
                                        }
                                    }.padding()
                                }.background(Color(nsColor: .underPageBackgroundColor))
                                .onChange(of: inbox.entries.first?.id) { _ in
                                    if let id = inbox.entries.last?.id { proxy.scrollTo(id, anchor: .bottom) }
                                }
                                .overlay(alignment: .bottomTrailing) {
                                    if let id = inbox.entries.last?.id {
                                        Button { proxy.scrollTo(id, anchor: .bottom) } label: { Image(systemName: "arrow.down") }
                                            .help("최신 메시지로 이동").padding()
                                    }
                                }
                            }
                        }
                        Spacer(minLength:0)
                    }.frame(minWidth:320,maxWidth:.infinity,maxHeight:.infinity,alignment:.topLeading)
                }.toolbar {
                    Button("새로고침") { Task { await inbox.refresh(); await inbox.read(inbox.selected) } }
                    Button("로그아웃") { Task { _ = try? await inbox.request("/api/auth/logout",body:[:]); inbox.clear() } }
                }.task(id:inbox.selected) { inbox.entries = []; await inbox.read(inbox.selected) }
                .task { while !Task.isCancelled { do { try await Task.sleep(nanoseconds:15_000_000_000) } catch { return }; await inbox.refresh(); await inbox.read(inbox.selected) } }
            } else {
                VStack(alignment:.leading,spacing:14) {
                    Image(systemName:"tray.2").font(.system(size:32)).foregroundColor(.accentColor)
                    Text("인박스 데스크").font(.largeTitle.bold())
                    Text("팀 계정으로 로그인").foregroundColor(.secondary)
                    TextField("아이디",text:$name)
                    SecureField("비밀번호",text:$password)
                    Button("로그인") { Task { let value = password; password = ""; await inbox.login(name,value) } }
                        .buttonStyle(.borderedProminent).keyboardShortcut(.defaultAction).disabled(name.isEmpty || password.isEmpty || inbox.loading)
                }.textFieldStyle(.roundedBorder).frame(width:275).frame(maxWidth:.infinity,maxHeight:.infinity)
            }
            if !inbox.issue.isEmpty { Text(inbox.issue).foregroundColor(.red).padding(8) }
        }.frame(minWidth:600,minHeight:380)
    }
}
@main struct DeskApp: App {
    var body: some Scene { Window("인박스 데스크",id:"main") { Desk() }.defaultSize(width:940,height:640) }
}
