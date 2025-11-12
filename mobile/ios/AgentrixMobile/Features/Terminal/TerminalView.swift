import SwiftUI
import Foundation

struct TerminalConsoleView: View {
    @ObservedObject var store: TerminalSessionsStore
    @Namespace private var tabNamespace

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
        }
    }

    private var emptyState: some View {
        VStack(spacing: 18) {
            Image(systemName: "rectangle.and.pencil.and.ellipsis")
                .font(.system(size: 44))
                .foregroundStyle(Color.white.opacity(0.5))
            Text("No terminal sessions yet")
                .font(.title3.weight(.semibold))
                .foregroundStyle(Color.white)
            Text("Start a shell session to begin working inside this worktree.")
                .font(.subheadline)
                .foregroundStyle(Color.white.opacity(0.6))
                .multilineTextAlignment(.center)
            Button {
                Task { await store.openNewSession(tool: .terminal) }
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "terminal")
                    Text("Open Terminal")
                        .font(.body.weight(.semibold))
                }
                .padding(.horizontal, 18)
                .padding(.vertical, 10)
                .background(
                    Capsule()
                        .fill(Color.agentrixAccent)
                )
                .foregroundStyle(Color.black)
            }
            .buttonStyle(.plain)
            .disabled(store.isOpeningSession)
            .opacity(store.isOpeningSession ? 0.6 : 1)
        }
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

    private var statusColor: Color {
        if isActive { return .agentrixAccent }
        if session.idle { return .orange }
        return .white.opacity(0.45)
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
                            Color.agentrixAccent.opacity(isActive ? 0.8 : 0.25),
                            lineWidth: isActive ? 1.6 : 1
                        )
                        .matchedGeometryEffect(id: "terminal-tab-\(session.id)", in: namespace, isSource: isActive)
                )
        )
        .contentShape(Rectangle())
        .onTapGesture {
            selectAction()
        }
        .animation(.spring(response: 0.32, dampingFraction: 0.85), value: isActive)
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
