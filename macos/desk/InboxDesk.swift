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
struct Board: Decodable { let stage: String; let revision: Int; let position: Double? }
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
    struct Quote:Decodable { let messageId:String; let text:String; let senderName:String? }
    struct Attachment:Decodable { let name:String? }
    let reply:Quote?
    let attachment:Attachment?
    let is_edited:Bool?
    let localFilePath: String?
    let is_deleted: Bool?
    let sender_name: String?
    let text: String
    let is_from_me: Bool
    let timestamp: String
    let type: String
}
struct Page: Decodable { let messages: [Entry]; let hasMore: Bool }
struct Identity: Decodable {
    struct User: Decodable { let id: String; let revision: Int; let role: String }
    let user: User
}
@MainActor final class Inbox: ObservableObject {
    @Published var logged = false
    @Published var rooms: [Room] = []
    @Published var entries: [Entry] = []
    @Published var selected: String?
    @Published var issue = ""
    @Published var loading = false
    @Published var hasMore = false
    private var loadedRoom: String?
    @Published var admin = false
    var cookies: [HTTPCookie] { session.configuration.httpCookieStorage?.cookies ?? [] }
    private var revision: Int?
    private var session = URLSession(configuration: .ephemeral)
    func clear() {
        session.invalidateAndCancel()
        session = URLSession(configuration: .ephemeral)
        loadedRoom = nil; hasMore = false; admin = false; logged = false; selected = nil; rooms = []; entries = []; issue = ""; revision = nil
    }
    func request(_ path: String, body: [String:Any]? = nil, method:String = "POST") async throws -> Data {
        let active = session
        var request = URLRequest(url: URL(string: "http://localhost:3032" + path)!)
        request.timeoutInterval = 15
        if let body {
            request.httpMethod = method
            request.setValue("http://localhost:3032", forHTTPHeaderField: "Origin")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
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
            admin = identity.user.role == "admin"
            revision = identity.user.revision
            let fresh = try JSONDecoder().decode([Room].self, from: await request("/api/chats"))
            rooms = fresh
            if !fresh.contains(where: { $0.id == selected }) { selected = nil; entries = [] }
            issue = ""
        } catch { if !Task.isCancelled { issue = error.localizedDescription } }
    }
    func read(_ id: String?, older: Bool = false) async {
        guard let room = rooms.first(where: { $0.id == id }) else { return }
        do {
            var cursor = ""
            if older, let first = entries.first {
                var parts = URLComponents()
                parts.queryItems = [URLQueryItem(name:"beforeTimestamp",value:first.timestamp), URLQueryItem(name:"beforeId",value:first.id)]
                cursor = "&" + (parts.percentEncodedQuery ?? "")
            }
            let data = try await request("/api/messages?paginated=1&limit=300&chatId=" + room.id + "&memberCount=" + String(room.member_count) + cursor)
            guard selected == id, !Task.isCancelled else { return }
            let page = try JSONDecoder().decode(Page.self,from:data)
            if older {
                let known = Set(entries.map(\.id))
                entries = page.messages.filter { !known.contains($0.id) } + entries
                hasMore = page.hasMore
            } else if loadedRoom == id, let boundary = page.messages.first?.timestamp, entries.first.map({ $0.timestamp < boundary }) == true {
                entries = entries.filter { $0.timestamp < boundary } + page.messages
            } else {
                entries = page.messages; hasMore = page.hasMore
            }
            loadedRoom = id; issue = ""
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
    @State private var settings = false
    @State private var section = "인박스"
    @State private var page: String?
    @State private var newRoom = ""
    @State private var creating = false
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
                Picker("보기", selection: $section) {
                    ForEach(["인박스","보드","카드"], id: \.self) { Text($0) }
                }.pickerStyle(.segmented).frame(width:260).padding(6)
                Group {
                if section == "인박스" {
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
                        if let room {
                            RoomActions(inbox: inbox, room: room).id(room.id)

                            ScrollViewReader { proxy in
                                ScrollView {
                                    LazyVStack(spacing: 10) {
                                        if inbox.hasMore { Button("이전 대화 불러오기") { Task { await inbox.read(room.id,older:true) } } }
                                        ForEach(inbox.entries) { entry in
                                            VStack(alignment: entry.is_from_me ? .trailing : .leading, spacing: 3) {
                                                Text(entry.is_from_me ? "나" : entry.sender_name ?? "상대").font(.caption.bold())
                                                if let quote = entry.reply {
                                                    Button("↪ " + (quote.senderName ?? "원문") + " · " + quote.text) {
                                                        Task {
                                                            let originalRoom = room.id
                                                            while inbox.selected == originalRoom && !inbox.entries.contains(where:{$0.id == quote.messageId}) && inbox.hasMore {
                                                                let first = inbox.entries.first?.id
                                                                await inbox.read(originalRoom,older:true)
                                                                if first == inbox.entries.first?.id { break }
                                                            }
                                                            if inbox.selected == originalRoom && inbox.entries.contains(where:{$0.id == quote.messageId}) { proxy.scrollTo(quote.messageId,anchor:.center) }
                                                            else { inbox.issue = "원문을 찾지 못했어." }
                                                        }
                                                    }.lineLimit(2)
                                                }
                                                if entry.is_deleted == true { Text("삭제됨 · 원문 보존").font(.caption2) }
                                                if entry.is_edited == true { Text("수정됨").font(.caption2) }
                                                Text(entry.text.isEmpty ? "[첨부]" : entry.text)
                                                    .textSelection(.enabled).padding(9)
                                                    .background(entry.is_from_me ? Color.yellow.opacity(0.32) : Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 9))
                                                if ["photo","image","file","video","audio","multi_photo"].contains(entry.type) || entry.localFilePath != nil {
                                                    Button(entry.localFilePath == nil ? "첨부 다운로드" : "Finder에서 보기") {
                                                        Task { await inbox.reveal(entry, room: room) }
                                                    }
                                                }
                                                Text(entry.timestamp.prefix(16).replacingOccurrences(of: "T", with: " ")).font(.caption2).foregroundStyle(.secondary)
                                            }.frame(maxWidth: .infinity, alignment: entry.is_from_me ? .trailing : .leading).id(entry.id)
                                        }
                                    }.padding()
                                }.background(Color(nsColor: .underPageBackgroundColor))
                                .onChange(of: inbox.entries.isEmpty) { empty in
                                    guard !empty else { return }
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
                }
                } else {
                    ScrollView([.horizontal,.vertical]) {
                        HStack(alignment: .top) {
                            ForEach(Stage.allCases, id: \.self) { stage in
                                VStack(alignment: .leading) {
                                    Text(stage.title).font(.headline)
                                    ForEach(visibleRooms.filter { ($0.board?.stage ?? "new") == stage.rawValue }.sorted { ($0.board?.position ?? 0) < ($1.board?.position ?? 0) }) { room in
                                        VStack(alignment: .leading) {
                                            Button(room.display_name) { inbox.selected = room.id; section = "인박스" }
                                            if section == "카드" { Text("\(room.member_count)명 · 안 읽음 \(room.unread_count)").font(.caption) }
                                            if inbox.admin {
                                                Menu("단계 이동") {
                                                    ForEach(Stage.allCases,id: \.self) { target in
                                                        Button(target.title) { Task { await inbox.move(room, to:target) } }
                                                    }
                                                }
                                            }
                                        }.padding(8).frame(width:170,alignment:.leading).background(.regularMaterial)
                                        .draggable(room.id)
                                        .dropDestination(for:String.self) { ids,_ in
                                            guard inbox.admin, let id = ids.first, id != room.id, let source = inbox.rooms.first(where:{$0.id == id}) else { return false }
                                            Task { await inbox.move(source,to:stage,before:room) }; return true
                                        }
                                    }
                                }.frame(minWidth:175,minHeight:120,alignment:.topLeading)
                                .dropDestination(for:String.self) { ids,_ in
                                    guard inbox.admin, let id = ids.first, let room = inbox.rooms.first(where:{ $0.id == id }) else { return false }
                                    Task { await inbox.move(room,to:stage) }; return true
                                }
                            }
                        }.padding()
                    }
                }
                }.toolbar {
                    Menu("업무 메뉴") {
                        ForEach(["전체 검색","오늘 할 일","요청 목록","내 계정"],id: \.self) { title in Button(title) { page = title } }
                        if inbox.admin { Button("설정") { settings = true }; Button("팀 관리") { page = "팀 관리" }; Button("새 대화") { creating = true } }
                    }
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
        }.sheet(isPresented:$settings) { DeskSettings(inbox:inbox) }.sheet(isPresented: Binding(get: { page != nil && inbox.logged }, set: { if !$0 { page = nil } })) {
            if let title = page {
                VStack { HStack { Text(title).bold(); Spacer(); Button("닫기") { page = nil } }.padding()
                    WorkspacePage(title: title, cookies: inbox.cookies) { id in
                        if let id { inbox.selected = id }; section = "인박스"; page = nil
                    }
                }.frame(minWidth:780,minHeight:550)
            }
        }.alert("새 대화", isPresented:$creating) {
            TextField("대화 이름", text:$newRoom)
            Button("취소",role:.cancel) {}
            Button("추가") {
                Task { do {
                    let data = try await inbox.request("/api/manual-chat",body:["displayName":newRoom])
                    let result = try JSONDecoder().decode([String:String].self,from:data)
                    await inbox.refresh(); inbox.selected = result["id"]; section = "인박스"; newRoom = ""
                } catch { inbox.issue = error.localizedDescription } }
            }
        }.frame(minWidth:600,minHeight:380)
    }
}
@main struct DeskApp: App {
    var body: some Scene { Window("인박스 데스크",id:"main") { Desk() }.defaultSize(width:940,height:640) }
}
