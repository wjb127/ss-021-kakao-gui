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
            if !fresh.contains(where: { $0.id == selected }) { selected = fresh.first(where: { $0.category == "client" })?.id ?? fresh.first?.id; entries = [] }
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
    @State private var clientsOnly = false
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
                HStack(spacing:12) {
                    Image(systemName:"circle.bottomhalf.filled").foregroundStyle(DeskTheme.forest)
                        .frame(width:32,height:32).background(Color(red:0.875,green:0.925,blue:0.56),in:RoundedRectangle(cornerRadius:9))
                    Text("카카오 인박스").font(.system(size:19,weight:.bold))
                    Spacer()
                    ForEach(["인박스","보드","카드"],id: \.self) { tab in
                        Button(tab) { section = tab }.buttonStyle(.plain).padding(.horizontal,12).padding(.vertical,5)
                            .background(section == tab ? Color.white.opacity(0.16) : .clear,in:RoundedRectangle(cornerRadius:6))
                    }
                    Divider().frame(height:20)
                    Menu {
                        ForEach(["전체 검색","오늘 할 일","요청 목록","내 계정"],id: \.self) { title in Button(title) { page = title } }
                        if inbox.admin { Button("설정") { settings = true }; Button("팀 관리") { page = "팀 관리" }; Button("새 대화") { creating = true } }
                        Divider()
                        Button("새로고침") { Task { await inbox.refresh(); await inbox.read(inbox.selected) } }
                        Button("로그아웃") { Task { _ = try? await inbox.request("/api/auth/logout",body:[:]); inbox.clear() } }
                    } label: { Image(systemName:"ellipsis.circle").font(.title3) }.menuStyle(.borderlessButton).fixedSize().accessibilityLabel("업무 메뉴")
                }.padding(.horizontal,24).frame(height:66).foregroundStyle(.white)
                    .background(section == "보드" ? Color(red:0.16,green:0.145,blue:0.20) : DeskTheme.forest)
                Group {
                if section == "인박스" {
                HSplitView {
                    VStack(alignment:.leading, spacing:10) {
                        Text("대화 목록").font(.system(size:22,weight:.bold))
                        Picker("대화 분류", selection: $clientsOnly) {
                            Text("전체").tag(false)
                            Text("고객").tag(true)
                        }.pickerStyle(.segmented).labelsHidden()
                        HStack { Image(systemName:"magnifyingglass").foregroundStyle(.secondary); TextField("대화방 검색",text:$query).textFieldStyle(.plain) }.padding(9).background(.white,in:RoundedRectangle(cornerRadius:8))
                        HStack {
                            Picker("단계", selection: $stage) {
                                Text("전체 단계").tag(nil as Stage?)
                                ForEach(Stage.allCases, id: \.self) { Text($0.title).tag(Optional($0)) }
                            }.labelsHidden()
                            Toggle("안 읽음", isOn: $unreadOnly).toggleStyle(.button)
                        }
                        ScrollView { LazyVStack(spacing:3) {
                            ForEach(visibleRooms.filter { !clientsOnly || $0.category == "client" }) { r in
                                Button { inbox.selected = r.id } label: {
                                HStack(spacing:10) {
                                    Text(r.display_name == "(unknown)" ? "#" : String(r.display_name.prefix(1))).font(.headline)
                                        .frame(width:36,height:36).background(DeskTheme.tones[Int(r.id.utf8.last ?? 0) % 6].opacity(0.19),in:RoundedRectangle(cornerRadius:12))
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(r.display_name == "(unknown)" ? "이름 없는 대화" : r.display_name).fontWeight(.semibold).lineLimit(1)
                                        Text("\(Stage(rawValue: r.board?.stage ?? "new")?.title ?? "응대필요") · \(r.member_count)명")
                                            .font(.caption).foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    if r.unread_count > 0 { Text(String(r.unread_count)).font(.caption.bold()).padding(4).background(Color.red, in: Capsule()).foregroundColor(.white) }
                                }.padding(8).background(inbox.selected == r.id ? DeskTheme.selected : .clear,in:RoundedRectangle(cornerRadius:9)).contentShape(Rectangle())
                                }.buttonStyle(.plain)
                            }
                        } }
                    }.padding(18).frame(width:285).frame(maxHeight:.infinity,alignment:.topLeading).background(DeskTheme.side)
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
                                                    .background(entry.is_from_me ? DeskTheme.outgoing : DeskTheme.incoming, in: RoundedRectangle(cornerRadius: 9))
                                                if ["photo","image","file","video","audio","multi_photo"].contains(entry.type) || entry.localFilePath != nil {
                                                    Button(entry.localFilePath == nil ? "첨부 다운로드" : "Finder에서 보기") {
                                                        Task { await inbox.reveal(entry, room: room) }
                                                    }
                                                }
                                                Text(entry.timestamp.prefix(16).replacingOccurrences(of: "T", with: " ")).font(.caption2).foregroundStyle(.secondary)
                                            }.frame(maxWidth: .infinity, alignment: entry.is_from_me ? .trailing : .leading).id(entry.id)
                                        }
                                    }.padding()
                                }.background(DeskTheme.paper)
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
                        if let room, inbox.admin, !room.id.hasPrefix("manual_") { DeskComposer(inbox:inbox,room:room).id(room.id) }
                    }.background(DeskTheme.paper).frame(minWidth:355,maxWidth:.infinity,maxHeight:.infinity,alignment:.topLeading)
                    Group {
                        if let room { RoomWork(inbox:inbox,room:room).id(room.id) }
                        else { Text("대화를 선택하면 업무가 표시돼요").foregroundStyle(.secondary) }
                    }.frame(width:285).frame(maxHeight:.infinity)
                        .background(DeskTheme.panel)
                }
                } else {
                    GeometryReader { bounds in
                    let columnWidth = max(160, (bounds.size.width - 72) / 6)
                    ScrollView([.horizontal,.vertical]) {
                        HStack(alignment: .top) {
                            ForEach(Stage.allCases, id: \.self) { stage in
                                VStack(alignment: .leading) {
                                    let column = (section == "보드" ? inbox.rooms : visibleRooms).filter { ($0.board?.stage ?? "new") == stage.rawValue }.sorted { ($0.board?.position ?? 0) < ($1.board?.position ?? 0) }
                                    HStack { Text(stage.title).font(.headline); Spacer(); Text(String(column.count)).foregroundStyle(.secondary) }
                                    ForEach(column) { room in
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
                                        }.padding(10).frame(maxWidth:.infinity,alignment:.leading).background(Color(nsColor:.controlBackgroundColor),in:RoundedRectangle(cornerRadius:8))
                                        .draggable(room.id)
                                        .dropDestination(for:String.self) { ids,_ in
                                            guard inbox.admin, let id = ids.first, id != room.id, let source = inbox.rooms.first(where:{$0.id == id}) else { return false }
                                            Task { await inbox.move(source,to:stage,before:room) }; return true
                                        }
                                    }
                                }.padding(8).frame(width:columnWidth,alignment:.topLeading)
                                .frame(minHeight:max(160,bounds.size.height-32),alignment:.topLeading)
                                .background(Color.purple.opacity(0.075),in:RoundedRectangle(cornerRadius:10))
                                .overlay(alignment:.top) { Capsule().fill(DeskTheme.tones[Stage.allCases.firstIndex(of:stage) ?? 0].opacity(0.65)).frame(height:3).padding(.horizontal,4) }
                                .dropDestination(for:String.self) { ids,_ in
                                    guard inbox.admin, let id = ids.first, let room = inbox.rooms.first(where:{ $0.id == id }) else { return false }
                                    Task { await inbox.move(room,to:stage) }; return true
                                }
                            }
                        }.padding()
                    }
                    }
                }
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
        }.preferredColorScheme(.light).tint(DeskTheme.forest).frame(minWidth:600,minHeight:380)
    }
}
@main struct DeskApp: App {
    var body: some Scene { Window("인박스 데스크",id:"main") { Desk() }.defaultSize(width:1280,height:800) }
}
