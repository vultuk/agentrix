import XCTest
import UIKit
@testable import AgentrixMobile

final class AgentrixMobileTests: XCTestCase {
    @MainActor
    func testTerminalKeyboardCanBeDismissedAndRestored() {
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 200, height: 200))
        let rootViewController = UIViewController()
        window.rootViewController = rootViewController
        window.makeKeyAndVisible()
        defer {
            window.isHidden = true
        }

        let terminalView = CustomTerminalView(frame: CGRect(x: 0, y: 0, width: 100, height: 100))
        rootViewController.view.addSubview(terminalView)

        terminalView.requestKeyboardFocus()
        waitForRunLoop()
        XCTAssertTrue(terminalView.isFirstResponder, "Terminal should gain focus when requested")

        terminalView.requestKeyboardDismissal()
        waitForRunLoop()
        XCTAssertFalse(terminalView.isFirstResponder, "Terminal should resign first responder when dismissed")

        terminalView.requestKeyboardFocus()
        waitForRunLoop()
        XCTAssertTrue(terminalView.isFirstResponder, "Terminal should regain focus after a tap/refocus request")
    }

    func testRepositoryListingIdentifier() {
        let dto = RepositoryDTO(branches: ["main"], initCommand: "")
        let listing = RepositoryListing(org: "acme", name: "web", dto: dto)
        XCTAssertEqual(listing.id, "acme/web")
        XCTAssertEqual(listing.branches, ["main"])
    }

    func testViewModelDefaultsToDashboardSelection() async throws {
        let services = try makeMockServices()
        let viewModel = await RepositoriesViewModel(services: services, enableRealtime: false)
        try await waitForInitialLoad(of: viewModel)
        guard let selection = await viewModel.selection else {
            XCTFail("Expected selection to be set")
            return
        }
        switch selection {
        case .dashboard(let reference):
            XCTAssertEqual(reference.id, "acme/web")
        default:
            XCTFail("Expected dashboard selection, got \(selection)")
        }
    }

    func testSelectingWorktreeSwitchesBetweenDashboardAndWorktree() async throws {
        let services = try makeMockServices()
        let viewModel = await RepositoriesViewModel(services: services, enableRealtime: false)
        try await waitForInitialLoad(of: viewModel)

        let repository = await viewModel.selectedRepository
        XCTAssertNotNil(repository)

        guard let featureWorktree = await repository?.worktrees.first(where: { $0.branch == "feature/login" }) else {
            XCTFail("Missing feature worktree")
            return
        }

        await MainActor.run {
            viewModel.selectWorktree(featureWorktree)
        }

        switch await viewModel.selection {
        case .worktree(let reference):
            XCTAssertEqual(reference.id, featureWorktree.id)
        default:
            XCTFail("Expected worktree selection after selecting feature branch")
        }

        guard let mainWorktree = await repository?.worktrees.first(where: { $0.branch == "main" }) else {
            XCTFail("Missing main worktree")
            return
        }

        await MainActor.run {
            viewModel.selectWorktree(mainWorktree)
        }

        switch await viewModel.selection {
        case .dashboard(let reference):
            XCTAssertEqual(reference.id, "\(mainWorktree.org)/\(mainWorktree.repo)")
        default:
            XCTFail("Expected dashboard selection when selecting main branch")
        }
    }

    func testIssuePlanPromptIncludesIssueDetails() async throws {
        let services = try makeMockServices()
        let detailViewModel = await makeDetailViewModel(services: services)
        let issue = IssueDetail(
            number: 42,
            title: "Sample Issue",
            body: "This issue affects the main flow.",
            author: IssueDetail.Author(login: "jane", name: "Jane Doe", url: URL(string: "https://github.com/jane"), avatarUrl: nil),
            createdAt: Date(timeIntervalSince1970: 1_700_000_000),
            updatedAt: Date(timeIntervalSince1970: 1_700_000_100),
            labels: [IssueDetail.Label(name: "bug", color: "ff0000")],
            url: URL(string: "https://github.com/acme/web/issues/42"),
            state: "open"
        )
        let detail = RepositoryIssueDetailResponse(org: "acme", repo: "web", issue: issue, fetchedAt: Date())
        let prompt = await detailViewModel.issuePlanPrompt(for: detail)
        XCTAssertTrue(prompt.contains("Sample Issue"))
        XCTAssertTrue(prompt.contains("Repository: acme/web"))
        XCTAssertTrue(prompt.contains("Issue body"), "Prompt should include issue context instructions")
        XCTAssertTrue(prompt.contains("This issue affects the main flow."))
    }

    func testCreatePlanReturnsPlanText() async throws {
        let services = try makeMockServices()
        let detailViewModel = await makeDetailViewModel(services: services)

        MockURLProtocol.requestHandler = { request in
            if request.url?.path == "/api/create-plan" {
                let payload: [String: Any] = ["plan": "Plan from test"]
                let data = try JSONSerialization.data(withJSONObject: payload, options: [])
                let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
                return (response, data)
            }
            return try MockURLProtocol.defaultResponse(for: request)
        }
        defer { MockURLProtocol.requestHandler = MockURLProtocol.defaultResponse(for:) }

        let plan = try await detailViewModel.createPlan(prompt: "Do something")
        XCTAssertEqual(plan, "Plan from test")
    }

    func testFetchDiffReturnsResponse() async throws {
        let services = try makeMockServices()
        let detailViewModel = await makeDetailViewModel(services: services)

        MockURLProtocol.requestHandler = { request in
            if request.url?.path == "/api/git/diff" {
                let payload: [String: Any] = [
                    "path": "Sources/App.swift",
                    "previousPath": NSNull(),
                    "mode": "unstaged",
                    "diff": "@@ -1 +1 @@"
                ]
                let data = try JSONSerialization.data(withJSONObject: payload, options: [])
                let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
                return (response, data)
            }
            return try MockURLProtocol.defaultResponse(for: request)
        }
        defer { MockURLProtocol.requestHandler = MockURLProtocol.defaultResponse(for:) }

        let diff = try await detailViewModel.fetchDiff(path: "Sources/App.swift", previousPath: nil, mode: .unstaged, status: "M")
        XCTAssertEqual(diff.diff, "@@ -1 +1 @@")
        XCTAssertEqual(diff.mode, "unstaged")
    }

    // MARK: - Helpers

    private func makeMockServices() throws -> ServiceRegistry {
        MockURLProtocol.requestHandler = MockURLProtocol.defaultResponse(for:)

        var config = EnvironmentConfig(baseURL: URL(string: "http://localhost:3414")!)
        config.sessionConfiguration.protocolClasses = [MockURLProtocol.self]

        let api = AgentrixAPIClient(config: config)
        let services = ServiceRegistry(
            config: config,
            api: api,
            auth: AuthService(api: api),
            repositories: RepositoriesService(api: api),
            worktrees: WorktreesService(api: api),
            dashboard: DashboardService(api: api),
            plans: PlansService(api: api),
            tasks: TasksService(api: api),
            ports: PortsService(api: api),
            git: GitService(api: api),
            terminal: TerminalService(api: api),
            events: EventStreamService(api: api)
        )
        return services
    }

    private func waitForInitialLoad(of viewModel: RepositoriesViewModel) async throws {
        for _ in 0..<20 {
            if await !viewModel.sections.isEmpty {
                return
            }
            try await Task.sleep(nanoseconds: 50_000_000)
        }
        XCTFail("Timed out waiting for sections to load")
    }

    @MainActor
    private func waitForRunLoop() {
        RunLoop.main.run(until: Date().addingTimeInterval(0.05))
    }

    @MainActor
    private func makeDetailViewModel(services: ServiceRegistry) -> WorktreeDetailViewModel {
        let repository = RepositoryListing(org: "acme", name: "web", dto: RepositoryDTO(branches: ["main"], initCommand: ""))
        let worktree = WorktreeSummary(org: "acme", repo: "web", branch: "main")
        return WorktreeDetailViewModel(
            repository: repository,
            selectedWorktree: worktree,
            services: services,
            sessions: [],
            tasks: [],
            onWorktreeCreated: { _ in },
            onWorktreeDeleted: { _ in }
        )
    }
}

private final class MockURLProtocol: URLProtocol {
    enum Error: Swift.Error {
        case missingHandler
        case response(statusCode: Int, url: URL)
    }

    static var requestHandler: ((URLRequest) throws -> (HTTPURLResponse, Data))?

    override class func canInit(with request: URLRequest) -> Bool {
        true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        guard let handler = MockURLProtocol.requestHandler else {
            client?.urlProtocol(self, didFailWithError: Error.missingHandler)
            return
        }

        do {
            let (response, data) = try handler(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}

    static func defaultResponse(for request: URLRequest) throws -> (HTTPURLResponse, Data) {
        guard let url = request.url else {
            throw AgentrixError.invalidResponse
        }
        let path = url.path
        let method = request.httpMethod ?? "GET"
        let data: Data
        let formatter = ISO8601DateFormatter()

        switch (method, path) {
        case ("GET", "/api/repos"):
            let payload: [String: Any] = [
                "data": [
                    "acme": [
                        "web": [
                            "branches": ["feature/login", "main"],
                            "initCommand": ""
                        ]
                    ]
                ]
            ]
            data = try JSONSerialization.data(withJSONObject: payload, options: [])
        case ("GET", "/api/repos/dashboard"):
            let payload: [String: Any] = [
                "data": [
                    "org": "acme",
                    "repo": "web",
                    "fetchedAt": formatter.string(from: Date()),
                    "pullRequests": ["open": 0],
                    "issues": [
                        "open": 1,
                        "items": [
                            [
                                "number": 42,
                                "title": "Sample issue",
                                "createdAt": formatter.string(from: Date()),
                                "labels": ["bug"],
                                "url": "https://github.com/acme/web/issues/42"
                            ]
                        ]
                    ],
                    "worktrees": ["local": 0],
                    "workflows": ["running": 0]
                ]
            ]
            data = try JSONSerialization.data(withJSONObject: payload, options: [])
        case ("GET", "/api/git/status"):
            let payload: [String: Any] = [
                "status": [
                    "fetchedAt": formatter.string(from: Date()),
                    "org": "acme",
                    "repo": "web",
                    "branch": "main",
                    "files": [
                        "staged": [
                            "items": [],
                            "total": 0,
                            "truncated": false
                        ],
                        "unstaged": [
                            "items": [
                                [
                                    "path": "Sources/App.swift",
                                    "status": "M",
                                    "previousPath": NSNull(),
                                    "description": "Modified Sources/App.swift"
                                ]
                            ],
                            "total": 1,
                            "truncated": false
                        ],
                        "untracked": [
                            "items": [],
                            "total": 0,
                            "truncated": false
                        ],
                        "conflicts": [
                            "items": [],
                            "total": 0,
                            "truncated": false
                        ]
                    ],
                    "commits": [
                        "items": [],
                        "total": 0,
                        "truncated": false
                    ],
                    "totals": [
                        "staged": 0,
                        "unstaged": 1,
                        "untracked": 0,
                        "conflicts": 0
                    ]
                ]
            ]
            data = try JSONSerialization.data(withJSONObject: payload, options: [])
        case ("GET", "/api/sessions"):
            let payload: [String: Any] = ["sessions": []]
            data = try JSONSerialization.data(withJSONObject: payload, options: [])
        case ("GET", "/api/tasks"):
            let payload: [String: Any] = ["tasks": []]
            data = try JSONSerialization.data(withJSONObject: payload, options: [])
        case ("GET", "/api/plans"):
            let payload: [String: Any] = ["data": []]
            data = try JSONSerialization.data(withJSONObject: payload, options: [])
        case ("GET", "/api/ports"):
            let payload: [String: Any] = ["ports": []]
            data = try JSONSerialization.data(withJSONObject: payload, options: [])
        case ("GET", "/api/repos/issue"):
            let payload: [String: Any] = [
                "data": [
                    "org": "acme",
                    "repo": "web",
                    "fetchedAt": formatter.string(from: Date()),
                    "issue": [
                        "number": 42,
                        "title": "Sample issue",
                        "body": "Issue body",
                        "author": [
                            "login": "jane",
                            "name": "Jane Doe",
                            "url": "https://github.com/jane",
                            "avatarUrl": "https://avatars.githubusercontent.com/u/1"
                        ],
                        "createdAt": formatter.string(from: Date().addingTimeInterval(-3600)),
                        "updatedAt": formatter.string(from: Date()),
                        "labels": [
                            ["name": "bug", "color": "ff0000"]
                        ],
                        "url": "https://github.com/acme/web/issues/42",
                        "state": "open"
                    ]
                ]
            ]
            data = try JSONSerialization.data(withJSONObject: payload, options: [])
        case ("POST", "/api/create-plan"):
            let payload: [String: Any] = ["plan": "Generated plan text"]
            data = try JSONSerialization.data(withJSONObject: payload, options: [])
        case ("POST", "/api/git/diff"):
            let payload: [String: Any] = [
                "path": "Sources/App.swift",
                "previousPath": NSNull(),
                "mode": "unstaged",
                "diff": """
@@ -1,3 +1,3 @@
-let message = "Hello"
+let message = "Hello, world"
 print(message)
"""
            ]
            data = try JSONSerialization.data(withJSONObject: payload, options: [])
        default:
            let response = HTTPURLResponse(url: url, statusCode: 404, httpVersion: nil, headerFields: nil)!
            throw MockURLProtocol.Error.response(statusCode: response.statusCode, url: url)
        }

        let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
        return (response, data)
}
