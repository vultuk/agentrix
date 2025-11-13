import Foundation

/// Stores persisted configuration shared across the app lifecycle.
final class AppSettingsStore: ObservableObject {
    @Published var baseURLString: String {
        didSet { persist() }
    }

    @Published var rememberPassword: Bool {
        didSet { persist() }
    }

    private let userDefaults: UserDefaults
    private let baseURLKey = "AgentrixBaseURL"
    private let rememberPasswordKey = "AgentrixRememberPassword"

    init(userDefaults: UserDefaults = .standard) {
        self.userDefaults = userDefaults
        self.baseURLString = userDefaults.string(forKey: baseURLKey) ?? "http://127.0.0.1:3414"
        self.rememberPassword = userDefaults.object(forKey: rememberPasswordKey) as? Bool ?? false
    }

    var baseURL: URL {
        guard let url = URL(string: baseURLString), url.scheme != nil else {
            return URL(string: "http://127.0.0.1:3414")!
        }
        return url
    }

    func updateBaseURL(_ url: URL) {
        baseURLString = url.absoluteString
    }

    private func persist() {
        userDefaults.set(baseURLString, forKey: baseURLKey)
        userDefaults.set(rememberPassword, forKey: rememberPasswordKey)
    }
}
