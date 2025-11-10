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

    let terminalViewModel: TerminalViewModel

    private let services: ServiceRegistry

    init(repository: RepositoryListing, selectedWorktree: WorktreeSummary, services: ServiceRegistry, sessions: [WorktreeSessionSummary], tasks: [TaskItem]) {
        self.repository = repository
        self.worktree = selectedWorktree
        self.services = services
        self.tasks = tasks
        self.terminalViewModel = TerminalViewModel(worktree: WorktreeReference(org: repository.org, repo: repository.name, branch: selectedWorktree.branch), terminalService: services.terminal)
        updateSessions(sessions)
        Task { await refreshAll() }
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
        do {
            dashboard = try await services.dashboard.fetchDashboard(org: repository.org, repo: repository.name)
        } catch {
            errorMessage = AgentrixError.unreachable.errorDescription
        }
        isLoadingDashboard = false
    }

    func loadGitStatus() async {
        isLoadingGitStatus = true
        do {
            gitStatus = try await services.git.fetchStatus(org: worktree.org, repo: worktree.repo, branch: worktree.branch)
        } catch {
            errorMessage = AgentrixError.unreachable.errorDescription
        }
        isLoadingGitStatus = false
    }

    func loadPlans() async {
        do {
            plans = try await services.plans.fetchPlans(org: worktree.org, repo: worktree.repo, branch: worktree.branch)
        } catch {
            errorMessage = AgentrixError.unreachable.errorDescription
        }
    }

    func loadPlanContent(plan: PlanRecord) async {
        do {
            selectedPlan = try await services.plans.fetchPlanContent(org: worktree.org, repo: worktree.repo, branch: worktree.branch, planId: plan.id)
        } catch {
            selectedPlan = nil
            errorMessage = AgentrixError.unreachable.errorDescription
        }
    }

    func loadPorts() async {
        do {
            ports = try await services.ports.fetchPorts()
        } catch {
            errorMessage = AgentrixError.unreachable.errorDescription
        }
    }

    func openTunnel(for port: Int) async {
        do {
            let tunnel = try await services.ports.openTunnel(port: port)
            tunnels = tunnels.filter { $0.port != port } + [tunnel]
        } catch {
            errorMessage = AgentrixError.unreachable.errorDescription
        }
    }

    func updateSessions(_ sessions: [WorktreeSessionSummary]) {
        let target = WorktreeReference(org: worktree.org, repo: worktree.repo, branch: worktree.branch)
        sessionSummary = sessions.first { $0.id == target.id }
    }

    func updateTasks(_ tasks: [TaskItem]) {
        self.tasks = tasks
    }

    func updateRepository(_ repository: RepositoryListing) {
        self.repository = repository
    }
}
