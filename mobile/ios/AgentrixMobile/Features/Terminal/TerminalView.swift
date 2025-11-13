import SwiftUI
import Foundation

struct TerminalConsoleView: View {
    @ObservedObject var store: TerminalSessionsStore
    var commandConfig: CommandConfig = .defaults
    var isLoadingCommandConfig = false
    @Namespace private var tabNamespace
    @State private var showingLaunchOptions = false

    private var activeSessionSnapshot: WorktreeSessionSnapshot? {
        store.sessions.first { $0.id == store.activeSessionId }
    }

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(red: 0.06, green: 0.07, blue: 0.10),
                    Color(red: 0.02, green: 0.02, blue: 0.04)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack(alignment: .leading, spacing: 8) {
                tabStrip

                Group {
                    if store.sessions.isEmpty {
                        emptyState
                    } else if let activeSession = store.activeSessionViewModel {
                        TerminalSessionDetailView(
                            viewModel: activeSession,
                            reconnectAction: { Task { await store.reconnectActiveSession() } }
                        )
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else {
                        ContentUnavailableView(
                            "Select a session",
                            systemImage: "terminal",
                            description: Text("Choose a terminal session to view recent activity.")
                        )
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    }
                }
            }
            .padding(.horizontal, 12)
            .padding(.top, 0)
            .padding(.bottom, 12)
        }
        .onAppear {
            store.resumeActiveSession()
        }
        .onDisappear {
            store.suspendConnections()
        }
        .sheet(isPresented: $showingLaunchOptions) {
            TerminalLaunchOptionsView(
                store: store,
                commandConfig: commandConfig,
                isLoadingCommandConfig: isLoadingCommandConfig,
                layout: .sheet,
                onDismiss: { showingLaunchOptions = false }
            )
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
            .background(
                LinearGradient(
                    colors: [
                        Color(red: 0.06, green: 0.07, blue: 0.10),
                        Color(red: 0.02, green: 0.02, blue: 0.04)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .ignoresSafeArea()
            )
        }
    }

    private var tabStrip: some View {
        HStack(spacing: 12) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(store.sessions) { session in
                        TerminalSessionTab(
                            namespace: tabNamespace,
                            session: session,
                            isActive: session.id == store.activeSessionId,
                            isClosing: store.closingSessionIds.contains(session.id),
                            selectAction: { store.selectSession(id: session.id) },
                            closeAction: {
                                Task { await store.closeSession(id: session.id) }
                            }
                        )
                    }
                }
                .padding(.vertical, 6)
            }

            if store.isOpeningSession {
                ProgressView()
                    .scaleEffect(0.75)
                    .tint(Color.agentrixAccent)
            }

            Button {
                showingLaunchOptions = true
            } label: {
                Image(systemName: "plus.circle.fill")
                    .font(.title3.weight(.bold))
                    .foregroundStyle(Color.agentrixAccent)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Start a new session")
            .disabled(store.isOpeningSession)
        }
    }

    private var emptyState: some View {
        TerminalLaunchOptionsView(
            store: store,
            commandConfig: commandConfig,
            isLoadingCommandConfig: isLoadingCommandConfig,
            layout: .inline,
            onDismiss: nil
        )
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

private struct TerminalSessionTab: View {
    let namespace: Namespace.ID
    let session: WorktreeSessionSnapshot
    let isActive: Bool
    let isClosing: Bool
    let selectAction: () -> Void
    let closeAction: () -> Void

    private var style: TerminalSessionVisualStyle {
        TerminalSessionVisualStyle(snapshot: session)
    }

    private var statusColor: Color {
        if session.idle { return .orange }
        return style.statusIndicatorColor(isActive: isActive)
    }

    var body: some View {
        HStack(spacing: 10) {
            Circle()
                .fill(statusColor)
                .frame(width: 6, height: 6)
                .shadow(color: statusColor.opacity(0.4), radius: 3, x: 0, y: 0)

            Text(session.label)
                .font(.system(.callout, design: .monospaced).weight(.semibold))
                .foregroundStyle(isActive ? Color.white : Color.white.opacity(0.7))
                .lineLimit(1)

            sessionTypeBadge

            if isClosing {
                ProgressView()
                    .scaleEffect(0.6)
                    .tint(.white)
            } else {
                Button(action: closeAction) {
                    Image(systemName: "xmark")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(Color.white.opacity(0.55))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Close session")
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [
                            Color.white.opacity(isActive ? 0.18 : 0.08),
                            Color.white.opacity(isActive ? 0.12 : 0.05)
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(
                            style.borderColor(isActive: isActive),
                            lineWidth: isActive ? 1.6 : 1
                        )
                        .matchedGeometryEffect(id: "terminal-tab-\(session.id)", in: namespace, isSource: isActive)
                )
        )
        .contentShape(Rectangle())
        .onTapGesture {
            selectAction()
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(session.label). \(style.sessionTypeAnnouncement)")
        .accessibilityValue(style.accessibilityValue(isActive: isActive, isIdle: session.idle, isClosing: isClosing))
        .accessibilityHint(isClosing ? "Session is closing." : "Double-tap to focus this session.")
        .animation(.spring(response: 0.32, dampingFraction: 0.85), value: isActive)
    }

    private var sessionTypeBadge: some View {
        Text(style.badgeLabel.uppercased())
            .font(.caption2.weight(.bold))
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(
                Capsule()
                    .fill(style.badgeBackground(isActive: isActive))
            )
            .foregroundStyle(style.badgeForeground)
            .accessibilityHidden(true)
    }
}

struct TerminalLaunchOptionsView: View {
    enum Layout {
        case inline
        case sheet
    }

    @ObservedObject var store: TerminalSessionsStore
    let commandConfig: CommandConfig
    let isLoadingCommandConfig: Bool
    let layout: Layout
    let onDismiss: (() -> Void)?
    @AppStorage("terminal.lastLaunchAction") private var lastLaunchActionRawValue = ""

    private enum LaunchAction: String {
        case terminal
        case vscode
        case cursor
        case codex
        case codexDangerous = "codex-dangerous"
        case claude
        case claudeDangerous = "claude-dangerous"
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if layout == .inline {
                    heroHeader
                } else {
                    Text("Start a new session")
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(headerColor)
                    Text("Choose a terminal or agent mode to launch another session in this worktree.")
                        .font(.subheadline)
                        .foregroundStyle(headerColor.opacity(0.65))
                }

                if isLoadingCommandConfig {
                    loadingRow
                }

                VStack(spacing: 12) {
                    launchButton(action: .terminal, title: "Open Terminal", systemImage: "terminal")
                    launchButton(action: .vscode, title: "Open in VS Code", systemImage: "laptopcomputer")
                    advancedLaunchRow(
                        primaryAction: .codex,
                        menuAction: .codexDangerous,
                        title: "Open Codex",
                        systemImage: "sparkles"
                    )
                    launchButton(action: .cursor, title: "Launch Cursor", systemImage: "cursorarrow.rays")
                    advancedLaunchRow(
                        primaryAction: .claude,
                        menuAction: .claudeDangerous,
                        title: "Open Claude",
                        systemImage: "lightbulb"
                    )
                }

                footerStatus
            }
            .padding(.vertical, layout == .inline ? 32 : 24)
            .padding(.horizontal, 20)
        }
        .scrollIndicators(.never)
        .background(backgroundGradient)
    }

    private var heroHeader: some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: "rectangle.and.pencil.and.ellipsis")
                .font(.system(size: 44))
                .foregroundStyle(Color.white.opacity(0.5))
            Text("No terminal sessions yet")
                .font(.title3.weight(.semibold))
                .foregroundStyle(Color.white)
            Text("Choose how you want to start working in this worktree.")
                .font(.subheadline)
                .foregroundStyle(Color.white.opacity(0.6))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private func launchButton(action: LaunchAction, title: String, systemImage: String) -> some View {
        Button {
            performLaunch(action)
        } label: {
            HStack(spacing: 12) {
                Image(systemName: systemImage)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(Color.agentrixAccent)
                Text(title)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(contentColor)
                Spacer()
                trailingIndicator(for: action)
            }
            .padding(.vertical, 12)
            .padding(.horizontal, 16)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(buttonBackground)
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .stroke(buttonBorder, lineWidth: 1)
                    )
            )
        }
        .buttonStyle(.plain)
        .disabled(store.isOpeningSession)
    }

    @ViewBuilder
    private func advancedLaunchRow(
        primaryAction: LaunchAction,
        menuAction: LaunchAction,
        title: String,
        systemImage: String
    ) -> some View {
        HStack(spacing: 10) {
            launchButton(action: primaryAction, title: title, systemImage: systemImage)
            dangerousMenuButton(primaryAction: primaryAction, menuAction: menuAction)
        }
    }

    @ViewBuilder
    private func dangerousMenuButton(primaryAction: LaunchAction, menuAction: LaunchAction) -> some View {
        Menu {
            Button("Dangerous Mode") {
                performLaunch(menuAction)
            }
            .disabled(store.isOpeningSession)
        } label: {
            ZStack {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(buttonBackground)
                    .overlay(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .stroke(buttonBorder, lineWidth: 1)
                    )
                    .frame(width: 46, height: 46)
                if isActionLoading(menuAction) {
                    ProgressView()
                        .scaleEffect(0.65)
                        .tint(Color.agentrixAccent)
                } else {
                    Image(systemName: "chevron.down")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(Color.white)
                }
            }
            .accessibilityLabel("Dangerous options for \(launchLabel(for: primaryAction))")
        }
        .menuStyle(.automatic)
    }

    @ViewBuilder
    private func trailingIndicator(for action: LaunchAction) -> some View {
        if isActionLoading(action) {
            ProgressView()
                .scaleEffect(0.65)
                .tint(Color.agentrixAccent)
        } else {
            Image(systemName: action == .codexDangerous || action == .claudeDangerous ? "exclamationmark.triangle" : "arrow.right")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(
                    action == .codexDangerous || action == .claudeDangerous
                        ? Color.agentrixError
                        : contentColor.opacity(0.45)
                )
        }
    }

    private func performLaunch(_ action: LaunchAction) {
        let configuration = launchConfiguration(for: action)
        lastLaunchActionRawValue = action.rawValue
        onDismiss?()

        Task {
            await store.openNewSession(
                tool: configuration.tool,
                command: configuration.command,
                launchLabel: configuration.label,
                actionIdentifier: configuration.identifier
            )
        }
    }

    private func launchConfiguration(for action: LaunchAction) -> (tool: TerminalSessionTool, command: String?, label: String, identifier: String) {
        (
            tool: sessionTool(for: action),
            command: command(for: action),
            label: launchLabel(for: action),
            identifier: action.rawValue
        )
    }

    private func sessionTool(for action: LaunchAction) -> TerminalSessionTool {
        switch action {
        case .terminal, .vscode:
            return .terminal
        case .cursor, .codex, .codexDangerous, .claude, .claudeDangerous:
            return .agent
        }
    }

    private func command(for action: LaunchAction) -> String? {
        switch action {
        case .terminal:
            return nil
        case .vscode:
            return commandConfig.vscode
        case .cursor:
            return commandConfig.cursor
        case .codex:
            return commandConfig.codex
        case .codexDangerous:
            return commandConfig.codexDangerous
        case .claude:
            return commandConfig.claude
        case .claudeDangerous:
            return commandConfig.claudeDangerous
        }
    }

    private func launchLabel(for action: LaunchAction) -> String {
        switch action {
        case .terminal:
            return "Terminal"
        case .vscode:
            return "VS Code"
        case .cursor:
            return "Cursor"
        case .codex:
            return "Codex"
        case .codexDangerous:
            return "Codex (Dangerous)"
        case .claude:
            return "Claude"
        case .claudeDangerous:
            return "Claude (Dangerous)"
        }
    }

    private var lastLaunchActionLabel: String? {
        guard let action = LaunchAction(rawValue: lastLaunchActionRawValue) else {
            return nil
        }
        return launchLabel(for: action)
    }

    private var headerColor: Color {
        layout == .inline ? Color.white : Color.white
    }

    private var contentColor: Color {
        layout == .inline ? Color.white : Color.white.opacity(0.95)
    }

    private var buttonBackground: Color {
        Color.white.opacity(layout == .inline ? 0.06 : 0.08)
    }

    private var buttonBorder: Color {
        Color.white.opacity(layout == .inline ? 0.12 : 0.15)
    }

    private var backgroundGradient: LinearGradient {
        LinearGradient(
            colors: [
                Color(red: 0.06, green: 0.07, blue: 0.10),
                Color(red: 0.02, green: 0.02, blue: 0.04)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    @ViewBuilder
    private var loadingRow: some View {
        HStack(spacing: 10) {
            ProgressView()
                .progressViewStyle(.circular)
                .tint(Color.agentrixAccent)
            Text("Refreshing launch options…")
                .font(.footnote)
                .foregroundStyle(contentColor.opacity(0.7))
        }
    }

    @ViewBuilder
    private var footerStatus: some View {
        if let lastUsed = lastLaunchActionLabel {
            Text("Last used: \(lastUsed)")
                .font(.footnote)
                .foregroundStyle(contentColor.opacity(0.6))
        }

        if let pendingLabel = store.openingLaunchLabel {
            Text("Starting \(pendingLabel.lowercased()) session…")
                .font(.footnote.weight(.medium))
                .foregroundStyle(contentColor.opacity(0.7))
        } else {
            Text("Commands run immediately in the selected session type.")
                .font(.footnote)
                .foregroundStyle(contentColor.opacity(0.5))
        }
    }

    private func isActionLoading(_ action: LaunchAction) -> Bool {
        guard store.isOpeningSession else { return false }
        if let identifier = store.openingActionIdentifier {
            switch action {
            case .codex:
                return identifier.hasPrefix("codex")
            case .claude:
                return identifier.hasPrefix("claude")
            default:
                return identifier == action.rawValue
            }
        }
        return store.openingLaunchLabel == launchLabel(for: action)
    }
}

private struct TerminalSessionDetailView: View {
    @ObservedObject var viewModel: TerminalViewModel
    let reconnectAction: () -> Void

    var body: some View {
        SwiftTermTerminalView(viewModel: viewModel)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .background(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(Color.black.opacity(0.94))
                    .overlay(
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .stroke(Color.white.opacity(0.06), lineWidth: 1)
                    )
            )
            .overlay(alignment: .topLeading) {
                statusBanner
                    .padding(.top, 12)
                    .padding(.leading, 18)
            }
            .overlay(alignment: .bottomTrailing) {
                if case .error = viewModel.state {
                    errorAction
                        .padding(.trailing, 18)
                        .padding(.bottom, 18)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .animation(.easeInOut(duration: 0.25), value: viewModel.state)
    }

    @ViewBuilder
    private var statusBanner: some View {
        switch viewModel.state {
        case .connecting:
            bannerContent(icon: "arrow.triangle.2.circlepath", tint: .agentrixAccent, text: "Connecting…")
        case .idle:
            bannerContent(icon: "moon.zzz", tint: .orange, text: "Session idle — reconnect to resume")
        case .closed:
            bannerContent(icon: "xmark.circle", tint: .white.opacity(0.7), text: "Session closed")
        case .error(let message):
            bannerContent(icon: "exclamationmark.triangle", tint: .agentrixError, text: message)
        default:
            EmptyView()
        }
    }

    private func bannerContent(icon: String, tint: Color, text: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .font(.caption.weight(.semibold))
            Text(text)
                .font(.caption)
                .lineLimit(1)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(
            Capsule()
                .fill(Color.white.opacity(0.12))
        )
        .foregroundStyle(tint)
    }

    private var errorAction: some View {
        Button {
            reconnectAction()
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "arrow.clockwise")
                Text("Reconnect")
            }
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(
                Capsule()
                    .fill(Color.agentrixError.opacity(0.2))
            )
            .foregroundStyle(Color.agentrixError)
        }
        .buttonStyle(.plain)
    }

}

private extension Date {
    var relativeDescription: String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: self, relativeTo: .now)
    }
}
