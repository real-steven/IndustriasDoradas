import { HttpStatus, Inject, Injectable } from "@nestjs/common";

import {
  ATTENDANCE_QUERY_REPOSITORY,
  type AttendanceHoursFilters,
  type AttendanceHoursReadModel,
  type AttendanceQueryRepository,
} from "./attendance.contracts";
import { projectAttendanceHoursV1 } from "./attendance-read-model";
import { ApplicationError } from "../common/errors/application-error";

const COSTA_RICA_UTC_HOUR = 6;
const MAX_RANGE_DAYS = 366;

@Injectable()
export class AttendanceService {
  constructor(
    @Inject(ATTENDANCE_QUERY_REPOSITORY)
    private readonly repository: AttendanceQueryRepository,
  ) {}

  async hours(
    organizationId: string,
    filters: AttendanceHoursFilters,
  ): Promise<AttendanceHoursReadModel> {
    const from = parseLocalDate(filters.fromDate);
    const inclusiveTo = parseLocalDate(filters.toDate);
    if (from === null || inclusiveTo === null || from > inclusiveTo) {
      throw invalidPeriod();
    }
    const to = new Date(inclusiveTo);
    to.setUTCDate(to.getUTCDate() + 1);
    const rangeDays = (to.getTime() - from.getTime()) / 86_400_000;
    if (rangeDays > MAX_RANGE_DAYS) {
      throw new ApplicationError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "ATTENDANCE_PERIOD_TOO_LARGE",
        `Attendance period cannot exceed ${MAX_RANGE_DAYS} days`,
      );
    }

    const period = {
      fromDate: filters.fromDate,
      toDate: filters.toDate,
      fromUtc: from.toISOString(),
      toUtc: to.toISOString(),
    };
    const events = await this.repository.listHistory(organizationId, {
      plantId: filters.plantId,
      workerId: filters.workerId,
    });
    return projectAttendanceHoursV1(events, period, new Date());
  }
}

function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(
    Date.UTC(year, month - 1, day, COSTA_RICA_UTC_HOUR, 0, 0, 0),
  );
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return parsed;
}

function invalidPeriod(): ApplicationError {
  return new ApplicationError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    "INVALID_ATTENDANCE_PERIOD",
    "Attendance period must contain valid Costa Rica dates in ascending order",
  );
}
