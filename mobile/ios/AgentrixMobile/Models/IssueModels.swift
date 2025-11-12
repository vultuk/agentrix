import Foundation

struct RepositoryIssueDetailResponse: Decodable {
    let org: String
    let repo: String
    let issue: IssueDetail
    let fetchedAt: Date?
}

struct IssueDetail: Decodable {
    struct Author: Decodable {
        let login: String?
        let name: String?
        let url: URL?
        let avatarUrl: URL?

        private enum CodingKeys: String, CodingKey {
            case login
            case name
            case url
            case avatarUrl
        }
    }

    struct Label: Decodable, Hashable {
        let name: String
        let color: String?
    }

    let number: Int
    let title: String
    let body: String
    let author: Author?
    let createdAt: Date?
    let updatedAt: Date?
    let labels: [Label]
    let url: URL?
    let state: String?

    private enum CodingKeys: String, CodingKey {
        case number
        case title
        case body
        case author
        case createdAt
        case updatedAt
        case labels
        case url
        case state
    }

    init(
        number: Int,
        title: String,
        body: String,
        author: Author?,
        createdAt: Date?,
        updatedAt: Date?,
        labels: [Label],
        url: URL?,
        state: String?
    ) {
        self.number = number
        self.title = title
        self.body = body
        self.author = author
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.labels = labels
        self.url = url
        self.state = state
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let number = try container.decode(Int.self, forKey: .number)
        let title = try container.decodeIfPresent(String.self, forKey: .title) ?? ""
        let body = try container.decodeIfPresent(String.self, forKey: .body) ?? ""
        let author = try container.decodeIfPresent(Author.self, forKey: .author)
        let createdAt = try container.decodeIfPresent(Date.self, forKey: .createdAt)
        let updatedAt = try container.decodeIfPresent(Date.self, forKey: .updatedAt)
        let labels = try container.decodeIfPresent([Label].self, forKey: .labels) ?? []
        let url = try container.decodeIfPresent(URL.self, forKey: .url)
        let state = try container.decodeIfPresent(String.self, forKey: .state)

        self.init(
            number: number,
            title: title,
            body: body,
            author: author,
            createdAt: createdAt,
            updatedAt: updatedAt,
            labels: labels,
            url: url,
            state: state
        )
    }
}

