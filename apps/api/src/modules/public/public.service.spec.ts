import { BadRequestException } from "@nestjs/common";
import { PublicService } from "./public.service";

const mockPrisma = {
  company: { findFirst: jest.fn() },
  storefrontLead: { create: jest.fn(), count: jest.fn().mockResolvedValue(0) },
  priceList: { updateMany: jest.fn(), findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn(), create: jest.fn() },
  customer: { create: jest.fn() },
  product: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  salesOrder: { create: jest.fn(), count: jest.fn().mockResolvedValue(0) },
  $transaction: jest.fn()
};
// placeOrder() wraps customer+order creation in one $transaction (M19
// follow-up) — the callback receives `tx`, which here just aliases the same
// mocks so existing assertions against mockPrisma.customer.create /
// mockPrisma.salesOrder.create keep working unchanged. Assigned after the
// object literal (not inline) since referencing mockPrisma inside its own
// initializer breaks TS's type inference for the object.
mockPrisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(mockPrisma));
const mockConfig = { get: jest.fn().mockReturnValue("company-1") };
const mockEmail = { send: jest.fn().mockResolvedValue(true) };

function makeService() {
  return new PublicService(mockPrisma as never, mockConfig as never, mockEmail as never);
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

  it("accepts an unpriced feed as an ORDER REQUEST, flagged for the team to price", async () => {
    mockPrisma.product.findMany.mockResolvedValue([makeProduct({ priceLists: [] })]);
    const service = makeService();

    const result = await service.placeOrder({ customerName: "Jane Doe", customerPhone: "0555555555", deliveryAddress: "123 Main St", notes: "Deliver to Ejisu", lines: [{ productId: "prod-1", quantity: 5 }] } as never);

    expect(result.message).toMatch(/order request/i);
    const data = mockPrisma.salesOrder.create.mock.calls[0][0].data;
    expect(data.notes).toMatch(/^PRICE TO BE CONFIRMED: .+Deliver to Ejisu$/);
    expect(data.status).toBe("PENDING_STOCK_APPROVAL");
    expect(data.totalAmount).toBe(0);
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

  it("still creates the customer and order for an unpriced feed (an order request the team prices by phone)", async () => {
    mockPrisma.product.findMany.mockResolvedValue([makeProduct({ priceLists: [] })]);
    const service = makeService();

    await service.placeOrder(makeDto([{ productId: "prod-1", quantity: 5 }]));

    expect(mockPrisma.customer.create).toHaveBeenCalled();
    expect(mockPrisma.salesOrder.create).toHaveBeenCalled();
  });

  it("only creates the customer row once every validation check has passed", async () => {
    mockPrisma.product.findMany.mockResolvedValue([makeProduct()]);
    const service = makeService();

    await service.placeOrder(makeDto([{ productId: "prod-1", quantity: 2 }]));

    expect(mockPrisma.customer.create).toHaveBeenCalled();
  });
});

describe("PublicService.submitContact — saves the enquiry, then emails it (L5)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig.get.mockImplementation((key: string, fallback?: string) => (key === "STOREFRONT_COMPANY_ID" ? undefined : fallback));
    mockPrisma.company.findFirst.mockResolvedValue({ id: "company-1" });
    mockPrisma.storefrontLead.create.mockResolvedValue({ id: "lead-1" });
  });

  const dto = { name: "Jane Doe", phone: "0555555555", message: "Interested in bulk broiler feed." };

  it("saves the enquiry and emails it to the configured contact address", async () => {
    mockEmail.send.mockResolvedValue(true);

    const result = await makeService().submitContact(dto as never);

    expect(result.sent).toBe(true);
    expect(mockPrisma.storefrontLead.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ companyId: "company-1", kind: "CONTACT", name: "Jane Doe", phone: "0555555555" })
    });
    expect(mockEmail.send).toHaveBeenCalledWith("farmersupport@akokofeeds.com", expect.any(String), expect.stringContaining("Jane Doe"));
  });

  it("escapes HTML in the submitted fields before embedding them in the email body", async () => {
    mockEmail.send.mockResolvedValue(true);

    await makeService().submitContact({ ...dto, name: "<img src=x onerror=alert(1)>" } as never);

    const html = mockEmail.send.mock.calls[0][2] as string;
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
    expect(html).toContain("&lt;img");
  });

  it("still succeeds when the email cannot be sent, because the enquiry is already saved", async () => {
    mockEmail.send.mockResolvedValue(false);

    await expect(makeService().submitContact(dto as never)).resolves.toEqual({ sent: true });
    expect(mockPrisma.storefrontLead.create).toHaveBeenCalledTimes(1);
  });
});

describe("PublicService.submitRetailerApplication", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig.get.mockImplementation((key: string, fallback?: string) => (key === "STOREFRONT_COMPANY_ID" ? undefined : fallback));
    mockPrisma.company.findFirst.mockResolvedValue({ id: "company-1" });
    mockPrisma.storefrontLead.create.mockResolvedValue({ id: "lead-2" });
  });

  it("saves the application and emails sales plus the copy address", async () => {
    mockEmail.send.mockResolvedValue(true);

    await makeService().submitRetailerApplication({ name: "Kofi", location: "Ejisu", phone: "0201112222", isDistributor: true, distributorFeed: "Layer 1" } as never);

    expect(mockPrisma.storefrontLead.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ kind: "RETAILER", location: "Ejisu", isDistributor: true, distributorFeed: "Layer 1" })
    });
    const recipients = mockEmail.send.mock.calls.map((c) => c[0]);
    expect(recipients).toEqual(["sales@akokofeeds.com", "akokofeeds@gmail.com"]);
  });

  it("does not store a feed when the applicant is not a distributor", async () => {
    mockEmail.send.mockResolvedValue(true);

    await makeService().submitRetailerApplication({ name: "Ama", location: "Kumasi", phone: "0244445555", isDistributor: false, distributorFeed: "ignored" } as never);

    expect(mockPrisma.storefrontLead.create).toHaveBeenCalledWith({ data: expect.objectContaining({ isDistributor: false, distributorFeed: undefined }) });
  });
});

describe("PublicService.adminUpdateProduct — publishing", () => {
  beforeEach(() => jest.clearAllMocks());

  it("gives a product with no web address a unique slug and the Feed category when it is published", async () => {
    mockPrisma.product.findFirst
      .mockResolvedValueOnce({ id: "p1", name: "Layer 1 Concentrate", publicSlug: null, storefrontCategory: null }) // ownership
      .mockResolvedValueOnce({ id: "other" }) // "layer-1-concentrate" already taken
      .mockResolvedValueOnce(null); // "layer-1-concentrate-2" is free
    mockPrisma.product.update.mockResolvedValue({ id: "p1", isPublic: true, publicSlug: "layer-1-concentrate-2" });

    await makeService().adminUpdateProduct("company-1", "p1", { isPublic: true } as never);

    expect(mockPrisma.product.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { isPublic: true, publicSlug: "layer-1-concentrate-2", storefrontCategory: "Feed" }
    });
  });

  it("keeps an existing slug and category when publishing", async () => {
    mockPrisma.product.findFirst.mockResolvedValueOnce({ id: "p1", name: "Layer 1 Mash", publicSlug: "layer-1-mash", storefrontCategory: "Feed" });
    mockPrisma.product.update.mockResolvedValue({ id: "p1", isPublic: true, publicSlug: "layer-1-mash" });

    await makeService().adminUpdateProduct("company-1", "p1", { isPublic: true } as never);

    expect(mockPrisma.product.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { isPublic: true } });
  });
});

describe("PublicService.adminPublishFeedProducts", () => {
  beforeEach(() => jest.clearAllMocks());

  it("publishes finished feed products only, with a slug, the Feed category and a bag label", async () => {
    mockPrisma.product.findMany.mockResolvedValue([
      { id: "p1", name: "Layer 1 Mash", publicSlug: null, storefrontCategory: null, unitLabel: null },
      { id: "p2", name: "Maize", publicSlug: null, storefrontCategory: null, unitLabel: null },
      { id: "p3", name: "Super Chicks Concentrate", publicSlug: "super-chicks-conc", storefrontCategory: "Feed", unitLabel: "bag" },
    ]);
    mockPrisma.product.findFirst.mockResolvedValue(null); // no slug clashes
    mockPrisma.product.update.mockResolvedValue({});

    const res = await makeService().adminPublishFeedProducts("company-1");

    expect(res.data.published).toBe(2);
    expect(res.data.names).toEqual(["Layer 1 Mash", "Super Chicks Concentrate"]);
    expect(mockPrisma.product.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { isPublic: true, publicSlug: "layer-1-mash", storefrontCategory: "Feed", unitLabel: "50 kg bag" } });
    expect(mockPrisma.product.update).toHaveBeenCalledWith({ where: { id: "p3" }, data: { isPublic: true, publicSlug: "super-chicks-conc", storefrontCategory: "Feed", unitLabel: "bag" } });
    expect(mockPrisma.product.update).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: "p2" } }));
  });

  it("sells by the kg (minimum 50) when the product's stock unit is kilograms", async () => {
    mockPrisma.product.findMany.mockResolvedValue([
      { id: "p9", name: "Developer Mash", publicSlug: null, storefrontCategory: null, unitLabel: null, minOrderQty: 1, uom: { name: "Kilogram", code: "KG", symbol: "kg" } },
    ]);
    mockPrisma.product.findFirst.mockResolvedValue(null);
    mockPrisma.product.update.mockResolvedValue({});

    await makeService().adminPublishFeedProducts("company-1");

    expect(mockPrisma.product.update).toHaveBeenCalledWith({ where: { id: "p9" }, data: { isPublic: true, publicSlug: "developer-mash", storefrontCategory: "Feed", unitLabel: "kg", minOrderQty: 50 } });
  });
});

describe("PublicService.adminUpdateProduct — price (the shop never touches Sales price lists)", () => {
  const publicProduct = { id: "p1", name: "Layer 1 Mash", publicSlug: "layer-1-mash", storefrontCategory: "Feed" };
  const salesPrice = { id: "pl-sales", name: "Retail", unitPrice: 25, customerGroupId: null, branchId: null, validFrom: new Date("2026-01-01") };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.product.findFirst.mockResolvedValue(publicProduct);
    mockPrisma.product.update.mockResolvedValue({ id: "p1", isPublic: true, publicSlug: "layer-1-mash" });
    mockPrisma.priceList.findMany.mockResolvedValue([]);
  });

  it("clearing a shop price writes a 0 Storefront row and leaves the Sales price list alone, so it does not come back", async () => {
    mockPrisma.priceList.findMany.mockResolvedValue([salesPrice]);

    await makeService().adminUpdateProduct("company-1", "p1", { unitPrice: 0 } as never);

    expect(mockPrisma.priceList.create).toHaveBeenCalledWith({ data: expect.objectContaining({ productId: "p1", name: "Storefront Price", unitPrice: 0 }) });
    expect(mockPrisma.priceList.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.priceList.update).not.toHaveBeenCalled();
  });

  it("clearing again updates the existing Storefront row instead of adding another", async () => {
    mockPrisma.priceList.findMany.mockResolvedValue([
      { id: "pl-shop", name: "Storefront Price", unitPrice: 30, customerGroupId: null, branchId: null, validFrom: new Date("2026-02-01") },
      salesPrice,
    ]);

    await makeService().adminUpdateProduct("company-1", "p1", { unitPrice: 0 } as never);

    expect(mockPrisma.priceList.update).toHaveBeenCalledWith({ where: { id: "pl-shop" }, data: { unitPrice: 0 } });
    expect(mockPrisma.priceList.create).not.toHaveBeenCalled();
  });

  it("setting a price creates the Storefront row (no existing prices)", async () => {
    await makeService().adminUpdateProduct("company-1", "p1", { unitPrice: 42 } as never);

    expect(mockPrisma.priceList.create).toHaveBeenCalledWith({ data: expect.objectContaining({ name: "Storefront Price", unitPrice: 42 }) });
  });

  it("does nothing when the price shown is saved unchanged (no copy of a Sales price)", async () => {
    mockPrisma.priceList.findMany.mockResolvedValue([salesPrice]);

    await makeService().adminUpdateProduct("company-1", "p1", { unitPrice: 25, unitLabel: "kg" } as never);

    expect(mockPrisma.priceList.create).not.toHaveBeenCalled();
    expect(mockPrisma.priceList.update).not.toHaveBeenCalled();
  });

  it("leaves prices alone when no price is sent", async () => {
    await makeService().adminUpdateProduct("company-1", "p1", { unitLabel: "kg" } as never);

    expect(mockPrisma.priceList.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.priceList.create).not.toHaveBeenCalled();
  });
});

describe("PublicService shop price lookup", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig.get.mockImplementation((key: string, fallback?: string) => (key === "STOREFRONT_COMPANY_ID" ? undefined : fallback));
    mockPrisma.company.findFirst.mockResolvedValue({ id: "company-1" });
  });

  const listed = (priceLists: unknown[]) => {
    mockPrisma.product.findMany.mockResolvedValue([{ id: "p1", name: "Layer 1 Mash", publicSlug: "layer-1-mash", minOrderQty: 1, unitLabel: "kg", priceLists }]);
    return makeService().listProducts();
  };

  it("ignores customer-group and branch prices, so a wholesale price is never shown to the public", async () => {
    const out = await listed([
      { name: "Wholesale", unitPrice: 5, customerGroupId: "grp-1", branchId: null, validFrom: new Date("2026-03-01") },
      { name: "Kumasi branch", unitPrice: 6, customerGroupId: null, branchId: "br-1", validFrom: new Date("2026-02-01") },
      { name: "Retail", unitPrice: 25, customerGroupId: null, branchId: null, validFrom: new Date("2026-01-01") },
    ]);
    expect(out[0].unitPrice).toBe(25);
  });

  it("a Storefront row of 0 means no online price (no fall back to the Sales price)", async () => {
    const out = await listed([
      { name: "Storefront Price", unitPrice: 0, customerGroupId: null, branchId: null, validFrom: new Date("2026-04-01") },
      { name: "Retail", unitPrice: 25, customerGroupId: null, branchId: null, validFrom: new Date("2026-01-01") },
    ]);
    expect(out[0].unitPrice).toBeNull();
  });

  it("ignores a price that has expired or has not started yet", async () => {
    const out = await listed([
      { name: "Old", unitPrice: 9, customerGroupId: null, branchId: null, validFrom: new Date("2020-01-01"), validTo: new Date("2021-01-01") },
      { name: "Future", unitPrice: 99, customerGroupId: null, branchId: null, validFrom: new Date("2999-01-01") },
    ]);
    expect(out[0].unitPrice).toBeNull();
  });
});

describe("PublicService.placeOrder — hardening", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.company.findFirst.mockResolvedValue(makeCompany());
    mockPrisma.customer.create.mockResolvedValue({ id: "cust-1" });
    mockPrisma.salesOrder.create.mockResolvedValue({});
    mockPrisma.salesOrder.count.mockResolvedValue(0);
  });

  it("merges two lines for the same feed instead of failing as 'unavailable'", async () => {
    mockPrisma.product.findMany.mockResolvedValue([makeProduct()]);

    await makeService().placeOrder(makeDto([{ productId: "prod-1", quantity: 2 }, { productId: "prod-1", quantity: 3 }]));

    const items = mockPrisma.salesOrder.create.mock.calls[0][0].data.items.create;
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(5);
  });

  it("only looks up products that are active, not deleted, and have a web address", async () => {
    mockPrisma.product.findMany.mockResolvedValue([makeProduct()]);

    await makeService().placeOrder(makeDto([{ productId: "prod-1", quantity: 2 }]));

    expect(mockPrisma.product.findMany.mock.calls[0][0].where).toEqual(expect.objectContaining({ isPublic: true, status: "ACTIVE", deletedAt: null, publicSlug: { not: null } }));
  });

  it("stops one phone number placing more than 5 orders an hour", async () => {
    mockPrisma.salesOrder.count.mockResolvedValue(5);
    mockPrisma.product.findMany.mockResolvedValue([makeProduct()]);

    await expect(makeService().placeOrder(makeDto([{ productId: "prod-1", quantity: 2 }]))).rejects.toThrow(/Too many orders/);
    expect(mockPrisma.salesOrder.create).not.toHaveBeenCalled();
  });
});

describe("PublicService leads — spam cap", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig.get.mockImplementation((key: string, fallback?: string) => (key === "STOREFRONT_COMPANY_ID" ? undefined : fallback));
    mockPrisma.company.findFirst.mockResolvedValue({ id: "company-1" });
    mockPrisma.storefrontLead.create.mockResolvedValue({ id: "lead-1" });
    mockEmail.send.mockResolvedValue(true);
  });

  it("stops one phone number sending more than 5 messages an hour", async () => {
    mockPrisma.storefrontLead.count.mockResolvedValue(5);

    await expect(makeService().submitContact({ name: "Spam", phone: "0555555555", message: "x" } as never)).rejects.toThrow(/Too many messages/);
    expect(mockPrisma.storefrontLead.create).not.toHaveBeenCalled();
  });
});
