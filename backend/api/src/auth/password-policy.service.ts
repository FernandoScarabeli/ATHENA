import {
  BadRequestException,
  Injectable,
} from "@nestjs/common";

@Injectable()
export class PasswordPolicyService {
  async validate(value: string) {
    if (value.length < 8)
      throw new BadRequestException("A senha deve ter pelo menos 8 caracteres.");
    if (!/\p{L}/u.test(value))
      throw new BadRequestException("A senha deve conter pelo menos uma letra.");
    if (!/\p{N}/u.test(value))
      throw new BadRequestException("A senha deve conter pelo menos um número.");
    if (!/[^\p{L}\p{N}\s]/u.test(value))
      throw new BadRequestException(
        "A senha deve conter pelo menos um caractere especial.",
      );
  }
}
