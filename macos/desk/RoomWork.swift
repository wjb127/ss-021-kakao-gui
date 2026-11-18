import SwiftUI

struct RoomWork:View {
    @ObservedObject var inbox:Inbox
    let room:Room
    struct Item:Codable,Identifiable { var id:String; var title:String; var done:Bool; var sourceId:String? }
    struct Work:Codable {
        var revision = 0, assigneeId = "", nextContact = "", deadline = "", waitingFor = ""
        var items:[Item] = []
    }
    struct Person:Decodable,Identifiable { let id:String; let name:String }
    struct Response:Decodable { let work:Work; let assignees:[Person]? }
    @State private var work = Work()
    @State private var people:[Person] = []
    @State private var ready = false
    @State private var note = ""
    @State private var paths:[String] = []
    @State private var project = ""
    @State private var newItem = ""
    @State private var busy = false
    var body:some View {
        VStack(alignment:.leading) {
            HStack { Text("대화 업무").font(.title2.bold()); Spacer() }
            ScrollView {
                VStack(alignment:.leading,spacing:12) {
                    Text("처리 단계").font(.headline)
                    Menu(Stage(rawValue:room.board?.stage ?? "new")?.title ?? "응대필요") {
                        ForEach(Stage.allCases,id: \.self) { stage in Button(stage.title) { Task { await inbox.move(room,to:stage) } } }
                    }.disabled(!inbox.admin).fixedSize().padding(5).background(DeskTheme.selected,in:RoundedRectangle(cornerRadius:6))
                    Divider()
                    Text("체크리스트").font(.headline)
                }.frame(maxWidth:.infinity,alignment:.leading)

                Form {
                    DisclosureGroup("담당자 · 일정") {
                    Picker("담당자",selection:$work.assigneeId) {
                        Text("미지정").tag("")
                        ForEach(people) { Text($0.name).tag($0.id) }
                    }
                    TextField("다음 연락 (YYYY-MM-DD)",text:$work.nextContact)
                    TextField("마감 (YYYY-MM-DD)",text:$work.deadline)
                    TextField("대기 사항",text:$work.waitingFor)
                    }
                    ForEach($work.items) { $item in
                        HStack { Toggle(item.title,isOn:$item.done); Spacer(); Button("삭제") { work.items.removeAll { $0.id == item.id } } }
                        Picker("원문",selection:$item.sourceId) {
                            Text("선택 안 함").tag(nil as String?)
                            ForEach(inbox.entries) { message in Text(String(message.text.prefix(32))).tag(Optional(message.id)) }
                        }
                    }
                    HStack { TextField("새 할 일",text:$newItem); Button("추가") { work.items.append(Item(id:UUID().uuidString,title:newItem,done:false)); newItem = "" }.disabled(newItem.isEmpty) }
                    Button("업무 저장") { Task { await save() } }
                }.disabled(!inbox.admin || !ready || busy)
                VStack(alignment:.leading) {
                    DisclosureGroup("연결 프로젝트") {
                    ForEach(paths,id: \.self) { path in
                        HStack {
                            Text(path).textSelection(.enabled)
                            if inbox.admin {
                                Button("컨텍스트 저장") { Task { do {
                                    _ = try await inbox.request("/api/save-context", body:["chatId":room.id,"displayName":room.display_name,"projectPath":path]); note = "저장됨"
                                } catch { note = error.localizedDescription } } }
                                Button("연결 해제") { Task { await mapping(path,method:"DELETE") } }
                            }
                        }
                    }
                    if inbox.admin {
                        HStack { TextField("프로젝트 경로",text:$project); Button("연결") { Task { await mapping(project,method:"POST") } }.disabled(project.isEmpty) }
                    }
                    }
                }
                Divider()
                DeskMemo(inbox:inbox,room:room).frame(maxWidth:.infinity,alignment:.leading)
            }
            Text(note).font(.caption)
        }.padding().frame(maxWidth:.infinity,maxHeight:.infinity,alignment:.topLeading).task {
            do {
                let response = try JSONDecoder().decode(Response.self,from:await inbox.request("/api/work?chatId=" + room.id))
                work = response.work; people = response.assignees ?? []; ready = true
                paths = try JSONDecoder().decode([String:[String]].self,from:await inbox.request("/api/project-mapping?chatId=" + room.id))["paths"] ?? []
            } catch { note = error.localizedDescription }
        }
    }
    func mapping(_ path:String, method:String) async {
        do {
            let data = try await inbox.request("/api/project-mapping",body:["chatId":room.id,"projectPath":path],method:method)
            paths = try JSONDecoder().decode([String:[String]].self,from:data)["paths"] ?? []
            project = ""
        } catch { note = error.localizedDescription }
    }
    func save() async {
        busy = true; defer { busy = false }
        do {
            var payload = try JSONSerialization.jsonObject(with:JSONEncoder().encode(work)) as! [String:Any]
            payload["items"] = work.items.map { ["id":$0.id,"title":$0.title,"done":$0.done,"sourceId":$0.sourceId as Any] as [String:Any] }
            let data = try await inbox.request("/api/work",body:["chatId":room.id,"work":payload])
            work = try JSONDecoder().decode(Response.self,from:data).work; note = "저장됨"
        } catch { note = error.localizedDescription }
    }
}
