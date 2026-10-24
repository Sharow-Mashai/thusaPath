# ThusaPath

ThusaPath helps young people find safer work and training opportunities, understand what each role needs, and practise for interviews in their own time.

## Run the app

1. Install Node.js.
2. In this folder, run `npm install`.
3. Run `npm run dev` and open the local address shown in the terminal.

## Live opportunity data

The app reads published listings from the Supabase `opportunities` table when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set in a local `.env` file. Add the table and row-level security policies with `supabase/schema.sql`. The public read policy only returns published roles from organisations with current verification. Do not put a Supabase service role key in the frontend.

There is no sample-listing fallback. Without Supabase settings, opportunity pages explain that live listings are not connected. To connect real listings: copy `.env.example` to `.env`, add your Supabase Project URL and public anon key, then restart the app. Run `supabase/schema.sql` in the Supabase SQL editor. Only add opportunities from real organisations after verifying them, and publish them through your review process. Never place a service role key in the app.

### External listings

The app includes a server-side Adzuna connector in `supabase/functions/adzuna-opportunities`. It fetches South African adverts from the Adzuna API, preserves the original apply link, and labels each advert as externally sourced and not verified by ThusaPath. Adzuna’s API terms require an Adzuna attribution link on each displayed listing. API credentials belong in Supabase Function secrets, never in `.env` variables prefixed with `VITE_`.

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
- Preview an organisation registration flow.

Profile, saved roles, applications and practice history are stored in this browser only. The demo does not create accounts, submit applications, upload documents, verify organisations, send information to employers, or call an AI service. The practice coach uses a fixed question bank and simple sample-answer templates. Connect these flows to authenticated Supabase policies and a server-side API before using real personal information or real opportunities.
