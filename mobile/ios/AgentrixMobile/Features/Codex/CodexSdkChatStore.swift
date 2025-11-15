import Foundation

@MainActor
final class CodexSdkChatStore: ObservableObject {
    enum ConnectionState {
        case idle
        case connecting
        case connected
        case disconnected
    }

    @Published private(set) var sessions: [CodexSdkSessionSummary] = []
    @Published var activeSessionId: String? {
        didSet {
            updateActiveEvents()
        }
    }
    @Published private(set) var eventsBySession: [String: [CodexSdkEvent]] = [:] {
        didSet {
            updateActiveEvents()
        }
    }
    @Published private(set) var connectionStateBySession: [String: ConnectionState] = [:]
    @Published private(set) var lastErrorBySession: [String: String] = [:]
    @Published private(set) var sendingSessionIds: Set<String> = []
    @Published private(set) var isLoading = false
    @Published private(set) var isCreatingSession = false
    @Published private(set) var activeEvents: [CodexSdkEvent] = []

    var activeSession: CodexSdkSessionSummary? {
        guard let id = activeSessionId else { return nil }
        return sessions.first(where: { $0.id == id })
    }

    var currentWorktree: WorktreeReference? {
        worktree
    }

    private func updateActiveEvents() {
        guard let id = activeSessionId else {
            activeEvents = []
            return
        }
        activeEvents = eventsBySession[id] ?? []
    }

    var activeConnectionState: ConnectionState {
        guard let id = activeSessionId else { return .idle }
        return connectionStateBySession[id] ?? .idle
    }

    var activeLastError: String? {
        guard let id = activeSessionId else { return nil }
        return lastErrorBySession[id]
    }

    var isSendingActiveMessage: Bool {
        guard let id = activeSessionId else { return false }
        return sendingSessionIds.contains(id)
    }

    private let service: CodexSdkService
    private let setError: (AgentrixError) -> Void
    private let clearError: () -> Void
    private var worktree: WorktreeReference?
    private var sockets: [String: URLSessionWebSocketTask] = [:]
    private var receiveTasks: [String: Task<Void, Never>] = [:]
    private var hasLoadedInitialSessions = false
    private let socketDecoder: JSONDecoder

    init(service: CodexSdkService, setError: @escaping (AgentrixError) -> Void, clearError: @escaping () -> Void) {
        self.service = service
        self.setError = setError
        self.clearError = clearError
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        self.socketDecoder = decoder
    }

    @MainActor
    deinit {
        closeAllSockets()
    }

    func updateWorktree(_ reference: WorktreeReference?) {
        guard worktree?.id != reference?.id else { return }
        worktree = reference
        hasLoadedInitialSessions = false
        resetState()
    }

    func ensureSessionsLoaded() async {
        guard !hasLoadedInitialSessions else { return }
        _ = await refreshSessions()
    }

    @discardableResult
    func refreshSessions() async -> Bool {
        guard let worktree else { return false }
        if isLoading {
            return false
        }
        isLoading = true
        defer { isLoading = false }
        do {
            let list = try await service.listSessions(org: worktree.org, repo: worktree.repo, branch: worktree.branch)
            applySessions(list)
            hasLoadedInitialSessions = true
            clearError()
            return true
        } catch let error as AgentrixError {
            setError(error)
            return false
        } catch {
            setError(.custom(message: error.localizedDescription))
            return false
        }
    }

    func createSession(label: String? = nil) async -> CodexSdkSessionSummary? {
        guard let worktree else { return nil }
        if isCreatingSession {
            return nil
        }
        isCreatingSession = true
        defer { isCreatingSession = false }
        do {
            let detail = try await service.createSession(org: worktree.org, repo: worktree.repo, branch: worktree.branch, label: label)
            let summary = detail.session
            sessions.append(summary)
            var updatedDict = eventsBySession
            updatedDict[summary.id] = detail.events
            eventsBySession = updatedDict
            syncPendingState(for: summary.id, events: detail.events)
            connectionStateBySession[summary.id] = .idle
            lastErrorBySession[summary.id] = nil
            activeSessionId = summary.id
            connectSocket(for: summary.id)
            clearError()
            return summary
        } catch let error as AgentrixError {
            setError(error)
            return nil
        } catch {
            setError(.custom(message: error.localizedDescription))
            return nil
        }
    }

    func deleteSession(id: String) async {
        guard !id.isEmpty else { return }
        do {
            try await service.deleteSession(sessionId: id)
            removeSession(withId: id)
            clearError()
        } catch let error as AgentrixError {
            setError(error)
        } catch {
            setError(.custom(message: error.localizedDescription))
        }
    }

    @discardableResult
    func sendMessageToActiveSession(_ text: String) async -> Bool {
        guard let sessionId = activeSessionId else { return false }
        return await sendMessage(text, sessionId: sessionId)
    }

    @discardableResult
    func sendMessage(_ text: String, sessionId: String) async -> Bool {
        guard let socket = sockets[sessionId] else {
            setError(.custom(message: "Codex SDK connection is not ready."))
            return false
        }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return false }
        do {
            sendingSessionIds.insert(sessionId)
            lastErrorBySession[sessionId] = nil
            let payload: [String: Any] = [
                "type": "message",
                "text": trimmed
            ]
            let data = try JSONSerialization.data(withJSONObject: payload, options: [])
            guard let rendered = String(data: data, encoding: .utf8) else {
                sendingSessionIds.remove(sessionId)
                return false
            }
            try await socket.send(.string(rendered))
            return true
        } catch let error as AgentrixError {
            sendingSessionIds.remove(sessionId)
            setError(error)
        } catch {
            sendingSessionIds.remove(sessionId)
            setError(.custom(message: error.localizedDescription))
        }
        return false
    }
}

// MARK: - Private helpers

private extension CodexSdkChatStore {
    func resetState() {
        sessions = []
        eventsBySession = [:]
        connectionStateBySession = [:]
        lastErrorBySession = [:]
        sendingSessionIds = []
        activeSessionId = nil
        isLoading = false
        isCreatingSession = false
        closeAllSockets()
    }

    func applySessions(_ list: [CodexSdkSessionSummary]) {
        sessions = list

        var nextEvents = eventsBySession
        var nextStates = connectionStateBySession
        var nextErrors = lastErrorBySession

        let identifiers = Set(list.map(\.id))
        for key in nextEvents.keys where !identifiers.contains(key) {
            nextEvents.removeValue(forKey: key)
        }
        for key in nextStates.keys where !identifiers.contains(key) {
            nextStates.removeValue(forKey: key)
        }
        for key in nextErrors.keys where !identifiers.contains(key) {
            nextErrors.removeValue(forKey: key)
        }
        sendingSessionIds = sendingSessionIds.intersection(identifiers)

        for session in list {
            if nextEvents[session.id] == nil {
                nextEvents[session.id] = []
            }
            if nextStates[session.id] == nil {
                nextStates[session.id] = .idle
            }
        }

        eventsBySession = nextEvents
        connectionStateBySession = nextStates
        lastErrorBySession = nextErrors

        if let current = activeSessionId, !identifiers.contains(current) {
            activeSessionId = list.first?.id
        } else if activeSessionId == nil {
            activeSessionId = list.first?.id
        }

        for session in list {
            connectSocket(for: session.id)
        }
    }

    func connectSocket(for sessionId: String) {
        guard sockets[sessionId] == nil else { return }
        let socket = service.makeWebSocketTask(sessionId: sessionId)
        sockets[sessionId] = socket
        updateConnectionState(sessionId, .connecting)
        socket.resume()
        updateConnectionState(sessionId, .connected)
        receiveTasks[sessionId] = Task.detached(priority: .background) { [weak self] in
            guard let self else { return }
            do {
                while !Task.isCancelled {
                    let message = try await socket.receive()
                    switch message {
                    case .string(let value):
                        if !value.isEmpty {
                            await self.handleSocketMessage(value, sessionId: sessionId)
                        }
                    case .data(let data):
                        if let text = String(data: data, encoding: .utf8), !text.isEmpty {
                            await self.handleSocketMessage(text, sessionId: sessionId)
                        }
                    @unknown default:
                        break
                    }
                }
            } catch {
                await self.handleSocketTermination(for: sessionId)
            }
        }
    }

    func handleSocketMessage(_ text: String, sessionId: String) async {
        guard let data = text.data(using: .utf8) else { return }
        guard let payload = try? socketDecoder.decode(CodexSocketEnvelope.self, from: data) else { return }
        switch payload.type {
        case "history":
            let history = payload.events ?? []
            var updatedDict = eventsBySession
            updatedDict[sessionId] = history
            eventsBySession = updatedDict
            syncPendingState(for: sessionId, events: history)
            let lastTimestamp = history.last?.timestamp
            updateSessionActivity(sessionId: sessionId, timestamp: lastTimestamp)
            lastErrorBySession[sessionId] = nil
        case "event":
            guard let event = payload.event else { return }
            let previous = eventsBySession[sessionId] ?? []
            var updated = previous
            updated.append(event)
            var updatedDict = eventsBySession
            updatedDict[sessionId] = updated
            eventsBySession = updatedDict
            syncPendingState(for: sessionId, events: updated)
            if event.type == .error {
                lastErrorBySession[sessionId] = event.message
            } else if event.type == .agentResponse || event.type == .ready {
                lastErrorBySession[sessionId] = nil
            }
            if event.type == .agentResponse || event.type == .error {
                sendingSessionIds.remove(sessionId)
            }
            updateSessionActivity(sessionId: sessionId, timestamp: event.timestamp)
        case "error":
            if let message = payload.message {
                lastErrorBySession[sessionId] = message
            }
            sendingSessionIds.remove(sessionId)
        default:
            break
        }
    }

    func handleSocketTermination(for sessionId: String) async {
        updateConnectionState(sessionId, .disconnected)
        sockets[sessionId]?.cancel()
        sockets.removeValue(forKey: sessionId)
        receiveTasks[sessionId]?.cancel()
        receiveTasks.removeValue(forKey: sessionId)
    }

    func updateSessionActivity(sessionId: String, timestamp: Date?) {
        guard let timestamp else { return }
        sessions = sessions.map { session in
            guard session.id == sessionId else { return session }
            return session.updating(lastActivityAt: timestamp)
        }
    }

    func updateConnectionState(_ sessionId: String, _ state: ConnectionState) {
        connectionStateBySession[sessionId] = state
    }

    func removeSession(withId sessionId: String) {
        closeSocket(for: sessionId)
        sessions.removeAll { $0.id == sessionId }
        var updatedDict = eventsBySession
        updatedDict.removeValue(forKey: sessionId)
        eventsBySession = updatedDict
        connectionStateBySession.removeValue(forKey: sessionId)
        lastErrorBySession.removeValue(forKey: sessionId)
        sendingSessionIds.remove(sessionId)
        if activeSessionId == sessionId {
            activeSessionId = sessions.first?.id
        }
    }

    func closeSocket(for sessionId: String) {
        sockets[sessionId]?.cancel()
        sockets.removeValue(forKey: sessionId)
        receiveTasks[sessionId]?.cancel()
        receiveTasks.removeValue(forKey: sessionId)
    }

    func closeAllSockets() {
        sockets.values.forEach { $0.cancel() }
        sockets.removeAll()
        receiveTasks.values.forEach { $0.cancel() }
        receiveTasks.removeAll()
    }

    func syncPendingState(for sessionId: String, events: [CodexSdkEvent]) {
        if isTurnPending(events) {
            sendingSessionIds.insert(sessionId)
        } else {
            sendingSessionIds.remove(sessionId)
        }
    }

    func isTurnPending(_ events: [CodexSdkEvent]) -> Bool {
        var pending = false
        for event in events {
            switch event.type {
            case .userMessage:
                pending = true
            case .agentResponse, .error:
                pending = false
            default:
                break
            }
        }
        return pending
    }
}

private struct CodexSocketEnvelope: Decodable {
    let type: String
    let event: CodexSdkEvent?
    let events: [CodexSdkEvent]?
    let message: String?
}
