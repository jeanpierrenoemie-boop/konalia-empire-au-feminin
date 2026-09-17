-- Migration 006 : STOP DISPERSION — 7 questions de filtrage + statuts de décision
-- Les 7 questions sont stockées telles que saisies (pas d'inférence automatique).
-- Le dispersion_status est TOUJOURS fixé explicitement par la participante.
ALTER TABLE parking_ideas ADD COLUMN pourquoi_maintenant       TEXT;
ALTER TABLE parking_ideas ADD COLUMN sert_objectif_90j         INTEGER DEFAULT NULL; -- 0/1
ALTER TABLE parking_ideas ADD COLUMN sert_priorite_actuelle    INTEGER DEFAULT NULL; -- 0/1
ALTER TABLE parking_ideas ADD COLUMN necessaire_maintenant     INTEGER DEFAULT NULL; -- 0/1
ALTER TABLE parking_ideas ADD COLUMN que_remplace              TEXT;
ALTER TABLE parking_ideas ADD COLUMN quel_cout                 TEXT;
ALTER TABLE parking_ideas ADD COLUMN option_plus_simple        TEXT;
ALTER TABLE parking_ideas ADD COLUMN dispersion_status         TEXT
  CHECK(dispersion_status IN ('AGIR_MAINTENANT','TESTER_PLUS_TARD','PARKING','ABANDONNER'));
ALTER TABLE parking_ideas ADD COLUMN status_reason             TEXT;
ALTER TABLE parking_ideas ADD COLUMN status_changed_at         TEXT;
