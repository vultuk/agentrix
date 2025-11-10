import SwiftUI

@main
struct AgentrixApp: App {
    @StateObject private var coordinator = AppCoordinator()

    var body: some Scene {
        WindowGroup {
            RootContainerView()
                .environmentObject(coordinator)
        }
    }
}

struct RootContainerView: View {
    @EnvironmentObject private var coordinator: AppCoordinator

    var body: some View {
        switch coordinator.route {
        case .checking:
            VStack(spacing: 12) {
                ProgressView()
                Text("Checking authentication…")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color(.systemBackground))
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
