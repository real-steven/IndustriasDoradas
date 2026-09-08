import { HttpException, type HttpStatus } from "@nestjs/common";

export class ApplicationError extends HttpException {
  constructor(status: HttpStatus, code: string, message: string | string[]) {
    super({ code, message }, status);
  }
}
