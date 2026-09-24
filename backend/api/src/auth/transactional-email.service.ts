import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Resend } from "resend";
import { tokenDigest } from "./auth.utils";

type EmailCommand = {
  to: string;
  subject: string;
  body: string;
  path: string;
  idempotencyKey: string;
};

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>'"]/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[char]!,
  );

@Injectable()
export class TransactionalEmailService {
  private readonly logger = new Logger(TransactionalEmailService.name);
  private readonly client = process.env.RESEND_API_KEY
    ? new Resend(process.env.RESEND_API_KEY)
    : undefined;

  private origin() {
    const configuredOrigin =
      process.env.APP_ORIGIN ?? process.env.WEB_ORIGIN?.split(",")[0];

    try {
      return new URL(configuredOrigin!).origin;
    } catch {
      throw new ServiceUnavailableException(
        "O envio de e-mails não está configurado.",
      );
    }
  }

  private async send(command: EmailCommand) {
    const url = new URL(command.path, this.origin()).toString();
    const from = process.env.RESEND_FROM;

    if (!this.client || !from) {
      if (process.env.NODE_ENV !== "production") {
        this.logger.warn(
          `E-mail transacional capturado localmente para ${command.to}; configure RESEND_API_KEY e RESEND_FROM para envio.`,
        );
        return;
      }

      throw new ServiceUnavailableException(
        "O envio de e-mails não está configurado.",
      );
    }

    const { error } = await this.client.emails.send(
      {
        from,
        to: [command.to],
        subject: command.subject,
        html: `<main style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:540px;margin:auto;padding:36px;color:#20242a"><h1>ATHENA</h1><p>${escapeHtml(command.body)}</p><p><a href="${escapeHtml(url)}" style="background:#20242a;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none">Continuar</a></p><p style="color:#68717d;font-size:12px">Se você não solicitou esta ação, ignore esta mensagem.</p></main>`,
        text: `${command.body}\n\n${url}`,
      },
      { idempotencyKey: command.idempotencyKey },
    );

    if (error) {
      throw new ServiceUnavailableException(
        "Não foi possível enviar o e-mail agora. Tente novamente.",
      );
    }
  }

  sendVerification(to: string, token: string) {
    return this.send({
      to,
      subject: "Confirme seu e-mail no ATHENA",
      body: "Confirme seu e-mail para ativar sua conta.",
      path: `/verificar-email?token=${encodeURIComponent(token)}`,
      idempotencyKey: `email-verification/${tokenDigest(token)}`,
    });
  }

  sendPasswordReset(to: string, token: string) {
    return this.send({
      to,
      subject: "Redefina sua senha ATHENA",
      body: "Use este link para criar uma nova senha.",
      path: `/redefinir-senha?token=${encodeURIComponent(token)}`,
      idempotencyKey: `password-reset/${tokenDigest(token)}`,
    });
  }

  sendWorkspaceInvite(
    to: string,
    workspaceName: string,
    token: string,
    inviteId: string,
  ) {
    return this.send({
      to,
      subject: `Convite para ${workspaceName} no ATHENA`,
      body: `Você foi convidado(a) para participar do workspace ${workspaceName}.`,
      path: `/convites/aceitar?token=${encodeURIComponent(token)}`,
      idempotencyKey: `workspace-invite/${inviteId}/${tokenDigest(token)}`,
    });
  }
}
