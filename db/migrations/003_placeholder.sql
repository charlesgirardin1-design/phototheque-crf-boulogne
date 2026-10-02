-- Mini-image floue (data URL JPEG de quelques centaines d'octets) affichée instantanément
-- dans la grille pendant le chargement de la miniature.
ALTER TABLE media ADD COLUMN IF NOT EXISTS placeholder text
  CHECK (placeholder IS NULL OR (length(placeholder) <= 4000 AND placeholder LIKE 'data:image/jpeg;base64,%'));
