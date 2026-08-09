import { BadRequestException } from "@nestjs/common";
import { PublicService } from "./public.service";

const mockPrisma = {
  company: { findFirst: jest.fn() },
  customer: { create: jest.fn() },
  product: { findMany: jest.fn() },
  salesOrder: { create: jest.fn() }
};
const mockConfig = { get: jest.fn().mockReturnValue("company-1") };

function makeService() {
  return new PublicService(mockPrisma as never, mockConfig as never);
}

function makeCompany() {
  return {
    id: "company-1", status: "ACTIVE",
    branches: [{ id: "branch-1" }],
    warehouses: [{ id: "wh-1" }]
  };
}

function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: "prod-1", name: "Broiler Chicken", minOrderQty: null,
    priceLists: [{ unitPrice: 25 }],
    ...overrides
  };
}

function makeDto(lines: Array<{ productId: string; quantity: number }>) {
  return {
    customerName: "Jane Doe", customerPhone: "0555555555", deliveryAddress: "123 Main St",
    lines
  } as never;
}

describe("PublicService.placeOrder — closes $0-order and minOrderQty gaps (M7)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.company.findFirst.mockResolvedValue(makeCompany());
    mockPrisma.customer.create.mockResolvedValue({ id: "cust-1" });
    mockPrisma.salesOrder.create.mockResolvedValue({});
  });

  it("places the order fine when priced and above minOrderQty", async () => {
    mockPrisma.product.findMany.mockResolvedValue([makeProduct()]);
    const service = makeService();

    const result = await service.placeOrder(makeDto([{ productId: "prod-1", quantity: 2 }]));

    expect(result.status).toBe("PENDING");
    expect(mockPrisma.salesOrder.create).toHaveBeenCalled();
  });

  it("rejects a $0 order when the product has no active price-list row", async () => {
    mockPrisma.product.findMany.mockResolvedValue([makeProduct({ priceLists: [] })]);
    const service = makeService();

    await expect(service.placeOrder(makeDto([{ productId: "prod-1", quantity: 5 }]))).rejects.toThrow(BadRequestException);
    expect(mockPrisma.salesOrder.create).not.toHaveBeenCalled();
  });

  it("rejects a line quantity below the product's minOrderQty", async () => {
    mockPrisma.product.findMany.mockResolvedValue([makeProduct({ minOrderQty: 10 })]);
    const service = makeService();

    await expect(service.placeOrder(makeDto([{ productId: "prod-1", quantity: 3 }]))).rejects.toThrow(BadRequestException);
    expect(mockPrisma.salesOrder.create).not.toHaveBeenCalled();
  });

  it("allows a line quantity that exactly meets minOrderQty", async () => {
    mockPrisma.product.findMany.mockResolvedValue([makeProduct({ minOrderQty: 10 })]);
    const service = makeService();

    const result = await service.placeOrder(makeDto([{ productId: "prod-1", quantity: 10 }]));
    expect(result.status).toBe("PENDING");
  });
});

describe("PublicService.placeOrder — validates the order before creating a permanent Customer row (M19)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.company.findFirst.mockResolvedValue(makeCompany());
    mockPrisma.customer.create.mockResolvedValue({ id: "cust-1" });
    mockPrisma.salesOrder.create.mockResolvedValue({});
  });

  it("does not create a customer row when a product is unavailable", async () => {
    mockPrisma.product.findMany.mockResolvedValue([]); // requested product not found/not public
    const service = makeService();

    await expect(service.placeOrder(makeDto([{ productId: "prod-1", quantity: 2 }]))).rejects.toThrow(BadRequestException);
    expect(mockPrisma.customer.create).not.toHaveBeenCalled();
  });

  it("does not create a customer row when the order is below minOrderQty", async () => {
    mockPrisma.product.findMany.mockResolvedValue([makeProduct({ minOrderQty: 10 })]);
    const service = makeService();

    await expect(service.placeOrder(makeDto([{ productId: "prod-1", quantity: 3 }]))).rejects.toThrow(BadRequestException);
    expect(mockPrisma.customer.create).not.toHaveBeenCalled();
  });

  it("does not create a customer row when the product has no active price", async () => {
    mockPrisma.product.findMany.mockResolvedValue([makeProduct({ priceLists: [] })]);
    const service = makeService();

    await expect(service.placeOrder(makeDto([{ productId: "prod-1", quantity: 5 }]))).rejects.toThrow(BadRequestException);
    expect(mockPrisma.customer.create).not.toHaveBeenCalled();
  });

  it("only creates the customer row once every validation check has passed", async () => {
    mockPrisma.product.findMany.mockResolvedValue([makeProduct()]);
    const service = makeService();

    await service.placeOrder(makeDto([{ productId: "prod-1", quantity: 2 }]));

    expect(mockPrisma.customer.create).toHaveBeenCalled();
  });
});
