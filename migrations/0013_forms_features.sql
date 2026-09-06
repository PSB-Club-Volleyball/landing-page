-- Google-Forms-style additions: more field types, per-field help text and
-- validation bounds, section breaks (multi-page forms), and per-form
-- response limits + a custom confirmation message.

ALTER TABLE forms ADD COLUMN max_responses INTEGER;      -- NULL = unlimited
ALTER TABLE forms ADD COLUMN confirmation_message TEXT;  -- NULL = default "you're in" copy

ALTER TABLE form_fields ADD COLUMN description TEXT;  -- optional help text shown under the label
ALTER TABLE form_fields ADD COLUMN min_value INTEGER; -- text/textarea: min length; number/linear_scale: min value
ALTER TABLE form_fields ADD COLUMN max_value INTEGER; -- text/textarea: max length; number/linear_scale: max value
ALTER TABLE form_fields ADD COLUMN pattern TEXT;      -- regex the answer must match (text/email/phone)

-- field_type gains: 'radio' (single choice, radio buttons instead of a
-- dropdown), 'checkbox_group' (multi-select; answer stored "|"-joined like
-- 'select' options), 'date', 'time', 'email', 'phone', 'linear_scale' (a
-- rating from min_value to max_value), and 'section' (a page break with no
-- answer of its own — label/description render as a heading, and every
-- field after it becomes a new page of the signup form).
