/**
 * Aperçu des e-mails Dermora dans le navigateur : écrit des fichiers HTML dans le dossier donné.
 *   npx ts-node prisma/preview-mails.ts <dossier>
 */
import * as fs from 'fs';
import * as path from 'path';
import { renderMail } from '../src/notifications/email-template';

const out = process.argv[2] ?? 'mail-preview';
fs.mkdirSync(out, { recursive: true });
const write = (name: string, html: string) => fs.writeFileSync(path.join(out, name), html);

write('activation-fr.html', renderMail({
  lang: 'fr', preheader: 'Un clic pour commencer votre routine personnalisée.', title: 'Bienvenue sur Dermora', greeting: 'Bonjour Chaima,',
  paragraphs: ['Merci de nous avoir rejointes ! Votre espace est prêt : diagnostic de peau, routine adaptée à votre budget et produits disponibles au Maroc.', 'Pour activer votre compte, il suffit de confirmer votre adresse e-mail.'],
  button: { label: 'Activer mon compte', url: 'https://dermora-web.vercel.app/verify?token=apercu' },
  note: "Ce lien est valable 48 heures. Si vous n'avez pas créé de compte Dermora, ignorez simplement ce message.",
}).html);
write('activation-ar.html', renderMail({
  lang: 'ar', preheader: 'نقرة واحدة لبدء روتينك المخصص.', title: 'مرحباً بك في ديرمورا', greeting: 'مرحباً شيماء،',
  paragraphs: ['شكراً لانضمامك إلينا! فضاؤك جاهز: تحليل البشرة، وروتين يناسب ميزانيتك، ومنتجات متوفرة في المغرب.', 'لتفعيل حسابك، يكفي تأكيد بريدك الإلكتروني.'],
  button: { label: 'تفعيل حسابي', url: 'https://dermora-web.vercel.app/verify?token=apercu' },
  note: 'هذا الرابط صالح لمدة 48 ساعة. إذا لم تنشئي حساباً في ديرمورا، تجاهلي هذه الرسالة.',
}).html);
write('reinitialisation-fr.html', renderMail({
  lang: 'fr', preheader: 'Votre code de réinitialisation, valable 15 minutes.', title: 'Réinitialiser votre mot de passe', greeting: 'Bonjour Chaima,',
  paragraphs: ["Voici votre code de réinitialisation. Saisissez-le dans l'application pour choisir un nouveau mot de passe."],
  code: '482913', note: "Ce code est valable 15 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.",
}).html);
console.log(`Aperçus écrits dans ${out}`);
