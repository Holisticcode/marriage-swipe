import Link from 'next/link';
import { SITE } from '@/lib/site';
export const metadata = { title: 'Community rules' };

export default function Terms() {
  return (
    <article className="doc">
      <Link href="/">← Back</Link>
      <h1>Community rules and terms</h1>
      <p>Last updated {SITE.updated}. Plain-language draft; have it reviewed for your country before launch.</p>
      <h2>Who can join</h2>
      <p>You must be 18 or older, single, divorced, widowed or separated, and looking for marriage. One account per person, using your own photos.</p>
      <h2>Photos</h2>
      <p>Every photo must show you, fully clothed, and match your verified selfie. No nudity or sexual content, no photos of other people, no images from the internet. Photos that break these rules are removed, and repeated attempts can end your account.</p>
      <h2>Be respectful</h2>
      <p>No harassment, hate, threats, pressure or abuse. Do not ask for money or promote products, and do not share other people&apos;s private details. Keep phone numbers and emails out of your profile and early chat. Share them only when you both choose to.</p>
      <h2>Safety</h2>
      <p>Meet in public places, tell someone you trust, and never send money to someone you have not met. Use Report or Block on any profile or chat. Reports go to our moderators.</p>
      <h2>What we may do</h2>
      <p>We may hold, limit or remove accounts, profiles or photos that break these rules or put others at risk, with or without notice. You can ask us to review a decision by emailing <a href={`mailto:${SITE.email}`}>{SITE.email}</a>.</p>
      <h2>Your account</h2>
      <p>You can delete your account at any time in the app or at <Link href="/delete-account">/delete-account</Link>.</p>
      <h2>No guarantees</h2>
      <p>We cannot guarantee you will find a partner or that every member is who they say they are. The service is provided as is, to the extent the law allows.</p>
      <h2>Privacy</h2>
      <p>See our <Link href="/privacy">privacy policy</Link>.</p>
    </article>
  );
}
