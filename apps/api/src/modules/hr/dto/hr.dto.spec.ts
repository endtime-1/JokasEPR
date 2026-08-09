import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { BulkAttendanceDto } from "./hr.dto";
import { CreateEmployeeDto } from "./hr.dto";

function baseFields() {
  return { code: "E001", firstName: "Jane", lastName: "Doe", startDate: "2026-01-01" };
}

// L5: email previously used @IsString(), which accepts any string at all —
// "not-an-email" passed validation just as readily as a real address.
describe("CreateEmployeeDto.email — actually validates email format (L5)", () => {
  it("accepts a well-formed email", async () => {
    const dto = plainToInstance(CreateEmployeeDto, { ...baseFields(), email: "jane@company.test" });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("rejects a string that isn't an email at all", async () => {
    const dto = plainToInstance(CreateEmployeeDto, { ...baseFields(), email: "not-an-email" });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "email")).toBe(true);
  });

  it("is still optional — omitting it entirely is fine", async () => {
    const dto = plainToInstance(CreateEmployeeDto, baseFields());
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});

// M16: records was processed with a sequential per-record DB write loop and
// had no array-size cap at all — an arbitrarily large payload could tie up
// the request (and the DB) for a proportionally long time.
describe("BulkAttendanceDto.records — capped at 1000 (M16)", () => {
  function withRecordCount(n: number) {
    return {
      date: "2026-08-01",
      records: Array.from({ length: n }, () => ({ employeeId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", status: "PRESENT" })),
    };
  }

  it("accepts a normal-sized batch", async () => {
    const dto = plainToInstance(BulkAttendanceDto, withRecordCount(50));
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("accepts exactly 1000 records", async () => {
    const dto = plainToInstance(BulkAttendanceDto, withRecordCount(1000));
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("rejects 1001 records instead of accepting an unbounded batch", async () => {
    const dto = plainToInstance(BulkAttendanceDto, withRecordCount(1001));
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "records")).toBe(true);
  });
});
