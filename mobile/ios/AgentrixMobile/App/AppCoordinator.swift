import Foundation
import SwiftUI

@MainActor
final class AppCoordinator: ObservableObject {
    enum Route {
        case checking
        case unauthenticated
        case authenticated
    }

    @Published private(set) var services: ServiceRegistry
    @Published private(set) var route: Route = .checking
    @Published var lastError: AgentrixError?

    let settings: AppSettingsStore

    init(settings: AppSettingsStore = AppSettingsStore()) {
        self.settings = settings
        self.services = ServiceRegistry.make(baseURL: settings.baseURL)
        Task { await refreshAuthStatus() }
    }

    func refreshAuthStatus() async {
        route = .checking
        do {
            let authenticated = try await services.auth.status()
            route = authenticated ? .authenticated : .unauthenticated
        } catch let error as AgentrixError {
            if case .unauthorized = error {
                route = .unauthenticated
            } else {
                lastError = error
                route = .unauthenticated
            }
        } catch {
            lastError = .unreachable
            route = .unauthenticated
        }
    }

    func login(password: String) async throws {
        try await services.auth.login(password: password)
        route = .authenticated
    }

    func logout() async {
        await services.auth.logout()
        route = .unauthenticated
    }

    func updateBaseURL(_ url: URL) {
        settings.updateBaseURL(url)
        services = ServiceRegistry.make(baseURL: url)
        Task { await refreshAuthStatus() }
    }
}

struct ServiceRegistry: Identifiable {
    let id = UUID()
    let config: EnvironmentConfig
    let api: AgentrixAPIClient
    let auth: AuthService
    let repositories: RepositoriesService
    let worktrees: WorktreesService
    let dashboard: DashboardService
    let plans: PlansService
    let tasks: TasksService
    let ports: PortsService
    let git: GitService
    let terminal: TerminalService
    let events: EventStreamService

    static func make(baseURL: URL) -> ServiceRegistry {
        let config = EnvironmentConfig(baseURL: baseURL)
        let api = AgentrixAPIClient(config: config)
        let auth = AuthService(api: api)
        let repositories = RepositoriesService(api: api)
        let worktrees = WorktreesService(api: api)
        let dashboard = DashboardService(api: api)
        let plans = PlansService(api: api)
        let tasks = TasksService(api: api)
        let ports = PortsService(api: api)
        let git = GitService(api: api)
        let terminal = TerminalService(api: api)
        let events = EventStreamService(api: api)
        return ServiceRegistry(
            config: config,
            api: api,
            auth: auth,
            repositories: repositories,
            worktrees: worktrees,
            dashboard: dashboard,
            plans: plans,
            tasks: tasks,
            ports: ports,
            git: git,
            terminal: terminal,
            events: events
        )
    }
}
