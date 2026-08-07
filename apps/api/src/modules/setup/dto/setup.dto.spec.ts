import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { SetupDto } from "./setup.dto";

// M8: setup previously only required @MinLength(8) on the password that
// creates the first company's Super Admin — the weakest policy in the app.
// Now matches change-password/create-user/reset-user-password's regex.
describe("SetupDto.password — matches the app-wide strong-password policy (M8)", () => {
  function baseDto(password: string) {
    return plainToInstance(SetupDto, {
      companyName: "Acme Farms", adminName: "Admin User", email: "admin@acme.test", password
    });
  }

  it("accepts a password with upper/lower/digit/symbol at 10+ chars", async () => {
    const errors = await validate(baseDto("Str0ng!Passw0rd"));
    expect(errors).toHaveLength(0);
  });

  it("rejects a password with only lowercase letters and digits", async () => {
    const errors = await validate(baseDto("weakpass123"));
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects a password shorter than 10 characters even if it meets the character mix", async () => {
    const errors = await validate(baseDto("Ab1!"));
    expect(errors.length).toBeGreaterThan(0);
  });
});
