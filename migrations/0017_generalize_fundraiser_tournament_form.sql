-- Replaces the one-off fundraiser tournament signup form (previously built
-- for a single date, e.g. "COED Back-2-School Fundraiser Tournament", with
-- that tournament's date/location/fees/net height baked into field labels)
-- with a reusable "Fundraiser Tournament Signup" form any fundraiser
-- tournament event can attach to via events.form_id. Per-tournament details
-- (date, location, fees, rules) belong on the event itself, not this form.
--
-- Name/email are already collected by the signup flow itself (see
-- SignupModal), so this form only needs the tournament-specific fields.

DELETE FROM form_fields WHERE form_id IN (
  SELECT id FROM forms WHERE name LIKE '%Fundraiser Tournament%'
);
DELETE FROM forms WHERE name LIKE '%Fundraiser Tournament%';

INSERT INTO forms (name, confirmation_message) VALUES (
  'Fundraiser Tournament Signup',
  'You''re in! Bring a signed liability waiver on tournament day — no waiver, no play.'
);

INSERT INTO form_fields (form_id, label, field_type, options, required, sort_order, description) VALUES
  ((SELECT id FROM forms WHERE name = 'Fundraiser Tournament Signup'), 'Signing up as', 'radio', 'Free agent|Bringing a team', 1, 1, NULL),
  ((SELECT id FROM forms WHERE name = 'Fundraiser Tournament Signup'), 'Primary contact (name & phone number)', 'text', NULL, 0, 2, 'So we can reach you if plans change.'),
  ((SELECT id FROM forms WHERE name = 'Fundraiser Tournament Signup'), 'Team name', 'text', NULL, 0, 3, 'Only needed if you''re bringing a team. Keep it appropriate — e.g. The Warriors, Team Alpha.'),
  ((SELECT id FROM forms WHERE name = 'Fundraiser Tournament Signup'), 'Team members (not including yourself)', 'textarea', NULL, 0, 4, 'One name per line. Leave blank if signing up as a free agent.'),
  ((SELECT id FROM forms WHERE name = 'Fundraiser Tournament Signup'), 'Need free agent(s) added to your team?', 'radio', 'Yes|No', 0, 5, 'Only applies if you''re bringing a team.'),
  ((SELECT id FROM forms WHERE name = 'Fundraiser Tournament Signup'), 'Agreements', 'section', NULL, 0, 6, 'Please read carefully before signing up.'),
  ((SELECT id FROM forms WHERE name = 'Fundraiser Tournament Signup'), 'I agree to follow the tournament rules and any instructions from the Club Volleyball executive board, for myself and anyone I sign up.', 'checkbox', NULL, 1, 7, NULL),
  ((SELECT id FROM forms WHERE name = 'Fundraiser Tournament Signup'), 'I understand everyone I sign up must bring a signed physical liability waiver to play, and won''t be allowed to participate without one.', 'checkbox', NULL, 1, 8, NULL),
  ((SELECT id FROM forms WHERE name = 'Fundraiser Tournament Signup'), 'I understand all fees and dues are non-refundable, and a no-show is an automatic match forfeit.', 'checkbox', NULL, 1, 9, NULL),
  ((SELECT id FROM forms WHERE name = 'Fundraiser Tournament Signup'), 'I understand tardiness or failure to show may result in forfeiting the match.', 'checkbox', NULL, 1, 10, NULL);
