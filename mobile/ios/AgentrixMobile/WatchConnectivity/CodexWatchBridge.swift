import Foundation
#if os(iOS)
import WatchConnectivity
import Combine

@MainActor
final class CodexWatchBridge: NSObject, ObservableObject {
    private enum MessageType: String {
        case requestSnapshot = "codex.watch.snapshot"
        case sendMessage = "codex.watch.send-message"
    }

    private struct ReplyKey {
        static let status = "status"
        static let payload = "payload"
        static let message = "message"
    }

    private let snapshotBuilder = CodexWatchSnapshotBuilder()
    private let encoder: JSONEncoder
    private weak var codexStore: CodexSdkChatStore?
    private var worktree: WorktreeReference?
    private let session: WCSession?
    private var observationCancellables: Set<AnyCancellable> = []

    override init() {
        if WCSession.isSupported() {
            self.session = WCSession.default
        } else {
            self.session = nil
        }
        self.encoder = JSONEncoder()
        self.encoder.dateEncodingStrategy = .iso8601
        super.init()
        session?.delegate = self
        session?.activate()
    }

    func attach(store: CodexSdkChatStore, worktree: WorktreeReference) {
        codexStore = store
        self.worktree = worktree
        bind(to: store)
        sendCurrentSnapshot()
    }

    func detach(store: CodexSdkChatStore) {
        guard codexStore === store else { return }
        observationCancellables.forEach { $0.cancel() }
        observationCancellables.removeAll()
        codexStore = nil
        worktree = nil
    }

    private func sendCurrentSnapshot() {
        guard
            let snapshot = buildSnapshot(),
            let data = try? encoder.encode(snapshot)
        else { return }
        do {
            try session?.updateApplicationContext([ReplyKey.payload: data])
        } catch {
            // Ignore background sync failures; watch can always request explicitly.
        }
    }

    private func bind(to store: CodexSdkChatStore) {
        observationCancellables.forEach { $0.cancel() }
        observationCancellables.removeAll()
        store.$sessions
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in
                self?.sendCurrentSnapshot()
            }
            .store(in: &observationCancellables)
        store.$eventsBySession
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in
                self?.sendCurrentSnapshot()
            }
            .store(in: &observationCancellables)
    }

    private func buildSnapshot() -> CodexWatchSnapshot? {
        guard let store = codexStore else { return nil }
        return snapshotBuilder.makeSnapshot(
            worktree: worktree ?? store.currentWorktree,
            sessions: store.sessions,
            eventsBySession: store.eventsBySession
        )
    }

    private func handleMessage(_ message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) async {
        guard let rawType = message["type"] as? String, let type = MessageType(rawValue: rawType) else {
            replyHandler([ReplyKey.status: "error", ReplyKey.message: "Unsupported message"])
            return
        }
        switch type {
        case .requestSnapshot:
            guard
                let snapshot = buildSnapshot(),
                let data = try? encoder.encode(snapshot)
            else {
                replyHandler([ReplyKey.status: "error", ReplyKey.message: "Codex data unavailable"])
                return
            }
            replyHandler([ReplyKey.status: "ok", ReplyKey.payload: data])
        case .sendMessage:
            guard
                let sessionId = message["sessionId"] as? String,
                let text = message["text"] as? String,
                let store = codexStore
            else {
                replyHandler([ReplyKey.status: "error", ReplyKey.message: "Missing parameters"])
                return
            }
            let success = await store.sendMessage(text, sessionId: sessionId)
            var response: [String: Any] = [ReplyKey.status: success ? "ok" : "error"]
            if !success {
                response[ReplyKey.message] = "Unable to reach Codex"
            }
            replyHandler(response)
        }
    }
}

extension CodexWatchBridge: WCSessionDelegate {
    nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}

    nonisolated func sessionDidBecomeInactive(_ session: WCSession) {}
    nonisolated func sessionDidDeactivate(_ session: WCSession) {
        Task { await MainActor.run { WCSession.default.activate() } }
    }

    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String : Any], replyHandler: @escaping ([String : Any]) -> Void) {
        Task { await self.handleMessage(message, replyHandler: replyHandler) }
    }
}
#else
@MainActor
final class CodexWatchBridge: ObservableObject {}
#endif
