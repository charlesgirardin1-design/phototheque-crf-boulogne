-- Catégories et activités de l'association (reprise exacte de la liste fournie).

-- « Activité de transfert » devient « Activité de transverse ».
UPDATE categories SET name = 'Activité de transverse'
WHERE name = 'Activité de transfert'
  AND NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Activité de transverse');

INSERT INTO categories (name, sort_order) VALUES
  ('Formation', 1), ('US', 2), ('AS', 3), ('Activité de transverse', 4), ('Autre', 5)
ON CONFLICT (name) DO NOTHING;

UPDATE categories c SET sort_order = v.ord, is_active = true
FROM (VALUES ('Formation', 1), ('US', 2), ('AS', 3), ('Activité de transverse', 4), ('Autre', 5)) AS v(name, ord)
WHERE c.name = v.name;

INSERT INTO activities (category_id, name, sort_order)
SELECT c.id, v.activity, v.ord
FROM (VALUES
  ('Formation', 'JMPS', 1),
  ('Formation', 'PSC/EPSC', 2),
  ('Formation', 'Autre', 3),
  ('US', 'Urgence', 1),
  ('US', 'Poste de secours', 2),
  ('US', 'DPS', 3),
  ('US', 'Autre', 4),
  ('AS', 'Alphabétisation-FLE-Soutien scolaire', 1),
  ('AS', 'Bavard''âge', 2),
  ('AS', 'Espace bébé-parents EBP', 3),
  ('AS', 'Inclusion numérique', 4),
  ('AS', 'L''olivier', 5),
  ('AS', 'Le Rameau', 6),
  ('AS', 'Maraude', 7),
  ('AS', 'EBP', 8),
  ('AS', 'Visiteurs du soir', 9),
  ('AS', 'DALO', 10),
  ('AS', 'ALSO', 11),
  ('AS', 'Autre', 12),
  ('Activité de transverse', 'Forum des activités', 1),
  ('Activité de transverse', 'JN', 2),
  ('Activité de transverse', 'Muguet', 3),
  ('Activité de transverse', 'Banque alimentaire', 4),
  ('Activité de transverse', 'Autre', 5),
  ('Autre', 'Autre', 1)
) AS v(category, activity, ord)
JOIN categories c ON c.name = v.category
ON CONFLICT (category_id, name) DO UPDATE SET sort_order = EXCLUDED.sort_order, is_active = true;

-- L'ancienne activité « Formation » (rangée sous « Autre ») devient la catégorie « Formation » :
-- les médias concernés passent en Formation / Autre, puis l'ancienne activité est retirée.
UPDATE media m
SET category_id = f.id, activity_id = fa.id
FROM categories a
JOIN activities old ON old.category_id = a.id AND old.name = 'Formation'
CROSS JOIN categories f
JOIN activities fa ON fa.category_id = f.id AND fa.name = 'Autre'
WHERE a.name = 'Autre' AND f.name = 'Formation' AND m.activity_id = old.id;

DELETE FROM activities old
USING categories a
WHERE old.category_id = a.id AND a.name = 'Autre' AND old.name = 'Formation';
