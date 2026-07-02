import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

enum EmployeeStatus {
  ACTIVE = "ACTIVE",
  ON_LEAVE = "ON_LEAVE",
  SUSPENDED = "SUSPENDED",
  TERMINATED = "TERMINATED",
  RESIGNED = "RESIGNED",
}

enum Gender {
  MALE = "MALE",
  FEMALE = "FEMALE",
  OTHER = "OTHER",
}

enum AttendanceStatus {
  PRESENT = "PRESENT",
  ABSENT = "ABSENT",
  LATE = "LATE",
  HALF_DAY = "HALF_DAY",
  ON_LEAVE = "ON_LEAVE",
  PUBLIC_HOLIDAY = "PUBLIC_HOLIDAY",
}

enum TaskPriority {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  URGENT = "URGENT",
}

enum TaskStatus {
  OPEN = "OPEN",
  IN_PROGRESS = "IN_PROGRESS",
  ON_HOLD = "ON_HOLD",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}

enum TaskAssignmentStatus {
  ASSIGNED = "ASSIGNED",
  ACCEPTED = "ACCEPTED",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  REJECTED = "REJECTED",
}

enum TrainingOutcome {
  PASSED = "PASSED",
  FAILED = "FAILED",
  ONGOING = "ONGOING",
  CANCELLED = "CANCELLED",
}

enum HRRating {
  OUTSTANDING = "OUTSTANDING",
  EXCEEDS_EXPECTATIONS = "EXCEEDS_EXPECTATIONS",
  MEETS_EXPECTATIONS = "MEETS_EXPECTATIONS",
  NEEDS_IMPROVEMENT = "NEEDS_IMPROVEMENT",
  UNSATISFACTORY = "UNSATISFACTORY",
}

export class HRQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsString() period?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() limit?: string;
}

export class CreateEmployeeRoleDto {
  @IsString() @MaxLength(24) code!: string;
  @IsString() @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(240) description?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateEmployeeDto {
  @IsString() @MaxLength(30) code!: string;
  @IsString() @MaxLength(80) firstName!: string;
  @IsString() @MaxLength(80) lastName!: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsEnum(Gender) gender?: Gender;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(160) email?: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
  @IsOptional() @IsString() @MaxLength(40) nationalId?: string;
  @IsDateString() startDate!: string;
  @IsOptional() @IsEnum(EmployeeStatus) status?: EmployeeStatus;
  @IsOptional() @IsUUID() employeeRoleId?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() farmId?: string;
  @IsOptional() @IsUUID() warehouseId?: string;
  @IsOptional() @IsUUID() productionSiteId?: string;
  @IsOptional() @IsNumber() @Min(0) basicSalary?: number;
  @IsOptional() @IsString() @MaxLength(120) bankName?: string;
  @IsOptional() @IsString() @MaxLength(40) bankAccount?: string;
  @IsOptional() @IsString() @MaxLength(20) ssnitNumber?: string;
  @IsOptional() @IsString() @MaxLength(20) tinNumber?: string;
  @IsOptional() @IsString() @MaxLength(120) emergencyContactName?: string;
  @IsOptional() @IsString() @MaxLength(40) emergencyContactPhone?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class UpdateEmployeeDto {
  @IsOptional() @IsString() @MaxLength(80) firstName?: string;
  @IsOptional() @IsString() @MaxLength(80) lastName?: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsEnum(Gender) gender?: Gender;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(160) email?: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
  @IsOptional() @IsEnum(EmployeeStatus) status?: EmployeeStatus;
  @IsOptional() @IsUUID() employeeRoleId?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() farmId?: string;
  @IsOptional() @IsUUID() warehouseId?: string;
  @IsOptional() @IsUUID() productionSiteId?: string;
  @IsOptional() @IsNumber() @Min(0) basicSalary?: number;
  @IsOptional() @IsString() @MaxLength(120) bankName?: string;
  @IsOptional() @IsString() @MaxLength(40) bankAccount?: string;
  @IsOptional() @IsString() @MaxLength(20) ssnitNumber?: string;
  @IsOptional() @IsString() @MaxLength(20) tinNumber?: string;
  @IsOptional() @IsString() @MaxLength(120) emergencyContactName?: string;
  @IsOptional() @IsString() @MaxLength(40) emergencyContactPhone?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class RecordAttendanceDto {
  @IsUUID() employeeId!: string;
  @IsDateString() date!: string;
  @IsOptional() @IsDateString() checkInTime?: string;
  @IsOptional() @IsDateString() checkOutTime?: string;
  @IsOptional() @IsEnum(AttendanceStatus) status?: AttendanceStatus;
  @IsOptional() @IsUUID() shiftId?: string;
  @IsOptional() @IsString() @MaxLength(240) notes?: string;
}

export class CheckInSelfDto {
  @IsDateString() date!: string;
  @IsOptional() @IsDateString() checkInTime?: string;
  @IsOptional() @IsEnum(AttendanceStatus) status?: AttendanceStatus;
  @IsOptional() @IsString() @MaxLength(240) notes?: string;
}

export class BulkAttendanceItemDto {
  @IsUUID() employeeId!: string;
  @IsEnum(AttendanceStatus) status!: AttendanceStatus;
  @IsOptional() @IsDateString() checkInTime?: string;
  @IsOptional() @IsDateString() checkOutTime?: string;
  @IsOptional() @IsUUID() shiftId?: string;
  @IsOptional() @IsString() @MaxLength(240) notes?: string;
}

export class BulkAttendanceDto {
  @IsDateString() date!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => BulkAttendanceItemDto) records!: BulkAttendanceItemDto[];
}

export class CreateShiftDto {
  @IsString() @MaxLength(24) code!: string;
  @IsString() @MaxLength(120) name!: string;
  @IsString() @MaxLength(5) startTime!: string;
  @IsString() @MaxLength(5) endTime!: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() @MaxLength(240) notes?: string;
}

export class CreateTaskDto {
  @IsString() @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsString() @MaxLength(60) taskType?: string;
  @IsOptional() @IsEnum(TaskPriority) priority?: TaskPriority;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() farmId?: string;
  @IsOptional() @IsUUID() productionSiteId?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
  @IsOptional() @IsArray() @IsUUID(undefined, { each: true }) assigneeIds?: string[];
}

export class UpdateTaskStatusDto {
  @IsEnum(TaskStatus) status!: TaskStatus;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class AssignTaskDto {
  @IsUUID() taskId!: string;
  @IsArray() @IsUUID(undefined, { each: true }) employeeIds!: string[];
}

export class UpdateAssignmentStatusDto {
  @IsEnum(TaskAssignmentStatus) status!: TaskAssignmentStatus;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class CreatePayrollRecordDto {
  @IsUUID() employeeId!: string;
  @IsString() @MaxLength(10) period!: string;
  @IsDateString() periodStart!: string;
  @IsDateString() periodEnd!: string;
  @IsNumber() @Min(0) basicSalary!: number;
  @IsOptional() @IsNumber() @Min(0) allowances?: number;
  @IsOptional() @IsNumber() @Min(0) deductions?: number;
  @IsOptional() @IsNumber() @Min(0) taxDeduction?: number;
  @IsOptional() @IsNumber() @Min(0) ssnit?: number;
  @IsOptional() @IsDateString() paymentDate?: string;
  @IsOptional() @IsString() paymentMethod?: string;
  @IsOptional() @IsUUID() bankAccountId?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class CreateTrainingRecordDto {
  @IsUUID() employeeId!: string;
  @IsString() @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsString() @MaxLength(120) trainer?: string;
  @IsDateString() trainingDate!: string;
  @IsOptional() @IsNumber() @Min(0) durationHours?: number;
  @IsOptional() @IsEnum(TrainingOutcome) outcome?: TrainingOutcome;
  @IsOptional() @IsString() @MaxLength(120) certificate?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class CreatePerformanceRecordDto {
  @IsUUID() employeeId!: string;
  @IsString() @MaxLength(10) period!: string;
  @IsOptional() @IsEnum(HRRating) overallRating?: HRRating;
  @IsOptional() @IsInt() @Min(0) attendanceScore?: number;
  @IsOptional() @IsInt() @Min(0) taskCompletionScore?: number;
  @IsOptional() @IsInt() @Min(0) qualityScore?: number;
  @IsOptional() @IsInt() @Min(0) teamworkScore?: number;
  @IsOptional() @IsString() @MaxLength(1000) comments?: string;
  @IsOptional() @IsString() @MaxLength(500) goals?: string;
}

export class CreateDepartmentAssignmentDto {
  @IsUUID() employeeId!: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() farmId?: string;
  @IsOptional() @IsUUID() warehouseId?: string;
  @IsOptional() @IsUUID() productionSiteId?: string;
  @IsString() @MaxLength(120) department!: string;
  @IsDateString() startDate!: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
  @IsOptional() @IsString() @MaxLength(240) notes?: string;
}

export class CreateLeaveRequestDto {
  @IsEnum(["ANNUAL", "SICK", "MATERNITY", "PATERNITY", "COMPASSIONATE", "UNPAID"]) leaveType!: string;
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;
  @IsInt() @Min(1) daysRequested!: number;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class ReviewLeaveRequestDto {
  @IsEnum(["APPROVED", "REJECTED"]) decision!: string;
  @IsOptional() @IsString() @MaxLength(500) reviewNote?: string;
}

