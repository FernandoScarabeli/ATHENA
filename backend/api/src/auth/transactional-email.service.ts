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
  title: string;
  intro: string;
  footer: string;
  path?: string;
  actionLabel?: string;
  code?: string;
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

function renderEmail(command: EmailCommand, url?: string) {
  const title = escapeHtml(command.title);
  const intro = escapeHtml(command.intro);
  const footer = escapeHtml(command.footer);
  const actionLabel = escapeHtml(command.actionLabel ?? "Continuar");
  const safeUrl = url ? escapeHtml(url) : undefined;
  const code = command.code ? escapeHtml(command.code) : undefined;

  const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title} — ATHENA</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f5f7f8;color:#252930;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;font-size:1px;line-height:1px;color:#f5f7f8;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${intro}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;background-color:#f5f7f8;">
      <tr>
        <td align="center" style="padding:32px 16px 48px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="width:100%;max-width:560px;border:1px solid #dfe5e9;border-radius:14px;border-collapse:separate;background-color:#ffffff;">
            <tr>
              <td style="padding:24px 40px;border-radius:13px 13px 0 0;background-color:#252930;">
                <p style="margin:0;color:#ffffff;font-size:17px;font-weight:700;letter-spacing:2px;line-height:24px;">ATHENA</p>
              </td>
            </tr>
            <tr>
              <td style="padding:34px 40px 0;">
                <h1 style="margin:0;color:#252930;font-size:28px;font-weight:700;letter-spacing:-0.6px;line-height:34px;">${title}</h1>
                <p style="margin:16px 0 0;color:#4f5863;font-size:15px;line-height:24px;">${intro}</p>
              </td>
            </tr>
            ${code ? `<tr>
              <td style="padding:28px 40px 0;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:separate;">
                  <tr><td align="center" style="padding:20px 12px;border:1px solid #dfe5e9;border-radius:9px;background-color:#f7f9fa;color:#252930;font-family:Arial,Helvetica,sans-serif;font-size:32px;font-weight:700;letter-spacing:7px;line-height:40px;font-variant-numeric:tabular-nums;">${code}</td></tr>
                </table>
              </td>
            </tr>` : ""}
            ${safeUrl ? `<tr>
              <td style="padding:28px 40px 0;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
                  <tr><td align="center" style="border-radius:8px;background-color:#252930;">
                    <a href="${safeUrl}" style="display:inline-block;padding:14px 22px;color:#ffffff;font-size:14px;font-weight:700;line-height:20px;text-decoration:none;">${actionLabel}</a>
                  </td></tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 40px 0;">
                <p style="margin:0;color:#737d88;font-size:12px;line-height:19px;">Se o botão não funcionar, copie este endereço no navegador:</p>
                <p style="margin:7px 0 0;color:#4f5863;font-size:12px;line-height:19px;word-break:break-all;overflow-wrap:anywhere;">${safeUrl}</p>
              </td>
            </tr>` : ""}
            <tr>
              <td style="padding:32px 40px 36px;">
                <p style="margin:0;padding-top:20px;border-top:1px solid #e7ebee;color:#737d88;font-size:12px;line-height:19px;">${footer}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    "ATHENA",
    command.title,
    "",
    command.intro,
    command.code ? `Código: ${command.code}` : undefined,
    url ? `${command.actionLabel ?? "Continuar"}: ${url}` : undefined,
    "",
    command.footer,
  ]
    .filter((part) => part !== undefined)
    .join("\n");

  return { html, text };
}

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
    const url = command.path
      ? new URL(command.path, this.origin()).toString()
      : undefined;
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
        ...renderEmail(command, url),
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
      title: "Confirme seu e-mail",
      intro: "Confirme este endereço de e-mail para ativar sua conta no ATHENA.",
      footer: "Se você não criou uma conta no ATHENA, pode ignorar este e-mail.",
      path: `/verificar-email?token=${encodeURIComponent(token)}`,
      actionLabel: "Confirmar e-mail",
      idempotencyKey: `email-verification/${tokenDigest(token)}`,
    });
  }

  sendPasswordResetCode(to: string, code: string, resetId: string) {
    return this.send({
      to,
      subject: "Seu código para redefinir a senha no ATHENA",
      title: "Crie uma nova senha",
      intro: "Digite este código na tela de recuperação de acesso. Ele expira em 10 minutos.",
      code,
      footer: "Não compartilhe este código. Se você não pediu uma nova senha, pode ignorar este e-mail.",
      idempotencyKey: `password-reset-code/${tokenDigest(resetId)}`,
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
      title: "Você recebeu um convite",
      intro: `Você foi convidado(a) para participar do workspace ${workspaceName} no ATHENA.`,
      footer: "Se você não esperava este convite, pode ignorar este e-mail.",
      path: `/convites/aceitar?token=${encodeURIComponent(token)}`,
      actionLabel: "Ver convite",
      idempotencyKey: `workspace-invite/${inviteId}/${tokenDigest(token)}`,
    });
  }

  sendProjectInvite(to: string, projectName: string, token: string, inviteId: string) {
    return this.send({
      to,
      subject: `Convite para ${projectName} no ATHENA`,
      title: "Você recebeu um convite",
      intro: `Você foi convidado(a) para acessar o projeto ${projectName} no ATHENA.`,
      footer: "Se você não esperava este convite, pode ignorar este e-mail.",
      path: `/convites/aceitar?token=${encodeURIComponent(token)}`,
      actionLabel: "Ver convite",
      idempotencyKey: `project-invite/${inviteId}/${tokenDigest(token)}`,
    });
  }

  sendAccessRequestNotice(to: string, requesterName: string, projectName: string, projectId: string, requestId: string, recipientId: string) {
    return this.send({
      to,
      subject: `Pedido de acesso a ${projectName} no ATHENA`,
      title: "Pedido de acesso aguardando decisão",
      intro: `${requesterName} pediu acesso ao projeto ${projectName}. Abra o ATHENA para aprovar ou recusar o pedido.`,
      footer: "Você recebeu este aviso por fazer parte da equipe de gestão do workspace.",
      path: `/projects/${encodeURIComponent(projectId)}?accessRequest=${encodeURIComponent(requestId)}`,
      actionLabel: "Ver projeto",
      idempotencyKey: `access-request/${requestId}/manager/${recipientId}`,
    });
  }

  sendAccessRequestDecision(to: string, projectName: string, workspaceName: string, projectId: string, status: "APPROVED" | "DENIED", scope: "PROJECT" | "WORKSPACE" | null, role: "EDITOR" | "VIEWER" | null, requestId: string) {
    const approved = status === "APPROVED";
    const accessTarget = scope === "WORKSPACE" ? workspaceName : projectName;
    const accessDescription = scope === "WORKSPACE" ? "ao workspace" : "ao projeto";
    const roleDescription = role === "EDITOR" ? "Editor" : "Viewer";
    return this.send({
      to,
      subject: `${approved ? "Pedido aprovado" : "Pedido recusado"}: ${projectName}`,
      title: approved ? "Seu pedido foi aprovado" : "Seu pedido foi recusado",
      intro: approved
        ? `Seu acesso ${accessDescription} ${accessTarget} foi aprovado${role ? ` como ${roleDescription}` : ""}.`
        : `Seu pedido de acesso a ${projectName} foi recusado. Você pode enviar um novo pedido pelo link da User Story.`,
      footer: "Notificação automática do ATHENA.",
      path: approved ? `/projects/${encodeURIComponent(projectId)}` : undefined,
      actionLabel: "Abrir projeto",
      idempotencyKey: `access-decision/${requestId}/${status}`,
    });
  }
}
