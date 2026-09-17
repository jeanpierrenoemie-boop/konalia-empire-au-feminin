-- Migration 005 : champs étendus pour le Journal des Décisions
ALTER TABLE decisions ADD COLUMN status           TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','superseded','archived'));
ALTER TABLE decisions ADD COLUMN facts_used        TEXT;
ALTER TABLE decisions ADD COLUMN hypotheses        TEXT;
ALTER TABLE decisions ADD COLUMN reopening_condition TEXT;
