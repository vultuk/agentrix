import SwiftUI

struct CodexSdkChatView: View {
    @ObservedObject var store: CodexSdkChatStore
    let worktree: WorktreeSummary

    @State private var composerText = ""

    var body: some View {
        VStack(spacing: 12) {
            header
            sessionStrip
            Divider()
            conversationContent
            composer
        }
        .padding(16)
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
        .task {
            await store.ensureSessionsLoaded()
        }
    }

    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text("Codex SDK Chat")
                    .font(.headline)
                    .foregroundStyle(Color.white)
                Text("\(worktree.org)/\(worktree.repo)#\(worktree.branch)")
                    .font(.caption)
                    .foregroundStyle(Color.white.opacity(0.7))
            }
            Spacer()
            if store.isLoading {
                ProgressView()
                    .progressViewStyle(.circular)
                    .tint(.agentrixAccent)
            }
            Button {
                Task { await store.refreshSessions() }
            } label: {
                Image(systemName: "arrow.clockwise")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(Color.agentrixAccent)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Refresh Codex sessions")
            Button {
                Task {
                    _ = await store.createSession()
                }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "plus.circle.fill")
                    Text(store.isCreatingSession ? "Starting…" : "New Chat")
                        .fontWeight(.semibold)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Color.agentrixAccent.opacity(0.15), in: Capsule())
                .foregroundStyle(Color.agentrixAccent)
            }
            .disabled(store.isCreatingSession)
            .opacity(store.isCreatingSession ? 0.7 : 1)
            .buttonStyle(.plain)
            .accessibilityLabel("Start Codex chat")
        }
    }

    private var sessionStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                if store.sessions.isEmpty {
                    Text("No Codex chats yet. Start one to begin.")
                        .font(.footnote)
                        .foregroundStyle(Color.white.opacity(0.6))
                        .padding(.vertical, 8)
                } else {
                    ForEach(store.sessions) { session in
                        CodexSessionChip(
                            session: session,
                            isActive: session.id == store.activeSessionId,
                            connectionState: store.connectionStateBySession[session.id] ?? .idle,
                            lastError: store.lastErrorBySession[session.id],
                            selectAction: { store.activeSessionId = session.id },
                            closeAction: {
                                Task { await store.deleteSession(id: session.id) }
                            }
                        )
                    }
                }
            }
            .padding(.vertical, 6)
        }
    }

    @ViewBuilder
    private var conversationContent: some View {
        if store.sessions.isEmpty {
            Spacer()
            Text("Codex chats appear here once you start a session.")
                .font(.body)
                .multilineTextAlignment(.center)
                .padding()
                .foregroundStyle(Color.white.opacity(0.65))
            Spacer()
        } else if let session = store.activeSession {
            VStack(alignment: .leading, spacing: 12) {
                sessionStatus(for: session)
                if let error = store.activeLastError {
                    Text(error)
                        .font(.footnote)
                        .foregroundStyle(Color.agentrixError)
                        .padding(8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.agentrixError.opacity(0.12), in: RoundedRectangle(cornerRadius: 8))
                }
                ConversationScrollView(events: store.activeEvents)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        } else {
            Spacer()
            Text("Select a chat to see its history.")
                .font(.body)
                .padding()
                .foregroundStyle(Color.white.opacity(0.75))
            Spacer()
        }
    }

    private func sessionStatus(for session: CodexSdkSessionSummary) -> some View {
        HStack {
            let state = store.connectionStateBySession[session.id] ?? .idle
            Circle()
                .fill(connectionColor(for: state))
                .frame(width: 8, height: 8)
                .shadow(color: connectionColor(for: state).opacity(0.4), radius: 3)
            Text(statusLabel(for: state))
                .font(.caption)
                .foregroundStyle(Color.white.opacity(0.7))
            Spacer()
            if let activity = session.lastActivityAt?.formatted(date: .omitted, time: .shortened) {
                Text("Last activity: \(activity)")
                    .font(.caption2)
                    .foregroundStyle(Color.white.opacity(0.5))
            }
        }
    }

    private var composer: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Describe the next change you need and send it to Codex.")
                .font(.caption)
                .foregroundStyle(Color.white.opacity(0.7))
            VStack(spacing: 8) {
                TextEditor(text: $composerText)
                    .scrollContentBackground(.hidden)
                    .frame(minHeight: 80, maxHeight: 140)
                    .padding(8)
                    .background(Color.black.opacity(0.25), in: RoundedRectangle(cornerRadius: 12))
                    .foregroundStyle(Color.white)
                    .disabled(!isComposerEnabled)
                HStack {
                    Spacer()
                    Button {
                        Task {
                            let sent = await store.sendMessageToActiveSession(composerText)
                            if sent {
                                composerText = ""
                            }
                        }
                    } label: {
                        HStack(spacing: 8) {
                            if store.isSendingActiveMessage {
                                ProgressView()
                                    .progressViewStyle(.circular)
                                    .scaleEffect(0.8)
                            }
                            Text(store.isSendingActiveMessage ? "Sending…" : "Send")
                                .fontWeight(.semibold)
                        }
                        .padding(.horizontal, 18)
                        .padding(.vertical, 10)
                        .background(isComposerEnabled ? Color.agentrixAccent : Color.gray.opacity(0.4), in: Capsule())
                        .foregroundStyle(isComposerEnabled ? Color.black : Color.white.opacity(0.7))
                    }
                    .disabled(!isComposerEnabled || store.isSendingActiveMessage)
                }
            }
        }
    }

    private var isComposerEnabled: Bool {
        guard store.activeSession != nil else { return false }
        let trimmed = composerText.trimmingCharacters(in: .whitespacesAndNewlines)
        let state = store.activeConnectionState
        return !trimmed.isEmpty && state == .connected && !store.isSendingActiveMessage
    }

    private func connectionColor(for state: CodexSdkChatStore.ConnectionState) -> Color {
        switch state {
        case .connected:
            return Color.agentrixAccent
        case .connecting:
            return Color.orange
        case .idle:
            return Color.gray
        case .disconnected:
            return Color.red
        }
    }

    private func statusLabel(for state: CodexSdkChatStore.ConnectionState) -> String {
        switch state {
        case .connected:
            return "Connected"
        case .connecting:
            return "Connecting…"
        case .idle:
            return "Idle"
        case .disconnected:
            return "Disconnected"
        }
    }
}

private struct CodexSessionChip: View {
    let session: CodexSdkSessionSummary
    let isActive: Bool
    let connectionState: CodexSdkChatStore.ConnectionState
    let lastError: String?
    let selectAction: () -> Void
    let closeAction: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(session.label.isEmpty ? "Codex SDK" : session.label)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.white)
                    .lineLimit(1)
                Spacer()
                Button {
                    closeAction()
                } label: {
                    Image(systemName: "xmark")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(Color.white.opacity(0.6))
                        .padding(4)
                }
                .buttonStyle(.plain)
            }
            HStack(spacing: 6) {
                Circle()
                    .fill(connectionColor)
                    .frame(width: 6, height: 6)
                Text(statusLabel)
                    .font(.caption)
                    .foregroundStyle(Color.white.opacity(0.65))
                if let error = lastError {
                    Text(error)
                        .font(.caption2)
                        .foregroundStyle(Color.agentrixError)
                }
            }
        }
        .padding(10)
        .frame(maxWidth: 220)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(isActive ? Color.white.opacity(0.12) : Color.white.opacity(0.05))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(isActive ? Color.agentrixAccent.opacity(0.7) : Color.white.opacity(0.1), lineWidth: 1)
                )
        )
        .onTapGesture(perform: selectAction)
    }

    private var connectionColor: Color {
        switch connectionState {
        case .connected:
            return .agentrixAccent
        case .connecting:
            return .orange
        case .idle:
            return .gray
        case .disconnected:
            return .agentrixError
        }
    }

    private var statusLabel: String {
        switch connectionState {
        case .connected: return "Connected"
        case .connecting: return "Connecting…"
        case .idle: return "Idle"
        case .disconnected: return "Disconnected"
        }
    }
}

private struct ConversationScrollView: View {
    let events: [CodexSdkEvent]

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12) {
                    ForEach(events) { event in
                        CodexEventRow(event: event)
                            .id(event.id)
                    }
                    Color.clear
                        .frame(height: 1)
                        .id("conversation-bottom")
                }
                .padding(.vertical, 4)
            }
            .background(Color.black.opacity(0.15), in: RoundedRectangle(cornerRadius: 16))
            .onChange(of: events.count) { _ in
                withAnimation {
                    proxy.scrollTo("conversation-bottom", anchor: .bottom)
                }
            }
            .onAppear {
                proxy.scrollTo("conversation-bottom", anchor: .bottom)
            }
        }
    }
}

private struct CodexEventRow: View {
    let event: CodexSdkEvent

    var body: some View {
        switch event.type {
        case .ready:
            Text(event.message ?? "Codex is ready.")
                .font(.footnote)
                .foregroundStyle(Color.agentrixAccent)
                .frame(maxWidth: .infinity, alignment: .center)
        case .userMessage:
            HStack {
                Spacer()
                markdownBubble(text: event.text ?? "", background: Color.agentrixAccent.opacity(0.15), foreground: Color.white)
            }
        case .agentResponse:
            HStack {
                markdownBubble(text: event.text ?? "", background: Color.white.opacity(0.08), foreground: Color.white)
                Spacer()
            }
        case .thinking:
            HStack {
                Text(event.text ?? (event.status == "completed" ? "Finished thinking." : "Thinking…"))
                    .font(.callout.italic())
                    .foregroundStyle(Color.white.opacity(0.6))
                Spacer()
            }
        case .log:
            Text(event.message ?? "")
                .font(.caption.monospaced())
                .foregroundStyle(Color.white.opacity(0.55))
        case .error:
            Text(event.message ?? "Something went wrong.")
                .font(.callout.weight(.semibold))
                .foregroundStyle(Color.agentrixError)
        case .usage:
            if !event.usage?.values.isEmpty ?? false {
                let description = event.usage!.values
                    .map { "\($0.key): \(Int($0.value))" }
                    .sorted()
                    .joined(separator: ", ")
                Text("Usage – \(description)")
                    .font(.caption)
                    .foregroundStyle(Color.white.opacity(0.5))
            }
        }
    }

    private func markdownBubble(text: String, background: Color, foreground: Color) -> some View {
        let rendered = (try? AttributedString(markdown: text)) ?? AttributedString(text)
        return Text(rendered)
            .font(.body)
            .foregroundStyle(foreground)
            .padding(10)
            .background(background, in: RoundedRectangle(cornerRadius: 14))
            .frame(maxWidth: 420, alignment: .leading)
    }
}
