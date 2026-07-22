import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Request, Response } from "express";

type ErrorResponse = {
  success: false;
  statusCode: number;
  message: string | string[];
  timestamp: string;
  path: string;
  requestId?: string;
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request & { id?: string }>();

    // Translate Prisma errors into meaningful HTTP responses before status lookup
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === "P2002") {
        const fields = Array.isArray(exception.meta?.["target"]) ? (exception.meta["target"] as string[]).join(", ") : "field";
        const body: ErrorResponse = {
          success: false,
          statusCode: 400,
          message: `A record with this ${fields} already exists.`,
          timestamp: new Date().toISOString(),
          path: request.originalUrl
        };
        return response.status(400).json(body);
      }
      if (exception.code === "P2025") {
        const body: ErrorResponse = {
          success: false,
          statusCode: 404,
          message: "Record not found.",
          timestamp: new Date().toISOString(),
          path: request.originalUrl
        };
        return response.status(404).json(body);
      }
      if (exception.code === "P2003" || exception.code === "P2014") {
        const body: ErrorResponse = {
          success: false,
          statusCode: 400,
          message: "Related record not found or access denied.",
          timestamp: new Date().toISOString(),
          path: request.originalUrl
        };
        return response.status(400).json(body);
      }
    }

    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse = exception instanceof HttpException ? exception.getResponse() : undefined;
    const rawMessage =
      typeof exceptionResponse === "object" && exceptionResponse && "message" in exceptionResponse
        ? (exceptionResponse as { message: string | string[] }).message
        : exception instanceof Error
          ? exception.message
          : "Internal server error";
    const message = status >= 500 ? "Internal server error" : rawMessage;

    if (status >= 500) {
      this.logger.error(`${request.method} ${request.originalUrl} failed`, exception instanceof Error ? exception.stack : undefined);
    }

    const body: ErrorResponse = {
      success: false,
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      path: request.originalUrl,
      requestId: request.id
    };

    response.status(status).json(body);
  }
}

