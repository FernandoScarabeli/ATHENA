import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createHash } from "crypto";

export type PasswordRangeFetcher = (prefix: string) => Promise<string>;

@Injectable()
export class PasswordPolicyService {
  /** Overridable by unit tests; no network call is made unless validate is invoked. */
  protected rangeFetcher: PasswordRangeFetcher = async (prefix) => {
    const response = await fetch(
      `https://api.pwnedpasswords.com/range/${prefix}`,
      { signal: AbortSignal.timeout(5_000) },
    );
    if (!response.ok) throw new Error(`HIBP returned ${response.status}`);
    return response.text();
  };

  async validate(value: string) {
    if (value.length < 12)
      throw new BadRequestException(
        "A senha deve ter pelo menos 12 caracteres.",
      );
    const hash = createHash("sha1").update(value).digest("hex").toUpperCase();
    try {
      const suffixes = await this.rangeFetcher(hash.slice(0, 5));
      if (
        suffixes
          .split(/\r?\n/)
          .some((line) => line.split(":")[0] === hash.slice(5))
      ) {
        throw new BadRequestException(
          "Escolha uma senha que não tenha aparecido em vazamentos.",
        );
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new ServiceUnavailableException(
        "Não foi possível validar a segurança da senha. Tente novamente.",
      );
    }
  }
}
