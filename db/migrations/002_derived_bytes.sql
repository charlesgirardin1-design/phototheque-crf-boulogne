-- Taille des miniatures/aperçus générés, pour un suivi exact de l'espace de stockage.
ALTER TABLE media ADD COLUMN IF NOT EXISTS derived_bytes bigint NOT NULL DEFAULT 0;
