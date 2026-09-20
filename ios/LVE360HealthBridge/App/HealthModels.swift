import Foundation
import HealthKit

enum HealthSignal: String, CaseIterable, Codable, Identifiable {
    case steps
    case sleep
    case restingHeartRate = "resting_heart_rate"
    case weight
    case activeEnergy = "active_energy"
    case exerciseTime = "exercise_time"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .steps: return "Steps"
        case .sleep: return "Sleep duration"
        case .restingHeartRate: return "Resting heart rate"
        case .weight: return "Weight"
        case .activeEnergy: return "Active energy"
        case .exerciseTime: return "Exercise time"
        }
    }

    var sampleType: HKSampleType {
        switch self {
        case .steps: return HKObjectType.quantityType(forIdentifier: .stepCount)!
        case .sleep: return HKObjectType.categoryType(forIdentifier: .sleepAnalysis)!
        case .restingHeartRate: return HKObjectType.quantityType(forIdentifier: .restingHeartRate)!
        case .weight: return HKObjectType.quantityType(forIdentifier: .bodyMass)!
        case .activeEnergy: return HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)!
        case .exerciseTime: return HKObjectType.quantityType(forIdentifier: .appleExerciseTime)!
        }
    }
}

struct HealthDay: Encodable {
    let localDate: String
    let timeZone: String
    let steps: Int?
    let sleepMinutes: Int?
    let restingHeartRate: Double?
    let weightKg: Double?
    let activeEnergyKcal: Double?
    let exerciseMinutes: Int?
    let sourceUpdatedAt: String?
}

struct HealthSyncPayload: Encodable {
    let requestedDataTypes: [String]
    let days: [HealthDay]
    let removedLocalDates: [String]

    func encoded() throws -> Data {
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        return try encoder.encode(self)
    }
}

enum HealthCalendar {
    static func dayString(_ date: Date, in timeZone: TimeZone = .current) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year!, parts.month!, parts.day!)
    }

    static func dayInterval(_ date: Date, in timeZone: TimeZone = .current) -> DateInterval {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        return calendar.dateInterval(of: .day, for: date)!
    }

    static func recentDays(_ count: Int, in timeZone: TimeZone = .current) -> [DateInterval] {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        return (0..<count).reversed().compactMap { offset in
            guard let date = calendar.date(byAdding: .day, value: -offset, to: Date()) else { return nil }
            return calendar.dateInterval(of: .day, for: date)
        }
    }
}
