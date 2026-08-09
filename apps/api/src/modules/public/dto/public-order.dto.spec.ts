import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { PlacePublicOrderDto } from "./public-order.dto";

function baseFields(quantity: number) {
  return {
    customerName: "Jane Doe",
    customerPhone: "0555555555",
    deliveryAddress: "123 Main St",
    lines: [{ productId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", quantity }]
  };
}

// M10: quantity previously had @Min(1) but no upper bound at all — an anonymous,
// unauthenticated storefront visitor (or a bot) could submit an arbitrary line
// quantity such as 10 billion units.
describe("PlacePublicOrderDto — caps a single line quantity (M10)", () => {
  it("accepts an ordinary bulk quantity", async () => {
    const dto = plainToInstance(PlacePublicOrderDto, baseFields(500));
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("accepts a quantity exactly at the cap", async () => {
    const dto = plainToInstance(PlacePublicOrderDto, baseFields(10000));
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("rejects a quantity one above the cap", async () => {
    const dto = plainToInstance(PlacePublicOrderDto, baseFields(10001));
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "lines")).toBe(true);
  });

  it("rejects an absurd bot-submitted quantity instead of silently accepting it", async () => {
    const dto = plainToInstance(PlacePublicOrderDto, baseFields(10_000_000_000));
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "lines")).toBe(true);
  });

  it("still rejects a quantity below 1, unrelated to the new upper bound", async () => {
    const dto = plainToInstance(PlacePublicOrderDto, baseFields(0));
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "lines")).toBe(true);
  });
});
