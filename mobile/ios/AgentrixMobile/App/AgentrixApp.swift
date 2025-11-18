import SwiftUI

@main
struct AgentrixApp: App {
    @StateObject private var coordinator = AppCoordinator()
#if os(iOS)
    @StateObject private var watchBridge = CodexWatchBridge()
    @StateObject private var carPlayBridge = CodexCarPlayBridge.shared
#endif

    var body: some Scene {
        WindowGroup {
            RootContainerView()
                .environmentObject(coordinator)
#if os(iOS)
                .environmentObject(watchBridge)
                .environmentObject(carPlayBridge)
#endif
                .tint(.agentrixAccent)
        }
    }
}

struct RootContainerView: View {
    @EnvironmentObject private var coordinator: AppCoordinator

    var body: some View {
        #if DEBUG
        if let scenario = UITestScenario.current {
            scenario.view
        } else {
            appContent
        }
        #else
        appContent
        #endif
    }

    @ViewBuilder
    private var appContent: some View {
        switch coordinator.route {
        case .checking:
            VStack(spacing: 12) {
                ProgressView()
                Text("Checking authentication…")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        case .unauthenticated:
            AuthView(
                viewModel: AuthViewModel(
                    coordinator: coordinator,
                    settings: coordinator.settings
                )
            )
        case .authenticated:
            HomeView(
                services: coordinator.services,
                logoutAction: { Task { await coordinator.logout() } }
            )
            .id(coordinator.services.id)
        }
    }
}
