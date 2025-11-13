import Foundation

final class PortsService {
    private let api: AgentrixAPIClient

    init(api: AgentrixAPIClient) {
        self.api = api
    }

    func fetchPorts() async throws -> [Int] {
        let response: PortsResponse = try await api.request("/api/ports")
        return response.ports
    }

    func openTunnel(port: Int) async throws -> PortTunnel {
        struct Payload: Encodable { let port: Int }
        let response: PortTunnelResponse = try await api.request(
            "/api/ports/tunnel",
            method: .post,
            body: Payload(port: port)
        )
        guard let url = URL(string: response.tunnel.url) else {
            throw AgentrixError.invalidResponse
        }
        return PortTunnel(port: response.tunnel.port, url: url, createdAt: Date(timeIntervalSince1970: response.tunnel.createdAt / 1000))
    }
}
