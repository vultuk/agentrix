import Foundation

struct EnvironmentConfig {
    let baseURL: URL
    let sessionConfiguration: URLSessionConfiguration
    let cookieStorage: HTTPCookieStorage

    init(baseURL: URL) {
        let sanitized = EnvironmentConfig.normalise(baseURL: baseURL)
        self.baseURL = sanitized
        let storage = HTTPCookieStorage.shared
        let configuration = URLSessionConfiguration.default
        configuration.httpCookieStorage = storage
        configuration.httpCookieAcceptPolicy = .onlyFromMainDocumentDomain
        configuration.waitsForConnectivity = true
        // Increased timeouts for WebSocket connections which can take longer to establish
        configuration.timeoutIntervalForRequest = 60
        configuration.timeoutIntervalForResource = 300 // 5 minutes for long-lived WebSocket connections
        self.sessionConfiguration = configuration
        self.cookieStorage = storage
    }

    private static func normalise(baseURL: URL) -> URL {
        guard var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else {
            return URL(string: "http://127.0.0.1:3414")!
        }
        if components.scheme == nil {
            components.scheme = "http"
        }
        if components.port == nil && components.scheme == "http" {
            components.port = 3414
        }
        return components.url ?? baseURL
    }

    func url(for path: String) -> URL {
        if path.hasPrefix("http://") || path.hasPrefix("https://") {
            return URL(string: path) ?? baseURL
        }
        var sanitizedPath = path
        if sanitizedPath.hasPrefix("/") {
            sanitizedPath.removeFirst()
        }
        if let relativeURL = URL(string: sanitizedPath, relativeTo: baseURL)?.absoluteURL {
            return relativeURL
        }
        return baseURL.appendingPathComponent(sanitizedPath)
    }

    func terminalWebSocketURL(sessionId: String) -> URL {
        var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) ?? URLComponents()
        components.scheme = components.scheme == "https" ? "wss" : "ws"
        components.path = "/api/terminal/socket"
        components.queryItems = [URLQueryItem(name: "sessionId", value: sessionId)]
        return components.url ?? baseURL
    }
}
