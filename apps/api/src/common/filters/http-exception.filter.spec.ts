import { ArgumentsHost, BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { HttpExceptionFilter } from "./http-exception.filter";

function makeHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const response = { status };
  const request = { originalUrl: "/api/v1/test", method: "PATCH", id: "req-1" };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request
    })
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe("HttpExceptionFilter — Prisma validation errors map to 400, not 500 (M11)", () => {
  it("maps PrismaClientValidationError (e.g. an invalid enum value) to a clean 400", () => {
    const filter = new HttpExceptionFilter();
    const { host, status, json } = makeHost();
    const exception = new Prisma.PrismaClientValidationError("Invalid value for enum field", { clientVersion: "6.0.0" });

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400, success: false }));
  });

  it("still maps a regular HttpException to its own status", () => {
    const filter = new HttpExceptionFilter();
    const { host, status } = makeHost();

    filter.catch(new BadRequestException("bad input"), host);

    expect(status).toHaveBeenCalledWith(400);
  });

  it("still falls back to 500 for a genuinely unknown error", () => {
    const filter = new HttpExceptionFilter();
    const { host, status, json } = makeHost();

    filter.catch(new Error("something exploded"), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 500, message: "Internal server error" }));
  });
});
