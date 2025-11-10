import Foundation

struct EmptyResponse: Decodable {}

private struct EmptyBody: Encodable {}

struct APIErrorEnvelope: Decodable {
    let error: String
}

enum HTTPMethod: String {
    case get = "GET"
    case post = "POST"
    case delete = "DELETE"
    case head = "HEAD"
}

final class AgentrixAPIClient {
    let config: EnvironmentConfig
    let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    init(config: EnvironmentConfig) {
        self.config = config
        self.session = URLSession(configuration: config.sessionConfiguration)
        self.decoder = JSONDecoder()
        self.decoder.dateDecodingStrategy = .iso8601
        self.encoder = JSONEncoder()
        self.encoder.dateEncodingStrategy = .iso8601
    }

    func request<T: Decodable, Body: Encodable>(
        _ path: String,
        method: HTTPMethod = .get,
        body: Body? = nil,
        headers: [String: String] = [:]
    ) async throws -> T {
        let request = try buildRequest(path, method: method, body: body, headers: headers)
        let (data, response) = try await session.data(for: request)
        return try processResponse(data: data, response: response)
    }

    func requestVoid<Body: Encodable>(
        _ path: String,
        method: HTTPMethod = .post,
        body: Body? = nil,
        headers: [String: String] = [:]
    ) async throws {
        let request = try buildRequest(path, method: method, body: body, headers: headers)
        let (_, response) = try await session.data(for: request)
        try validate(response: response, data: nil)
    }

    func head(_ path: String) async throws {
        let request = try buildRequest(path, method: .head, body: Optional<String>.none, headers: [:])
        let (_, response) = try await session.data(for: request)
        try validate(response: response, data: nil)
    }

    private func buildRequest<Body: Encodable>(
        _ path: String,
        method: HTTPMethod,
        body: Body?,
        headers: [String: String]
    ) throws -> URLRequest {
        var request = URLRequest(url: config.url(for: path))
        request.httpMethod = method.rawValue
        headers.forEach { request.setValue($0.value, forHTTPHeaderField: $0.key) }
        if let body = body {
            request.httpBody = try encoder.encode(body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        return request
    }

    private func processResponse<T: Decodable>(data: Data, response: URLResponse) throws -> T {
        try validate(response: response, data: data)
        guard !(T.self == EmptyResponse.self && data.isEmpty) else {
            return EmptyResponse() as! T
        }
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw AgentrixError.decodingFailed
        }
    }

    private func validate(response: URLResponse, data: Data?) throws {
        guard let httpResponse = response as? HTTPURLResponse else {
            throw AgentrixError.invalidResponse
        }
        switch httpResponse.statusCode {
        case 200..<300:
            return
        case 401:
            throw AgentrixError.unauthorized
        default:
            if
                let data,
                let envelope = try? decoder.decode(APIErrorEnvelope.self, from: data)
            {
                throw AgentrixError.server(message: envelope.error)
            }
            throw AgentrixError.invalidResponse
        }
    }
}
