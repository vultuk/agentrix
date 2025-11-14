import XCTest
@testable import AgentrixMobile

final class MarkdownRendererTests: XCTestCase {
    func testRendersCodeBlockMarkdown() {
        let markdown = """
        ```swift
        let value = 1
        print(value)
        ```
        """
        let rendered = MarkdownRenderer.attributedString(from: markdown)
        XCTAssertFalse(rendered.characters.isEmpty)
        let plain = String(rendered.characters)
        XCTAssertTrue(plain.contains("let value = 1"))
    }

    func testTrimsWhitespaceOnlyContent() {
        let rendered = MarkdownRenderer.attributedString(from: "   ")
        XCTAssertTrue(rendered.characters.isEmpty)
    }

    func testFallsBackToPlainTextWhenParsingFails() {
        // Construct Markdown that intentionally fails by including unmatched emphasis markers.
        let rendered = MarkdownRenderer.attributedString(from: "***Broken markdown")
        XCTAssertEqual(String(rendered.characters), "***Broken markdown")
    }
}

