import SwiftUI

struct HomeView: View {
    @StateObject private var viewModel: RepositoriesViewModel
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @State private var columnVisibility: NavigationSplitViewVisibility = .all
    @State private var listSelection: RepositoryDestination?
    @State private var showingAddRepository = false
    @State private var newRepoURL = ""
    @State private var newRepoInitCommand = ""
    @State private var editingRepository: RepositoryListing?
    @State private var editInitCommand = ""
    @State private var isUpdatingInitCommand = false
    @State private var deleteRepositoryTarget: RepositoryListing?
    @State private var showingDeleteRepository = false
    @State private var isDeletingRepository = false
    private let services: ServiceRegistry
    private let logoutAction: () -> Void

    init(services: ServiceRegistry, logoutAction: @escaping () -> Void) {
        self._viewModel = StateObject(wrappedValue: RepositoriesViewModel(services: services))
        self.services = services
        self.logoutAction = logoutAction
    }

    var body: some View {
        NavigationSplitView(columnVisibility: $columnVisibility) {
            sidebarView
        } detail: {
            detailView
        }
        .onAppear {
            listSelection = viewModel.selection
            updateColumnVisibility(for: viewModel.selection)
        }
        .onChange(of: viewModel.selection) { selection in
            if selection != listSelection {
                listSelection = selection
            }
            updateColumnVisibility(for: selection)
        }
        .onChange(of: listSelection) { selection in
            if selection != viewModel.selection {
                viewModel.setSelection(selection)
            }
            updateColumnVisibility(for: selection)
        }
        .sheet(isPresented: $showingAddRepository) {
            NavigationStack {
                Form {
                    Section("Repository") {
                        TextField("Git URL", text: $newRepoURL)
                        TextField("Init Command (optional)", text: $newRepoInitCommand)
                    }
                }
                .navigationTitle("Add Repository")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { showingAddRepository = false }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Add") {
                            Task {
                                await addRepository()
                                showingAddRepository = false
                                newRepoURL = ""
                                newRepoInitCommand = ""
                            }
                        }
                        .disabled(newRepoURL.isEmpty)
                    }
                }
            }
            .presentationDetents([.medium])
        }
        .sheet(item: $editingRepository) { repository in
            NavigationStack {
                Form {
                    Section("Init Command") {
                        TextField("npm run dev", text: $editInitCommand)
                            #if os(iOS)
                            .autocapitalization(.none)
                            #endif
                            .disableAutocorrection(true)
                    }
                    if isUpdatingInitCommand {
                        HStack {
                            ProgressView()
                            Text("Saving…")
                        }
                    }
                }
                .navigationTitle("Edit \(repository.name)")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") {
                            editingRepository = nil
                        }
                        .disabled(isUpdatingInitCommand)
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Save") {
                            Task { await updateInitCommand(for: repository) }
                        }
                        .disabled(isUpdatingInitCommand || editInitCommand.trimmingCharacters(in: .whitespacesAndNewlines) == repository.initCommand)
                    }
                }
            }
            .presentationDetents([.medium])
        }
        .alert("Delete Repository?", isPresented: $showingDeleteRepository, presenting: deleteRepositoryTarget) { repository in
            Button("Delete", role: .destructive) {
                showingDeleteRepository = false
                deleteRepositoryTarget = repository
                Task { await deleteRepository(repository) }
            }
            .disabled(isDeletingRepository)
            Button("Cancel", role: .cancel) {
                showingDeleteRepository = false
                deleteRepositoryTarget = nil
            }
        } message: { repository in
            Text("Removing \(repository.name) from \(repository.org) detaches local worktrees but leaves remote branches untouched.")
        }
        .overlay(alignment: .bottom) {
            if let error = viewModel.errorMessage {
                Text(error)
                    .font(.footnote)
                    .padding(8)
                    .frame(maxWidth: .infinity)
                    .background(Color.agentrixError.opacity(0.15))
                    .foregroundStyle(Color.agentrixError)
                    .transition(.move(edge: .bottom))
            }
        }
    }

    private var sidebarView: some View {
        List(selection: $listSelection) {
            ForEach(viewModel.sections) { section in
                RepositorySidebarSectionView(
                    section: section,
                    selection: listSelection,
                    editRepository: { repository in
                        beginEditing(repository: repository)
                    },
                    deleteRepository: { repository in
                        beginDeleting(repository: repository)
                    }
                )
            }
        }
        .navigationTitle("Repositories")
        .refreshable {
            await viewModel.refresh(skipAutoSelection: true)
        }
        .toolbar {
            ToolbarItemGroup(placement: .automatic) {
                Button {
                    Task { await viewModel.refresh(skipAutoSelection: true) }
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                Button {
                    showingAddRepository = true
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
    }

    @ViewBuilder
    private var detailView: some View {
        if let repository = viewModel.selectedRepository {
            switch viewModel.selection {
            case .dashboard:
                let mainWorktree =
                    repository.worktrees.first(where: { $0.branch.lowercased() == "main" }) ??
                    WorktreeSummary(org: repository.org, repo: repository.name, branch: "main")
                RepositoryDashboardDetailView(
                    repository: repository,
                    viewModel: WorktreeDetailViewModel(
                        repository: repository,
                        selectedWorktree: mainWorktree,
                        services: services,
                        sessions: viewModel.sessionSummaries,
                        tasks: viewModel.tasks,
                        onWorktreeCreated: { summary in
                            await viewModel.handleWorktreeCreated(summary)
                        },
                        onWorktreeDeleted: { summary in
                            await viewModel.handleWorktreeDeleted(summary)
                        }
                    ),
                    logoutAction: {
                        logoutAction()
                    },
                    sessions: viewModel.sessionSummaries,
                    tasks: viewModel.tasks
                )
                .id("\(repository.id)-dashboard")
            case .worktree:
                if let worktree = viewModel.selectedWorktree {
                    WorktreeDetailView(
                        repository: repository,
                        worktree: worktree,
                        viewModel: WorktreeDetailViewModel(
                            repository: repository,
                            selectedWorktree: worktree,
                            services: services,
                            sessions: viewModel.sessionSummaries,
                            tasks: viewModel.tasks,
                            onWorktreeCreated: { summary in
                                await viewModel.handleWorktreeCreated(summary)
                            },
                            onWorktreeDeleted: { summary in
                                await viewModel.handleWorktreeDeleted(summary)
                            }
                        ),
                        selectionHandler: { selected in
                            viewModel.selectWorktree(selected)
                        },
                        logoutAction: {
                            logoutAction()
                        },
                        sessions: viewModel.sessionSummaries,
                        tasks: viewModel.tasks
                    )
                    .id(worktree.id)
                } else {
                    ContentUnavailableView(
                        "Select a worktree",
                        systemImage: "folder.badge.questionmark",
                        description: Text("Choose a worktree to view terminal sessions and agents.")
                    )
                }
            case .none:
                ContentUnavailableView(
                    "Select a repository",
                    systemImage: "folder.badge.plus",
                    description: Text("Choose a repository to view its worktrees and sessions.")
                )
            }
        } else {
            ContentUnavailableView(
                "Select a repository",
                systemImage: "folder.badge.plus",
                description: Text("Choose a repository to view its worktrees and sessions.")
            )
        }
    }

    private func updateColumnVisibility(for selection: RepositoryDestination?) {
        guard horizontalSizeClass == .compact else {
            columnVisibility = .all
            return
        }
        columnVisibility = selection == nil ? .all : .detailOnly
    }

    private func addRepository() async {
        guard !newRepoURL.isEmpty else { return }
        do {
            _ = try await services.repositories.addRepository(remoteURL: newRepoURL, initCommand: newRepoInitCommand)
            await viewModel.refresh()
        } catch let error as AgentrixError {
            await MainActor.run {
                viewModel.errorMessage = error.errorDescription
            }
        } catch {
            await MainActor.run {
                viewModel.errorMessage = error.localizedDescription
            }
        }
    }

    private func beginEditing(repository: RepositoryListing) {
        editInitCommand = repository.initCommand
        editingRepository = repository
    }

    private func updateInitCommand(for repository: RepositoryListing) async {
        guard !isUpdatingInitCommand else { return }
        isUpdatingInitCommand = true
        let trimmed = editInitCommand.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            _ = try await services.repositories.updateInitCommand(
                org: repository.org,
                repo: repository.name,
                initCommand: trimmed
            )
            await viewModel.refresh()
            await MainActor.run {
                viewModel.errorMessage = nil
                isUpdatingInitCommand = false
                editingRepository = nil
                editInitCommand = ""
            }
        } catch let error as AgentrixError {
            await MainActor.run {
                isUpdatingInitCommand = false
                viewModel.errorMessage = error.errorDescription
            }
        } catch {
            await MainActor.run {
                isUpdatingInitCommand = false
                viewModel.errorMessage = error.localizedDescription
            }
        }
    }

    private func beginDeleting(repository: RepositoryListing) {
        deleteRepositoryTarget = repository
        showingDeleteRepository = true
    }

    private func deleteRepository(_ repository: RepositoryListing) async {
        guard !isDeletingRepository else { return }
        isDeletingRepository = true
        defer { isDeletingRepository = false }
        do {
            _ = try await services.repositories.deleteRepository(org: repository.org, repo: repository.name)
            await viewModel.refresh()
            await MainActor.run {
                viewModel.errorMessage = nil
                deleteRepositoryTarget = nil
            }
        } catch let error as AgentrixError {
            await MainActor.run {
                viewModel.errorMessage = error.errorDescription
            }
        } catch {
            await MainActor.run {
                viewModel.errorMessage = error.localizedDescription
            }
        }
    }
}

private struct RepositorySidebarSectionView: View {
    let section: RepositorySection
    let selection: RepositoryDestination?
    let editRepository: (RepositoryListing) -> Void
    let deleteRepository: (RepositoryListing) -> Void

    var body: some View {
        Section(section.title) {
            ForEach(section.repositories, id: \.id) { repository in
                Group {
                    // Dashboard row
                    RepositoryDashboardRowView(
                        repository: repository,
                        selection: selection,
                        editRepository: editRepository,
                        deleteRepository: deleteRepository
                    )
                    
                    // Worktrees header and rows
                    if !repository.worktrees.filter({ $0.branch.lowercased() != "main" }).isEmpty {
                        Text("Worktrees")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .padding(.leading, 4)
                            .listRowInsets(EdgeInsets(top: 4, leading: 20, bottom: 2, trailing: 0))
                        
                        // Worktree rows
                        ForEach(Array(repository.worktrees.filter({ $0.branch.lowercased() != "main" }).enumerated()), id: \.element.id) { index, worktree in
                            WorktreeRowView(
                                worktree: worktree,
                                repository: repository,
                                destination: .worktree(WorktreeReference(org: worktree.org, repo: worktree.repo, branch: worktree.branch)),
                                selectedDestination: selection,
                                rowAccessibilityIndex: index
                            )
                        }
                    } else {
                        Text("No additional worktrees")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .padding(.leading, 4)
                            .listRowInsets(EdgeInsets(top: 4, leading: 20, bottom: 4, trailing: 0))
                    }
                }
            }
        }
    }
}

private struct RepositoryDashboardRowView: View {
    let repository: RepositoryListing
    let selection: RepositoryDestination?
    let editRepository: (RepositoryListing) -> Void
    let deleteRepository: (RepositoryListing) -> Void

    private var dashboardDestination: RepositoryDestination {
        .dashboard(RepositoryReference(org: repository.org, repo: repository.name))
    }

    private var isDashboardSelected: Bool {
        selection == dashboardDestination
    }

    var body: some View {
        NavigationLink(value: dashboardDestination) {
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(repository.name)
                        .font(.headline)
                    Text("Dashboard")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                if isDashboardSelected {
                    Image(systemName: "checkmark")
                        .font(.caption)
                        .foregroundStyle(Color.agentrixAccent)
                } else if repository.representativeWorktree != nil {
                    Image(systemName: "sparkles")
                        .font(.caption)
                        .foregroundStyle(.green)
                }
            }
            .padding(.vertical, 6)
        }
        .buttonStyle(.plain)
        .accessibilityHint("Open repository dashboard")
        .contextMenu {
            Button("Edit Init Command") {
                editRepository(repository)
            }
            Button(role: .destructive) {
                deleteRepository(repository)
            } label: {
                Text("Delete Repository")
            }
        }
    }
}

private struct WorktreeRowView: View {
    let worktree: WorktreeSummary
    let repository: RepositoryListing
    let destination: RepositoryDestination
    let selectedDestination: RepositoryDestination?
    let rowAccessibilityIndex: Int

    private var isSelected: Bool {
        destination == selectedDestination
    }

    var body: some View {
        NavigationLink(value: destination) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(worktree.branch)
                        .font(.subheadline)
                    Text("\(repository.org)/\(repository.name)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                if isSelected {
                    Image(systemName: "checkmark")
                        .font(.caption)
                        .foregroundStyle(Color.agentrixAccent)
                }
            }
            .padding(.vertical, 6)
            .padding(.leading, 8)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Open worktree")
        .accessibilityValue("Row \(rowAccessibilityIndex + 1)")
    }
}
