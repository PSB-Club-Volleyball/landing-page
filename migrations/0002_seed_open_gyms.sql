-- Open gyms through Oct 1: Tuesdays, Thursdays and Saturdays, 7-9pm.
-- Tue Aug 25 runs 8-10pm instead.
--
-- start_time/end_time are naive local (Eastern) wall-clock strings, matching
-- what the admin console's datetime-local inputs write and what the Events
-- page renders with `new Date(...)`.

INSERT INTO events (title, event_type, start_time, end_time, location_name, location_address, status) VALUES
  ('Open gym', 'open_gym', '2026-08-25T20:00', '2026-08-25T22:00', 'Erie Hall', '4711 College Dr, Erie, PA 16510', 'published'),
  ('Open gym', 'open_gym', '2026-08-27T19:00', '2026-08-27T21:00', 'Erie Hall', '4711 College Dr, Erie, PA 16510', 'published'),
  ('Open gym', 'open_gym', '2026-08-29T19:00', '2026-08-29T21:00', 'Erie Hall', '4711 College Dr, Erie, PA 16510', 'published'),
  ('Open gym', 'open_gym', '2026-09-01T19:00', '2026-09-01T21:00', 'Erie Hall', '4711 College Dr, Erie, PA 16510', 'published'),
  ('Open gym', 'open_gym', '2026-09-03T19:00', '2026-09-03T21:00', 'Erie Hall', '4711 College Dr, Erie, PA 16510', 'published'),
  ('Open gym', 'open_gym', '2026-09-05T19:00', '2026-09-05T21:00', 'Erie Hall', '4711 College Dr, Erie, PA 16510', 'published'),
  ('Open gym', 'open_gym', '2026-09-08T19:00', '2026-09-08T21:00', 'Erie Hall', '4711 College Dr, Erie, PA 16510', 'published'),
  ('Open gym', 'open_gym', '2026-09-10T19:00', '2026-09-10T21:00', 'Erie Hall', '4711 College Dr, Erie, PA 16510', 'published'),
  ('Open gym', 'open_gym', '2026-09-12T19:00', '2026-09-12T21:00', 'Erie Hall', '4711 College Dr, Erie, PA 16510', 'published'),
  ('Open gym', 'open_gym', '2026-09-15T19:00', '2026-09-15T21:00', 'Erie Hall', '4711 College Dr, Erie, PA 16510', 'published'),
  ('Open gym', 'open_gym', '2026-09-17T19:00', '2026-09-17T21:00', 'Erie Hall', '4711 College Dr, Erie, PA 16510', 'published'),
  ('Open gym', 'open_gym', '2026-09-19T19:00', '2026-09-19T21:00', 'Erie Hall', '4711 College Dr, Erie, PA 16510', 'published'),
  ('Open gym', 'open_gym', '2026-09-22T19:00', '2026-09-22T21:00', 'Erie Hall', '4711 College Dr, Erie, PA 16510', 'published'),
  ('Open gym', 'open_gym', '2026-09-24T19:00', '2026-09-24T21:00', 'Erie Hall', '4711 College Dr, Erie, PA 16510', 'published'),
  ('Open gym', 'open_gym', '2026-09-26T19:00', '2026-09-26T21:00', 'Erie Hall', '4711 College Dr, Erie, PA 16510', 'published'),
  ('Open gym', 'open_gym', '2026-09-29T19:00', '2026-09-29T21:00', 'Erie Hall', '4711 College Dr, Erie, PA 16510', 'published'),
  ('Open gym', 'open_gym', '2026-10-01T19:00', '2026-10-01T21:00', 'Erie Hall', '4711 College Dr, Erie, PA 16510', 'published');
