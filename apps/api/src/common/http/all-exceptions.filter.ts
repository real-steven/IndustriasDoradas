import {
  ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";

import type { CorrelatedRequest } from "./correlation-id.middleware";

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string | string[];
  path: string;
  timestamp: string;
  correlationId: string;
}

interface NestHttpExceptionBody {
  code?: unknown;
  message?: unknown;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request & CorrelatedRequest>();
    const response = context.getResponse<Response>();
    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const body: ErrorBody = {
      statusCode,
      code: this.getPublicCode(exception, statusCode),
      message: this.removeQueryString(
        this.getPublicMessage(exception),
        request.originalUrl,
        request.path,
      ),
      path: request.path,
      timestamp: new Date().toISOString(),
      correlationId: request.correlationId ?? "unavailable",
    };

    const logContext = {
      event: "http_request_failed",
      method: request.method,
      path: request.path,
      statusCode,
      correlationId: body.correlationId,
    };

    if (statusCode >= 500) {
      this.logger.error(logContext);
    } else {
      this.logger.warn(logContext);
    }

    response.status(statusCode).json(body);
  }

  private getPublicMessage(exception: unknown): string | string[] {
    if (!(exception instanceof HttpException)) {
      return "Internal server error";
    }

    const exceptionResponse = exception.getResponse();

    if (typeof exceptionResponse === "string") {
      return exceptionResponse;
    }

    if (this.isNestHttpExceptionBody(exceptionResponse)) {
      const { message } = exceptionResponse;

      if (typeof message === "string" || this.isStringArray(message)) {
        return message;
      }
    }

    return exception.message;
  }

  private getPublicCode(exception: unknown, statusCode: number): string {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (
        typeof response !== "string" &&
        this.isNestHttpExceptionBody(response) &&
        typeof response.code === "string" &&
        /^[A-Z][A-Z0-9_]*$/u.test(response.code)
      ) {
        return response.code;
      }
    }

    return `HTTP_${statusCode}`;
  }

  private isNestHttpExceptionBody(
    value: object,
  ): value is NestHttpExceptionBody {
    return "message" in value;
  }

  private isStringArray(value: unknown): value is string[] {
    return (
      Array.isArray(value) && value.every((item) => typeof item === "string")
    );
  }

  private removeQueryString(
    message: string | string[],
    originalUrl: string,
    path: string,
  ): string | string[] {
    if (originalUrl === path) {
      return message;
    }

    const sanitize = (value: string): string =>
      value.split(originalUrl).join(path);
    return Array.isArray(message) ? message.map(sanitize) : sanitize(message);
  }
}
