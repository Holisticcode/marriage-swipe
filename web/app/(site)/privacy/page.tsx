import Link from 'next/link';
import { SITE } from '@/lib/site';
export const metadata = { title: 'Privacy policy' };

export default function Privacy() {
  return (
    <article className="doc">
      <Link href="/">← Back</Link>
      <h1>Privacy policy</h1>
      <p>Last updated {SITE.updated}. This is a plain-language draft. Have a lawyer check it for your country before you launch.</p>
      <h2>Who we are</h2>
      <p>{SITE.name} is run by {SITE.operator}. Questions: <a href={`mailto:${SITE.email}`}>{SITE.email}</a>.</p>
      <h2>What we collect</h2>
      <p>Your email address, mobile number and a password (stored only as a one-way hash). Profile details you enter: first name, age, gender, who you are looking for, relationship status, city and a short bio. Photos, including a live selfie. Your swipes, matches, messages, reports and blocks. Technical data such as IP address and log-in times, used for security.</p>
      <h2>Photos and face checks</h2>
      <p>To keep the community real and safe, our own server checks each photo for nudity and looks for a face. Your selfie becomes a reference: a numerical face description is stored so we can check that later photos show the same person. This runs on our server and is not sent to outside AI services. Photos the system is unsure about are viewed by a human moderator. Photos rejected for nudity are not kept, apart from a tiny blurred thumbnail used for abuse review. We do not use face data to identify you anywhere else or sell it.</p>
      <h2>Who sees what</h2>
      <p>Other members see your first name, age, city, status, bio and approved photos. They never see your email or mobile number. Moderators and administrators can see account details when reviewing reports or photos, and their actions are logged.</p>
      <h2>Why we use it</h2>
      <p>To run your account, show you suitable profiles, let matched members chat, keep the service safe, and meet legal duties.</p>
      <h2>Sharing</h2>
      <p>We do not sell your data. We use hosting and email or SMS providers to run the service. We may share information if the law requires it or to protect someone from harm.</p>
      <h2>How long we keep it</h2>
      <p>Until you delete your account. Deleting removes your profile, photos, matches and messages. A security and moderation log without your content may be kept for up to 12 months.</p>
      <h2>Your choices</h2>
      <p>You can edit your details and photos in the app, and delete your account in the app (Profile, then Delete my account) or on the web at <Link href="/delete-account">/delete-account</Link>. You can also ask us for a copy of your data or a correction by email.</p>
      <h2>Age</h2>
      <p>{SITE.name} is for people aged 18 and over. If we find an account belonging to someone under 18 we remove it.</p>
      <h2>Security</h2>
      <p>Passwords are hashed, connections use HTTPS, photo links expire, and access is limited. No system is perfectly secure, so use a strong, unique password.</p>
      <h2>Changes</h2>
      <p>If we change this policy in a meaningful way we will tell you in the app.</p>
    </article>
  );
}
