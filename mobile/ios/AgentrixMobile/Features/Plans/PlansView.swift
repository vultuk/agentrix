import SwiftUI

struct PlansView: View {
    let plans: [PlanRecord]
    let selectedPlan: PlanContentResponse.PlanContent?
    let openPlan: (PlanRecord) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if plans.isEmpty {
                ContentUnavailableView("No plans", systemImage: "doc.text", description: Text("Plans appear after automation saves them."))
            } else {
                ForEach(plans) { plan in
                    Button(action: { openPlan(plan) }) {
                        HStack {
                            VStack(alignment: .leading) {
                                Text(plan.id)
                                    .font(.subheadline)
                                Text(plan.createdAt.formatted())
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.caption)
                        }
                    }
                    .buttonStyle(.plain)
                    .padding()
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(.thinMaterial)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }

            if let selectedPlan {
                Divider()
                Text(selectedPlan.id)
                    .font(.headline)
                ScrollView {
                    Text(MarkdownRenderer.attributedString(from: selectedPlan.content))
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .frame(maxHeight: 240)
            }
        }
    }
}
