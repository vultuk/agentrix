import Foundation

@MainActor
final class WorktreeDetailViewModel: ObservableObject {
    @Published private(set) var repository: RepositoryListing
    @Published private(set) var worktree: WorktreeSummary
    @Published var dashboard: RepositoryDashboard?
    @Published var isLoadingDashboard = false
    @Published var gitStatus: GitStatusResponse.Status?
    @Published var isLoadingGitStatus = false
    @Published var plans: [PlanRecord] = []
    @Published var selectedPlan: PlanContentResponse.PlanContent?
    @Published var ports: [Int] = []
    @Published var tunnels: [PortTunnel] = []
    @Published var tasks: [TaskItem]
    @Published var sessionSummary: WorktreeSessionSummary?
    @Published var errorMessage: String?
    @Published var isCreatingWorktree = false
    @Published var isDeletingWorktree = false
    @Published private(set) var commandConfig: CommandConfig = .defaults
    @Published private(set) var isLoadingCommandConfig = false
    @Published var selectedTab: WorktreeDetailTab {
        didSet {
            persistSelectedTab()
        }
    }

    lazy var terminalStore: TerminalSessionsStore = {
        let reference = WorktreeReference(org: repository.org, repo: repository.name, branch: worktree.branch)
        return TerminalSessionsStore(
            worktree: reference,
            service: services.terminal,
            setError: { [weak self] error in self?.setError(error) },
            clearError: { [weak self] in
                if self?.errorMessage != AgentrixError.unreachable.errorDescription {
                    self?.errorMessage = nil
                }
            }
        )
    }()

    private let services: ServiceRegistry
    private let worktreeCreatedHandler: (WorktreeSummary) async -> Void
    private let worktreeDeletedHandler: (WorktreeSummary) async -> Void
    private var hasLoadedCommandConfig = false
    private let tabDefaults: UserDefaults
    let shouldAutoConnectTerminal: Bool

    static func tabStorageKey(for worktree: WorktreeSummary) -> String {
        "worktree.selectedTab.\(worktree.org)/\(worktree.repo)/\(worktree.branch)"
    }

    init(
        repository: RepositoryListing,
        selectedWorktree: WorktreeSummary,
        services: ServiceRegistry,
        sessions: [WorktreeSessionSummary],
        tasks: [TaskItem],
        onWorktreeCreated: @escaping (WorktreeSummary) async -> Void,
        onWorktreeDeleted: @escaping (WorktreeSummary) async -> Void = { _ in },
        autoRefreshOnInit: Bool = true,
        autoConnectTerminal: Bool = true,
        userDefaults: UserDefaults = .standard
    ) {
        self.repository = repository
        self.worktree = selectedWorktree
        self.services = services
        self.tasks = tasks
        self.worktreeCreatedHandler = onWorktreeCreated
        self.worktreeDeletedHandler = onWorktreeDeleted
        self.tabDefaults = userDefaults
        self.shouldAutoConnectTerminal = autoConnectTerminal
        self.selectedTab = WorktreeDetailViewModel.restoreSelectedTab(for: selectedWorktree, defaults: userDefaults)
        updateSessions(sessions)
        if autoRefreshOnInit {
            Task { await refreshAll() }
        }
    }

    func refreshAll() async {
        await withTaskGroup(of: Void.self) { group in
            group.addTask { await self.loadDashboard() }
            group.addTask { await self.loadGitStatus() }
            group.addTask { await self.loadPlans() }
            group.addTask { await self.loadPorts() }
        }
    }

    func loadDashboard() async {
        isLoadingDashboard = true
        defer { isLoadingDashboard = false }
        do {
            dashboard = try await services.dashboard.fetchDashboard(org: repository.org, repo: repository.name)
            clearGenericErrorIfNeeded()
        } catch let agentrixError as AgentrixError {
            if agentrixError == .invalidResponse {
                dashboard = nil
                clearGenericErrorIfNeeded()
            } else {
                setError(agentrixError)
            }
        } catch {
            setError(.custom(message: error.localizedDescription))
        }
    }

    func loadGitStatus() async {
        isLoadingGitStatus = true
        defer { isLoadingGitStatus = false }
        do {
            gitStatus = try await services.git.fetchStatus(org: worktree.org, repo: worktree.repo, branch: worktree.branch)
            clearGenericErrorIfNeeded()
        } catch let agentrixError as AgentrixError {
            if agentrixError == .invalidResponse {
                gitStatus = nil
                clearGenericErrorIfNeeded()
            } else {
                setError(agentrixError)
            }
        } catch {
            setError(.custom(message: error.localizedDescription))
        }
    }

    func loadPlans() async {
        do {
            plans = try await services.plans.fetchPlans(org: worktree.org, repo: worktree.repo, branch: worktree.branch)
            clearGenericErrorIfNeeded()
        } catch let agentrixError as AgentrixError {
            if agentrixError == .invalidResponse {
                plans = []
                clearGenericErrorIfNeeded()
            } else {
                setError(agentrixError)
            }
        } catch {
            setError(.custom(message: error.localizedDescription))
        }
    }

    func loadPlanContent(plan: PlanRecord) async {
        do {
            selectedPlan = try await services.plans.fetchPlanContent(org: worktree.org, repo: worktree.repo, branch: worktree.branch, planId: plan.id)
            clearGenericErrorIfNeeded()
        } catch let agentrixError as AgentrixError {
            if agentrixError == .invalidResponse {
                selectedPlan = nil
                clearGenericErrorIfNeeded()
            } else {
                selectedPlan = nil
                setError(agentrixError)
            }
        } catch {
            selectedPlan = nil
            setError(.custom(message: error.localizedDescription))
        }
    }

    func loadPorts() async {
        do {
            ports = try await services.ports.fetchPorts()
            clearGenericErrorIfNeeded()
        } catch let agentrixError as AgentrixError {
            if agentrixError == .invalidResponse {
                ports = []
                clearGenericErrorIfNeeded()
            } else {
                setError(agentrixError)
            }
        } catch {
            setError(.custom(message: error.localizedDescription))
        }
    }

    func openTunnel(for port: Int) async {
        do {
            let tunnel = try await services.ports.openTunnel(port: port)
            tunnels = tunnels.filter { $0.port != port } + [tunnel]
            clearGenericErrorIfNeeded()
        } catch let agentrixError as AgentrixError {
            setError(agentrixError)
        } catch {
            setError(.custom(message: error.localizedDescription))
        }
    }

    func createWorktree(branch: String?, prompt: String?) async -> Bool {
        guard !isCreatingWorktree else { return false }
        isCreatingWorktree = true
        defer { isCreatingWorktree = false }

        do {
            let branchInput = branch?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
            let promptInput = prompt?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
            let response = try await services.worktrees.createWorktree(
                org: repository.org,
                repo: repository.name,
                branch: branchInput,
                prompt: promptInput
            )
            errorMessage = nil
            await refreshAll()
            let serverBranch = response.branch?.nilIfEmpty
            if let resolvedBranch = serverBranch ?? branchInput {
                let summary = WorktreeSummary(org: repository.org, repo: repository.name, branch: resolvedBranch)
                await worktreeCreatedHandler(summary)
            }
            return true
        } catch let error as AgentrixError {
            errorMessage = error.errorDescription
        } catch {
            setError(.custom(message: error.localizedDescription))
        }
        return false
    }

    func fetchIssueDetail(number: Int) async throws -> RepositoryIssueDetailResponse {
        do {
            let detail = try await services.repositories.fetchIssue(org: repository.org, repo: repository.name, number: number)
            clearGenericErrorIfNeeded()
            return detail
        } catch let error as AgentrixError {
            setError(error)
            throw error
        } catch {
            let wrapped = AgentrixError.custom(message: error.localizedDescription)
            setError(wrapped)
            throw wrapped
        }
    }

    func issuePlanPrompt(for detail: RepositoryIssueDetailResponse) -> String {
        let issue = detail.issue
        let replacedTemplate = PlanPromptTemplates.issuePlan.replacingOccurrences(of: "<ISSUE_NUMBER>", with: "\(issue.number)")
        let labelsText = issue.labels.isEmpty ? "None" : issue.labels.map(\.name).joined(separator: ", ")
        let body = issue.body.trimmingCharacters(in: .whitespacesAndNewlines)
        var context = """

        # Issue Context
        Repository: \(detail.org)/\(detail.repo)
        Title: \(issue.title)
        State: \(issue.state ?? "unknown")
        Labels: \(labelsText)
        URL: \(issue.url?.absoluteString ?? "n/a")
        Created: \(issue.createdAt?.formatted() ?? "unknown")
        """

        if !body.isEmpty {
            context += "\n\n\(body)"
        }

        return replacedTemplate + context
    }

    func createPlan(prompt: String) async throws -> String {
        do {
            let plan = try await services.plans.createPlan(prompt: prompt, org: repository.org, repo: repository.name)
            clearGenericErrorIfNeeded()
            return plan
        } catch let error as AgentrixError {
            setError(error)
            throw error
        } catch {
            let wrapped = AgentrixError.custom(message: error.localizedDescription)
            setError(wrapped)
            throw wrapped
        }
    }

    func deleteWorktree() async -> Bool {
        guard !isDeletingWorktree else { return false }
        isDeletingWorktree = true
        defer { isDeletingWorktree = false }

        do {
            try await services.worktrees.deleteWorktree(org: worktree.org, repo: worktree.repo, branch: worktree.branch)
            errorMessage = nil
            terminalStore.suspendConnections()
            await worktreeDeletedHandler(worktree)
            return true
        } catch let error as AgentrixError {
            errorMessage = error.errorDescription
        } catch {
            setError(.custom(message: error.localizedDescription))
        }
        return false
    }

    func fetchDiff(
        path: String,
        previousPath: String?,
        mode: GitDiffMode,
        status: String?
    ) async throws -> GitDiffResponse {
        do {
            let diff = try await services.git.fetchDiff(
                org: worktree.org,
                repo: worktree.repo,
                branch: worktree.branch,
                path: path,
                previousPath: previousPath,
                mode: mode.rawValue,
                status: status
            )
            clearGenericErrorIfNeeded()
            return diff
        } catch let error as AgentrixError {
            setError(error)
            throw error
        } catch {
            let wrapped = AgentrixError.custom(message: error.localizedDescription)
            setError(wrapped)
            throw wrapped
        }
    }

    func loadCommandConfig(force: Bool = false) async {
        if hasLoadedCommandConfig && !force { return }
        if isLoadingCommandConfig { return }
        isLoadingCommandConfig = true
        defer { isLoadingCommandConfig = false }
        do {
            let config = try await services.repositories.fetchCommandConfig()
            commandConfig = config
            hasLoadedCommandConfig = true
            clearGenericErrorIfNeeded()
        } catch let agentrixError as AgentrixError {
            setError(agentrixError)
        } catch {
            setError(.custom(message: error.localizedDescription))
        }
    }

    func updateSessions(_ sessions: [WorktreeSessionSummary]) {
        let target = WorktreeReference(org: worktree.org, repo: worktree.repo, branch: worktree.branch)
        sessionSummary = sessions.first { $0.id == target.id }
        terminalStore.updateWorktree(target)
        terminalStore.sync(with: sessionSummary)
    }

    func updateTasks(_ tasks: [TaskItem]) {
        self.tasks = tasks
    }

    func updateRepository(_ repository: RepositoryListing) {
        self.repository = repository
        let reference = WorktreeReference(org: repository.org, repo: repository.name, branch: worktree.branch)
        terminalStore.updateWorktree(reference)
    }
}

private extension String {
    var nilIfEmpty: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

private extension WorktreeDetailViewModel {
    func setError(_ error: AgentrixError) {
        errorMessage = error.errorDescription
    }

    func clearGenericErrorIfNeeded() {
        if errorMessage == AgentrixError.unreachable.errorDescription {
            errorMessage = nil
        }
    }

    static func restoreSelectedTab(for worktree: WorktreeSummary, defaults: UserDefaults) -> WorktreeDetailTab {
        if
            let rawValue = defaults.string(forKey: tabStorageKey(for: worktree)),
            let stored = WorktreeDetailTab(rawValue: rawValue)
        {
            return stored
        }
        return .terminal
    }

    func persistSelectedTab() {
        tabDefaults.set(selectedTab.rawValue, forKey: Self.tabStorageKey(for: worktree))
    }
}
