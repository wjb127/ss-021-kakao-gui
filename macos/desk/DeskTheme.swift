import SwiftUI

enum DeskTheme {
    static let forest = Color(red:0.133,green:0.220,blue:0.184)
    static let side = Color(red:0.957,green:0.957,blue:0.937)
    static let paper = Color(red:1,green:0.996,blue:0.980)
    static let panel = Color(red:0.980,green:0.980,blue:0.965)
    static let selected = Color(red:0.871,green:0.910,blue:0.851)
    static let incoming = Color(red:0.941,green:0.949,blue:0.925)
    static let outgoing = Color(red:0.875,green:0.925,blue:0.812)
    static let tones:[Color] = [.red,.purple,.teal,.green,.orange,.gray]
}

struct DeskComposer:View {
    @ObservedObject var inbox:Inbox
    let room:Room
    @State private var draft = ""
    @State private var confirming = false
    @State private var busy = false
    var body:some View {
        HStack {
            TextField("답변 입력",text:$draft).textFieldStyle(.plain)
            Button("보내기") { confirming = true }
                .buttonStyle(.borderedProminent).tint(DeskTheme.forest)
                .disabled(busy || draft.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty)
        }.padding(10).background(.white,in:RoundedRectangle(cornerRadius:12))
            .overlay(RoundedRectangle(cornerRadius:12).stroke(DeskTheme.selected))
            .padding(.horizontal,22).padding(.bottom,16)
            .alert("이 대화방에 보낼까?",isPresented:$confirming) {
                Button("취소",role:.cancel) {}
                Button("보내기") { Task {
                    busy = true; defer { busy = false }
                    do { _ = try await inbox.request("/api/send-message",body:["chatId":room.id,"text":draft,"confirmed":true]); draft = ""; await inbox.read(room.id) }
                    catch { inbox.issue = error.localizedDescription }
                } }
            } message: { Text(room.display_name + "\n" + draft) }
    }
}
