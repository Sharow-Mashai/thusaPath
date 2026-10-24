# ThusaPath

ThusaPath helps young people find safer work and training opportunities, understand what each role needs, and practise for interviews in their own time.

## Run the app

1. Install Node.js.
2. In this folder, run `npm install`.
3. Run `npm run dev` and open the local address shown in the terminal.

## Live opportunity data

The app reads published listings from the Supabase `opportunities` table when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set in a local `.env` file. Add the table and row-level security policies with `supabase/schema.sql`. The public read policy only returns published roles from organisations with current verification. Do not put a Supabase service role key in the frontend.

Without Supabase settings, the app uses the clearly labelled Polokwane demo listings. Demo listings are sample content, not real vacancies. Edit the source records in `src/data/opportunities.ts`; the cards, search, filters, details, path and map all read from the shared opportunity data source.

## What works in this prototype

- Search, filter, save and view opportunities on a map or in a list.
- Read each role’s requirements, estimated transport cost and safety information.
- Build a simple profile, practise a short skills activity and save progress on this device.
- Set personal goals, optionally link them to an opportunity, and track finished goals.
- Practise interview questions and get sample guidance made from the profile details.
- Build, copy and save a CV with either of two layouts, then print it or save it as a PDF.
- Preview an organisation registration flow.

Profile, saved roles, applications and practice history are stored in this browser only. The demo does not create accounts, submit applications, upload documents, verify organisations, send information to employers, or call an AI service. The practice coach uses a fixed question bank and simple sample-answer templates. Connect these flows to authenticated Supabase policies and a server-side API before using real personal information or real opportunities.
