import { publicWebUrl } from '../common/i18n';

/**
 * Modèle des e-mails Dermora (tableaux + styles en ligne : rendu fiable dans Gmail, Outlook, Apple Mail).
 * Le logo est servi par le site (Dermora-web/public/email-logo.png) ; EMAIL_LOGO_URL permet de le remplacer.
 */
export type MailLang = 'fr' | 'en' | 'ar';

export interface MailContent {
  lang: MailLang;
  /** Aperçu affiché dans la boîte de réception, après l'objet */
  preheader: string;
  title: string;
  greeting: string;
  paragraphs: string[];
  button?: { label: string; url: string };
  /** Code à recopier (réinitialisation du mot de passe) */
  code?: string;
  note?: string;
}

const FOOTER: Record<MailLang, { tagline: string; why: string }> = {
  fr: { tagline: 'Care Beyond Beauty', why: 'Vous recevez cet e-mail suite à une action sur votre compte Dermora.' },
  en: { tagline: 'Care Beyond Beauty', why: 'You are receiving this email following an action on your Dermora account.' },
  ar: { tagline: 'Care Beyond Beauty', why: 'تتلقين هذه الرسالة إثر إجراء على حسابك في ديرمورا.' },
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function renderMail(m: MailContent): { html: string; text: string } {
  const rtl = m.lang === 'ar';
  const dir = rtl ? 'rtl' : 'ltr';
  const align = rtl ? 'right' : 'left';
  const sans = rtl ? "Tahoma, 'Segoe UI', Arial, sans-serif" : "'Helvetica Neue', Helvetica, Arial, sans-serif";
  const serif = rtl ? sans : "Georgia, 'Times New Roman', serif";
  const logo = process.env.EMAIL_LOGO_URL || `${publicWebUrl()}/email-logo.png`;
  const year = new Date().getFullYear();
  const f = FOOTER[m.lang];

  const button = m.button ? `
              <tr><td align="center" style="padding:8px 0 6px">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                  <td align="center" bgcolor="#7a1f3d" style="border-radius:999px;background:#7a1f3d">
                    <a href="${esc(m.button.url)}" target="_blank" style="display:inline-block;padding:15px 34px;font-family:${sans};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;letter-spacing:.2px">${esc(m.button.label)}</a>
                  </td>
                </tr></table>
              </td></tr>` : '';

  const code = m.code ? `
              <tr><td align="center" style="padding:6px 0 10px">
                <div style="display:inline-block;padding:16px 28px;border-radius:16px;background:#fbf0f2;border:1px solid #f1dfe3;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-variant-numeric:tabular-nums lining-nums;font-size:32px;letter-spacing:9px;color:#7a1f3d;font-weight:700" dir="ltr">${esc(m.code)}</div>
              </td></tr>` : '';

  const html = `<!doctype html>
<html lang="${m.lang}" dir="${dir}">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>${esc(m.title)}</title>
</head>
<body style="margin:0;padding:0;background:#f6ecef;-webkit-text-size-adjust:100%">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(m.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6ecef">
    <tr><td align="center" style="padding:32px 14px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">
        <!-- En-tête : logo -->
        <tr><td align="center" style="padding:0 0 18px">
          <img src="${esc(logo)}" width="72" height="72" alt="Dermora" style="display:block;width:72px;height:72px;border:0;outline:none">
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:26px;letter-spacing:3px;color:#7a1f3d;margin-top:8px">Dermora</div>
          <div style="font-family:${sans};font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#b0808e;margin-top:4px">${f.tagline}</div>
        </td></tr>
        <!-- Carte -->
        <tr><td style="background:#ffffff;border:1px solid #f0dfe3;border-radius:22px;overflow:hidden">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="height:5px;border-radius:22px 22px 0 0;background:#7a1f3d;background-image:linear-gradient(90deg,#561228,#9c2f52,#d9788c);font-size:0;line-height:0">&nbsp;</td></tr>
            <tr><td dir="${dir}" style="padding:34px 34px 30px;text-align:${align}">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="font-family:${serif};font-size:25px;line-height:1.3;color:#2a1820;padding:0 0 16px">${esc(m.title)}</td></tr>
              <tr><td style="font-family:${sans};font-size:15px;line-height:1.65;color:#2a1820;padding:0 0 10px">${esc(m.greeting)}</td></tr>
              ${m.paragraphs.map((p) => `<tr><td style="font-family:${sans};font-size:15px;line-height:1.65;color:#5c4650;padding:0 0 18px">${esc(p)}</td></tr>`).join('')}
              ${code}${button}
              ${m.note ? `<tr><td style="font-family:${sans};font-size:12.5px;line-height:1.6;color:#8e7880;padding:22px 0 0;border-top:1px solid #f3e6e9">${esc(m.note)}</td></tr>` : ''}
              </table>
            </td></tr>
          </table>
        </td></tr>
        <!-- Pied -->
        <tr><td align="center" dir="${dir}" style="padding:22px 20px 0;font-family:${sans};font-size:11.5px;line-height:1.6;color:#a08a92">
          ${esc(f.why)}<br><span dir="ltr">© ${year} Dermora · Aevora Group</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [m.title, '', m.greeting, '', ...m.paragraphs, '', m.code ?? '', m.button ? `${m.button.label} : ${m.button.url}` : '', '', m.note ?? '', '', `Dermora — ${f.tagline}`]
    .filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
  return { html, text };
}
