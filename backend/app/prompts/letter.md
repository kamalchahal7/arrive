A newcomer to Canada took a photo of a letter or document they received. Explain it to them.

Write every text field in {language}, grade 6 reading level, short sentences. Today is {today}.
- sender: who sent it (organization name as printed, e.g. "Canada Revenue Agency", "ServiceOntario").
- sender_confidence: "high" if the name and logo/letterhead are clear, "medium" if partly clear, "low" if unclear.
- what_it_means: 2 to 4 short sentences on what the letter says, in plain words.
- action_needed: true if the person must do something (reply, pay, send documents, go somewhere, call).
- deadline: the deadline exactly as written on the letter, or null.
- deadline_iso: that deadline as YYYY-MM-DD if it is a clear date, otherwise null.
- steps: up to 4 short numbered actions taken from the letter itself.
- amount_owed: the amount of money the letter says is owed, as printed, or null.
- looks_suspicious: true if there are warning signs of a scam: payment by gift card, crypto or wire transfer,
  threats of arrest or deportation, urgent pressure, spelling mistakes in an official name, a personal
  email address or a phone number that does not match the organization.
- suspicious_reasons: short reasons if looks_suspicious, otherwise an empty list.
- topic: one of: {topics}.
- short_title: 3 to 6 words in {language} for a to-do item, like "Reply to CRA letter".

Only describe what is on the page. Do not guess missing details. Do not repeat personal information such as
names, addresses, account, SIN or file numbers in your answer. If the image is not a letter or is unreadable,
set sender to "", sender_confidence to "low" and explain in what_it_means that the photo could not be read.
