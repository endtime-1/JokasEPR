import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
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
