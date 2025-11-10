import Foundation

@MainActor
final class AuthViewModel: ObservableObject {
    @Published var baseURLString: String
    @Published var password: String = ""
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var rememberPassword: Bool {
        didSet { settings.rememberPassword = rememberPassword }
    }

    private let coordinator: AppCoordinator
    private let settings: AppSettingsStore

    init(coordinator: AppCoordinator, settings: AppSettingsStore) {
        self.coordinator = coordinator
        self.settings = settings
        self.baseURLString = settings.baseURLString
        self.rememberPassword = settings.rememberPassword
    }

    func updateBaseURL() {
        guard let url = URL(string: baseURLString), url.host != nil else {
            errorMessage = "Enter a valid base URL"
            return
        }
        settings.updateBaseURL(url)
        coordinator.updateBaseURL(url)
    }

    func submit() async {
        guard !password.isEmpty else {
            errorMessage = "Password is required"
            return
        }
        isLoading = true
        errorMessage = nil
        do {
            try await coordinator.login(password: password)
            settings.rememberPassword = rememberPassword
        } catch let error as AgentrixError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = AgentrixError.unreachable.errorDescription
        }
        isLoading = false
    }
}
