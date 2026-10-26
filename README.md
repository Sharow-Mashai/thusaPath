# ThusaPath

ThusaPath helps young people find work and training opportunities, understand what each advert asks for, prepare for skill gaps, and practise for interviews. The current build is a prototype; it does not submit applications or claim that every listing is safe.

## Run locally

1. Install Node.js.
2. In this folder, run `npm install`.
3. Copy `.env.example` to `.env` and add the Supabase project URL and publishable key.
4. Run `npm run dev` and open the local address shown in the terminal.

Never place a Supabase service-role key, OpenAI key, or job-board provider secret in a `VITE_` variable or in frontend code.

## Supabase setup

The app uses Supabase Auth for job-seeker sign-in/registration and staff sign-in. Job-seeker registrations accept ordinary email addresses. Email confirmation and delivery are controlled in the Supabase project’s Auth settings. The current Supabase built-in sender is restricted; use a real SMTP provider before inviting public users to confirm accounts. For a small, controlled prototype only, an owner may turn off email confirmation in Supabase Auth so several testers can register without waiting for email. This does not verify that they own the email address; turn confirmation back on before a public launch.

For a new database, run `supabase/schema.sql` in the Supabase SQL Editor. For an existing project that already has the base schema, run `supabase/migrations/20261025_trust_review.sql`. This adds the staff verification and report-review workflow, its access policies, and the review function. Keep email confirmation enabled when real users rely on account ownership.

Staff access is based on an active row in `public.admin_users`, not on an email suffix. An owner can provision the first staff admin after that person already has a Supabase Auth account:

```sql
insert into public.admin_users (user_id, active)
select id, true from auth.users where lower(email) = lower('your-existing-email@example.com')
on conflict (user_id) do update set active = true;
```

To manage staff inside the app, run `supabase/migrations/20261025_staff_access_management.sql` in the Supabase SQL Editor. Existing Auth accounts on any email domain can be added by an active staff member in **Staff workspace → Staff access**. The staff-access migration checks the caller and only grants access to an account that already exists; it does not create or confirm accounts. If the earlier domain-only staff migration was already run, also run `supabase/migrations/20261026_staff_access_any_email.sql` to remove its email-domain restriction.

## Live opportunity feeds

Published ThusaPath listings are read from `public.opportunities`. Public database policies only return listings linked to an organisation with a current verified status. The app also supports the external feeds described in [the live-listing and safety setup](supabase/LIVE-LISTINGS-AND-SAFETY-SETUP.md). Enable the configured feeds with `VITE_EXTERNAL_LISTINGS_ENABLED=true` in `.env`, then restart the app. `VITE_ADZUNA_ENABLED=true` remains supported for older local setups.

A job-board API being the source of an advert does **not** mean ThusaPath verified the employer. External listings are shown as source listings, and the user-facing safety panel says they were not independently checked. Follow each provider’s attribution and licensing terms; Adzuna’s current terms, in particular, must be checked before use beyond evaluation.

## Trust and employer checks

Staff can add an organisation to the review list in **Listing sources → Employer checks and user reports**. Before marking it verified, a staff member must check an official record and a separate contact channel, record the method and a short evidence summary, and set a review expiry date. The app stores review events and who recorded them. Do not paste identity numbers or confidential document contents into review notes.

Job seekers see the recorded verification method, review date, and expiry date for verified employers. A ThusaPath employer check covers the organisation details reviewed; it does not guarantee a particular vacancy, hiring outcome, or safe interaction. External source data is clearly distinguished from a ThusaPath check.

Signed-in job seekers can report a listing concern. Reports are associated with the reporting account and appear in the staff review queue after the trust-review migration is applied. The report form tells users not to include identity or banking details. Staff must review reports and record a resolution; an automated safety result does not replace that work.

## Skills and interview preparation

The opportunity detail view extracts skills and requirements from the advert text when those details are available, then compares them with the user’s profile. This is a text-based estimate, not an eligibility decision. Missing from a profile does not mean a person cannot apply. When an advert lacks useful detail, the app says so instead of inventing requirements.

“My Path” connects an opportunity to a short practice activity based on a skill mentioned in that advert, followed by interview practice. Interview prompts and tips are currently rule-based and stored locally; they are not generated by AI and do not predict whether someone will be hired. The scam check is the AI feature: it checks the supplied advert details and application-site host for warning signs, does not receive the user’s profile, and cannot prove an employer is legitimate.

## Personal information and current limits

A signed-in user’s profile, saved listings, goals, CVs, and practice history are stored in this browser under a key scoped to that Supabase user ID. They are not synced across devices or sent to employers. They remain on the device between sign-ins to the same account, so users should sign out on shared devices. CV contact details are stored in browser storage and should be treated as private local data.

Applying opens the employer’s application page. ThusaPath does not submit the application, upload the user’s CV, or report the application outcome. The user can save an interest locally, but that is not a confirmed application.

## Business model and pilot measures

Core job-seeker access should remain free. Possible paying customers are legitimate employers, recruitment partners, and organisations sponsoring employability programmes. Their proposed value is access to a clearer, more relevant candidate pipeline, reduced initial screening effort, and programme-level reports on participation and readiness. These are hypotheses to validate with partners; no paid employer service, partner agreement, traction, or employment outcome is currently implemented or demonstrated.

A pilot should track consent-based, aggregate measures such as users who complete a profile, finish a skill activity, practise an interview answer, open an application link, and later report an interview or job outcome. Do not present these as results until they are actually collected and measured.

## Known prototype limitations

- Requirements and profile matching use text extraction and simple matching; they can miss context or misread an advert.
- External feeds can be incomplete, stale, or unavailable. Check the original advert before applying.
- Safety Check identifies warning signs only. “No clear warning signs” is not a safety approval.
- User reports need staff follow-up; verification and moderation depend on real human checks.
- No employer subscription, recruitment partnership, sponsored programme, analytics dashboard, or job-outcome tracking is live yet.
