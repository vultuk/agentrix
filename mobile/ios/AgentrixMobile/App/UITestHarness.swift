#if DEBUG
import SwiftUI

enum UITestScenario {
    case worktreeTabs

    static var current: UITestScenario? {
        let arguments = ProcessInfo.processInfo.arguments
        if arguments.contains("UITests_WorktreeTabs") {
            return .worktreeTabs
        }
        return nil
    }

    @ViewBuilder
    var view: some View {
        switch self {
        case .worktreeTabs:
            WorktreeTabsUITestView()
        }
    }
}

private struct WorktreeTabsUITestView: View {
    private let repository: RepositoryListing
    private let worktree: WorktreeSummary
    private let viewModel: WorktreeDetailViewModel
    private let sessions: [WorktreeSessionSummary]

    init() {
        let repository = RepositoryListing(org: "acme", name: "web", dto: RepositoryDTO(branches: ["main", "feature/demo"], initCommand: ""))
        let worktree = WorktreeSummary(org: repository.org, repo: repository.name, branch: "feature/demo")
        let services = ServiceRegistry.make(baseURL: URL(string: "http://localhost:3414")!)
        let defaults = UserDefaults(suiteName: "AgentrixUITests.tabs") ?? .standard

        let viewModel = WorktreeDetailViewModel(
            repository: repository,
            selectedWorktree: worktree,
            services: services,
            sessions: [],
            tasks: [],
            onWorktreeCreated: { _ in },
            onWorktreeDeleted: { _ in },
            autoRefreshOnInit: false,
            autoConnectTerminal: false,
            userDefaults: defaults
        )

        viewModel.gitStatus = Self.makeSampleGitStatus(worktree: worktree)
        viewModel.plans = Self.makeSamplePlans(branch: worktree.branch)
        viewModel.selectedPlan = Self.makeSamplePlanContent(branch: worktree.branch)
        viewModel.ports = [3000, 9222]
        viewModel.tunnels = [
            PortTunnel(port: 3000, url: URL(string: "https://3000.example.com")!, createdAt: Date())
        ]

        self.repository = repository
        self.worktree = worktree
        self.viewModel = viewModel
        self.sessions = [Self.makeSampleSessionSummary(for: worktree)]
    }

    var body: some View {
        WorktreeDetailView(
            repository: repository,
            worktree: worktree,
            viewModel: viewModel,
            selectionHandler: { _ in },
            logoutAction: {},
            sessions: sessions,
            tasks: []
        )
    }

    private static func makeSampleGitStatus(worktree: WorktreeSummary) -> GitStatusResponse.Status {
        let file = GitFileEntry(path: "Sources/App.swift", status: "M", previousPath: nil, description: "Updated app entry")
        let staged = GitFileCollection(items: [file], total: 1, truncated: false)
        let empty = GitFileCollection(items: [], total: 0, truncated: false)
        let files = GitStatusFiles(staged: staged, unstaged: empty, untracked: empty, conflicts: empty)
        let commits = GitCommitCollection(items: [], total: 0, truncated: false)
        let totals = GitTotals(staged: 1, unstaged: 0, untracked: 0, conflicts: 0)
        return GitStatusResponse.Status(
            fetchedAt: Date(),
            org: worktree.org,
            repo: worktree.repo,
            branch: worktree.branch,
            files: files,
            commits: commits,
            totals: totals
        )
    }

    private static func makeSamplePlans(branch: String) -> [PlanRecord] {
        [
            PlanRecord(id: "PLAN-1", branch: branch, createdAt: Date(timeIntervalSinceNow: -3600)),
            PlanRecord(id: "PLAN-2", branch: branch, createdAt: Date())
        ]
    }

    private static func makeSamplePlanContent(branch: String) -> PlanContentResponse.PlanContent {
        PlanContentResponse.PlanContent(
            id: "PLAN-1",
            branch: branch,
            createdAt: Date(),
            content: """
            - Set up environment
            - Run tests
            - Deploy service
            """
        )
    }

    private static func makeSampleSessionSummary(for worktree: WorktreeSummary) -> WorktreeSessionSummary {
        let snapshot = WorktreeSessionSnapshot(
            id: UUID().uuidString,
            label: "Terminal Session",
            kind: "interactive",
            tool: "terminal",
            idle: false,
            usingTmux: false,
            lastActivityAt: Date(),
            createdAt: Date(),
            tmuxSessionName: "dev"
        )
        return WorktreeSessionSummary(
            org: worktree.org,
            repo: worktree.repo,
            branch: worktree.branch,
            idle: false,
            lastActivityAt: Date(),
            sessions: [snapshot]
        )
    }
}
#endif
