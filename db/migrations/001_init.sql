-- Schéma initial de la photothèque.
-- Idempotent : peut être rejoué sans effet de bord.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE CHECK (length(trim(name)) BETWEEN 1 AND 80),
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS activities (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  name        text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_id, name)
);

CREATE TABLE IF NOT EXISTS media (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_filename text NOT NULL,
  mime_type         text NOT NULL,
  media_type        text NOT NULL CHECK (media_type IN ('photo', 'video')),
  size_bytes        bigint NOT NULL CHECK (size_bytes > 0),
  storage_key       text NOT NULL UNIQUE,
  thumbnail_key     text,
  preview_key       text,
  uploaded_at       timestamptz NOT NULL DEFAULT now(),
  taken_at          timestamptz,
  taken_at_source   text NOT NULL DEFAULT 'none'
                    CHECK (taken_at_source IN ('exif', 'video', 'file', 'manual', 'none')),
  photographer      text NOT NULL CHECK (length(trim(photographer)) BETWEEN 1 AND 120),
  category_id       uuid REFERENCES categories(id) ON DELETE RESTRICT,
  activity_id       uuid REFERENCES activities(id) ON DELETE RESTRICT,
  status            text NOT NULL DEFAULT 'A_TRIER' CHECK (status IN ('A_TRIER', 'TRIEE')),
  -- 'pending' tant que le navigateur n'a pas fini d'envoyer le fichier au stockage.
  upload_state      text NOT NULL DEFAULT 'pending' CHECK (upload_state IN ('pending', 'ready')),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS media_ready_uploaded_idx ON media (upload_state, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS media_status_idx ON media (status);
CREATE INDEX IF NOT EXISTS media_category_idx ON media (category_id);
CREATE INDEX IF NOT EXISTS media_activity_idx ON media (activity_id);

CREATE TABLE IF NOT EXISTS login_attempts (
  id           bigserial PRIMARY KEY,
  ip           text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_attempts_ip_idx ON login_attempts (ip, attempted_at);

-- Données de démarrage : catégories principales et activité « Formation ».
INSERT INTO categories (name, sort_order) VALUES
  ('US', 1),
  ('AS', 2),
  ('Activité de transfert', 3),
  ('Autre', 4)
ON CONFLICT (name) DO NOTHING;

INSERT INTO activities (category_id, name, sort_order)
SELECT id, 'Formation', 1 FROM categories WHERE name = 'Autre'
ON CONFLICT (category_id, name) DO NOTHING;
