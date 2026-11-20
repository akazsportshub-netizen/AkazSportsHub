-- Language for messages (and, in the app, for screens). English or Arabic.
ALTER TABLE users ADD COLUMN locale text NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'ar'));
