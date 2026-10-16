import Link from 'next/link';
import { SITE } from '@/lib/site';
export const metadata = { title: 'Child safety standards' };

export default function ChildSafety() {
  return (
    <article className="doc">
      <Link href="/">← Back</Link>
      <h1>Child safety standards</h1>
      <p>Last updated {SITE.updated}. These are {SITE.name}&apos;s published standards against child sexual abuse and exploitation (CSAE).</p>
      <h2>Zero tolerance</h2>
      <p>{SITE.name} is only for adults aged 18 and over who are looking for marriage. We do not allow anyone under 18 to use the service, and we have zero tolerance for child sexual abuse material (CSAM), the sexualisation of minors, grooming, sextortion, trafficking, or any other content or behaviour that exploits or endangers children.</p>
      <h2>How we prevent it</h2>
      <ul>
        <li>Every member confirms they are 18 or older when they sign up and again when they create a profile.</li>
        <li>Every member must pass a live selfie check. Every photo is checked on our servers for nudity and must match the verified face. Unclear photos are held for a human moderator before anyone else can see them.</li>
        <li>Members can only message people they have matched with, and contact details are removed from chat.</li>
        <li>Moderators review reports and flagged photos, and can remove an account immediately.</li>
      </ul>
      <h2>How to report</h2>
      <p>In the app, open the profile or chat, tap the menu (⋯) and choose <b>Report</b>, then select <b>Looks under 18</b> or <b>Nudity or sexual content</b>. Reported profiles are hidden from you at once and sent to our moderators. You can also email us at <a href={`mailto:${SITE.email}`}>{SITE.email}</a> with the subject &quot;Child safety&quot;.</p>
      <p>If a child is in immediate danger, contact your local police first.</p>
      <h2>What we do</h2>
      <p>When we find or are told about suspected CSAE or an account belonging to a minor, we remove the account and content, keep the evidence required by law, and report it to the relevant authorities. This includes the National Center for Missing &amp; Exploited Children (NCMEC) and the law enforcement or online safety agency of the country concerned (for example the Australian Centre to Counter Child Exploitation, or India&apos;s National Cyber Crime Reporting Portal). We cooperate with law enforcement requests.</p>
      <h2>Compliance</h2>
      <p>We comply with the child safety laws that apply to us and with Google Play&apos;s Child Safety Standards policy, and we review these standards regularly.</p>
      <h2>Child safety contact</h2>
      <p>Our designated contact for child safety and CSAM prevention is {SITE.operator}, <a href={`mailto:${SITE.email}`}>{SITE.email}</a>.</p>
      <p>See also our <Link href="/terms">community rules</Link> and <Link href="/privacy">privacy policy</Link>.</p>
    </article>
  );
}
