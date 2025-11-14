import SwiftUI
import Foundation
#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

struct TerminalConsoleView: View {
    @ObservedObject var store: TerminalSessionsStore
    @ObservedObject var codexStore: CodexSdkChatStore
    let worktree: WorktreeSummary
    var commandConfig: CommandConfig = .defaults
    var isLoadingCommandConfig = false
    var onStartCodexSdk: (() -> Void)?
    var isCodexSdkLaunching = false
    @Namespace private var tabNamespace
    @State private var showingLaunchOptions = false
    @State private var activePane: ActivePane = .terminal
    @Environment(\.colorScheme) private var colorScheme

    private enum ActivePane {
        case terminal
        case codex
    }

    private var hasTerminalSessions: Bool {
        !store.sessions.isEmpty
    }

    private var hasCodexSessions: Bool {
        !codexStore.sessions.isEmpty
    }

    private var shouldShowCodexContent: Bool {
        activePane == .codex && hasCodexSessions
    }

    private var palette: TerminalColorPalette {
        TerminalColorPalette(colorScheme: colorScheme)
    }

    var body: some View {
        ZStack {
            LinearGradient(
                colors: palette.backgroundGradient,
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack(alignment: .leading, spacing: 8) {
                tabStrip

                Group {
                    if shouldShowCodexContent {
                        codexChatSection
                    } else if hasTerminalSessions, let activeSession = store.activeSessionViewModel {
                        TerminalSessionDetailView(
                            viewModel: activeSession,
                            reconnectAction: { Task { await store.reconnectActiveSession() } },
                            palette: palette
                        )
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else if hasTerminalSessions {
                        ContentUnavailableView(
                            "Select a session",
                            systemImage: "terminal",
                            description: Text("Choose a terminal session to view recent activity.")
                        )
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else if hasCodexSessions {
                        codexChatSection
                    } else {
                        emptyState
                    }
                }
            }
            .padding(.horizontal, 12)
            .padding(.top, 0)
            .padding(.bottom, 12)
        }
        .onAppear {
            store.resumeActiveSession()
            syncActivePaneWithAvailableSessions()
        }
        .onDisappear {
            store.suspendConnections()
        }
        .onChange(of: store.sessions.count) { _ in
            syncActivePaneWithAvailableSessions()
        }
        .onChange(of: codexStore.sessions.count) { _ in
            syncActivePaneWithAvailableSessions()
        }
        .onChange(of: codexStore.activeSessionId) { newValue in
            if newValue == nil {
                syncActivePaneWithAvailableSessions()
            } else {
                activePane = .codex
            }
        }
        .task {
            await codexStore.ensureSessionsLoaded()
        }
        .sheet(isPresented: $showingLaunchOptions) {
            TerminalLaunchOptionsView(
                store: store,
                commandConfig: commandConfig,
                isLoadingCommandConfig: isLoadingCommandConfig,
                onStartCodexSdk: onStartCodexSdk,
                isCodexSdkLaunching: isCodexSdkLaunching,
                layout: .sheet,
                onDismiss: { showingLaunchOptions = false },
                palette: palette
            )
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
            .background(
                LinearGradient(
                    colors: palette.sheetBackgroundGradient,
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
                            palette: palette,
                            session: session,
                            isActive: session.id == store.activeSessionId,
                            isClosing: store.closingSessionIds.contains(session.id),
                            selectAction: {
                                activePane = .terminal
                                store.selectSession(id: session.id)
                            },
                            closeAction: {
                                Task { await store.closeSession(id: session.id) }
                            }
                        )
                    }
                    ForEach(codexStore.sessions) { session in
                        let snapshot = codexSnapshot(for: session)
                        TerminalSessionTab(
                            namespace: tabNamespace,
                            palette: palette,
                            session: snapshot,
                            isActive: isCodexSessionActive(session.id),
                            isClosing: false,
                            selectAction: {
                                codexStore.activeSessionId = session.id
                                activePane = .codex
                            },
                            closeAction: {
                                Task { await codexStore.deleteSession(id: session.id) }
                            }
                        )
                    }
                }
                .padding(.vertical, 6)
            }

            if store.isOpeningSession {
                ProgressView()
                    .scaleEffect(0.75)
                    .tint(palette.accent)
            }

            Button {
                showingLaunchOptions = true
            } label: {
                Image(systemName: "plus.circle.fill")
                    .font(.title3.weight(.bold))
                    .foregroundStyle(palette.accent)
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
            onStartCodexSdk: onStartCodexSdk,
            isCodexSdkLaunching: isCodexSdkLaunching,
            layout: .inline,
            onDismiss: nil,
            palette: palette
        )
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var codexChatSection: some View {
        CodexSdkChatView(
            store: codexStore,
            worktree: worktree,
            showsSessionStrip: false
        )
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func codexSnapshot(for session: CodexSdkSessionSummary) -> WorktreeSessionSnapshot {
        let state = codexStore.connectionStateBySession[session.id] ?? .idle
        return WorktreeSessionSnapshot(
            id: codexTabIdentifier(for: session.id),
            label: session.label.isEmpty ? "Codex SDK" : session.label,
            kind: "codex",
            tool: TerminalSessionTool.agent.rawValue,
            idle: state != .connected,
            usingTmux: false,
            lastActivityAt: session.lastActivityAt,
            createdAt: session.createdAt,
            tmuxSessionName: nil
        )
    }

    private func codexTabIdentifier(for sessionId: String) -> String {
        "codex-sdk-\(sessionId)"
    }

    private func isCodexSessionActive(_ sessionId: String) -> Bool {
        activePane == .codex && codexStore.activeSessionId == sessionId
    }

    private func syncActivePaneWithAvailableSessions() {
        if codexStore.sessions.isEmpty {
            if activePane == .codex {
                activePane = .terminal
            }
            return
        }
        if store.sessions.isEmpty && activePane != .codex {
            activePane = .codex
        }
    }
}

private struct TerminalSessionTab: View {
    let namespace: Namespace.ID
    let palette: TerminalColorPalette
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
                .foregroundStyle(isActive ? palette.textPrimary : palette.textSecondary)
                .lineLimit(1)

            sessionTypeBadge

            if isClosing {
                ProgressView()
                    .scaleEffect(0.6)
                    .tint(palette.textSecondary)
            } else {
                Button(action: closeAction) {
                    Image(systemName: "xmark")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(palette.iconMuted)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Close session")
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(isActive ? palette.chipActiveBackground : palette.chipInactiveBackground)
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(
                            isActive ? palette.chipActiveBorder : palette.chipInactiveBorder,
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
    let onStartCodexSdk: (() -> Void)?
    let isCodexSdkLaunching: Bool
    let layout: Layout
    let onDismiss: (() -> Void)?
    let palette: TerminalColorPalette
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
                        .foregroundStyle(primaryTextColor)
                    Text("Choose a terminal or agent mode to launch another session in this worktree.")
                        .font(.subheadline)
                        .foregroundStyle(secondaryTextColor)
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
                    codexSdkButton
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
                .foregroundStyle(palette.heroIcon)
            Text("No terminal sessions yet")
                .font(.title3.weight(.semibold))
                .foregroundStyle(primaryTextColor)
            Text("Choose how you want to start working in this worktree.")
                .font(.subheadline)
                .foregroundStyle(secondaryTextColor)
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
                    .foregroundStyle(accentColor)
                Text(title)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(primaryTextColor)
                Spacer()
                trailingIndicator(for: action)
            }
            .padding(.vertical, 12)
            .padding(.horizontal, 16)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(tileBackground)
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .stroke(tileBorder, lineWidth: 1)
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
                    .fill(tileBackground)
                    .overlay(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .stroke(tileBorder, lineWidth: 1)
                    )
                    .frame(width: 46, height: 46)
                if isActionLoading(menuAction) {
                    ProgressView()
                        .scaleEffect(0.65)
                        .tint(accentColor)
                } else {
                    Image(systemName: "chevron.down")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(primaryTextColor)
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
                .tint(accentColor)
        } else {
            Image(systemName: action == .codexDangerous || action == .claudeDangerous ? "exclamationmark.triangle" : "arrow.right")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(
                    action == .codexDangerous || action == .claudeDangerous
                        ? Color.agentrixError
                        : secondaryTextColor
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

    private var primaryTextColor: Color { palette.textPrimary }
    private var secondaryTextColor: Color { palette.textSecondary }
    private var tileBackground: Color { palette.launchBackground }
    private var tileBorder: Color { palette.launchBorder }
    private var accentColor: Color { palette.accent }
    private var backgroundGradient: LinearGradient {
        LinearGradient(
            colors: layout == .inline ? palette.backgroundGradient : palette.sheetBackgroundGradient,
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    @ViewBuilder
    private var loadingRow: some View {
        HStack(spacing: 10) {
            ProgressView()
                .progressViewStyle(.circular)
                .tint(accentColor)
            Text("Refreshing launch options…")
                .font(.footnote)
                .foregroundStyle(secondaryTextColor)
        }
    }

    @ViewBuilder
    private var codexSdkButton: some View {
        if let onStartCodexSdk {
            Button {
                onDismiss?()
                onStartCodexSdk()
            } label: {
                HStack(spacing: 12) {
                    Image(systemName: "sparkles")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(accentColor)
                    Text("Open Codex SDK")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(primaryTextColor)
                    Spacer()
                    if isCodexSdkLaunching {
                        ProgressView()
                            .progressViewStyle(.circular)
                            .tint(accentColor)
                    } else {
                        trailingIndicator(for: .codex)
                            .hidden()
                    }
                }
                .padding(.vertical, 12)
                .padding(.horizontal, 16)
                .background(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(tileBackground)
                        .overlay(
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .stroke(tileBorder, lineWidth: 1)
                        )
                )
            }
            .disabled(isCodexSdkLaunching || store.isOpeningSession)
        }
    }

    @ViewBuilder
    private var footerStatus: some View {
        if let lastUsed = lastLaunchActionLabel {
            Text("Last used: \(lastUsed)")
                .font(.footnote)
                .foregroundStyle(secondaryTextColor)
        }

        if let pendingLabel = store.openingLaunchLabel {
            Text("Starting \(pendingLabel.lowercased()) session…")
                .font(.footnote.weight(.medium))
                .foregroundStyle(secondaryTextColor)
        } else {
            Text("Commands run immediately in the selected session type.")
                .font(.footnote)
                .foregroundStyle(secondaryTextColor)
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
    let palette: TerminalColorPalette

    var body: some View {
        SwiftTermTerminalView(viewModel: viewModel)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .background(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(palette.detailPanelBackground)
                    .overlay(
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .stroke(palette.detailPanelBorder, lineWidth: 1)
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
            bannerContent(icon: "arrow.triangle.2.circlepath", tint: palette.accent, text: "Connecting…")
        case .idle:
            bannerContent(icon: "moon.zzz", tint: .orange, text: "Session idle — reconnect to resume")
        case .closed:
            bannerContent(icon: "xmark.circle", tint: palette.iconMuted, text: "Session closed")
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
                .foregroundStyle(tint)
            Text(text)
                .font(.caption)
                .lineLimit(1)
                .foregroundStyle(palette.textPrimary)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(
            Capsule()
                .fill(palette.badgeBackground)
        )
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
                    .fill(palette.accent.opacity(0.2))
            )
            .foregroundStyle(palette.accent)
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

struct TerminalColorPalette {
    let backgroundGradient: [Color]
    let sheetBackgroundGradient: [Color]
    let panelBackground: Color
    let panelBorder: Color
    let textPrimary: Color
    let textSecondary: Color
    let accent: Color
    let chipActiveBackground: Color
    let chipInactiveBackground: Color
    let chipActiveBorder: Color
    let chipInactiveBorder: Color
    let iconMuted: Color
    let launchBackground: Color
    let launchBorder: Color
    let heroIcon: Color
    let detailPanelBackground: Color
    let detailPanelBorder: Color
    let badgeBackground: Color

    init(colorScheme: ColorScheme) {
        switch colorScheme {
        case .dark:
            backgroundGradient = [
                Color(red: 0.06, green: 0.07, blue: 0.10),
                Color(red: 0.02, green: 0.02, blue: 0.04)
            ]
            sheetBackgroundGradient = backgroundGradient
            panelBackground = Color.white.opacity(0.03)
            panelBorder = Color.white.opacity(0.08)
            textPrimary = Color.white
            textSecondary = Color.white.opacity(0.7)
            accent = Color.agentrixAccent
            chipActiveBackground = Color.white.opacity(0.18)
            chipInactiveBackground = Color.white.opacity(0.07)
            chipActiveBorder = Color.agentrixAccent.opacity(0.7)
            chipInactiveBorder = Color.white.opacity(0.12)
            iconMuted = Color.white.opacity(0.6)
            launchBackground = Color.white.opacity(0.08)
            launchBorder = Color.white.opacity(0.12)
            heroIcon = Color.white.opacity(0.6)
            detailPanelBackground = Color.black.opacity(0.92)
            detailPanelBorder = Color.white.opacity(0.08)
            badgeBackground = Color.white.opacity(0.12)
        default:
            backgroundGradient = [
                Color(red: 0.97, green: 0.98, blue: 1.0),
                Color(red: 0.90, green: 0.94, blue: 0.99)
            ]
            sheetBackgroundGradient = [
                Color(red: 0.94, green: 0.96, blue: 1.0),
                Color(red: 0.87, green: 0.92, blue: 0.98)
            ]
            panelBackground = Color.terminalSystemBackground
            panelBorder = Color.black.opacity(0.06)
            textPrimary = Color.terminalLabel
            textSecondary = Color.terminalSecondaryLabel
            accent = Color.agentrixAccent
            chipActiveBackground = Color.agentrixAccent.opacity(0.18)
            chipInactiveBackground = Color.black.opacity(0.05)
            chipActiveBorder = Color.agentrixAccent.opacity(0.5)
            chipInactiveBorder = Color.black.opacity(0.08)
            iconMuted = Color.black.opacity(0.45)
            launchBackground = Color.white
            launchBorder = Color.black.opacity(0.08)
            heroIcon = Color.black.opacity(0.5)
            detailPanelBackground = Color.white
            detailPanelBorder = Color.black.opacity(0.06)
            badgeBackground = Color.black.opacity(0.07)
        }
    }
}

private extension Color {
    static var terminalSystemBackground: Color {
        #if os(iOS)
        return Color(.systemBackground)
        #else
        return Color(nsColor: .windowBackgroundColor)
        #endif
    }

    static var terminalLabel: Color {
        #if os(iOS)
        return Color(.label)
        #else
        return Color(nsColor: .labelColor)
        #endif
    }

    static var terminalSecondaryLabel: Color {
        #if os(iOS)
        return Color(.secondaryLabel)
        #else
        return Color(nsColor: .secondaryLabelColor)
        #endif
    }
}
