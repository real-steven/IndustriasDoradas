import {
  ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string | string[];
  path: string;
  timestamp: string;
}

interface NestHttpExceptionBody {
  message?: unknown;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const body: ErrorBody = {
      statusCode,
      code: `HTTP_${statusCode}`,
      message: this.getPublicMessage(exception),
      path: request.originalUrl,
      timestamp: new Date().toISOString(),
    };

    const logContext = {
      event: "http_request_failed",
      method: request.method,
      path: request.originalUrl,
      statusCode,
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
}
