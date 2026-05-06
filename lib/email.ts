import { Resend } from "resend";

let _resend: Resend | undefined;

function getResend(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY!);
  return _resend;
}

const FROM = process.env.EMAIL_FROM_ADDRESS ?? "Rezept-App <noreply@rezept-app.de>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export interface EmailResult {
  success: boolean;
  error?: string;
}

export async function sendInvitationToUnregistered(opts: {
  ownerName: string;
  recipientEmail: string;
  invitationToken: string;
}): Promise<EmailResult> {
  const link = `${APP_URL}/register?invitation=${opts.invitationToken}`;
  const { error } = await getResend().emails.send({
    from: FROM,
    to: opts.recipientEmail,
    subject: `${opts.ownerName} hat dich eingeladen, seine/ihre Rezeptsammlung anzusehen`,
    html: `<p>Hallo,</p>
<p><strong>${opts.ownerName}</strong> hat dich eingeladen, seine/ihre Rezeptsammlung anzusehen.
Du erhältst Lesezugriff auf alle Rezepte (außer als privat markierte).</p>
<p><a href="${link}">Jetzt registrieren und Sammlung ansehen</a></p>
<p>Nach der Registrierung kannst du die Einladung noch annehmen oder ablehnen.</p>`,
    text: `${opts.ownerName} hat dich eingeladen, seine/ihre Rezeptsammlung anzusehen.\n\nJetzt registrieren: ${link}`,
  });
  return error ? { success: false, error: error.message } : { success: true };
}

export async function sendInvitationToRegistered(opts: {
  ownerName: string;
  recipientEmail: string;
}): Promise<EmailResult> {
  const link = `${APP_URL}/library-shares/incoming`;
  const { error } = await getResend().emails.send({
    from: FROM,
    to: opts.recipientEmail,
    subject: `${opts.ownerName} möchte seine/ihre Rezeptsammlung mit dir teilen`,
    html: `<p>${opts.ownerName} möchte seine/ihre Rezeptsammlung mit dir teilen.</p>
<p><a href="${link}">Einladung ansehen</a></p>`,
    text: `${opts.ownerName} möchte seine/ihre Rezeptsammlung mit dir teilen.\n\nEinladung ansehen: ${link}`,
  });
  return error ? { success: false, error: error.message } : { success: true };
}

export async function sendAcceptanceNotification(opts: {
  ownerEmail: string;
  recipientName: string;
}): Promise<EmailResult> {
  const link = `${APP_URL}/settings`;
  const { error } = await getResend().emails.send({
    from: FROM,
    to: opts.ownerEmail,
    subject: `${opts.recipientName} hat deine Einladung angenommen`,
    html: `<p>${opts.recipientName} hat deine Einladung angenommen und hat nun Lesezugriff auf deine Rezeptsammlung.</p>
<p><a href="${link}">Geteilte Bibliotheken verwalten</a></p>`,
    text: `${opts.recipientName} hat deine Einladung angenommen.\n\nGeteilte Bibliotheken verwalten: ${link}`,
  });
  return error ? { success: false, error: error.message } : { success: true };
}

export async function sendReshareConsentRequest(opts: {
  ownerEmail: string;
  requesterName: string;
  targetEmail: string;
}): Promise<EmailResult> {
  const link = `${APP_URL}/settings`;
  const { error } = await getResend().emails.send({
    from: FROM,
    to: opts.ownerEmail,
    subject: `${opts.requesterName} möchte deine Sammlung mit ${opts.targetEmail} teilen`,
    html: `<p>${opts.requesterName} möchte deine Rezeptsammlung mit <strong>${opts.targetEmail}</strong> teilen.</p>
<p><a href="${link}">Zustimmen oder ablehnen</a></p>`,
    text: `${opts.requesterName} möchte deine Sammlung mit ${opts.targetEmail} teilen.\n\nZustimmen oder ablehnen: ${link}`,
  });
  return error ? { success: false, error: error.message } : { success: true };
}

export async function sendReshareApprovalToRequester(opts: {
  requesterEmail: string;
  ownerName: string;
  targetEmail: string;
}): Promise<EmailResult> {
  const { error } = await getResend().emails.send({
    from: FROM,
    to: opts.requesterEmail,
    subject: `${opts.ownerName} hat deiner Weitergabe zugestimmt`,
    html: `<p>${opts.ownerName} hat deiner Weitergabe an ${opts.targetEmail} zugestimmt. Eine Einladung wurde an ${opts.targetEmail} versandt.</p>`,
    text: `${opts.ownerName} hat deiner Weitergabe an ${opts.targetEmail} zugestimmt.`,
  });
  return error ? { success: false, error: error.message } : { success: true };
}
