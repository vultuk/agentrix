import SwiftUI

struct RepositoryDashboardDetailView: View {
    @Environment(\.openURL) private var openURL
    @StateObject var viewModel: WorktreeDetailViewModel
    let repository: RepositoryListing
    let logoutAction: () -> Void
    var sessions: [WorktreeSessionSummary]
    var tasks: [TaskItem]
    @State private var issuePresentation: IssuePresentationState?

    @State private var showingCreateBranchWorktree = false
    @State private var showingCreatePromptWorktree = false
    @State private var newWorktreeBranch = ""
    @State private var newWorktreePrompt = ""
    @State private var showingToolbarActions = false

    init(
        repository: RepositoryListing,
        viewModel: WorktreeDetailViewModel,
        logoutAction: @escaping () -> Void,
        sessions: [WorktreeSessionSummary],
        tasks: [TaskItem]
    ) {
        _viewModel = StateObject(wrappedValue: viewModel)
        self.repository = repository
        self.logoutAction = logoutAction
        self.sessions = sessions
        self.tasks = tasks
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header
                RepoDashboardView(
                    dashboard: viewModel.dashboard,
                    gitStatus: viewModel.gitStatus,
                    showGitTotals: false,
                    onIssueSelect: { number in
                        issuePresentation = IssuePresentationState(number: number)
                    },
                    onPullRequestsTap: { openGitHub(url: githubPullRequestsURL) },
                    onIssuesTap: { openGitHub(url: githubIssuesURL) },
                    onWorktreesTap: { openGitHub(url: githubBranchesURL) }
                )
            }
            .padding()
        }
        .navigationTitle(repository.name)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showingToolbarActions = true
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .confirmationDialog("Actions", isPresented: $showingToolbarActions, titleVisibility: .visible) {
            Button("New Worktree (Branch)") {
                showingCreateBranchWorktree = true
                newWorktreePrompt = ""
            }
            Button("New Worktree (Prompt)") {
                showingCreatePromptWorktree = true
                newWorktreeBranch = ""
            }
            Button("Refresh", action: refreshAllAction)
            Button("Log Out", role: .destructive, action: logoutAction)
            Button("Cancel", role: .cancel) { }
        }
        .onAppear {
            viewModel.updateRepository(repository)
            viewModel.updateSessions(sessions)
            viewModel.updateTasks(tasks)
        }
        .onChange(of: sessionChangeTokens) { _ in
            viewModel.updateSessions(sessions)
        }
        .onChange(of: taskChangeTokens) { _ in
            viewModel.updateTasks(tasks)
        }
        .onChange(of: repositoryChangeToken) { _ in
            viewModel.updateRepository(repository)
        }
        .sheet(item: $issuePresentation) { state in
            IssueDetailSheet(
                viewModel: viewModel,
                repository: repository,
                issueNumber: state.number
            )
        }
        .sheet(isPresented: $showingCreateBranchWorktree) {
            newWorktreeBranchSheet
        }
        .sheet(isPresented: $showingCreatePromptWorktree) {
            newWorktreePromptSheet
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

    private var header: some View {
        VStack(alignment: .leading) {
            Text("\(repository.org)/\(repository.name)")
                .font(.title3)
                .bold()
            Text("Dashboard")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private extension RepositoryDashboardDetailView {
    var refreshAllAction: () -> Void {
        { Task { await viewModel.refreshAll() } }
    }

    var githubPullRequestsURL: URL? {
        URL(string: "https://github.com/\(repository.org)/\(repository.name)/pulls")
    }

    var githubIssuesURL: URL? {
        URL(string: "https://github.com/\(repository.org)/\(repository.name)/issues")
    }

    var githubBranchesURL: URL? {
        URL(string: "https://github.com/\(repository.org)/\(repository.name)/branches")
    }

    func openGitHub(url: URL?) {
        guard let url else { return }
        openURL(url)
    }

    var sessionChangeTokens: [String] {
        sessions.map(\.id)
    }

    var taskChangeTokens: [String] {
        tasks.map(\.id)
    }

    var repositoryChangeToken: String {
        repository.id
    }
}

private extension RepositoryDashboardDetailView {
    var newWorktreeBranchSheet: some View {
        NavigationStack {
            Form {
                Section("Branch") {
                    TextField("feature/new-example", text: $newWorktreeBranch)
                        #if os(iOS)
                        .autocapitalization(.none)
                        #endif
                        .disableAutocorrection(true)
                }
                if viewModel.isCreatingWorktree {
                    HStack {
                        ProgressView()
                            .progressViewStyle(.circular)
                        Text("Creating worktree…")
                    }
                }
            }
            .navigationTitle("New Worktree")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        showingCreateBranchWorktree = false
                    }
                    .disabled(viewModel.isCreatingWorktree)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        submitNewBranchWorktree()
                    }
                    .disabled(
                        newWorktreeBranch.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || viewModel.isCreatingWorktree
                    )
                }
            }
        }
        .presentationDetents([.medium])
    }

    var newWorktreePromptSheet: some View {
        NavigationStack {
            Form {
                Section("Prompt") {
                    TextEditor(text: $newWorktreePrompt)
                        .frame(minHeight: 120)
                }
                if viewModel.isCreatingWorktree {
                    HStack {
                        ProgressView()
                            .progressViewStyle(.circular)
                        Text("Creating worktree…")
                    }
                }
            }
            .navigationTitle("Generate Worktree")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        showingCreatePromptWorktree = false
                    }
                    .disabled(viewModel.isCreatingWorktree)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        submitNewPromptWorktree()
                    }
                    .disabled(
                        newWorktreePrompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || viewModel.isCreatingWorktree
                    )
                }
            }
        }
        .presentationDetents([.medium])
    }

    func submitNewBranchWorktree() {
        let branch = newWorktreeBranch.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !branch.isEmpty else { return }
        Task {
            let created = await viewModel.createWorktree(branch: branch, prompt: nil)
            if created {
                await MainActor.run {
                    newWorktreeBranch = ""
                    showingCreateBranchWorktree = false
                }
            }
        }
    }

    func submitNewPromptWorktree() {
        let prompt = newWorktreePrompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !prompt.isEmpty else { return }
        Task {
            let created = await viewModel.createWorktree(branch: nil, prompt: prompt)
            if created {
                await MainActor.run {
                    newWorktreePrompt = ""
                    showingCreatePromptWorktree = false
                }
            }
        }
    }
}

