import Foundation

struct PlanRecord: Decodable, Identifiable {
    let id: String
    let branch: String
    let createdAt: Date
}

struct PlanListResponse: Decodable {
    let data: [PlanRecord]
}

struct PlanContentResponse: Decodable {
    struct PlanContent: Decodable {
        let id: String
        let branch: String
        let createdAt: Date
        let content: String
    }
    let data: PlanContent
}
