import { ArrayNotEmpty, IsArray, IsUUID } from "class-validator";

export class AssignUserRolesDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID(undefined, { each: true })
  roleIds!: string[];
}
