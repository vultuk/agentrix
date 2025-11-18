import SwiftUI
import WatchKit

struct CodexSessionDetailView: View {
    @EnvironmentObject private var store: CodexWatchSessionStore
    let sessionId: String
    @State private var isPresentingInput = false

    private var session: CodexWatchSnapshot.Session? {
        store.session(withId: sessionId)
    }

    private var messages: [CodexWatchSnapshot.Message] {
        session?.messages ?? []
    }

    var body: some View {
        VStack(spacing: 12) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 8) {
                        ForEach(messages) { message in
                            CodexMessageBubble(message: message)
                                .id(message.id)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .onChange(of: messages.count) { _ in
                    if let lastId = messages.last?.id {
                        withAnimation {
                            proxy.scrollTo(lastId, anchor: .bottom)
                        }
                    }
                }
            }

            if store.sendingSessionIds.contains(sessionId) {
                HStack {
                    ProgressView()
                    Text("Sending…")
                        .font(.caption2)
                }
            }

            Button {
                presentVoiceReply()
            } label: {
                Label("Reply", systemImage: "mic.fill")
            }
            .buttonStyle(.borderedProminent)
        }
        .navigationTitle(session?.label ?? "Chat")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func presentVoiceReply() {
        guard let controller = WKExtension.shared().visibleInterfaceController else { return }
        controller.presentTextInputController(withSuggestions: nil, allowedInputMode: .plain) { result in
            guard
                let items = result,
                let first = items.first as? String
            else { return }
            Task {
                _ = await store.sendMessage(first, sessionId: sessionId)
            }
        }
    }
}

private struct CodexMessageBubble: View {
    let message: CodexWatchSnapshot.Message

    private var isUser: Bool {
        message.role == .user
    }

    private var bubbleColor: Color {
        isUser ? Color.accentColor : Color.gray.opacity(0.3)
    }

    private var textColor: Color {
        isUser ? Color.black : Color.primary
    }

    var body: some View {
        VStack(alignment: isUser ? .trailing : .leading, spacing: 2) {
            HStack {
                if isUser {
                    Spacer()
                }
                Text(message.text)
                    .font(.body)
                    .foregroundStyle(textColor)
                    .padding(8)
                    .background(bubbleColor, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                if !isUser {
                    Spacer()
                }
            }
        }
    }
}
