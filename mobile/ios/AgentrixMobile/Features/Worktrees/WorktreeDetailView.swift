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
    @State private var showingPlanComposer = false
    @State private var copyFeedback: String?
    @State private var copyFeedbackTask: Task<Void, Never>? = nil
    @State private var activeDiffSelection: DiffPresentationState?

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
            tabViewContent

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
            if viewModel.shouldAutoConnectTerminal {
                viewModel.terminalStore.resumeActiveSession()
            }
            Task { await preloadDataIfNeeded(for: viewModel.selectedTab) }
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
            if viewModel.shouldAutoConnectTerminal {
                viewModel.terminalStore.suspendConnections()
            }
            copyFeedbackTask?.cancel()
            copyFeedbackTask = nil
        }
        .onChange(of: viewModel.selectedTab) { tab in
            Task { await preloadDataIfNeeded(for: tab) }
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
        .sheet(item: $activeDiffSelection) { selection in
            GitDiffSheet(
                viewModel: viewModel,
                repository: repository,
                worktree: worktree,
                selection: selection
            )
        }
        .sheet(isPresented: $showingPlanComposer) {
            planComposerSheet
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
                    .padding(.bottom, 72)
            }
        }
    }

    private var tabViewContent: some View {
        TabView(selection: Binding(
            get: { viewModel.selectedTab },
            set: { viewModel.selectedTab = $0 }
        )) {
            terminalTab
                .tag(WorktreeDetailTab.terminal)
                .tabItem {
                    Label("Terminal", systemImage: "terminal")
                }

            codexTab
                .tag(WorktreeDetailTab.codex)
                .tabItem {
                    Label("Codex", systemImage: "sparkles")
                }

            diffsTab
                .tag(WorktreeDetailTab.diffs)
                .tabItem {
                    Label("Diffs", systemImage: "doc.plaintext")
                }

            portsTab
                .tag(WorktreeDetailTab.ports)
                .tabItem {
                    Label("Ports", systemImage: "bolt.horizontal")
                }

            plansTab
                .tag(WorktreeDetailTab.plans)
                .tabItem {
                    Label("Plans", systemImage: "doc.text")
                }
        }
        .tabViewStyle(.automatic)
        .applyLiquidGlassTabBehavior()
    }

    private var terminalTab: some View {
        TerminalConsoleView(
            store: viewModel.terminalStore,
            commandConfig: viewModel.commandConfig,
            isLoadingCommandConfig: viewModel.isLoadingCommandConfig,
            onStartCodexSdk: startCodexSdkSession,
            isCodexSdkLaunching: viewModel.codexStore.isCreatingSession
        )
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .task {
            await viewModel.loadCommandConfig()
        }
    }

    private var codexTab: some View {
        CodexSdkChatView(
            store: viewModel.codexStore,
            worktree: worktree
        )
    }

    private var diffsTab: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if viewModel.isLoadingGitStatus && viewModel.gitStatus == nil {
                    ProgressView("Loading git status…")
                }
                GitStatusView(status: viewModel.gitStatus) { file, mode in
                    activeDiffSelection = DiffPresentationState(
                        path: file.path,
                        previousPath: file.previousPath,
                        mode: mode,
                        status: file.status
                    )
                }
                if !viewModel.isLoadingGitStatus {
                    Button {
                        Task { await viewModel.loadGitStatus() }
                    } label: {
                        Label("Reload Status", systemImage: "arrow.clockwise")
                    }
                    .buttonStyle(.bordered)
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var portsTab: some View {
        ScrollView {
            PortsView(
                ports: viewModel.ports,
                tunnels: viewModel.tunnels,
                refreshAction: {
                    Task { await viewModel.loadPorts() }
                },
                openTunnel: { port in
                    Task { await viewModel.openTunnel(for: port) }
                }
            )
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var plansTab: some View {
        ScrollView {
            PlansView(
                plans: viewModel.plans,
                selectedPlan: viewModel.selectedPlan,
                openPlan: { plan in
                    Task { await viewModel.loadPlanContent(plan: plan) }
                },
                onCreatePlan: { showingPlanComposer = true }
            )
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
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
        TerminalLaunchOptionsView(
            store: viewModel.terminalStore,
            commandConfig: viewModel.commandConfig,
            isLoadingCommandConfig: viewModel.isLoadingCommandConfig,
            onStartCodexSdk: startCodexSdkSession,
            isCodexSdkLaunching: viewModel.codexStore.isCreatingSession,
            layout: .sheet,
            onDismiss: { showingWorktreeActions = false }
        )
        .task {
            await viewModel.loadCommandConfig()
        }
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

    func preloadDataIfNeeded(for tab: WorktreeDetailTab) async {
        switch tab {
        case .terminal:
            return
        case .codex:
            await viewModel.ensureCodexSessionsLoaded()
        case .diffs:
            if viewModel.gitStatus == nil && !viewModel.isLoadingGitStatus {
                await viewModel.loadGitStatus()
            }
        case .ports:
            if viewModel.ports.isEmpty {
                await viewModel.loadPorts()
            }
        case .plans:
            if viewModel.plans.isEmpty {
                await viewModel.loadPlans()
            }
        }
    }

    func startCodexSdkSession() {
        Task {
            let started = await viewModel.startCodexSdkSession()
            if started {
                await MainActor.run {
                    viewModel.selectedTab = .codex
                }
            }
        }
    }
}

private extension View {
    @ViewBuilder
    func applyLiquidGlassTabBehavior() -> some View {
#if os(iOS) || os(tvOS)
        if #available(iOS 18.0, iPadOS 18.0, tvOS 18.0, *) {
            self.tabBarMinimizeBehavior(.onScrollDown)
        } else {
            self
        }
#else
        self
#endif
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

private extension WorktreeDetailView {
    var planComposerSheet: some View {
        NavigationStack {
            ScrollView {
                PlanComposerView(
                    viewModel: viewModel,
                    initialPrompt: "",
                    title: "Generate Plan"
                )
                .padding()
            }
            .navigationTitle("New Plan")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") {
                        showingPlanComposer = false
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
