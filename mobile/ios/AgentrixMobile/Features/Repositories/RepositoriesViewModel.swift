import Foundation

@MainActor
enum RepositoryDestination: Hashable {
    case dashboard(RepositoryReference)
    case worktree(WorktreeReference)

    var repositoryReference: RepositoryReference {
        switch self {
        case .dashboard(let reference):
            return reference
        case .worktree(let worktree):
            return RepositoryReference(org: worktree.org, repo: worktree.repo)
        }
    }

    var worktreeReference: WorktreeReference? {
        switch self {
        case .dashboard:
            return nil
        case .worktree(let reference):
            return reference
        }
    }
}

@MainActor
final class RepositoriesViewModel: ObservableObject {
    @Published var sections: [RepositorySection] = []
    @Published var selection: RepositoryDestination?
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var sessionSummaries: [WorktreeSessionSummary] = []
    @Published var tasks: [TaskItem] = []

    private let services: ServiceRegistry
    private var streamTask: Task<Void, Never>? = nil
    private var shouldAutoSelectOnNextApply = true

    init(services: ServiceRegistry, enableRealtime: Bool = true) {
        self.services = services
        Task { await loadInitialData() }
        if enableRealtime {
            startRealtimeUpdates()
        }
    }

    deinit {
        streamTask?.cancel()
    }

    var selectedRepository: RepositoryListing? {
        guard let selection else { return nil }
        let reference = selection.repositoryReference
        return repository(reference: reference)
    }

    var selectedWorktree: WorktreeSummary? {
        guard
            let selection,
            case .worktree(let worktreeReference) = selection
        else {
            return nil
        }
        return worktree(reference: worktreeReference)
    }

    func refresh(skipAutoSelection: Bool = false) async {
        shouldAutoSelectOnNextApply = !skipAutoSelection
        await loadInitialData()
    }

    func selectRepository(_ repository: RepositoryListing) {
        let destination = defaultSelection(for: repository)
        if selection == destination {
            selection = nil
        }
        selection = destination
    }

    func selectWorktree(_ worktree: WorktreeSummary) {
        let destination: RepositoryDestination = {
            if worktree.branch.lowercased() == "main" {
                return .dashboard(RepositoryReference(org: worktree.org, repo: worktree.repo))
            }
            return .worktree(WorktreeReference(org: worktree.org, repo: worktree.repo, branch: worktree.branch))
        }()

        if selection == destination {
            selection = nil
        }
        selection = destination
    }

    func setSelection(_ destination: RepositoryDestination?) {
        selection = destination
    }

    func handleWorktreeCreated(_ summary: WorktreeSummary) async {
        selection = .worktree(WorktreeReference(org: summary.org, repo: summary.repo, branch: summary.branch))
        await refresh()
        selection = .worktree(WorktreeReference(org: summary.org, repo: summary.repo, branch: summary.branch))
    }

    func handleWorktreeDeleted(_ summary: WorktreeSummary) async {
        if case .worktree(let reference) = selection, reference.id == summary.id {
            selection = .dashboard(RepositoryReference(org: summary.org, repo: summary.repo))
        }
        await refresh()
    }

    func sessions(for worktree: WorktreeReference) -> WorktreeSessionSummary? {
        sessionSummaries.first { $0.id == worktree.id }
    }

    private func loadInitialData() async {
        isLoading = true
        do {
            let sections = try await services.repositories.fetchRepositories()
            let autoSelect = shouldAutoSelectOnNextApply
            shouldAutoSelectOnNextApply = true
            apply(sections: sections, autoSelect: autoSelect)
            sessionSummaries = try await services.terminal.fetchSessions()
            tasks = try await services.tasks.fetchTasks()
            errorMessage = nil
        } catch let error as AgentrixError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func startRealtimeUpdates() {
        if streamTask != nil { return }
        streamTask = Task {
            for await event in services.events.connect() {
                guard !Task.isCancelled else { break }
                switch event {
                case .repositories(let envelope):
                    let sections = RepositoriesService.makeSections(from: envelope.data)
                    await MainActor.run { self.apply(sections: sections, autoSelect: true) }
                case .sessions(let sessions):
                    await MainActor.run { self.sessionSummaries = sessions }
                case .tasks(let tasks):
                    await MainActor.run { self.tasks = tasks }
                }
            }
        }
    }

    private func apply(sections: [RepositorySection], autoSelect: Bool) {
        self.sections = sections

        guard !sections.isEmpty else {
            selection = nil
            return
        }

        if let selection, isValidSelection(selection) {
            self.selection = selection
            return
        }

        if autoSelect, let fallback = sections.first?.repositories.first.flatMap({ defaultSelection(for: $0) }) {
            selection = fallback
        } else {
            selection = nil
        }
    }

    private func repository(reference: RepositoryReference) -> RepositoryListing? {
        for section in sections {
            if let match = section.repositories.first(where: { $0.id == reference.id }) {
                return match
            }
        }
        return nil
    }

    private func worktree(reference: WorktreeReference) -> WorktreeSummary? {
        for section in sections {
            for repository in section.repositories {
                if let match = repository.worktrees.first(where: { $0.id == reference.id }) {
                    return match
                }
            }
        }
        return nil
    }

    private func defaultSelection(for repository: RepositoryListing) -> RepositoryDestination {
        if repository.branches.contains(where: { $0.lowercased() == "main" }) {
            return .dashboard(RepositoryReference(org: repository.org, repo: repository.name))
        }

        if let firstWorktree = repository.worktrees.first {
            return .worktree(WorktreeReference(org: firstWorktree.org, repo: firstWorktree.repo, branch: firstWorktree.branch))
        }

        return .dashboard(RepositoryReference(org: repository.org, repo: repository.name))
    }

    private func isValidSelection(_ selection: RepositoryDestination) -> Bool {
        switch selection {
        case .dashboard(let reference):
            return repository(reference: reference) != nil
        case .worktree(let worktreeReference):
            return worktree(reference: worktreeReference) != nil
        }
    }
}

