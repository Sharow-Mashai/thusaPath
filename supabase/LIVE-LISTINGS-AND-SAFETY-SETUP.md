# Live listings and AI safety setup

The browser app never stores provider credentials. Add secrets in the Supabase Dashboard under **Edge Functions → Secrets**.

## Job listings

- Keep the existing secrets `adzuna_id` and `adzuna_key` if Adzuna is enabled.
- Adzuna’s API terms require a visible “Jobs by Adzuna” link on its displayed listings; the app uses a small label. To hide provider labels completely, leave the Adzuna feed off and use the other feeds instead.
- Jooble is optional. The feed now also includes the current South African Government Public Service Vacancy Circular, which needs no API key. It appears as one official circular card; applicants open the circular to read the individual adverts, requirements and closing dates. It is not presented as a set of parsed job-by-job listings.
- Add `jooble_api_key` only if you later get access. Jooble requires a separate key for South Africa; its free API allowance is 500 lifetime requests.
- Keep `VITE_EXTERNAL_LISTINGS_ENABLED=true` in the local `.env` to load all configured feeds. `VITE_ADZUNA_ENABLED=true` is still accepted for older local setups.
- The feed also includes ThusaPath listings already published in Supabase. The job seekers’ screen does not display provider names.
- Adzuna is searched with separate South African query groups covering learnerships, internships and entry-level roles, rather than one long keyword string that can exclude beginner roles. Skills and requirements are extracted from advert text when the source includes them; missing details are left out rather than guessed.

## AI scam check

- Add `OPENAI_API_KEY` as an Edge Function secret. Do not put it in `.env`, `.env.example`, or frontend code.
- Anonymous sign-ins are not required. The function validates the configured project publishable key and rate-limits by user or IP; profile details are not sent to the AI.
- Deploy the updated `adzuna-opportunities` function and the new `job-safety-check` function. Keep **Verify JWT** enabled for both.
- The AI checks only the advert summary and application website hostname. It cannot prove an employer is real, and the app explains that a low-risk result is not verification.

If the AI secret is missing or the anonymous sign-in setting is off, the app shows the check as unavailable and does not reveal the application link.
