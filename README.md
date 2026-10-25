# ThusaPath

ThusaPath helps young people find safer work and training opportunities, understand what each role needs, and practise for interviews in their own time.

## Run the app

1. Install Node.js.
2. In this folder, run `npm install`.
3. Run `npm run dev` and open the local address shown in the terminal.

## Live opportunity data

The app reads published listings from the Supabase `opportunities` table when `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are set in a local `.env` file. Add the table and row-level security policies with `supabase/schema.sql`. The public read policy only returns published roles from organisations with current verification. Do not put a Supabase secret or service role key in the frontend.

### First-time service setup

1. Create a project in the [Supabase dashboard](https://supabase.com/dashboard). Choose the closest available region carefully; Supabase says the project region also sets where primary data is stored and cannot be changed later without creating a new project.
2. Copy the project URL and **publishable** key from the project’s Connect dialog. Copy `.env.example` to `.env`, then fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. This key is intended for browser use with the row-level security rules in the schema.
3. In Supabase, open SQL Editor, paste and run `supabase/schema.sql`.
4. Deploy `supabase/functions/adzuna-opportunities` and `supabase/config.toml`. In Edge Function Secrets, add `ADZUNA_APP_ID` and `ADZUNA_APP_KEY`. Set `VITE_ADZUNA_ENABLED=true` in `.env` and restart the app. The feed is read-only and public; provider keys stay on the server.
5. Create the staff email mailbox for the `thusapath.com` domain, then create the matching user in Supabase Authentication. Use the SQL snippet below to grant admin access to that user. Do not put a staff password or Supabase secret key in `.env` or in a chat.

There is no sample-listing fallback. Without Supabase settings, opportunity pages show that there are no current opportunities. Only add opportunities from real organisations after verifying them, and publish them through your review process.

### Staff sign-in and listing admin

Staff use the same ThusaPath app through **Staff sign in** in the footer. Authentication requires a Supabase Auth account whose email ends in `@thusapath.com` and an active row in `public.admin_users`; the email domain alone does not grant access. Create staff accounts in Supabase Auth, then add approved account IDs from the SQL editor, for example:

```sql
insert into public.admin_users (user_id)
select id from auth.users where email = 'staff@thusapath.com';
```

Run the admin table setup from `supabase/schema.sql` first. The admin page can inspect and refresh the current listing feed. API keys stay in Supabase Edge Function secrets and are never collected by the browser. Adding/removing staff rows is owner-only. A connected provider is shown as **source verified**; this confirms where the listing came from, not that ThusaPath verified the employer or every advert detail.

### External listings

The app includes a server-side Adzuna connector in `supabase/functions/adzuna-opportunities`. It fetches South African adverts from the Adzuna API, preserves the original apply link, and marks the provider as verified while making clear that ThusaPath has not independently verified the employer or the advert itself. Adzuna’s API terms require an Adzuna attribution link on each displayed listing. API credentials belong in Supabase Function secrets, never in `.env` variables prefixed with `VITE_`.

To enable it, register with [Adzuna’s developer portal](https://developer.adzuna.com/), review its current API terms, and confirm the project’s intended use is allowed. The current terms describe the free key as evaluation use, allow a 14-day usability/coverage trial for organisations, and require a licence for ongoing use in a revenue- or lead-generating product. Then deploy the Edge Function and set `ADZUNA_APP_ID` and `ADZUNA_APP_KEY` as Supabase Function secrets. Set `VITE_ADZUNA_ENABLED=true` in `.env` and restart the app. If this app will continue beyond an evaluation, obtain written permission or a licence first.

[SA Youth’s developer portal](https://developers.sayouth.org.za/) offers partner APIs for youth opportunity/recruitment workflows. Access requires a Partner Network account, agreement to its API terms, and sandbox credentials before production credentials. The portal describes creating and sharing opportunities; confirm with SA Youth whether its available endpoints fit ThusaPath’s intended listing discovery before building that connector. Do not scrape SA Youth.

The [DPSA vacancy circular](https://www.dpsa.gov.za/newsroom/psvc/) is an official weekly source for public service vacancies, but we have not found a supported public jobs API. For now, link users to the circular rather than scraping or copying its PDF listings into the app.

## What works in this prototype

- Search, filter, save and view opportunities on a map or in a list.
- Read each role’s requirements, estimated transport cost and safety information.
- Report a concern from the listing’s safety check; reports stay on this device until a secure reporting service is connected.
- Build a simple profile, practise a short skills activity and save progress on this device.
- Set personal goals, optionally link them to an opportunity, and track finished goals.
- Practise interview questions and get sample guidance made from the profile details.
- Build, copy and save a CV with either of two layouts, then print it or save it as a PDF.
- Sign in to a staff-only listing feed status and refresh page.

Profile, saved roles, applications and practice history are stored in this browser only. The app does not create job-seeker accounts, submit applications, upload documents, verify organisations, send information to employers, or call an AI service. Staff sign-in requires the separate Supabase setup above. The practice coach uses a fixed question bank and simple sample-answer templates. Connect these flows to authenticated Supabase policies and a server-side API before using real personal information or real opportunities.
