import Foundation
import OSLog

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
    private var connectionSequence = 0
    private var activeConnectionLabel: String?
    private let logger = Logger(subsystem: "com.agentrix.mobile", category: "terminal")
    private var worktreeLabel: String {
        "\(worktree.org)/\(worktree.repo)#\(worktree.branch)"
    }

    init(worktree: WorktreeReference, terminalService: TerminalService) {
        self.worktree = worktree
        self.service = terminalService
    }

    func attachSession(sessionId: String, initialLog: String) async {
        if socketTask != nil || receiveTask != nil {
            logger.debug("Resetting terminal connection for \(self.worktreeLabel, privacy: .public)")
            resetConnection()
        }
        if self.sessionId != sessionId {
            logger.debug("Binding session \(sessionId, privacy: .public) to \(self.worktreeLabel, privacy: .public)")
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
    /// Registers the single consumer that feeds bytes into SwiftTerm.
    func setOutputHandler(_ handler: OutputHandler?) {
        outputHandler = handler
        guard handler != nil else { return }
        deliverFullTranscriptIfReady()
    }

    func send(input string: String) async {
        guard let data = string.data(using: .utf8) else { return }
        await send(bytes: data)
    }

    /// Raw terminal input leaves the device through this single path.
    func send(bytes data: Data) async {
        guard let socketTask else { return }
        guard !data.isEmpty else { return }
        do {
            try await socketTask.send(.data(data))
        } catch {
            state = .error("Terminal input failed")
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
        
        connectionSequence += 1
        let label = "ws-\(connectionSequence)-\(sessionId)"
        activeConnectionLabel = label
        logger.debug("Opening terminal connection \(label, privacy: .public) for \(worktreeLabel, privacy: .public)")

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
                        await self?.dispatchBinaryMessage(data)
                    @unknown default:
                        break
                    }
                }
            } catch {
                guard !Task.isCancelled else { return }
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
                    if let label = self?.activeConnectionLabel {
                        self?.logger.error("Terminal connection \(label, privacy: .public) failed: \(error.localizedDescription, privacy: .public)")
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

    private func dispatchBinaryMessage(_ data: Data) async {
        await MainActor.run {
            self.handleBinaryMessage(data)
        }
    }

    private func resetConnection() {
        receiveTask?.cancel()
        receiveTask = nil
        if let label = activeConnectionLabel {
            logger.debug("Closing terminal connection \(label, privacy: .public) for \(worktreeLabel, privacy: .public)")
        }
        socketTask?.cancel()
        socketTask = nil
        activeConnectionLabel = nil
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
                appendTextToTranscript(chunk)
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
        log = text
        transcript = Data(text.utf8)
        deliverFullTranscriptIfReady()
    }

    @MainActor
    private func appendTextToTranscript(_ text: String) {
        guard !text.isEmpty else { return }
        let data = Data(text.utf8)
        log.append(text)
        transcript.append(data)
        if terminalReady, let handler = outputHandler {
            handler(data, false)
        }
    }

    /// Handles binary stdout from tmux/shell and forwards it once to the SwiftTerm view.
    private func handleBinaryMessage(_ data: Data) {
        guard !data.isEmpty else { return }
        transcript.append(data)
        let fragment = String(decoding: data, as: UTF8.self)
        log.append(fragment)
        if terminalReady, let handler = outputHandler {
            handler(data, false)
        }
    }

    private func handleReadyEvent() {
        terminalReady = true
        deliverFullTranscriptIfReady()
    }

    private func resetStreamState() {
        terminalReady = false
        transcript.removeAll(keepingCapacity: true)
        log = ""
    }

    private func deliverFullTranscriptIfReady() {
        guard terminalReady, let handler = outputHandler, !transcript.isEmpty else { return }
        handler(transcript, true)
    }
}
