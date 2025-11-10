import SwiftUI

struct HomeView: View {
    @StateObject private var viewModel: RepositoriesViewModel
    @State private var showingAddRepository = false
    @State private var newRepoURL = ""
    @State private var newRepoInitCommand = ""
    private let services: ServiceRegistry
    private let logoutAction: () -> Void

    init(services: ServiceRegistry, logoutAction: @escaping () -> Void) {
        self._viewModel = StateObject(wrappedValue: RepositoriesViewModel(services: services))
        self.services = services
        self.logoutAction = logoutAction
    }

    var body: some View {
        NavigationSplitView {
            List(selection: $viewModel.selectedRepositoryID) {
                ForEach(viewModel.sections) { section in
                    Section(section.title) {
                        ForEach(section.repositories) { repository in
                            Button(action: { viewModel.selectRepository(repository) }) {
                                HStack {
                                    VStack(alignment: .leading) {
                                        Text(repository.name)
                                            .font(.headline)
                                        Text(repository.worktrees.first?.branch ?? "No worktrees")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    if repository.worktrees.contains(where: { $0.isCurrent }) {
                                        Label("Active", systemImage: "sparkles")
                                            .labelStyle(.iconOnly)
                                            .foregroundStyle(.green)
                                    }
                                }
                            }
                            .tag(repository.id)
                        }
                    }
                }
            }
            .navigationTitle("Repositories")
            .toolbar {
                ToolbarItemGroup(placement: .navigationBarTrailing) {
                    Button {
                        Task { await viewModel.refresh() }
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
        } detail: {
            if let repository = viewModel.selectedRepository,
               let worktree = viewModel.selectedWorktree {
                WorktreeDetailView(
                    repository: repository,
                    worktree: worktree,
                    viewModel: WorktreeDetailViewModel(
                        repository: repository,
                        selectedWorktree: worktree,
                        services: services,
                        sessions: viewModel.sessionSummaries,
                        tasks: viewModel.tasks
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
                    "Select a repository",
                    systemImage: "folder.badge.plus",
                    description: Text("Choose a repository to view its worktrees and sessions.")
                )
            }
        }
        .sheet(isPresented: $showingAddRepository) {
            NavigationStack {
                Form {
                    Section("Repository") {
                        TextField("Git URL", text: $newRepoURL)
                            .keyboardType(.URL)
                            .textInputAutocapitalization(.never)
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
        .overlay(alignment: .bottom) {
            if let error = viewModel.errorMessage {
                Text(error)
                    .font(.footnote)
                    .padding(8)
                    .frame(maxWidth: .infinity)
                    .background(.red.opacity(0.15))
                    .foregroundStyle(.red)
                    .transition(.move(edge: .bottom))
            }
        }
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
                viewModel.errorMessage = AgentrixError.unreachable.errorDescription
            }
        }
    }
}
