import XCTest

final class AgentrixMobileUITests: XCTestCase {
    func testLaunch() throws {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.navigationBars.element.exists || app.buttons["Sign In"].exists)
    }

    func testWorktreeTabsAccessible() throws {
        let app = XCUIApplication()
        app.launchArguments.append("UITests_WorktreeTabs")
        app.launch()

        let tabBar = app.tabBars.firstMatch
        XCTAssertTrue(tabBar.waitForExistence(timeout: 2), "Tab bar should exist")

        let terminalTab = tabBar.buttons["Terminal"]
        let diffsTab = tabBar.buttons["Diffs"]
        let portsTab = tabBar.buttons["Ports"]
        let plansTab = tabBar.buttons["Plans"]

        XCTAssertTrue(terminalTab.exists, "Terminal tab should exist")
        XCTAssertTrue(diffsTab.exists, "Diffs tab should exist")
        XCTAssertTrue(portsTab.exists, "Ports tab should exist")
        XCTAssertTrue(plansTab.exists, "Plans tab should exist")

        portsTab.tap()
        XCTAssertTrue(app.staticTexts["Active Ports"].waitForExistence(timeout: 2), "Ports content should appear after tapping Ports tab")

        plansTab.tap()
        XCTAssertTrue(app.buttons["New Plan"].waitForExistence(timeout: 2), "Plans tab should expose create button")

        diffsTab.tap()
        XCTAssertTrue(app.staticTexts["Branch feature/demo"].waitForExistence(timeout: 2), "Diffs tab should show git status")
    }
}
