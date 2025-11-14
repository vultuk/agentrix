import SwiftUI
#if canImport(UIKit)
import UIKit
#endif
#if canImport(AppKit)
import AppKit
#endif

struct CodexSdkChatView: View {
    @ObservedObject var store: CodexSdkChatStore
    let worktree: WorktreeSummary
    var showsSessionStrip = true

    @Environment(\.colorScheme) private var colorScheme
    @State private var composerText = ""
    @State private var composerHeight: CGFloat = CodexSdkChatView.defaultComposerLineHeight
    private let composerButtonSize: CGFloat = CodexSdkChatView.defaultComposerLineHeight
    private var palette: CodexChatPalette {
        CodexChatPalette(colorScheme: colorScheme)
    }

    var body: some View {
        VStack(spacing: 12) {
            if showsSessionStrip {
                sessionStrip
                Divider()
            }
            conversationContent
            composer
        }
        .padding(16)
        .background(
            palette.backgroundColor
                .ignoresSafeArea()
        )
        .task {
            await store.ensureSessionsLoaded()
        }
    }

    private var sessionStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                if store.sessions.isEmpty {
                    Text("No Codex chats yet. Start one to begin.")
                        .font(.footnote)
                        .foregroundStyle(palette.textSecondary)
                        .padding(.vertical, 8)
                } else {
                    ForEach(store.sessions) { session in
                        CodexSessionChip(
                            palette: palette,
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
                .foregroundStyle(palette.textSecondary)
            Spacer()
        } else if store.activeSession != nil {
            VStack(alignment: .leading, spacing: 12) {
                if let error = store.activeLastError {
                    Text(error)
                        .font(.footnote)
                        .foregroundStyle(palette.error)
                        .padding(8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(palette.error.opacity(0.12), in: RoundedRectangle(cornerRadius: 8))
                }
                ConversationScrollView(events: store.activeEvents, palette: palette)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        } else {
            Spacer()
            Text("Select a chat to see its history.")
                .font(.body)
                .padding()
                .foregroundStyle(palette.textSecondary)
            Spacer()
        }
    }

    private var composer: some View {
        HStack(alignment: .bottom, spacing: 10) {
            AutoSizingTextEditor(
                text: $composerText,
                calculatedHeight: $composerHeight,
                minHeight: composerButtonSize,
                maxHeight: composerMaxHeight,
                isEditable: isComposerEditable,
                palette: palette
            )
            .frame(maxWidth: .infinity, alignment: .leading)
#if canImport(UIKit)
            keyboardDismissButton
#endif
            sendButton
        }
        .padding(12)
        .background(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .fill(palette.toolbarBackground)
                        .overlay(
                            RoundedRectangle(cornerRadius: 20, style: .continuous)
                                .stroke(palette.toolbarBorder, lineWidth: 1)
                        )
            )
    }

    private var sendButton: some View {
        Button {
            Task {
                let sent = await store.sendMessageToActiveSession(composerText)
                if sent {
                    composerText = ""
                }
            }
        } label: {
            ZStack {
                Circle()
                    .fill(canSendMessage ? palette.accent : palette.sendDisabledBackground)
                    .frame(width: composerButtonSize, height: composerButtonSize)
                    .shadow(color: canSendMessage ? palette.accent.opacity(0.35) : .clear, radius: 6)
                if store.isSendingActiveMessage {
                    ProgressView()
                        .progressViewStyle(.circular)
                        .tint(canSendMessage ? palette.sendActiveIcon : palette.sendDisabledIcon)
                } else {
                    Image(systemName: "paperplane.fill")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(canSendMessage ? palette.sendActiveIcon : palette.sendDisabledIcon)
                }
            }
        }
        .buttonStyle(.plain)
        .disabled(!canSendMessage)
    }

#if canImport(UIKit)
    private var keyboardDismissButton: some View {
        Button(action: dismissKeyboard) {
            Image(systemName: "keyboard.chevron.compact.down")
                .font(.system(size: 16, weight: .semibold))
                .frame(width: composerButtonSize, height: composerButtonSize)
                .foregroundStyle(palette.textSecondary)
                .background(
                    Circle()
                        .fill(palette.iconMutedBackground)
                )
        }
        .buttonStyle(.plain)
    }
#endif

    private var isComposerEditable: Bool {
        guard store.activeSession != nil else { return false }
        return store.activeConnectionState != .disconnected
    }

    private var canSendMessage: Bool {
        guard store.activeSession != nil else { return false }
        let trimmed = composerText.trimmingCharacters(in: .whitespacesAndNewlines)
        return !trimmed.isEmpty && store.activeConnectionState == .connected && !store.isSendingActiveMessage
    }

    private var composerMaxHeight: CGFloat {
        Self.defaultComposerLineHeight * 5
    }

#if canImport(UIKit)
    private func dismissKeyboard() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }
#endif

    private static var defaultComposerLineHeight: CGFloat {
#if canImport(UIKit)
        let line = UIFont.preferredFont(forTextStyle: .body).lineHeight + 8
        return max(line, 30)
#elseif canImport(AppKit)
        let font = NSFont.preferredFont(forTextStyle: .body)
        let lineHeight = (font.ascender - font.descender + font.leading) + 8
        return max(lineHeight, 30)
#else
        return 40
#endif
    }

}

private struct CodexSessionChip: View {
    let palette: CodexChatPalette
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
                    .foregroundStyle(palette.textPrimary)
                    .lineLimit(1)
                Spacer()
                Button {
                    closeAction()
                } label: {
                    Image(systemName: "xmark")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(palette.iconMuted)
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
                    .foregroundStyle(palette.textSecondary)
                if let error = lastError {
                    Text(error)
                        .font(.caption2)
                        .foregroundStyle(palette.error)
                }
            }
        }
        .padding(10)
        .frame(maxWidth: 220)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(isActive ? palette.sessionChipActiveBackground : palette.sessionChipInactiveBackground)
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(isActive ? palette.sessionChipActiveBorder : palette.sessionChipInactiveBorder, lineWidth: 1)
                )
        )
        .onTapGesture(perform: selectAction)
    }

    private var connectionColor: Color {
        switch connectionState {
        case .connected:
            return palette.connectionConnected
        case .connecting:
            return palette.connectionConnecting
        case .idle:
            return palette.connectionIdle
        case .disconnected:
            return palette.connectionDisconnected
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
    let palette: CodexChatPalette

    var body: some View {
        GeometryReader { geometry in
            let bubbleMaxWidth = max(geometry.size.width * 0.7, 1)
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .center, spacing: 12) {
                        ForEach(events) { event in
                            CodexEventRow(event: event, palette: palette, maxBubbleWidth: bubbleMaxWidth)
                                .frame(maxWidth: .infinity, alignment: .center)
                                .id(event.id)
                        }
                        Color.clear
                            .frame(height: 1)
                            .id("conversation-bottom")
                    }
                    .padding(.vertical, 4)
                }
                .background(Color.clear)
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
}

private struct CodexEventRow: View {
    let event: CodexSdkEvent
    let palette: CodexChatPalette
    let maxBubbleWidth: CGFloat

    var body: some View {
        switch event.type {
        case .ready:
            Text(event.message ?? "Codex is ready.")
                .font(.footnote)
                .foregroundStyle(palette.accent)
                .frame(maxWidth: .infinity, alignment: .center)
        case .userMessage:
            HStack {
                Spacer(minLength: 12)
                markdownBubble(
                    text: event.displayText,
                    background: palette.userBubbleBackground,
                    foreground: palette.userBubbleText,
                    maxWidth: maxBubbleWidth,
                    horizontalAlignment: .trailing
                )
            }
            .frame(maxWidth: .infinity, alignment: .trailing)
        case .agentResponse:
            HStack {
                markdownBubble(
                    text: event.displayText,
                    background: palette.agentBubbleBackground,
                    foreground: palette.agentBubbleText,
                    maxWidth: maxBubbleWidth,
                    horizontalAlignment: .leading
                )
                Spacer(minLength: 12)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        case .thinking:
            Text(cleanThinkingLabel(for: event))
                .font(.footnote.weight(.light))
                .foregroundStyle(palette.thinkingText)
                .frame(maxWidth: maxBubbleWidth, alignment: .leading)
                .frame(maxWidth: .infinity, alignment: .leading)
        case .log:
            Text(event.message ?? "")
                .font(.caption.monospaced())
                .foregroundStyle(palette.logText)
                .frame(maxWidth: .infinity, alignment: .leading)
        case .error:
            Text(event.message ?? "Something went wrong.")
                .font(.callout.weight(.semibold))
                .foregroundStyle(palette.error)
                .frame(maxWidth: .infinity, alignment: .leading)
        case .usage:
            EmptyView()
        }
    }

    private func cleanThinkingLabel(for event: CodexSdkEvent) -> String {
        let raw = event.text ?? (event.status == "completed" ? "Finished thinking." : "Thinking…")
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.hasPrefix("**"), trimmed.hasSuffix("**") {
            let start = trimmed.index(trimmed.startIndex, offsetBy: 2)
            let end = trimmed.index(trimmed.endIndex, offsetBy: -2)
            return String(trimmed[start..<end]).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return trimmed
    }

    private func markdownBubble(text: String, background: Color, foreground: Color, maxWidth: CGFloat, horizontalAlignment: HorizontalAlignment) -> some View {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let rendered = MarkdownRenderer.attributedString(from: trimmed)
        let attributed = rendered.characters.isEmpty ? AttributedString(trimmed) : rendered

        return Text(attributed.characters.isEmpty ? AttributedString(" ") : attributed)
            .font(.body)
            .foregroundStyle(foreground)
            .padding(10)
            .background(background, in: RoundedRectangle(cornerRadius: 14))
            .frame(maxWidth: maxWidth, alignment: Alignment(horizontal: horizontalAlignment, vertical: .center))
    }
}

private struct AutoSizingTextEditor: View {
    @Binding var text: String
    @Binding var calculatedHeight: CGFloat
    let minHeight: CGFloat
    let maxHeight: CGFloat
    let isEditable: Bool
    let palette: CodexChatPalette

    var body: some View {
        GeometryReader { proxy in
            let contentWidth = max(proxy.size.width - 16, 1)
            TextEditor(text: $text)
                .scrollContentBackground(.hidden)
                .frame(height: calculatedHeight)
                .disabled(!isEditable)
                .foregroundColor(palette.textPrimary)
                .padding(.vertical, 4)
                .padding(.horizontal, 8)
                .background(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(palette.composerFieldBackground)
                        .overlay(
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .stroke(palette.composerFieldBorder, lineWidth: 1)
                        )
                )
                .onAppear {
                    recalculateHeight(width: contentWidth)
                }
                .onChange(of: text) { _ in
                    recalculateHeight(width: contentWidth)
                }
                .onChange(of: proxy.size.width) { newWidth in
                    let adjusted = max(newWidth - 16, 1)
                    recalculateHeight(width: adjusted)
                }
        }
        .frame(height: calculatedHeight + 8)
    }

    private func recalculateHeight(width: CGFloat) {
        let measured = measuredTextHeight(text, width: width)
        let clamped = min(max(measured, minHeight), maxHeight)
        if abs(calculatedHeight - clamped) > 0.5 {
            calculatedHeight = clamped
        }
    }
}

private func measuredTextHeight(_ text: String, width: CGFloat) -> CGFloat {
    let content = text.isEmpty ? " " : text + "\n"
#if canImport(UIKit)
    let font = UIFont.preferredFont(forTextStyle: .body)
    let attributes: [NSAttributedString.Key: Any] = [.font: font]
    let bounding = NSString(string: content).boundingRect(
        with: CGSize(width: width, height: .greatestFiniteMagnitude),
        options: [.usesLineFragmentOrigin, .usesFontLeading],
        attributes: attributes,
        context: nil
    )
    return ceil(bounding.height)
#elseif canImport(AppKit)
    let font = NSFont.preferredFont(forTextStyle: .body)
    let attributes: [NSAttributedString.Key: Any] = [.font: font]
    let bounding = NSString(string: content).boundingRect(
        with: CGSize(width: width, height: .greatestFiniteMagnitude),
        options: [.usesLineFragmentOrigin],
        attributes: attributes
    )
    return ceil(bounding.height)
#else
    return 44
#endif
}

private struct CodexChatPalette {
    let backgroundGradient: [Color]
    let backgroundColor: Color
    let panelBackground: Color
    let textPrimary: Color
    let textSecondary: Color
    let accent: Color
    let error: Color
    let sessionChipActiveBackground: Color
    let sessionChipInactiveBackground: Color
    let sessionChipActiveBorder: Color
    let sessionChipInactiveBorder: Color
    let connectionConnected: Color
    let connectionConnecting: Color
    let connectionIdle: Color
    let connectionDisconnected: Color
    let composerFieldBackground: Color
    let composerFieldBorder: Color
    let toolbarBackground: Color
    let toolbarBorder: Color
    let userBubbleBackground: Color
    let userBubbleText: Color
    let agentBubbleBackground: Color
    let agentBubbleText: Color
    let logText: Color
    let thinkingText: Color
    let iconMuted: Color
    let iconMutedBackground: Color
    let sendDisabledBackground: Color
    let sendDisabledIcon: Color
    let sendActiveIcon: Color

    init(colorScheme: ColorScheme) {
        switch colorScheme {
        case .dark:
            backgroundGradient = [
                Color.iMessageBackgroundDark,
                Color.iMessageBackgroundDark.opacity(0.95)
            ]
            backgroundColor = Color.clear
            panelBackground = Color.clear
            textPrimary = Color.white
            textSecondary = Color.white.opacity(0.65)
            accent = Color.agentrixAccent
            error = Color.agentrixError
            sessionChipActiveBackground = Color.white.opacity(0.12)
            sessionChipInactiveBackground = Color.white.opacity(0.05)
            sessionChipActiveBorder = Color.agentrixAccent.opacity(0.7)
            sessionChipInactiveBorder = Color.white.opacity(0.1)
            connectionConnected = Color.agentrixAccent
            connectionConnecting = Color.orange
            connectionIdle = Color.gray
            connectionDisconnected = Color.agentrixError
            composerFieldBackground = Color.white.opacity(0.06)
            composerFieldBorder = Color.white.opacity(0.15)
            toolbarBackground = Color.white.opacity(0.04)
            toolbarBorder = Color.white.opacity(0.08)
            userBubbleBackground = Color.iMessageBubbleBlue
            userBubbleText = Color.white
            agentBubbleBackground = Color.iMessageBubbleGrayDark
            agentBubbleText = Color.white
            logText = Color.white.opacity(0.55)
            thinkingText = Color.white.opacity(0.6)
            iconMuted = Color.white.opacity(0.65)
            iconMutedBackground = Color.white.opacity(0.18)
            sendDisabledBackground = Color.white.opacity(0.18)
            sendDisabledIcon = Color.white.opacity(0.75)
            sendActiveIcon = Color.black
        default:
            backgroundGradient = [
                Color.iMessageBackgroundLight,
                Color.white
            ]
            backgroundColor = Color.clear
            panelBackground = Color.clear
            textPrimary = Color.black.opacity(0.9)
            textSecondary = Color.black.opacity(0.6)
            accent = Color.agentrixAccent
            error = Color.agentrixError
            sessionChipActiveBackground = Color.agentrixAccent.opacity(0.1)
            sessionChipInactiveBackground = Color.white
            sessionChipActiveBorder = Color.agentrixAccent.opacity(0.3)
            sessionChipInactiveBorder = Color.black.opacity(0.05)
            connectionConnected = Color.agentrixAccent
            connectionConnecting = Color.orange
            connectionIdle = Color.gray.opacity(0.5)
            connectionDisconnected = Color.agentrixError
            composerFieldBackground = Color.white
            composerFieldBorder = Color.black.opacity(0.04)
            toolbarBackground = Color.white.opacity(0.9)
            toolbarBorder = Color.black.opacity(0.05)
            userBubbleBackground = Color.iMessageBubbleBlue
            userBubbleText = Color.white
            agentBubbleBackground = Color.iMessageBubbleGrayLight
            agentBubbleText = Color.black.opacity(0.85)
            logText = Color.black.opacity(0.5)
            thinkingText = Color.black.opacity(0.45)
            iconMuted = Color.black.opacity(0.4)
            iconMutedBackground = Color.black.opacity(0.05)
            sendDisabledBackground = Color.black.opacity(0.07)
            sendDisabledIcon = Color.black.opacity(0.5)
            sendActiveIcon = Color.white
        }
    }
}

private extension Color {
    static var codexPanelBackground: Color {
#if canImport(UIKit)
        Color(UIColor.secondarySystemBackground)
#else
        Color(nsColor: .underPageBackgroundColor)
#endif
    }

    static var codexCardBackground: Color {
#if canImport(UIKit)
        Color(UIColor.systemGray6)
#else
        Color(nsColor: .controlBackgroundColor)
#endif
    }

    static var codexAgentBubble: Color {
#if canImport(UIKit)
        Color(UIColor.systemGray5)
#else
        Color(nsColor: .windowBackgroundColor)
#endif
    }

    static var codexFieldBackground: Color {
#if canImport(UIKit)
        Color(UIColor.secondarySystemBackground)
#else
        Color(nsColor: .textBackgroundColor)
#endif
    }

    static var codexToolbarBackground: Color {
#if canImport(UIKit)
        Color(UIColor.systemGray5).opacity(0.9)
#else
        Color(nsColor: .underPageBackgroundColor)
#endif
    }

    static var codexLabel: Color {
#if canImport(UIKit)
        Color(UIColor.label)
#else
        Color(nsColor: .labelColor)
#endif
    }

    static var codexSecondaryLabel: Color {
#if canImport(UIKit)
        Color(UIColor.secondaryLabel)
#else
        Color(nsColor: .secondaryLabelColor)
#endif
    }

    static var iMessageBackgroundLight: Color {
        Color(red: 0.94, green: 0.95, blue: 0.97)
    }

    static var iMessageBackgroundDark: Color {
        Color(red: 0.08, green: 0.09, blue: 0.12)
    }

    static var iMessageBubbleBlue: Color {
        Color(red: 0.09, green: 0.48, blue: 1.0)
    }

    static var iMessageBubbleGrayLight: Color {
        Color(red: 0.90, green: 0.90, blue: 0.94)
    }

    static var iMessageBubbleGrayDark: Color {
        Color(red: 0.23, green: 0.24, blue: 0.28)
    }
}

private extension CodexSdkEvent {
    var displayText: String {
        if let text {
            let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty {
                return trimmed
            }
        }
        if let message {
            let trimmed = message.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty {
                return trimmed
            }
        }
        return ""
    }
}
