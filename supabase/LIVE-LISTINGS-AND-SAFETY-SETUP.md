# Live listings and AI safety setup

The browser app never stores provider credentials. Add secrets in the Supabase Dashboard under **Edge Functions → Secrets**.

## Job listings

- Keep the existing secrets `adzuna_id` and `adzuna_key` if Adzuna is enabled.
- Adzuna’s API terms require a visible “Jobs by Adzuna” link on its displayed listings; the app uses a small label. To hide provider labels completely, leave the Adzuna feed off and use the other feeds instead.
- Jooble is optional. The feed now also includes the current South African Government Public Service Vacancy Circular, which needs no API key. It appears as one official circular card; applicants open the circular to read the individual adverts, requirements and closing dates. It is not presented as a set of parsed job-by-job listings.
- YubHub is a free public JSON feed with individual adverts. The server function reads its category feeds, keeps listings marked for South Africa, uses the original employer application link when supplied, and keeps the required “Data by YubHub” credit visible in the app. Its public feeds are limited to the latest 100 listings per category, so coverage can be small or empty for South Africa at times.
- Add `jooble_api_key` only if you later get access. Jooble requires a separate key for South Africa; its free API allowance is 500 lifetime requests.
- JSearch is the additional South African feed. It can return jobs indexed from LinkedIn, Indeed and other public job boards, but applications still open at the listing’s application site. Create a free OpenWeb Ninja account, then add the key in Supabase Edge Functions → Secrets as `jsearch_api_key`. The function searches learnerships, internships and entry-level jobs, keeps the key on the server, limits results to South Africa, and caches results for one hour. The free plan is limited to 200 requests per month; each cache refresh uses up to three requests. JSearch listings link to the application page and are not labelled as employer-verified by ThusaPath.
- Deploy the new feed with JWT verification enabled: `supabase functions deploy jsearch-opportunities --project-ref aqhfhjigeenhztofqynm`.
- Keep `VITE_EXTERNAL_LISTINGS_ENABLED=true` in the local `.env` to load all configured feeds. `VITE_ADZUNA_ENABLED=true` is still accepted for older local setups.
- The feed also includes ThusaPath listings already published in Supabase. The job seekers’ screen does not display provider names.
- Adzuna is searched with separate South African query groups covering learnerships, internships and entry-level roles, rather than one long keyword string that can exclude beginner roles. Skills and requirements are extracted from advert text when the source includes them; missing details are left out rather than guessed.

## AI scam check

- Add `OPENAI_API_KEY` as an Edge Function secret. Do not put it in `.env`, `.env.example`, or frontend code.
- Anonymous sign-ins are not required. The function validates the configured project publishable key and rate-limits by user or IP; profile details are not sent to the AI.
- Deploy `yubhub-opportunities` and `job-safety-check` with **Verify JWT** enabled. The YubHub connection is separate from `adzuna-opportunities`, so this can be published without changing the Adzuna function.
- To publish YubHub from a terminal where the Supabase CLI is installed and signed in, run `supabase functions deploy yubhub-opportunities --project-ref aqhfhjigeenhztofqynm` from the project folder.
- The AI checks only the advert summary and application website hostname. It cannot prove an employer is real, and the app explains that a low-risk result is not verification.

If the AI secret is missing or the anonymous sign-in setting is off, the app shows the check as unavailable and does not reveal the application link.
