import SwiftUI

struct WorktreeDetailView: View {
    @StateObject var viewModel: WorktreeDetailViewModel
    let selectionHandler: (WorktreeSummary) -> Void
    let logoutAction: () -> Void
    let repository: RepositoryListing
    let worktree: WorktreeSummary
    var sessions: [WorktreeSessionSummary]
    var tasks: [TaskItem]

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
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header
                worktreePicker
                RepoDashboardView(dashboard: viewModel.dashboard)
                GitStatusView(status: viewModel.gitStatus)
                PlansView(
                    plans: viewModel.plans,
                    selectedPlan: viewModel.selectedPlan,
                    openPlan: planSelectionAction
                )
                TasksListView(tasks: viewModel.tasks)
                PortsView(
                    ports: viewModel.ports,
                    tunnels: viewModel.tunnels,
                    refreshAction: portRefreshAction,
                    openTunnel: portTunnelAction
                )
                TerminalConsoleView(viewModel: viewModel.terminalViewModel)
            }
            .padding()
        }
        .navigationTitle(repository.name)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Menu {
                    Button("Refresh", action: refreshAllAction)
                    Button("Log Out", role: .destructive, action: logoutAction)
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
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
        .onDisappear {
            viewModel.terminalViewModel.disconnect()
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
                                .background(worktree.id == self.worktree.id ? Color.accentColor.opacity(0.2) : Color.gray.opacity(0.2))
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                        }
                    }
                }
            }
        }
    }
}

private extension WorktreeDetailView {
    var portRefreshAction: () -> Void {
        { Task { await viewModel.loadPorts() } }
    }

    var portTunnelAction: (Int) -> Void {
        { port in Task { await viewModel.openTunnel(for: port) } }
    }

    var planSelectionAction: (PlanRecord) -> Void {
        { plan in Task { await viewModel.loadPlanContent(plan: plan) } }
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
