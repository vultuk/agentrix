import Foundation

@MainActor
enum TerminalSessionTool: String {
    case terminal
    case agent

    var displayName: String {
        switch self {
        case .terminal:
            return "Terminal"
        case .agent:
            return "Agent"
        }
    }

    var kindValue: String {
        switch self {
        case .terminal:
            return "interactive"
        case .agent:
            return "automation"
        }
    }
}

@MainActor
final class TerminalSessionsStore: ObservableObject {
    @Published private(set) var sessions: [WorktreeSessionSnapshot] = []
    @Published private(set) var activeSessionId: String?
    @Published private(set) var activeSessionViewModel: TerminalViewModel?
    @Published private(set) var isOpeningSession = false
    @Published private(set) var closingSessionIds: Set<String> = []

    private var worktree: WorktreeReference
    private let service: TerminalService
    private let setError: (AgentrixError) -> Void
    private let clearError: () -> Void
    private var viewModels: [String: TerminalViewModel] = [:]

    init(
        worktree: WorktreeReference,
        service: TerminalService,
        setError: @escaping (AgentrixError) -> Void,
        clearError: @escaping () -> Void
    ) {
        self.worktree = worktree
        self.service = service
        self.setError = setError
        self.clearError = clearError
    }

    func updateWorktree(_ reference: WorktreeReference) {
        worktree = reference
    }

    func sync(with summary: WorktreeSessionSummary?) {
        let snapshots = summary?.sessions ?? []
        updateSessionsList(with: snapshots)
    }

    func selectSession(id: String) {
        guard activeSessionId != id else { return }
        if let currentId = activeSessionId,
           let currentViewModel = viewModels[currentId] {
            currentViewModel.disconnect(closeRemote: false)
        }
        activeSessionId = id
        activeSessionViewModel = viewModels[id]
        Task { [weak self] in
            guard let self else { return }
            await self.attachActiveSessionIfNeeded(force: false)
        }
    }

    func resumeActiveSession() {
        Task { [weak self] in
            guard let self else { return }
            await self.attachActiveSessionIfNeeded(force: false)
        }
    }

    func suspendConnections() {
        viewModels.values.forEach { $0.disconnect(closeRemote: false) }
    }

    func openNewSession(tool: TerminalSessionTool) async {
        guard !isOpeningSession else { return }
        isOpeningSession = true
        defer { isOpeningSession = false }
        do {
            let response = try await service.openTerminal(
                org: worktree.org,
                repo: worktree.repo,
                branch: worktree.branch,
                command: nil,
                prompt: nil,
                sessionId: nil,
                newSession: true,
                sessionTool: tool.rawValue
            )
            let sessionId = response.sessionId
            let viewModel = viewModels[sessionId] ?? TerminalViewModel(worktree: worktree, terminalService: service)
            viewModels[sessionId] = viewModel
            await viewModel.attachSession(sessionId: sessionId, initialLog: response.log)
            let placeholder = placeholderSnapshot(id: sessionId, tool: tool)
            sessions.removeAll { $0.id == sessionId }
            sessions.append(placeholder)
            activeSessionId = sessionId
            activeSessionViewModel = viewModel
            clearError()
        } catch let error as AgentrixError {
            setError(error)
        } catch {
            setError(.custom(message: error.localizedDescription))
        }
    }

    func closeSession(id: String) async {
        guard !closingSessionIds.contains(id) else { return }
        closingSessionIds.insert(id)
        defer { closingSessionIds.remove(id) }

        do {
            try await service.closeTerminal(sessionId: id)
            if let viewModel = viewModels[id] {
                viewModel.disconnect(closeRemote: false)
            }
            viewModels.removeValue(forKey: id)
            sessions.removeAll { $0.id == id }
            if activeSessionId == id {
                activeSessionId = sessions.first?.id
                activeSessionViewModel = activeSessionId.flatMap { viewModels[$0] }
                if activeSessionId != nil {
                    Task { [weak self] in
                        guard let self else { return }
                        await self.attachActiveSessionIfNeeded(force: false)
                    }
                }
            }
            clearError()
        } catch let error as AgentrixError {
            setError(error)
        } catch {
            setError(.custom(message: error.localizedDescription))
        }
    }

    func reconnectActiveSession() async {
        await attachActiveSessionIfNeeded(force: true)
    }

    private func updateSessionsList(with snapshots: [WorktreeSessionSnapshot]) {
        sessions = snapshots
        let ids = Set(snapshots.map(\.id))

        // Clean up view models for sessions no longer present.
        for id in viewModels.keys where !ids.contains(id) {
            if let viewModel = viewModels[id] {
                viewModel.disconnect(closeRemote: false)
            }
            viewModels.removeValue(forKey: id)
        }

        // Create view models for new sessions.
        for snapshot in snapshots where viewModels[snapshot.id] == nil {
            viewModels[snapshot.id] = TerminalViewModel(worktree: worktree, terminalService: service)
        }

        if let activeId = activeSessionId, !ids.contains(activeId) {
            activeSessionId = nil
            activeSessionViewModel = nil
        }

        if activeSessionId == nil {
            activeSessionId = snapshots.first?.id
        }
        activeSessionViewModel = activeSessionId.flatMap { viewModels[$0] }

        if activeSessionId != nil {
            Task { [weak self] in
                guard let self else { return }
                await self.attachActiveSessionIfNeeded(force: false)
            }
        }
    }

    private func attachActiveSessionIfNeeded(force: Bool) async {
        guard let sessionId = activeSessionId,
              let viewModel = viewModels[sessionId] else { return }
        if !force {
            switch viewModel.state {
            case .connected, .connecting:
                return
            case .idle, .closed, .error:
                break
            }
        } else {
            viewModel.disconnect(closeRemote: false)
        }
        do {
            let response = try await service.openTerminal(
                org: worktree.org,
                repo: worktree.repo,
                branch: worktree.branch,
                command: nil,
                prompt: nil,
                sessionId: sessionId,
                newSession: false,
                sessionTool: nil
            )
            await viewModel.attachSession(sessionId: response.sessionId, initialLog: response.log)
            clearError()
        } catch let error as AgentrixError {
            setError(error)
        } catch {
            setError(.custom(message: error.localizedDescription))
        }
    }

    private func placeholderSnapshot(id: String, tool: TerminalSessionTool) -> WorktreeSessionSnapshot {
        WorktreeSessionSnapshot(
            id: id,
            label: "\(tool.displayName) Session",
            kind: tool.kindValue,
            tool: tool.rawValue,
            idle: false,
            usingTmux: false,
            lastActivityAt: Date(),
            createdAt: Date(),
            tmuxSessionName: nil
        )
    }
}
