import { Body, Controller, Delete, Get, Ip, Param, Post, Headers, UseGuards } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { AiChatDto } from "./dto/ai-chat.dto";
import { AiService } from "./ai.service";

@Controller("ai")
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post("chat")
  chat(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AiChatDto,
    @Ip() ip: string,
    @Headers("user-agent") ua?: string
  ) {
    return this.ai.chat(user, dto, ip, ua);
  }

  @Get("models")
  models(@CurrentUser() user: AuthenticatedUser) {
    return this.ai.models(user);
  }

  @Get("sessions")
  sessions(@CurrentUser() user: AuthenticatedUser) {
    return this.ai.sessions(user);
  }

  @Get("sessions/:id")
  sessionMessages(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.ai.sessionMessages(user, id);
  }

  @Delete("sessions/:id")
  deleteSession(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.ai.deleteSession(user, id);
  }
}
