import XCTest

final class AgentrixMobileUITests: XCTestCase {
    func testLaunch() throws {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.navigationBars.element.exists || app.buttons["Sign In"].exists)
    }
}
