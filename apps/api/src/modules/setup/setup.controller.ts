import { Body, Controller, Get, Headers, Post } from "@nestjs/common";
import { SetupDto } from "./dto/setup.dto";
import { SetupService } from "./setup.service";

@Controller("setup")
export class SetupController {
  constructor(private readonly setupService: SetupService) {}

  @Get("status")
  status() {
    return this.setupService.status();
  }

  @Post()
  setup(@Body() dto: SetupDto, @Headers("x-setup-token") setupToken?: string) {
    return this.setupService.setup(dto, setupToken);
  }
}
