#if os(iOS)
import Combine
import Foundation

@MainActor
final class CodexCarPlayBridge: ObservableObject {
    static let shared = CodexCarPlayBridge()

    @Published private(set) var snapshot: CodexWatchSnapshot?

    private let snapshotBuilder = CodexWatchSnapshotBuilder()
    private weak var store: CodexSdkChatStore?
    private var worktree: WorktreeReference?
    private var cancellables: Set<AnyCancellable> = []

    private init() {}

    func attach(store: CodexSdkChatStore, worktree: WorktreeReference) {
        self.store = store
        self.worktree = worktree
        observe(store: store)
        updateSnapshot()
    }

    func detach(store: CodexSdkChatStore) {
        guard self.store === store else { return }
        self.store = nil
        worktree = nil
        cancellables.forEach { $0.cancel() }
        cancellables.removeAll()
        snapshot = nil
    }

    func sendMessage(_ text: String, sessionId: String) async -> Bool {
        await store?.sendMessage(text, sessionId: sessionId) ?? false
    }

    private func observe(store: CodexSdkChatStore) {
        cancellables.forEach { $0.cancel() }
        cancellables.removeAll()

        store.$sessions
            .combineLatest(store.$eventsBySession)
            .sink { [weak self] _, _ in
                guard let self else { return }
                Task { @MainActor in
                    self.updateSnapshot()
                }
            }
            .store(in: &cancellables)
    }

    private func updateSnapshot() {
        guard let store else {
            snapshot = nil
            return
        }
        let snapshot = snapshotBuilder.makeSnapshot(
            worktree: worktree ?? store.currentWorktree,
            sessions: store.sessions,
            eventsBySession: store.eventsBySession
        )
        self.snapshot = snapshot
    }
}
#else
@MainActor
final class CodexCarPlayBridge: ObservableObject {
    static let shared = CodexCarPlayBridge()
}
#endif
