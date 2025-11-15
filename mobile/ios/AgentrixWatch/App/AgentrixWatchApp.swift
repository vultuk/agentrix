import SwiftUI

@main
struct AgentrixWatchApp: App {
    @StateObject private var store = CodexWatchSessionStore()

    var body: some Scene {
        WindowGroup {
            CodexSessionListView()
                .environmentObject(store)
        }
    }
}
