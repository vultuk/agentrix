import Foundation

@MainActor
final class RepositoriesViewModel: ObservableObject {
    @Published var sections: [RepositorySection] = []
    @Published var selectedRepositoryID: String?
    @Published var selectedWorktreeID: String?
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var sessionSummaries: [WorktreeSessionSummary] = []
    @Published var tasks: [TaskItem] = []

    private let services: ServiceRegistry
    private var streamTask: Task<Void, Never>? = nil

    init(services: ServiceRegistry) {
        self.services = services
        Task { await loadInitialData() }
        startRealtimeUpdates()
    }

    deinit {
        streamTask?.cancel()
    }

    var selectedRepository: RepositoryListing? {
        guard let id = selectedRepositoryID else { return nil }
        return repository(for: id)
    }

    var selectedWorktree: WorktreeSummary? {
        guard let current = selectedRepository else { return nil }
        return current.worktrees.first { $0.id == selectedWorktreeID } ?? current.worktrees.first
    }

    func refresh() async {
        await loadInitialData()
    }

    func selectRepository(_ repository: RepositoryListing) {
        selectedRepositoryID = repository.id
        if repository.worktrees.isEmpty {
            selectedWorktreeID = nil
        } else if repository.worktrees.contains(where: { $0.id == selectedWorktreeID }) == false {
            selectedWorktreeID = repository.worktrees.first?.id
        }
    }

    func selectWorktree(_ worktree: WorktreeSummary) {
        selectedWorktreeID = worktree.id
    }

    func sessions(for worktree: WorktreeReference) -> WorktreeSessionSummary? {
        sessionSummaries.first { $0.id == worktree.id }
    }

    private func loadInitialData() async {
        isLoading = true
        do {
            let sections = try await services.repositories.fetchRepositories()
            apply(sections: sections)
            sessionSummaries = try await services.terminal.fetchSessions()
            tasks = try await services.tasks.fetchTasks()
            errorMessage = nil
        } catch let error as AgentrixError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = AgentrixError.unreachable.errorDescription
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
                    await MainActor.run { self.apply(sections: sections) }
                case .sessions(let sessions):
                    await MainActor.run { self.sessionSummaries = sessions }
                case .tasks(let tasks):
                    await MainActor.run { self.tasks = tasks }
                }
            }
        }
    }

    private func apply(sections: [RepositorySection]) {
        self.sections = sections
        guard !sections.isEmpty else {
            selectedRepositoryID = nil
            selectedWorktreeID = nil
            return
        }
        if let selectedRepositoryID,
           sections.flatMap({ $0.repositories }).contains(where: { $0.id == selectedRepositoryID }) == false {
            self.selectedRepositoryID = sections.first?.repositories.first?.id
        } else if selectedRepositoryID == nil {
            selectedRepositoryID = sections.first?.repositories.first?.id
        }

        if let selectedRepository = selectedRepository,
           let worktreeID = selectedWorktreeID,
           selectedRepository.worktrees.contains(where: { $0.id == worktreeID }) {
            // keep selection
        } else {
            selectedWorktreeID = selectedRepository?.worktrees.first?.id
        }
    }

    private func repository(for id: String) -> RepositoryListing? {
        for section in sections {
            if let match = section.repositories.first(where: { $0.id == id }) {
                return match
            }
        }
        return nil
    }
}
