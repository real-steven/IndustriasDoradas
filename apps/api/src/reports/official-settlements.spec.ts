import { officialSettlements } from "./official-settlements";

describe("officialSettlements", () => {
  it("keeps approved or closed revisions that no approved correction replaced", () => {
    const official = officialSettlements([
      { id: "approved", status: "APPROVED", supersedesSettlementId: null },
      { id: "old", status: "APPROVED", supersedesSettlementId: null },
      { id: "correction", status: "CLOSED", supersedesSettlementId: "old" },
      { id: "draft", status: "DRAFT", supersedesSettlementId: null },
      { id: "kept", status: "APPROVED", supersedesSettlementId: null },
      { id: "draft-fix", status: "DRAFT", supersedesSettlementId: "kept" },
    ]);

    expect(official.map((settlement) => settlement.id)).toEqual([
      "approved",
      "correction",
      "kept",
    ]);
  });
});
