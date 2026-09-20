import XCTest
@testable import LVE360HealthBridge

final class HealthBridgeTests: XCTestCase {
    func testPayloadUsesServerContractAndOnlyDailyValues() throws {
        let payload = HealthSyncPayload(
            requestedDataTypes: ["steps", "sleep"],
            days: [HealthDay(
                localDate: "2026-09-19", timeZone: "America/Denver",
                steps: 4120, sleepMinutes: 455, restingHeartRate: nil,
                weightKg: nil, activeEnergyKcal: nil, exerciseMinutes: nil,
                sourceUpdatedAt: "2026-09-19T16:00:00Z"
            )],
            removedLocalDates: ["2026-09-18"]
        )
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: payload.encoded()) as? [String: Any])
        XCTAssertEqual(object["requested_data_types"] as? [String], ["steps", "sleep"])
        XCTAssertEqual(object["removed_local_dates"] as? [String], ["2026-09-18"])
        let day = try XCTUnwrap((object["days"] as? [[String: Any]])?.first)
        XCTAssertEqual(day["local_date"] as? String, "2026-09-19")
        XCTAssertEqual(day["sleep_minutes"] as? Int, 455)
        XCTAssertNil(day["raw_samples"])
    }

    func testThirtyDayBoundary() {
        let days = HealthCalendar.recentDays(30)
        XCTAssertEqual(days.count, 30)
        XCTAssertEqual(HealthCalendar.dayString(days.last!.start), HealthCalendar.dayString(Date()))
    }
}
