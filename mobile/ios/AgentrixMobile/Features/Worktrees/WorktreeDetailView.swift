import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

struct WorktreeDetailView: View {
    @StateObject var viewModel: WorktreeDetailViewModel
    let selectionHandler: (WorktreeSummary) -> Void
    let logoutAction: () -> Void
    let repository: RepositoryListing
    let worktree: WorktreeSummary
    var sessions: [WorktreeSessionSummary]
    var tasks: [TaskItem]
    @State private var showingCreateBranchWorktree = false
    @State private var showingCreatePromptWorktree = false
    @State private var newWorktreeBranch = ""
    @State private var newWorktreePrompt = ""
    @State private var showingToolbarActions = false
    @State private var showingWorktreeActions = false
    @State private var showingDeleteWorktreeConfirmation = false
    @State private var copyFeedback: String?
    @State private var copyFeedbackTask: Task<Void, Never>? = nil

    init(
        repository: RepositoryListing,
        worktree: WorktreeSummary,
        viewModel: WorktreeDetailViewModel,
        selectionHandler: @escaping (WorktreeSummary) -> Void,
        logoutAction: @escaping () -> Void,
        sessions: [WorktreeSessionSummary],
        tasks: [TaskItem]
    ) {
        _viewModel = StateObject(wrappedValue: viewModel)
        self.repository = repository
        self.worktree = worktree
        self.selectionHandler = selectionHandler
        self.logoutAction = logoutAction
        self.sessions = sessions
        self.tasks = tasks
    }

    var body: some View {
        let isMainWorktree = worktree.branch.lowercased() == "main"
        ZStack {
            TerminalConsoleView(store: viewModel.terminalStore)
                .frame(maxWidth: .infinity, maxHeight: .infinity)

            if viewModel.isDeletingWorktree {
                Color.black.opacity(0.2)
                    .ignoresSafeArea()
                ProgressView("Deleting worktree…")
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .background(.thinMaterial)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
        }
        .navigationTitle(repository.name)
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .onAppear {
            viewModel.updateRepository(repository)
            viewModel.updateSessions(sessions)
            viewModel.updateTasks(tasks)
            viewModel.terminalStore.resumeActiveSession()
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
        .onDisappear {
            viewModel.terminalStore.suspendConnections()
            copyFeedbackTask?.cancel()
            copyFeedbackTask = nil
        }
        .sheet(isPresented: $showingCreateBranchWorktree) {
            newWorktreeBranchSheet
        }
        .sheet(isPresented: $showingCreatePromptWorktree) {
            newWorktreePromptSheet
        }
        .sheet(isPresented: $showingWorktreeActions) {
            launchOptionsSheet(isMainWorktree: isMainWorktree)
        }
        .alert("Delete Worktree?", isPresented: $showingDeleteWorktreeConfirmation) {
            Button("Delete", role: .destructive) {
                showingDeleteWorktreeConfirmation = false
                Task { await deleteCurrentWorktree() }
            }
            .disabled(viewModel.isDeletingWorktree)
            Button("Cancel", role: .cancel) {
                showingDeleteWorktreeConfirmation = false
            }
        } message: {
            Text("Removing \(worktree.branch) detaches the local worktree from \(repository.org)/\(repository.name). Remote branches remain untouched.")
        }
        .overlay(alignment: .top) {
            if let feedback = copyFeedback {
                Text(feedback)
                    .font(.caption)
                    .padding(8)
                    .background(Color.agentrixAccent.opacity(0.2))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .padding()
                    .transition(.opacity)
            }
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
            Text(worktree.branch)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var worktreePicker: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Worktrees")
                .font(.headline)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack {
                    ForEach(repository.worktrees) { worktree in
                        Button(action: { selectionHandler(worktree) }) {
                            Text(worktree.branch)
                                .padding(8)
                                .background(worktree.id == self.worktree.id ? Color.agentrixAccent.opacity(0.2) : Color.gray.opacity(0.2))
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                        }
                    }
                }
            }
        }
    }
}

private struct WorktreeCommandAction: Identifiable {
    enum Kind: String {
        case vscode
        case cursor
        case codex
        case codexDangerous
        case claude
        case claudeDangerous
    }

    let kind: Kind
    let title: String
    let command: String
    let isDangerous: Bool

    var id: String { kind.rawValue }

    var systemImage: String {
        switch kind {
        case .vscode:
            return "laptopcomputer"
        case .cursor:
            return "cursorarrow.rays"
        case .codex:
            return "brain"
        case .codexDangerous:
            return "exclamationmark.triangle"
        case .claude:
            return "lightbulb"
        case .claudeDangerous:
            return "lightbulb.slash"
        }
    }
}

private extension WorktreeDetailView {
    var commandActions: [WorktreeCommandAction] {
        [
            WorktreeCommandAction(kind: .vscode, title: "Open in VS Code", command: viewModel.commandConfig.vscode, isDangerous: false),
            WorktreeCommandAction(kind: .cursor, title: "Launch Cursor", command: viewModel.commandConfig.cursor, isDangerous: false),
            WorktreeCommandAction(kind: .codex, title: "Open Codex", command: viewModel.commandConfig.codex, isDangerous: false),
            WorktreeCommandAction(kind: .codexDangerous, title: "Codex (Dangerous)", command: viewModel.commandConfig.codexDangerous, isDangerous: true),
            WorktreeCommandAction(kind: .claude, title: "Open Claude", command: viewModel.commandConfig.claude, isDangerous: false),
            WorktreeCommandAction(kind: .claudeDangerous, title: "Claude (Dangerous)", command: viewModel.commandConfig.claudeDangerous, isDangerous: true)
        ]
    }

    func launchOptionsSheet(isMainWorktree: Bool) -> some View {
        NavigationStack {
            List {
                if !isMainWorktree {
                    Section("Agentrix") {
                        Button {
                            showingWorktreeActions = false
                            Task { await viewModel.terminalStore.openNewSession(tool: .terminal) }
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: "terminal")
                                    .foregroundStyle(Color.agentrixAccent)
                                VStack(alignment: .leading, spacing: 4) {
                                    Text("New Terminal Session")
                                        .font(.headline)
                                    Text("Start an interactive shell for this worktree.")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                Image(systemName: "arrow.triangle.branch")
                                    .foregroundStyle(Color.agentrixAccent)
                            }
                            .padding(.vertical, 4)
                        }
                        .disabled(viewModel.terminalStore.isOpeningSession)
                        Button {
                            showingWorktreeActions = false
                            Task { await viewModel.terminalStore.openNewSession(tool: .agent) }
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: "sparkles")
                                    .foregroundStyle(Color.agentrixAccent)
                                VStack(alignment: .leading, spacing: 4) {
                                    Text("New Agent Session")
                                        .font(.headline)
                                    Text("Launch an agent session to run automated tasks.")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                Image(systemName: "arrow.forward.circle")
                                    .foregroundStyle(Color.agentrixAccent)
                            }
                            .padding(.vertical, 4)
                        }
                        .disabled(viewModel.terminalStore.isOpeningSession)
                    }
                }

                Section {
                    ForEach(commandActions) { action in
                        Button {
                            copyCommand(action)
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: action.systemImage)
                                    .foregroundStyle(action.isDangerous ? Color.agentrixError : Color.primary)
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(action.title)
                                        .font(.headline)
                                    Text(action.command)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                        .multilineTextAlignment(.leading)
                                        .lineLimit(2)
                                }
                                Spacer()
                                Image(systemName: "doc.on.doc")
                                    .foregroundStyle(.secondary)
                            }
                            .padding(.vertical, 4)
                        }
                        .buttonStyle(.plain)
                    }
                } header: {
                    Text("Commands")
                } footer: {
                    Text("Tap a command to copy it to your clipboard.")
                        .font(.caption2)
                    ForEach(commandActions) { action in
                        Button {
                            copyCommand(action)
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: action.systemImage)
                                    .foregroundStyle(action.isDangerous ? Color.agentrixError : Color.primary)
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(action.title)
                                        .font(.headline)
                                    Text(action.command)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                        .multilineTextAlignment(.leading)
                                        .lineLimit(2)
                                }
                                Spacer()
                                Image(systemName: "doc.on.doc")
                                    .foregroundStyle(.secondary)
                            }
                            .padding(.vertical, 4)
                        }
                        .buttonStyle(.plain)
                    }
                }

                if viewModel.isLoadingCommandConfig {
                    Section {
                        HStack(spacing: 8) {
                            ProgressView()
                            Text("Loading commands…")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 4)
                    }
                }
            }
            .navigationTitle("Launch Options")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") {
                        showingWorktreeActions = false
                    }
                }
                ToolbarItem(placement: .primaryAction) {
                    Button("Reload") {
                        Task { await viewModel.loadCommandConfig(force: true) }
                    }
                    .disabled(viewModel.isLoadingCommandConfig)
                }
            }
            .task {
                await viewModel.loadCommandConfig()
            }
        }
        .presentationDetents([.medium, .large])
    }

    func copyCommand(_ action: WorktreeCommandAction) {
        #if canImport(UIKit)
            UIPasteboard.general.string = action.command
        #endif
        copyFeedbackTask?.cancel()
        let task = Task {
            await MainActor.run {
                withAnimation {
                    copyFeedback = "Copied \(action.title) command"
                }
            }
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            await MainActor.run {
                withAnimation {
                    copyFeedback = nil
                }
                copyFeedbackTask = nil
            }
        }
        copyFeedbackTask = task
    }

    func deleteCurrentWorktree() async {
        _ = await viewModel.deleteWorktree()
    }

    var refreshAllAction: () -> Void {
        { Task { await viewModel.refreshAll() } }
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

private extension WorktreeDetailView {
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
