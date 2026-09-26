# Items to verify

Every `[VERIFY: ...]` marker and unverified draft in the code or data is listed here. A person on the team checks each
one against the official source (or a native speaker for translations), then fills in "Checked by" and the date.
Do not remove a marker, or set a template to `reviewed: true`, until its row here is checked.

| # | Item | Where | Who should check | Checked by | Date |
|---|---|---|---|---|---|
| 1 | French UI strings (draft translation) | `frontend/messages/fr.json` | native speaker | | |
| 2 | Arabic UI strings (draft translation) | `frontend/messages/ar.json` | native speaker | | |
| 3 | Topic labels in fr/ar | `backend/app/data/topics.json` | native speaker | | |
| 4 | Welcome greetings in Arabic, Farsi, Spanish, Ukrainian | `frontend/src/app/[locale]/page.tsx` | native speakers | | |
| 5 | Backend fixed messages in fr/ar (not found, case-specific, emergency, scam verdicts, disclaimer) | `backend/app/services/messages.py` | native speaker | | |
| 6 | 911 message says interpreters are available: confirm with an official Ottawa/Ontario page | `backend/app/services/messages.py` | team | | |
| 7 | Staff card fixed phrases in French | `backend/app/services/staff_card.py` | native speaker | | |
| 8 | Sample handoff summaries in Arabic, Spanish, Farsi (sample data only) | `backend/scripts/seed_sample_insights.py` | native speakers | | |
| 9 | Every source URL and its topics/jurisdiction (all `verified: false`) | `ingestion/sources.yaml` | team | | |
| 10 | ottawa.ca pages blocked automated fetching: add by hand (911 guidance, newcomers pages) | `ingestion/sources.yaml` (commented) | team | | |
| 11 | Job Bank home page renders with JavaScript and yields no text: replace with a text page or remove | `ingestion/sources.yaml` | team | | |
| 12 | School board pages (ocdsb.ca, ocsb.ca) are not city/provincial domains: confirm OK as official sources | `ingestion/sources.yaml` | team | | |
| 13 | Canada Groceries and Essentials Benefit replaced the GST/HST credit page: confirm naming in copy | `step_templates.json` (cgeb_new_resident) | team | | |
| 14 | 70 `verify_notes` across 23 step templates (documents, timing, eligibility). All templates are `reviewed: false` | `backend/app/data/step_templates.json` | team | | |
| 15 | Retrieval similarity threshold (0.6) tuned on real questions once the DB is reachable | `RETRIEVAL_MIN_SIMILARITY` in `backend/app/config.py` | team | | |
| 16 | Gemini models: `gemini-flash-latest` currently resolves to gemini-3.8-flash; consider pinning. Embeddings: `gemini-embedding-001` at 768 dims | `backend/.env` | team | | |
| 17 | ElevenLabs TTS model (`eleven_multilingual_v2`); `eleven_v3` is also available | `backend/.env` | team | | |
| 18 | ElevenLabs conversation data retention setting | ElevenLabs dashboard | team | | |

## Step template notes

Each note below comes from `verify_notes` in `backend/app/data/step_templates.json`.

- [ ] **settlement_services**: [VERIFY: the page lists no documents to bring; check with a local agency what they ask for]
- [ ] **settlement_services**: [VERIFY: government-assisted refugees are met by a Resettlement Assistance Program (RAP) provider; IRCC's RAP list shows Catholic Centre for Immigrants for Ottawa. Decide if this step should point RAP clients there instead]
- [ ] **settlement_services**: [VERIFY: international students are not in the page's eligibility list, so this step is refugee_pr only]
- [ ] **sin**: [VERIFY: document list against the page; the page's tool gives the exact list per status and per method (online, mail, in person)]
- [ ] **sin**: [VERIFY: documents must be valid digital copies of originals and in English or French, or translated, per the page]
- [ ] **sin**: [VERIFY: whether the application form is needed for every method, or only for mail]
- [ ] **sin**: [VERIFY: 'unlocks' for benefits is based on the CRA newcomers page ('You need a SIN to get benefit and credit payments'); the CRA also mentions a temporary tax number (TTN) if you can't get a SIN]
- [ ] **ifhp**: [VERIFY: IFHP applies to refugees and protected persons only, not to other permanent residents in the refugee_pr group; consider adding a sub-status condition]
- [ ] **ifhp**: [VERIFY: for resettled refugees the page says basic coverage lasts until provincial insurance starts; supplemental benefits and prescriptions end when RAP income support or private sponsorship support ends]
- [ ] **ifhp**: [VERIFY: the coverage page says care must come from IFHP-registered providers, with a co-payment for prescriptions and supplemental benefits]
- [ ] **ohip**: [VERIFY: full list of accepted documents is on ontario.ca/page/documents-needed-get-health-card (in sources); it also accepts the COPR and a letter from the IRB confirming protected person status]
- [ ] **ohip**: [VERIFY: an IRCC video says provincial coverage 'may take up to 3 months'; the Ontario page (updated July 21, 2025) says there is no longer a waiting period. Use the Ontario page]
- [ ] **ohip**: [VERIFY: study permit holders are not in the page's list of eligible statuses, so this step is refugee_pr only]
- [ ] **bank_account**: [VERIFY: the page lists 'identification issued by the Government of Canada' but does not name the PR card, COPR or study permit specifically]
- [ ] **bank_account**: [VERIFY: the CRA newcomers page says a SIN is needed to 'open most types of bank accounts'; the FCAC page does not mention a SIN. Decide whether bank_account should depend on sin]
- [ ] **phone_plan**: [VERIFY: source is IRCC's general 'Communications services' page, not a consumer-protection page; the team may prefer a CRTC wireless rights page if one is added and fetched]
- [ ] **phone_plan**: [VERIFY: page says you might be asked to agree to a credit check or give proof of employment]
- [ ] **phone_plan**: [VERIFY: consider also showing this step to refugee_pr (not added to keep that roadmap at 14 steps)]
- [ ] **transit_pass**: [VERIFY: the page says you should NOT apply for EquiPass if you currently receive transportation benefits from the Government-Assisted Refugee program (GAR)]
- [ ] **transit_pass**: [VERIFY: which 'other documentation' newcomers can use instead of a Notice of Assessment; the page says to contact OC Transpo]
- [ ] **transit_pass**: [VERIFY: the page says the Presto card is free for first-time applicants who qualify]
- [ ] **upass**: [VERIFY: participating schools listed on the page: Carleton University, University of Ottawa, Saint Paul University, Algonquin College]
- [ ] **upass**: [VERIFY: how Saint Paul University students get their U-Pass is not described on the page]
- [ ] **upass**: [VERIFY: students at other schools, or part-time students, pay regular Presto fares (octranspo.com/en/fares/costs/)]
- [ ] **work_off_campus**: [VERIFY: full requirements on the page: full-time student at a designated learning institution, program at least 6 months long leading to a degree, diploma or certificate, and a valid study permit]
- [ ] **work_off_campus**: [VERIFY: you can't work off campus during an authorized leave or if you are only in an ESL/FSL program]
- [ ] **work_off_campus**: [VERIFY: you must keep track of your own hours; remote work for an employer outside Canada does not count toward the 24 hours]
- [ ] **school_registration**: [VERIFY: this is the OCDSB (English public board) process only; the Ottawa Catholic School Board (ocsb.ca, in sources) and the French boards have their own steps]
- [ ] **school_registration**: [VERIFY: OCDSB asks families with temporary status to send immigration documents to its admissions office; contact details are on the page]
- [ ] **school_registration**: [VERIFY: driver's licences and mobile phone bills are NOT accepted as proof of address; some schools ask for 3 proofs of address]
- [ ] **school_registration**: [VERIFY: ontario.ca/page/find-elementary-or-secondary-school says most children can attend a publicly funded school for free regardless of immigration status; consider adding this line to the summary]
- [ ] **child_benefit**: [VERIFY: 'monthly, tax-free, children under 18' comes from the CRA newcomers page, not the how-to-apply page]
- [ ] **child_benefit**: [VERIFY: when two parents live together, the page says the female parent is presumed responsible and should apply, unless a signed letter says otherwise]
- [ ] **child_benefit**: [VERIFY: if your spouse or partner was a non-resident for part of the year, Form CTB9 is also needed]
- [ ] **child_benefit**: [VERIFY: applying with RC66 also counts as your Canada Groceries and Essentials Benefit application (per the CGEB page)]
- [ ] **cgeb_new_resident**: [VERIFY: the old GST/HST credit page now says 'No longer available'; the benefit was renamed. Check all app copy uses the new name]
- [ ] **cgeb_new_resident**: [VERIFY: international students who are residents of Canada for tax purposes may also be able to apply; not added to the student roadmap]
- [ ] **cgeb_new_resident**: [VERIFY: the CRA newcomers page says you may be asked for income from all sources for up to 2 years before you arrived]
- [ ] **language_classes**: [VERIFY: the page lists no documents for the assessment or registration]
- [ ] **language_classes**: [VERIFY: the page says some locations offer child minding and transportation; availability in Ottawa not confirmed]
- [ ] **language_classes**: [VERIFY: a CLB level 4 or higher certificate in speaking and listening can be used as proof for the citizenship language requirement, per the page]
- [ ] **library_card**: [VERIFY: the page lists fees only for people who live outside Ottawa; confirm cards are free for Ottawa residents before saying 'free']
- [ ] **library_card**: [VERIFY: children 0-15 need a parent's signature; teens 16-17 do not]
- [ ] **job_search**: [VERIFY: for regulated jobs (for example, doctor, nurse, engineer), link the credentials pages in sources: ontario.ca/page/work-your-profession-or-trade and canada.ca foreign credential recognition]
- [ ] **job_search**: [VERIFY: the page mentions bridging programs and the Federal Internship for Newcomers Program; eligibility not checked]
- [ ] **drivers_licence**: [VERIFY: the page says 'you can use a valid licence from another province, state or country for 60 days. After 60 days, you need to switch to an Ontario driver's licence']
- [ ] **drivers_licence**: [VERIFY: whether international students count as 'new residents' for this 60-day rule, or as visitors (ontario.ca/page/drive-ontario-visitors, not in sources)]
- [ ] **drivers_licence**: [VERIFY: the page links to special exemptions for protected persons and refugees who can't provide a valid original licence]
- [ ] **drivers_licence**: [VERIFY: fees apply; amounts are not on the page. A vision test is required; knowledge or road tests depend on your country]
- [ ] **scams_student**: [VERIFY: the page is written mostly for people before they apply; confirm it is the best page for students already in Canada (alternative: protect-fraud/newcomers.html, in sources)]
- [ ] **scams_student**: [VERIFY: only paid representatives authorized in Canada (lawyers, paralegals, Quebec notaries, registered consultants) can charge fees for immigration help, per the page]
- [ ] **scams_student**: [VERIFY: consider a matching scams step for refugee_pr using protect-fraud/newcomers.html]
- [ ] **tax_return**: [VERIFY: page example: if you arrived in 2025, your 2025 return is due April 30, 2026]
- [ ] **tax_return**: [VERIFY: for the year you arrived, you only report income received after you arrived in Canada (see 'Completing your return for newcomers', not in sources)]
- [ ] **tax_return**: [VERIFY: keep supporting documents for at least 6 years, per the page]
- [ ] **study_permit_conditions**: [VERIFY: you must be enrolled full-time or part-time every academic semester (except scheduled breaks), and authorized leaves can't be longer than 150 days, per the page]
- [ ] **study_permit_conditions**: [VERIFY: to change post-secondary schools you must apply to extend your study permit, per the page]
- [ ] **study_permit_conditions**: [VERIFY: if you don't meet your conditions, you may have to wait 6 months before applying for a new study permit, visitor visa or work permit in Canada]
- [ ] **tax_return_student**: [VERIFY: the April 30 filing date is on the CRA due dates page (in sources), not on this page; set official true only if the team uses that page as source]
- [ ] **tax_return_student**: [VERIFY: page was last updated 2022-01-18]
- [ ] **study_permit_extension**: [VERIFY: page statement: 'you must apply to extend your permit at least 30 days before it expires']
- [ ] **study_permit_extension**: [VERIFY: if you finish your studies early, your permit expires 90 days after you complete your studies, or on the date on the permit, whichever comes first]
- [ ] **study_permit_extension**: [VERIFY: full document list (letter of acceptance or enrolment, possibly a provincial attestation letter, payment card) is on the 'How to apply' page in sources, which says you must apply online]
- [ ] **pgwp**: [VERIFY: general rules on the page: PGWP-eligible school, program at least 8 months long, full-time status each semester (part-time allowed in the final semester), apply within 180 days, study permit valid at some point in those 180 days]
- [ ] **pgwp**: [VERIFY: field-of-study requirements may apply; not everyone is eligible (for example, ESL/FSL only, or more than 50% distance learning)]
- [ ] **pgwp**: [VERIFY: the page warns not to let your status expire while you wait for your marks]
- [ ] **pgwp**: [VERIFY: documents to include are not listed in general terms on this page; check the 'How to apply' page]
- [ ] **child_benefit_student**: [VERIFY: 78 weeks and 548 days are Arrive's approximation of '18 months']
- [ ] **child_benefit_student**: [VERIFY: you must also be a resident of Canada for tax purposes and be primarily responsible for the child, per the page]
- [ ] **child_benefit_student**: [VERIFY: the CRA newcomers page says to send the CRA your new permit before the current one expires, or payments stop]
