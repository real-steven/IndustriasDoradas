import type { AttendanceQueryRepository } from "./attendance.contracts";
import { AttendanceService } from "./attendance.service";

describe("AttendanceService", () => {
  let repository: jest.Mocked<AttendanceQueryRepository>;
  let service: AttendanceService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-10-20T18:00:00.000Z"));
    repository = { listHistory: jest.fn().mockResolvedValue([]) };
    service = new AttendanceService(repository);
  });

  afterEach(() => jest.useRealTimers());

  it("turns inclusive Costa Rica dates into UTC boundaries", async () => {
    const result = await service.hours(ORGANIZATION_ID, {
      fromDate: "2026-10-19",
      toDate: "2026-10-20",
      plantId: PLANT_ID,
      workerId: WORKER_ID,
    });

    expect(repository.listHistory.mock.calls).toContainEqual([
      ORGANIZATION_ID,
      {
        plantId: PLANT_ID,
        workerId: WORKER_ID,
      },
    ]);
    expect(result.period).toEqual({
      fromDate: "2026-10-19",
      toDate: "2026-10-20",
      fromUtc: "2026-10-19T06:00:00.000Z",
      toUtc: "2026-10-21T06:00:00.000Z",
    });
  });

  it.each([
    ["2026-02-30", "2026-03-01", "INVALID_ATTENDANCE_PERIOD"],
    ["2026-10-21", "2026-10-20", "INVALID_ATTENDANCE_PERIOD"],
    ["2025-01-01", "2026-10-20", "ATTENDANCE_PERIOD_TOO_LARGE"],
  ])("rejects an invalid period", async (fromDate, toDate, code) => {
    await expect(
      service.hours(ORGANIZATION_ID, { fromDate, toDate }),
    ).rejects.toMatchObject({ response: { code } });
    expect(repository.listHistory.mock.calls).toHaveLength(0);
  });
});

const ORGANIZATION_ID = "30000000-0000-4000-8000-000000000001";
const PLANT_ID = "31000000-0000-4000-8000-000000000001";
const WORKER_ID = "b1000000-0000-4000-8000-000000000001";
