# Put Marriage Swipe live on a Hostinger VPS (Linux)

**Use a Hostinger VPS, not shared/web hosting.** Shared hosting cannot run Node.js servers with PostgreSQL and the photo AI. A small VPS works: pick **KVM 2 (2 vCPU, 8 GB)** or larger. KVM 1 (4 GB) is the minimum and the AI will be slow. Choose **Ubuntu 24.04**.
Hostinger's *Windows* VPS is not needed and is harder to run this on. Use Linux.

## 1. Domain
Point a domain or subdomain at the VPS IP. For example, in the DNS for `smallgiants.co.in` add an **A record**: `marriage` → your VPS IP. Your site will be `https://marriage.smallgiants.co.in`.
(A path like `/Marriageswipe` on an existing website is not possible for this app. It needs its own domain or subdomain.)

## 2. Copy the project to the VPS
In hPanel open **VPS → Browser terminal** (or SSH in as root), then:
```
apt-get update && apt-get install -y unzip
mkdir -p /opt/marriage-swipe && cd /opt/marriage-swipe
```
Upload `marriage-swipe.zip` (hPanel file manager, or `scp marriage-swipe.zip root@IP:/opt/marriage-swipe/`), then `unzip marriage-swipe.zip`.

## 3. Install
```
cd /opt/marriage-swipe
bash deploy/install.sh        # first run creates deploy/.env with fresh secrets
nano deploy/.env               # set DOMAIN, CONTACT_EMAIL, OPERATOR_NAME and the SMTP_* email settings
bash deploy/install.sh        # second run builds and starts everything (5 to 10 minutes)
```
HTTPS is automatic once the DNS record from step 1 has spread (usually minutes).

## 4. Create your admin login
```
docker compose -f deploy/docker-compose.yml exec api node src/scripts/create-admin.js you@yourdomain.com 'a-long-password-12+'
```
Open `https://YOUR-DOMAIN/admin` and sign in. There is no public admin sign-up.

Optional, to try the app with people to swipe on: `docker compose -f deploy/docker-compose.yml exec api node src/scripts/seed-demo.js` (14 labelled demo profiles; delete them in the admin console, filter **Demo profiles**, before launch).

## 5. Check it
- `https://YOUR-DOMAIN/api/health` shows `"moderation":{"ready":true}` after about a minute. Until then photos wait for admin review.
- Sign up on the site with a test account, take a selfie, add a photo.
- Admin console: Overview, Profiles, Photo review, Reports.

## 6. Email codes (needed for forgot password)
Fill in `SMTP_*` in `deploy/.env` (Hostinger Email, Brevo, Mailgun or Amazon SES all work), then `docker compose -f deploy/docker-compose.yml up -d`. Phone/SMS codes are optional; set `SMS_WEBHOOK_URL` to a service that sends `{to, text}` as an SMS.

## Everyday
- Update after changing code: `docker compose -f deploy/docker-compose.yml up -d --build`
- Logs: `docker compose -f deploy/docker-compose.yml logs -f api`
- **Backups**: `crontab -e`, add `0 3 * * * /opt/marriage-swipe/deploy/backup.sh`. Copy `/opt/marriage-swipe/backups` off the server now and then. Turn on Hostinger's VPS snapshots too.
- Updates of the server: `apt-get update && apt-get upgrade -y` monthly.

## Notes
- All AI runs on your server. No photo leaves it.
- A server cannot prove a person is live. The selfie is a strong check that photos match one face, and moderators decide the unclear ones. Do not describe it as perfect.
- Before launch: have a lawyer review the privacy policy and rules, and decide who will look at the admin Photo review and Reports every day.
