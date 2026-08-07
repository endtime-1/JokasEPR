import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { NotificationType, UpdatePreferencesDto } from "./notifications.dto";

// M5: previously `preferences` had zero decorators, so under the app's
// global ValidationPipe (whitelist: true, forbidNonWhitelisted: true) any
// real request body was rejected outright — class-validator treats an
// undecorated property as unrecognized. These tests exercise the exact
// whitelist/transform pipeline the app runs in main.ts.
describe("UpdatePreferencesDto — validates instead of always 400ing (M5)", () => {
  it("accepts a well-formed preferences payload with no validation errors", async () => {
    const instance = plainToInstance(UpdatePreferencesDto, {
      preferences: [
        { notificationType: NotificationType.LOW_STOCK_ALERT, inApp: true, email: false, sms: false, whatsapp: false }
      ]
    });

    const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors).toHaveLength(0);
  });

  it("rejects a preferences item with an invalid notificationType", async () => {
    const instance = plainToInstance(UpdatePreferencesDto, {
      preferences: [{ notificationType: "NOT_A_REAL_TYPE", inApp: true, email: false, sms: false, whatsapp: false }]
    });

    const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects a preferences item with a non-boolean channel flag", async () => {
    const instance = plainToInstance(UpdatePreferencesDto, {
      preferences: [{ notificationType: NotificationType.LOW_STOCK_ALERT, inApp: "yes", email: false, sms: false, whatsapp: false }]
    });

    const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.length).toBeGreaterThan(0);
  });
});
