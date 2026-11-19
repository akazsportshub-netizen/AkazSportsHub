-- =============================================================================
-- AKAZ Sports Hub — 002 seed data (DEMO DATA for development and staging)
-- Venues, coordinates, people, phone numbers and prices below are placeholders.
-- Replace them with real partner data before go-live.
-- Safe to re-run: every insert is ON CONFLICT DO NOTHING on a fixed id.
-- =============================================================================
BEGIN;

-- -----------------------------------------------------------------------------
-- Users
-- -----------------------------------------------------------------------------
INSERT INTO users (id, full_name, phone_e164, email, country_code, elo_rating, reliability_score, home_location, open_to_ringer) VALUES
  ('00000000-0000-4000-a000-000000000001', 'Akaz Platform Admin',  '+97455500001', 'admin@akaz.example',          'QA', 1200, 100, NULL, false),
  ('00000000-0000-4000-a000-000000000002', 'Doha Venue Manager',   '+97455500002', 'manager.doha@akaz.example',   'QA', 1200, 100, NULL, false),
  ('00000000-0000-4000-a000-000000000003', 'Riyadh Venue Manager', '+966555000003','manager.riyadh@akaz.example', 'SA', 1200, 100, NULL, false),
  ('00000000-0000-4000-a000-000000000004', 'Dubai Venue Manager',  '+971555000004','manager.dubai@akaz.example',  'AE', 1200, 100, NULL, false),
  ('00000000-0000-4000-a000-000000000005', 'Demo Referee',         '+97455500005', 'referee@akaz.example',        'QA', 1200, 100, NULL, false),
  ('00000000-0000-4000-a000-000000000010', 'Demo Player One',      '+97455500010', 'player1@akaz.example',        'QA', 1340,  98, ST_SetSRID(ST_MakePoint(51.5010, 25.2850), 4326)::geography, true),
  ('00000000-0000-4000-a000-000000000011', 'Demo Player Two',      '+97455500011', 'player2@akaz.example',        'QA', 1280,  95, ST_SetSRID(ST_MakePoint(51.5200, 25.2950), 4326)::geography, true),
  ('00000000-0000-4000-a000-000000000012', 'Demo Player Three',    '+97455500012', 'player3@akaz.example',        'QA', 1190,  91, ST_SetSRID(ST_MakePoint(51.4900, 25.3100), 4326)::geography, true),
  ('00000000-0000-4000-a000-000000000013', 'Demo Player Four',     '+97455500013', 'player4@akaz.example',        'QA', 1420,  88, ST_SetSRID(ST_MakePoint(51.4400, 25.2600), 4326)::geography, true),
  ('00000000-0000-4000-a000-000000000014', 'Demo Player Five',     '+97455500014', 'player5@akaz.example',        'QA', 1250,  62, ST_SetSRID(ST_MakePoint(51.5300, 25.2700), 4326)::geography, true),
  ('00000000-0000-4000-a000-000000000015', 'Demo Player Six',      '+966555000015','player6@akaz.example',        'SA', 1300,  97, ST_SetSRID(ST_MakePoint(46.6900, 24.7000), 4326)::geography, true),
  ('00000000-0000-4000-a000-000000000020', 'Demo Parent',          '+97455500020', 'parent@akaz.example',         'QA', 1200, 100, ST_SetSRID(ST_MakePoint(51.5100, 25.2900), 4326)::geography, false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_roles (user_id, role) VALUES
  ('00000000-0000-4000-a000-000000000001', 'ADMIN'),
  ('00000000-0000-4000-a000-000000000002', 'VENUE_MANAGER'),
  ('00000000-0000-4000-a000-000000000003', 'VENUE_MANAGER'),
  ('00000000-0000-4000-a000-000000000004', 'VENUE_MANAGER'),
  ('00000000-0000-4000-a000-000000000005', 'REFEREE'),
  ('00000000-0000-4000-a000-000000000010', 'PLAYER'),
  ('00000000-0000-4000-a000-000000000011', 'PLAYER'),
  ('00000000-0000-4000-a000-000000000012', 'PLAYER'),
  ('00000000-0000-4000-a000-000000000013', 'PLAYER'),
  ('00000000-0000-4000-a000-000000000014', 'PLAYER'),
  ('00000000-0000-4000-a000-000000000015', 'PLAYER'),
  ('00000000-0000-4000-a000-000000000020', 'PARENT'),
  ('00000000-0000-4000-a000-000000000020', 'PLAYER')
ON CONFLICT (user_id, role) DO NOTHING;

-- Parent → child profile (academy player in the U-10 group).
INSERT INTO dependent_profiles (id, guardian_user_id, full_name, age_group) VALUES
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000020', 'Azlan Ahmed', 'U-10')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Venues (one or more per GCC market)
-- -----------------------------------------------------------------------------
INSERT INTO venues (id, name, description, country_code, city, address, currency, timezone, location, manager_user_id, requires_turf_footwear, rules, commission_bps, free_cancellation_hours) VALUES
  ('00000000-0000-4000-c000-000000000001', 'Akaz Demo Arena — Al Sadd', 'Floodlit 5-a-side and 7-a-side turf pitches.',
     'QA', 'Doha', 'Al Sadd, Doha', 'QAR', 'Asia/Qatar',
     ST_SetSRID(ST_MakePoint(51.5000, 25.2860), 4326)::geography,
     '00000000-0000-4000-a000-000000000002', true,
     '{"footwear":"TF turf shoes only — no metal or FG studs","arrive_minutes_early":10}'::jsonb, 1000, 24),
  ('00000000-0000-4000-c000-000000000002', 'Akaz Demo Sports Park — Lusail', 'Football turf plus indoor padel and badminton.',
     'QA', 'Lusail', 'Lusail, Qatar', 'QAR', 'Asia/Qatar',
     ST_SetSRID(ST_MakePoint(51.4900, 25.4200), 4326)::geography,
     '00000000-0000-4000-a000-000000000002', true,
     '{"footwear":"TF turf shoes on football pitches; non-marking soles indoors"}'::jsonb, 1000, 24),
  ('00000000-0000-4000-c000-000000000003', 'Akaz Demo Arena — Al Olaya', 'Late-night football pitches in central Riyadh.',
     'SA', 'Riyadh', 'Al Olaya, Riyadh', 'SAR', 'Asia/Riyadh',
     ST_SetSRID(ST_MakePoint(46.6850, 24.6900), 4326)::geography,
     '00000000-0000-4000-a000-000000000003', true,
     '{"footwear":"TF turf shoes only"}'::jsonb, 1000, 24),
  ('00000000-0000-4000-c000-000000000004', 'Akaz Demo Courts — Al Quoz', 'Indoor padel and football centre.',
     'AE', 'Dubai', 'Al Quoz, Dubai', 'AED', 'Asia/Dubai',
     ST_SetSRID(ST_MakePoint(55.2300, 25.1400), 4326)::geography,
     '00000000-0000-4000-a000-000000000004', false,
     '{"footwear":"Non-marking soles on padel courts"}'::jsonb, 1000, 12),
  ('00000000-0000-4000-c000-000000000005', 'Akaz Demo Arena — Juffair', 'Seven-a-side turf pitch.',
     'BH', 'Manama', 'Juffair, Manama', 'BHD', 'Asia/Bahrain',
     ST_SetSRID(ST_MakePoint(50.6000, 26.2100), 4326)::geography,
     NULL, true, '{"footwear":"TF turf shoes only"}'::jsonb, 1000, 24),
  ('00000000-0000-4000-c000-000000000006', 'Akaz Demo Arena — Al Khuwair', 'Five-a-side turf pitches.',
     'OM', 'Muscat', 'Al Khuwair, Muscat', 'OMR', 'Asia/Muscat',
     ST_SetSRID(ST_MakePoint(58.4300, 23.5950), 4326)::geography,
     NULL, true, '{"footwear":"TF turf shoes only"}'::jsonb, 1000, 24)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Courts. Prices are per hour in minor units: 25000 = QAR 250.00, 30000 = BHD 30.000.
-- closes_at earlier than opens_at means the court stays open past midnight.
-- -----------------------------------------------------------------------------
INSERT INTO courts (id, venue_id, name, sport, surface, capacity_players, price_per_hour_minor, slot_minutes, opens_at, closes_at) VALUES
  ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-c000-000000000001', 'Pitch 1 (5-a-side)', 'FOOTBALL',  'Artificial turf', 12, 25000, 60, '16:00', '01:00'),
  ('00000000-0000-4000-d000-000000000002', '00000000-0000-4000-c000-000000000001', 'Pitch 2 (7-a-side)', 'FOOTBALL',  'Artificial turf', 16, 35000, 60, '16:00', '01:00'),
  ('00000000-0000-4000-d000-000000000003', '00000000-0000-4000-c000-000000000002', 'Pitch A (7-a-side)', 'FOOTBALL',  'Artificial turf', 16, 38000, 60, '15:00', '00:00'),
  ('00000000-0000-4000-d000-000000000004', '00000000-0000-4000-c000-000000000002', 'Padel Court 1',      'PADEL',     'Panoramic glass',  4, 20000, 90, '06:00', '00:00'),
  ('00000000-0000-4000-d000-000000000005', '00000000-0000-4000-c000-000000000002', 'Badminton Court 1',  'BADMINTON', 'PU synthetic',     4,  8000, 60, '06:00', '23:00'),
  ('00000000-0000-4000-d000-000000000006', '00000000-0000-4000-c000-000000000003', 'Pitch 1 (5-a-side)', 'FOOTBALL',  'Artificial turf', 12, 30000, 60, '16:00', '02:00'),
  ('00000000-0000-4000-d000-000000000007', '00000000-0000-4000-c000-000000000003', 'Pitch 2 (7-a-side)', 'FOOTBALL',  'Artificial turf', 16, 42000, 60, '16:00', '02:00'),
  ('00000000-0000-4000-d000-000000000008', '00000000-0000-4000-c000-000000000004', 'Padel Court 1',      'PADEL',     'Panoramic glass',  4, 28000, 90, '07:00', '00:00'),
  ('00000000-0000-4000-d000-000000000009', '00000000-0000-4000-c000-000000000004', 'Indoor Pitch',       'FOOTBALL',  'Artificial turf', 12, 40000, 60, '08:00', '00:00'),
  ('00000000-0000-4000-d000-000000000010', '00000000-0000-4000-c000-000000000005', 'Pitch 1 (7-a-side)', 'FOOTBALL',  'Artificial turf', 16, 30000, 60, '16:00', '00:00'),
  ('00000000-0000-4000-d000-000000000011', '00000000-0000-4000-c000-000000000006', 'Pitch 1 (5-a-side)', 'FOOTBALL',  'Artificial turf', 12, 22000, 60, '16:00', '00:00')
ON CONFLICT (id) DO NOTHING;

COMMIT;
