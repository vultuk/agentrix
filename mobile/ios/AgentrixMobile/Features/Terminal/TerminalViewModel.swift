import Foundation

@MainActor
final class TerminalViewModel: ObservableObject {
    enum ConnectionState: Equatable {
        case idle
        case connecting
        case connected
        case closed
        case error(String)
    }

    @Published var log: String = ""
    @Published var input: String = ""
    @Published private(set) var state: ConnectionState = .idle

    private let worktree: WorktreeReference
    private let service: TerminalService
    private var sessionId: String?
    private var socketTask: URLSessionWebSocketTask?
    private var receiveTask: Task<Void, Never>?

    init(worktree: WorktreeReference, terminalService: TerminalService) {
        self.worktree = worktree
        self.service = terminalService
    }

    func connect() async {
        switch state {
        case .connecting, .connected:
            return
        case .idle, .closed, .error(_):
            break
        }
        state = .connecting
        do {
            let response = try await service.openTerminal(org: worktree.org, repo: worktree.repo, branch: worktree.branch)
            sessionId = response.sessionId
            log = response.log
            try await openSocket()
        } catch let error as AgentrixError {
            state = .error(error.errorDescription ?? "Failed to connect")
        } catch {
            state = .error("Failed to connect")
        }
    }

    func disconnect() {
        receiveTask?.cancel()
        receiveTask = nil
        socketTask?.cancel()
        socketTask = nil
        if let sessionId {
            Task { await service.closeTerminal(sessionId: sessionId) }
        }
        state = .closed
    }

    func sendCurrentInput() {
        let payload = input
        input = ""
        Task { await send(input: payload + "\r") }
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

    private func openSocket() async throws {
        guard let sessionId else {
            throw AgentrixError.invalidResponse
        }
        let task = service.makeWebSocketTask(sessionId: sessionId)
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
                        if let text = String(data: data, encoding: .utf8) {
                            await self?.dispatchSocketMessage(text)
                        }
                    @unknown default:
                        break
                    }
                }
            } catch {
                await MainActor.run {
                    self?.state = .error("Terminal connection lost")
                }
            }
        }
    }

    private func dispatchSocketMessage(_ text: String) async {
        await MainActor.run {
            self.handleSocketMessage(text)
        }
    }

    @MainActor
    private func handleSocketMessage(_ text: String) {
        guard let data = text.data(using: .utf8),
              let event = try? JSONDecoder().decode(TerminalEvent.self, from: data) else {
            log.append(text)
            return
        }
        switch event.type {
        case "init":
            if let initLog = event.log {
                log = initLog
            }
        case "output":
            if let chunk = event.chunk {
                log.append(chunk)
            }
        case "exit":
            state = .closed
        case "error":
            state = .error(event.message ?? "Terminal error")
        default:
            break
        }
    }
}
