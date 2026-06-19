import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
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

