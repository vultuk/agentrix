import XCTest
@testable import AgentrixMobile

final class AgentrixMobileTests: XCTestCase {
    func testRepositoryListingIdentifier() {
        let dto = RepositoryDTO(branches: ["main"], initCommand: "", worktrees: [])
        let listing = RepositoryListing(org: "acme", name: "web", dto: dto)
        XCTAssertEqual(listing.id, "acme/web")
        XCTAssertEqual(listing.branches, ["main"])
    }
}
