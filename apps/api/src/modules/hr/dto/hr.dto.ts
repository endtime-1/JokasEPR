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
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { Transform, Type } from "class-transformer";

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

// M14: page/limit existed here but were never read by listEmployees, which
// hard-capped at take: 500 — a company past 500 employees silently lost the
// rest off the end of the list with no way to reach them. page/take are now
// properly validated and wired up (see listEmployees); left with no default
// value here (the service defaults an unset take to 500) so a caller that
// doesn't send them yet keeps getting today's behavior — pagination is
// opt-in, not a breaking change to the un-paginated admin UI.
export class HRQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() priority?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsString() period?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @Transform(({ value }) => parseInt(value, 10)) @IsInt() @Min(1) page?: number;
  @IsOptional() @Transform(({ value }) => parseInt(value, 10)) @IsInt() @Min(1) @Max(1000) take?: number;
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
  @IsOptional() @IsUUID() managerId?: string;
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
  @IsOptional() @IsUUID() managerId?: string;
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
  @IsOptional() @IsNumber() geoLat?: number;
  @IsOptional() @IsNumber() geoLon?: number;
  @IsOptional() @IsString() @MaxLength(240) notes?: string;
}

export class CheckInSelfDto {
  @IsDateString() date!: string;
  @IsOptional() @IsDateString() checkInTime?: string;
  @IsOptional() @IsEnum(AttendanceStatus) status?: AttendanceStatus;
  @IsOptional() @IsNumber() @Min(0) overtimeHours?: number;
  @IsOptional() @IsNumber() geoLat?: number;
  @IsOptional() @IsNumber() geoLon?: number;
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
  @IsOptional() @IsNumber() @Min(0) employerSsnit?: number;
  @IsOptional() @IsNumber() @Min(0) pensionTier2?: number;
  @IsOptional() @IsNumber() @Min(0) pensionTier3?: number;
  @IsOptional() @IsNumber() @Min(0) overtimePay?: number;
  @IsOptional() allowanceBreakdown?: Record<string, number>;
  @IsOptional() @IsDateString() paymentDate?: string;
  @IsOptional() @IsString() paymentMethod?: string;
  @IsOptional() @IsUUID() bankAccountId?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

// ── HR-B: Payroll Intelligence ────────────────────────────────────────────────

export class PayrollPrefillQueryDto {
  @IsUUID() employeeId!: string;
  @IsString() @MaxLength(7) period!: string; // YYYY-MM
}

export class BulkPayrollRunDto {
  @IsString() @MaxLength(10) period!: string;
  @IsDateString() periodStart!: string;
  @IsDateString() periodEnd!: string;
  @IsOptional() @IsArray() @IsUUID(undefined, { each: true }) employeeIds?: string[];
  @IsOptional() @IsUUID() branchId?: string;
}

// ── HR-D: Disciplinary & Grievance ────────────────────────────────────────────

export class CreateDisciplinaryDto {
  @IsUUID() employeeId!: string;
  @IsDateString() incidentDate!: string;
  @IsString() @MaxLength(60) category!: string;
  @IsString() @MaxLength(1000) description!: string;
  @IsString() @MaxLength(500) actionTaken!: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class CreateGrievanceDto {
  @IsUUID() employeeId!: string;
  @IsDateString() submittedDate!: string;
  @IsString() @MaxLength(60) category!: string;
  @IsString() @MaxLength(1000) description!: string;
}

export class ResolveGrievanceDto {
  @IsString() @MaxLength(1000) resolution!: string;
}

export class CreateTrainingRecordDto {
  @IsUUID() employeeId!: string;
  @IsOptional() @IsUUID() courseId?: string;
  @IsString() @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsString() @MaxLength(120) trainer?: string;
  @IsDateString() trainingDate!: string;
  @IsOptional() @IsNumber() @Min(0) durationHours?: number;
  @IsOptional() @IsEnum(TrainingOutcome) outcome?: TrainingOutcome;
  @IsOptional() @IsString() @MaxLength(120) certificate?: string;
  @IsOptional() @IsDateString() certificateExpiry?: string;
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

export class UpdateTaskDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsString() @MaxLength(60) taskType?: string;
  @IsOptional() @IsEnum(TaskPriority) priority?: TaskPriority;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() farmId?: string;
  @IsOptional() @IsUUID() productionSiteId?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class UpdateShiftDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(5) startTime?: string;
  @IsOptional() @IsString() @MaxLength(5) endTime?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() @MaxLength(240) notes?: string;
}

export class UpdateEmployeeRoleDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(240) description?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ReviewPerformanceDto {
  @IsOptional() @IsEnum(HRRating) overallRating?: HRRating;
  @IsOptional() @IsInt() @Min(0) attendanceScore?: number;
  @IsOptional() @IsInt() @Min(0) taskCompletionScore?: number;
  @IsOptional() @IsInt() @Min(0) qualityScore?: number;
  @IsOptional() @IsInt() @Min(0) teamworkScore?: number;
  @IsOptional() @IsString() @MaxLength(1000) comments?: string;
  @IsOptional() @IsString() @MaxLength(500) goals?: string;
}

export class CheckOutSelfDto {
  @IsDateString() date!: string;
  @IsOptional() @IsDateString() checkOutTime?: string;
  @IsOptional() @IsString() @MaxLength(240) notes?: string;
}

export class ComputePayrollDto {
  @IsNumber() @Min(0) basicSalary!: number;
  @IsOptional() @IsNumber() @Min(0) allowances?: number;
  @IsOptional() @IsNumber() @Min(0) deductions?: number;
}

// ── HR-A: Leave Policies ──────────────────────────────────────────────────────

export class CreateLeavePolicyDto {
  @IsString() @MaxLength(120) name!: string;
  @IsEnum(["ANNUAL", "SICK", "MATERNITY", "PATERNITY", "COMPASSIONATE", "UNPAID"]) leaveType!: string;
  @IsInt() @Min(1) daysPerYear!: number;
  @IsOptional() @IsInt() @Min(0) carryOverDays?: number;
  @IsOptional() @IsUUID() employeeRoleId?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateLeavePolicyDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsInt() @Min(1) daysPerYear?: number;
  @IsOptional() @IsInt() @Min(0) carryOverDays?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class InitializeLeaveBalanceDto {
  @IsInt() @Min(2020) year!: number;
  @IsOptional() @IsArray() @IsUUID(undefined, { each: true }) employeeIds?: string[];
}

// ── HR-A: Public Holidays ─────────────────────────────────────────────────────

export class CreatePublicHolidayDto {
  @IsString() @MaxLength(120) name!: string;
  @IsDateString() date!: string;
  @IsOptional() @IsBoolean() isRecurring?: boolean;
  @IsOptional() @IsInt() year?: number;
}

// ── HR-A: Employee Documents ──────────────────────────────────────────────────

export class CreateEmployeeDocumentDto {
  @IsString() @MaxLength(60) docType!: string;
  @IsString() @MaxLength(200) title!: string;
  @IsOptional() @IsDateString() expiryDate?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

// ── HR-F: Training Courses ────────────────────────────────────────────────────

export class CreateTrainingCourseDto {
  @IsString() @MaxLength(30) code!: string;
  @IsString() @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsString() @MaxLength(80) category?: string;
  @IsOptional() @IsNumber() @Min(0) durationHours?: number;
  @IsOptional() @IsString() @MaxLength(120) provider?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateTrainingCourseDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsString() @MaxLength(80) category?: string;
  @IsOptional() @IsNumber() @Min(0) durationHours?: number;
  @IsOptional() @IsString() @MaxLength(120) provider?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

// ── HR-G: Salary Bands ────────────────────────────────────────────────────────

export class CreateSalaryBandDto {
  @IsOptional() @IsUUID() employeeRoleId?: string;
  @IsString() @MaxLength(30) grade!: string;
  @IsNumber() @Min(0) minSalary!: number;
  @IsOptional() @IsNumber() @Min(0) midSalary?: number;
  @IsNumber() @Min(0) maxSalary!: number;
  @IsDateString() effectiveDate!: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class UpdateSalaryBandDto {
  @IsOptional() @IsUUID() employeeRoleId?: string;
  @IsOptional() @IsString() @MaxLength(30) grade?: string;
  @IsOptional() @IsNumber() @Min(0) minSalary?: number;
  @IsOptional() @IsNumber() @Min(0) midSalary?: number;
  @IsOptional() @IsNumber() @Min(0) maxSalary?: number;
  @IsOptional() @IsDateString() effectiveDate?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

// ── HR-G: Job Postings ────────────────────────────────────────────────────────

export class CreateJobPostingDto {
  @IsString() @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(120) department?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() salaryBandId?: string;
  @IsString() description!: string;
  @IsOptional() @IsString() requirements?: string;
  @IsOptional() @IsDateString() closingDate?: string;
}

export class UpdateJobPostingDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(120) department?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() salaryBandId?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() requirements?: string;
  @IsOptional() @IsDateString() closingDate?: string;
}

// ── HR-G: Job Applications ────────────────────────────────────────────────────

export class CreateJobApplicationDto {
  @IsString() @MaxLength(160) applicantName!: string;
  @IsOptional() @IsString() @MaxLength(160) applicantEmail?: string;
  @IsOptional() @IsString() @MaxLength(40) applicantPhone?: string;
  @IsOptional() @IsString() @MaxLength(500) resumeUrl?: string;
  @IsOptional() @IsString() coverLetter?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class UpdateApplicationStatusDto {
  @IsString() @MaxLength(30) status!: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @IsDateString() interviewDate?: string;
}

// ── HR-G: Onboarding ──────────────────────────────────────────────────────────

export class CreateOnboardingItemDto {
  @IsString() @MaxLength(200) title!: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

// ── HR-H: Peer Reviews ────────────────────────────────────────────────────────

export class CreatePeerReviewDto {
  @IsUUID() reviewerEmployeeId!: string;
  @IsString() @MaxLength(30) relationship!: string;
  @IsEnum(HRRating) overallRating!: HRRating;
  @IsOptional() @IsString() @MaxLength(1000) comments?: string;
}

// ── HR-H: Approval Chains ─────────────────────────────────────────────────────

export class CreateApprovalChainDto {
  @IsString() @MaxLength(60) entityType!: string;
  @IsOptional() @IsNumber() @Min(0) minAmount?: number;
  @IsArray() steps!: object[];
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateApprovalChainDto {
  @IsOptional() @IsNumber() @Min(0) minAmount?: number;
  @IsOptional() @IsArray() steps?: object[];
  @IsOptional() @IsBoolean() isActive?: boolean;
}

// ── HR-H: Compliance Reports ──────────────────────────────────────────────────

export class ComplianceReportQueryDto {
  @IsString() @MaxLength(10) period!: string;
}

