import AppKit
import ApplicationServices
import Foundation

enum SendError: Error, CustomStringConvertible {
    case accessibilityPermission
    case kakaoNotRunning
    case mainWindowNotFound
    case chatListNotFound
    case chatNotFound(String)
    case chatWindowNotFound
    case inputNotFound
    case inputFailed

    var description: String {
        switch self {
        case .accessibilityPermission:
            return "카카오 인박스 실행 프로세스에 macOS 손쉬운 사용 권한이 필요합니다."
        case .kakaoNotRunning:
            return "카카오톡을 실행할 수 없습니다."
        case .mainWindowNotFound:
            return "카카오톡 메인 창을 찾을 수 없습니다."
        case .chatListNotFound:
            return "카카오톡 채팅 목록을 찾을 수 없습니다."
        case .chatNotFound(let name):
            return "채팅방을 찾을 수 없습니다: \(name)"
        case .chatWindowNotFound:
            return "채팅방 창을 열 수 없습니다."
        case .inputNotFound:
            return "메시지 입력창을 찾을 수 없습니다."
        case .inputFailed:
            return "메시지를 입력할 수 없습니다."
        }
    }
}

let bundleId = "com.kakao.KakaoTalkMac"
let profileEnabled = ProcessInfo.processInfo.environment["KAKAO_SEND_PROFILE"] == "1"
let profileStartedAt = Date()

func profile(_ label: String) {
    guard profileEnabled else { return }
    let elapsed = Date().timeIntervalSince(profileStartedAt)
    fputs(String(format: "[%.3fs] %@\n", elapsed, label), stderr)
}

func attribute(_ element: AXUIElement, _ name: String) -> AnyObject? {
    var value: AnyObject?
    let result = AXUIElementCopyAttributeValue(element, name as CFString, &value)
    return result == .success ? value : nil
}

func stringAttribute(_ element: AXUIElement, _ name: String) -> String? {
    attribute(element, name) as? String
}

func children(_ element: AXUIElement) -> [AXUIElement] {
    attribute(element, kAXChildrenAttribute as String) as? [AXUIElement] ?? []
}

func windows(_ app: AXUIElement) -> [AXUIElement] {
    attribute(app, kAXWindowsAttribute as String) as? [AXUIElement] ?? []
}

func role(_ element: AXUIElement) -> String? {
    stringAttribute(element, kAXRoleAttribute as String)
}

func identifier(_ element: AXUIElement) -> String? {
    stringAttribute(element, kAXIdentifierAttribute as String)
}

func findFirst(
    _ element: AXUIElement,
    role targetRole: String,
    identifier targetIdentifier: String,
    depth: Int = 0,
    maxDepth: Int = 4
) -> AXUIElement? {
    guard depth <= maxDepth else { return nil }
    if role(element) == targetRole && identifier(element) == targetIdentifier {
        return element
    }
    for child in children(element) {
        if let found = findFirst(
            child,
            role: targetRole,
            identifier: targetIdentifier,
            depth: depth + 1,
            maxDepth: maxDepth
        ) {
            return found
        }
    }
    return nil
}

func runAppleScript(_ source: String) {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
    process.arguments = ["-e", source]
    process.standardOutput = FileHandle.nullDevice
    process.standardError = FileHandle.nullDevice
    try? process.run()
    process.waitUntilExit()
}

func openMainWindow() throws -> (NSRunningApplication, AXUIElement, AXUIElement) {
    if NSRunningApplication.runningApplications(withBundleIdentifier: bundleId).isEmpty {
        let config = NSWorkspace.OpenConfiguration()
        config.activates = true
        let semaphore = DispatchSemaphore(value: 0)
        NSWorkspace.shared.openApplication(
            at: URL(fileURLWithPath: "/Applications/KakaoTalk.app"),
            configuration: config
        ) { _, _ in semaphore.signal() }
        semaphore.wait()
    }

    guard let runningApp = NSRunningApplication.runningApplications(
        withBundleIdentifier: bundleId
    ).first else {
        throw SendError.kakaoNotRunning
    }

    let app = AXUIElementCreateApplication(runningApp.processIdentifier)
    AXUIElementSetMessagingTimeout(app, 0.5)
    runningApp.activate()

    var mainWindow: AXUIElement?
    let activationDeadline = Date().addingTimeInterval(1.2)
    while mainWindow == nil && Date() < activationDeadline {
        Thread.sleep(forTimeInterval: 0.1)
        mainWindow = windows(app).first { identifier($0) == "Main Window" }
    }

    if mainWindow == nil {
        runAppleScript("""
        tell application "System Events"
            tell process "KakaoTalk"
                set frontmost to true
                delay 0.2
                try
                    click menu bar item 1 of menu bar 2
                    delay 0.2
                    click menu item "카카오톡 열기" of menu 1 of menu bar item 1 of menu bar 2
                end try
            end tell
        end tell
        """)
    }

    let deadline = Date().addingTimeInterval(6)
    while mainWindow == nil && Date() < deadline {
        Thread.sleep(forTimeInterval: 0.2)
        mainWindow = windows(app).first { identifier($0) == "Main Window" }
    }

    guard let mainWindow else { throw SendError.mainWindowNotFound }
    AXUIElementSetMessagingTimeout(app, 2.0)
    return (runningApp, app, mainWindow)
}

func closeExistingChatWindows(_ app: AXUIElement) {
    for window in windows(app) where identifier(window) != "Main Window" {
        guard let closeButton = attribute(window, kAXCloseButtonAttribute as String) else {
            continue
        }
        _ = AXUIElementPerformAction(
            closeButton as! AXUIElement,
            kAXPressAction as CFString
        )
    }
}

func chatListTable(_ mainWindow: AXUIElement) -> AXUIElement? {
    for child in children(mainWindow) where role(child) == "AXScrollArea" {
        for table in children(child) where role(table) == "AXTable" {
            return table
        }
    }
    return nil
}

func chatRow(in table: AXUIElement, name: String, selfChat: Bool) -> AXUIElement? {
    for row in children(table) where role(row) == "AXRow" {
        for cell in children(row) where role(cell) == "AXCell" {
            for child in children(cell) {
                if selfChat && role(child) == "AXImage" {
                    let description = stringAttribute(child, kAXDescriptionAttribute as String) ?? ""
                    if description.contains("badge me") { return row }
                }

                if !selfChat && role(child) == "AXStaticText" && identifier(child) == "_NS:18" {
                    let value = stringAttribute(child, kAXValueAttribute as String) ?? ""
                    if value == name { return row }
                }
            }
        }
    }
    return nil
}

func pressReturn() {
    guard let down = CGEvent(keyboardEventSource: nil, virtualKey: 36, keyDown: true),
          let up = CGEvent(keyboardEventSource: nil, virtualKey: 36, keyDown: false) else {
        return
    }
    down.post(tap: .cghidEventTap)
    up.post(tap: .cghidEventTap)
}

func inputField(in window: AXUIElement) -> AXUIElement? {
    for child in children(window) where role(child) == "AXScrollArea" {
        let childElements = children(child)
        let containsTable = childElements.contains { role($0) == "AXTable" }
        if containsTable { continue }
        if let input = childElements.first(where: { role($0) == "AXTextArea" }) {
            return input
        }
    }
    return nil
}

func send(chatName: String, message: String, selfChat: Bool) throws {
    guard AXIsProcessTrusted() else { throw SendError.accessibilityPermission }

    let (runningApp, app, initialMainWindow) = try openMainWindow()
    profile("메인 창 준비")
    closeExistingChatWindows(app)
    Thread.sleep(forTimeInterval: 0.2)

    let mainWindow = windows(app).first(where: {
        identifier($0) == "Main Window"
    }) ?? initialMainWindow

    if let chatTab = findFirst(
        mainWindow,
        role: "AXButton",
        identifier: "chatrooms"
    ) {
        _ = AXUIElementPerformAction(chatTab, kAXPressAction as CFString)
        Thread.sleep(forTimeInterval: 0.2)
    }

    var table = chatListTable(mainWindow)
    let tableDeadline = Date().addingTimeInterval(3)
    while table == nil && Date() < tableDeadline {
        Thread.sleep(forTimeInterval: 0.2)
        if let currentMainWindow = windows(app).first(where: {
            identifier($0) == "Main Window"
        }) {
            table = chatListTable(currentMainWindow)
        }
    }
    guard let table else {
        throw SendError.chatListNotFound
    }
    profile("채팅 목록 준비")
    guard let row = chatRow(in: table, name: chatName, selfChat: selfChat) else {
        throw SendError.chatNotFound(selfChat ? "나와의 채팅" : chatName)
    }
    profile("대상 방 탐색")

    runningApp.activate()
    _ = AXUIElementPerformAction(mainWindow, kAXRaiseAction as CFString)
    let selected = AXUIElementSetAttributeValue(
        table,
        kAXSelectedRowsAttribute as CFString,
        [row] as CFTypeRef
    )
    guard selected == .success else { throw SendError.chatWindowNotFound }
    pressReturn()

    var openedWindow: AXUIElement?
    let windowDeadline = Date().addingTimeInterval(5)
    while openedWindow == nil && Date() < windowDeadline {
        Thread.sleep(forTimeInterval: 0.2)
        openedWindow = windows(app).first { identifier($0) != "Main Window" }
    }
    guard let openedWindow else { throw SendError.chatWindowNotFound }
    profile("채팅 창 열기")
    guard let input = inputField(in: openedWindow) else { throw SendError.inputNotFound }
    profile("입력창 탐색")

    _ = AXUIElementPerformAction(openedWindow, kAXRaiseAction as CFString)
    _ = AXUIElementSetAttributeValue(input, kAXFocusedAttribute as CFString, true as CFTypeRef)
    let inputResult = AXUIElementSetAttributeValue(
        input,
        kAXValueAttribute as CFString,
        message as CFTypeRef
    )
    guard inputResult == .success else { throw SendError.inputFailed }

    Thread.sleep(forTimeInterval: 0.1)
    pressReturn()
    profile("메시지 입력")
    Thread.sleep(forTimeInterval: 0.2)
    if let closeButton = attribute(openedWindow, kAXCloseButtonAttribute as String) {
        _ = AXUIElementPerformAction(
            closeButton as! AXUIElement,
            kAXPressAction as CFString
        )
    }
}

do {
    let arguments = Array(CommandLine.arguments.dropFirst())
    let selfChat = arguments.first == "--me"
    let values = selfChat ? Array(arguments.dropFirst()) : arguments
    guard values.count == 2 else {
        fputs("사용법: kakao-send.swift [--me] <채팅방 이름> <메시지>\n", stderr)
        exit(2)
    }
    try send(chatName: values[0], message: values[1], selfChat: selfChat)
    print("메시지를 발송했습니다.")
} catch {
    fputs("\(error)\n", stderr)
    exit(1)
}
