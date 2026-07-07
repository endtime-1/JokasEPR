import { Body, Controller, Get, Post } from "@nestjs/common";
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
  setup(@Body() dto: SetupDto) {
    return this.setupService.setup(dto);
  }
}
