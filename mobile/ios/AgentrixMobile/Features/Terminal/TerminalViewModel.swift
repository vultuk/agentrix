import Foundation

@MainActor
class TerminalViewModel: ObservableObject {
    enum ConnectionState: Equatable {
        case idle
        case connecting
        case connected
        case closed
        case error(String)
    }

    @Published private(set) var log: String = ""
    @Published private(set) var state: ConnectionState = .idle

    typealias OutputHandler = @Sendable (_ data: Data, _ isFullReplay: Bool) -> Void

    private let worktree: WorktreeReference
    private let service: TerminalService
    private var sessionId: String?
    private var socketTask: URLSessionWebSocketTask?
    private var receiveTask: Task<Void, Never>?
    private var transcript = Data()
    private var outputHandler: OutputHandler?
    private var terminalReady = false
    private var pendingOutput = Data()
    private var controlFilter = ControlSequenceFilter()

    init(worktree: WorktreeReference, terminalService: TerminalService) {
        self.worktree = worktree
        self.service = terminalService
    }

    func attachSession(sessionId: String, initialLog: String) async {
        if self.sessionId != sessionId {
            resetConnection()
        }
        self.sessionId = sessionId
        resetStreamState()
        replaceTranscript(with: initialLog)
        state = .connecting
        do {
            try await openSocket()
        } catch let error as AgentrixError {
            state = .error(error.errorDescription ?? "Terminal connection failed")
        } catch {
            state = .error("Terminal connection failed")
        }
    }

    func disconnect(closeRemote: Bool = true) {
        resetConnection()
        resetStreamState()
        if closeRemote, let sessionId {
            Task { await service.closeTerminal(sessionId: sessionId) }
        }
        state = .closed
    }

    @MainActor
    func setOutputHandler(_ handler: OutputHandler?) {
        outputHandler = handler
        guard let handler else { return }
        if terminalReady {
            if !pendingOutput.isEmpty {
                handler(pendingOutput, true)
                pendingOutput.removeAll(keepingCapacity: false)
            } else if !transcript.isEmpty {
                handler(transcript, true)
            }
        }
    }

    func send(input string: String) async {
        guard let socketTask else { return }
        let payload: [String: Any] = ["type": "input", "data": string]
        if let data = try? JSONSerialization.data(withJSONObject: payload),
           let text = String(data: data, encoding: .utf8) {
            do {
                try await socketTask.send(.string(text))
            } catch {
                state = .error("Terminal input failed")
            }
        }
    }

    func sendResize(cols: Int, rows: Int) async {
        guard let socketTask else { return }
        let payload: [String: Any] = ["type": "resize", "cols": cols, "rows": rows]
        if let data = try? JSONSerialization.data(withJSONObject: payload),
           let text = String(data: data, encoding: .utf8) {
            do {
                try await socketTask.send(.string(text))
            } catch {
                // Resize failures should not break the session; ignore errors silently.
            }
        }
    }

    private func openSocket() async throws {
        guard let sessionId else {
            throw AgentrixError.invalidResponse
        }
        let task = service.makeWebSocketTask(sessionId: sessionId)
        
        // Resume the task to start the connection
        task.resume()
        
        socketTask = task
        state = .connected
        
        receiveTask = Task.detached(priority: .background) { [weak self] in
            do {
                while !Task.isCancelled {
                    let message = try await task.receive()
                    switch message {
                    case .string(let value):
                        await self?.dispatchSocketMessage(value)
                    case .data(let data):
                        // Only process binary data if it can be decoded as UTF-8
                        // handleSocketMessage will validate JSON format
                        if let text = String(data: data, encoding: .utf8) {
                            await self?.dispatchSocketMessage(text)
                        }
                    @unknown default:
                        break
                    }
                }
            } catch {
                await MainActor.run {
                    if let urlError = error as? URLError {
                        switch urlError.code {
                        case .timedOut:
                            self?.state = .error("Terminal connection timed out. Please check your network connection.")
                        case .networkConnectionLost, .notConnectedToInternet:
                            self?.state = .error("Network connection lost. Please check your internet connection.")
                        default:
                            self?.state = .error("Terminal connection error: \(urlError.localizedDescription)")
                        }
                    } else {
                        self?.state = .error("Terminal connection lost: \(error.localizedDescription)")
                    }
                }
            }
        }
    }

    private func dispatchSocketMessage(_ text: String) async {
        await MainActor.run {
            self.handleSocketMessage(text)
        }
    }

    private func resetConnection() {
        receiveTask?.cancel()
        receiveTask = nil
        socketTask?.cancel()
        socketTask = nil
        if state == .connected || state == .connecting {
            state = .idle
        }
    }

    @MainActor
    private func handleSocketMessage(_ text: String) {
        guard let data = text.data(using: .utf8),
              let event = try? JSONDecoder().decode(TerminalEvent.self, from: data) else {
            // Ignore non-JSON messages - backend only sends JSON formatted messages
            // Non-JSON data is likely corrupted or binary data that shouldn't be displayed
            return
        }
        switch event.type {
        case "init":
            if let initLog = event.log {
                replaceTranscript(with: initLog)
            }
        case "ready":
            handleReadyEvent()
        case "output":
            if let chunk = event.chunk {
                appendTranscript(chunk)
            }
        case "exit":
            state = .closed
        case "error":
            state = .error(event.message ?? "Terminal error")
        default:
            break
        }
    }

    @MainActor
    private func replaceTranscript(with text: String) {
        pendingOutput.removeAll(keepingCapacity: true)
        log = ""
        transcript.removeAll(keepingCapacity: true)
        appendTranscript(text, replacing: true)
    }

    @MainActor
    private func appendTranscript(_ text: String, replacing: Bool = false) {
        let delta = TerminalByteStream.encode(text)
        guard !delta.isEmpty else { return }
        let hadPrinted = controlFilter.hasPrintedVisibleGlyph
        let filtered = controlFilter.filter(delta)
        guard !filtered.isEmpty else { return }
        let fragment = String(decoding: filtered, as: UTF8.self)
        if replacing {
            log = fragment
            transcript = filtered
        } else {
            log.append(fragment)
            transcript.append(filtered)
        }
        if terminalReady {
            outputHandler?(filtered, replacing)
            return
        }
        pendingOutput.append(filtered)
        if !hadPrinted && controlFilter.hasPrintedVisibleGlyph {
            markTerminalReady()
        }
    }

    private func handleReadyEvent() {
        markTerminalReady()
    }

    private func flushPendingOutputToHandler() {
        guard terminalReady, let handler = outputHandler else { return }
        if !pendingOutput.isEmpty {
            handler(pendingOutput, true)
            pendingOutput.removeAll(keepingCapacity: false)
        } else if !transcript.isEmpty {
            handler(transcript, true)
        }
    }

    private func resetStreamState() {
        terminalReady = false
        pendingOutput.removeAll(keepingCapacity: true)
        controlFilter.reset()
    }

    private func markTerminalReady() {
        guard !terminalReady else { return }
        terminalReady = true
        flushPendingOutputToHandler()
    }
}

enum TerminalByteStream {
    static func encode(_ text: String) -> Data {
        Data(text.utf8)
    }

    static func decodeInput(_ bytes: ArraySlice<UInt8>) -> String? {
        guard !bytes.isEmpty else { return nil }
        if let direct = String(bytes: bytes, encoding: .utf8) {
            return direct
        }
        let buffer = Array(bytes)
        guard !buffer.isEmpty else { return nil }
        return String(bytes: buffer, encoding: .utf8)
    }

}

struct ControlSequenceFilter {
    private(set) var hasPrintedVisibleGlyph = false

    mutating func reset() {
        hasPrintedVisibleGlyph = false
    }

    mutating func filter(_ data: Data) -> Data {
        guard !data.isEmpty else { return Data() }
        if hasPrintedVisibleGlyph {
            return data
        }
        var printableCount = 0
        var consideredCount = 0
        for byte in data {
            if byte == 0x0a || byte == 0x0d {
                continue
            }
            consideredCount += 1
            if byte >= 0x20 && byte <= 0x7e {
                printableCount += 1
            }
        }
        if printableCount >= 2 || (consideredCount > 0 && Double(printableCount) / Double(max(consideredCount, 1)) >= 0.3) {
            hasPrintedVisibleGlyph = true
            return data
        }
        return Data()
    }
}
